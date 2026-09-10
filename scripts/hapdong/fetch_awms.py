#!/usr/bin/env python3
"""
합동시공 리스트 수집 — awms FMPMTR(계기관리 WEB) 연간대상 실효계기 목록

합동시공을 하지 않는 조들의 계기교체 완료건을 지사별로 받아온다.
계기만 갈리고 통신(모뎀)이 안 붙은 개소 = 우리 통신팀이 다음날 가야 할 곳.

★조회 범위는 '전 수집 시점부터 이번 수집까지'다 (영준님 지시 2026-09-10)
  예전엔 **그날 하루만** 조회했다. 그래서 수집을 끝낸 뒤 늦게 올라온 물량이 통째로 빠졌다.
  실측 2026-09-10: 9/9 19:27 에 수집했는데 마포용산이 같은 날 23:20~23:53 에 24건을 몰아
  올렸고(서교동, 솔빌딩 한 건물에 9건), 다음날 수집은 20260910 만 봐서 그 24건이 지도에
  영영 안 올라왔다. 현장에서 누가 알아채기 전엔 드러나지 않는다.
  ※마포용산·서울본부직할은 밤 22~24시에 올리는 일이 잦다. **전날치는 늘 다시 받아야 한다.**
  마지막 수집일은 data/inbox_hapdong/last_fetch.json 에 남는다.

사용:
  python3 scripts/hapdong/fetch_awms.py                # 마지막 수집일~오늘 (최소 어제~오늘)
  python3 scripts/hapdong/fetch_awms.py 20260819       # 그날 하루만 (범위 무시)
  python3 scripts/hapdong/fetch_awms.py --from 20260901  # 그날부터 오늘까지
  python3 scripts/hapdong/fetch_awms.py --days 5       # 오늘 포함 최근 5일
  python3 scripts/hapdong/fetch_awms.py --check        # 세션 살아있는지만 확인

세션:
  ~/.awms-tokens/fmpmtr.json 의 JSESSIONID 사용.
  만료됐으면 scripts/hapdong/pull_session.py 로 폰(헬퍼 WebView)에서 다시 뽑는다.
  ★계정은 윤용운 반장(231918) — 이 화면은 그 계정으로만 열린다.
"""
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import urllib.request
import urllib.parse
import urllib.error

KST = ZoneInfo("Asia/Seoul")
BASE = "https://awms.kdn.com/ami/fmp/mtr/fmpMtr1000/selectList"
TOKEN_PATH = Path.home() / ".awms-tokens" / "fmpmtr.json"
OUT_DIR = Path(__file__).resolve().parents[2] / "data" / "inbox_hapdong"

# ─── 마지막 수집 시점 ───────────────────────────────────────────────────────
# 다음 수집이 '전 수집 시점부터' 훑도록 남기는 표식(영준님 지시 2026-09-10).
#   ★이 파일이 없거나 깨져도 멈추지 않는다 — 그때는 '어제~오늘'로 간다.
#     최소 보장이 있어야 파일을 잃어도 밤 등재분을 놓치지 않는다.
#   ★조회에 실패한 날이 하나라도 있으면 갱신하지 않는다. 갱신해 버리면 그 구멍을
#     다음 수집이 건너뛰어 영영 안 메워진다.
LAST_FETCH_PATH = OUT_DIR / "last_fetch.json"

# 범위를 안 정했을 때 반드시 포함하는 최소 일수(오늘 포함) — 오늘과 어제.
MIN_LOOKBACK_DAYS = 2


def load_last_fetch_day():
    """마지막으로 수집을 끝낸 날('YYYYMMDD'). 없거나 이상하면 None."""
    try:
        v = json.loads(LAST_FETCH_PATH.read_text())
        d = str(v.get("lastFetchDay") or "")
        return d if len(d) == 8 and d.isdigit() else None
    except Exception:
        return None


def save_last_fetch(days):
    LAST_FETCH_PATH.write_text(json.dumps({
        "lastFetchDay": days[-1],
        "lastFetchAt": datetime.now(KST).isoformat(),
        "fetchedRange": [days[0], days[-1]],
    }, ensure_ascii=False, indent=1))


def day_range(start, end):
    """'YYYYMMDD' 두 개를 받아 그 사이 날짜를 모두 돌려준다(양끝 포함)."""
    s = datetime.strptime(start, "%Y%m%d").date()
    e = datetime.strptime(end, "%Y%m%d").date()
    if s > e:
        s = e
    out = []
    while s <= e:
        out.append(s.strftime("%Y%m%d"))
        s += timedelta(days=1)
    return out


def resolve_days(args):
    """이번에 조회할 날짜 목록. 규칙은 모듈 docstring 참고."""
    today = datetime.now(KST).strftime("%Y%m%d")

    # ★플래그를 먼저 본다. 뒤에 오는 날짜는 그 플래그의 값이지 '특정일 지정'이 아니다
    #   ('--from 20260908' 이 '20260908 하루만'으로 읽히던 것을 잡았다).
    if "--days" in args:
        i = args.index("--days")
        n = int(args[i + 1]) if i + 1 < len(args) and args[i + 1].isdigit() else MIN_LOOKBACK_DAYS
        n = max(1, n)
        start = (datetime.now(KST) - timedelta(days=n - 1)).strftime("%Y%m%d")
        return day_range(start, today), f"최근 {n}일"

    if "--from" in args:
        i = args.index("--from")
        if i + 1 < len(args) and args[i + 1].isdigit() and len(args[i + 1]) == 8:
            return day_range(args[i + 1], today), "지정 시작일~오늘"

    explicit = next((a for a in args if a.isdigit() and len(a) == 8), None)
    if explicit:
        # 특정일 지정은 그 하루만 본다 — 과거를 다시 받을 때 범위가 번지면 곤란하다.
        return [explicit], "지정일"

    # 기본 — 마지막 수집일부터 오늘까지. 단 **최소한 어제는 반드시 포함**한다.
    #   (오늘 이미 한 번 수집했더라도 어제 밤 등재분을 다시 받아야 한다)
    floor = (datetime.now(KST) - timedelta(days=MIN_LOOKBACK_DAYS - 1)).strftime("%Y%m%d")
    last = load_last_fetch_day()
    start = min(last, floor) if last else floor
    label = f"마지막 수집 {last}~오늘" if last else "마지막 수집 기록 없음 — 어제~오늘"
    return day_range(start, today), label

