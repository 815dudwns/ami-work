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
ARCHIVE = ROOT / 'data' / 'hapdong-data-archive.json'
GEO_CACHE = INBOX / 'geocode-cache.json'
WORKERS = 8

# ─── 보존 기간 ─────────────────────────────────────────────────────────────
# 지도에 남기는 기간(일). 이보다 오래된 작업일은 지도 데이터에서 빼고 백업으로 옮긴다.
#   영준님 지시 2026-08-24 "3일 지난 것은 백업하고 지도에서 안 보이게".
#   ★상수 한 줄만 고치면 기간이 바뀐다.
#   ★자동으로 돌지 않는다(영준님 정정 2026-08-24 "내가 업데이트 할 때 같이 해라. 빼는 것도").
#     스케줄러·자동 트리거 없이 **빌더를 돌릴 때만** 함께 처리된다. 그리고 기준일은 오늘이
#     아니라 **데이터의 최신 작업일**이다 — 새 수집분이 들어와야 경계가 움직인다.
#     오늘 날짜를 기준으로 삼으면 수집을 안 한 날에도 시간만 지나면 지도에서 사라진다.
#   ★workStatus(완료 기록)는 건드리지 않는다 — 데이터만 빼고 Firebase 상태는 그대로 둔다.
#     지우면 작업 이력이 사라지고, 같은 주소가 다시 들어올 때 빈 상태로 시작한다.
#   ★뺀 것은 버리지 않는다. 통계는 누적 실적이라 백업분까지 분모에 넣는다
#     (scripts/gen_stats_index.py 가 이 백업 파일도 읽는다).
RETAIN_DAYS = 3

# 종로 보강 원천 — 종로맵 대장. awms FMPMTR 응답에는 변대주·DCU 정보가 없지만
#   종로는 우리 데이터가 따로 있다(영준님 지시 2026-08-19).
JONGNO_SRC = ROOT / 'jongno-combined' / 'data' / 'jongno-site-data.json'

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
# 번지 토큰: '676-32' / '178번지' / '산2-13'
#   ★산번지의 '산' 은 **번지에 포함해서** 잡는다(2026-08-21 실측). 빼고 조회하면 '명륜3가 2-13'
#     이라는 **다른 필지**를 묻게 된다. 붙여 쓴 '산2-13' 을 번지로 못 읽으면 질의가 동까지만
#     내려가고, 카카오가 동 중심 좌표를 exact 로 돌려줘 마커가 엉뚱한 곳에 박힌다(3건 실증).
#     '방학동 산 69-31' 처럼 띄어 쓴 형태는 예전에도 통과했지만 그건 '산' 을 건너뛴 것이라
#     운이 좋았던 경우다 — 여기서 같이 정식으로 잡는다.
BEONJI_RE = re.compile(r'^((?:산\s*)?\d+(?:-\d+)?)(?:번지)?$')
# 도로명 토큰: '도봉로110바길' / '노해로62길' / '삼양로'
ROADNAME_RE = re.compile(r'(로|길)$')


def is_road_address(a):
    """'서울 성북구 장위로17길 16-7' 처럼 '로/길 + 번호' 가 든 값만 도로명으로 인정."""
    tp = str(a or '').split()
    return any(ROADNAME_RE.search(p) and i + 1 < len(tp) and BEONJI_RE.match(tp[i + 1])
               for i, p in enumerate(tp))


def _dong_beonji(tokens):
    """토큰열에서 (동, 번지)를 뽑는다. 못 찾으면 (동, None) 또는 (None, None).

    ★'산' 을 띄어 쓴 표기('방학동 산 69-31')도 번지에 붙여 읽는다 — _jibun_tail 과 **같은 규칙**
      이어야 한다. 한쪽만 고치면 질의는 '방학동 69-31'(산 빠짐)로 나가고 대조는 '산69-31' 로
      해서, 맞는 지번인데도 어긋난 것으로 판정해 비워 버린다(2026-08-21 실측 1건 회귀).
    """
    for i, p in enumerate(tokens):
        if ROADNAME_RE.search(p) or not DONG_RE.match(p):
            continue
        rest = tokens[i + 1:]
        for j, q in enumerate(rest):
            if q == '산' and j + 1 < len(rest):
                mm = BEONJI_RE.match(rest[j + 1])
                if mm:
                    return p, '산 ' + mm.group(1).replace(' ', '')
            mm = BEONJI_RE.match(q)
            if mm:
                return p, mm.group(1)
        return p, None
    return None, None


