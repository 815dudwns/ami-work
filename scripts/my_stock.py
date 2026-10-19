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

FORMAT_B = ["LTE 모뎀(AMIGO)", "LTE 모뎀(AE·E타입)", "LTE 모뎀(G타입)", "PLC모뎀(AE타입)", "PLC모뎀(E 타입)",
            "PLC모뎀(AMIGO)", "IotPLC모뎀(AE타입)", "IotPLC모뎀(E 타입)", "IotPLC모뎀(AMIGO)",
            "HPGP모뎀(AE타입)", "HPGP모뎀(G타입)"]


TYPE_OVERRIDE = Path(__file__).resolve().parent.parent / "cst-input/backend/stock_type_override.json"


def _history_type(m):
    # A type confirmed on the physical label wins (reused LTE prefixes are mixed)
    try:
        t = json.loads(TYPE_OVERRIDE.read_text()).get("macs", {}).get(m, {}).get("type")
        if t:
            return t
    except Exception:
        pass
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
        for code in ALL_DEPTS:
            rows = A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2={code}&searchKeyword=&sortKey=0"
                         f"&workStep=25,28,29&pPageNo=1&pRowCount=5000"
                         f"&strDate={d:%Y%m%d}&endDate={end:%Y%m%d}", h) or []
            for r in rows:
                e = (r.get("EXT_FCTY_ID") or "").strip()
                if r.get("WORK_DIV") == "M1020" and e and e != "-":
                    ext.add(e)
        d = nxt
    return ext


def _mtl6000(radio, yn=""):
    import urllib.parse
    h = A.headers()
    h["Referer"] = "https://awms.kdn.com/html/main/index.html?app=MOBMTL&menu=MOBMTL6000"
    q = urllib.parse.urlencode({"radioVal": radio, "vFclClCode": "", "vMtlCode": "", "vShpPurpCtt": "",
                                "sortCd": "1", "searchVal": "", "myMtrlYn": yn})
    req = urllib.request.Request(f"https://awms.kdn.com/ami/mob/mtl/mobMtl6000/selectList?{q}", headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=60).read() or b"[]")


def self_shipped():
    # 출고 rows whose 인계자(HNDOVR_USER_ID) is me: awms books MACs used in 장애 replacement
    # work to me as a 1-unit 출고 from myself. Not stock (영준님 2026-10-16: "순수 내가 출고등록과
    # 이관등록한 것만 내 것"). Real 출고 rows have the warehouse (18104059) or '-' as 인계자.
    me = "273584"
    return {(x.get("FCTY_ID") or "").replace(":", "").upper() for x in _mtl6000("20")
            if str(x.get("HNDOVR_USER_ID")) == me}


def handovers():
    # 자재이력조회 '인계' tab (radioVal=40): modems other workers handed over to me (자재인계).
    # The backend cache holds only the 출고 tab, so these were missing until 2026-10-16
    # (영준님: "인계목록에 있는 것도 내 것"). myMtrlYn=N marks the ones no longer mine.
    import urllib.parse
    h = A.headers()
    h["Referer"] = "https://awms.kdn.com/html/main/index.html?app=MOBMTL&menu=MOBMTL6000"
    out = {}
    for yn in ("", "N"):
        q = urllib.parse.urlencode({"radioVal": "40", "vFclClCode": "", "vMtlCode": "", "vShpPurpCtt": "",
                                    "sortCd": "1", "searchVal": "", "myMtrlYn": yn})
        req = urllib.request.Request(f"https://awms.kdn.com/ami/mob/mtl/mobMtl6000/selectList?{q}", headers=h)
        for x in json.loads(urllib.request.urlopen(req, timeout=60).read() or b"[]"):
            m = (x.get("FCTY_ID") or "").replace(":", "").upper()
            if yn == "":
                out[m] = {"ymd": x.get("WRHSG_SHP_YMD") or "", "sts": x.get("MTRL_STS_CD") or "",
                          "owned": True, "from": x.get("HNDOVR_USER_NM") or ""}
            elif m in out:
                out[m]["owned"] = False
    return out


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


# The 7 branch codes miss rows registered under 기타·기타2·구좌(PLC) etc. — measured 2026-10-16:
# 6/23 92190689274·92190685309 (KS-PLC 9528E4/E5) sat under 9999 기타2 and looked unused.
ALL_DEPTS = A.DEPTS + ["5999", "9922", "9999", "9100", "3985", "7290"]
BASELINE = ROOT / "cst-input/backend/stock_baseline.json"   # gitignored


def bucket(k):
    # baseline buckets: LTE AE and E are counted together physically
    return "LTE 모뎀(AE·E타입)" if k.startswith("LTE 모뎀(AE") or k == "LTE 모뎀(E타입)" else k


