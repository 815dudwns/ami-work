#!/usr/bin/env python3
"""M6/B9 재현 — 고객번호 경유 후속 청구."""
import json
import re
import sqlite3
from collections import Counter, defaultdict

ROOT = '/Users/woodelight/Projects/ami-work/workspaces/통신팀/'
LEDGER = '20260227다운로드_2025_03_24에서2026_0'

g = lambda r, k: str(r.get(k) or '').strip()
nm = lambda v: re.sub(r'[\s\-]', '', str(v or '')).strip().upper()
nc = lambda v: (re.sub(r'\D', '', str(v or '')) or '').zfill(10) if v else ''


def ymd(v):
    """'20251117 10:30:09' · '2025-11-17' · 20251117 -> '20251117'"""
    s = re.sub(r'\D', '', str(v or ''))
    return s[:8] if len(s) >= 8 else ''


def typo_pair(a, b):
    """같은 자릿수에서 1~2자리만 다르면 오타 쌍 — 교체가 아니다."""
    if len(a) != len(b) or a == b:
        return False
    return sum(1 for x, y in zip(a, b) if x != y) <= 2


c = sqlite3.connect(ROOT + 'data/ami.db').cursor()

# 원장: 계기 -> (시공일2, 상태) · 고객번호 -> 계기집합
led, by_cust = {}, defaultdict(set)
for cust, m, st, d2 in c.execute(
        f'SELECT 고객번호,계기번호,col_15,시공일2 FROM "{LEDGER}"'):
    k, cu = nm(m), nc(cust)
    if not k:
        continue
    st = str(st or '').strip()
    prev = led.get(k)
    # 같은 계기가 여러 행이면 상태는 '청구' 우선, 날짜는 최신
    if prev is None:
        led[k] = [ymd(d2), st]
    else:
        if ymd(d2) > prev[0]:
            prev[0] = ymd(d2)
        if st == '청구':
            prev[1] = '청구'
    if cu:
        by_cust[cu].add(k)

# 보강현황: 고객번호 -> {계기: 교체일}
bo = defaultdict(dict)
for cust, m1, m2, d in c.execute(
        'SELECT 고객번호,계기번호,계기번호_2,"계기교체일(A)" FROM boranggi'):
    cu = nc(cust)
    if not cu:
        continue
    for m in (m1, m2):
        k = nm(m)
        if k and ymd(d):
            bo[cu].setdefault(k, ymd(d))

out, typos, worked_only = [], [], []
for f, lab in (('data/michunggu-data.json', '25미청구'),
               ('data/michunggu-bulga-data.json', '25년불가')):
    d = json.load(open(ROOT + f))
    for r in d:
        me, cu = nm(g(r, '계기번호')), nc(g(r, '고객번호'))
        if not cu:
            continue
        ours = ymd((led.get(me) or ['', ''])[0]) or ymd(g(r, '최종시공일'))
        if not ours:
            continue
        cands = set(by_cust.get(cu, ())) | set(bo.get(cu, {}))
        for other in sorted(cands):
            if other == me:
                continue
            if typo_pair(me, other):
                typos.append((lab, g(r, '계기번호'), other, ours))
                continue
            od = max(filter(None, [(led.get(other) or ['', ''])[0],
                                   bo.get(cu, {}).get(other, '')]), default='')
            ost = (led.get(other) or ['', ''])[1]
            if not od or od <= ours:
                continue
            gap = ((int(od[:4]) - int(ours[:4])) * 365
                   + (int(od[4:6]) - int(ours[4:6])) * 30 + (int(od[6:8]) - int(ours[6:8])))
            import datetime as _dt
            try:
                gap = (_dt.date(int(od[:4]), int(od[4:6]), int(od[6:8]))
                       - _dt.date(int(ours[:4]), int(ours[4:6]), int(ours[6:8]))).days
            except ValueError:
                pass
            if ost == '청구':
                out.append({'리스트': lab, '계기번호': g(r, '계기번호'), '고객번호': g(r, '고객번호'),
                            '우리시공일': ours, '상대계기': other, '상대작업일': od,
                            '간격일': gap, '상대상태': ost})
            else:
                worked_only.append((lab, g(r, '계기번호'), other, od, ost))
            break

print(f'제외 대상(청구까지 간 것) **{len(out)}**  '
      f'{dict(Counter(x["리스트"] for x in out))}')
print(f"작업만 되고 청구 안 된 것 {len(worked_only)} (빼지 않는다)")
print(f'★오타 쌍으로 걸러진 것 {len(typos)}')
for t in typos[:8]:
    print(f'   {t[0]} {t[1]} <-> {t[2]}')
gaps = [x['간격일'] for x in out]
b = Counter('1~7일' if x <= 7 else '8~30일' if x <= 30 else '31~90일' if x <= 90
            else '91~180일' if x <= 180 else '★181일~' for x in gaps)
print(f'\n간격 분포: {dict(b)}')
print(f'★181일 초과 {sum(1 for x in gaps if x > 180)}건 · 최대 {max(gaps) if gaps else 0}일')
json.dump(out, open('/tmp/m6.json', 'w'), ensure_ascii=False, indent=1)
