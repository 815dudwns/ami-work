#!/usr/bin/env python3
"""data/stats-site-index.json -> data/meter-list-index.json  {meterNo: "codes"}.

Codes: s=silhyo, h=hapdong, m=25 michunggu, u=25 bulga, j=jangae, g=gapap, k=skt.
'a' (old completed archive) is skipped. Used by awms-bridge-inject.js meter check.
"""
import json, os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, 'data', 'stats-site-index.json')
DST = os.path.join(BASE, 'data', 'meter-list-index.json')
ORDER = 'shmujgk'

def main():
    rows = json.load(open(SRC, encoding='utf-8'))
    idx = {}
    for r in rows:
        c = r.get('l')
        no = re.sub(r'[\s\-]', '', str(r.get('계기번호') or '')).upper()
        if not no or c not in ORDER:
            continue
        idx.setdefault(no, set()).add(c)
    out = {k: ''.join(ch for ch in ORDER if ch in v) for k, v in sorted(idx.items())}
    with open(DST, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'meters ->', DST, os.path.getsize(DST), 'bytes')

if __name__ == '__main__':
    main()
