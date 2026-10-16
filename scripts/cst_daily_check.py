#!/usr/bin/env python3
"""End-of-day check of my 아미큐 app registrations (영준님 2026-10-16: run this when the day ends).

    python3 scripts/cst_daily_check.py             # today (KST)
    python3 scripts/cst_daily_check.py 20261016    # a given day
    python3 scripts/cst_daily_check.py --no-ocr    # skip the MAC photo OCR

Needs a live awms session (아미큐 맥세션). Everything is fetched fresh on every run — a morning
snapshot misses the afternoon's registrations (2026-10-16: A0550069275 looked unregistered).

1. App check — every job in ~/.ami-cst-archive/<day>/ against live awms getMainList:
   sent ok, awms row exists with the same MAC, meter number format, duplicate meters,
   new-install MAC is in my 출고 ledger and owned, MAC not used by another meter this year,
   Amigo meter <-> Amigo MAC, PLC new install has DCU_ID, master has 4 photos, 지사 matches list.
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


def app_check(day, jobs, rows, ship, idx):
    today = {r["INSTR_NUM"]: r for r in rows if r.get("WORK_DATE") == day}
    macuse = defaultdict(set)
    for r in rows:
        if r.get("MODEM_DIV") == "10" and r.get("MAC_MODEM"):
            macuse[r["MAC_MODEM"].upper()].add(r["INSTR_NUM"])
    seen, bad, meters_n = set(), 0, 0
    print(f"== 1. 앱 작성 검사 ({len(jobs)}건)")
    for f, j in jobs:
        m = j["master"]
        mac = (m.get("mac") or "").upper()
        meters = [m["meterNo"]] + [s["meterNo"] for s in j.get("slaves", [])]
        sent0 = (j.get("sent") or [{}])[0]
        div = sent0.get("fields", {}).get("WORK_DIV", "")
        iss = [f"전송실패 {s.get('meterNo')} {s.get('resp')}" for s in j.get("sent", []) if not s.get("ok")]
        r = today.get(m["meterNo"])
        if not r:
            iss.append("awms 에 등록 없음 (삭제했으면 정상)")
        elif (r.get("MAC_MODEM") or "").upper() != mac:
            iss.append(f"awms MAC 다름 {r.get('MAC_MODEM')}")
        for no in meters:
            if not re.fullmatch(r"[0-9A-Z]{2}[0-9]{9}", no):
                iss.append(f"계기번호 형식 {no}")
            if no in seen:
                iss.append(f"오늘 중복 계기 {no}")
            seen.add(no)
            if r and no != m["meterNo"] and no not in today:
                iss.append(f"슬레이브 awms 없음 {no}")
        if div in ("M1010", "M1020"):
            sr = ship.get(mac)
            if not sr:
                iss.append("출고장부에 없는 맥")
            elif not sr.get("owned"):
                iss.append("내 소유 아닌 맥")
            if not mac.startswith("012") and not sent0.get("fields", {}).get("DCU_ID"):
                iss.append("PLC 신설인데 DCU_ID 빈값")
        if r:
            others = macuse.get(mac, set()) - {m["meterNo"]}
            if others:
                iss.append(f"같은 맥 다른 계기 {sorted(others)}")
        if mac.startswith("012"):
            k, mt = kind(mac), meter_kind(m["meterNo"])
            if (mt == "AMIGO") != ("AMIGO" in k):
                iss.append(f"{mt} 계기인데 {k}")
        if len(sent0.get("photos", {})) < 4:
            iss.append("마스터 사진 4장 미만")
        dept = j["config"]["DEPT2"]
        lists = []
        for no in meters:
            for x in idx.get(no, []):
                if x["l"] == "a":
                    continue
                lists.append(x["l"])
                if dept in DEPT_NM and not x["지사"].startswith(DEPT_NM[dept]):
                    iss.append(f"지사 불일치 {no}: 작성 {DEPT_NM[dept]} / 리스트 {x['지사']}")
        tm = f.name[:4]
        print(f"{tm[:2]}:{tm[2:]} {m['meterNo']} {div} {j.get('ham')} 슬{len(meters) - 1} {mac} "
              f"{DEPT_NM.get(dept, dept)} 리스트[{','.join(sorted(set(lists))) or '없음'}]")
        for i in iss:
            print("     ★", i)
        bad += bool(iss)
        meters_n += len(meters) if r else 0
    print(f"   작성 {len(jobs)}건 (awms 에 있는 계기 {meters_n}) · 문제 있는 건 {bad}\n")


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
        for code in NS_LIST.get(ns, ("s",)):
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
