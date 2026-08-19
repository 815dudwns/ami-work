#!/usr/bin/env python3
"""합동시공 데이터셋 빌더 — awms 원본(inbox_hapdong/hapdong_raw_YYYYMMDD.json) -> data/hapdong-data.json

배경(영준님 2026-08-19)
  awms FMPMTR(계기관리 WEB) > 계기현황 > 연간대상 실효계기 목록에서 **다른 지역 계기팀의
  계기교체 완료건**을 뽑아 온다. 합동시공(계기+통신 동시)을 하지 않는 조의 지역은 계기만
  갈리고 모뎀이 안 붙으므로, 그 개소를 우리 통신팀이 다음날 따로 가야 한다.
  그날치를 매일 이 파일에 **덧붙여** 지도에 올린다.

★유니크 키 = CONS_TGT_SEQNO (awms 시공대상 순번)
  '계기번호+작업일'은 못 쓴다 — 실측 2026-08-19분 232건 중 부설계기(WHM_NO10)가 빈 행이
  2건, WORK_DATE 가 빈 행이 1건이라 키가 231개로 뭉개진다. CONS_TGT_SEQNO 는 232/232 고유.

★없는 값은 채우지 않는다
  변대주·DCUID·통신방식·dcu_철거예정은 원본에 아예 없다. 이름 유사매칭 같은 유추로 채우면
  안 된다(2026-08-12 DCUID 유사매칭으로 864건 오염 전례). apply_dcu_status.py 도 돌리지 않는다.

사용:
    python3 scripts/build_hapdong_data.py                 # inbox 의 raw 전부 병합
    python3 scripts/build_hapdong_data.py data/inbox_hapdong/hapdong_raw_20260819.json
"""

import json
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from geocode_cascade import resolve as geo_resolve, _dong_token_index

ROOT = Path(__file__).resolve().parent.parent
INBOX = ROOT / 'data' / 'inbox_hapdong'
OUT = ROOT / 'data' / 'hapdong-data.json'
GEO_CACHE = INBOX / 'geocode-cache.json'
WORKERS = 8

# 계기번호 3~4자리(0-base [2:4]) -> 계기타입. CLAUDE.md 데이터규칙.
#   ★엑셀/원본 값 믿지 말고 계기번호로 직접 파싱한다.
#   매핑에 없는 코드는 빈값(영준님 지시) — 아는 척하지 않는다.
METER_TYPE_MAP = {
    '17': 'E',
    '19': 'AE타입',
    '25': 'G타입', '26': 'G타입', '27': 'G타입',
    '45': 'G타입', '46': 'G타입', '47': 'G타입',
    '53': '보안계기', '55': '보안계기',
}

LV_HV = {'1': '저압', '2': '고압'}


# ─── 정규화 ────────────────────────────────────────────────────────────────

def norm_meter(v):
    """계기번호: 공백 제거 + 숫자면 zfill(11). 하이픈 금지."""
    s = str(v if v is not None else '').strip().replace('-', '')
    if not s:
        return ''
    return s.zfill(11) if s.isdigit() else s


def parse_meter_type(meter_no):
    if len(meter_no) < 4:
        return ''
    return METER_TYPE_MAP.get(meter_no[2:4], '')


def clean_addr(raw):
    """끝의 \\r\\n 과 중복 공백 정리."""
    a = str(raw if raw is not None else '').replace('\r', ' ').replace('\n', ' ')
    return re.sub(r'\s+', ' ', a).strip()


# 법정동 토큰. '창동'·'장위동'·'명륜3가'·'보문동6가'·'동소문동4가' 를 다 잡아야 한다.
#   ★geocode_cascade._dong_token_index 는 못 쓴다 — '동/읍/면' 을 요구해서 awms 표기인
#     '명륜3가'(=명륜동3가)를 놓치고 주소 전체를 검색어로 만든다(실측 종로 다수).
DONG_RE = re.compile(r'^[가-힣][가-힣0-9]*(?:동|가|읍|면)\d*$')
# 번지 토큰: '676-32' / '178번지'
BEONJI_RE = re.compile(r'^(\d+(?:-\d+)?)(?:번지)?$')
# 도로명 토큰: '도봉로110바길' / '노해로62길' / '삼양로'
ROADNAME_RE = re.compile(r'(로|길)$')