def from_baseline(a):
    """Physical count on a date + receipts after it - modems I installed after it.

    Why (2026-10-16): the ledger cannot be reconciled — box-scan registrations that never matched
    the box, misread MACs on registration, and IoT-PLC AE modems that arrive with no 출고 record
    at all. So 영준님 counted physically once; from then on only the delta is computed.
    """
    import datetime
    b = json.loads(BASELINE.read_text())
    ts = b["ts"] * 1000
    stock = defaultdict(int, b["counts"])
    print(f"기준 실물 {sum(stock.values())}개 ({datetime.datetime.fromtimestamp(b['ts']):%m/%d %H:%M})")
    # receipts after the baseline: 출고 (not self-handover) + 인계
    me = "273584"
    got = []
    for radio in ("20", "40"):
        for x in _mtl6000(radio):
            if (x.get("REG_DATE") or 0) > ts and not (radio == "20" and str(x.get("HNDOVR_USER_ID")) == me):
                got.append((x.get("FCTY_ID") or "").upper())
    for m in got:
        stock[bucket(kind(m))] += 1
    # installs after the baseline: master rows that consumed a new modem (신설·교체), one per meter
    h = A.headers()
    d0 = datetime.datetime.fromtimestamp(b["ts"]).strftime("%Y%m%d")
    today = datetime.date.today().strftime("%Y%m%d")
    seen, used, rows = set(), [], []
    for code in ALL_DEPTS:
        rows += A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2={code}&searchKeyword=&sortKey=0"
                      f"&workStep=25,28,29&pPageNo=1&pRowCount=5000&strDate={d0}&endDate={today}", h) or []
    for r in sorted(rows, key=lambda r: r.get("REG_DATE") or 0):
        m = (r.get("MAC_MODEM") or "").upper()
        if (r.get("REG_DATE") or 0) <= ts or r.get("MODEM_DIV") != "10" or r.get("WORK_DIV") not in ("M1010", "M1020"):
            continue
        key = r.get("INSTR_NUM")
        if key in seen:      # re-sent after a MAC fix: the old row stays until KDN deletes it
            print(f"  ★같은 계기 재등록(이중 차감 안 함): {key} {m}")
            continue
        seen.add(key)
        prior = A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2=&searchKeyword={key}&sortKey=0&workStep=25,28,29"
                      f"&pPageNo=1&pRowCount=50&strDate=20260101&endDate={today}", h) or []
        if any(x.get("INSTR_NUM") == key and x.get("MODEM_DIV") == "10" and (x.get("REG_DATE") or 0) <= ts
               for x in prior):
            print(f"  정정 재저장(차감 안 함): {key} {m}")
            continue
        used.append((m, r.get("WORK_DATE"), key))
        stock[bucket(kind(m))] -= 1
    _c = json.loads(CACHE.read_text())
    ledger = set(_c.get("ledger") or _c["rows"]) | set(handovers())  # backend now strips self-handover/excluded from rows
    print(f"이후 수령 {len(got)} · 이후 시공 {len(used)}")
    print(f"\n현재 재고 {sum(stock.values())}개")
    for k in FORMAT_B + sorted(set(stock) - set(FORMAT_B)):
        if stock.get(k):
            print(f"  {k:18} {stock[k]:3}")
    odd = [(m, d, n) for m, d, n in used if m not in ledger and not m.startswith("AC5E8CA")]
    if odd:
        print("\n  ★장부에 없는 MAC으로 시공(오독 의심 — 재전송 확인):")
        for m, d, n in odd:
            print(f"     {d} 계기 {n}  MAC {m}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="20260622", help="수령분 기준일 — 6/22 반납 후 일괄 재출고(전량 스캔)부터 장부가 실물과 맞는다")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--no-refresh", action="store_true")
    ap.add_argument("--ledger", action="store_true", help="기준 실물 대신 장부 추정 방식으로")
    a = ap.parse_args()
    if not a.no_refresh:
        refresh()
    if BASELINE.exists() and not a.ledger:
        return from_baseline(a)
    d = json.loads(CACHE.read_text())
    rows, used = d["rows"], set(d["used"])
    hand = handovers()
    print(f"인계 받은 모뎀 {len(hand)} (소유 {sum(v['owned'] for v in hand.values())})")
    rows = {**hand, **rows}
    own = {m: v for m, v in rows.items() if v.get("owned")}
    unused = [m for m in own if m not in used]
    ext = replaced_ext(a.since)
    selfs = self_shipped()
    other = others_installed(unused)

    drop = defaultdict(list)
    keep = defaultdict(list)
    for m in unused:
        y = own[m]["ymd"]
        if m in ext:
            drop["교체 회수(철거품)"].append(m)
        elif m in selfs:
            drop["장애 교체 투입(자기 인계 출고)"].append(m)
        elif m in other:
            drop["타 작업자 시공분"].append(m)
        elif y < a.since and m not in hand:  # 인계 rows count regardless of date (영준님)
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
