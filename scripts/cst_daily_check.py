#!/usr/bin/env python3
"""End-of-day check of my 아미큐 app registrations (영준님 2026-10-16: run this when the day ends).

    python3 scripts/cst_daily_check.py             # today (KST)
    python3 scripts/cst_daily_check.py 20261016    # a given day
    python3 scripts/cst_daily_check.py --no-ocr    # skip the MAC photo OCR

Needs a live awms session (아미큐 맥세션). Everything is fetched fresh on every run — a morning
snapshot misses the afternoon's registrations (2026-10-16: A0550069275 looked unregistered).

1. awms check — ★the base is the day's awms rows (getMainList), grouped by modem MAC. The
   아미큐 archive (~/.ami-cst-archive/<day>/) only tags the source: rows entered via the helper or
   the awms screen count too, and archive sends that never reached awms are listed separately.
   Checks: meter number format, duplicate meters, new-install MAC in my 출고 ledger or the
   off-book ledger and owned, MAC not used by another master this year, Amigo meter <-> Amigo MAC,
   PLC new install has DCU_ID, master has 4 photos (아미큐 rows), 지사 matches list.
2. Map check — places I marked complete on the map that day vs awms. Only the meters of the
   SAME list as the workStatus key (namespace -> list code). Mixing in other lists (the old
   completed archive, 25년 미청구) flagged false omissions on 2026-10-16: an old 플러스-app typo
   meter and an already-built 미청구 slave.
3. MAC OCR — for jobs whose MAC is NOT in my 출고 ledger (기설 joins, or a misread scan), read the
   모뎀맥 photo (slot 4) with Google Vision and confirm the MAC text appears on it.
"""
import argparse
import base64
import datetime
import glob
import json
import os
import pickle
import re
import sys
import urllib.request
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import awms_cst_detail as A  # noqa: E402
from my_stock import kind  # noqa: E402

ARCHIVE = Path.home() / ".ami-cst-archive"
BACKEND = "http://127.0.0.1:8766"
WS_URL = ("https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
          "/workStatus/charger4eleccar.json")
TOKEN = Path.home() / ".google-tokens/token.pickle"
OFFBOOK = ROOT / "cst-input/backend/offbook_stock.json"
ME = "우영준"
DEPT_NM = {"3600": "마포용산", "3500": "서대문은평", "7793": "서울본부직할", "3100": "광진성동",
           "3400": "노원도봉", "4080": "강북성북", "3000": "동대문중랑"}
# workStatus key namespace -> stats-site-index list code ('' = 실효; old completions are 'a')
NS_LIST = {"": ("s", "a"), "합동": ("h",), "미청구": ("m",), "미청구불가": ("u",), "장애": ("j",),
           "고압": ("g",), "skt": ("k",)}


def meter_kind(no):
    t = no[2:4]
    return {"17": "E", "19": "AE", "53": "AMIGO", "55": "AMIGO"}.get(
        t, "G" if t in ("25", "26", "27", "45", "46", "47") else "?")


def fetch(day):
    h = A.headers()
    year = day[:4] + "0101"
    rows = A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2=&searchKeyword=&sortKey=0&workStep=25,28,29"
                 f"&pPageNo=1&pRowCount=20000&strDate={year}&endDate={day}", h) or []
    try:  # refresh the 출고 ledger cache the badge uses
        urllib.request.urlopen(urllib.request.Request(f"{BACKEND}/api/shipped/refresh", method="POST"),
                               timeout=120).read()
    except Exception as e:
        print(f"[주의] 출고목록 갱신 실패 — 옛 캐시로 본다: {e}")
    ship = json.loads((ROOT / "cst-input/backend/shipped_cache.json").read_text())["rows"]
    ws = json.loads(urllib.request.urlopen(WS_URL, timeout=120).read())
    idx = defaultdict(list)
    for r in json.loads((ROOT / "data/stats-site-index.json").read_text()):
        idx[r["계기번호"]].append(r)
    return rows, ship, ws, idx


def offbook():
    """MAC -> batch label, from the off-book ledger (awms-unregistered stock, gitignored)."""
    try:
        out = {}
        for bt in json.loads(OFFBOOK.read_text()).get("batches", []):
            for m in bt.get("macs", []):
                out[re.sub(r"[\s:\-*]", "", m).upper()] = bt.get("label", "")
        return out
    except Exception:
        return {}