def is_road_address(a):
    """'서울 성북구 장위로17길 16-7' 처럼 '로/길 + 번호' 가 든 값만 도로명으로 인정."""
    tp = str(a or '').split()
    return any(ROADNAME_RE.search(p) and i + 1 < len(tp) and BEONJI_RE.match(tp[i + 1])
               for i, p in enumerate(tp))


def _dong_beonji(tokens):
    """토큰열에서 (동, 번지)를 뽑는다. 못 찾으면 (동, None) 또는 (None, None)."""
    for i, p in enumerate(tokens):
        if ROADNAME_RE.search(p) or not DONG_RE.match(p):
            continue
        for q in tokens[i + 1:]:
            mm = BEONJI_RE.match(q)
            if mm:
                return p, mm.group(1)
        return p, None
    return None, None


def split_addr(addr):
    """주소 원문 -> (도로명, 지번) 지오코딩용 질의쌍.

    awms 주소는 두 형태로 온다.
      A) '서울특별시 도봉구 도봉로110바길 4(창동 676-32,1층좌)'
         괄호 앞 = 도로명, 괄호 안 첫 칸(쉼표 전) = 지번
      B) '서울특별시 성북구 장위동 230-135 3층'
         도로명 없음. 법정동 + 번지까지가 지번, 뒤는 층/호 상세

    ★괄호가 있다고 A형이 아니다 — '보문동6가 67번지 1층1호(방두개)' 처럼 괄호가 단순 메모인
      행이 있다. 괄호 안이 '동 번지' 꼴일 때만 지번으로 인정하고, 아니면 B형으로 되돌린다.
    """
    if not addr:
        return '', ''

    parts = addr.split()
    # 시도 + 시/군/구 접두 (전 행이 '서울특별시 OO구' 로 시작한다). 지번 질의에 붙여
    #   '창동 676-32' 가 전국구 검색이 되는 것을 막는다.
    pre_end = 0
    for i, p in enumerate(parts[:3]):
        if i > 0 and p.endswith(('시', '군', '구')):
            pre_end = i
    pre = ' '.join(parts[:pre_end + 1]) if pre_end else ''

    head = addr.split('(')[0].strip()

    # 도로명 — '...로/길' 다음이 숫자인 지점까지
    road = ''
    hp = head.split()
    for i, p in enumerate(hp):
        if ROADNAME_RE.search(p) and i + 1 < len(hp) and BEONJI_RE.match(hp[i + 1]):
            road = ' '.join(hp[:i + 2])
            break

    # 지번 — 괄호 안(있으면) 우선, 그다음 괄호 앞 본문
    cands = []
    m = re.search(r'\(([^)]*)\)?$', addr) or re.search(r'\(([^)]*)\)', addr)
    if m:
        cands.append(m.group(1).split(',')[0].strip())
    cands.append(head)

    for c in cands:
        if not c:
            continue
        dong, beonji = _dong_beonji(c.split())
        if not dong:
            continue
        if beonji is None:
            # 번지를 못 찾으면 동까지 (동 중심 폴백). 괄호 안이면 다음 후보를 먼저 본다.
            if c is cands[-1]:
                return road, f'{pre} {dong}'.strip()
            continue
        return road, f'{pre} {dong} {beonji}'.strip()

    return road, (head if not road else '')


# ─── 지오코딩 ──────────────────────────────────────────────────────────────

