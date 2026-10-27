#!/usr/bin/env python3
"""Mark 합동 map entries complete when 영준님 (awms 273584) already registered them in MOBCST.

영준님 2026-10-27: "오늘 밤 합동 업로드할때 만약 내가 awms에 올린게있으면 그것은 완료처리하고올려라"

Flow
  1. 합동 rows on the map = status_key.load_rows('data') where category == '합동' (the 3 days left).
     Status key = status_key.build_status_key_index + status_key_of ('주소|합동', or
     '<CONS_TGT_SEQNO>|합동' when the address is empty). Firebase path goes through encode_key.
  2. My awms registrations = MOBCST getMainList FLAG=M10 DEPT1=3970, every DEPT2 in
     my_stock.ALL_DEPTS, workStep=25,28,29, strDate = earliest 합동 작업일, endDate = today.
     Session = 아미큐 backend (127.0.0.1:8766/api/session must be alive). Rows are kept only when
     WORKER1_SEQ == 273584 (measured 2026-10-27: getMainList already returns only my rows).
  3. Match = 합동 '계기번호' (the NEW meter) == INSTR_NUM, normalised (keep letter prefixes,
     zfill(11) only when purely numeric). '계기번호_전' is NOT a match key (the removed meter never
     reaches awms) — hits there are only reported.
  4. Per status key: every 합동 meter of that key registered -> state complete.
     Only some -> state untouched, only those meters get meterChecks checked. Keys whose state is
     already something other than pending are left alone and only counted.
     Payload is a multi-path update (never a set) with the same fields the app writes
     (js/firebase.js flush): state / reason / updatedAt / updatedBy / updatedByName / rework /
     meterChecks/<m> {checked, ts} + syncAt (server timestamp — without it phones never get the delta).

Default is a dry run. Firebase is written only with --go.

    python3 scripts/hapdong/complete_mine.py            # dry run
    python3 scripts/hapdong/complete_mine.py --go       # write
"""
import argparse
import json
import sys
import time
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import awms_cst_detail as A  # noqa: E402
import status_key as S  # noqa: E402
from my_stock import ALL_DEPTS  # noqa: E402

KST = ZoneInfo("Asia/Seoul")
ME = "273584"
ME_NAME = "우영준"
CAT = "합동"
DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
WS_PATH = "workStatus/charger4eleccar"
SA_KEY = ROOT / "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json"


def norm_meter(v):
    t = str(v if v is not None else "").strip().replace(" ", "").replace("-", "").upper()
    if not t:
        return ""
    return t.zfill(11) if t.isdigit() else t


def gu_of(addr):
    for tok in str(addr or "").split():
        if tok.endswith("구"):
            return tok
    return "(구 없음)"


def check_session():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8766/api/session", timeout=5) as r:
            s = json.loads(r.read())
    except Exception as e:
        sys.exit(f"아미큐 백엔드 세션 확인 실패: {e}")
    if not s.get("alive"):
        sys.exit("아미큐 awms 세션이 죽어 있다 — 아미큐에서 awms 로그인 후 다시 실행")


def my_registrations(str_date, end_date):
    """INSTR_NUM(norm) -> list of rows (master and slaves are separate rows)."""
    h = A.headers()
    rows, other = [], 0
    for code in ALL_DEPTS:
        got = A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2={code}&searchKeyword=&sortKey=0"
                    f"&workStep=25,28,29&pPageNo=1&pRowCount=5000&strDate={str_date}&endDate={end_date}", h) or []
        for r in got:
            if str(r.get("WORKER1_SEQ") or "") == ME:
                rows.append(r)
            else:
                other += 1
    by = defaultdict(list)
    for r in rows:
        n = norm_meter(r.get("INSTR_NUM"))
        if n:
            by[n].append(r)
    return by, len(rows), other