def app_check(day, jobs, rows, ship, idx):
    """★The base set is awms itself (영준님 2026-10-21: always check against awms values).
    The 아미큐 archive only says which rows came from 아미큐 — rows registered through the helper or
    the awms screen are in awms but not in the archive, and a failed send is in the archive but not
    in awms. Counting archive jobs reported 22 when awms had 21 places / 29 meters."""
    today = [r for r in rows if r.get("WORK_DATE") == day]
    ob = offbook()
    macuse = defaultdict(set)
    for r in rows:
        if r.get("MODEM_DIV") == "10" and r.get("MAC_MODEM"):
            macuse[r["MAC_MODEM"].upper()].add(r["INSTR_NUM"])
    via = {}                       # meter -> archive job dir (sent ok)
    for f, j in jobs:
        for s in j.get("sent", []):
            if s.get("ok"):
                via[s.get("meterNo")] = f
    groups = defaultdict(list)     # MAC -> rows (master MODEM_DIV 10 + slaves 20)
    for r in sorted(today, key=lambda r: r.get("REG_DATE") or 0):
        groups[(r.get("MAC_MODEM") or "").upper()].append(r)
    cnt = defaultdict(int)
    for r in today:
        cnt[r["INSTR_NUM"]] += 1
    n_m = n_s = bad = 0
    div_n = defaultdict(int)
    print(f"== 1. awms 등록 검사 (오늘 awms {len(today)}행 · 모뎀 {len(groups)}개)")
    for mac, rs in sorted(groups.items(), key=lambda x: min(r.get("REG_DATE") or 0 for r in x[1])):
        ms = [r for r in rs if r.get("MODEM_DIV") == "10"]
        ss = [r for r in rs if r.get("MODEM_DIV") != "10"]
        n_m += len(ms); n_s += len(ss)
        head = ms[0] if ms else rs[0]
        div = head.get("WORK_DIV", "")
        if ms:
            div_n[div] += 1
        iss = []
        if len(ms) > 1:
            iss.append(f"같은 맥 마스터 {len(ms)}개 {[r['INSTR_NUM'] for r in ms]}")
        note = ""
        if not ms:   # joined an existing modem — normal; its master is older or another worker's
            older = sorted(macuse.get(mac, set()))
            note = f"기존 모뎀 합류 — 마스터 {older[0] if older else '올해 내 기록 밖(작년·남의 것)'}"
        for r in rs:
            no = r["INSTR_NUM"]
            if not re.fullmatch(r"[0-9A-Z]{2}[0-9]{9}", no):
                iss.append(f"계기번호 형식 {no}")
            if cnt[no] > 1:
                iss.append(f"오늘 중복 계기 {no}")
        if ms and div in ("M1010", "M1020"):
            sr = ship.get(mac)
            if not sr and mac not in ob:
                iss.append("출고장부·따로장부 둘 다 없는 맥")
            elif sr and not sr.get("owned"):
                iss.append("내 소유 아닌 맥")
            if not mac.startswith("012") and not head.get("DCU_ID"):
                iss.append("PLC 신설인데 DCU_ID 빈값")
        if ms:
            others = macuse.get(mac, set()) - {r["INSTR_NUM"] for r in ms}
            if others:
                iss.append(f"같은 맥 다른 계기(올해) {sorted(others)}")
        if mac.startswith("012") and ms:
            k, mt = kind(mac), meter_kind(head["INSTR_NUM"])
            if (mt == "AMIGO") != ("AMIGO" in k):
                iss.append(f"{mt} 계기인데 {k}")
        dept = head.get("DEPT2", "")
        lists = []
        for r in rs:
            for x in idx.get(r["INSTR_NUM"], []):
                if x["l"] == "a":
                    continue
                lists.append(x["l"])
                if dept in DEPT_NM and not x["지사"].startswith(DEPT_NM[dept]):
                    iss.append(f"지사 불일치 {r['INSTR_NUM']}: awms {DEPT_NM[dept]} / 리스트 {x['지사']}")
        src = sorted({"아미큐" if r["INSTR_NUM"] in via else "아미큐 외(헬퍼·화면)" for r in rs})
        if ms and head["INSTR_NUM"] in via:
            sent0 = next((s for s in json.load(open(via[head["INSTR_NUM"]] / "job.json")).get("sent", [])
                          if s.get("meterNo") == head["INSTR_NUM"]), {})
            if len(sent0.get("photos", {})) < 4:
                iss.append("마스터 사진 4장 미만")
        tm = datetime.datetime.fromtimestamp((head.get("REG_DATE") or 0) / 1000, ZoneInfo("Asia/Seoul"))
        role = "마스터" if ms else "슬레이브"
        print(f"{tm:%H:%M} {head['INSTR_NUM']} {div} {role} 슬{len(ss) if ms else len(ss) - 1} {mac} {DEPT_NM.get(dept, dept)} "
              f"리스트[{','.join(sorted(set(lists))) or '없음'}] [{'/'.join(src)}]")
        if note:
            print(f"        ({note})")
        for r in (ss if ms else ss[1:]):
            print(f"        └ 슬레이브 {r['INSTR_NUM']} {r.get('WORK_DIV')}")
        for i in iss:
            print("     ★", i)
        bad += bool(iss)
    lost = []                      # in the 아미큐 archive but never reached awms
    aw = {r["INSTR_NUM"] for r in today}
    for f, j in jobs:
        for s in j.get("sent", []):
            if s.get("meterNo") not in aw:
                lost.append((f.name, s.get("meterNo"), "ok" if s.get("ok") else str(s.get("resp"))[:90]))
    for f, j in jobs:
        for no in j.get("skippedSlaves") or []:
            if no not in aw:
                lost.append((f.name, no, "슬레이브 건너뜀"))
    if lost:
        print("   -- 아미큐 전송 기록은 있는데 오늘 awms 에 없는 계기 (이미 있던 건이면 정상)")
        for name, no, why in lost:
            print(f"     {name[:2]}:{name[2:4]} {no} {why}")
    dv = " · ".join(f"{ {'M1010': '신설', 'M1020': '교체', 'M1030': '기설'}.get(k, k)} {v}"
                    for k, v in sorted(div_n.items()))
    print(f"   awms 오늘 계기 {len(today)} = 마스터 {n_m} ({dv}) + 슬레이브 {n_s} · "
          f"아미큐 전송 {len(jobs)}회 · 문제 있는 모뎀 {bad}\n")


