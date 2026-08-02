"""
구로 site-data approximate 좌표 재보강 스크립트
- 카카오 주소검색(a) → 지번주소(b) → 키워드검색(c) 순서로 시도
- 성공 시 lat/lng 갱신 + 좌표정확도 = 'exact'
- 양쪽 파일 모두 갱신:
    /Users/woodelight/Projects/ami-work/data/guro-site-data.json
    /Users/woodelight/Projects/jongno-combined/data/guro-site-data.json
"""

import json
import requests
import time

from _env import require_env

KAKAO_API_KEY = require_env('KAKAO_REST_API_KEY')

AMI_FILE    = '/Users/woodelight/Projects/ami-work/data/guro-site-data.json'
JONGNO_FILE = '/Users/woodelight/Projects/jongno-combined/data/guro-site-data.json'

HEADERS = {'Authorization': f'KakaoAK {KAKAO_API_KEY}'}


def kakao_address(query):
    """카카오 주소검색 API → (lat, lng) 또는 None"""
    url = 'https://dapi.kakao.com/v2/local/search/address.json'
    try:
        r = requests.get(url, headers=HEADERS, params={'query': query}, timeout=10)
        if r.status_code == 200:
            docs = r.json().get('documents', [])
            if docs:
                return float(docs[0]['y']), float(docs[0]['x'])
    except Exception as e:
        print(f'    [kakao_address 오류] {e}')
    return None


def kakao_keyword(query):
    """카카오 키워드검색 API → (lat, lng) 또는 None"""
    url = 'https://dapi.kakao.com/v2/local/search/keyword.json'
    try:
        r = requests.get(url, headers=HEADERS, params={'query': query}, timeout=10)
        if r.status_code == 200:
            docs = r.json().get('documents', [])
            if docs:
                return float(docs[0]['y']), float(docs[0]['x'])
    except Exception as e:
        print(f'    [kakao_keyword 오류] {e}')
    return None


def geocode(rec):
    """레코드에서 주소 추출 후 카카오 다단계 지오코딩
    반환: (lat, lng, method) 또는 None
    """
    road   = (rec.get('도로명주소') or '').strip()
    dong   = (rec.get('법정동') or '').strip()
    beonji = (rec.get('번지') or '').strip()
    addr   = (rec.get('주소') or '').strip()
    # 번지에서 하이픈 이후 제거 (123-45 → 123)
    beonji_parent = beonji.split('-')[0] if '-' in beonji else ''

    def try_pair(gu, method_suffix):
        """구 이름으로 지번 시도 — full번지, parent번지, 키워드"""
        if dong and beonji:
            q = f'서울특별시 {gu} {dong} {beonji}'
            result = kakao_address(q)
            if result:
                return result[0], result[1], f'kakao_jibun_{method_suffix}'
            time.sleep(0.12)
        if dong and beonji_parent:
            q2 = f'서울특별시 {gu} {dong} {beonji_parent}'
            result = kakao_address(q2)
            if result:
                return result[0], result[1], f'kakao_jibun_parent_{method_suffix}'
            time.sleep(0.12)
        if dong and beonji:
            kw = f'{gu} {dong} {beonji}'
            result = kakao_keyword(kw)
            if result:
                return result[0], result[1], f'kakao_keyword_{method_suffix}'
            time.sleep(0.12)
        if dong and beonji_parent:
            kw2 = f'{gu} {dong} {beonji_parent}'
            result = kakao_keyword(kw2)
            if result:
                return result[0], result[1], f'kakao_keyword_parent_{method_suffix}'
            time.sleep(0.12)
        return None

    # (a) 도로명주소로 주소검색
    if road:
        result = kakao_address(road)
        if result:
            return result[0], result[1], 'kakao_road'
        time.sleep(0.12)

    # (b) 주소 필드 전체로 주소검색
    if addr:
        result = kakao_address(addr)
        if result:
            return result[0], result[1], 'kakao_addr_field'
        time.sleep(0.12)

    # (c) 구로구 시도
    r = try_pair('구로구', 'guro')
    if r:
        return r

    # (d) 금천구 시도
    r = try_pair('금천구', 'gumcheon')
    if r:
        return r

    return None


def run():
    with open(AMI_FILE, encoding='utf-8') as f:
        data = json.load(f)

    approx_indices = [i for i, r in enumerate(data) if r.get('좌표정확도') == 'approximate']
    print(f'approximate 대상: {len(approx_indices)}건')

    fixed   = 0
    failed  = []
    method_count = {}

    for idx in approx_indices:
        rec = data[idx]
        addr_display = rec.get('주소') or rec.get('도로명주소') or f'{rec.get("법정동")} {rec.get("번지")}'
        result = geocode(rec)
        if result:
            lat, lng, method = result
            data[idx]['lat'] = lat
            data[idx]['lng'] = lng
            data[idx]['좌표정확도'] = 'exact'
            fixed += 1
            method_count[method] = method_count.get(method, 0) + 1
            print(f'  [OK:{method}] {addr_display} → {lat:.6f}, {lng:.6f}')
        else:
            failed.append(addr_display)
            print(f'  [FAIL] {addr_display}')
        time.sleep(0.12)  # rate limit 여유

    print(f'\n=== 결과 ===')
    print(f'성공: {fixed} / 실패: {len(failed)}')
    for m, c in sorted(method_count.items()):
        print(f'  {m}: {c}건')
    if failed:
        print(f'\n실패 목록:')
        for a in failed:
            print(f'  - {a}')

    # 저장
    with open(AMI_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'\nami-work 저장 완료: {AMI_FILE}')

    # jongno-combined에도 동일 데이터 저장
    with open(JONGNO_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'jongno-combined 저장 완료: {JONGNO_FILE}')

    return fixed, len(failed), failed


if __name__ == '__main__':
    run()
