#!/usr/bin/env python3
"""Gate: does each row's coordinate sit in the 구 its 주소 says? (2026-11-07)

영준님 "08530322400 이 왜 이화여대로 찍힘?" — 마포구 현석동 90 을 카카오 키워드검색이 서대문구 대현동 90-53 으로
돌려줬고 exact 로 저장됐다. geocode_cascade 는 이제 구·동이 다른 응답을 버리지만, 이미 만든 리스트와
앞으로의 빌드에도 같은 검사를 건다.

    python3 scripts/check_geo_gu.py <list.json> [...]            # 글자 검사 (API 호출 0)
    python3 scripts/check_geo_gu.py --reverse <list.json> [...]   # + 좌표 역지오코딩(카카오, 캐시)
    python3 scripts/check_geo_gu.py --all [--reverse]             # 레지스트리의 지도 리스트 전부

글자 검사: 주소의 구 vs 도로명주소·지번주소의 구(지오코딩 응답을 담은 칸). 다르면 실패.
역지오코딩: 좌표 -> 법정 구(카카오 coord2regioncode). 주소의 구와 다르면 실패.
  캐시 data/reference/geo_region_cache.json (좌표 6자리 반올림 키) — 같은 좌표는 한 번만 묻는다.
구가 없는 주소(광명시 등)는 '…시' 로 비교한다. 주소에서 구를 못 읽으면 검사하지 않고 건수만 센다.
실패가 하나라도 있으면 exit 1 — 빌더는 산출물을 내지 마라.
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))


def _area_of(addr):
    """geocode_cascade._area_of 와 같다 — 여기서는 API 키 없이 쓰려고 따로 둔다(validate_bdju 가 부른다)."""
    a = re.split(r'[(]', re.sub(r'\s+', ' ', str(addr or '')).strip())[0].strip()
    parts = a.split()
    for p in parts[1:]:
        if p.endswith('구'):
            return p
    for p in parts[1:]:
        if p.endswith(('시', '군')):
            return p
    return None


def text_mismatches(rows):
    """글자 검사만 — 주소의 구 vs 도로명주소·지번주소의 구. [(계기번호, 주소, 이유)]"""
    out = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        qa = _area_of(r.get('주소'))
        if not qa:
            continue
        for k in ('도로명주소', '지번주소'):
            a2 = _area_of(r.get(k))
            if a2 and a2 != qa:
                out.append((r.get('계기번호'), r.get('주소'), f'{k} {r.get(k)}'))
                break
    return out

REGION_CACHE = ROOT / 'data/reference/geo_region_cache.json'
REGION_URL = 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json'


def rows_of(path):
    arr = json.loads(Path(path).read_text(encoding='utf-8'))
    if not isinstance(arr, list):
        arr = next((v for v in arr.values() if isinstance(v, list)), [])
    return [r for r in arr if isinstance(r, dict)]


def area(addr):
    a = str(addr or '').strip()
    return _area_of(a) if a else None


def reverse_areas(coords):
    """{(lat,lng)} -> {key: 구}. 캐시 우선, 나머지만 묻는다."""
    import geocode_cascade as G
    from concurrent.futures import ThreadPoolExecutor
    cache = json.loads(REGION_CACHE.read_text(encoding='utf-8')) if REGION_CACHE.exists() else {}
    keys = {f'{la:.6f},{ln:.6f}' for la, ln in coords}
    left = [k for k in keys if k not in cache]

    import time

    def ask(k):
        la, ln = k.split(',')
        last = None
        for attempt in range(8):
            try:
                r = G._kakao.get(REGION_URL, params={'x': ln, 'y': la}, timeout=15)
            except Exception as e:      # network — back off and retry
                last = repr(e)
                time.sleep(0.5 * (attempt + 1))
                continue
            last = r.status_code
            if r.status_code == 200:
                for d in r.json().get('documents', []):
                    if d.get('region_type') == 'B':
                        return k, d.get('region_2depth_name') or ''
                return k, ''
            if r.status_code in (401, 403):
                raise RuntimeError(f'kakao {r.status_code} {r.text[:200]}')
            time.sleep(0.5 * (attempt + 1))   # 429 등 — 물러섰다 다시
        raise RuntimeError(f'kakao reverse keeps failing on {k} ({last})')

    def save():
        REGION_CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding='utf-8')

    if left:
        try:
            with ThreadPoolExecutor(4) as ex:
                for i, (k, v) in enumerate(ex.map(ask, left), 1):
                    cache[k] = v
                    if i % 5000 == 0:
                        save()
        finally:
            save()          # 중간에 멈춰도 받은 만큼은 남긴다(다시 돌리면 이어서)
    return cache, len(left)


def last_tok(v):
    # coord2regioncode region_2depth_name 은 '마포구' · '광명시' · '성남시 분당구' 꼴 — 끝 토큰이 구
    return (v or '').split()[-1] if v else ''


def check(paths, reverse=False):
    bad = []
    stat = Counter()
    all_rows = []
    for p in paths:
        for r in rows_of(p):
            all_rows.append((p, r))
    rev = {}
    if reverse:
        coords = {(r['lat'], r['lng']) for _, r in all_rows
                  if isinstance(r.get('lat'), (int, float)) and isinstance(r.get('lng'), (int, float))}
        rev, asked = reverse_areas(coords)
        stat['역지오코딩 새로 물음'] = asked
    for p, r in all_rows:
        qa = area(r.get('주소'))
        if not qa:
            stat['주소에 구 없음(검사 안 함)'] += 1
            continue
        why = []
        for k in ('도로명주소', '지번주소'):
            a2 = area(r.get(k))
            if a2 and a2 != qa:
                why.append(f'{k} {r.get(k)}')
        if reverse and isinstance(r.get('lat'), (int, float)):
            g = last_tok(rev.get(f"{r['lat']:.6f},{r['lng']:.6f}"))
            if g and g != qa and not (qa.endswith('시') and qa in rev.get(f"{r['lat']:.6f},{r['lng']:.6f}", '')):
                why.append(f'좌표 구 {g}')
        stat['검사'] += 1
        if why:
            bad.append((Path(p).name, r.get('계기번호'), r.get('주소'), r.get('좌표정확도'), why))
    return bad, stat


def main():
    args = sys.argv[1:]
    reverse = '--reverse' in args
    paths = [a for a in args if not a.startswith('--')]
    if '--all' in args:
        from datasets import MAP_DATASETS
        paths += [str(ROOT / d['file']) for d in MAP_DATASETS if (ROOT / d['file']).exists()]
    bad, stat = check(paths, reverse)
    print(f'구 일치 검사: {dict(stat)} · 불일치 {len(bad)}')
    for b in bad[:60]:
        print('  ', b)
    if bad:
        print('★게이트 실패 — 주소의 구와 좌표·응답 주소의 구가 다르다. 산출물을 내지 마라.')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
