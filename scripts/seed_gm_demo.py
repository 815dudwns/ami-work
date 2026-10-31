#!/usr/bin/env python3
"""광명 시험 작업내역(demo) 넣기·빼기 — workStatus/gwangmyeong 전용 (2026-10-31, 영준님 지시 · PM 발주).

kmtest(광명 시험 계정)가 지도 마커 색과 통계로 '작업한 것처럼' 보게 하는 가짜 기록이다.
  - 기록 모양은 앱이 쓰는 것과 같다(js/firebase.js saveStateEvent · saveCheckEvent):
      state, reason, updatedAt(+09:00), updatedBy, updatedByName, rework=false, meterChecks, syncAt(서버 시각)
    + demo: true  <- --remove 가 이것만 지운다
  - 기간 2026-10-27 ~ 10-31(5일), 하루 10곳, 묶음 4개에 고루. 완료 위주 + 불가 + 보류 몇 곳. 시험작업자 3명.
  - 키는 지도와 같은 규칙으로 만든다(scripts/status_key.py — 광명 '주소|광명', 같은 주소가 마커 여럿이면 갈린 키).

★강북 기록(workStatus/charger4eleccar)은 읽지도 쓰지도 않는다. 경로는 아래 DATASET 하나로 고정.
★이미 기록이 있는 개소(앱에서 kmtest 가 직접 찍은 것)는 건드리지 않는다 — 그 키는 건너뛴다.

  python3 scripts/seed_gm_demo.py              # 계획만 출력(쓰기 없음)
  python3 scripts/seed_gm_demo.py --apply      # 실 DB 에 쓰기
  python3 scripts/seed_gm_demo.py --remove     # demo:true 레코드만 지우기
  --emu http://127.0.0.1:9000  로컬 에뮬레이터 대상(시험용)
  --keys-out <파일>            넣은 키 목록 저장
"""
import argparse
import json
import random
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
from status_key import build_status_key_index, status_key_of, encode_key  # noqa: E402

DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
NS = "ami-work-1c49a-default-rtdb"
DATASET = "gwangmyeong"          # ★고정. charger4eleccar 로 바꾸지 마라
CRED = ROOT / "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json"
DATA = ROOT / "data" / "gwangmyeong-data.json"
KST = timezone(timedelta(hours=9))

DAYS = ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]
PER_DAY = 10
WORKERS = [("demo1", "시험작업자1"), ("demo2", "시험작업자2"), ("demo3", "시험작업자3")]
# 불가·보류 사유는 강북 기록에 실제로 많이 쓰인 말 그대로(2026-10-31 읽기 집계)
FAIL_REASONS = ["문잠김", "문잠김", "계기못찾음", "고위치", "계기없음", "주차"]
HOLD_REASONS = ["문잠김", "2시이후"]
SEED = 20261031


def _token():
    import google.oauth2.service_account as sa
    import google.auth.transport.requests as gr
    c = sa.Credentials.from_service_account_file(
        str(CRED), scopes=["https://www.googleapis.com/auth/firebase.database",
                           "https://www.googleapis.com/auth/userinfo.email"])
    c.refresh(gr.Request())
    return c.token


def _req(base, method, path, body=None, emu=False):
    if emu:
        url = f"{base}/{urllib.parse.quote(path)}.json?ns={NS}"
        headers = {"Authorization": "Bearer owner"}   # 에뮬레이터 관리자
    else:
        url = f"{base}/{urllib.parse.quote(path)}.json"
        headers = {"Authorization": "Bearer " + _token()}
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=60) as resp:
        return json.loads(resp.read().decode() or "null")


