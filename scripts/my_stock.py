#!/usr/bin/env python3
"""My real modem stock (통신팀, 영준님 계정) — awms 장부에서 실물 아닌 것을 걸러 낸다.

    python3 scripts/my_stock.py                 # 기본: 2026-06-22(일괄 재출고) 이후 수령분
    python3 scripts/my_stock.py --since 20261001
    python3 scripts/my_stock.py --list          # 남은 MAC 전부 출력

Why the awms ledger (출고목록, owned=Y) is not the stock — measured 2026-10-15,
see research/material_stock_mechanism_20261015.md:
  1. Modem replacement (M1020): the REMOVED old modem is booked to me as a 1-unit 출고
     on the replacement date. It is scrap, not stock. Detected via my getMainList
     EXT_FCTY_ID (9/2, 9/4: 9 MACs).
  2. Before the 6/22 bulk reissue (modems returned, then re-issued at once and every unit
     scanned) the ledger is wrong — e.g. the 6/18-19 Amigo box. From 6/22 on the count is
     right, IoT PLC (AC5E8C) and old K-DCU (847207 7th 0) included (영준님 2026-10-15). Hence --since.
  3. Other workers' installs booked to me (e.g. 01249850903, installed by 김영진 6/15,
     booked to me 9/4). Detected via modem_work_all (installs of everyone, to 9/18).
  4. Ledger 출고 date lags physical receipt (10/6 box was installed from 10/1).
  5. Today's registrations show up in 'used' only after the backend refresh.
"""
import argparse
import json
import sqlite3
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import awms_cst_detail as A  # noqa: E402

CACHE = ROOT / "cst-input/backend/shipped_cache.json"
DB = ROOT / "data/ami.db"
AMIGO = ("012497", "012498", "012536", "012642")
GTYPE = ("012540", "012545", "012556")


# 영준님 자재수령 양식 순서 (2026-10-15). Modem rows only — seals/cables/연결장치 are not in the 출고 list.
FORMAT = ["LTE 모뎀(AMIGO)", "LTE 모뎀(AE타입)", "LTE 모뎀(E타입)", "LTE 모뎀(G타입)",
          "PLC모뎀(AE타입)", "PLC모뎀(E 타입)", "PLC모뎀(AMIGO)",
          "IotPLC모뎀(AE타입)", "IotPLC모뎀(E 타입)", "IotPLC모뎀(AMIGO)",
          "HPGP모뎀(AE타입)", "HPGP모뎀(G타입)"]


def _history_type(m):
    # AE vs E for reused LTE / mixed PLC: majority of everyone's master installs on the same
    # 7-char prefix. 외장형연결장치=Y on an Adv-E meter = E modem via adapter (영준님 2026-10-15).
    # Measured table: research/modem_type_by_prefix_20261015.md (scripts/modem_type_map.py).
    if not DB.exists():
        return None
    c = sqlite3.connect(DB)
    e = ae = 0
    for mt, conn, n in c.execute(
            "SELECT 계기유형, 외장형연결장치, count(*) FROM modem_work_all WHERE mac_norm LIKE ? "
            "AND 모뎀유형='마스터' GROUP BY 1, 2", (m[:7] + "%",)):
        if mt == "E-type" or (mt == "Adv-E" and conn == "Y"):
            e += n
        elif mt == "Adv-E":
            ae += n
    if e + ae < 5:
        return None
    return "E" if e / (e + ae) >= 0.6 else ("AE" if ae / (e + ae) >= 0.6 else None)


def kind(m):
    # LTE Amigo/G prefixes: >99% of master installs. Other LTE = AE or E, prefixes reused ->
    # decided per 7-char prefix from history; unresolved stays "AE·E 확인".
    if m.startswith("012"):
        if m[:6] in AMIGO:
            return "LTE 모뎀(AMIGO)"
        if m[:6] in GTYPE:
            return "LTE 모뎀(G타입)"
        t = _history_type(m)
        return f"LTE 모뎀({t}타입)" if t else "LTE 모뎀(AE·E 확인)"
    # PLC: KS-PLC = DCU 1-4차, IoT-PLC = DCU 5-6차, K-DCU = IoT-PLC (영준님 2026-10-15).
    # Generation measured via DCU 차수 of the installs: E0AEED, 847207B/C/D = DCU1-4 (KS-PLC);
    # 8472070, 847207E, AC5E8C = DCU5-6 (IoT-PLC). 44B433/0014B0 = HPGP.
    if m.startswith("AC5E8C"):
        return "IotPLC모뎀(AMIGO)" if m[6:8] == "B0" else "IotPLC모뎀(AE타입)"
    if m.startswith("8472070"):
        return "IotPLC모뎀(E 타입)"  # 영준님; history: E-via-adapter majority
    if m.startswith("847207E"):
        return f"IotPLC모뎀({_history_type(m) or 'AE·E 확인'} 타입)"
    if m.startswith("E0AEED"):
        return "PLC모뎀(AE타입)"
    if m.startswith(("847207B", "847207C", "847207D")):
        return f"PLC모뎀({_history_type(m) or 'AE·E 확인'} 타입)".replace("(AE 타입)", "(AE타입)")
    if m.startswith(("44B433", "0014B0")):
        return "HPGP모뎀(AE타입)"
    return "미분류 " + m[:7]


