#!/usr/bin/env python3
"""Encrypt the map's data files for GitHub Pages (2026-11-20 security switch).

Why: GitHub Pages serves the whole public repo, so data/*.json (addresses, customer numbers,
meter lists) could be downloaded by anyone without logging in. From this switch the map reads
enc/data/<same path> instead. Those files are ciphertext; the key sits in RTDB mapSecret/dataKey,
and only logged-in users can read it (database.rules.secure.json).

Format (js/secure-data.js decrypts it): b'AMIENC1\\n' + 12-byte IV + AES-256-GCM(gzip(plain)).
  - gzip happens before encryption. Ciphertext does not compress, so without this, transfer
    size grows several times (search-index 14MB -> about 3MB).
  - IV = HMAC-SHA256(key, path + sha256(plain))[:12] and gzip mtime=0. The same input always
    gives the same bytes, so an unchanged file keeps its ETag. Phones' IndexedDB caches
    (HEAD ETag check, js/map.js loadListCached) keep working, and a daily publish does not
    force everyone to download everything again. IVs stay unique because a new plaintext
    gives a new IV.

Which files: every registry dataset file (scripts/datasets.py dataset_files — map lists,
off-map lists, per-branch 미조치 files), plus the stats index, search index and old static
work-status.json.
Kept public (plain, NOT encrypted — the helper reads them without a Firebase login):
  data/meter-list-index.json, data/meter-jisa-index.json (meter number -> list code / branch code
  only), data/site-data.version.json, data/notices*.json, app-version.json.

Key: ~/.ami-secrets/map_data_key.b64 (outside git, 32 random bytes base64). Never printed.

    python3 scripts/publish_enc_data.py                 # dry run: what would be written
    python3 scripts/publish_enc_data.py --go            # write enc/data/... (local files only)
    python3 scripts/publish_enc_data.py --init-key      # dry run; --init-key --go creates the key file once
    python3 scripts/publish_enc_data.py --push-key      # dry run; --push-key --go = LIVE write RTDB mapSecret/dataKey
    python3 scripts/publish_enc_data.py --check         # decrypt every enc file and compare with data/
    python3 scripts/publish_enc_data.py --rotate        # dry run; --rotate --go = new key (old kept as .b64.<time>) + re-encrypt all
    python3 scripts/publish_enc_data.py --list-untrack <out.txt>   # tracked data/ files to git rm --cached at deploy

--push-key --go is a live Firebase write (PM runs it at deploy, step 2 of the run order).
Run on main after gen_stats_index.py. Commit enc/ together with the data commit.
"""
import base64
import gzip
import hashlib
import hmac
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from datasets import DATASETS, dataset_files  # noqa: E402

# AMI_DATA_KEY_FILE / AMI_ENC_DIR override for local tests (scripts/test_map_security.py) — never the real key.
KEY_FILE = Path(os.environ.get('AMI_DATA_KEY_FILE') or Path.home() / '.ami-secrets' / 'map_data_key.b64')
ENC_DIR = Path(os.environ.get('AMI_ENC_DIR') or ROOT / 'enc')
MAGIC = b'AMIENC1\n'
EXTRA = ['data/stats-site-index.json', 'data/search-index.json', 'data/work-status.json']
PUBLIC_PLAIN = ['data/meter-list-index.json', 'data/meter-jisa-index.json', 'data/site-data.version.json',
                'data/notices.json', 'data/notices-gwangmyeong.json']
DB_URL = 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app'


def files_to_encrypt():
    out = []
    for d in DATASETS:
        for f in dataset_files(d):
            f = f[2:] if f.startswith('./') else f
            # per-branch files (fileByJisa) only exist for branches that have rows — the map skips a
            #   missing one too (js/map.js), so a missing per-branch file is not an error.
            if d.get('fileByJisa') and not (ROOT / f).exists():
                continue
            if f not in out:
                out.append(f)
    for f in EXTRA:
        if f not in out:
            out.append(f)
    return [f for f in out if f not in PUBLIC_PLAIN]


def load_key():
    if not KEY_FILE.exists():
        sys.exit(f'★no key file {KEY_FILE} — run --init-key --go first')
    k = base64.b64decode(KEY_FILE.read_text().strip())
    if len(k) != 32:
        sys.exit('★key must be 32 bytes')
    return k


def encrypt(key, rel, plain):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    iv = hmac.new(key, rel.encode() + hashlib.sha256(plain).digest(), hashlib.sha256).digest()[:12]
    z = gzip.compress(plain, compresslevel=9, mtime=0)
    return MAGIC + iv + AESGCM(key).encrypt(iv, z, None)


def decrypt(key, blob):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    if blob[:8] != MAGIC:
        raise ValueError('not an AMIENC1 file')
    return gzip.decompress(AESGCM(key).decrypt(blob[8:20], blob[20:], None))


