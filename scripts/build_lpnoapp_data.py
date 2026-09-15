#!/usr/bin/env python3
"""LP 무기록 리스트 빌더 — data/ami.db(boranggi) -> data/lpnoapp-data.json

무엇인가 (영준님 지시 2026-09-15)
  보강현황 엑셀에서 **한전이 숨긴 행**(visible='0' = 우리 대상에서 뺀 것) 중,
  awms 26년시공앱·불가앱에 **우리 기록이 전혀 없는데 LP 는 올라온** 개소다.
  ★2026-09-15 2차: 서대문구만 보던 것을 **전 지사로 확대**했다("일단 전지사 확대해서 보여줘봐").
    구 조건 한 줄만 뺐고 나머지 조건은 1차와 같다. 파일·카테고리도 1차 그대로 쓴다.
  누가 어떻게 붙였는지 확인하려고 만드는 **확인용 임시 리스트**이고,
  실적 분모가 아니다 — 통계에 넣지 않는다. 지도에도 **admin(우영준)만** 보인다.

★대상 조건은 PM 이 확정했다. 아래 SQL 을 임의로 고치지 마라.
  출처 = 9/8판 스냅샷(snapshot='20260908', 원본 `data/inbox_jdg_20260909/계기교체 보강현황_20260908081440.xlsx`)

★SMGW-C 도 포함한다(영준님 2026-09-15 정정). PM 초안은 "무선 자동수집이라 정상"
  ([[smgwc_wireless_pickup]])을 근거로 뺐으나 영준님이 포함으로 정하셨다. **거르지 마라.**
  통신방식은 레코드에 실려 있으니 지도에서 구분만 하면 된다.
  = 쿼리 결과 전부가 대상이고 추가 필터는 없다.

★시공 소요일 0(교체 당일 LP)은 **빼지 않는다.** 기설 모뎀 유지로 설명될 후보지만
  그 판정이 이번 확인의 목적이다. 대신 `소요일` 을 레코드에 실어 지도에서 구분되게 한다.

사용:
    python3 scripts/build_lpnoapp_data.py
    python3 scripts/build_lpnoapp_data.py --no-geocode   # 좌표 재사용만(질의 안 함)
"""

import collections
import json
import os
import re
import sqlite3
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from geocode_cascade import resolve as geo_resolve   # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / 'data' / 'ami.db'
OUT = ROOT / 'data' / 'lpnoapp-data.json'
GEO_CACHE = ROOT / 'data' / 'inbox_hapdong' / 'geocode-cache.json'   # 합동과 같은 캐시를 쓴다
WORKERS = 8

SNAPSHOT = '20260908'

SQL = """
SELECT * FROM boranggi
WHERE snapshot=?
  AND visible='0'
  AND ("26년시공앱" IS NULL OR "26년시공앱" IN ('','#N/A'))
  AND ("26년불가앱" IS NULL OR "26년불가앱" IN ('','#N/A'))
  AND "최초LP 수신일(C)" IS NOT NULL AND "최초LP 수신일(C)" NOT IN ('','#N/A')
  AND substr("계기교체일(A)",1,10) >= '2026-06-08'
"""


def txt(v) -> str:
    if v is None:
        return ''
    s = str(v).strip()
    return '' if s.lower() in ('nan', 'nat', 'none', '#n/a') else s


def norm_meter(v) -> str:
    """계기번호 정규화 — build_site_data_from_boranggi.norm_meter 와 같은 규칙.

    ★접두 문자를 지우지 마라(2026-09-10 사고). 영문자가 섞이면 그대로 두고,
      순수 숫자일 때만 zfill(11) 한다([[meter_no_prefix_preserve]]).
    """
    s = re.sub(r'[\s\-]', '', str(v or '')).strip()
    if not s or s.lower() in ('nan', 'none'):
        return ''
    if re.search(r'[A-Za-z]', s):
        return s.upper()
    return s.zfill(11)


