#!/usr/bin/env python3
"""
새 site-data.json + work-status를 Firebase에 업로드.
주의: 사용자 사용 중일 때 실행하면 영향 — 반드시 마지막에 한 번만.

키 인코딩은 firebase.js의 encodeKey와 정확히 일치해야 함:
  .   → _dot_
  #   → _hash_
  $   → _dollar_
  [   → _lb_
  ]   → _rb_
  /   → _sl_
"""
import json, os, sys, datetime
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, db as firebase_db

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from status_key import build_status_key_index, build_address_to_keys, load_rows, keys_for_address

KST = ZoneInfo('Asia/Seoul')

BASE = '/Users/woodelight/Projects/ami-work'
SITE_NEW = f'{BASE}/data/site-data-new.json'
WS_NEW = f'{BASE}/data/work-status-new.json'

def encode_key(s):
    """firebase.js의 encodeKey와 일치"""
    return (s.replace('.', '_dot_')
             .replace('#', '_hash_')
             .replace('$', '_dollar_')
             .replace('[', '_lb_')
             .replace(']', '_rb_')
             .replace('/', '_sl_'))

# Step 1: site-data.json 교체 (로컬만 — Firebase는 site-data 안 함, repo 푸쉬)
def replace_site_data():
    import shutil
    shutil.copy(SITE_NEW, f'{BASE}/data/site-data.json')
    print(f"✅ site-data.json 교체 완료")

# Step 2: Firebase workStatus를 새 work-status-new로 완전 교체
def upload_work_status():
    cred = credentials.Certificate(f'{BASE}/ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json')
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {
            "databaseURL": "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
        })

    with open(WS_NEW) as f:
        ws_new = json.load(f)

    ref = firebase_db.reference('workStatus/charger4eleccar')

    # 안전을 위해 현재 상태 백업
    cur = ref.get() or {}
    ts = datetime.datetime.now(KST).strftime('%Y%m%d-%H%M%S')
    bak_path = f'{BASE}/data/work-status-firebase-backup-prepush-{ts}.json'
    with open(bak_path, 'w') as f:
        json.dump(cur, f, ensure_ascii=False, indent=2)
    print(f"✅ Firebase 현재 상태 백업: {bak_path} ({len(cur)}건)")

    # 사용 중 사용자 보호 — 백업 시점 이후 변경된 항목 머지 (안전망)
    # 새 데이터 기준으로 set하되, 이미 cur에 있는데 new에 없는 주소는 보존 정책 결정 필요.
    # 정책: 새 site-data 주소 기준으로 완전 교체 (cur에 있는 주소도 새 site-data에 없으면 사라짐)

    # 주소 -> 상태 키. 한 주소가 마커 여러 개로 갈리면 키가 여러 개다(js/status-key.js와 동일 규칙).
    #   ★이 변환을 빼면 통째교체(set)로 옛 주소 키만 남아 갈린 마커가 전부 기록을 잃는다.
    #   ★인덱스는 '교체 후' site-data 기준이어야 한다. all 은 site -> workstatus 순서라 문제없지만,
    #     workstatus 만 단독 실행할 때는 site-data.json 이 이미 새 데이터인지 확인할 것.
    by_marker, split = build_status_key_index(load_rows(f'{BASE}/data'))
    addr_to_keys = build_address_to_keys(by_marker)
    print(f"[statusKey] 마커 여러 개로 갈린 주소: {len(split)}건")

    encoded = {}
    for addr, v in ws_new.items():
        # null/빈문자열은 제거 (Firebase는 null 키 삭제)
        clean = {k: val for k, val in v.items() if val is not None and val != ''}
        # 갈린 주소는 마커마다 기록이 필요하다 — 상태 키 전부에 넣는다.
        for sk in keys_for_address(addr, addr_to_keys):
            encoded[encode_key(sk)] = clean

    print(f"인코딩된 항목: {len(encoded)}건")
    # 완전 교체
    ref.set(encoded)
    print(f"✅ Firebase workStatus 교체 완료: {len(encoded)}건")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("사용: python3 upload_new_data.py [site|workstatus|all]")
        sys.exit(1)
    cmd = sys.argv[1]
    if cmd in ('site', 'all'):
        replace_site_data()
    if cmd in ('workstatus', 'all'):
        upload_work_status()
