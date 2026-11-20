#!/usr/bin/env python3
"""Rules + encryption test for the 2026-11-20 security switch — local emulators only, never live.

Needs the Firebase emulators (auth 9099, database 9000) started with database.rules.secure.json.
Java 21+ is required (brew openjdk):

    cd <dir with firebase.json pointing at database.rules.secure.json>
    PATH=/opt/homebrew/opt/openjdk/bin:$PATH firebase emulators:start --project ami-work-1c49a --only auth,database
    python3 scripts/test_map_security.py

What it checks:
  1. rules — without login: workStatus / mapSecret / collect_handoff / siteData refused;
     other apps' paths (awmsOtp, helperStock, cstBackend, blogagent_review ...) behave as today.
     With login: workStatus read + write and the data key are allowed, siteData stays refused,
     mapSecret stays read-only.
  2. encryption — publish_enc_data.encrypt/decrypt round trip, deterministic output, wrong key fails.
Throwaway emulator accounts are created here (sec-test, sec-unverified, sec-other). No live Firebase call is made.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
DB = 'http://127.0.0.1:9000'
NS = 'ns=ami-work-1c49a-default-rtdb'
AUTH = 'http://127.0.0.1:9099'
fails = []


def req(method, path, body=None, token=None, owner=False):
    q = NS + (f'&auth={token}' if token else '')
    r = urllib.request.Request(f'{DB}/{path}.json?{q}', method=method,
                               data=None if body is None else json.dumps(body).encode(),
                               headers={'Authorization': 'Bearer owner'} if owner else {})
    try:
        with urllib.request.urlopen(r, timeout=20) as x:
            return x.status
    except urllib.error.HTTPError as e:
        return e.code


def check(name, got, want):
    ok = got == want
    print(f'{"PASS" if ok else "FAIL"} {name}: {got} (want {want})')
    if not ok:
        fails.append(name)


def _sign_in(email, pw):
    r = urllib.request.Request(f'{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',
                               data=json.dumps({'email': email, 'password': pw, 'returnSecureToken': True}).encode(),
                               headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(r, timeout=20) as x:
        return json.loads(x.read())['idToken']


def id_tokens():
    """Three emulator users made with the admin SDK: verified @ami-work.local (allowed), unverified
    @ami-work.local and verified @other.example (both refused by the 2026-11-21 gate)."""
    os.environ['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099'
    import firebase_admin
    from firebase_admin import auth
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={'projectId': 'ami-work-1c49a'})
    out = {}
    for name, email, verified in [('ok', 'sec-test@ami-work.local', True),
                                  ('unverified', 'sec-unverified@ami-work.local', False),
                                  ('otherdomain', 'sec-other@other.example', True)]:
        try:
            u = auth.get_user_by_email(email)
            auth.update_user(u.uid, password='sec-test-pw', email_verified=verified)
        except auth.UserNotFoundError:
            auth.create_user(email=email, password='sec-test-pw', email_verified=verified)
        out[name] = _sign_in(email, 'sec-test-pw')
    return out


def main():
    try:
        urllib.request.urlopen(f'{DB}/.json?{NS}&shallow=true', timeout=5)
    except urllib.error.HTTPError:
        pass
    except Exception:
        sys.exit('★emulator not running on 127.0.0.1:9000 — start it first (see docstring)')
    req('PUT', 'mapSecret/dataKey', 'dGVzdA==', owner=True)
    req('PUT', 'workStatus/charger4eleccar/sec-test', {'state': 'complete', 'syncAt': 1}, owner=True)
    req('PUT', 'siteData/charger4eleccar/0', {'주소': 'x'}, owner=True)
    toks = id_tokens()
    tok = toks['ok']

    print('-- without login')
    check('workStatus read', req('GET', 'workStatus/charger4eleccar'), 401)
    check('workStatus shallow read', req('GET', 'workStatus/charger4eleccar'), 401)
    check('workStatus write', req('PUT', 'workStatus/charger4eleccar/sec-test-anon', {'state': 'x'}), 401)
    check('mapSecret read', req('GET', 'mapSecret/dataKey'), 401)
    check('collect_handoff write', req('PUT', 'collect_handoff/sec-test', {'a': 1}), 401)
    check('siteData read', req('GET', 'siteData/charger4eleccar'), 401)
    check('root read', req('GET', ''), 401)
    for p in ['awmsOtp/sec-test', 'helperStock/sec-test', 'cstBackend', 'valBackend', 'blogagent_review/sec-test',
              'awmslog/sec-test', 'dartDisclosures/sec-test', 'awmsDoneMeters']:
        check(f'{p} read (unchanged, open)', req('GET', p), 200)
    for p in ['awmsOtp/sec-test', 'helperStock/sec-test/offbook', 'blogagent_review/sec-test',
              'awmscomplete/sec-test', 'awmsDoneMeters']:
        check(f'{p} write (unchanged, open)', req('PUT', p, {'t': 1}), 200)
    print('-- closed 2026-11-21 (Fable H2)')
    check('cstBackend write', req('PUT', 'cstBackend', {'url': 'https://evil.example'}), 401)
    check('valBackend write', req('PUT', 'valBackend', {'url': 'https://evil.example'}), 401)
    check('awmscomplete read', req('GET', 'awmscomplete'), 401)
    check('test read', req('GET', 'test'), 401)
    check('test write', req('PUT', 'test/x', 1), 401)
    check('$other read', req('GET', 'somethingRandom123'), 401)
    check('$other write', req('PUT', 'somethingRandom123', 1), 401)

    print('-- logged in but not allowed (2026-11-21 gate: verified @ami-work.local only)')
    for name in ('unverified', 'otherdomain'):
        t = toks[name]
        check(f'{name}: workStatus read', req('GET', 'workStatus/charger4eleccar', token=t), 401)
        check(f'{name}: workStatus write', req('PUT', 'workStatus/charger4eleccar/sec-x', {'state': 'x'}, token=t), 401)
        check(f'{name}: mapSecret read', req('GET', 'mapSecret/dataKey', token=t), 401)

    print('-- logged in')
    check('workStatus read', req('GET', 'workStatus/charger4eleccar', token=tok), 200)
    check('workStatus write', req('PUT', 'workStatus/charger4eleccar/sec-test-user', {'state': 'complete'}, token=tok), 200)
    check('workStatus whole-node write', req('PUT', 'workStatus/charger4eleccar', {}, token=tok), 401)
    check('mapSecret read', req('GET', 'mapSecret/dataKey', token=tok), 200)
    check('mapSecret write', req('PUT', 'mapSecret/dataKey', 'eA==', token=tok), 401)
    check('collect_handoff write', req('PUT', 'collect_handoff/sec-test', {'a': 1}, token=tok), 200)
    check('siteData read', req('GET', 'siteData/charger4eleccar', token=tok), 401)
    for p in ['workStatus/charger4eleccar/sec-test-user', 'collect_handoff/sec-test']:
        req('DELETE', p, owner=True)

    print('-- encryption')
    import publish_enc_data as P
    k1, k2 = os.urandom(32), os.urandom(32)
    plain = json.dumps([{'주소': '서울특별시 시험구 시험동 1', '계기번호': '00000000001'}] * 50, ensure_ascii=False).encode()
    b1, b2 = P.encrypt(k1, 'data/x.json', plain), P.encrypt(k1, 'data/x.json', plain)
    check('round trip', P.decrypt(k1, b1) == plain, True)
    check('deterministic (same ETag for same content)', b1 == b2, True)
    check('different content -> different IV', P.encrypt(k1, 'data/x.json', plain + b' ')[8:20] != b1[8:20], True)
    check('no plaintext inside', '시험동'.encode() in b1, False)
    try:
        P.decrypt(k2, b1)
        wrong = 'decrypted'
    except Exception:
        wrong = 'refused'
    check('wrong key', wrong, 'refused')

    print(f'\n{"PASS" if not fails else "FAIL"} — {len(fails)} failed {fails}')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
