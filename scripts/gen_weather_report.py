#!/usr/bin/env python3
"""월간 작업일지 기상 리포트 생성기 — reports/YYYYMM-weather.html

    python3 scripts/gen_weather_report.py 202609
    python3 scripts/gen_weather_report.py 202608 --verify /tmp/relay/aug_baseline.json
    python3 scripts/gen_weather_report.py 202609 --json /tmp/relay/sep.json   # 표 데이터도 덤프

영준님 지시(2026-08-24~, 매월 말) — awms 에 등록한 마스터 개소의 작업시각과 그 시각·그 좌표의
기온·체감온도·습도를 날짜별로 묶은 **서류용** 페이지다. 작업자 앱과 무관하다.

기준은 8월판(reports/202608-weather.html)에서 세 번 고쳐 확정했다 —
커밋 55b2498 -> 3bbcb74 -> 7562978. 아래 주석의 ★가 그 결론이다.

★1. 대상 = awms MOBCST getMainList 의 **마스터만**(`MODEM_DIV=10`). 슬레이브(20)는 주소 폴백에만 쓴다.

★2. **지사(DEPT2)를 순회해야 한다.** 한 지사만 조회하면 그 달 물량의 일부만 나온다
     (실측 2026-09-29: 8월을 DEPT2=7793 만으로 받으면 마스터 128건·8일치인데, 7개 지사를
     순회하면 273건·17일치다. 9월은 물량이 서대문은평 245 / 직할 3 / 마포용산 1 로 쏠려 있어
     한 지사만 보면 거의 전부를 놓친다). **표의 '지사' 칸은 이 DEPT2 이름이다** —
     주소 매칭 결과가 아니라서 주소를 못 찾은 건에도 지사가 붙는다.

★3. 작업시각 = **`REG_DATE`**(unix ms). `WORK_DATE` 는 날짜만 있고 시각이 없다.
     8월에 모뎀작업리스트 엑셀 `작업일자` 와 252건 전부 0초 차이로 검증됐다.
     날짜 섹션도 REG_DATE 의 KST 날짜로 가른다.

★4. 주소 3단 폴백 — 주소는 **판단 기준이 아니라 개소 중복제거·좌표용**이다(영준님).
     ① 마스터 계기번호(`INSTR_NUM`)로 우리 데이터 직접 매칭
     ② 안 되면 같은 `MAC_MODEM` 그룹의 **슬레이브** 계기번호로 매칭
     ③ 그래도 없으면 **주소 없이 그대로 싣고** 기상은 지사 대표좌표로 계산
     ★주소 매칭에 실패했다고 마스터를 버리지 마라. 8월에 그렇게 했다가 142건으로 깎였다.

★5. 개소 정리 — 같은 주소에 마스터가 둘 이상이면 **가장 이른 1건만**.
     주소가 없는 건은 서로 같은 개소인지 알 수 없으므로 **중복제거하지 않는다**.

★6. 체감온도 = **기상청 여름철 공식(습구온도 방식, 그늘 기준)**. `scripts/weather.py` 의
     `wet_bulb()`·`kma_feels()` 를 그대로 import 한다. ★Open-Meteo 의
     `apparent_temperature` 는 일사(태양복사)를 넣어 한여름 낮에 5~7도 높다 — **쓰지 않는다.**

★7. 기상 해상도 = **15분 단위 필수.** `forecast-api` 의 `minutely_15` + `past_days`
     (archive-api 는 hourly 만 준다). 정시값을 쓰면 작업시각과 최대 45분 벌어져
     8월 251건 중 186건(74%)이 체감온도 0.3℃ 이상 달라졌다.
     결측 슬롯은 앞뒤로 떨어뜨린다.
     ★`past_days` 상한이 92 다 — 석 달 넘게 지난 달은 이 경로로 못 받는다(§PAST_DAYS_MAX).

★7-1. **슬롯 선택 규칙이 문서와 8월판이 어긋나 있다(2026-09-29 발견).**
     커밋 7562978 과 발주서는 "가장 가까운 15분 슬롯"이라고 적었는데, 8월판
     `reports/202608-weather.html` 이 실제로 쓴 값은 **내림**(작업시각이 든 슬롯)이다 —
     10:44 -> 10:30, 11:24 -> 11:15 처럼 전건이 그렇다(표본 5/5, 이후 204건 전수 대조로 확인).
     **기본값은 `floor`(8월판 = 정본과 같은 값)로 둔다.** 이미 서류로 나간 8월과 숫자 계보를
     맞추는 것이 월간 서류에서 더 중요하다.
     `--slot nearest` 로 문서 문구대로(최대 오차 7분, 내림은 14분) 뽑을 수도 있다.
     ★규칙을 바꿀 때는 **두 달을 같이 다시 뽑아라** — 한 달만 바꾸면 월 비교가 깨진다.

★8. 표기 — **폭염 단계(관심·주의)는 넣지 마라**(영준님). 인쇄용 CSS 로 날짜 섹션이
     페이지 중간에 잘리지 않게 한다.

세션: 아미큐 맥세션(`cst-input/backend/session.json`)의 JSESSIONID 하나로 된다.
**절대 만료 약 3.5시간** — 끊기면 영준님이 아미큐로 다시 로그인해야 한다.
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from weather import kma_feels  # noqa: E402  ★기상청 공식은 여기가 단일 출처다

KST = ZoneInfo("Asia/Seoul")
ROOT = Path(__file__).resolve().parent.parent

AWMS = "https://awms.kdn.com/ami/mob/cst/mobCst1000"
REFERER = "https://awms.kdn.com/html/main/index.html?app=MOBCST&menu=01010000"
DEPT1 = "3970"

# ★DEPT2 = 지사. 표의 '지사' 칸이 이 이름이다. scripts/hapdong/fetch_awms.py 의 DEPTS 와 같은 조직이다.
DEPTS = {
    "3100": "광진성동지사",
    "3400": "노원도봉지사",
    "4080": "강북성북지사",
    "7793": "서울본부직할",
    "3600": "마포용산지사",
    "3000": "동대문중랑지사",
    "3500": "서대문은평지사",
}

# 주소·좌표를 끌어올 우리 데이터. 앞에 있는 것이 이긴다(현행 리스트 > 아카이브).
#   ★계기는 개소를 옮겨다니므로 아카이브도 봐야 한다 — 8월 203건 중 80건이 아카이브에서 나왔다.
POOLS = [
    "data/site-data.json",
    "data/hapdong-data.json",
    "data/hapdong-data-archive.json",
    "data/skt-data.json",
    "data/jangae-data.json",
    "data/gapap-data.json",
    "data/lpnoapp-data.json",
    "data/michunggu-data.json",
    "data/michunggu-bulga-data.json",
    "data/rework-data.json",
    "data/new-site-data.json",
    "jongno-combined/data/jongno-site-data.json",
    "data/site-data-completed-archive-20260909.json",
    "data/site-data-completed-archive-20260831.json",
    "data/site-data-completed-archive-20260802.json",
    "data/site-data-completed-archive-20260704.json",
]

# Open-Meteo forecast-api 의 과거 조회 상한.
PAST_DAYS_MAX = 92
# 기상 격자 묶음 자릿수. 2 = 약 1.1km — 모델 격자보다 잘게 쪼개도 같은 값이 와서 호출만 늘어난다.
COORD_ROUND = 2


# ─── awms ──────────────────────────────────────────────────────────────────
def load_session():
    """아미큐 맥세션에서 JSESSIONID 를 읽는다. 데스크 워크트리엔 없으므로 main 도 본다."""
    cands = [ROOT / "cst-input/backend/session.json",
             Path("/Users/woodelight/Projects/ami-work/cst-input/backend/session.json")]
    for p in cands:
        if p.exists():
            s = json.loads(p.read_text())
            if s.get("jsessionid"):
                return s
    sys.exit("세션을 못 찾았다 — 아미큐 맥세션(cst-input/backend/session.json)이 필요하다.\n"
             "  curl -s http://127.0.0.1:8766/api/session  로 alive 확인 후 다시 돌려라.")


def awms_get(path, sess):
    """★JSON 이 아니면 세션 만료다 — awms 는 만료 시 로그인 HTML 을 200 으로 돌려준다."""
    h = {"Cookie": f"JSESSIONID={sess['jsessionid']}",
         "User-Agent": sess.get("ua") or "Mozilla/5.0",
         "Accept": "application/json, text/plain, */*",
         "Referer": REFERER}
    req = urllib.request.Request(f"{AWMS}/{path}", headers=h)
    with urllib.request.urlopen(req, timeout=120) as r:
        ctype = r.headers.get("content-type", "")
        body = r.read()
    if "json" not in ctype:
        sys.exit(f"★세션 만료로 보인다(content-type={ctype}). 영준님이 아미큐로 다시 로그인해야 한다.\n"
                 f"  앞 200자: {body[:200]!r}")
    return json.loads(body)


def fetch_month(yyyymm, sess):
    """그 달의 작업목록을 7개 지사 전부에서 받아 합친다. 행마다 `_지사` 를 박는다."""
    y, m = int(yyyymm[:4]), int(yyyymm[4:6])
    last = (datetime(y, m, 1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    s_, e_ = f"{yyyymm}01", last.strftime("%Y%m%d")
    out = []
    for code, name in DEPTS.items():
        q = ("getMainList?FLAG=M10"
             f"&DEPT1={DEPT1}&DEPT2={code}&searchKeyword=&sortKey=0"
             f"&workStep=25,28,29&pPageNo=1&pRowCount=5000&strDate={s_}&endDate={e_}")
        rows = awms_get(q, sess)
        rows = rows if isinstance(rows, list) else (rows.get("list") or rows.get("rows") or [])
        for r in rows:
            r["_지사"] = name
            r["_DEPT2"] = code
        n_m = sum(1 for r in rows if str(r.get("MODEM_DIV")) == "10")
        print(f"  {name}({code}): 전체 {len(rows):4} · 마스터 {n_m:4}")
        out.extend(rows)
    return out


def fetch_users(sess):
    """USER_ID -> 이름. 8월 252건 전부 엑셀 작업자1·2 와 일치했다."""
    rows = awms_get(f"getUserList?DEPT1={DEPT1}&FLAG=M10", sess)
    rows = rows if isinstance(rows, list) else (rows.get("list") or rows.get("rows") or [])
    name_of = {}
    for r in rows:
        uid = str(r.get("USER_ID") or r.get("USER_SEQ") or r.get("SEQ") or "").strip()
        nm = str(r.get("USER_NM") or r.get("NAME") or r.get("USER_NAME") or "").strip()
        if uid and nm:
            name_of[uid] = nm
    return name_of


# ─── 우리 데이터 주소 인덱스 ─────────────────────────────────────────────────
def build_addr_index():
    """계기번호 -> (주소, lat, lng). 앞 풀이 이긴다."""
    idx = {}
    per_dept = defaultdict(list)
    for rel in POOLS:
        fp = ROOT / rel
        if not fp.exists():
            continue
        try:
            rows = json.loads(fp.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"  [주소풀] {rel} 읽기 실패(무시): {e}")
            continue
        if not isinstance(rows, list):
            continue
        for x in rows:
            if not isinstance(x, dict):
                continue
            addr = str(x.get("주소") or "").strip()
            lat, lng = x.get("lat"), x.get("lng")
            dept = str(x.get("지사") or "").strip()
            if dept and lat is not None and lng is not None:
                per_dept[dept].append((float(lat), float(lng)))
            for f in ("계기번호", "계기번호_전"):
                mn = str(x.get(f) or "").strip().upper()
                if mn and mn not in idx and addr:
                    idx[mn] = (addr, lat, lng)
    # 지사 대표좌표 = 그 지사 개소 좌표의 평균. 주소를 못 찾은 건의 기상을 여기서 잡는다.
    rep = {d: (sum(a for a, _ in v) / len(v), sum(b for _, b in v) / len(v))
           for d, v in per_dept.items() if v}
    return idx, rep


# ─── 기상 ──────────────────────────────────────────────────────────────────
def fetch_weather(coords, day_min, day_max):
    """좌표별 15분 단위 기온·습도. {(lat2,lng2): {'YYYY-MM-DDTHH:MM': (T,RH)}}"""
    today = datetime.now(KST).date()
    past = (today - day_min).days + 1
    if past > PAST_DAYS_MAX:
        sys.exit(f"★{day_min} 은 {past}일 전이라 forecast-api past_days 상한({PAST_DAYS_MAX})을 넘는다.\n"
                 "  15분 단위를 받을 수 없다(archive-api 는 hourly 만 준다). 월말에 바로 돌려야 한다.")
    ahead = max(1, (day_max - today).days + 1)
    out = {}
    for i, (la, lo) in enumerate(sorted(coords), 1):
        url = ("https://api.open-meteo.com/v1/forecast"
               f"?latitude={la}&longitude={lo}"
               "&minutely_15=temperature_2m,relative_humidity_2m"
               f"&timezone=Asia%2FSeoul&past_days={min(PAST_DAYS_MAX, past)}&forecast_days={min(16, ahead)}")
        for attempt in range(4):
            try:
                with urllib.request.urlopen(url, timeout=90) as r:
                    d = json.load(r)
                break
            except Exception as e:
                if attempt == 3:
                    sys.exit(f"★기상 조회 실패 ({la},{lo}): {e}")
                time.sleep(2 * (attempt + 1))
        b = d.get("minutely_15") or {}
        if not b.get("time"):
            sys.exit(f"★minutely_15 가 비었다 ({la},{lo}) — 정시값으로 대체하지 마라(기준 위반).")
        out[(la, lo)] = {t[:16]: (b["temperature_2m"][j], b["relative_humidity_2m"][j])
                         for j, t in enumerate(b["time"])}
        if i % 20 == 0 or i == len(coords):
            print(f"  기상 {i}/{len(coords)} 좌표")
    return out


def pick_slot(series, dt, mode="floor"):
    """작업시각의 15분 슬롯. 결측이면 앞뒤로 최대 2시간까지 떨어뜨린다.

    ★mode 두 가지 — 8월판과 문서가 어긋나 있어 둘을 다 남겼다(2026-09-29 발견).
      'floor'   … 작업시각이 **든** 슬롯(내림). 8월판 `reports/202608-weather.html` 이
                  실제로 쓴 규칙이다(10:44 -> 10:30). 최대 오차 14분. **기본값 — 정본과 같은 값.**
      'nearest' … 작업시각에 **가장 가까운** 슬롯. 커밋 7562978 과 발주서의 문구이고,
                  그 커밋의 목적("서류에 쓰는 값이라 분 단위 정확도가 필요하다")에 더 맞는다.
                  최대 오차 7분.
      ★바꾸려면 두 달을 같이 다시 뽑아라. 어느 쪽이든 월 안에서는 일관된다.
    """
    base = dt.replace(minute=(dt.minute // 15) * 15, second=0, microsecond=0)
    if mode == "nearest" and dt.minute % 15 >= 8:
        base += timedelta(minutes=15)
    for step in range(0, 9):                      # 0, ±15분 … ±2시간
        for sign in ((0,) if step == 0 else (1, -1)):
            key = (base + timedelta(minutes=15 * step * sign)).strftime("%Y-%m-%dT%H:%M")
            v = series.get(key)
            if v and v[0] is not None and v[1] is not None:
                return v[0], v[1], key
    return None, None, None


# ─── 조립 ──────────────────────────────────────────────────────────────────
def build_rows(raw, users, idx, rep):
    masters = [r for r in raw if str(r.get("MODEM_DIV")) == "10"]
    slaves_by_mac = defaultdict(list)
    for r in raw:
        if str(r.get("MODEM_DIV")) != "10" and r.get("MAC_MODEM"):
            slaves_by_mac[str(r["MAC_MODEM"])].append(r)

    recs, src = [], Counter()
    for r in masters:
        reg = r.get("REG_DATE")
        if not reg:
            src["REG_DATE 없어 제외"] += 1
            continue
        dt = datetime.fromtimestamp(int(reg) / 1000, KST)
        meter = str(r.get("INSTR_NUM") or "").strip().upper()
        dept = r.get("_지사") or ""

        addr, lat, lng, how = "", None, None, ""
        if meter and meter in idx:                                   # ① 마스터 직접
            addr, lat, lng = idx[meter]
            how = "마스터계기"
        else:                                                        # ② 같은 MAC 그룹 슬레이브
            for s in slaves_by_mac.get(str(r.get("MAC_MODEM") or ""), []):
                sm = str(s.get("INSTR_NUM") or "").strip().upper()
                if sm and sm in idx:
                    addr, lat, lng = idx[sm]
                    how = "슬레이브계기"
                    break
        if not addr:                                                 # ③ 주소 없이 싣는다
            how = "주소없음(지사좌표)"
            lat, lng = rep.get(dept, (None, None))
        if lat is None or lng is None:                               # 지사 대표좌표조차 없을 때
            lat, lng = 37.5665, 126.9780                             # 서울시청
            how += "+시청폴백"
        src[how] += 1

        recs.append(dict(
            dt=dt, day=dt.strftime("%Y-%m-%d"), time=dt.strftime("%H:%M"),
            meter=meter, dept=dept, addr=addr, lat=float(lat), lng=float(lng),
            w1=users.get(str(r.get("WORKER1_SEQ") or "").strip(), ""),
            w2=users.get(str(r.get("WORKER2_SEQ") or "").strip(), ""),
            mac=str(r.get("MAC_MODEM") or ""), how=how,
        ))

    # ★개소 정리 — 같은 주소는 가장 이른 1건만. 주소 없는 건은 건드리지 않는다.
    best, noaddr = {}, []
    for x in sorted(recs, key=lambda z: z["dt"]):
        if x["addr"]:
            best.setdefault(x["addr"], x)
        else:
            noaddr.append(x)
    out = sorted(list(best.values()) + noaddr, key=lambda z: z["dt"])
    return out, src, len(masters), len(recs)


WD = "월화수목금토일"


def render(rows, yyyymm, slot_mode="floor", note=""):
    y, m = int(yyyymm[:4]), int(yyyymm[4:6])
    days = sorted({r["day"] for r in rows})
    n_addr = sum(1 for r in rows if r["addr"])
    w2c = Counter(r["w2"] for r in rows if r["w2"])
    w2txt = " · ".join(f"{k} {v}건" for k, v in w2c.most_common())
    # ★페이지가 자기 방법을 틀리게 설명하면 안 된다 — 슬롯 규칙을 그대로 적는다(§7-1).
    slot_txt = ("작업시각이 든 슬롯" if slot_mode == "floor" else "작업시각에 가장 가까운 슬롯")

    h = [f"""<!doctype html><html lang=ko><head><meta charset=utf-8>