def _jibun_tail(addr):
    """지번 비교용 (법정동, 번지). 번지는 부번까지 그대로 — '109' 와 '109-3' 을 구별해야 한다.

    ★geocode_cascade._jibun_key 는 못 쓴다. 그쪽은 본번만 봐서 109 와 109-3 을 같다고 본다
      (좌표 판정에는 그게 맞지만, 지번주소 칸에 넣을 값의 검증에는 못 쓴다).
    """
    tokens = str(addr or '').split()
    for i, p in enumerate(tokens):
        if ROADNAME_RE.search(p) or not DONG_RE.match(p):
            continue
        rest = tokens[i + 1:]
        for j, q in enumerate(rest):
            # ★'산' 을 띄어 쓴 표기를 붙여 읽는다. awms 는 '산2-13', 카카오는 '산 2-13' 으로
            #   같은 필지를 다르게 쓴다(2026-08-21 실측). 표기 차이로 대조가 어긋나면
            #   맞는 지번인데도 비워 버린다.
            if q == '산' and j + 1 < len(rest):
                m = BEONJI_RE.match(rest[j + 1])
                if m:
                    return (p, '산' + m.group(1).replace(' ', ''))
            m = BEONJI_RE.match(q)
            if m:
                return (p, m.group(1).replace(' ', ''))
        return (p, None)
    return (None, None)


def _looks_like_jibun(text):
    """'창동 676-32' 처럼 법정동 + 번지 꼴인가. 괄호 안이 지번인지 판별하는 데 쓴다."""
    dong, beonji = _dong_beonji(str(text or '').split())
    return bool(dong and beonji)


def _tail_after_beonji(head):
    """괄호 앞 본문에서 '지번(또는 도로명 번호)' 뒤에 남는 문자열.

    '...보문동1가 274번지 202호' -> '202호'   (번지 뒤 잔여)
    '...창동 676-54 2층'         -> '2층'
    '...도봉로110바길 4'          -> ''       (도로명 번호가 끝)
    '...보문동1가 178번지'        -> ''       ('번지'는 번지 토큰에 붙어 있다)
    """
    tokens = str(head or '').split()
    anchor = -1
    for i, p in enumerate(tokens):
        # 도로명 + 번호
        if ROADNAME_RE.search(p) and i + 1 < len(tokens) and BEONJI_RE.match(tokens[i + 1]):
            anchor = max(anchor, i + 1)
        # 법정동 + 번지
        elif DONG_RE.match(p):
            for j in range(i + 1, len(tokens)):
                if BEONJI_RE.match(tokens[j]):
                    anchor = max(anchor, j)
                    break
    if anchor < 0:
        return ''
    return ' '.join(tokens[anchor + 1:]).strip()