def meter_type(meter_no: str) -> str:
    """계기타입은 엑셀을 믿지 않고 계기번호 3~4번째 자리로 판정한다(CLAUDE.md 데이터규칙).

    ★19 는 'AE' 로 적는다. **판정은 계기번호로 하되 표기는 원본을 따른다** —
      보강현황 `계기타입_2` 열이 'AE타입' 이고 합동 빌더도 'AE타입' 이다
      (build_site_data_from_boranggi 는 'EA' 로 적는데 같은 타입의 다른 표기다).
      2,126건 전수 대조에서 파싱과 원본 열이 **전건 일치**했다 —
      Amigo↔보안계기 1,924 · AE↔AE타입 146 · G↔G타입 56.
      마커 뱃지(js/map.js lpTypeLabel)가 이 값을 그대로 찍으므로 표기가 곧 화면이다.
    """
    c = meter_no[2:4]
    if c == '17':
        return 'E'
    if c == '19':
        return 'AE'
    if c in ('25', '26', '27', '45', '46', '47'):
        return 'G'
    if c in ('53', '55'):
        return 'Amigo'
    return ''


# ─── DCU 대장 ──────────────────────────────────────────────────────────────
# 대장 = `data/reference/간선망_해지_정지대상.xlsx` 시트 '전체DCU 현황' 의 DB 미러(dcu_all, 19,007행).
#   ★여기서는 **부가 필드만** 붙인다(인입주는 보강현황, 회선상태·매칭근거는 대장).
#     DCUID·통신방식 본값 교정은 `scripts/fix_amimap_dcu_by_rule.py` 가 한다 — 룰의 정본이라
#     두 곳에서 따로 판정하면 어긋난다. 이 빌더는 **한전값을 그대로 두고** 넘긴다.
#   ★동명이인 변대주명이 12개 있다. 이름이 유일할 때만 매칭 근거로 인정한다
#     (유사매칭 금지 — 2026-08-12 에 864건 오염된 사고가 있다).
def load_dcu_ledger(con):
    """대장 -> (DCU ID 색인, 유일한 변대주명 색인, 동명이인 이름 집합)."""
    rows = con.execute(
        'SELECT "DCU ID" AS dcu_id, 변대주명, 회선상태, "인입망 통신방식" AS comm FROM dcu_all'
    ).fetchall()
    by_id, by_name, dup = {}, {}, set()
    for r in rows:
        d = dict(r)
        did, nm = txt(d.get('dcu_id')), txt(d.get('변대주명'))
        if did:
            by_id.setdefault(did, d)
        if nm:
            if nm in by_name:
                dup.add(nm)
            else:
                by_name[nm] = d
    for nm in dup:
        by_name.pop(nm, None)          # 동명이인은 근거로 못 쓴다
    return by_id, by_name, dup


def gu_of(addr: str) -> str:
    """지번주소에서 '○○구' 를 뽑는다. 못 찾으면 빈값(버리지 않는다)."""
    m = re.search(r'(\S+구)(\s|$)', str(addr or ''))
    return m.group(1) if m else ''


def ymd(v) -> str:
    s = txt(v)
    if not s:
        return ''
    m = re.match(r'(\d{4})[-./]?(\d{2})[-./]?(\d{2})', s)
    return f'{m.group(1)}-{m.group(2)}-{m.group(3)}' if m else s[:10]


def days(v) -> str:
    """소요일 — 숫자면 정수 문자열로, 아니면 빈값."""
    s = txt(v)
    if not s:
        return ''
    try:
        return str(int(float(s)))
    except ValueError:
        return ''


# ─── 지오코딩 ──────────────────────────────────────────────────────────────

