#!/usr/bin/env python3
"""
보강현황 통합 — workStatus를 Firebase에 안전 update.
- set(완전교체) 금지. 변경분만 update.
- 신규 pending: 현재 Firebase에 없는 주소만 추가 (사용자 최신 작업 보존)
- rework 15: 현재 Firebase에서도 여전히 complete인 주소만 rework 마킹
사용: python3 upload_workstatus_boranggi.py [dry|run]
"""
import json, sys, os, datetime
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, db as firebase_db

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from status_key import build_status_key_index, build_address_to_keys, load_rows, keys_for_address

KST = ZoneInfo('Asia/Seoul')
BASE = '/Users/woodelight/Projects/ami-work'
WS_NEW = f'{BASE}/data/work-status-new.json'          # 트랙3 산출 (전체 목표 상태)
WS_BASE = f'{BASE}/data/work-status-firebase-backup.json'  # 트랙3가 베이스로 쓴 스냅샷
CRED = f'{BASE}/ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json'
DBURL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"

def encode_key(s):
    return (s.replace('.', '_dot_').replace('#', '_hash_').replace('$', '_dollar_')
             .replace('[', '_lb_').replace(']', '_rb_').replace('/', '_sl_'))

def main(mode):
    new = json.load(open(WS_NEW))
    base = json.load(open(WS_BASE))
    # 트랙3 변경분 = new에서 base와 다른/없는 주소
    rework_addr = {a: v for a, v in new.items() if v.get('rework') is True}
    new_pending = {a: v for a, v in new.items() if a not in base}
    print(f"[diff] rework 마킹 대상: {len(rework_addr)}  신규 pending: {len(new_pending)}")

    # 주소 -> 상태 키. 한 주소가 마커 여러 개로 갈리면 키가 여러 개다(js/status-key.js와 동일 규칙).
    #   ★이 변환을 빼면 배치가 돌 때마다 옛 주소 키가 되살아나 아무 마커도 안 읽는 고아가 된다.
    by_marker, split = build_status_key_index(load_rows(f'{BASE}/data'))
    addr_to_keys = build_address_to_keys(by_marker)
    print(f"[statusKey] 마커 여러 개로 갈린 주소: {len(split)}건")

    cred = credentials.Certificate(CRED)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(cred, {"databaseURL": DBURL})
    ref = firebase_db.reference('workStatus/charger4eleccar')
    cur = ref.get() or {}
    print(f"[firebase] 현재 {len(cur)}건")

    # prepush 백업
    ts = datetime.datetime.now(KST).strftime('%Y%m%d-%H%M%S')
    bak = f'{BASE}/data/work-status-firebase-backup-prepush-{ts}.json'
    json.dump(cur, open(bak, 'w'), ensure_ascii=False, indent=2)
    print(f"[backup] {bak}")

    updates = {}
    skipped_pending = skipped_rework = 0
    # 신규 pending: 현재 Firebase에 없는 주소만
    for addr, v in new_pending.items():
        # 갈린 주소는 마커마다 기록이 필요하다 — 상태 키 전부에 넣는다.
        for sk in keys_for_address(addr, addr_to_keys):
            ek = encode_key(sk)
            if ek in cur:
                skipped_pending += 1
                continue
            updates[ek] = {k: val for k, val in v.items() if val not in (None, '')}
    # rework: 현재도 complete인 주소만
    for addr, v in rework_addr.items():
        for sk in keys_for_address(addr, addr_to_keys):
            ek = encode_key(sk)
            curv = cur.get(ek)
            if not curv or curv.get('state') != 'complete':
                skipped_rework += 1
                continue
            merged = dict(curv)
            merged['rework'] = True
            merged['state'] = 'pending'
            merged['previousCompleteBy'] = curv.get('updatedBy', '')
            merged['previousCompleteAt'] = curv.get('updatedAt', '')
            updates[ek] = {k: val for k, val in merged.items() if val not in (None, '')}

    print(f"[plan] update 적용: {len(updates)}건 (pending 스킵 {skipped_pending} / rework 스킵 {skipped_rework})")
    if mode != 'run':
        print("[dry] 실제 적용 안 함. 'run' 인자로 실행.")
        return
    ref.update(updates)
    print(f"[done] Firebase update 완료: {len(updates)}건")

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'dry')
