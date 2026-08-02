#!/usr/bin/env python3
"""migrate_status_keys.py — workStatus 주소 키를 마커별 상태 키로 이관.

한 주소가 마커 여러 개로 갈리면 그 주소의 workStatus 레코드는 이제 아무 마커도
읽지 않는 고아가 된다(마커들은 '주소|도로명주소' 키를 본다). 기존 기록을 첫 마커의
새 키로 옮겨 작업 이력을 살린다.

정책 (PM 확정 2026-08-02):
  - 옮길 대상은 '갈린 주소' 중 workStatus 기록이 있는 것뿐이다.
  - 어느 마커에서 한 작업인지는 데이터에 없다. 임의로 배정하지 않고 첫 마커
    (마커키 정렬 첫번째)에 그대로 둔다. 나머지 마커는 미작업(pending)으로 시작한다.
  - state 뿐 아니라 checkedMeters / added_meters / meterChecks / failedMeters 등
    레코드 전체를 통째로 옮긴다. 필드를 골라 옮기면 체크·추가계기가 유실된다.
  - complete 기록은 사람이 확인해야 하므로 리포트에 따로 표시한다.

기본은 드라이런이다. 실제 반영은 --apply 를 붙여야 하고, 그때 백업을 먼저 뜬다.

실행:
  python3 scripts/migrate_status_keys.py                    # 드라이런(로컬 스냅샷)
  python3 scripts/migrate_status_keys.py --source firebase  # 드라이런(라이브 조회)
  python3 scripts/migrate_status_keys.py --source firebase --apply
"""

import argparse
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from status_key import (  # noqa: E402
    build_status_key_index, load_rows, address_of_status_key, marker_key_of, _lookup_key,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
NODE = "workStatus/charger4eleccar"
KST = ZoneInfo("Asia/Seoul")


def encode_key(s):
    """js/firebase.js encodeKey 와 동일 — Firebase 키 금지문자 치환.

    구분자 '|' 는 Firebase 키에서 허용되므로 치환하지 않는다.
    """
    return (str(s).replace(".", "_dot_").replace("#", "_hash_").replace("$", "_dollar_")
            .replace("[", "_lb_").replace("]", "_rb_").replace("/", "_sl_"))


def decode_key(s):
    return (str(s).replace("_dot_", ".").replace("_hash_", "#").replace("_dollar_", "$")
            .replace("_lb_", "[").replace("_rb_", "]").replace("_sl_", "/"))


def load_ws_local(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def load_ws_firebase():
    import firebase_admin
    from firebase_admin import credentials, db as fdb
    key = os.path.join(ROOT, "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json")
    if not os.path.exists(key):
        raise RuntimeError("서비스 계정 키 없음: {}".format(key))
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(key), {"databaseURL": DB_URL})
    raw = fdb.reference(NODE).get() or {}
    return {decode_key(k): v for k, v in raw.items()}


def first_marker_key(addr, rows, by_marker):
    """그 주소의 마커들 중 첫번째(마커키 정렬)의 새 상태 키."""
    mks = sorted({marker_key_of(r) for r in rows
                  if r.get("주소") == addr and r.get("lat") is not None})
    if not mks:
        return None
    return by_marker.get(_lookup_key(mks[0], addr))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", default=os.path.join(ROOT, "data"))
    ap.add_argument("--source", choices=["local", "firebase"], default="local",
                    help="workStatus 출처. local 은 --ws 스냅샷 파일")
    ap.add_argument("--ws", default=os.path.join(ROOT, "data", "ws-live-snapshot.json"))
    ap.add_argument("--apply", action="store_true", help="실제 반영(기본은 드라이런)")
    args = ap.parse_args()

    data_dir = os.path.abspath(args.data_dir)
    rows = load_rows(data_dir)
    by_marker, split = build_status_key_index(rows)
    print("데이터: {} / 레코드 {}건".format(data_dir, len(rows)))
    print("마커 여러 개로 갈린 주소: {}건".format(len(split)))

    if args.source == "firebase":
        ws = load_ws_firebase()
        print("workStatus: Firebase 라이브 {}키".format(len(ws)))
    else:
        ws = load_ws_local(args.ws)
        print("workStatus: 로컬 스냅샷 {} ({}키)".format(args.ws, len(ws)))

    plan = []          # (옛키, 새키, 레코드)
    skipped_nokey = []
    for addr in split:
        if addr not in ws:
            continue
        newk = first_marker_key(addr, rows, by_marker)
        if not newk or newk == addr:
            skipped_nokey.append(addr)
            continue
        plan.append((addr, newk, ws[addr]))

    print("\n=== 이관 계획 {}건 ===".format(len(plan)))
    completes = []
    for old, new, rec in plan:
        state = rec.get("state")
        extras = {k: len(v) for k, v in rec.items()
                  if k in ("checkedMeters", "added_meters", "meterChecks", "failedMeters") and v}
        mark = "  <-- complete, 사람 확인 필요" if state == "complete" else ""
        if state == "complete":
            completes.append((old, new, rec))
        print("  {}".format(old))
        print("    state={} by={} at={}{}".format(
            state, rec.get("updatedByName") or rec.get("updatedBy"), rec.get("updatedAt"), mark))
        if extras:
            print("    함께 이관: {}".format(extras))
        print("    -> {}".format(new))
        # 새 키가 이미 있으면 덮어쓰지 않는다(수동 확인)
        if new in ws:
            print("    [경고] 새 키에 이미 기록이 있다 — 건너뜀 대상")

    conflicts = [p for p in plan if p[1] in ws]
    if skipped_nokey:
        print("\n새 키를 못 찾아 건너뛴 주소 {}건: {}".format(len(skipped_nokey), skipped_nokey))
    if conflicts:
        print("\n[경고] 새 키에 이미 기록이 있어 건너뛸 {}건".format(len(conflicts)))

    if completes:
        print("\n★complete 기록 {}건 — 어느 마커의 작업인지 데이터에 없다.".format(len(completes)))
        print("  임의 배정하지 않고 첫 마커에 그대로 둔다. 나머지 마커는 미작업으로 남는다.")
        for old, new, rec in completes:
            print("  - {} ({} {})".format(old, rec.get("updatedByName"), rec.get("updatedAt")))

    todo = [p for p in plan if p[1] not in ws]
    print("\n실제 이관 대상: {}건 (충돌 제외)".format(len(todo)))

    if not args.apply:
        print("\n드라이런입니다. 반영하려면 --apply 를 붙이세요.")
        return 0

    if args.source != "firebase":
        print("\n[중단] --apply 는 --source firebase 와 함께만 쓸 수 있습니다.")
        return 1
    if not todo:
        print("\n이관할 것이 없습니다.")
        return 0

    import firebase_admin  # noqa: F401
    from firebase_admin import db as fdb

    stamp = datetime.now(KST).strftime("%Y%m%d-%H%M%S")
    backup = os.path.join(ROOT, "data", "workStatus-backup-키분리전-{}.json".format(stamp))
    with open(backup, "w", encoding="utf-8") as f:
        json.dump(ws, f, ensure_ascii=False)
    print("\n백업 저장: {} ({}키)".format(backup, len(ws)))

    ref = fdb.reference(NODE)
    updates = {}
    for old, new, rec in todo:
        updates[encode_key(new)] = rec
        updates[encode_key(old)] = None   # 옛 키 제거 — 아무 마커도 안 읽는 고아
    ref.update(updates)
    print("이관 완료: {}건 (옛 키 {}개 제거)".format(len(todo), len(todo)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
