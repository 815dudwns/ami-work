"""주소 -> 좌표 캐스케이드 (카카오 -> 네이버). 좌표 추출 스크립트 공용 모듈.

영준님 지시 2026-08-10: **주소 오류나면 -> 번지(지번)로 -> 그래도 안되면 네이버로.**

순서
  1) 카카오 주소검색 — 도로명
  2) 카카오 주소검색 — 지번(원본)
  3) 카카오 주소검색 — 지번 정규화 (동명과 번지가 붙은 표기 교정. '당산동5가'의 '가'는 보존)
  4) 카카오 주소검색 — 번지 본번만 (323-1 -> 323)
  5) 카카오 키워드검색 (도로명 -> 지번)
  6) 네이버 NCP 지오코딩 — 카카오에 없는 지번을 상당수 갖고 있다
  7) 전부 실패하면 동 중심 (approximate). **행은 절대 버리지 않는다.**

★네이버는 못 찾으면 이웃 지번을 돌려준다(예: 성산동 471 요청 -> 467-2 응답).
  그래서 응답 지번의 (동, 본번)이 요청과 같을 때만 exact 로 인정하고, 다르면 좌표는 쓰되
  approximate 로 남긴다 — 동 중심보다는 정확하지만 그 지번은 아니기 때문이다.

★동 추출 정규식 주의. 예전 `(.*?[동읍면])` 는 "서울특별시 **동**대문구 신설동"의 첫 '동'에
  걸려 검색어가 "서울특별시 동"이 되고, 카카오가 영등포구 좌표를 준다(2026-08-10 실측 3건 오배치).
  토큰 단위로 법정동을 찾아야 한다.

키: `_env.require_env('KAKAO_REST_API_KEY')` / `get_env('NAVER_GEOCODE_ID'|'NAVER_GEOCODE_SECRET')`

사용:
    from geocode_cascade import resolve
    hit = resolve(jibun='서울특별시 마포구 아현동 85-17', road='')
    # hit.accuracy ('exact'|'approximate'|'fail') / .address / .lat / .lng / .method
"""

import re
import time
from collections import namedtuple

import requests

from _env import require_env, get_env

KAKAO_ADDRESS_URL = 'https://dapi.kakao.com/v2/local/search/address.json'
KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json'
NAVER_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode'

Hit = namedtuple('Hit', 'accuracy address lat lng method')

_kakao = requests.Session()
_kakao.headers.update({'Authorization': f'KakaoAK {require_env("KAKAO_REST_API_KEY")}'})

_NAVER_ID = get_env('NAVER_GEOCODE_ID')
_NAVER_SECRET = get_env('NAVER_GEOCODE_SECRET')
_naver = requests.Session()
if _NAVER_ID and _NAVER_SECRET:
    # 헤더 이름 소문자 그대로. Key ID 만 보내면 401 (둘 다 필수)
    _naver.headers.update({
        'x-ncp-apigw-api-key-id': _NAVER_ID,
        'x-ncp-apigw-api-key': _NAVER_SECRET,
    })


# ---------------- 주소 손질 ----------------

def trim_addr(addr):
    """공백 정리 + 괄호 이후 절단."""
    if not addr:
        return ''
    a = re.sub(r'\s+', ' ', str(addr)).strip()
    return re.split(r'[(]', a)[0].strip()


def normalize_jibun(addr):
    """동명과 번지가 붙은 표기를 띄운다. '당산동5가' 처럼 '가'가 이어지면 건드리지 않는다.

    '동대문구 제기동122' -> '동대문구 제기동 122'
    '영등포구 당산동5가 323-1' -> 그대로
    """
    a = trim_addr(addr)
    return re.sub(r'([가-힣]+(?:동|읍|면))(\d+)(?!\s*가)', r'\1 \2', a)


def _dong_token_index(parts):
    """법정동/읍/면 토큰의 위치. '동대문구' 같은 구 이름에 걸리지 않게 토큰 단위로 본다."""
    for i, p in enumerate(parts):
        if i == 0:
            continue                      # 시/도
        if p.endswith(('시', '군', '구')):
            continue
        if re.search(r'(동|읍|면)\d*가?$', p):
            return i
    return -1


def extract_dong(addr):
    """'서울특별시 동대문구 제기동122' -> '서울특별시 동대문구 제기동' (동 중심 검색용)."""
    parts = trim_addr(addr).split()
    i = _dong_token_index(parts)
    if i < 0:
        return None
    tok = parts[i]
    if not tok.endswith('가'):
        tok = re.sub(r'\d+$', '', tok)    # '제기동122' -> '제기동'
    return ' '.join(parts[:i] + [tok])