def main():
    a = sys.argv[1:]
    go = '--go' in a
    if '--init-key' in a:
        if KEY_FILE.exists():
            sys.exit(f'key already exists: {KEY_FILE} (not overwritten — rotating means re-publishing everything)')
        if not go:
            print(f'[dry-run] would create {KEY_FILE} (32 random bytes, mode 600)')
            return
        KEY_FILE.parent.mkdir(mode=0o700, exist_ok=True)
        KEY_FILE.write_text(base64.b64encode(os.urandom(32)).decode())
        os.chmod(KEY_FILE, 0o600)
        print(f'created {KEY_FILE}')
        return
    if '--rotate' in a:
        # New key -> re-encrypt everything. The old key file is kept beside it (.b64.<time>) for rollback.
        #   Order at deploy: commit + push the new enc/ FIRST, then --push-key --go (phones fetch the key per
        #   page load; between the two steps a fresh load fails to decrypt until the key is pushed — keep it short).
        import time as _t
        if not KEY_FILE.exists():
            sys.exit(f'★no key file {KEY_FILE} to rotate')
        old_path = KEY_FILE.with_name(KEY_FILE.name + '.' + _t.strftime('%Y%m%d_%H%M%S'))
        if not go:
            print(f'[dry-run] would move {KEY_FILE.name} -> {old_path.name}, create a new key, re-encrypt all files')
            return
        os.rename(KEY_FILE, old_path)
        KEY_FILE.write_text(base64.b64encode(os.urandom(32)).decode())
        os.chmod(KEY_FILE, 0o600)
        print(f'rotated: old key kept as {old_path.name} (mode {oct(old_path.stat().st_mode & 0o777)}) · new key written')
        a = [x for x in a if x != '--rotate']   # fall through: re-encrypt everything with the new key

    if '--push-key' in a:
        key = load_key()
        target = os.environ.get('AMI_RTDB_EMULATOR')   # tests: http://127.0.0.1:9000?ns=...
        if not go:
            print(f'[dry-run] would PUT mapSecret/dataKey ({"emulator" if target else "LIVE"}) — key not shown')
            return
        import urllib.request
        body = json.dumps(base64.b64encode(key).decode()).encode()
        if target:
            base, _, q = target.partition('?')
            url = f'{base}/mapSecret/dataKey.json?{q}'
            req = urllib.request.Request(url, data=body, method='PUT', headers={'Authorization': 'Bearer owner'})
        else:
            from fb_rest import authed
            req = urllib.request.Request(authed(f'{DB_URL}/mapSecret/dataKey.json'), data=body, method='PUT')
        urllib.request.urlopen(req, timeout=60).read()
        print('mapSecret/dataKey written', '(emulator)' if target else '(LIVE)')
        return

    if '--list-untrack' in a:
        # every tracked data/ file except the public allowlist — these must leave git at deploy
        #   (git rm --cached keeps the local copy; the Mac backend and builders keep reading it).
        import subprocess
        tracked = subprocess.run(['git', 'ls-files', '-z', 'data'], cwd=ROOT, capture_output=True).stdout.decode().split('\0')
        tracked = [t for t in tracked if t and t not in PUBLIC_PLAIN]
        out = Path(a[a.index('--list-untrack') + 1]) if len(a) > a.index('--list-untrack') + 1 else None
        size = sum((ROOT / t).stat().st_size for t in tracked if (ROOT / t).exists())
        print(f'tracked data files to untrack: {len(tracked)} ({size / 1e6:.0f}MB) · kept public {len(PUBLIC_PLAIN)}')
        if out:
            out.write_text('\n'.join(tracked) + '\n', encoding='utf-8')
            print(f'list -> {out}')
        return

    files = files_to_encrypt()
    missing = [f for f in files if not (ROOT / f).exists()]
    if missing:
        sys.exit(f'★missing data files {missing} — regenerate first (no partial publish)')

    if '--check' in a:
        key = load_key()
        bad = []
        for f in files:
            e = ENC_DIR / f
            if not e.exists() or decrypt(key, e.read_bytes()) != (ROOT / f).read_bytes():
                bad.append(f)
        print(f'check {len(files)} files · mismatched or missing {len(bad)} {bad[:10]}')
        sys.exit(1 if bad else 0)

    key = load_key() if go or KEY_FILE.exists() else None
    changed, same, total_plain, total_enc = [], 0, 0, 0
    for f in files:
        plain = (ROOT / f).read_bytes()
        total_plain += len(plain)
        e = ENC_DIR / f
        if key is None:
            changed.append(f)
            continue
        blob = encrypt(key, f, plain)
        total_enc += len(blob)
        if e.exists() and e.read_bytes() == blob:
            same += 1
            continue
        changed.append(f)
        if go:
            e.parent.mkdir(parents=True, exist_ok=True)
            e.write_bytes(blob)
            assert decrypt(key, e.read_bytes()) == plain, f
    keep = set(files)
    stale = sorted(str(p.relative_to(ENC_DIR)) for p in ENC_DIR.rglob('*.json') if str(p.relative_to(ENC_DIR)) not in keep) \
        if ENC_DIR.exists() else []
    if go:
        for s in stale:
            (ENC_DIR / s).unlink()
    tag = '' if go else '[dry-run] '
    print(f'{tag}files {len(files)} · write {len(changed)} · unchanged {same} · stale removed {len(stale)} {stale[:5]}')
    print(f'{tag}plain {total_plain / 1e6:.1f}MB -> enc {total_enc / 1e6:.1f}MB' if key else
          f'{tag}no key yet — sizes unknown (run --init-key --go)')
    print(f'{tag}kept public (plain): {PUBLIC_PLAIN}')


if __name__ == '__main__':
    main()