def load_geo_cache():
    if GEO_CACHE.exists():
        try:
            return json.loads(GEO_CACHE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {}


def geocode_all(pairs, cache):
    """[(jibun, road)] -> {키: [accuracy, address, lat, lng, method]}. 캐시 재사용."""
    todo = [p for p in pairs if f'{p[0]} {p[1]}' not in cache]
    if not todo:
        return cache
    print(f'지오코딩 대상 {len(todo):,}건 (캐시 재사용 {len(pairs) - len(todo):,}건)', flush=True)

    counter = {'done': 0, 'exact': 0, 'approx': 0, 'fail': 0}
    lock = threading.Lock()

    def work(p):
        hit = geo_resolve(jibun=p[0], road=p[1])
        return p, hit

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(work, p) for p in todo]
        for fut in as_completed(futures):
            p, hit = fut.result()
            cache[f'{p[0]} {p[1]}'] = [hit.accuracy, hit.address, hit.lat, hit.lng, hit.method]
            with lock:
                counter['done'] += 1
                counter['exact' if hit.accuracy == 'exact'
                        else 'approx' if hit.accuracy == 'approximate' else 'fail'] += 1
                if counter['done'] % 25 == 0 or counter['done'] == len(todo):
                    print(f"  [{counter['done']}/{len(todo)}] exact={counter['exact']} "
                          f"approx={counter['approx']} fail={counter['fail']}", flush=True)
    return cache


# ─── 변환 ──────────────────────────────────────────────────────────────────

def to_record(r, batch_day):
    """awms 원본 행 -> 아미맵 레코드. 좌표는 뒤에서 채운다."""
    dept = (r.get('__deptNm') or '').strip()
    # 서울본부직할은 그 자체가 정식 명칭이라 '지사'를 붙이지 않는다(js/map.js JISA_TO_GU).
    jisa = dept if (not dept or dept.endswith('직할') or dept.endswith('지사')) else dept + '지사'

    addr = clean_addr(r.get('WRK_PLCE_ADDR_CTT'))
    road, _ = split_addr(addr)

    meter = norm_meter(r.get('WHM_NO10'))        # 부설계기 = 교체 후 현재 계기
    meter_prev = norm_meter(r.get('WHM_NO'))     # 철거계기

    wd = (r.get('WORK_DATE') or '').strip()
    # WORK_DATE 가 빈 행이 있다(2026-08-19분 1건). 날짜 트리에 빈 노드가 생기지 않게
    #   배치 일자로 떨어뜨린다. 원본 문자열(작업일시)은 빈 채로 남겨 구분 가능하게 둔다.
    work_day = wd[:10].replace('-', '') if len(wd) >= 10 else str(batch_day)

    pwr = r.get('CNTR_PWR')
    return {
        '지사': jisa,
        '주소': addr,
        '도로명주소': road,
        '계기번호': meter,
        '계기타입': parse_meter_type(meter),
        '계기번호_전': meter_prev,
        '고객번호': str(r.get('CNTR_NO') or '').strip(),
        # ─ 원본에 없는 값. 유추 금지(2026-08-12 DCUID 유사매칭 864건 오염 전례) ─
        '통신방식': '',
        '공동주택명': '',
        '상호': '',
        '검기만료년월': '',
        '계기타입_전': '',
        '인입주': '',
        '변대주': '',
        'DCUID': '',
        '모뎀MAC': '',
        'dcu_철거예정': '',
        'DCU장애여부': '',
        # ─ 좌표(뒤에서 채움) ─
        'lat': None,
        'lng': None,
        '좌표정확도': '',
        # ─ 합동시공 전용 ─
        '교체사유': '합동시공',
        '작업일': work_day,
        '작업일시': wd,
        '업체': (r.get('BUPE_NM') or '').strip(),
        '공사번호': str(r.get('CONS_NO') or '').strip(),
        '저압고압': LV_HV.get(str(r.get('DIST_LV_HV_CLCD') or '').strip(), ''),
        '계약종별': str(r.get('CNTR_CLAS_CD') or '').strip(),
        '계약전력': '' if pwr in (None, '') else str(pwr),
        '작업자': (r.get('USER_NM') or '').strip(),
        'CONS_TGT_SEQNO': r.get('CONS_TGT_SEQNO'),
    }


