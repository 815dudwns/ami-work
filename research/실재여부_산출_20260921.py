#!/usr/bin/env python3
"""실재 여부 축 산출 (영준님 2026-09-21) — 보고용. 데이터는 건드리지 않는다.

A = 같은 고객번호의 **다른 계기**가 원장 '청구' 이거나 modem_work_all 에 수록
B = **우리 계기**는 원장 청구도 아니고 modem_work_all 수록도 아님
A and B = 우리 계기가 '유령'일 가능성이 있는 건.
★시간 순서는 참고 칸으로만 찍는다 — 판정에 쓰지 않는다.
"""
import json
import re
import sqlite3
from collections import Counter, defaultdict

ROOT = '/Users/woodelight/Projects/ami-work/workspaces/통신팀/'
LEDGER = '20260227다운로드_2025_03_24에서2026_0'
g = lambda r, k: str(r.get(k) or '').strip()
nm = lambda v: re.sub(r'[\s\-]', '', str(v or '')).strip().upper()
nc = lambda v: (re.sub(r'\D', '', str(v or '')) or '').zfill(10) if v else ''
ymd = lambda v: (re.sub(r'\D', '', str(v or ''))[:8]
                 if len(re.sub(r'\D', '', str(v or ''))) >= 8 else '')

c = sqlite3.connect(ROOT + 'data/ami.db').cursor()

led = defaultdict(list)          # 계기 -> [(앱일, 상태, MAC)]
by_cust = defaultdict(set)
for cust, m, st, d, mac in c.execute(
        f'SELECT 고객번호,계기번호,col_15,시공일,MAC FROM "{LEDGER}"'):
    k = nm(m)
    if not k:
        continue
    led[k].append((ymd(d), str(st or '').strip(), str(mac or '').strip()))
    cu = nc(cust)
    if cu:
        by_cust[cu].add(k)

aw = {}                          # 계기 -> (작업일, 작업구분)
for m, d, kind in c.execute('SELECT 계기번호_norm,작업일자,작업구분 FROM modem_work_all'):
    k = nm(m)
    if k and k not in aw:
        aw[k] = (ymd(d), str(kind or '').strip())

swap = {}                        # 계기 -> 실제 계기교체일(A)
for cust, m1, m2, d in c.execute(
        'SELECT 고객번호,계기번호,계기번호_2,"계기교체일(A)" FROM boranggi'):
    v = ymd(d)
    cu = nc(cust)
    for m in (m1, m2):
        k = nm(m)
        if not k:
            continue
        if v and k not in swap:
            swap[k] = v
        if cu:
            by_cust[cu].add(k)      # ★상대 후보는 원장+보강현황 둘 다 본다

billed = lambda k: any(st == '청구' for _, st, _ in led.get(k, []))
listed = lambda k: k in aw

prev = {x['계기번호'] for x in json.load(
    open(ROOT + 'research/고객번호경유_후속청구제외_20260921.json'))}

rows = []
for f, lab in (('data/michunggu-data.json', '25미청구'),
               ('data/michunggu-bulga-data.json', '25년불가')):
    for r in json.load(open(ROOT + f)):
        me, cu = nm(g(r, '계기번호')), nc(g(r, '고객번호'))
        if not cu:
            continue
        # B — 우리 계기에 청구도 awms 수록도 없다
        if billed(me) or listed(me):
            continue
        # A — 같은 고객번호의 다른 계기가 청구 또는 awms 수록
        others = [o for o in by_cust.get(cu, ()) if o != me and (billed(o) or listed(o))]
        if not others:
            continue
        o = sorted(others)[0]
        mine = led.get(me, [])
        ours_day = max((d for d, _, _ in mine if d), default='')
        our_state = ('청구' if billed(me)
                     else ('불가' if any(st == '불가' for _, st, _ in mine)
                           else ('미청구' if any(st == '미청구' for _, st, _ in mine)
                                 else '(원장없음)')))
        our_mac = next((mc for _, _, mc in mine if mc), '')
        mac_ok = bool(our_mac) and nm(our_mac) != me       # MAC 칸이 계기번호면 '없음'
        o_day = swap.get(o) or aw.get(o, ('', ''))[0] or ''
        order = ('?' if not (ours_day and o_day)
                 else ('상대가 먼저' if o_day < ours_day
                       else ('같은날' if o_day == ours_day else '상대가 나중')))
        rows.append({
            '리스트': lab, '계기번호': g(r, '계기번호'), '고객번호': g(r, '고객번호'),
            '지사': g(r, '지사'), '주소': g(r, '주소'),
            '우리상태': our_state, '우리MAC': our_mac, 'MAC유무': 'O' if mac_ok else '없음',
            '불가사유': g(r, '불가사유'), '불가상세': g(r, '불가상세'),
            '상대계기': o, '상대청구': billed(o), '상대awms': listed(o),
            '상대작업구분': aw.get(o, ('', ''))[1],
            '우리앱일': ours_day, '상대실제일': o_day, '시간순서(참고)': order,
            '기존98에포함': g(r, '계기번호') in prev,
        })

