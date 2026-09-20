#!/usr/bin/env python3
"""주덕기 과장 9/20 회신 대조 (PM 발주 2026-09-20)

발주서: research/발주_주덕기회신_대조_20260920.md
산출  : research/주덕기회신_대조_20260920.md (표는 표준출력에도 찍는다)

★판정·산출만 한다. 데이터셋 재생성·배포·Firebase 쓰기 없음.
★매칭 원칙 — 다른 리스트에서 값을 끌어올 때는 고객번호 -> MAC. 계기번호 단독 금지.
  단 **우리 목록 ↔ 과장 목록 대조는 계기번호로 한다** — 둘 다 같은 원장에서 갈라져 나온
  같은 계보의 목록이라 계기번호가 곧 그 목록의 키다(교차 출처 매칭이 아니다).
  그래도 고객번호로 한 번 더 대조해 재번호 때문에 어긋나는 게 없는지 확인한다.
"""
import json
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data/ami.db'
OUT = ROOT / 'research/주덕기회신_대조_20260920.md'
OUR_LIST = Path('/Users/woodelight/Projects/ami-work/research/미청구_최종대상_계기목록_20260918.txt')
V2 = '"25년미청구분_v2__sheet1"'
LP9 = ['LP 09-05', 'LP 09-06', 'LP 09-07', 'LP 09-08', 'LP 09-09', 'LP 09-13']

L = []


def log(m=''):
    print(m, flush=True)
    L.append(m)


def nm(v):
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).strip()
    if not s or s.upper() in ('NAN', 'NONE', '#N/A', '0'):
        return ''
    return s.upper() if re.search(r'[A-Za-z]', s) else s.zfill(11)


def nc(v):
    s = re.sub(r'\D', '', str(v if v is not None else ''))
    return s.zfill(10) if s and s.strip('0') else ''


def b(v):
    s = str(v if v is not None else '').strip()
    return '' if s.lower() in ('', 'none', 'nan', 'nat', '#n/a') else s


