#!/usr/bin/env python3
"""Geocode the 미조치 addresses (2026-11-07). Resumable — results go to a cache file as they come.

    python3 scripts/michochi_geocode.py            # geocode every address not yet in the cache
    python3 scripts/michochi_geocode.py --count    # only print how many are left

Order of sources (scripts/build_michochi_data.py reads the same cache):
  1. coordinates we already have for the same address (all map lists + archives + 종로맵·구로)
     -> builder side, not geocoded here
  2. geocode_cascade.resolve (카카오 지번 -> 네이버 -> 본번 -> 동 중심), 3-step fallback rule
  3. ★post-check — the answer must be the address we asked for:
     * no 번지 in the source (dong only)      -> dong center, approximate
     * answered 구·동 differ from the source   -> dong center of the source, approximate
       (실측: '종로구 삼청동 -2' 를 카카오가 '소격동 2' 로 exact 응답)
     * same 동, different 번지                -> keep coords, approximate
  4. ★quota guard — Kakao 429 that does not clear stops the whole run (nothing is written as 'fail').
     geocode_cascade would otherwise read a quota error as 'not found' and fall to 동 중심 silently.

Cache: data/inbox_michochi/geocode-cache.json  {주소: {acc, lat, lng, method, road, jibun}}
"""
import json
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
SRC = Path('/Users/woodelight/Projects/ami-work/data/reference/michochi_rows_20261107.json')
CACHE = ROOT / 'data/inbox_michochi/geocode-cache.json'
WORKERS = 6


class QuotaError(RuntimeError):
    pass


import geocode_cascade as G  # noqa: E402

_stop = threading.Event()


def _kakao_get(url, params, retries=6):
    """geocode_cascade._kakao_get with a quota guard: persistent 429/401/403 raises."""
    last = None
    for attempt in range(retries):
        if _stop.is_set():
            raise QuotaError('stopped')
        try:
            r = G._kakao.get(url, params=params, timeout=15)
            last = r.status_code
            if r.status_code == 200:
                return r.json().get('documents', [])
            if r.status_code in (401, 403):
                raise QuotaError(f'kakao {r.status_code} {r.text[:200]}')
            time.sleep(0.6 * (attempt + 1))
        except QuotaError:
            raise
        except Exception as e:  # network — retry
            last = repr(e)
            time.sleep(0.6 * (attempt + 1))
    raise QuotaError(f'kakao keeps failing ({last}) on {params}')


G._kakao_get = _kakao_get

ws = lambda s: re.sub(r'\s+', ' ', str(s or '')).strip()  # noqa: E731
ADDR_RE = re.compile(r'^(?:서울특별시|서울)\s+(\S+구)\s+(\S+?)(?:\s+(.*))?$')


def parts(a):
    """'서울특별시 성북구 정릉동 산1-1' -> ('성북구', '정릉동', '산1-1'). 번지는 공백을 지운다."""
    m = ADDR_RE.match(ws(a))
    if not m:
        return None
    gu, dong, rest = m.group(1), m.group(2), (m.group(3) or '')
    bj = re.match(r'^(산\s*)?\d+(?:-\d+)?', rest.strip())
    return gu, dong, re.sub(r'\s+', '', bj.group(0)) if bj else ''


def dong_center(gu, dong):
    q = f'서울특별시 {gu} {dong}'
    got = G.kakao_address(q) or G.kakao_keyword(q) or G.naver_address(q)
    if not got:
        return {'acc': 'fail', 'lat': None, 'lng': None, 'method': 'none', 'road': '', 'jibun': ''}
    return {'acc': 'approximate', 'lat': got[2], 'lng': got[3], 'method': 'dong_center',
            'road': '', 'jibun': got[1] or ''}


def geocode(a):
    p = parts(a)
    if not p:
        h = G.resolve(jibun=a)
        return {'acc': 'approximate' if h.lat is not None else 'fail', 'lat': h.lat, 'lng': h.lng,
                'method': 'unparsed:' + h.method, 'road': h.road or '', 'jibun': h.jibun or ''}
    gu, dong, bj = p
    if not bj:
        return dong_center(gu, dong)
    h = G.resolve(jibun=f'서울특별시 {gu} {dong} {bj}')
    if h.lat is None:
        return dong_center(gu, dong)
    got = parts(h.jibun) if h.jibun else None
    if not got or got[0] != gu or G._dong_of(f'서울 {gu} {got[1]}') != G._dong_of(f'서울 {gu} {dong}'):
        r = dong_center(gu, dong)
        r['method'] = f'dong_center(answer {h.jibun or h.address})'
        return r
    acc = h.accuracy if got[2] == bj else 'approximate'
    method = h.method if got[2] == bj else f'{h.method}(번지 {got[2]})'
    if h.method == 'dong_center':
        acc = 'approximate'
    return {'acc': acc, 'lat': h.lat, 'lng': h.lng, 'method': method,
            'road': h.road or '', 'jibun': h.jibun or ''}


def todo():
    rows = json.loads(SRC.read_text(encoding='utf-8'))
    addrs = sorted({ws(r['주소']) for r in rows})
    sys.path.insert(0, str(ROOT / 'scripts'))
    from build_michochi_data import coord_pool  # reuse first — never geocode what we already have
    pool = coord_pool()
    cache = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else {}
    left = [a for a in addrs if a not in cache and not (a in pool and pool[a]['acc'] == 'exact')]
    return addrs, pool, cache, left


def main():
    addrs, pool, cache, left = todo()
    print(f'주소 {len(addrs):,} · 기존 좌표(exact) {sum(1 for a in addrs if a in pool and pool[a]["acc"] == "exact"):,}'
          f' · 캐시 {len(cache):,} · 남은 것 {len(left):,}', flush=True)
    if '--count' in sys.argv or not left:
        return 0
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    lock = threading.Lock()
    t0 = time.time()
    done = 0

    def save():
        tmp = CACHE.with_suffix('.tmp')
        tmp.write_text(json.dumps(cache, ensure_ascii=False, indent=0), encoding='utf-8')
        tmp.replace(CACHE)

    err = None
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(geocode, a): a for a in left}
        for f in as_completed(futs):
            a = futs[f]
            try:
                v = f.result()
            except QuotaError as e:
                err = err or e
                _stop.set()
                continue
            with lock:
                cache[a] = v
                done += 1
                if done % 1000 == 0:
                    save()
                    rate = done / (time.time() - t0)
                    print(f'  {done:,}/{len(left):,}  {rate:.1f}/s  남은 {(len(left) - done) / rate / 60:.0f}분',
                          flush=True)
    save()
    print(f'끝: 이번 {done:,} · 캐시 {len(cache):,} · {time.time() - t0:.0f}s', flush=True)
    if err:
        print(f'★중단 — {err}. 다시 돌리면 이어서 한다.', flush=True)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