def refresh():
    req = urllib.request.Request("http://127.0.0.1:8766/api/shipped/refresh", method="POST")
    try:
        print("출고목록 갱신:", urllib.request.urlopen(req, timeout=120).read().decode()[:200])
    except Exception as e:
        print("★갱신 실패(캐시로 계산):", e)


def replaced_ext(since):
    # One call per dept per month — a long range (or pRowCount 20000) returns HTTP 500.
    import datetime
    h = A.headers()
    ext = set()
    d, today = datetime.date(2026, 6, 1), datetime.date.today()
    while d <= today:
        nxt = (d.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
        end = min(nxt - datetime.timedelta(days=1), today)
        for code in A.DEPTS:
            rows = A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2={code}&searchKeyword=&sortKey=0"
                         f"&workStep=25,28,29&pPageNo=1&pRowCount=5000"
                         f"&strDate={d:%Y%m%d}&endDate={end:%Y%m%d}", h) or []
            for r in rows:
                e = (r.get("EXT_FCTY_ID") or "").strip()
                if r.get("WORK_DIV") == "M1020" and e and e != "-":
                    ext.add(e)
        d = nxt
    return ext


def others_installed(macs):
    if not DB.exists():
        return {}
    c = sqlite3.connect(DB)
    out = {}
    for m in macs:
        r = c.execute("SELECT 작업자1, substr(작업일자,1,10) FROM modem_work_all "
                      "WHERE 기존모뎀MAC=? AND 모뎀유형='마스터' ORDER BY 작업일자 LIMIT 1", (m,)).fetchone()
        if r:
            out[m] = r
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="20260622", help="수령분 기준일 — 6/22 반납 후 일괄 재출고(전량 스캔)부터 장부가 실물과 맞는다")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--no-refresh", action="store_true")
    a = ap.parse_args()
    if not a.no_refresh:
        refresh()
    d = json.loads(CACHE.read_text())
    rows, used = d["rows"], set(d["used"])
    own = {m: v for m, v in rows.items() if v.get("owned")}
    unused = [m for m in own if m not in used]
    ext = replaced_ext(a.since)
    other = others_installed(unused)

    drop = defaultdict(list)
    keep = defaultdict(list)
    for m in unused:
        y = own[m]["ymd"]
        if m in ext:
            drop["교체 회수(철거품)"].append(m)
        elif m in other:
            drop["타 작업자 시공분"].append(m)
        elif y < a.since:
            drop[f"{a.since} 이전 수령 잔여(박스 오등록)"].append(m)
        else:
            keep[kind(m)].append((y, m))

    print(f"\n장부 소유 {len(own)} · 미사용 {len(unused)}")
    for k, v in drop.items():
        print(f"  제외 {k}: {len(v)}")
    total = sum(len(v) for v in keep.values())
    print(f"\n실재고 추정 {total}개 ({a.since} 이후 수령)")
    for k in FORMAT + sorted(set(keep) - set(FORMAT)):
        v = sorted(keep[k])
        days = defaultdict(int)
        for y, _ in v:
            days[y] += 1
        print(f"  {k:18} {len(v):3}" + (f"  수령일 {dict(days)}" if v else ""))
        if a.list:
            print("     ", " ".join(m for _, m in v))
    singles = [(y, m) for k in keep for y, m in keep[k]
               if sum(1 for x in rows.values() if x["ymd"] == y) <= 3]
    if singles:
        print("\n  ★낱개 출고(실물 확인 필요):", sorted(singles))


if __name__ == "__main__":
    main()