# 합동시공을 하지 않는 조들의 지사.
# 한 지사에 여러 조가 섞인 곳은 공사번호로 우리 대상만 거른다(주소가 비어도 걸러진다).
#   서울본부직할(7793) = 종로(...383) / 중구(...155) 혼재 -> 종로만
#   마포용산(3600)     = 마포(...119, ...120) / 용산(...101) 혼재 -> 마포만
# ★전지사·필터없음 (영준님 2026-08-31 "31일 전지사 9/1일 전지사 고압제외", 2026-09-02 재확인
#   "전지사 다 올리라 했는데"). 거르는 것은 **고압뿐**이고 그건 빌더가 계약종별로 한다.
#   - 지사를 목록 밖에서 임시로 돌리면 다음 수집에서 반드시 빠진다(9/2 에 서대문은평 125건이 그렇게 빠졌다).
#   - 공사번호 필터(서울본부직할 383만 / 마포용산 119·120만)는 걷어냈다. 9/2 에 마포용산 80건 중
#     67건이 이 필터로 잘려 나갔다. 어느 조 물량인지는 현장에서 가리고, 수집 단계에서 미리 버리지 않는다.
#   되살릴 때는 영준님 지시가 있어야 한다 — 조용히 다시 좁히지 마라.
DEPTS = [
    {"cd": "3100", "nm": "광진성동", "cons": None},
    {"cd": "3400", "nm": "노원도봉", "cons": None},
    {"cd": "4080", "nm": "강북성북", "cons": None},
    {"cd": "7793", "nm": "서울본부직할", "cons": None},
    {"cd": "3600", "nm": "마포용산", "cons": None},
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

    days, why = resolve_days(args)
    print(f"[수집] {days[0]}~{days[-1]} ({len(days)}일) — {why} (KST)", file=sys.stderr)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    saved, empty, failed = [], [], []
    for day in days:
        print(f"[수집] {day}", file=sys.stderr)
        try:
            result = fetch_day(sid, day)
        except Exception as e:
            # 세션이 중간에 죽는 일이 있다(절대 만료 3.5시간). 남은 날을 조용히 건너뛰면
            #   그 구멍을 다음 수집이 메우지 못하므로, 실패로 기록하고 표식을 갱신하지 않는다.
            print(f"  [실패] {day}: {e}", file=sys.stderr)
            failed.append(day)
            continue

        # ★0건이면 저장하지 않는다. 세션 만료(403)나 조회 실패도 0건으로 떨어지는데,
        #   그대로 덮으면 멀쩡하던 원본이 빈 파일이 된다(2026-09-02 실제 사고).
        #   진짜로 그날 작업이 없었다면 파일을 안 만드는 편이 안전하다 — 빌더는 없는 날을 건너뛴다.
        if not result.get("rows"):
            print(f"  [건너뜀] {day} 조회 0건 — 저장하지 않는다. 세션 만료(403)인지 확인하라.",
                  file=sys.stderr)
            empty.append(day)
            continue

        out = OUT_DIR / f"hapdong_raw_{day}.json"
        # 다시 받은 날이 전보다 줄었으면 알린다 — 늦게 올린 물량을 주우려고 재조회하는 것이라
        #   늘어나는 것이 정상이다. 줄었다면 조회 조건이나 세션을 의심해야 한다.
        before = None
        if out.exists():
            try:
                before = len(json.loads(out.read_text()).get("rows") or [])
            except Exception:
                before = None
        out.write_text(json.dumps(result, ensure_ascii=False, indent=1))
        delta = ''
        if before is not None:
            diff = result["total"] - before
            delta = f" (이전 {before} → {diff:+d})"
            if diff < 0:
                print(f"  ★[경고] {day} 재조회가 이전보다 {-diff}건 줄었다 — 조회 조건·세션 확인",
                      file=sys.stderr)
        print(f"  [저장] {result['total']}건{delta} → {out.name}", file=sys.stderr)
        saved.append(out)

    if not saved:
        print("[중단] 저장된 날이 없다 — 표식을 갱신하지 않는다.", file=sys.stderr)
        return

    if failed:
        # 구멍이 남았으므로 표식을 미루지 않는다. 다음 수집이 그 날부터 다시 훑는다.
        print(f"[주의] 실패한 날 {failed} — 마지막 수집일을 갱신하지 않는다(다음에 다시 훑는다).",
              file=sys.stderr)
    else:
        save_last_fetch(days)
        print(f"[표식] 마지막 수집일 {days[-1]} → {LAST_FETCH_PATH.name}", file=sys.stderr)

    if empty:
        print(f"[참고] 0건이라 저장 안 한 날: {empty}", file=sys.stderr)
    print(f"[완료] {len(saved)}일 저장", file=sys.stderr)
    for p in saved:
        print(p)


if __name__ == "__main__":
    main()