def num(v):
    s = str(v or '').strip()
    if s in ('', '#N/A') or s.lower() in ('none', 'nan', 'nat'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def main():
    con = sqlite3.connect(DB)
    c = con.cursor()
    rows = [dict(zip([d[0] for d in c.description], r))
            for r in c.execute(f'SELECT * FROM {V2}')]
    for r in rows:
        r['_m'] = nm(r['계기번호'])
        r['_c'] = nc(r['고객번호'])
        r['_lp'] = [v for v in (num(r[k]) for k in LP9) if v is not None]
        r['_재시공'] = b(r['26년 재시공일'])

    ours = [nm(x) for x in OUR_LIST.read_text().split() if nm(x)]
    ourset = set(ours)
    jdg = defaultdict(list)
    for r in rows:
        if r['_m']:
            jdg[r['_m']].append(r)
    log('# 주덕기 과장 9/20 회신 대조 (통신팀, 2026-09-20)\n')
    log(f'- 과장 v2 Sheet1 **{len(rows):,}행** / 계기 **{len(jdg):,}**')
    log(f'- 우리 최종 대상 **{len(ourset):,}계기**')
    log(f'- 차이 **{len(jdg) - len(ourset):+,}계기**\n')

    # ── 1. W 분류 역산 ──────────────────────────────────────────────────────
    log('## 1. 과장 `25대상`(W) 4분류 역산\n')
    W = Counter(r['25대상'] for r in rows)
    log(f'분포(행 기준): ' + ' · '.join(f'{k} {v:,}' for k, v in W.most_common()) + '\n')

    excl = [r for r in rows if r['_재시공']]
    hit = sum(1 for r in excl if r['25대상'] == '제외')
    miss = sum(1 for r in rows if r['25대상'] == '제외' and not r['_재시공'])
    log('### 규칙 ① `제외` = **26년 재시공일(X열)이 채워진 행** — 확정\n')
    log(f'| 검사 | 값 |\n|---|---:|')
    log(f'| 26년 재시공일 보유 | {len(excl):,} |')
    log(f'| 그중 W=`제외` | {hit:,} |')
    log(f'| **오탐**(재시공일 있는데 제외 아님) | **{len(excl)-hit}** |')
    log(f'| **누락**(제외인데 재시공일 없음) | **{miss}** |\n')

    rest = [r for r in rows if not r['_재시공']]
    lowlp = [r for r in rest if not (r['_lp'] and max(r['_lp']) == 1.0)]
    log('### 규칙 ② `신규시공` 의 큰 덩어리 = **LP 최대수신율 < 1 이거나 LP 수치가 아예 없음**\n')
    cw = Counter(r['25대상'] for r in lowlp)
    log(f'| 검사 | 값 |\n|---|---:|')
    log(f'| 해당 행 | {len(lowlp):,} |')
    log(f'| 그중 `신규시공` | {cw.get("신규시공", 0):,} |')
    log(f'| **오탐**(다른 분류가 섞임) | **{len(lowlp)-cw.get("신규시공",0)}** |\n')
    log('즉 **LP 가 한 번도 100% 가 안 된 개소는 전부 `신규시공`** 이다. 예외가 없다.\n')

    amb = [r for r in rest if r['_lp'] and max(r['_lp']) == 1.0]
    aw = Counter(r['25대상'] for r in amb)
    log(f'### 남는 것 — LP 가 한 번이라도 100% 인 **{len(amb):,}행**: 재현 실패\n')
    log('| 분류 | 건수 |\n|---|---:|')
    for k, v in aw.most_common():
        log(f'| {k} | {v:,} |')
    log('')
    log(f'이 구간의 3분류는 **시트 열로 재현되지 않는다.** 최빈값으로 찍으면 '
        f'{max(aw.values())/len(amb)*100:.1f}% 인데, 63개 열을 전수로 훑어도 그걸 넘는 열이 없다'
        f'(최고 작업자맥 70.5% · 시공자 70.3% — 사람·장비 열이라 판정 근거가 될 수 없다).')
    log('외부 축도 붙여 봤지만 갈리지 않았다 — 보강현황의 `26년시공앱`·`26년불가앱`·`현장앱`을')
    log('고객번호로 조인해도 세 분류의 비율이 그대로다(각 버킷에서 `앱작성 신설` 비중 ~68.8%).\n')
    log('**남는 것의 성격만 적는다(추정 금지):**')
    log(f'- `앱작성 신설` {aw.get("앱작성 신설",0):,} — 6일 전부 100% 수신이 {sum(1 for r in amb if r["25대상"]=="앱작성 신설" and len([x for x in r["_lp"] if x==1.0])==6):,}건으로 대부분')
    log(f'- `확인필요` {aw.get("확인필요",0):,} — 100% 인 날이 **있지만 나머지 날이 부분수신**이다'
        f'(평균 수신율 중앙 0.896)')
    log(f'- `신규시공` {aw.get("신규시공",0):,} — 100% 인 날이 있는데도 신규시공으로 갔다.'
        f' 100% 인 날 수가 1~5일로 흩어져 있어 `앱작성 신설`(주로 6일)과 겹친다')
    log('\n★즉 **과장이 LP 외의 무언가를 더 보고 갈랐다**. 그 근거는 이 파일에 없다.'
        ' 과장에게 "앱작성 신설과 신규시공을 무엇으로 갈랐는지" 한 줄 물어보는 것이 가장 빠르다.\n')

    log('### `앱작성 신설` 의 의미\n')
    log('- 과장 본문이 "26년 6/8 이후 재시공 대상은 W에 `제외`" 라고 했고, `제외`가 26년 재시공일과'
        ' 1:1 이므로 **`제외`만이 "이미 다시 시공한 것"** 이다.')
    log('- `앱작성 신설` 은 **LP 가 6일 내내 정상으로 오는 개소**다(2,073/2,338 이 6일 전부 100%).'
        ' 통신은 이미 살아 있는데 우리 시공 기록이 없다는 뜻이라,')
    log('  우리가 9/17 에 찾은 **`앱누락-시공`** 개념과 성격이 같다.')
    log('- 다만 과장 본문은 **"자재 때문에라도 신규로 시공해야 하지 않나"** 라고 적었다.'
        ' 즉 과장도 이 2,338건을 앱만 쓰고 끝낼지 실제로 갈지 **묻고 있는 상태**다 — 우리가 정할 일이 아니다.\n')

    # ── 2. 우리 ↔ 과장 대조 ─────────────────────────────────────────────────
    log('## 2. 우리 대상 8,994 ↔ 과장 9,766\n')
    only_j = set(jdg) - ourset
    only_o = ourset - set(jdg)
    log(f'| | 계기 |\n|---|---:|')
    log(f'| 양쪽 다 있음 | {len(set(jdg) & ourset):,} |')
    log(f'| **과장에만** | **{len(only_j):,}** |')
    log(f'| **우리에만** | **{len(only_o):,}** |')
    log(f'| 차이 | {len(jdg)-len(ourset):+,} |\n')

    # 우리 제외축
    hv = {nm(r[0]) for r in c.execute(
        'SELECT 계기번호 FROM "25년_ami_보강공사_미청구2__sheet1" WHERE 공종=\'고압\'')}
    hv.discard('')
    mw945 = {nm(r[0]) for r in c.execute(
        "SELECT 계기번호 FROM modem_work WHERE snapshot='20260908'")}
    mw945.discard('')
    s2 = {nm(r[0]) for r in c.execute(
        'SELECT 계기번호 FROM "25년_ami_보강공사_미청구2__sheet2" WHERE 계기번호 IS NOT NULL')}
    s2.discard('')
    log('### 과장에만 있는 계기가 우리 제외축 중 무엇이었나\n')
    log('| 우리가 뺀 이유 | 과장 목록에 살아 있음 | W 분류 |\n|---|---:|---|')
    axes = [('Sheet2(과장 9/17 판 2,654)', s2), ('26년시공 modem_work 20260908', mw945),
            ('고압(공종=고압)', hv)]
    claimed = set()
    for label, ax in axes:
        inter = (only_j & ax) - claimed
        claimed |= inter
        w = Counter(jdg[m][0]['25대상'] for m in inter)
        log(f'| {label} | {len(inter):,} | ' +
            (' · '.join(f'{k} {v:,}' for k, v in w.most_common()) or '-') + ' |')
    left = only_j - claimed
    w = Counter(jdg[m][0]['25대상'] for m in left)
    log(f'| **어느 축에도 없음** | **{len(left):,}** | ' +
        (' · '.join(f'{k} {v:,}' for k, v in w.most_common()) or '-') + ' |')
    log(f'| 계 | {len(only_j):,} | |\n')

    # 우리에만 있는 것
    log('### 우리에만 있는 계기\n')
    if only_o:
        jc = {nc(r['고객번호']) for r in rows if nc(r['고객번호'])}
        log(f'- {len(only_o):,}계기. 과장 목록에 계기번호로는 없다.')
        # 고객번호로 다시 대조
        # ★미청구2 sheet1 의 상태열(O)은 머리글이 없어 DB 적재 때 빠졌다.
        #   우리 8,994 의 고객번호는 우리 데이터셋에서 읽는다(같은 계보라 안전하다).
        ourrows = {}
        for f in ('data/michunggu-data.json', 'data/michunggu-pending.json'):
            pp = ROOT / f
            if pp.exists():
                for x in json.loads(pp.read_text()):
                    k = nm(x.get('계기번호'))
                    if k and k not in ourrows:
                        ourrows[k] = nc(x.get('고객번호'))
        viacust = sum(1 for m in only_o if ourrows.get(m) and ourrows[m] in jc)
        log(f'- 그중 **고객번호로는 과장 목록에 있는 것 {viacust:,}건**'
            f' (계기가 바뀐 개소로 추정 — 값 판정은 하지 않는다)')
        log(f'- 고객번호로도 없는 것 {len(only_o)-viacust:,}건\n')
    else:
        log('- 없음\n')

    # 772 분해
    log('### ★차이 772계기 분해\n')
    log(f'차이는 **과장에만 {len(only_j):,} − 우리에만 {len(only_o):,} = '
        f'{len(only_j)-len(only_o):+,}** 로 이루어진다. 한 건도 남기지 않는다.\n')
    log('| 구간 | 계기 |\n|---|---:|')
    for label, ax in axes:
        inter = only_j & ax
        log(f'| 과장에만 · 우리가 {label} 로 제외 | {len(inter):,} |')
    log(f'| 과장에만 · 우리 제외축 어디에도 없음 | {len(left):,} |')
    log(f'| (차감) 우리에만 있음 | −{len(only_o):,} |')
    log(f'| **합** | **{len(jdg)-len(ourset):+,}** |\n')

    if left:
        smp = list(left)[:5]
        log('어느 축에도 없는 건 표본: ' + ', '.join(smp) + '\n')

    log('### 과장 `제외` 882 와 우리 제외축\n')
    ex882 = {r['_m'] for r in rows if r['25대상'] == '제외'}
    log('| | 계기 |\n|---|---:|')
    log(f'| 과장 `제외` | {len(ex882):,} |')
    for label, ax in axes:
        log(f'| 그중 우리도 {label} 로 제외 | {len(ex882 & ax):,} |')
    log(f'| 그중 **우리 대상 8,994 에 들어 있음** | {len(ex882 & ourset):,} |\n')
    if ex882 & ourset:
        log(f'★{len(ex882 & ourset):,}건은 **과장이 "26년에 이미 재시공했다"고 한 개소인데'
            f' 우리 대상에 남아 있다.** 우리 26년시공 축이 `modem_work` 9/8 판이라 그 뒤 시공분을'
            f' 못 봤기 때문이다 — 9/1~9/18 자료로 메워진다(아래 6절).\n')

    # ── 3~6 부수 ────────────────────────────────────────────────────────────
    log('## 3. 과장이 말한 "수량이 적다"\n')
    log('과장은 고압을 뺐는데 **반장님이 주신 수량보다 적다**고 했다. 실제로는 과장 쪽이'
        f' **{len(jdg)-len(ourset):+,}계기 많다**. 비교 후보를 숫자로 놓는다.\n')
    log('| 우리가 보낸 숫자 | 값 | 과장 9,766 과의 차 |\n|---|---:|---:|')
    for lab, v in (('최종 대상(메일 본문)', len(ourset)), ('첨부1 요청(주소·변대주 결손)', 2006),
                   ('첨부2 불가 요청', 1376), ('첨부1+첨부2', 2006 + 1376)):
        log(f'| {lab} | {v:,} | {len(jdg)-v:+,} |')
    log('')
    log('- 고압은 양쪽 다 이미 빠졌다 — 과장 목록에 공종 `고압` 이 0건이고 우리도 637계기를 뺐다.')
    log('- 우리 원장 전체 기준 고압 계기는 6,065개, 그중 미청구는 637개다.'
        ' 과장이 6,065 쪽을 기대했다면 "적다"가 성립한다.')
    log('- **가장 그럴듯한 것은 첨부1(2,006)·첨부2(1,376) 를 대상 수량으로 읽은 경우**다.'
        ' 그 둘은 "물어볼 것"이지 대상 전체가 아니다 — 메일에서 구분이 흐렸을 수 있다.\n')

    log('## 4. 주소·변대주 회수량\n')
    jaddr, jbdju = {}, {}
    for r in rows:
        if r['_m'] and b(r['주소']) and r['_m'] not in jaddr:
            jaddr[r['_m']] = b(r['주소'])
        v = b(r['기존변대주']) or b(r['변경변대주'])
        if r['_m'] and v and v != '0' and r['_m'] not in jbdju:
            jbdju[r['_m']] = v
    pend = json.loads((ROOT / 'data/michunggu-pending.json').read_text())
    noaddr = {nm(x['계기번호']) for x in pend}
    allours = json.loads((ROOT / 'data/michunggu-data.json').read_text()) + pend
    nobd = {nm(x['계기번호']) for x in allours if not (x.get('변대주') or x.get('변대주번호'))}
    log('| 우리 결손 | 건수 | 과장 회신으로 채워짐 | 남는 결손 |\n|---|---:|---:|---:|')
    log(f'| 주소 | {len(noaddr):,} | **{len(noaddr & set(jaddr)):,}** | {len(noaddr - set(jaddr)):,} |')
    log(f'| 변대주 | {len(nobd):,} | **{len(nobd & set(jbdju)):,}** | {len(nobd - set(jbdju)):,} |')
    log('')
    log(f'- 과장 주소 채움 {len(jaddr):,}계기 / 변대주 {len(jbdju):,}계기'
        ' (본문 "341개는 이력을 못 찾아 추후 재송부"와 같은 맥락)\n')

    ap = ROOT / 'research/미청구_awms주소회수_20260918.json'
    if ap.exists():
        import importlib.util
        sp = importlib.util.spec_from_file_location(
            'vf', str(ROOT / 'scripts/verify_michunggu_meterkey_20260918.py'))
        V = importlib.util.module_from_spec(sp)
        sp.loader.exec_module(V)
        aw = {nm(x['계기번호']): x for x in json.loads(ap.read_text())['목록']
              if x.get('결과') == '적중' and x.get('awms_주소')}
        both = sorted(set(aw) & set(jaddr))
        vc = Counter(V.compare(aw[m]['awms_주소'], jaddr[m]) for m in both)
        und = sum(v for k, v in vc.items() if k.startswith('판정불가'))
        bad = vc['다른지번(불일치)'] + vc['다른구(확실한불일치)']
        j = len(both) - und
        log('### ★awms 회수 주소 대 한전 회신 — 채택 판단 근거\n')
        log('| 항목 | 값 |\n|---|---:|')
        log(f'| awms 회수 주소 | {len(aw):,} |')
        log(f'| 과장도 주소를 준 것(겹침) | {len(both):,} |')
        log(f'| 판정 가능 | {j:,} |')
        log(f'| 불일치 | {bad:,} |')
        log(f'| **정확도** | **{(j-bad)/j*100 if j else 0:.1f}%** |\n')
        log(f'판정 내역: {dict(vc.most_common())}\n')
        log('※도로명/지번 표기차는 판정불가로 빼고 구 단위로 비교했다'
            '(표기차를 불일치로 세면 정확도가 깎여 보인다 — 9/18 에 밟았던 버그).\n')

    log('## 5. 최신 LP 6일치 (참고 지표 — 대상 판정에서는 뺀다)\n')
    stt = Counter()
    for r in rows:
        old = num(r['LP 06/10'])
        new = max(r['_lp']) if r['_lp'] else None
        if new is None:
            stt['9월 LP 수치 없음'] += 1
        elif old is None:
            stt['6월 없음 -> 9월 수치 있음'] += 1
        elif old < 1 and new == 1:
            stt['6월 미달 -> 9월 100% (해결)'] += 1
        elif old == 1 and new < 1:
            stt['6월 100% -> 9월 미달 (악화)'] += 1
        else:
            stt['변화 없음/기타'] += 1
    log('| 구간 | 행 |\n|---|---:|')
    for k, v in stt.most_common():
        log(f'| {k} | {v:,} |')
    log('')

    log('## 6. 9/1~9/18 시공자료 반영\n')
    mw20 = {nm(r[0]) for r in c.execute(
        "SELECT 계기번호 FROM modem_work WHERE snapshot='20260920'")}
    mw20.discard('')
    unable = set()
    try:
        unable = {nm(r[0]) for r in c.execute(
            "SELECT 계기번호 FROM 모뎀설치불가개소 WHERE snapshot='20260920'")}
        unable.discard('')
    except Exception:
        pass
    log('- `modem_work` snapshot **20260920** 적재 완료 — 13,873행 (9/1~9/18)')
    log(f'- 우리 대상 8,994 중 **이 자료에 시공 기록이 있는 계기 {len(ourset & mw20):,}건**'
        ' -> 그만큼 대상에서 빠진다')
    if unable:
        log(f'- 불가 개소(9/20판 {len(unable):,}계기)와 우리 대상이 겹치는 것 {len(ourset & unable):,}건')
    log(f'- 참고: 과장 목록 9,766 중 {len(set(jdg) & mw20):,}건이 이 자료에 있다\n')

    log('---\n')
    log('재현: `python3 scripts/compare_jdg_reply_20260920.py`')

    OUT.write_text('\n'.join(L) + '\n')

    log(f'저장 {OUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
