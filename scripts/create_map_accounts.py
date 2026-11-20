#!/usr/bin/env python3
"""Create / update 아미맵 login accounts in Firebase Authentication (2026-11-20 security switch).

Source: ~/.ami-secrets/map_accounts_20261120.json (outside git, read only). Its shape:
  accounts [{id, name, pw, role?}]  -> created or updated
  pending  [{id, name}]             -> NOT created (no password yet)
  dropped  [id, ...]                -> NOT created; if such a user exists, it is reported (and
                                       disabled only with --disable-dropped --go)

Each account becomes:
  uid = id · email = '<id>@ami-work.local' · password = pw · displayName = name
  custom claim {'role': role or 'user'}   (js/auth.js reads name and role from here)

Passwords are never printed, logged or written anywhere else.

    python3 scripts/create_map_accounts.py                 # dry run (default): plan only
    python3 scripts/create_map_accounts.py --go            # LIVE: create/update accounts
    python3 scripts/create_map_accounts.py --emulator --go # local Auth emulator 127.0.0.1:9099 (tests)
    python3 scripts/create_map_accounts.py --src <file>    # another source file (tests)

Prerequisite (LIVE): Firebase console > Authentication > Get started > Sign-in method >
Email/Password enabled. Today the project has no Auth configuration (CONFIGURATION_NOT_FOUND).
workStatus is never touched. Records left by dropped accounts stay.
"""
import json
import os
import sys
from pathlib import Path

SRC = Path.home() / '.ami-secrets' / 'map_accounts_20261120.json'
SA_KEY = Path('/Users/woodelight/Projects/ami-work/ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json')
DOMAIN = 'ami-work.local'
PROJECT = 'ami-work-1c49a'


def main():
    a = sys.argv[1:]
    go = '--go' in a
    emu = '--emulator' in a
    src = Path(a[a.index('--src') + 1]) if '--src' in a else SRC
    d = json.loads(src.read_text(encoding='utf-8'))
    accounts = d.get('accounts') or []
    pending = [p.get('id') for p in d.get('pending') or []]
    dropped = list(d.get('dropped') or [])

    ids = [x['id'] for x in accounts]
    bad = [x['id'] for x in accounts if len(str(x.get('pw') or '')) < 6]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    clash = sorted(set(ids) & (set(dropped) | set(pending)))
    if bad or dup or clash:
        sys.exit(f'★source rejected — short password {bad} · duplicate id {dup} · id also pending/dropped {clash}')

    if emu:
        os.environ['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099'
    import firebase_admin
    from firebase_admin import auth, credentials
    if not firebase_admin._apps:
        if emu:
            firebase_admin.initialize_app(options={'projectId': PROJECT})
        else:
            firebase_admin.initialize_app(credentials.Certificate(str(SA_KEY)), {'projectId': PROJECT})

    def existing(uid):
        try:
            return auth.get_user(uid)
        except auth.UserNotFoundError:
            return None
        except Exception as e:   # no Auth configuration yet, network, ...
            if not go:
                return f'unknown ({type(e).__name__})'
            raise

    where = 'emulator' if emu else 'LIVE'
    tag = '' if go else '[dry-run] '
    made, updated = 0, 0
    for x in accounts:
        uid = x['id']
        role = x.get('role') or 'user'
        u = existing(uid)
        state = 'new' if u is None else ('exists' if not isinstance(u, str) else u)
        print(f'{tag}{where} {uid:<8} {state:<8} name={"yes" if x.get("name") else "NO"} role={role}')
        if not go:
            continue
        kw = dict(email=f'{uid}@{DOMAIN}', password=str(x['pw']), display_name=x.get('name') or uid,
                  email_verified=True, disabled=False)
        if u is None:
            auth.create_user(uid=uid, **kw)
            made += 1
        else:
            auth.update_user(uid, **kw)
            updated += 1
        auth.set_custom_user_claims(uid, {'role': role})

    for uid in pending:
        print(f'{tag}{where} {uid:<8} pending  — not created')
    for uid in dropped:
        u = existing(uid)
        if u is None or isinstance(u, str):
            print(f'{tag}{where} {uid:<8} dropped  — not created ({"absent" if u is None else u})')
            continue
        if go and '--disable-dropped' in a:
            auth.update_user(uid, disabled=True)
            print(f'{where} {uid:<8} dropped  — EXISTS, disabled')
        else:
            print(f'{tag}{where} {uid:<8} dropped  — EXISTS (use --disable-dropped --go to disable)')
    print(f'{tag}{where} accounts {len(accounts)} · created {made} · updated {updated} · '
          f'pending skipped {len(pending)} · dropped skipped {len(dropped)}')


if __name__ == '__main__':
    main()
