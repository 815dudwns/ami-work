#!/usr/bin/env python3
"""Show / deploy RTDB rules for ami-work-1c49a (2026-11-20 security switch).

    python3 scripts/deploy_rtdb_rules.py <rules.json>          # dry run: diff live vs file (read only)
    python3 scripts/deploy_rtdb_rules.py <rules.json> --go     # LIVE: replace rules (PM, at deploy)
    python3 scripts/deploy_rtdb_rules.py --save <out.json>     # save live rules (read only)

Files:
  database.rules.live_20261120.json      live rules as fetched 2026-11-20 (rollback target)
  database.rules.transition.json         step 2: root read closed, key protected, workStatus still open
  database.rules.secure.json             step 4: workStatus / collect_handoff need login

Before --go it saves the live rules to /tmp/rtdb_rules_before_<time>.json, so a bad deploy can be
undone with the same command on that file. Only rules change; no data is touched.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fb_rest import authed  # noqa: E402

URL = 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app/.settings/rules.json'


def live():
    return urllib.request.urlopen(authed(URL), timeout=60).read().decode()


def flat(d, p=''):
    out = {}
    if isinstance(d, dict):
        for k, v in d.items():
            out.update(flat(v, f'{p}/{k}'))
    else:
        out[p] = d
    return out


def main():
    a = sys.argv[1:]
    if '--save' in a:
        Path(a[a.index('--save') + 1]).write_text(live())
        print('saved live rules')
        return
    if not a:
        sys.exit(__doc__)
    new_text = Path(a[0]).read_text(encoding='utf-8')
    new = json.loads(new_text)
    cur = json.loads(live())
    fc, fn = flat(cur), flat(new)
    for k in sorted(set(fc) | set(fn)):
        if fc.get(k) != fn.get(k):
            print(f'{k}: {fc.get(k, "(none)")!r} -> {fn.get(k, "(none)")!r}')
    if '--go' not in a:
        print('[dry-run] nothing deployed')
        return
    bak = Path(f'/tmp/rtdb_rules_before_{time.strftime("%Y%m%d_%H%M%S")}.json')
    bak.write_text(json.dumps(cur, ensure_ascii=False, indent=2))
    req = urllib.request.Request(authed(URL), data=new_text.encode(), method='PUT')
    urllib.request.urlopen(req, timeout=60).read()
    print(f'LIVE rules replaced · previous saved to {bak}')


if __name__ == '__main__':
    main()
