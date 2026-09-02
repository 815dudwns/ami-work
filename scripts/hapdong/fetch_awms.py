#!/usr/bin/env python3
"""
합동시공 리스트 수집 — awms FMPMTR(계기관리 WEB) 연간대상 실효계기 목록

합동시공을 하지 않는 조들의 계기교체 완료건을 지사별로 받아온다.
계기만 갈리고 통신(모뎀)이 안 붙은 개소 = 우리 통신팀이 다음날 가야 할 곳.

사용:
  python3 scripts/hapdong/fetch_awms.py                # 오늘치
  python3 scripts/hapdong/fetch_awms.py 20260819       # 특정일
  python3 scripts/hapdong/fetch_awms.py --check        # 세션 살아있는지만 확인

세션:
  ~/.awms-tokens/fmpmtr.json 의 JSESSIONID 사용.
  만료됐으면 scripts/hapdong/pull_session.py 로 폰(헬퍼 WebView)에서 다시 뽑는다.
  ★계정은 윤용운 반장(231918) — 이 화면은 그 계정으로만 열린다.
"""
import json
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import urllib.request
import urllib.parse
import urllib.error

KST = ZoneInfo("Asia/Seoul")
BASE = "https://awms.kdn.com/ami/fmp/mtr/fmpMtr1000/selectList"
TOKEN_PATH = Path.home() / ".awms-tokens" / "fmpmtr.json"
OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "inbox_hapdong"

# 합동시공을 하지 않는 조들의 지사.
# 한 지사에 여러 조가 섞인 곳은 공사번호로 우리 대상만 거른다(주소가 비어도 걸러진다).
#   서울본부직할(7793) = 종로(...383) / 중구(...155) 혼재 -> 종로만
#   마포용산(3600)     = 마포(...119, ...120) / 용산(...101) 혼재 -> 마포만
DEPTS = [
    {"cd": "3100", "nm": "광진성동", "cons": None},
    {"cd": "3400", "nm": "노원도봉", "cons": None},
    {"cd": "4080", "nm": "강북성북", "cons": None},
    {"cd": "7793", "nm": "서울본부직할", "cons": lambda c: c.endswith("383")},
    {"cd": "3600", "nm": "마포용산", "cons": lambda c: c.endswith(("119", "120"))},
    # ★전지사로 넓힘(영준님 2026-08-31 "31일 전지사 9/1일 전지사"). 8/31 에 동대문중랑만 93건이
    #   나왔는데 이 목록에 없어서 그날은 임시로 돌렸고, 9/2 수집에서 다시 0건이 됐다.
    #   임시로 돌린 지사는 다음 날 반드시 빠진다 — 목록에 넣어야 안 빠진다.
    {"cd": "3000", "nm": "동대문중랑", "cons": None},
    {"cd": "3500", "nm": "서대문은평", "cons": None},
]

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://awms.kdn.com/html/main/index.html?app=FMPMTR&menu=01010000",
    "User-Agent": (
        "Mozilla/5.0 (Linux; Android 16; SM-A336N) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/150 Mobile Safari/537.36"
    ),
}


def load_session():
    if not TOKEN_PATH.exists():
        sys.exit(f"세션 파일 없음: {TOKEN_PATH}\n  → python3 scripts/hapdong/pull_session.py 먼저 실행")
    tok = json.loads(TOKEN_PATH.read_text())
    sid = tok.get("JSESSIONID")
    if not sid:
        sys.exit("JSESSIONID 없음 — pull_session.py 재실행")
    exp = tok.get("expires")
    if exp:
        left = datetime.fromtimestamp(exp, KST) - datetime.now(KST)
        if left.total_seconds() < 0:
            print(f"[경고] 세션 만료 시각 지남 ({datetime.fromtimestamp(exp, KST):%Y-%m-%d %H:%M})", file=sys.stderr)
        else:
            print(f"[세션] 남은 시간 {str(left).split('.')[0]} (계정 {tok.get('account', '?')})", file=sys.stderr)
    return sid


def query(sid, params, timeout=120):
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={**HEADERS, "Cookie": f"JSESSIONID={sid}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode("utf-8")
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise RuntimeError(f"JSON 아님 (세션 만료 의심): {body[:200]}")


def fetch_day(sid, day):
    """day = 'YYYYMMDD'"""
    rows, summary = [], {}
    for d in DEPTS:
        params = {
            "dept1": "3970", "dept2": d["cd"], "wrkCl": "", "lvHvCl": "",
            "wrkYn": "", "wrkStep": "", "loginBupeId": "",
            "workStrDate": day + "0000", "workEndDate": day + "2359",
            "searchVal": "", "pPageNo": "1", "pRowCount": "5000",
            "sortKey": "", "matchYn": "N",
        }
        got = query(sid, params)
        if not isinstance(got, list):
            summary[d["nm"]] = {"오류": str(got)[:200]}
            continue
        kept = [x for x in got if d["cons"](str(x.get("CONS_NO") or ""))] if d["cons"] else got
        for x in kept:
            x["__deptNm"] = d["nm"]
            rows.append(x)
        cons = {}
        for x in got:
            cons[x.get("CONS_NO")] = cons.get(x.get("CONS_NO"), 0) + 1
        summary[d["nm"]] = {"조회": len(got), "채택": len(kept), "공사번호별": cons}
        print(f"  {d['nm']:8} 조회 {len(got):4}  채택 {len(kept):4}", file=sys.stderr)
    return {"day": day, "total": len(rows), "summary": summary, "rows": rows}


def main():
    args = [a for a in sys.argv[1:]]
    sid = load_session()

    if "--check" in args:
        params = {
            "dept1": "3970", "dept2": "3400", "wrkCl": "", "lvHvCl": "",
            "wrkYn": "", "wrkStep": "", "loginBupeId": "",
            "workStrDate": "202608190000", "workEndDate": "202608192359",
            "searchVal": "", "pPageNo": "1", "pRowCount": "1",
            "sortKey": "", "matchYn": "N",
        }
        try:
            got = query(sid, params, timeout=60)
            print("세션 정상" if isinstance(got, list) else f"이상 응답: {got}")
        except Exception as e:
            sys.exit(f"세션 죽음: {e}")
        return

    day = next((a for a in args if a.isdigit() and len(a) == 8), None)
    if not day:
        day = datetime.now(KST).strftime("%Y%m%d")
    print(f"[수집] {day} (KST)", file=sys.stderr)

    result = fetch_day(sid, day)
    # ★0건이면 저장하지 않는다. 세션 만료(403)나 조회 실패도 0건으로 떨어지는데,
    #   그대로 덮으면 멀쩡하던 원본이 빈 파일이 된다(2026-09-02 실제 사고).
    #   진짜로 그날 작업이 없었다면 파일을 안 만드는 편이 안전하다 — 빌더는 없는 날을 건너뛴다.
    if not result.get("rows"):
        print(f"[중단] {day} 조회 0건 — 저장하지 않는다. 세션 만료(403)인지 확인하라.",
              file=sys.stderr)
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"hapdong_raw_{day}.json"
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1))
    print(f"[완료] {result['total']}건 → {out}", file=sys.stderr)
    print(out)


if __name__ == "__main__":
    main()
