#!/usr/bin/env python3
"""awms FMPMTR 로 주소 결손분 주소 회수 (PM 발주 2026-09-18)

★조회 전용이다. saveRow/saveAct 등 쓰기 API 는 절대 호출하지 않는다.

── 두 가지 실측이 이 스크립트의 설계를 정한다 ──────────────────────────────────
① `searchVal` 은 **철거계기(교체 전, WHM_NO)** 로 검색된다.
   신설계기(WHM_NO10)를 넣으면 0건이다. 우리가 가진 미청구 계기번호는 우리가 모뎀을 단
   시점의 계기이고, 그 뒤 계기교체가 있었다면 그 행의 **철거계기**로 남는다. 그래서 우리
   계기번호로 찾으면 그 개소의 현재 신설계기와 주소가 같이 나온다 —
   영준님이 말한 '바뀐 신설계기로 찾는다'의 실제 경로다.

② **건별 searchVal 조회는 쓰지 마라.** 한 건에 8초씩 걸려 1,631건이면 2.6시간이다
   (세션 절대만료가 3.5시간인데 이것만으로 다 쓴다). 반면 **지사 통째 조회는 전 기간
   14,534행을 13.5초**에 준다. 그래서 지사 7개를 통째로 받아 **로컬 색인**으로 조인한다.
   7회 호출 · 약 2분이면 끝난다.

주소 필드 = WRK_PLCE_ADDR_CTT (도로명(지번,동호수) 혼합 표기)
고객번호   = CNTR_NO  ← 우리 고객번호와 대조해 매칭이 맞는지 검증하는 데 쓴다

★fmpMtr1000 에는 **모뎀 MAC 이 없다.** 그래서 MAC 으로는 이 화면을 조회할 수 없다.
  재사용 복귀 355건(계기가 딴 개소로 가 있는 건)은 계기번호 매칭이 틀릴 수 있으므로
  고객번호 일치 여부로 갈라 신뢰등급을 따로 찍는다.
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKEN = Path.home() / '.awms-tokens' / 'fmpmtr.json'
BASE = 'https://awms.kdn.com/ami/fmp/mtr/fmpMtr1000/selectList'
OUT = ROOT / 'research/미청구_awms주소회수_20260918.json'
RAW = ROOT / 'data/inbox_hapdong/awms-fmpmtr-full-20260918.json'
WAIT = ROOT / 'research/미청구_대상_주소대기_20260918.json'
REUSE = ROOT / 'research/미청구_재사용제외_20260918.json'

# fetch_awms.py 와 같은 지사표(dept1=3970 서울지역본부)
DEPTS = [('3400', '노원도봉'), ('3100', '광진성동'), ('4080', '강북성북'),
         ('7793', '서울본부직할'), ('3600', '마포용산'), ('3000', '동대문중랑'),
         ('3500', '서대문은평')]
SPAN = ('202401010000', '202612312359')

HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://awms.kdn.com/html/main/index.html?app=FMPMTR&menu=01010000',
    'User-Agent': ('Mozilla/5.0 (Linux; Android 16; SM-A336N) AppleWebKit/537.36 '
                   '(KHTML, like Gecko) Chrome/150 Mobile Safari/537.36'),
}


def norm_meter(v):
    import re
    s = re.sub(r'[\s\-]', '', str(v if v is not None else '')).strip()
    if not s or s.upper() in ('NAN', 'NONE', '#N/A', '0'):
        return ''
    return s.upper() if re.search(r'[A-Za-z]', s) else s.zfill(11)


def norm_cust(v):
    import re
    s = re.sub(r'\D', '', str(v if v is not None else ''))
    return s.zfill(10) if s and s.strip('0') else ''


def query(sid, dept2, timeout=240):
    p = {'dept1': '3970', 'dept2': dept2, 'wrkCl': '', 'lvHvCl': '', 'wrkYn': '',
         'wrkStep': '', 'loginBupeId': '', 'workStrDate': SPAN[0], 'workEndDate': SPAN[1],
         'searchVal': '', 'pPageNo': '1', 'pRowCount': '100000', 'sortKey': '', 'matchYn': 'N'}
    req = urllib.request.Request(BASE + '?' + urllib.parse.urlencode(p),
                                 headers={**HEADERS, 'Cookie': f'JSESSIONID={sid}'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode('utf-8', 'ignore')
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise RuntimeError(f'JSON 아님 — 세션 만료 의심: {body[:160]}')


def collect(sid):
    rows = []
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(query, sid, cd): nm for cd, nm in DEPTS}
        for f in as_completed(futs):
            nm = futs[f]
            got = f.result()
            for x in got:
                x['__deptNm'] = nm
            rows += got
            print(f'  {nm:8s} {len(got):6,}행', flush=True)
    print(f'수집 {len(rows):,}행 · {time.time()-t0:.0f}s', flush=True)
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_text(json.dumps({'수집': '2026-09-18', '범위': SPAN, 'total': len(rows),
                               'rows': rows}, ensure_ascii=False))
    print(f'원본 저장 {RAW}', flush=True)
    return rows


def load_targets():
    out = []
    for r in json.loads(WAIT.read_text()):
        out.append({'계기번호': r['계기번호'], 'MAC': r['MAC'], '고객번호': r['고객번호'],
                    '지사': r['지사'], '구분': r.get('구분', ''),
                    '최종시공일': r.get('최종시공일', ''), '출처목록': 'await_addr'})
    seen = {r['계기번호'] for r in out}
    if REUSE.exists():
        for r in json.loads(REUSE.read_text())['목록']:
            if r['계기번호'] not in seen:
                out.append({'계기번호': r['계기번호'], 'MAC': r['MAC'],
                            '고객번호': r['고객번호'], '지사': r['지사'],
                            '구분': r.get('구분', ''),
                            '최종시공일': r.get('최종시공일', ''), '출처목록': '재사용복귀'})
    return out


def main():
    sid = json.loads(TOKEN.read_text())['JSESSIONID']
    if '--reuse-raw' in sys.argv and RAW.exists():
        print(f'기존 원본 재사용 {RAW}')
        rows = json.loads(RAW.read_text())['rows']
    else:
        print('=== awms FMPMTR 지사 통째 수집 (조회 전용) ===', flush=True)
        rows = collect(sid)

    # ── 색인: 철거계기(WHM_NO) -> 행. 같은 계기가 여러 번이면 최신 작업일을 쓴다 ──
    idx = {}
    for x in rows:
        k = norm_meter(x.get('WHM_NO'))
        if not k:
            continue
        cur = idx.get(k)
        if not cur or str(x.get('WORK_DATE') or '') > str(cur.get('WORK_DATE') or ''):
            idx[k] = x
    idx_new = {}
    for x in rows:
        k = norm_meter(x.get('WHM_NO10'))
        if k and k not in idx_new:
            idx_new[k] = x
    print(f'색인: 철거계기 {len(idx):,} · 신설계기 {len(idx_new):,}')

    targets = load_targets()
    print(f'대상 {len(targets):,}건')

    st = Counter()
    results = []
    for t in targets:
        m = norm_meter(t['계기번호'])
        x = idx.get(m)
        how = '철거계기(WHM_NO)'
        if not x:
            x = idx_new.get(m)
            how = '신설계기(WHM_NO10)'
        if not x:
            st['미조회'] += 1
            results.append({**t, '결과': '없음'})
            continue
        addr = str(x.get('WRK_PLCE_ADDR_CTT') or '').strip()
        awms_cust = norm_cust(x.get('CNTR_NO'))
        # ★고객번호가 양쪽에 있는데 다르면 다른 개소다 — 주소를 믿지 않는다
        if t['고객번호'] and awms_cust:
            cust_ok = (t['고객번호'] == awms_cust)
        else:
            cust_ok = None
        # ── 등급 판정 ────────────────────────────────────────────────────────
        # ★철거계기(WHM_NO) 매칭이 **우리 개소**다. 우리 계기가 그 개소에서 뽑혀 나간
        #   기록이므로 주소는 우리가 모뎀을 단 바로 그 자리다. 재사용 계기일수록 오히려
        #   이 매칭이 정확하다(계기가 딴 데로 간 것은 그 **뒤** 이야기다).
        # ★신설계기(WHM_NO10) 매칭은 양쪽 다 될 수 있다 —
        #   그 계기가 **25년에 우리 개소에 설치된 기록**이면 맞고(우리 시공일 언저리),
        #   **26년에 재사용으로 남의 개소에 설치된 기록**이면 틀리다(우리 시공일보다 뒤).
        #   그래서 작업일로 가른다.
        import re as _re
        def _d(v):
            return _re.sub(r'\D', '', str(v or ''))[:8]
        ours_day = _d(t.get('최종시공일'))
        awms_day = _d(x.get('WORK_DATE'))
        if not addr:
            st['조회됐으나 주소 없음'] += 1
            grade = ''
        elif cust_ok is False:
            grade = 'C_awms(고객번호 불일치 — 다른 개소)'
        elif cust_ok is True:
            grade = 'A_awms(고객번호 일치)'
        elif how == '철거계기(WHM_NO)':
            grade = 'B_awms(철거계기 매칭 — 우리 개소)'
        elif awms_day and ours_day and awms_day <= ours_day:
            grade = 'B_awms(신설계기·우리 시공일 이전)'
        else:
            grade = 'C_awms(신설계기·우리 시공일 이후 — 재사용 후 개소 의심)'
        st[grade or '주소없음'] += 1
        results.append({
            **t, '결과': '적중', '매칭방식': how, '신뢰등급': grade,
            'awms_주소': addr,
            'awms_신설계기': str(x.get('WHM_NO10') or '').strip(),
            'awms_철거계기': str(x.get('WHM_NO') or '').strip(),
            'awms_고객번호': awms_cust, '고객번호_일치': cust_ok,
            'awms_작업일': str(x.get('WORK_DATE') or '').strip(),
            'awms_공사번호': str(x.get('CONS_NO') or '').strip(),
            'awms_업체': str(x.get('BUPE_NM') or '').strip(),
            'awms_WORK_STEP': str(x.get('WORK_STEP') or '').strip(),
            'awms_SEQNO': str(x.get('CONS_TGT_SEQNO') or '').strip(),
            'awms_지사': x.get('__deptNm', ''),
        })

    ok = [r for r in results if r['결과'] == '적중' and r.get('awms_주소')]
    usable = [r for r in ok if r['신뢰등급'].startswith(('A_', 'B_'))]
    print('\n=== 결과 ===')
    for k, v in st.most_common():
        print(f'  {k:42s} {v:6,}')
    print(f'\n대상 {len(targets):,} · 주소확보 {len(ok):,} · 그중 쓸 수 있는 등급 {len(usable):,}')

    OUT.write_text(json.dumps({
        '생성': '2026-09-18',
        '출처': 'awms FMPMTR fmpMtr1000/selectList (조회 전용, 지사 통째 수집 후 로컬 조인)',
        '조회키': 'searchVal 아님 — 지사 전량 수집 후 WHM_NO(철거계기)로 로컬 색인',
        '원본': str(RAW),
        '대상': len(targets), '주소확보': len(ok), '쓸수있음': len(usable),
        '통계': dict(st), '목록': results,
    }, ensure_ascii=False, indent=1))
    print(f'저장 {OUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
