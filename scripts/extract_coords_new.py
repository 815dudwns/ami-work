#!/usr/bin/env python3
"""신규 5,594건 좌표 추출 (coords-todo.json → 좌표 채워서 site-data-new.json 갱신)"""
import json, re, threading, requests, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from _env import require_env

API_KEY = require_env('KAKAO_REST_API_KEY')
BASE = '/Users/woodelight/Projects/ami-work'
TODO = f'{BASE}/data/coords-todo.json'
SITE = f'{BASE}/data/site-data-new.json'
WORKERS = 10

_session = requests.Session()
_session.headers.update({'Authorization': f'KakaoAK {API_KEY}'})

def search_address(query):
    if not query: return None
    import time as _t
    for attempt in range(4):
        try:
            r = _session.get('https://dapi.kakao.com/v2/local/search/address.json',
                             params={'query': query}, timeout=15)
            if r.status_code == 429:
                _t.sleep(0.5 * (attempt + 1)); continue
            if r.status_code == 200:
                docs = r.json().get('documents', [])
                if docs:
                    doc = docs[0]
                    lat = float(doc['y']); lng = float(doc['x'])
                    road = (doc.get('road_address') or {}).get('address_name', '')
                    jibun = (doc.get('address') or {}).get('address_name', '')
                    return (road or jibun or query), lat, lng
                return None
            _t.sleep(0.3)
        except Exception:
            _t.sleep(0.3)
    return None

def search_keyword(query):
    if not query: return None
    try:
        r = _session.get('https://dapi.kakao.com/v2/local/search/keyword.json',
                         params={'query': query, 'size': 1}, timeout=15)
        if r.status_code == 200:
            docs = r.json().get('documents', [])
            if docs:
                doc = docs[0]
                return doc.get('road_address_name') or doc.get('address_name') or query, float(doc['y']), float(doc['x'])
    except Exception: pass
    return None

def extract_dong(address):
    m = re.match(r'(.*?[동읍면])', address or '')
    return m.group(1).strip() if m else None

def trim_addr(addr):
    if not addr: return ''
    a = re.sub(r'\s+', ' ', addr).strip()
    return re.split(r'[\(]', a)[0].strip()

def resolve(key):
    jibun = trim_addr(key[0])
    road = trim_addr(key[1])
    found = None; accuracy = None
    if road:
        found = search_address(road)
        if found: accuracy = 'exact'
    if not found and jibun:
        found = search_address(jibun)
        if found: accuracy = 'exact'
    if not found and road:
        found = search_keyword(road)
        if found: accuracy = 'exact'
    if not found and jibun:
        found = search_keyword(jibun)
        if found: accuracy = 'exact'
    if not found:
        dong = extract_dong(jibun) or extract_dong(road)
        if dong:
            found = search_address(dong) or search_keyword(dong)
            if found: accuracy = 'approximate'
    if found:
        return key, accuracy, found[0], found[1], found[2]
    return key, 'fail', road or jibun, None, None

def main():
    with open(TODO) as f: todo = json.load(f)
    print(f"좌표 추출 대상: {len(todo)}건", flush=True)
    
    # 동일 주소 그룹핑
    grouped = {}
    for d in todo:
        k = (d['주소'], d['도로명주소'])
        grouped.setdefault(k, []).append(d['계기번호'])
    print(f"고유 주소 그룹: {len(grouped):,}", flush=True)
    
    resolved = {}
    counter = {'done': 0, 'exact': 0, 'approx': 0, 'fail': 0}
    lock = threading.Lock()
    total = len(grouped)
    
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(resolve, k) for k in grouped.keys()]
        for fut in as_completed(futures):
            key, accuracy, road, lat, lng = fut.result()
            resolved[key] = (accuracy, road, lat, lng)
            with lock:
                counter['done'] += 1
                if accuracy == 'exact': counter['exact'] += 1
                elif accuracy == 'approximate': counter['approx'] += 1
                else: counter['fail'] += 1
                if counter['done'] % 200 == 0 or counter['done'] == total:
                    print(f"[{counter['done']:,}/{total:,}] exact={counter['exact']:,} approx={counter['approx']:,} fail={counter['fail']:,}", flush=True)
    
    # 계기번호 → (accuracy, road, lat, lng)
    by_meter = {}
    for k, meters in grouped.items():
        accuracy, road, lat, lng = resolved[k]
        for m in meters:
            by_meter[m] = (accuracy, road, lat, lng)
    
    # site-data-new.json 갱신
    with open(SITE) as f: site = json.load(f)
    updated = 0
    for e in site:
        if e['계기번호'] in by_meter:
            accuracy, road, lat, lng = by_meter[e['계기번호']]
            e['lat'] = lat; e['lng'] = lng
            e['좌표정확도'] = accuracy if accuracy else 'fail'
            if road and not e['도로명주소']:
                e['도로명주소'] = road
            updated += 1
    
    with open(SITE, 'w') as f: json.dump(site, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n✅ 갱신: {updated}건 / 총 {len(site)}건", flush=True)
    print(f"   exact={counter['exact']:,} approx={counter['approx']:,} fail={counter['fail']:,}", flush=True)

if __name__ == '__main__':
    main()
