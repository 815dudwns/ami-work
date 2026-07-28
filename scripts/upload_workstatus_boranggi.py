#!/usr/bin/env python3
"""
보강현황 통합 — workStatus를 Firebase에 안전 update.
- set(완전교체) 금지. 변경분만 update.
- 신규 pending: 현재 Firebase에 없는 주소만 추가 (사용자 최신 작업 보존)
- rework 15: 현재 Firebase에서도 여전히 complete인 주소만 rework 마킹
사용: python3 upload_workstatus_boranggi.py [dry|run]
"""
import json, sys, datetime
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, db as firebase_db

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
        ek = encode_key(addr)
        if ek in cur:
            skipped_pending += 1
            continue
        updates[ek] = {k: val for k, val in v.items() if val not in (None, '')}
    # rework: 현재도 complete인 주소만
    for addr, v in rework_addr.items():
        ek = encode_key(addr)
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
