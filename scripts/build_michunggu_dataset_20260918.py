#!/usr/bin/env python3
"""25년 미청구 대상 8,994 -> 아미맵 데이터셋 (PM 발주 2026-09-18)

발주서: research/발주_미청구_리스트업_20260918.md

산출
  data/michunggu-data.json     주소 보유 7,366 — 지도용(좌표 있음)
  data/michunggu-pending.json  주소 결손 1,628 — 주 과장 회신 오면 승격

값 출처 = research/미청구_보강_보정_20260918.json (계기키 오염 무효화한 보정판)
  ★awms 회수분(917건)은 **쓰지 않는다** — 발주서가 보정판을 출처로 못박았고
    주소 보유 7,366 / 결손 1,628 도 awms 를 뺀 기준선 수치다.
    awms 를 얹으면 7,366 -> 8,283 이 되므로, 쓸지 말지는 PM 판단이다.

★변대주 필드는 **의미로** 매핑한다 [[bdju_field_meaning_flipped]] —
  아미맵의 `변대주` 는 **전주 이름**('서강간 5')이고 `DCUID` 가 ID 다.
  보정판의 `변대주명` -> `변대주`, `DCU_ID` -> `DCUID`.
  `변대주번호`(8자 코드)는 아미맵에 대응 칸이 없지만 **버리지 않고** 별도 칸으로 남긴다.
★계기번호는 원문 보존 [[meter_no_prefix_preserve]].
★좌표가 실패해도 레코드를 버리지 않는다 — 동 중심(approximate)으로 넣는다.
"""
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))

BOOST = ROOT / 'research/미청구_보강_보정_20260918.json'
PM_LIST = Path('/Users/woodelight/Projects/ami-work/research/미청구_최종대상_계기목록_20260918.txt')
OUT_MAP = ROOT / 'data/michunggu-data.json'
OUT_PEND = ROOT / 'data/michunggu-pending.json'

_s = importlib.util.spec_from_file_location(
    'bld', str(ROOT / 'scripts/build_michunggu_boost_20260918.py'))
B = importlib.util.module_from_spec(_s)
_s.loader.exec_module(B)
nm = B.norm_meter

# 합동 빌더의 좌표 파이프라인을 그대로 쓴다(같은 캐시를 공유해 재조회를 아낀다)
_h = importlib.util.spec_from_file_location(
    'hap', str(ROOT / 'scripts/build_hapdong_data.py'))
H = importlib.util.module_from_spec(_h)
_h.loader.exec_module(H)


# ─── 주소 정리 ───────────────────────────────────────────────────────────────
# ★원장 주소에는 '우선_0611_' 같은 **작업 태그**가 앞에 붙어 온다. 주소의 일부가 아니다.
#   떼지 않으면 지오코더가 통째로 못 읽어 좌표가 실패한다(실측 9건 중 8건이 이것이었다).
#   뗀 값은 `주소` 에 넣고, 원문은 `주소_원문` 에 남겨 버리지 않는다.
TAG_RE = re.compile(r'^[가-힣]*_?\d{3,}_\s*')


def clean_addr(a):
    return TAG_RE.sub('', str(a or '')).strip()


GU_RE = re.compile(r'(서울특별시\s*[가-힣]+구)')


def gu_of(a):
    m = GU_RE.search(str(a or ''))
    return m.group(1) if m else ''


def log(m):
    print(m, flush=True)


