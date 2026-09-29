#!/usr/bin/env python3
"""awms MOBCST 시공건 되읽기 — 우리가 보낸 값이 실제로 어느 칸에 들어갔는지 확인한다.

    python3 scripts/awms_cst_detail.py 96190402973          # 계기 하나
    python3 scripts/awms_cst_detail.py --date 20260929      # 그날 전건의 비고 계열만 표로

★왜 필요한가(2026-09-29): 25리스트 비고를 `REMV_MEMO` 에 넣었더니 전송은 result:1 로 통과하는데
  영준님 화면 비고란은 빈칸이었다. `getMainList` 에는 비고 칸이 아예 없어서 되읽을 수가 없었고,
  그래서 틀린 필드를 쓰고도 몰랐다. **보낸 뒤 되읽어 확인하는 경로가 있어야 한다.**

★필드 대응 (awms 화면 MOBCST1000 실측)
    ETC1  = 비고        (100자)  <- 우리가 '25' 를 넣는 칸
    ETC   = 비고        (33자, 다른 구역)
    ETC2  = 신호측정
    ETC3  = 비고2
    REMV_MEMO = 구분상세 (교체 M1020 의 M102010 등) — **비고가 아니다**

★함정: `EXT_FCTY_ID` 는 getMainList 가 준 값을 **그대로** 넘겨야 한다(신설이면 문자 '-').
  빈 문자열로 넘기면 본문 0바이트가 돌아온다 — 이 때문에 "MOBCST getDetail 은 빈 응답"으로
  오래 오해했다. getDetail 은 멀쩡히 살아 있다.
"""
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

AWMS = "https://awms.kdn.com/ami/mob/cst/mobCst1000"
SESSIONS = [Path("/Users/woodelight/Projects/ami-work/cst-input/backend/session.json"),
            Path(__file__).resolve().parent.parent / "cst-input/backend/session.json"]
MEMO_FIELDS = ["ETC", "ETC1", "ETC2", "ETC3", "REMV_MEMO"]
DEPTS = ["3100", "3400", "4080", "7793", "3600", "3000", "3500"]


def headers():
    for p in SESSIONS:
        if p.exists():
            s = json.loads(p.read_text())
            if s.get("jsessionid"):
                return {"Cookie": f"JSESSIONID={s['jsessionid']}",
                        "User-Agent": s.get("ua") or "Mozilla/5.0",
                        "Accept": "application/json, text/plain, */*",
                        "Referer": "https://awms.kdn.com/service/ami/html/sub/mob/cst/MOBCST1000.html?app=MOBCST"}
    sys.exit("세션 없음 — 아미큐 맥세션이 필요하다")


def get(path, h):
    with urllib.request.urlopen(urllib.request.Request(f"{AWMS}/{path}", headers=h), timeout=90) as r:
        ctype, body = r.headers.get("content-type", ""), r.read()
    if "json" not in ctype:
        if not body:
            return None                      # 파라미터 불일치 = 빈 본문
        sys.exit(f"★세션 만료로 보인다(content-type={ctype})")
    return json.loads(body)


def main_list(day, h):
    rows = []
    for code in DEPTS:
        d = get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2={code}&searchKeyword=&sortKey=0"
                f"&workStep=25,28,29&pPageNo=1&pRowCount=5000&strDate={day}&endDate={day}", h) or []
        rows += d
    return rows


def detail(row, h):
    q = urllib.parse.urlencode({
        "FLAG": "M10", "DEPT1": row.get("DEPT1") or "3970", "BUSI_NUM": row.get("BUSI_NUM") or "",
        "DATA_NUM": row.get("DATA_NUM") or "", "EXT_DCU_ID": "",
        "INSTR_NUM": row.get("INSTR_NUM") or "", "MAC_MODEM": row.get("MAC_MODEM") or "",
        "EXT_FCTY_ID": row.get("EXT_FCTY_ID") or "",   # ★'-' 를 그대로 넘긴다
    })
    return get("getDetail?" + q, h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("meter", nargs="?")
    ap.add_argument("--date", help="YYYYMMDD — 그날 전건")
    a = ap.parse_args()
    h = headers()
    day = a.date or time.strftime("%Y%m%d")
    rows = main_list(day, h)
    if a.meter:
        rows = [r for r in rows if str(r.get("INSTR_NUM")) == a.meter]
        if not rows:
            sys.exit(f"{day} 작업목록에 {a.meter} 없음 — --date 로 날짜를 맞춰라")
        d = detail(rows[0], h)
        if d is None:
            sys.exit("상세가 빈 응답 — EXT_FCTY_ID 를 getMainList 값 그대로 넘겼는지 확인하라")
        print(json.dumps(d, ensure_ascii=False, indent=1))
        return
    print(f"{day} — {len(rows)}행")
    print(f"{'계기':13}{'MD':4}" + "".join(f"{f:12}" for f in MEMO_FIELDS))
    for r in rows:
        d = detail(r, h)
        if d is None:
            print(f"{str(r.get('INSTR_NUM')):13}{str(r.get('MODEM_DIV')):4}(상세 빈응답)")
            continue
        print(f"{str(r.get('INSTR_NUM')):13}{str(r.get('MODEM_DIV')):4}"
              + "".join(f"{str(d.get(f) or ''):12}" for f in MEMO_FIELDS))
        time.sleep(0.15)


if __name__ == "__main__":
    main()