print(f'★A and B = **{len(rows)}건**  {dict(Counter(x["리스트"] for x in rows))}\n')
print('── 우리 상태 ──')
for k, v in Counter(x['우리상태'] for x in rows).most_common():
    print(f'   {k:10s} {v:5,}')
print('\n── 우리 MAC 유무 ──')
for k, v in Counter(x['MAC유무'] for x in rows).most_common():
    print(f'   {k:10s} {v:5,}')
print('\n── ★영준님이 가른 두 갈래 ──')
a1 = [x for x in rows if x['우리상태'] == '불가']
a2 = [x for x in rows if x['우리상태'] == '미청구' and x['MAC유무'] == 'O']
a3 = [x for x in rows if x not in a1 and x not in a2]
print(f'   ① 우리가 불가(유령 가능성 높음)        **{len(a1):,}**'
      f'  {dict(Counter(x["리스트"] for x in a1))}')
print(f'   ② 우리가 미청구인데 MAC 제대로 있음     **{len(a2):,}**'
      f'  {dict(Counter(x["리스트"] for x in a2))}')
print(f'   ③ 그 외(미청구·MAC없음 / 원장없음 등)   **{len(a3):,}**'
      f'  {dict(Counter(x["우리상태"] + "/" + x["MAC유무"] for x in a3).most_common(4))}')
print('\n── 불가사유 계열 상위 (①) ──')
for k, v in Counter((x['불가사유'] or '(없음)') + ' / ' + (x['불가상세'] or '')[:18]
                    for x in a1).most_common(10):
    print(f'   {v:5,}  {k}')
print('\n── 상대가 awms(26년) 인 경우 작업구분 ──')
awr = [x for x in rows if x['상대awms']]
print(f'   상대 awms 수록 {len(awr):,} · 작업구분 {dict(Counter(x["상대작업구분"] for x in awr).most_common())}')
gisul = [x for x in awr if x['상대작업구분'] == '기설']
print(f'   ★기설 {len(gisul):,}건 — 슬레이브를 친 것이라 그 개소 25년 모뎀은 여전히 우리 것'
      ' -> 제외 대상에서 뺀다')
print('\n── 시간 순서 (참고만) ──')
for k, v in Counter(x['시간순서(참고)'] for x in rows).most_common():
    print(f'   {k:12s} {v:5,}')
print('\n── ★기존 M6/B9 98건과 대조 ──')
print('   (98건은 이미 리스트에서 빠져 있으니 현재 리스트 스캔에는 안 나온다 — 직접 판정한다)')
fu = json.load(open(ROOT + 'research/고객번호경유_후속청구제외_20260921.json'))
ab, notab = [], []
for x in fu:
    me, cu = nm(x['계기번호']), nc(x['고객번호'])
    if billed(me) or listed(me):
        notab.append((x, '우리 계기가 청구/awms 에 있다 = B 불성립'))
        continue
    others = [o for o in by_cust.get(cu, ()) if o != me and (billed(o) or listed(o))]
    if not others:
        notab.append((x, '같은 고객번호에 청구/awms 계기가 없다 = A 불성립'))
        continue
    ab.append(x)
print(f'   98건 중 A and B 성립 **{len(ab)}** · 불성립 **{len(notab)}**')
for x, why in notab[:6]:
    print(f'      {x["계기번호"]} — {why}')
os_ = Counter()
for x in ab:
    me = nm(x['계기번호'])
    mine = led.get(me, [])
    st = ('불가' if any(s2 == '불가' for _, s2, _ in mine)
          else ('미청구' if any(s2 == '미청구' for _, s2, _ in mine) else '(원장없음)'))
    mac = next((mc for _, _, mc in mine if mc), '')
    os_[f'{st}/{"MAC O" if mac and nm(mac) != me else "MAC 없음"}'] += 1
print(f'   성립분 상태 분포: {dict(os_.most_common())}')
json.dump(rows, open(ROOT + 'research/실재여부_산출_20260921.json', 'w'),
          ensure_ascii=False, indent=1)
print(f'\n저장 research/실재여부_산출_20260921.json ({len(rows):,}건)')