def plan():
    rows = json.loads(DATA.read_text(encoding="utf-8"))
    for r in rows:
        r["category"] = "광명"
    by_marker, _ = build_status_key_index(rows)
    sites = {}
    for r in rows:
        if r.get("lat") is None or r.get("lng") is None:
            continue
        k = status_key_of(r, by_marker)
        s = sites.setdefault(k, {"key": k, "group": r.get("묶음") or "", "meters": [], "exact": True})
        if r.get("계기번호"):
            s["meters"].append(str(r["계기번호"]))
        if r.get("좌표정확도") != "exact":
            s["exact"] = False
    # 지도에서 '?' 로 뜨는 근사 좌표 개소는 빼고(시험 화면이 깔끔하게), 묶음별로 고루
    pool = {}
    for s in sites.values():
        if s["exact"] and s["meters"]:
            pool.setdefault(s["group"], []).append(s)
    rnd = random.Random(SEED)
    for g in pool:
        pool[g].sort(key=lambda x: x["key"])
        rnd.shuffle(pool[g])
    groups = [g for g in ["광명동", "철산·하안", "소하·일직", "학온·옥길"] if g in pool]
    picked = []
    gi = 0
    for day in DAYS:
        for i in range(PER_DAY):
            g = groups[gi % len(groups)]
            gi += 1
            s = pool[g].pop()
            n = len(picked)
            # 상태: 10곳 중 완료 8 · 불가 1~2 · 보류 0~1
            roll = rnd.random()
            state = "complete" if roll < 0.78 else ("fail" if roll < 0.93 else "hold")
            reason = rnd.choice(FAIL_REASONS) if state == "fail" else (rnd.choice(HOLD_REASONS) if state == "hold" else "")
            wid, wname = WORKERS[(n // 2 + i) % len(WORKERS)]
            hh = 9 + (i * 8) // PER_DAY
            mm = rnd.randrange(0, 60)
            t = datetime.fromisoformat(f"{day}T{hh:02d}:{mm:02d}:{rnd.randrange(60):02d}+09:00")
            picked.append({**s, "day": day, "state": state, "reason": reason,
                           "worker": wid, "workerName": wname, "at": t})
    return picked


def record_of(p):
    iso = p["at"].strftime("%Y-%m-%dT%H:%M:%S+09:00")
    ts = int(p["at"].timestamp() * 1000)
    rec = {
        "state": p["state"], "reason": p["reason"], "updatedAt": iso,
        "updatedBy": p["worker"], "updatedByName": p["workerName"], "rework": False,
        "syncAt": {".sv": "timestamp"}, "demo": True,
    }
    if p["state"] == "complete":
        rec["meterChecks"] = {encode_key(m): {"checked": True, "ts": ts} for m in p["meters"]}
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--remove", action="store_true")
    ap.add_argument("--emu", default="")
    ap.add_argument("--keys-out", default="")
    a = ap.parse_args()
    base = a.emu.rstrip("/") if a.emu else DB_URL
    emu = bool(a.emu)
    path = f"workStatus/{DATASET}"
    assert DATASET == "gwangmyeong"

    if a.remove:
        cur = _req(base, "GET", path, emu=emu) or {}
        demo = [k for k, v in cur.items() if isinstance(v, dict) and v.get("demo") is True]
        print(f"[remove] {path} 레코드 {len(cur)} 중 demo {len(demo)}")
        if demo:
            _req(base, "PATCH", path, {k: None for k in demo}, emu=emu)
            print("[remove] 지움:", len(demo))
        return

    picked = plan()
    by_day, by_state, by_worker = {}, {}, {}
    for p in picked:
        by_day.setdefault(p["day"], {}).setdefault(p["state"], 0)
        by_day[p["day"]][p["state"]] += 1
        by_state[p["state"]] = by_state.get(p["state"], 0) + 1
        by_worker[p["workerName"]] = by_worker.get(p["workerName"], 0) + 1
    print(f"[plan] {len(picked)}곳 · 계기 {sum(len(p['meters']) for p in picked)}")
    for d in DAYS:
        print("  ", d, by_day.get(d))
    print("   상태", by_state, "· 작업자", by_worker)
    print("   묶음", {g: sum(1 for p in picked if p["group"] == g) for g in sorted({p['group'] for p in picked})})

    if a.keys_out:
        Path(a.keys_out).write_text(json.dumps(
            [{"key": p["key"], "day": p["day"], "state": p["state"], "reason": p["reason"],
              "worker": p["workerName"], "group": p["group"], "meters": len(p["meters"])} for p in picked],
            ensure_ascii=False, indent=1), encoding="utf-8")
        print("[keys]", a.keys_out)

    if not a.apply:
        print("[dry-run] 쓰기 없음 — --apply 로 쓴다")
        return
    cur = _req(base, "GET", path, emu=emu) or {}
    patch, skipped = {}, []
    for p in picked:
        ek = encode_key(p["key"])
        if ek in cur and not (isinstance(cur[ek], dict) and cur[ek].get("demo") is True):
            skipped.append(p["key"])       # 앱에서 실제로 찍은 기록 — 건드리지 않는다
            continue
        patch[ek] = record_of(p)
    if patch:
        _req(base, "PATCH", path, patch, emu=emu)
    print(f"[apply] {path} 에 {len(patch)}곳 씀 · 건너뜀(이미 실제 기록) {len(skipped)}")


if __name__ == "__main__":
    main()