def fb_init():
    import firebase_admin
    from firebase_admin import credentials, db
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(SA_KEY)), {"databaseURL": DB_URL})
    return db


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--go", action="store_true", help="actually write Firebase (default: dry run)")
    args = ap.parse_args()

    # 1. 합동 rows on the map + status keys
    rows = S.load_rows(str(ROOT / "data"))
    idx = S.build_status_key_index(rows)
    by_marker = idx[0] if isinstance(idx, tuple) else idx
    hd = [r for r in rows if r.get("category") == CAT]
    if not hd:
        sys.exit("합동 행이 없다 — data/hapdong-data.json 확인")
    key_rows = defaultdict(list)
    for r in hd:
        key_rows[S.status_key_of(r, by_marker)].append(r)
    if "" in key_rows:
        sys.exit(f"상태키가 빈 합동 행 {len(key_rows[''])}건 — status_key 확인 필요, 중단")
    days = sorted({str(r.get("작업일") or "") for r in hd if str(r.get("작업일") or "").isdigit()})
    today = datetime.now(KST).strftime("%Y%m%d")
    print(f"합동 지도 {len(hd):,}행 · 상태키 {len(key_rows):,}개 · 작업일 {days}")

    # 2. my awms registrations
    check_session()
    mine, n_mine, n_other = my_registrations(days[0], today)
    print(f"내 awms 등록 {n_mine:,}행 (계기 {len(mine):,}개, {days[0]}~{today}, 작업자1≠{ME} 제외 {n_other})")

    # 3. match
    hit_meters, prev_hits = set(), []
    for r in hd:
        n = norm_meter(r.get("계기번호"))
        if n and n in mine:
            hit_meters.add(n)
        p = norm_meter(r.get("계기번호_전"))
        if p and p in mine and not (n and n in mine):
            prev_hits.append(r)
    print(f"매칭 계기(신설 계기번호) {len(hit_meters):,}개")

    # 4. per key decision
    full, partial = {}, {}
    for k, rs in key_rows.items():
        ms = [norm_meter(r.get("계기번호")) for r in rs]
        hits = [m for m in ms if m and m in hit_meters]
        if not hits:
            continue
        if len(hits) == len(ms):           # empty 계기번호 rows count against "all"
            full[k] = rs
        else:
            partial[k] = rs

    target_keys = list(full) + list(partial)
    db = fb_init()
    ref = db.reference(WS_PATH)

    def fetch(k):
        return k, ref.child(S.encode_key(k)).get()

    with ThreadPoolExecutor(16) as ex:
        cur = dict(ex.map(fetch, target_keys))

    def state_of(k):
        v = cur.get(k) or {}
        return (v.get("state") or "pending") if isinstance(v, dict) else "pending"

    already = {k: state_of(k) for k in target_keys if state_of(k) != "pending"}
    do_full = [k for k in full if k not in already]
    do_partial = [k for k in partial if k not in already]

    now_ms = int(time.time() * 1000)
    now_iso = datetime.now(KST).isoformat(timespec="milliseconds")
    updates = {}
    n_checks = 0
    for k in do_full + do_partial:
        p = S.encode_key(k)
        v = cur.get(k) if isinstance(cur.get(k), dict) else {}
        mc = v.get("meterChecks") or {}
        for r in key_rows[k]:
            m = norm_meter(r.get("계기번호"))
            if not (m and m in hit_meters):
                continue
            em = S.encode_key(r.get("계기번호"))   # same key the app uses (raw 계기번호)
            if isinstance(mc.get(em), dict) and mc[em].get("checked"):
                continue
            updates[f"{p}/meterChecks/{em}"] = {"checked": True, "ts": now_ms}
            n_checks += 1
        if k in full:
            updates[f"{p}/state"] = "complete"
            updates[f"{p}/reason"] = ""
            updates[f"{p}/updatedAt"] = now_iso
            updates[f"{p}/updatedBy"] = "admin"
            updates[f"{p}/updatedByName"] = ME_NAME
            updates[f"{p}/rework"] = False
        if any(u.startswith(p + "/") for u in updates):
            updates[f"{p}/syncAt"] = {".sv": "timestamp"}

    # 5. report
    def dist(keys):
        rs = [r for k in keys for r in key_rows[k]]
        return (dict(sorted(Counter(r.get("작업일") for r in rs).items())),
                dict(Counter(gu_of(r.get("주소")) for r in rs).most_common()))

    print()
    print(f"완료 처리할 키 {len(do_full):,}개 (계기 {sum(len(key_rows[k]) for k in do_full):,})")
    d, g = dist(do_full)
    print(f"  작업일별(계기) {d}")
    print(f"  구별(계기)     {g}")
    print(f"일부만 등록된 키 {len(do_partial):,}개 — state 그대로, 등록된 계기만 체크")
    for k in do_partial:
        rs = key_rows[k]
        got = [r.get("계기번호") for r in rs if norm_meter(r.get("계기번호")) in hit_meters]
        miss = [r.get("계기번호") or "(계기번호 빈값)" for r in rs if norm_meter(r.get("계기번호")) not in hit_meters]
        print(f"  - {k}  등록 {len(got)}/{len(rs)}  미등록 {miss}")
    print(f"이미 처리된 키(건드리지 않음) {len(already):,}개 {dict(Counter(already.values()))}")
    if prev_hits:
        print(f"★철거 계기번호(계기번호_전)만 내 등록과 일치 {len(prev_hits)}건 — 매칭하지 않음, 확인용:")
        for r in prev_hits[:30]:
            print(f"  - {r.get('작업일')} {r.get('지사')} {r.get('주소')} 신설 {r.get('계기번호')} 철거 {r.get('계기번호_전')}")
    print(f"쓰기 경로 {len(updates):,}개 (계기 체크 {n_checks:,})")

    if not args.go:
        print("\n드라이런 — Firebase 는 쓰지 않았다. 쓰려면 --go")
        return
    if not updates:
        print("\n쓸 것이 없다.")
        return
    ref.update(updates)
    print(f"\n[--go] Firebase update 완료 — 경로 {len(updates):,}개")


if __name__ == "__main__":
    main()
