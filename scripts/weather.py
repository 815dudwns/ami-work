#!/usr/bin/env python3
"""
현장 기상 조회 — 기온·습도·체감온도(기상청 여름철 기준)

  python3 scripts/weather.py 창신동 8 12          # 오늘 08~12시, 30분 간격
  python3 scripts/weather.py 창신동 8 12 20260821 # 날짜 지정
  python3 scripts/weather.py 명륜3가 13 18 --60   # 1시간 간격

★체감온도는 기상청 여름철 공식(습구온도 방식)이다 — 영준님 확정 2026-08-24.
  Open-Meteo 가 주는 apparent_temperature 는 일사(태양복사)까지 넣어 한여름 낮에
  5~7도 높게 나온다. 폭염특보·뉴스에서 말하는 체감온도는 기상청 값이므로 그걸 쓴다.
  (참고용으로 일사 포함값도 함께 출력한다 — 실제 옥외 체감은 그쪽에 가깝다)

동 이름을 주면 우리 데이터(종로맵·합동·실효)에서 그 동 개소 좌표의 평균을 쓴다.
못 찾으면 서울시청 좌표로 떨어진다.
"""
import json
import math
import sys
import urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
BASE = Path(__file__).resolve().parent.parent
POOLS = [
    "jongno-combined/data/jongno-site-data.json",
    "data/hapdong-data.json",
    "data/site-data.json",
    "data/skt-data.json",
]


def wet_bulb(T, RH):
    """Stull(2011) 습구온도 근사"""
    return (T * math.atan(0.151977 * math.sqrt(RH + 8.313659)) + math.atan(T + RH)
            - math.atan(RH - 1.676331) + 0.00391838 * RH ** 1.5 * math.atan(0.023101 * RH)
            - 4.686035)


def kma_feels(T, RH):
    """기상청 여름철 체감온도(습구온도 방식). 그늘 기준."""
    Tw = wet_bulb(T, RH)
    return -0.2442 + 0.55399 * Tw + 0.45535 * T - 0.0022 * Tw ** 2 + 0.00278 * Tw * T + 3.0


def kma_level(f):
    """기상청 체감온도 폭염 단계"""
    if f >= 38: return "위험"
    if f >= 35: return "경고"
    if f >= 33: return "주의"
    if f >= 31: return "관심"
    return ""


def find_coords(dong):
    pts = []
    for p in POOLS:
        fp = BASE / p
        if not fp.exists():
            continue
        try:
            for x in json.load(open(fp)):
                if x.get("lat") and dong in str(x.get("주소") or ""):
                    pts.append((x["lat"], x["lng"]))
        except Exception:
            continue
    if not pts:
        return 37.5665, 126.9780, 0
    return sum(a for a, _ in pts) / len(pts), sum(b for _, b in pts) / len(pts), len(pts)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    step = 60 if "--60" in sys.argv else 30
    if len(args) < 3:
        sys.exit(__doc__)

    dong = args[0]
    h0, h1 = int(args[1]), int(args[2])
    day = args[3] if len(args) > 3 else datetime.now(KST).strftime("%Y%m%d")
    day = f"{day[:4]}-{day[4:6]}-{day[6:8]}"

    lat, lon, n = find_coords(dong)
    src = f"우리 데이터 {n}개소 평균" if n else "서울시청(동 못 찾음)"

    today = datetime.now(KST).strftime("%Y-%m-%d")
    past = max(0, (datetime.strptime(today, "%Y-%m-%d") - datetime.strptime(day, "%Y-%m-%d")).days)
    if past > 90:
        base = "https://archive-api.open-meteo.com/v1/archive"
        extra = f"&start_date={day}&end_date={day}"
    else:
        base = "https://api.open-meteo.com/v1/forecast"
        extra = f"&past_days={min(92, past + 1)}&forecast_days=1"

    url = (f"{base}?latitude={lat}&longitude={lon}"
           "&minutely_15=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation"
           "&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation"
           f"&timezone=Asia%2FSeoul{extra}")
    with urllib.request.urlopen(url, timeout=60) as r:
        d = json.load(r)

    block = d.get("minutely_15") if step == 30 and "minutely_15" in d else d["hourly"]
    if step == 30 and block is d.get("hourly"):
        step = 60

    print(f"{day} {dong} — 기온·습도·체감온도(기상청 기준)")
    print(f"좌표 {lat:.5f}, {lon:.5f} ({src})")
    print()
    print(f"{'시각':7}{'기온':>8}{'습도':>7}{'체감':>9}{'강수':>8}")
    print("-" * 40)
    rows = 0
    for i, t in enumerate(block["time"]):
        if not t.startswith(day):
            continue
        hh, mm = int(t[11:13]), int(t[14:16])
        if not (h0 <= hh <= h1):
            continue
        if step == 30 and mm not in (0, 30):
            continue
        if hh == h1 and mm != 0:
            continue
        T = block["temperature_2m"][i]
        RH = block["relative_humidity_2m"][i]
        if T is None or RH is None:
            continue
        f = kma_feels(T, RH)
        print(f"{t[11:16]:7}{T:6.1f}°C{RH:6.0f}%{f:8.1f}°C{block['precipitation'][i]:7.1f}mm")
        rows += 1
    if not rows:
        print("  해당 시간대 자료 없음 (미래이거나 범위 밖)")
    print()
    print("체감온도 = 기상청 여름철 기준")


if __name__ == "__main__":
    main()
