#!/usr/bin/env python3
"""Move finished sites (complete / fail) out of the map files into per-list archives (2026-11-07).

영준님: "25 미청구, 25 불가 — 완료 및 불가건 백업해서 완료아카이브에 넣어. 모든 리스트 다 켰을 때 버벅임 적게."

  python3 scripts/archive_done_sites.py <workStatus.json>          # dry run (default)
  python3 scripts/archive_done_sites.py <workStatus.json> --go     # write files
  python3 scripts/archive_done_sites.py --pull [--go]              # pull workStatus first (read only)

What it does
  * Decides "done" per SITE with the same status key the map uses (scripts/status_key.py over
    every map list). Done = site state complete or fail. pending / hold / no record stay on the map.
  * Done rows go to the list's own archive (registry `archivesGlob`, e.g.
    data/michunggu-completed-archive-YYYYMMDD.json). NOT the shared 'a' list — stats must keep
    each list's own totals, and helper/아미큐 labels read each list's archives.
  * Rows are moved unchanged (same object, same field order). Map files keep order and format.
  * workStatus is only read. Never written.

Gate (stops before writing)
  The status key of every row that stays on the map must be the same before and after.
  A key is built from rows that share a marker, so removing rows could in principle shift
  the key of a neighbour. If any key moves, nothing is written.

Builders: build_michunggu_dataset_20260918.py and build_michunggu_bulga_20260920.py skip meters
already in their list's archive (datasets.archived_meters), so a rebuild does not bring them back.
"""
import collections
import json
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import status_key as S  # noqa: E402
from datasets import DATASETS  # noqa: E402

WS_URL = ('https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app'
          '/workStatus/charger4eleccar.json')
CODES = ['s', 'p', 'm', 'u', 'c']     # 실효 · 선조치 · 25미청구 · 25불가 · 미조치(2026-11-07)
DONE = ('complete', 'fail')


def dump(rows, like=''):
    # same format as the builders (indent=1, no ascii escape, no trailing newline).
    # ★미조치(14만 행)는 한 줄에 한 행(compact) — 원래 파일이 그 꼴이면 그대로 쓴다(indent 면 수십 MB 가 는다).
    if like.startswith('[\n{'):
        return '[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows) + '\n]'
    return json.dumps(rows, ensure_ascii=False, indent=1)


def keys_of(rows):
    idx = S.build_status_key_index(rows)
    bm = idx[0] if isinstance(idx, tuple) else idx
    return {r['_i']: S.status_key_of(r, bm) for r in rows}


def main():
    args = sys.argv[1:]
    go = '--go' in args
    day = datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y%m%d')
    if '--pull' in args:
        ws = json.load(urllib.request.urlopen(WS_URL))
        print(f'workStatus pulled {len(ws):,} keys')
    else:
        ws = json.load(open([a for a in args if not a.startswith('--')][0]))

    rows = S.load_rows(str(ROOT / 'data'))
    for i, r in enumerate(rows):
        r['_i'] = i
    k0 = keys_of(rows)

    reg = {d['code']: d for d in DATASETS}
    cat_of = {c: reg[c]['category'] for c in CODES}
    done_i = set()
    per = {}
    for c in CODES:
        site = collections.defaultdict(list)
        for r in rows:
            if r['category'] == cat_of[c]:
                site[k0[r['_i']]].append(r)
        st = collections.Counter()
        dn = set()
        for k, l in site.items():
            s = (ws.get(S.encode_key(k)) or {}).get('state') or '(none)'
            st[s] += 1
            if s in DONE:
                dn.update(r['_i'] for r in l)
        done_i |= dn
        per[c] = (st, dn, sum(len(l) for l in site.values()))

    keep = [r for r in rows if r['_i'] not in done_i]
    k1 = keys_of(keep)
    moved = [(k0[i], k1[i]) for i in k1 if k0[i] != k1[i]]
    print(f'rows {len(rows):,} -> staying {len(keep):,} · key changes among staying rows {len(moved)}')
    if moved:
        for a, b in moved[:20]:
            print('   ', a, '->', b)
        print('★GATE FAILED — staying rows would change status key. Nothing written.')
        return 1

    for c in CODES:
        d = reg[c]
        st, dn, n = per[c]
        f = ROOT / d['file']
        raw = f.read_text(encoding='utf-8')
        arr = json.loads(raw)
        # load_rows keeps file order, so the k-th row of this category is arr[k]
        cat_rows = [r for r in rows if r['category'] == cat_of[c]]
        assert len(cat_rows) == len(arr), (c, len(cat_rows), len(arr))
        out_rows = [arr[k] for k, r in enumerate(cat_rows) if r['_i'] in dn]
        stay = [arr[k] for k, r in enumerate(cat_rows) if r['_i'] not in dn]
        ap = ROOT / d['archivesGlob'].replace('*', day)
        prev = json.loads(ap.read_text(encoding='utf-8')) if ap.exists() else []
        print(f"{c} {d['category']}: sites {dict(st)} · meters {n:,} -> archive {len(out_rows):,} · stay {len(stay):,}"
              f" · {ap.relative_to(ROOT)}" + (f' (append to {len(prev):,})' if prev else ''))
        if go and out_rows:
            ap.write_text(dump(prev + out_rows, raw), encoding='utf-8')
            f.write_text(dump(stay, raw), encoding='utf-8')
    if not go:
        print('dry run — add --go to write')
    else:
        print('written. Next: scripts/gen_site_version.py (site-data changed) · stats/label indexes on main (PM)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