def main():
    args = sys.argv[1:]
    if args:
        raws = [Path(a) for a in args]
    else:
        raws = sorted(INBOX.glob('hapdong_raw_*.json'))
    if not raws:
        print('원본 없음 — data/inbox_hapdong/hapdong_raw_*.json', file=sys.stderr)
        sys.exit(1)

    # 1) 원본 -> 레코드
    recs = []
    for p in raws:
        blob = json.loads(p.read_text(encoding='utf-8'))
        day = blob.get('day') or re.search(r'(\d{8})', p.name).group(1)
        rows = blob.get('rows') or []
        print(f'{p.name}: {len(rows)}건 (day={day})', flush=True)
        recs += [to_record(r, day) for r in rows]

    # 2) 지오코딩 — 같은 (지번, 도로명) 은 한 번만
    cache = load_geo_cache()
    pairs = set()
    for e in recs:
        road, jibun = split_addr(e['주소'])
        if road or jibun:
            pairs.add((jibun, road))
    cache = geocode_all(sorted(pairs), cache)
    GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')

    stat = {'exact': 0, 'approximate': 0, 'fail': 0, 'no_addr': 0}
    for e in recs:
        road, jibun = split_addr(e['주소'])
        if not (road or jibun):
            e['좌표정확도'] = 'fail'
            stat['no_addr'] += 1
            continue
        acc, got_addr, lat, lng, _method = cache[f'{jibun} {road}']
        e['lat'] = lat
        e['lng'] = lng
        e['좌표정확도'] = acc if acc else 'fail'
        # 도로명이 원본에 없는 형태(B형)면 지오코딩이 돌려준 도로명을 채운다.
        #   조건 둘: exact 로 잡힌 것만(approximate 는 이웃 지번이라 남의 도로명이 붙는다),
        #   그리고 응답이 **정말 도로명일 때만**. 카카오는 도로명이 없는 지번엔 지번을 그대로
        #   돌려주는데(보문동1가 178), 그걸 도로명 칸에 넣으면 디테일 헤더가 원본과 다른
        #   지번을 보여준다(109 -> 109-3 실측). 유추한 주소를 얹지 않는다.
        if not e['도로명주소'] and acc == 'exact' and got_addr and is_road_address(got_addr):
            e['도로명주소'] = got_addr
        stat[acc if acc in stat else 'fail'] += 1

    # 3) 기존 파일과 병합 — 유니크 키 = CONS_TGT_SEQNO
    existing = []
    if OUT.exists():
        existing = json.loads(OUT.read_text(encoding='utf-8'))
    by_key = {}
    order = []
    for e in existing + recs:
        k = e.get('CONS_TGT_SEQNO')
        k = str(k) if k is not None else f"{e.get('계기번호')}|{e.get('작업일')}"
        if k not in by_key:
            order.append(k)
        by_key[k] = e
    merged = [by_key[k] for k in order]
    # 작업일 내림차순(최신 먼저) + 지사/주소로 안정 정렬
    merged.sort(key=lambda e: (e.get('작업일') or '', ), reverse=True)

    OUT.write_text(json.dumps(merged, ensure_ascii=False, indent=1), encoding='utf-8')

    import collections
    print()
    print(f'저장: {OUT} — 총 {len(merged):,}건 (신규/갱신 {len(recs):,})')
    print(f"좌표: exact={stat['exact']} approximate={stat['approximate']} "
          f"fail={stat['fail']} 주소없음={stat['no_addr']}")
    print('지사별:', dict(collections.Counter(e['지사'] for e in merged)))
    print('작업일별:', dict(collections.Counter(e['작업일'] for e in merged)))
    print('계기타입별:', dict(collections.Counter(e['계기타입'] or '(빈값)' for e in merged)))


if __name__ == '__main__':
    main()