def _parent_beonji(addr):
    """'당산동5가 323-1' -> '당산동5가 323'. 부번이 없으면 None."""
    a = normalize_jibun(addr)
    m = re.search(r'(\d+)-(\d+)\s*$', a)
    if not m:
        return None
    return a[:m.start()] + m.group(1)


def _jibun_key(addr):
    """지번 비교 키 (법정동, 본번). 네이버 근접응답을 걸러내는 데 쓴다."""
    parts = normalize_jibun(addr).split()
    i = _dong_token_index(parts)
    if i < 0:
        return None
    dong = parts[i]
    for p in parts[i + 1:]:
        m = re.match(r'^(\d+)(?:-\d+)?$', p)
        if m:
            return (dong, m.group(1))
    return (dong, None)


# ---------------- 조회 ----------------

def _kakao_get(url, params, retries=4):
    for attempt in range(retries):
        try:
            r = _kakao.get(url, params=params, timeout=15)
            if r.status_code == 429:                 # 쿼터 — 재시도 없으면 조용히 '못 찾음'이 된다
                time.sleep(0.5 * (attempt + 1))
                continue
            if r.status_code == 200:
                return r.json().get('documents', [])
            time.sleep(0.3)
        except Exception:
            time.sleep(0.3)
    return []


def kakao_address(query):
    if not query:
        return None
    for d in _kakao_get(KAKAO_ADDRESS_URL, {'query': query})[:1]:
        road = (d.get('road_address') or {}).get('address_name', '')
        jibun = (d.get('address') or {}).get('address_name', '')
        return (road or jibun or query), jibun, float(d['y']), float(d['x'])
    return None


def kakao_keyword(query):
    if not query:
        return None
    for d in _kakao_get(KAKAO_KEYWORD_URL, {'query': query, 'size': 1})[:1]:
        return (d.get('road_address_name') or d.get('address_name') or query,
                d.get('address_name') or '', float(d['y']), float(d['x']))
    return None


def naver_address(query):
    if not (query and _NAVER_ID and _NAVER_SECRET):
        return None
    for attempt in range(3):
        try:
            r = _naver.get(NAVER_URL, params={'query': query}, timeout=15)
            if r.status_code == 429:
                time.sleep(0.5 * (attempt + 1))
                continue
            if r.status_code != 200:
                return None
            for a in r.json().get('addresses', [])[:1]:
                jibun = a.get('jibunAddress') or ''
                road = a.get('roadAddress') or ''
                return (road or jibun or query), jibun, float(a['y']), float(a['x'])
            return None
        except Exception:
            time.sleep(0.3)
    return None


# ---------------- 캐스케이드 ----------------

def resolve(jibun='', road=''):
    """주소 -> Hit. 실패해도 fail 로 돌려준다 (호출부에서 행을 버리지 말 것)."""
    jibun = trim_addr(jibun)
    road = trim_addr(road)
    norm = normalize_jibun(jibun)

    # 요청한 지번을 그대로 조회해서 잡히면 exact
    steps = [
        ('kakao_road', kakao_address, road),
        ('kakao_jibun', kakao_address, jibun),
        ('kakao_jibun_norm', kakao_address, norm if norm != jibun else ''),
        ('kakao_keyword_road', kakao_keyword, road),
        ('kakao_keyword_jibun', kakao_keyword, norm),
    ]
    for method, fn, q in steps:
        if not q:
            continue
        got = fn(q)
        if got:
            return Hit('exact', got[0], got[2], got[3], method)

    # 네이버 — 카카오에 없는 지번을 갖고 있다. 단 근접응답 판별이 필요하다.
    # ★본번 검색(_parent_beonji)보다 반드시 먼저. 부번을 버리고 찾은 값보다
    #   네이버가 그 지번을 그대로 찾아주는 쪽이 정확하다(효창동 3-251 실측).
    got = naver_address(norm or road)
    if got:
        want = _jibun_key(jibun)
        have = _jibun_key(got[1] or got[0])
        exact = bool(want and have and want == have)
        return Hit('exact' if exact else 'approximate', got[0], got[2], got[3],
                   'naver' if exact else 'naver_nearby')

    # 부번을 버린 본번 검색 — 요청한 지번이 아니므로 approximate
    parent = _parent_beonji(jibun)
    if parent:
        got = kakao_address(parent) or kakao_keyword(parent)
        if got:
            return Hit('approximate', got[0], got[2], got[3], 'kakao_jibun_parent')

    dong = extract_dong(jibun) or extract_dong(road)
    if dong:
        got = kakao_address(dong) or kakao_keyword(dong) or naver_address(dong)
        if got:
            return Hit('approximate', got[0], got[2], got[3], 'dong_center')

    return Hit('fail', road or jibun, None, None, 'none')