def map_check(day, rows, ws, idx):
    aw = {r["INSTR_NUM"] for r in rows}
    by_addr = defaultdict(list)
    for no, xs in idx.items():
        for x in xs:
            by_addr[(x["주소"], x["l"])].append(no)
    iso = f"{day[:4]}-{day[4:6]}-{day[6:]}"
    done = fail = 0
    print("== 2. 지도 완료 ↔ awms (같은 리스트 계기만)")
    for k, v in sorted(ws.items(), key=lambda x: x[1].get("updatedAt", "")):
        if not v.get("updatedAt", "").startswith(iso) or v.get("updatedByName") != ME:
            continue
        if v.get("state") != "complete":
            fail += 1
            continue
        done += 1
        addr, _, ns = k.partition("|")
        ms = []
        if isinstance(v.get("site"), dict):
            # site added from the map (js/add-site.js): its meters live only in added_meters, not in the index
            ms = sorted((v.get("added_meters") or {}).keys())
        for code in (() if ms else NS_LIST.get(ns, ("s",))):
            ms = by_addr.get((addr, code), [])
            if ms:
                break
        miss = [m for m in ms if m not in aw]
        if miss or not ms:
            print(f"   ★ {v['updatedAt'][11:16]} {k} 리스트계기 {ms} awms 없음 {miss}")
    print(f"   완료 {done}곳 · 실패(문잠김 등) {fail}곳\n")


def ocr_check(jobs, ship):
    todo = [(f, j) for f, j in jobs if (j["master"].get("mac") or "").upper() not in ship]
    print(f"== 3. 미출고 맥 사진 OCR ({len(todo)}건)")
    if not todo:
        return
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    c = pickle.load(open(TOKEN, "rb"))
    if c.expired and c.refresh_token:
        c.refresh(Request())
        pickle.dump(c, open(TOKEN, "wb"))
    v = build("vision", "v1", credentials=c)
    for f, j in todo:
        mac = j["master"]["mac"].upper()
        img = f / "master_4.jpg"
        if not img.exists():
            print(f"   ★ {j['master']['meterNo']} {mac} 모뎀맥 사진 없음")
            continue
        r = v.images().annotate(body={"requests": [{
            "image": {"content": base64.b64encode(img.read_bytes()).decode()},
            "features": [{"type": "TEXT_DETECTION"}]}]}).execute()
        t = (r["responses"][0].get("fullTextAnnotation") or {}).get("text", "")
        ok = mac in re.sub(r"[\s:\-]", "", t.upper())
        div = (j.get("sent") or [{}])[0].get("fields", {}).get("WORK_DIV", "")
        print(f"   {'일치' if ok else '★불일치'} {j['master']['meterNo']} {div} {mac}  사진: {img}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day", nargs="?", default=datetime.datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d"))
    ap.add_argument("--no-ocr", action="store_true")
    a = ap.parse_args()
    jobs = [(Path(f).parent, json.load(open(f)))
            for f in sorted(glob.glob(str(ARCHIVE / a.day / "*/job.json")))]
    rows, ship, ws, idx = fetch(a.day)
    print(f"[{a.day}] awms 올해 {len(rows)}행 · 출고장부 {len(ship)} · 지도 {len(ws)}키 — 방금 받음\n")
    app_check(a.day, jobs, rows, ship, idx)
    map_check(a.day, rows, ws, idx)
    if not a.no_ocr:
        ocr_check(jobs, ship)


if __name__ == "__main__":
    main()