def split_detail(addr):
    """주소 원문 -> 동호수. **지번·도로명은 여기서 만들지 않는다**(카카오 응답에서 받는다).

    괄호 안이 항상 지번이 아니다 — '(좌)' '(수석)' 처럼 지번이 아닌 메모가 섞여 있어서,
    규칙으로 쪼개 지번 칸에 넣으면 그대로 오염된다(영준님 지시 2026-08-19). 그래서 원문에서는
    카카오가 알 수 없는 **동호수만** 떼어 낸다.

    규칙 (원본 4형태를 모두 통과한다)
      괄호+콤마 있음  '...4(창동 676-32,1층좌)'          -> 첫 콤마 뒤 전부      '1층좌'
                      '...35-3(창동 657-117,1층1호 ,좌측대문)' -> '1층1호 ,좌측대문'
      괄호+콤마 없음  '...45(창동 657-55)'                -> 괄호 안이 지번이면 없음
                      '...119번지 (수석)'                 -> 지번이 아니면 그 내용  '수석'
      괄호 없음       '...창동 676-54 2층'                -> 번지 뒤 잔여          '2층'
                      '...보문동1가 178번지'              -> 없음
    괄호 앞 본문에 남는 것(예 '274번지 202호' 의 '202호')도 함께 붙인다.
    """
    a = str(addr or '')
    if not a.strip():
        return ''

    head = a.split('(')[0]
    m = re.search(r'\(([^)]*)\)?', a)
    inner = m.group(1) if m else ''

    if ',' in inner:
        paren_detail = inner.split(',', 1)[1].strip()
    elif inner.strip() and not _looks_like_jibun(inner):
        paren_detail = inner.strip()
    else:
        paren_detail = ''

    parts = [p for p in (_tail_after_beonji(head), paren_detail) if p]
    return ' '.join(parts).strip()


