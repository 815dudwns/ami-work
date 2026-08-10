#!/usr/bin/env python3
"""데이터셋의 approximate/fail 좌표를 캐스케이드로 재보정한다 (재사용 도구).

    python3 scripts/refix_approx_coords.py data/gapap-data.json
    python3 scripts/refix_approx_coords.py --dry-run data/gapap-data.json

동작 (scripts/geocode_cascade.resolve — 카카오 도로명/지번/정규화지번/본번/키워드 -> 네이버):
  - exact 로 잡히면 lat/lng/도로명주소 갱신 + 좌표정확도='exact'
  - 네이버가 **이웃 지번**을 준 경우엔 좌표만 갱신하고 approximate 로 남긴다.
    동 중심보다 정확하지만 요청한 지번은 아니므로 exact 로 올리지 않는다.
  - 끝까지 실패하면 기존 동 중심 좌표를 그대로 둔다. **행은 절대 삭제하지 않는다.**

기존 `도로명주소` 는 넘기지 않는다 — approximate 행의 그 값은 동 중심 검색 결과("서울 노원구 월계동")라
도로명이 아니고, 그대로 재조회하면 또 동 중심으로 떨어진다.
"""
import json
import sys
import collections
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geocode_cascade import resolve


def refix(records, verbose=True):
    stat = collections.Counter()
    targets = [r for r in records if r.get('좌표정확도') != 'exact' or r.get('lat') is None]
    if verbose:
        print(f'대상(비-exact): {len(targets)}건')

    for r in targets:
        before = (r.get('lat'), r.get('lng'))
        hit = resolve(jibun=r.get('주소') or '')
        if hit.lat is None:
            stat['실패(동중심 유지)'] += 1
            if verbose:
                print(f'  [FAIL] {r.get("주소")} — 동 중심 유지')
            continue

        r['lat'], r['lng'] = hit.lat, hit.lng
        r['도로명주소'] = hit.address
        r['좌표정확도'] = hit.accuracy
        stat[f'{hit.accuracy}({hit.method})'] += 1
        if verbose:
            mark = 'OK ' if hit.accuracy == 'exact' else '근접'
            print(f'  [{mark}:{hit.method}] {r.get("주소")} -> {hit.address} '
                  f'({before[0]},{before[1]}) => ({hit.lat},{hit.lng})')
    return stat


def main(argv):
    dry = '--dry-run' in argv
    targets = [a for a in argv if not a.startswith('--')]
    if not targets:
        print(__doc__)
        return 1

    for t in targets:
        p = Path(t)
        data = json.loads(p.read_text(encoding='utf-8'))
        recs = data if isinstance(data, list) else (data.get('data') or [])
        n_before = len(recs)

        print(f'\n=== {p.name} (총 {n_before:,}) ===')
        stat = refix(recs)

        if len(recs) != n_before:
            print(f'!! 건수 변동 {n_before} -> {len(recs)} — 저장 중단', file=sys.stderr)
            return 1

        print('\n  ' + ' / '.join(f'{k}={v}' for k, v in stat.most_common()))
        acc = collections.Counter(r.get('좌표정확도') for r in recs)
        print(f'  최종 좌표정확도: {dict(acc)}  (총 {len(recs):,}건)')

        if not dry:
            p.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            print(f'  저장: {p}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