<title>{y}년 {m}월 작업일지 — 기상</title>
<style>
:root{{color-scheme:light}}
body{{margin:0;padding:24px;font:14px/1.6 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#111;background:#fff}}
h1{{font-size:20px;margin:0 0 4px}}
.meta{{color:#666;font-size:13px;margin-bottom:20px}}
section{{margin-bottom:26px;break-inside:avoid}}
h2{{font-size:15px;margin:0 0 4px;padding-bottom:4px;border-bottom:2px solid #333}}
.wd{{color:#888;font-weight:400}} .cnt{{float:right;font-size:13px;color:#666;font-weight:400}}
.sum{{font-size:12px;color:#555;margin-bottom:6px}}
table{{border-collapse:collapse;width:100%;font-size:12.5px}}
th,td{{border:1px solid #ddd;padding:4px 7px;text-align:left}}
th{{background:#f4f4f4;font-weight:600;text-align:center}}
td.num{{text-align:right;font-variant-numeric:tabular-nums}}
td.no{{font-family:ui-monospace,Menlo,monospace}} .dim{{color:#bbb}} .strong{{font-weight:700}}
tbody tr:nth-child(even){{background:#fafafa}}
tbody tr{{cursor:pointer}} tbody tr:hover{{background:#eef6ff}}
/* ── 한 건씩 보기 (영준님 2026-09-29) ───────────────────────────── */
.one-btn{{display:inline-block;margin:0 0 16px;padding:9px 16px;font-size:14px;font-weight:700;
  color:#fff;background:#0C9266;border:0;border-radius:8px;cursor:pointer}}
.one-btn.sm{{float:right;margin:0;padding:3px 10px;font-size:12px;font-weight:600}}
#ov{{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99;
  align-items:center;justify-content:center;padding:16px}}
#ov.on{{display:flex}}
#card{{background:#fff;border-radius:14px;width:100%;max-width:520px;overflow:hidden;
  box-shadow:0 12px 40px rgba(0,0,0,.3)}}
#hd{{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #e5e5e5}}
#hd select{{font-size:14px;padding:4px 6px;border:1px solid #ccc;border-radius:6px;background:#fff}}
#pos{{margin-left:auto;font-size:13px;color:#666;font-variant-numeric:tabular-nums}}
#x{{border:0;background:#f1f1f1;border-radius:50%;width:28px;height:28px;font-size:17px;cursor:pointer}}
#bd{{padding:16px 18px}}
.big{{font:700 25px/1.25 ui-monospace,Menlo,monospace;letter-spacing:.5px;word-break:break-all}}
.tm{{font-size:13px;color:#666;margin-top:2px}}
.wx{{display:flex;gap:8px;margin:14px 0}}
.wx div{{flex:1;background:#f7f7f7;border-radius:10px;padding:9px 6px;text-align:center}}
.wx b{{display:block;font-size:22px;font-variant-numeric:tabular-nums;line-height:1.2}}
.wx span{{font-size:11px;color:#777}}
.wx .hot b{{color:#c2410c}}
.kv{{display:grid;grid-template-columns:62px 1fr;gap:5px 10px;font-size:13.5px}}
.kv dt{{color:#888}} .kv dd{{margin:0}}
#ft{{display:flex;gap:8px;padding:12px 14px;border-top:1px solid #e5e5e5}}
#ft button{{flex:1;padding:12px;font-size:15px;font-weight:700;border:1px solid #ddd;
  border-radius:9px;background:#fafafa;cursor:pointer}}
#ft button:disabled{{opacity:.35;cursor:default}}
@media print{{body{{padding:0}} section{{page-break-inside:avoid}}
  .one-btn,#ov{{display:none !important}}}}
</style></head><body>
<h1>{y}년 {m}월 작업일지 — 현장 기상</h1>
<div class=meta>총 {len(rows)}건 · {len(days)}일 · awms 등록 마스터 기준(개소 중복 시 최초 1건)<br>
제2작업자: {w2txt}
&nbsp;|&nbsp; 기상은 <b>15분 단위</b> 실측({slot_txt}) · 체감온도는 기상청 여름철 공식(그늘 기준)
&nbsp;|&nbsp; 주소 미확인 {len(rows) - n_addr}건은 지사 대표좌표{note}</div>
<button class=one-btn onclick="openOne(0,0)">한 건씩 보기</button>
"""]
    for day in days:
        drs = [r for r in rows if r["day"] == day]
        wd = WD[datetime.strptime(day, "%Y-%m-%d").weekday()]
        Ts = [r["T"] for r in drs if r["T"] is not None]
        Fs = [r["F"] for r in drs if r["F"] is not None]
        Hs = [r["RH"] for r in drs if r["RH"] is not None]
        sm = (f"기온 {min(Ts):.1f}~{max(Ts):.1f}℃ · 체감 {min(Fs):.1f}~{max(Fs):.1f}℃ "
              f"· 습도 {min(Hs):.0f}~{max(Hs):.0f}%" if Ts else "기상 결측")
        d2 = Counter(r["w2"] for r in drs if r["w2"])
        if d2:
            sm += "\n        &nbsp;|&nbsp; 제2작업자 " + " ".join(f"{k} {v}" for k, v in d2.most_common())
        di = days.index(day)
        h.append(f"""    <section>
      <h2>{day} <span class=wd>({wd})</span>
        <button class="one-btn sm" onclick="openOne({di},0)">한 건씩</button>
        <span class=cnt>{len(drs)}건</span></h2>
      <div class=sum>{sm}</div>
      <table><thead><tr><th>#</th><th>시각</th><th>계기번호</th>
        <th>기온(℃)</th><th>체감온도(℃)</th><th>습도(%)</th>
        <th>주소</th><th>지사</th><th>작업자1</th><th>제2작업자</th></tr></thead>
        <tbody>""")
        # 순번은 **날짜 섹션 안에서 1부터**다(영준님 2026-09-29) — 하루 작업량이 곧 보이게.
        for i, r in enumerate(drs, 1):
            a = r["addr"] or "<span class=dim>—</span>"
            T = f"{r['T']:.1f}" if r["T"] is not None else "—"
            F = f"{r['F']:.1f}" if r["F"] is not None else "—"
            RH = f"{r['RH']:.0f}" if r["RH"] is not None else "—"
            # 열 순서 = 계기번호 -> 온도·습도 -> 주소 (영준님 2026-09-29)
            h.append(f"<tr onclick=\"openOne({di},{i-1})\">"
                     f"<td class=num>{i}</td><td>{r['time']}</td><td class=no>{r['meter']}</td>"
                     f"<td class=num>{T}</td><td class='num strong'>{F}</td><td class=num>{RH}</td>"
                     f"<td class=addr>{a}</td><td>{r['dept']}</td>"
                     f"<td>{r['w1']}</td><td>{r['w2']}</td></tr>")
        h.append("</tbody></table>\n    </section>\n")

    # ── 한 건씩 보기 모달 (영준님 2026-09-29 "일별 모달 한행씩") ──────────────
    #   날짜 안에서 ←/→ 로 넘기고, 날짜 끝에서는 이웃 날짜로 이어진다(경계에서 막지 않는다).
    #   날짜 드롭다운으로 바로 점프할 수 있고, 표의 아무 행을 눌러도 그 행이 열린다.
    by_day = {d: [r for r in rows if r["day"] == d] for d in days}
    payload = {
        "days": [{"day": d,
                  "wd": WD[datetime.strptime(d, "%Y-%m-%d").weekday()],
                  "rows": [{"n": i, "time": r["time"], "meter": r["meter"],
                            "T": r["T"], "F": r["F"], "RH": r["RH"],
                            "addr": r["addr"] or "", "dept": r["dept"],
                            "w1": r["w1"], "w2": r["w2"]}
                           for i, r in enumerate(by_day[d], 1)]}
                 for d in days],
    }
    h.append("<div id=ov onclick=\"if(event.target===this)closeOne()\"><div id=card>"
             "<div id=hd><select id=dsel onchange=\"jumpDay(this.value)\"></select>"
             "<span id=pos></span>"
             "<button id=x onclick=closeOne()>&times;</button></div>"
             "<div id=bd></div>"
             "<div id=ft><button id=prev onclick=\"step(-1)\">&larr; 이전</button>"
             "<button id=next onclick=\"step(1)\">다음 &rarr;</button></div>"
             "</div></div>\n<script>\nconst D=")
    h.append(json.dumps(payload["days"], ensure_ascii=False))
    h.append(""";
let di=0, ri=0;
function fmt(v,d){ return (v===null||v===undefined)?'—':Number(v).toFixed(d); }
function openOne(d,r){
  di=d; ri=r;
  const s=document.getElementById('dsel');
  if(!s.options.length) D.forEach((x,i)=>{
    const o=document.createElement('option');
    o.value=i; o.textContent=x.day+' ('+x.wd+') '+x.rows.length+'건';
    s.appendChild(o);
  });
  document.getElementById('ov').classList.add('on');
  draw();
}
function closeOne(){ document.getElementById('ov').classList.remove('on'); }
function jumpDay(v){ di=+v; ri=0; draw(); }
function step(k){
  ri+=k;
  while(ri<0){ if(di===0){ri=0;break;} di--; ri+=D[di].rows.length; }
  while(ri>=D[di].rows.length){
    if(di===D.length-1){ ri=D[di].rows.length-1; break; }
    ri-=D[di].rows.length; di++;
  }
  draw();
}
function draw(){
  const day=D[di], r=day.rows[ri];
  document.getElementById('dsel').value=di;
  document.getElementById('pos').textContent=r.n+' / '+day.rows.length;
  const hot = (r.F!==null && r.F>=31) ? ' hot' : '';
  document.getElementById('bd').innerHTML =
    '<div class=big>'+r.meter+'</div>'+
    '<div class=tm>'+day.day+' ('+day.wd+') '+r.time+'</div>'+
    '<div class=wx>'+
      '<div><b>'+fmt(r.T,1)+'</b><span>기온 ℃</span></div>'+
      '<div class="'+hot.trim()+'"><b>'+fmt(r.F,1)+'</b><span>체감온도 ℃</span></div>'+
      '<div><b>'+fmt(r.RH,0)+'</b><span>습도 %</span></div>'+
    '</div>'+
    '<dl class=kv>'+
      '<dt>주소</dt><dd>'+(r.addr||'<span class=dim>미확인 — 지사 대표좌표</span>')+'</dd>'+
      '<dt>지사</dt><dd>'+r.dept+'</dd>'+
      '<dt>작업자</dt><dd>'+r.w1+(r.w2?' · '+r.w2:'')+'</dd>'+
    '</dl>';
  document.getElementById('prev').disabled=(di===0&&ri===0);
  document.getElementById('next').disabled=(di===D.length-1&&ri===D[di].rows.length-1);
}
document.addEventListener('keydown',e=>{
  if(!document.getElementById('ov').classList.contains('on')) return;
  if(e.key==='ArrowLeft') step(-1);
  else if(e.key==='ArrowRight') step(1);
  else if(e.key==='Escape') closeOne();
});
</script>
""")
    h.append("</body></html>\n")
    return "".join(h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("yyyymm")
    ap.add_argument("--out")
    ap.add_argument("--json", dest="dump")
    ap.add_argument("--verify", help="기준선 JSON 과 대조(8월판 재현 확인용)")
    ap.add_argument("--slot", choices=["floor", "nearest"], default="floor",
                    help="15분 슬롯 규칙. floor=작업시각이 든 슬롯(기본, 8월판 정본과 같은 값) / "
                         "nearest=가장 가까운 슬롯(커밋·발주서 문구). §7-1 참고")
    a = ap.parse_args()
    ym = a.yyyymm
    if len(ym) != 6 or not ym.isdigit():
        sys.exit("월은 YYYYMM 형식이다 (예: 202609)")

    sess = load_session()
    print(f"[1/5] awms 작업목록 — {ym} (지사 {len(DEPTS)}개 순회)")
    raw = fetch_month(ym, sess)
    print(f"[2/5] 작업자명")
    users = fetch_users(sess)
    print(f"  {len(users)}명")
    print(f"[3/5] 주소 인덱스")
    idx, rep = build_addr_index()
    print(f"  계기 {len(idx):,}개 · 지사 대표좌표 {len(rep)}곳")

    rows, src, n_master, n_kept = build_rows(raw, users, idx, rep)
    print(f"[4/5] 마스터 {n_master} -> 개소 정리 후 {len(rows)}건")
    for k, v in src.most_common():
        print(f"    {k}: {v}")

    day_min = min(datetime.strptime(r["day"], "%Y-%m-%d").date() for r in rows)
    day_max = max(datetime.strptime(r["day"], "%Y-%m-%d").date() for r in rows)
    coords = {(round(r["lat"], COORD_ROUND), round(r["lng"], COORD_ROUND)) for r in rows}
    print(f"[5/5] 기상 — 좌표 {len(coords)}곳, {day_min}~{day_max} · 슬롯규칙 {a.slot}")
    wx = fetch_weather(coords, day_min, day_max)

    miss = []
    for r in rows:
        series = wx[(round(r["lat"], COORD_ROUND), round(r["lng"], COORD_ROUND))]
        T, RH, slot = pick_slot(series, r["dt"], a.slot)
        r["T"], r["RH"], r["slot"] = T, RH, slot
        r["F"] = kma_feels(T, RH) if T is not None and RH is not None else None
        if r["F"] is None:
            miss.append(r)
    print(f"  기상 부착 {len(rows) - len(miss)}/{len(rows)}")
    if miss:
        print("  ★결측:")
        for r in miss[:20]:
            print(f"    {r['day']} {r['time']} {r['meter']} {r['dept']} {r['addr'] or '(주소없음)'}")

    out = Path(a.out) if a.out else ROOT / "reports" / f"{ym}-weather.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render(rows, ym, a.slot), encoding="utf-8")
    print(f"저장: {out}  ({len(rows)}건 · {len({r['day'] for r in rows})}일)")

    if a.dump:
        Path(a.dump).write_text(json.dumps(
            [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in r.items()} for r in rows],
            ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"덤프: {a.dump}")

    if a.verify:
        verify(rows, json.loads(Path(a.verify).read_text()))


def verify(rows, base):
    """기준선(8월판에서 긁은 표)과 대조. 재현 못 하는 항목을 숨기지 않고 찍는다."""
    print("\n=== 재현 검증 ===")
    print(f"  건수  기준선 {len(base)} / 이번 {len(rows)}")
    bk = {(r["day"], r["time"], r["meter"]): r for r in base}
    rk = {(r["day"], r["time"], r["meter"]): r for r in rows}
    print(f"  키(날짜+시각+계기) 일치 {len(bk & rk.keys() if isinstance(bk, set) else set(bk) & set(rk))}"
          f" / 기준선만 {len(set(bk) - set(rk))} / 이번만 {len(set(rk) - set(bk))}")
    same = set(bk) & set(rk)
    dT = [abs(bk[k]["T"] - rk[k]["T"]) for k in same if rk[k]["T"] is not None]
    dF = [abs(bk[k]["F"] - rk[k]["F"]) for k in same if rk[k]["F"] is not None]
    dA = [k for k in same if bk[k]["addr"] != (rk[k]["addr"] or "")]
    dD = [k for k in same if bk[k]["dept"] != rk[k]["dept"]]
    if dT:
        print(f"  기온 차 최대 {max(dT):.2f}℃ · 0.05 초과 {sum(1 for x in dT if x > 0.05)}건")
        print(f"  체감 차 최대 {max(dF):.2f}℃ · 0.05 초과 {sum(1 for x in dF if x > 0.05)}건")
    print(f"  주소 불일치 {len(dA)}건 · 지사 불일치 {len(dD)}건")
    for k in dA[:10]:
        print(f"    주소: {k} 기준선='{bk[k]['addr']}' 이번='{rk[k]['addr']}'")
    for k in list(set(bk) - set(rk))[:10]:
        print(f"    기준선만: {k}")
    for k in list(set(rk) - set(bk))[:10]:
        print(f"    이번만: {k}")


if __name__ == "__main__":
    main()