def split_addr(addr):
    """주소 원문 -> (도로명, 지번) **지오코딩 질의용** 쌍. 저장값이 아니다.

    ★2026-08-19: 저장되는 도로명주소·지번주소는 카카오 응답에서 받는다(영준님 지시).
      이 함수의 결과는 카카오에 무엇을 물어볼지 정하는 데만 쓴다.

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


# 캐시 한 칸의 길이. [accuracy, address, lat, lng, method, road, jibun]
#   ★2026-08-19 에 road·jibun 두 칸이 늘었다(도로명/지번을 갈라 저장). 짧은 옛 항목은
#     버리지 않고 **재조회해서 덮어쓴다** — 지우면 그 주소를 다시 못 찾을 때 손실이 된다.
CACHE_LEN = 7


def geocode_all(pairs, cache):
    """[(jibun, road)] -> {키: [accuracy, address, lat, lng, method, road, jibun]}. 캐시 재사용."""
    def stale(k):
        v = cache.get(k)
        return not isinstance(v, list) or len(v) < CACHE_LEN

    todo = [p for p in pairs if stale(f'{p[0]} {p[1]}')]
    if not todo:
        return cache
    old = sum(1 for p in pairs if f'{p[0]} {p[1]}' in cache and stale(f'{p[0]} {p[1]}'))
    print(f'지오코딩 대상 {len(todo):,}건 '
          f'(캐시 재사용 {len(pairs) - len(todo):,}건 / 옛 스키마 재조회 {old:,}건)', flush=True)

    counter = {'done': 0, 'exact': 0, 'approx': 0, 'fail': 0}
    lock = threading.Lock()

    def work(p):
        hit = geo_resolve(jibun=p[0], road=p[1])
        return p, hit

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(work, p) for p in todo]
        for fut in as_completed(futures):
            p, hit = fut.result()
            cache[f'{p[0]} {p[1]}'] = [hit.accuracy, hit.address, hit.lat, hit.lng,
                                       hit.method, hit.road, hit.jibun]
            with lock:
                counter['done'] += 1
                counter['exact' if hit.accuracy == 'exact'
                        else 'approx' if hit.accuracy == 'approximate' else 'fail'] += 1
                if counter['done'] % 25 == 0 or counter['done'] == len(todo):
                    print(f"  [{counter['done']}/{len(todo)}] exact={counter['exact']} "
                          f"approx={counter['approx']} fail={counter['fail']}", flush=True)
    return cache


# ─── 작업일 보정 ───────────────────────────────────────────────────────────
# awms WORK_DATE 는 **앱 작성 시각**이지 현장 시각이 아니다. 조들이 밤에 몰아 쓰면
#   다음날로 찍힌다(2026-08-21 종로 53건이 전부 22:16~22:43 이었다).
#   실제 작업일이 다른 것이 **확인된 배치만** 여기에 명시한다.
#   ★규칙이 아니라 목록이다. '밤 시간이면 전날'로 일반화하면 확인되지 않은 건까지 끌어다 옮긴다.
#   ※'작업일시' 원본은 손대지 않는다 — 왜 날짜가 다른지 나중에 추적할 수 있어야 한다.
WORK_DAY_OVERRIDES = [
    # 2026-08-21 수집분 서울본부직할(공사번호 끝 383 = 종로) 53건 -> 실제 작업일 8/20
    #   (영준님 확인). 같은 배치의 다른 지사 120건은 8/21 그대로다.
    {'batch': '20260821', '지사': '서울본부직할', '공사번호끝': '383', '작업일': '20260820'},
]


def override_work_day(batch_day, jisa, cons_no, work_day):
    for o in WORK_DAY_OVERRIDES:
        if (str(batch_day) == o['batch'] and jisa == o['지사']
                and str(cons_no or '').endswith(o['공사번호끝'])):
            return o['작업일']
    return work_day


# ─── 변환 ──────────────────────────────────────────────────────────────────

def to_record(r, batch_day):
    """awms 원본 행 -> 아미맵 레코드. 좌표는 뒤에서 채운다."""
    dept = (r.get('__deptNm') or '').strip()
    # 서울본부직할은 그 자체가 정식 명칭이라 '지사'를 붙이지 않는다(js/map.js JISA_TO_GU).
    jisa = dept if (not dept or dept.endswith('직할') or dept.endswith('지사')) else dept + '지사'

    addr = clean_addr(r.get('WRK_PLCE_ADDR_CTT'))

    meter = norm_meter(r.get('WHM_NO10'))        # 부설계기 = 교체 후 현재 계기
    meter_prev = norm_meter(r.get('WHM_NO'))     # 철거계기

    wd = (r.get('WORK_DATE') or '').strip()
    # WORK_DATE 가 빈 행이 있다(2026-08-19분 1건). 날짜 트리에 빈 노드가 생기지 않게
    #   배치 일자로 떨어뜨린다. 원본 문자열(작업일시)은 빈 채로 남겨 구분 가능하게 둔다.
    work_day = wd[:10].replace('-', '') if len(wd) >= 10 else str(batch_day)
    # 확인된 배치만 실제 작업일로 되돌린다(위 WORK_DAY_OVERRIDES). 작업일시는 원본 그대로 둔다.
    work_day = override_work_day(batch_day, jisa, r.get('CONS_NO'), work_day)

    pwr = r.get('CNTR_PWR')
    return {
        '지사': jisa,
        # ★'주소' 는 awms 원문 그대로 보존한다. 파싱을 나중에 고치려면 원문이 있어야 한다.
        '주소': addr,
        # 도로명주소·지번주소는 뒤에서 **카카오 응답**으로 채운다(원문 파싱 금지).
        '도로명주소': '',
        '지번주소': '',
        # 동호수만 원문에서 뗀다 — 카카오는 층·호를 모른다.
        '동호수': split_detail(addr),
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
        # 전산화번호 — 종로분만 enrich_jongno 가 채운다(표시엔 안 쓰이고 대조·복구용).
        '변대주전산화': '',
        '인입주전산화': '',
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


# ─── 종로 보강 ─────────────────────────────────────────────────────────────

# 좌표를 종로맵 값으로 바꿀 때, 이 거리 이상 벌어지면 **바꾸지 않고 보고한다**.
#   둘 다 exact 인데 수백 m 떨어져 있으면 어느 쪽이 맞는지 자동으로는 알 수 없다.
#   그때는 손대지 않는 쪽이 안전하다 — 틀린 좌표로 덮으면 작업자가 엉뚱한 데로 간다.
#   ※실측 2026-08-24: 종로 131건 중 128건이 10m 이내였고, 벌어진 3건은 전부
#     '명륜3가 산2-13' 이었다. 종로맵 쪽 주소에 '산' 이 빠져('2-13') 다른 필지로 잡힌 것이라
#     우리 좌표가 맞았다(역지오코딩 대조: 우리 좌표 -> '명륜3가 산 2-13', 종로맵 좌표 -> '명륜3가 2-13').
COORD_SWAP_MAX_M = 50


def _dist_m(lat1, lng1, lat2, lng2):
    """두 좌표 사이 거리(m). 하버사인."""
    import math
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def norm_id(v):
    """고객번호·계기번호 대조용 정규화 — 앞의 0 만 떼고 그대로 비교한다.
    합동(awms)은 10자리 zero-pad '0116163882', 종로맵은 9자리 '141611851' 로 온다."""
    return str(v if v is not None else '').strip().lstrip('0')


def _load_jongno_index():
    """종로맵 대장 -> {(고객번호, 계기번호): [행, ...]}. 키는 정규화된 값."""
    if not JONGNO_SRC.exists():
        print(f'경고: 종로 원천 없음 — {JONGNO_SRC} (보강 건너뜀)', file=sys.stderr)
        return {}
    rows = json.loads(JONGNO_SRC.read_text(encoding='utf-8'))
    idx = {}
    for r in rows:
        idx.setdefault((norm_id(r.get('고객번호')), norm_id(r.get('계기번호'))), []).append(r)
    return idx


def enrich_jongno(recs):
    """종로(서울본부직할 + 공사번호 끝 383)분에 변대주·인입주·DCUID·통신방식을 채운다.

    ★두 키(고객번호 + 철거계기번호)가 **모두** 같은 한 행에 맞을 때만 채운다.
      한쪽만 맞으면 채우지 않는다. 실측 2026-08-19분 78건은 전부 두 키가 맞아 손실이 없고,
      앞으로 누적될 때의 오매칭을 막는 방어선이다.
    ★정확일치만. 유사매칭·이름매칭 금지 — 2026-08-12 에 변대주 한글명 유사매칭으로 864건을
      오염시킨 전례가 있다(창신지 26 에 창신지 27 의 DCUID). 전주명은 연번이어도
      전산화번호는 연번이 아니다.
    ★매칭 실패하거나 원천에도 값이 없으면 **빈값을 유지한다**. 틀린 값보다 빈칸이 낫다.
    ★종로 외 지사(노원도봉·강북성북·광진성동)는 원본에 이 정보가 아예 없다. 손대지 않는다.

    ※필드 의미 주의 (2026-08-19 실측) — 두 데이터셋의 '변대주' 는 담는 값이 서로 다르다.
        아미맵(site-data): 변대주='연촌간 39L5'(전주명) · DCUID='9726G1525M'(전산화번호+2)
                           인입주='금문간 22L1L1'(전주명)
        종로맵          : 변대주='9926G874'(전산화번호) · 변대주라벨='안국로 R7-1'(전주명)
                           인입주전산화='9926G881'(전산화번호) · 인입주번호='안국로 R7-1'(전주명)
      그래서 이름이 같은 칸끼리 옮기면 전주명 자리에 전산화번호가 들어가 화면이 깨진다
      (js/detail.js 는 변대주를 전주명으로, DCUID 를 전산화번호로 그린다).
      **의미 기준으로 옮긴다** — 변대주<-변대주라벨, 인입주<-인입주번호.
      전산화번호도 버리지 않고 변대주전산화·인입주전산화 로 함께 싣는다(표시엔 안 쓰인다).
    """
    idx = _load_jongno_index()
    if not idx:
        return {'대상': 0, '채움': 0}

    stat = {'대상': 0, '채움': 0, '원천빈값': 0, '미매칭': 0, '규칙위반': 0, '모호': 0,
            '좌표교체': 0, '좌표보류': 0, '좌표없음': 0}
    problems = []

    for e in recs:
        if e.get('지사') != '서울본부직할' or not str(e.get('공사번호') or '').endswith('383'):
            continue
        stat['대상'] += 1

        hit = idx.get((norm_id(e.get('고객번호')), norm_id(e.get('계기번호_전'))))
        if not hit:
            stat['미매칭'] += 1
            continue

        # 같은 키에 원천 행이 여럿이고 값이 갈리면 무엇이 맞는지 알 수 없다 — 채우지 않는다.
        if len(hit) > 1:
            vals = {(str(x.get('변대주라벨') or ''), str(x.get('DCUID') or ''),
                     str(x.get('통신방식') or ''), str(x.get('인입주번호') or '')) for x in hit}
            if len(vals) > 1:
                stat['모호'] += 1
                problems.append(f"모호(원천 {len(hit)}행, 값 불일치): 고객 {e.get('고객번호')}")
                continue
        src = hit[0]

        # ★DCUID = 변대주 전산화번호 + 뒤 2자리. 어긋나면 둘 중 하나가 틀린 것이라 채우지 않는다.
        dcuid = str(src.get('DCUID') or '').strip()
        pole_no = str(src.get('변대주') or '').strip()
        if dcuid and pole_no and not (dcuid.startswith(pole_no) and len(dcuid) == len(pole_no) + 2):
            stat['규칙위반'] += 1
            problems.append(f"DCUID 규칙 위반: 고객 {e.get('고객번호')} 변대주 {pole_no} / DCUID {dcuid}")
            continue

        # ─ 좌표를 종로맵 값으로 교체 (영준님 지시 2026-08-24) ─
        #   종로 개소는 종로맵에 이미 좌표가 있다. 우리가 주소 문자열로 다시 뽑으면 파싱·응답
        #   편차가 생기니(산번지 건이 그 예다) 매칭된 값을 그대로 쓴다.
        #   ★매칭 실패하거나 원천에 좌표가 없으면 기존 좌표를 **유지**한다. 비우지 않는다.
        #   ★멀리 떨어진 건은 바꾸지 않고 보고한다 — 어느 쪽이 맞는지 자동으로는 못 가른다.
        slat, slng = src.get('lat'), src.get('lng')
        if slat is not None and slng is not None:
            if e.get('lat') is None or e.get('lng') is None:
                e['lat'], e['lng'] = slat, slng
                e['좌표정확도'] = src.get('좌표정확도') or e.get('좌표정확도') or ''
                stat['좌표교체'] += 1
            else:
                d = _dist_m(e['lat'], e['lng'], slat, slng)
                if d <= COORD_SWAP_MAX_M:
                    e['lat'], e['lng'] = slat, slng
                    e['좌표정확도'] = src.get('좌표정확도') or e.get('좌표정확도') or ''
                    stat['좌표교체'] += 1
                else:
                    stat['좌표보류'] += 1
                    problems.append(
                        f"좌표 {d:.0f}m 차이라 교체 보류(기존 유지): {e.get('주소')} "
                        f"| 우리 {e['lat']:.6f},{e['lng']:.6f} <-> 종로맵 {slat:.6f},{slng:.6f}")
        else:
            stat['좌표없음'] += 1

        # 원천에 있는 값만 덮어쓴다. 빈값으로 기존 값을 지우지 않는다.
        moved = {
            '변대주': src.get('변대주라벨'),
            '인입주': src.get('인입주번호'),
            'DCUID': dcuid,
            '통신방식': src.get('통신방식'),
            '변대주전산화': pole_no,
            '인입주전산화': src.get('인입주전산화'),
        }
        got = False
        for k, v in moved.items():
            v = str(v if v is not None else '').strip()
            if v:
                e[k] = v
                got = True
        if got:
            stat['채움'] += 1
        else:
            stat['원천빈값'] += 1

    if problems:
        print('  ★보강 보류 건:', flush=True)
        for p in problems[:20]:
            print('   -', p, flush=True)
    return stat


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

    stat = {'exact': 0, 'approximate': 0, 'fail': 0, 'no_addr': 0, '지번불일치': 0}
    for e in recs:
        road, jibun = split_addr(e['주소'])
        if not (road or jibun):
            e['좌표정확도'] = 'fail'
            stat['no_addr'] += 1
            continue
        acc, got_addr, lat, lng, _method, got_road, got_jibun = cache[f'{jibun} {road}']
        e['lat'] = lat
        e['lng'] = lng
        e['좌표정확도'] = acc if acc else 'fail'
        # ★도로명주소·지번주소는 카카오가 준 값 그대로 넣는다(영준님 지시 2026-08-19).
        #   원문 파싱으로 만들지 않는다 — 괄호 안이 지번이 아닌 행('(좌)' '(수석)')이 있어
        #   규칙으로 쪼개면 그 메모가 지번 칸에 들어간다.
        #   ★exact 일 때만 채운다. approximate 는 이웃 지번이나 동 중심이라 **그 주소가 아니다**.
        #     틀린 주소를 보여주느니 빈칸이 낫다(원문은 '주소' 에 그대로 남아 있다).
        #   ★도로명이 없는 옛 지번은 got_road 가 빈값으로 온다 — 그대로 빈값이 정상이다.
        #   ★응답 지번이 **물어본 지번과 같을 때만** 넣는다. 좌표 판정(exact)은 본번만 맞으면
        #     통과라, '보문동1가 109번지' 를 물었는데 109-3 이 돌아와도 exact 다(실측 1건).
        #     좌표로는 충분해도 지번주소 칸에 넣으면 남의 지번을 보여주게 된다.
        if acc == 'exact':
            if got_road and is_road_address(got_road):
                e['도로명주소'] = got_road
            #   ★번지 없이 동까지만 온 응답은 넣지 않는다. 그건 지번이 아니라 동 중심
            #     폴백이다(질의가 동까지만 내려간 경우 카카오가 그대로 exact 로 돌려준다).
            got_tail = _jibun_tail(got_jibun)
            if got_jibun and got_tail[1] and got_tail == _jibun_tail(jibun):
                e['지번주소'] = got_jibun
            elif got_jibun:
                stat['지번불일치'] += 1
        stat[acc if acc in stat else 'fail'] += 1

    # 3) 기존 파일과 병합 — 유니크 키 = CONS_TGT_SEQNO
    #    ★백업본도 함께 읽는다. 지도에서 뺀 건이라도 원본 raw 가 없어지면 되살릴 길이 없다.
    #      여기서 같이 들고 있어야 보존 기간을 늘렸을 때 그대로 돌아온다.
    existing = []
    for _src in (ARCHIVE, OUT):
        if _src.exists():
            existing += json.loads(_src.read_text(encoding='utf-8'))
    by_key = {}
    order = []
    for e in existing + recs:
        k = e.get('CONS_TGT_SEQNO')
        k = str(k) if k is not None else f"{e.get('계기번호')}|{e.get('작업일')}"
        if k not in by_key:
            order.append(k)
        else:
            # ★WORK_DATE 가 빈 행은 작업일을 배치 일자로 떨어뜨린다(to_record). 그런 건이
            #   다음 날 목록에 또 잡히면 날짜가 매일 그날로 끌려다닌다(실측: CONS_TGT_SEQNO
            #   2494072 가 8/19 -> 8/20 으로 이동). 원본에 작업일시가 없으면 **처음 본 날짜를
            #   유지한다** — 배치 일자는 추정이고, 먼저 본 쪽이 실제에 가깝다.
            prev_day = by_key[k].get('작업일')
            if prev_day and not str(e.get('작업일시') or '').strip():
                e['작업일'] = prev_day
        by_key[k] = e
    merged = [by_key[k] for k in order]
    # 작업일 내림차순(최신 먼저) + 지사/주소로 안정 정렬
    merged.sort(key=lambda e: (e.get('작업일') or '', ), reverse=True)

    # 4) 종로 보강 — ★병합 뒤 전체에 적용한다. 그날치에만 걸면 다음 실행에서 옛 건이
    #    다시 빈값이 되고, 원천이 갱신돼도 반영되지 않는다.
    print()
    ez = enrich_jongno(merged)
    print(f"종로 보강: 대상 {ez['대상']} / 채움 {ez['채움']} / 원천빈값 {ez.get('원천빈값', 0)}"
          f" / 미매칭 {ez.get('미매칭', 0)} / 규칙위반 {ez.get('규칙위반', 0)} / 모호 {ez.get('모호', 0)}")
    print(f"종로 좌표: 종로맵 값으로 교체 {ez.get('좌표교체', 0)}"
          f" / 멀어서 기존 유지 {ez.get('좌표보류', 0)} (기준 {COORD_SWAP_MAX_M}m)"
          f" / 원천에 좌표 없음 {ez.get('좌표없음', 0)}")

    # 5) 보존 기간 — 오래된 작업일은 지도 데이터에서 빼고 백업으로 옮긴다.
    #    기준일 = **데이터의 최신 작업일**. 오늘 날짜가 아니다 — 수집을 안 한 날에도
    #    시간만 지나면 지도에서 사라지는 것을 막는다(영준님 정정 2026-08-24).
    days = sorted({str(e.get('작업일') or '') for e in merged if str(e.get('작업일') or '').isdigit()})
    cutoff = ''
    if days:
        from datetime import datetime as _dt, timedelta as _td
        base = _dt.strptime(days[-1], '%Y%m%d').date()
        cutoff = (base - _td(days=RETAIN_DAYS - 1)).strftime('%Y%m%d')
    live = [e for e in merged if not cutoff or str(e.get('작업일') or '') >= cutoff]
    archived = [e for e in merged if cutoff and str(e.get('작업일') or '') < cutoff]

    OUT.write_text(json.dumps(live, ensure_ascii=False, indent=1), encoding='utf-8')
    if archived or ARCHIVE.exists():
        ARCHIVE.write_text(json.dumps(archived, ensure_ascii=False, indent=1), encoding='utf-8')

    import collections
    print()
    print(f'보존 {RETAIN_DAYS}일 — 지도에 남길 최소 작업일 {cutoff or "(전체)"}')
    print(f'  지도 {len(live):,}건 / 백업 {len(archived):,}건 -> {ARCHIVE.name}')
    if archived:
        print('  백업으로 뺀 작업일:', dict(collections.Counter(e['작업일'] for e in archived)))
    print(f'저장: {OUT} — 지도 {len(live):,}건 (병합 총 {len(merged):,} · 신규/갱신 {len(recs):,})')
    print(f"좌표: exact={stat['exact']} approximate={stat['approximate']} "
          f"fail={stat['fail']} 주소없음={stat['no_addr']} "
          f"· 응답지번이 물어본 지번과 달라 지번주소 비움={stat['지번불일치']}")
    # 주소 3분할 점검 — ★지번 칸에 '좌' '수석' 같은 비지번이 들어가는 것이 이 작업의 핵심 실패모드다.
    n_road = sum(1 for e in merged if str(e.get('도로명주소') or '').strip())
    n_jibun = sum(1 for e in merged if str(e.get('지번주소') or '').strip())
    n_detail = sum(1 for e in merged if str(e.get('동호수') or '').strip())
    bad = [e for e in merged if str(e.get('지번주소') or '').strip()
           and not _looks_like_jibun(e['지번주소'])]
    print(f'주소 3분할(백업 포함 전체): 도로명 {n_road} / 지번 {n_jibun} / 동호수 {n_detail} '
          f'(총 {len(merged)}) · 지번 칸 비지번 오염 {len(bad)}건')
    for e in bad[:10]:
        print(f"   ★비지번: {e.get('지번주소')!r} <- {e.get('주소')!r}")
    print('지도 지사별:', dict(collections.Counter(e['지사'] for e in live)))
    print('지도 작업일별:', dict(collections.Counter(e['작업일'] for e in live)))
    print('지도 계기타입별:', dict(collections.Counter(e['계기타입'] or '(빈값)' for e in live)))


if __name__ == '__main__':
    main()