def main():
    pm = [nm(x) for x in PM_LIST.read_text().split() if nm(x)]
    boost = {nm(r['계기번호']): r for r in json.loads(BOOST.read_text())}
    log(f'PM 목록 {len(pm):,} · 고유 {len(set(pm)):,}')

    tgt = []
    for m in pm:
        r = boost.get(m)
        if not r:
            log(f'★보정판에 없는 계기 {m} — 중단')
            return 1
        tgt.append(r)

    # 작업 태그를 떼고 원문을 따로 보관한다
    tagged = 0
    for r in tgt:
        for f in ('지번주소', '도로명주소'):
            c = clean_addr(r[f])
            if c != (r[f] or ''):
                r.setdefault('_원문', {})[f] = r[f]
                r[f] = c
                tagged += 1
    log(f'주소 작업태그 제거 {tagged:,}건')

    has = [r for r in tgt if r['지번주소'] or r['도로명주소']]
    pend = [r for r in tgt if not (r['지번주소'] or r['도로명주소'])]
    log(f'주소 보유 {len(has):,} · 결손 {len(pend):,}')

    # ── 좌표 ────────────────────────────────────────────────────────────────
    pairs = sorted({(r['지번주소'], r['도로명주소']) for r in has})
    log(f'좌표 대상 (지번,도로명) 쌍 {len(pairs):,}')
    cache = H.load_geo_cache()
    cache = H.geocode_all(pairs, cache)

    # ── 폴백: 그래도 실패한 주소는 **구 중심**으로 넣는다 ─────────────────────
    #   ★행을 버리지 않는다(발주서). 좌표정확도에 approximate 로 표시해 구분 가능하게 둔다.
    from geocode_cascade import resolve as geo_resolve
    gu_cache = {}
    fixed = 0
    for jib, road in pairs:
        k = f'{jib} {road}'
        v = cache.get(k)
        if v and v[2] and v[3]:
            continue
        gu = gu_of(jib) or gu_of(road)
        if not gu:
            continue
        if gu not in gu_cache:
            gu_cache[gu] = geo_resolve(jibun=gu, road='')
        hit = gu_cache[gu]
        if hit and hit.lat:
            cache[k] = ['approximate', gu, hit.lat, hit.lng, '구중심폴백', '', '']
            fixed += 1
    if fixed:
        log(f'구 중심 폴백 {fixed:,}건 (좌표정확도=approximate)')
    H.GEO_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding='utf-8')

    def rec(r, with_coord):
        out = {
            '지사': r['지사'],
            # ★'주소' 는 아미맵의 지번 칸이다(site-data 와 같은 계열)
            '주소': r['지번주소'],
            '도로명주소': r['도로명주소'],
            '계기번호': r['계기번호'],          # 원문 보존
            '계기타입': r['계기타입'],
            '고객번호': r['고객번호'],
            '통신방식': r['통신방식'],
            # ★의미로 매핑 — 변대주=전주 '이름', DCUID=ID
            '변대주': r['변대주명'],
            '변대주번호': r['변대주번호'],
            'DCUID': r['DCU_ID'],
            '모뎀MAC': r['MAC'],
            'dcu_철거예정': '',
            '주소_원문': (r.get('_원문') or {}).get('지번주소', ''),
            '신뢰등급': r['신뢰등급']['주소'],
            '주소출처': r['주소출처'],
            '변대주출처': r['변대주출처'],
            '최종시공일': r['최종시공일'],
            '구분': r['구분'],
            '공종': r['공종'],
        }
        if with_coord:
            key = f"{r['지번주소']} {r['도로명주소']}"
            v = cache.get(key)
            if v and v[2] and v[3]:
                out['lat'], out['lng'] = v[2], v[3]
                out['좌표정확도'] = v[0]
                if v[5]:
                    out['도로명주소'] = out['도로명주소'] or v[5]
                if v[6]:
                    out['주소'] = out['주소'] or v[6]
            else:
                # ★행을 버리지 않는다. 좌표만 비우고 표시한다(지도에서 걸러 보게)
                out['lat'] = out['lng'] = None
                out['좌표정확도'] = 'fail'
        return out

    map_rows = [rec(r, True) for r in has]
    pend_rows = [rec(r, False) for r in pend]

    acc = Counter(x['좌표정확도'] for x in map_rows)
    log(f'좌표: {dict(acc)}')

    OUT_MAP.write_text(json.dumps(map_rows, ensure_ascii=False, indent=1))
    OUT_PEND.write_text(json.dumps(pend_rows, ensure_ascii=False, indent=1))
    log(f'저장 {OUT_MAP}  {len(map_rows):,}건')
    log(f'저장 {OUT_PEND}  {len(pend_rows):,}건')

    # ── 검증 게이트 ─────────────────────────────────────────────────────────
    log('\n=== 검증 게이트 ===')
    src = set(pm)
    got = {nm(x['계기번호']) for x in map_rows} | {nm(x['계기번호']) for x in pend_rows}
    alpha_src = sum(1 for x in src if re.search(r'[A-Za-z]', x))
    alpha_out = sum(1 for x in map_rows + pend_rows
                    if re.search(r'[A-Za-z]', str(x['계기번호'])))
    dup = len(map_rows) + len(pend_rows) - len(got)
    nullc = sum(1 for x in map_rows if x['lat'] is None or x['lng'] is None)
    checks = [
        (f'지도 {len(map_rows):,} + 대기 {len(pend_rows):,} = {len(map_rows)+len(pend_rows):,}'
         f' (기대 {len(pm):,})', len(map_rows) + len(pend_rows) == len(pm)),
        (f'계기 차집합 — 목록에만 {len(src-got)} · 산출에만 {len(got-src)}', src == got),
        (f'영문자 접두 목록 {alpha_src} · 산출 {alpha_out}', alpha_src == alpha_out),
        (f'lat/lng null {nullc}건', nullc == 0),
        (f'중복 계기번호 {dup}건', dup == 0),
    ]
    ok = True
    for msg, good in checks:
        log(f'  [{"OK" if good else "실패"}] {msg}')
        ok &= good
    log('  판정: ' + ('OK' if ok else '★게이트 불통과'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