def load_geo_cache():
    if GEO_CACHE.exists():
        try:
            return json.loads(GEO_CACHE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {}


CACHE_LEN = 7   # [accuracy, address, lat, lng, method, road, jibun] — 합동 빌더와 같은 형식


def geocode_all(pairs, cache, enabled=True):
    def stale(k):
        v = cache.get(k)
        return not isinstance(v, list) or len(v) < CACHE_LEN

    todo = [p for p in pairs if stale(f'{p[0]} {p[1]}')]
    if not enabled:
        print(f'지오코딩 건너뜀(--no-geocode) — 캐시 미보유 {len(todo):,}건은 좌표 없음', flush=True)
        return cache
    if not todo:
        print(f'지오코딩: 전부 캐시 재사용({len(pairs):,}건)', flush=True)
        return cache
    print(f'지오코딩 대상 {len(todo):,}건 (캐시 재사용 {len(pairs) - len(todo):,}건)', flush=True)

    counter = {'done': 0, 'exact': 0, 'approx': 0, 'fail': 0}
    lock = threading.Lock()

    def work(p):
        return p, geo_resolve(jibun=p[0], road=p[1])

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for fut in as_completed([ex.submit(work, p) for p in todo]):
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


def main():
    no_geo = '--no-geocode' in sys.argv

    if not DB.exists():
        sys.exit(f'{DB} 없음 — ami.db 는 main 워크트리에 있다(gitignore). 심볼릭 링크를 걸어라.')

    con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    raw = [dict(r) for r in con.execute(SQL, (SNAPSHOT,))]
    con.close()
    print(f'쿼리 결과 {len(raw)}건 (snapshot={SNAPSHOT})')

    # ★추가 필터 없음 — 쿼리 결과 전부가 대상이다(영준님 2026-09-15).
    rows = raw

    recs = []
    for r in rows:
        # ★보강현황은 계기 관련 열이 **쌍**으로 온다 — 접미사 없는 쪽이 철거계기(교체 전),
        #   `_2` 가 신설계기(교체 후, **지금 현장에 달려 LP 를 올리고 있는 것**)다.
        #   실측으로 확인: 접미사 없는 쪽은 전부 E타입 189·G 15(옛 계기)이고
        #   `_2` 는 보안계기 186·G 10·AE 8(신형)이다. 교체 사업이 E -> 신형으로 가는 것과 맞는다.
        #   ★지도에 실어야 하는 것은 **신설계기**다(영준님 지적 2026-09-15 — 처음에 철거계기를
        #     실었다). 기존 build_site_data_from_boranggi.py 도 두 번째 열을 쓴다.
        #   ★철거계기도 버리지 않는다 — `_전` 접미사로 함께 실어 대조·추적에 쓴다
        #     (합동 데이터셋과 같은 관례. js/detail.js 가 '이전통신'·'이전계기'로 그린다).
        meter = norm_meter(r.get('계기번호_2'))          # 신설 = 현재 계기
        meter_prev = norm_meter(r.get('계기번호'))        # 철거 = 교체 전 계기
        jibun = txt(r.get('지번'))
        road = txt(r.get('도로명'))
        recs.append({
            '지사': txt(r.get('지사')),
            # 구 — 1,038개소라 나중에 지사/구 필터가 필요해진다(발주서 2차 §3). 지번에서 뽑는다.
            '구': gu_of(jibun),
            # ★'주소' 는 상태키의 첫 칸이다. 지번을 주소로 쓴다(도로명은 따로 싣는다).
            '주소': jibun,
            '지번주소': jibun,
            '도로명주소': road,
            '공동주택명': txt(r.get('공동주택명')),
            '상호': txt(r.get('상호명')),
            '고객번호': txt(r.get('고객번호')),
            '계기번호': meter,
            '계기타입': meter_type(meter),
            '통신방식': txt(r.get('통신방식_2')),
            # ─ 교체 전(철거) 값 — 표시는 '이전…' 으로 나간다 ─
            '계기번호_전': meter_prev,
            '계기타입_전': meter_type(meter_prev),
            '통신방식_전': txt(r.get('통신방식')),
            '모뎀MAC': txt(r.get('모뎀 MAC_2')),
            '변대주': txt(r.get('변대주')),
            # 인입주 — 보강현황 원본 열. detail.js 가 변대주와 짝으로 그린다(없으면 반쪽만 나온다).
            '인입주': txt(r.get('인입주')),
            # 무엇을 근거로 DCU 를 붙였는지 남긴다 — 안 남기면 나중에 재검증이 안 된다.
            'DCU회선상태': '',
            'DCU매칭': '',
            'DCUID': txt(r.get('DCU ID_2')),
            'DCUID_전': txt(r.get('DCU ID')),
            'DCU장애여부': txt(r.get('DCU 장애여부')),
            '계기교체일': ymd(r.get('계기교체일(A)')),
            'LP수신일': ymd(r.get('최초LP 수신일(C)')),
            # ★교체 당일 LP(0)를 빼지 않는 대신 이 값을 실어 지도에서 구분한다(발주서 §2).
            '소요일': days(r.get('시공 소요일(C)-(A)')),
            'lat': None, 'lng': None, '좌표정확도': '',
        })

    # ─ DCU 대장 매칭(부가 필드만) ─
    con2 = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
    con2.row_factory = sqlite3.Row
    by_id, by_name, dup = load_dcu_ledger(con2)
    con2.close()
    mstat = collections.Counter()
    for e in recs:
        nm, did = e['변대주'], e['DCUID']
        hit, src = None, '없음'
        if nm and nm in dup:
            src = '동명이인'                      # 근거로 쓰지 않는다
        elif nm and nm in by_name:
            hit, src = by_name[nm], '변대주'
        elif did and did in by_id:
            hit, src = by_id[did], 'DCUID'
        e['DCU매칭'] = src
        e['DCU회선상태'] = txt(hit.get('회선상태')) if hit else ''
        mstat[src] += 1
    print('DCU 대장 매칭:', dict(mstat.most_common()))

    # ─ 좌표 ─ 도로명→지번→동중심 3단 폴백. ★실패해도 건을 버리지 않는다.
    cache = load_geo_cache()
    pairs = sorted({(e['지번주소'], e['도로명주소']) for e in recs if e['지번주소'] or e['도로명주소']})
    cache = geocode_all(pairs, cache, enabled=not no_geo)
    if not no_geo:
        GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')

    stat = collections.Counter()
    for e in recs:
        hit = cache.get(f"{e['지번주소']} {e['도로명주소']}")
        if not (isinstance(hit, list) and len(hit) >= CACHE_LEN):
            e['좌표정확도'] = 'fail'
            stat['fail'] += 1
            continue
        acc, _addr, lat, lng, _m, _road, _jb = hit
        e['lat'], e['lng'] = lat, lng
        e['좌표정확도'] = acc or 'fail'
        stat[e['좌표정확도']] += 1

    OUT.write_text(json.dumps(recs, ensure_ascii=False, indent=1), encoding='utf-8')

    print(f'\n저장: {OUT} — {len(recs):,}건')
    print(f'좌표: exact={stat["exact"]} approximate={stat["approximate"]} fail={stat["fail"]}'
          f' · 좌표 없는 건 {sum(1 for e in recs if e["lat"] is None)}')
    print('개소(지번 고유):', len({e['지번주소'] for e in recs}))
    print('지사별:', dict(sorted(collections.Counter(e['지사'] or '(빈)' for e in recs).items(),
                                key=lambda x: -x[1])))
    print('구 파싱 실패:', sum(1 for e in recs if not e['구']))
    print('월별:', dict(sorted(collections.Counter(e['계기교체일'][:7] for e in recs).items())))
    print('통신방식:', dict(sorted(collections.Counter(e['통신방식'] or '(빈)' for e in recs).items(),
                                key=lambda x: -x[1])))
    print('계기타입:', dict(sorted(collections.Counter(e['계기타입'] or '(빈)' for e in recs).items())))
    print('소요일 0(교체 당일 LP):', sum(1 for e in recs if e['소요일'] == '0'))
    print('계기번호에 영문 접두:', sum(1 for e in recs if re.search(r'[A-Za-z]', e['계기번호'])))
    print('계기타입(철거·교체전):', dict(sorted(collections.Counter(
        e['계기타입_전'] or '(빈)' for e in recs).items())))
    print('통신방식(철거·교체전):', dict(sorted(collections.Counter(
        e['통신방식_전'] or '(빈)' for e in recs).items(), key=lambda x: -x[1])))


if __name__ == '__main__':
    main()
