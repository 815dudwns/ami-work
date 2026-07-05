#!/usr/bin/env python3
"""Firebase siteData(charger4eleccar) → data/stats-site-index.json 경량 인덱스 생성.

stats.html 전체(지사별) 탭이 매 조회마다 Firebase siteData 22MB를 통째 다운로드하던 것을
경량 정적파일로 대체(GitHub Pages fetch). aggByBranch()가 쓰는 3필드만 추출:
  지사 · 주소 · 계기번호

RTDB 다운로드 폭증(하루 ~1.5GB = 22MB × 조회수)의 범인이 이 22MB 반복 로드라
이 인덱스로 stats의 Firebase siteData 읽기를 0으로 만든다.

★ 분모(19,613)의 단일 진실 = Firebase siteData(실제 앱 배포본). 로컬 site-data.json(raw)
   이 아니라 Firebase에서 직접 뽑아야 stats가 보던 값과 정확히 일치한다.
★ upload_sitedata.py 로 Firebase siteData 를 갱신했으면 반드시 이 스크립트도 실행.
"""
import json
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import firebase_admin
from firebase_admin import credentials, db

ROOT = Path(__file__).resolve().parent.parent
CRED = ROOT / "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json"
OUT = ROOT / "data" / "stats-site-index.json"
DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(str(CRED)), {"databaseURL": DB_URL})

def to_items(v):
    if isinstance(v, list):
        return [x for x in v if x]
    if isinstance(v, dict):
        return list(v.values())
    return []

# 분모 = 완료 포함 누적(영준님 지시 2026-07-04): 현재 작업대상 siteData
#   + 완료 아카이브 전체(재구성 시 site-data에서 뺀 완료분) + 재방문 데이터셋.
# 완료분을 빼면 지사별 누적 완료 실적이 stats에서 사라지므로 분모에 되살린다.
# ★ 로컬 최신 파일 기준(2026-07-04): Firebase siteData(26588)엔 신규 14,516이 미반영이라
#   로컬이 정확. site-data.json(작업대상=미완료+신규) + 완료 아카이브(들) 합산.
import glob
items = to_items(json.loads((ROOT / "data" / "site-data.json").read_text(encoding="utf-8")))
for _f in sorted(glob.glob(str(ROOT / "data" / "site-data-completed-archive-*.json"))):
    items += to_items(json.loads(Path(_f).read_text(encoding="utf-8")))

# 재방문(별도 데이터셋, 로컬 정적파일 — Firebase siteData엔 없음)
_rw = ROOT / "data" / "rework-data.json"
if _rw.exists():
    items += to_items(json.loads(_rw.read_text(encoding="utf-8")))

index = [
    {
        "지사": it.get("지사", "") or "",
        "주소": it.get("주소", "") or "",
        "계기번호": str(it.get("계기번호", "") or ""),
    }
    for it in items
    if isinstance(it, dict)
]

# 공백 없는 콤팩트 JSON (GitHub Pages gzip 전제)
OUT.write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
size_mb = OUT.stat().st_size / 1e6
print(f"stats-site-index.json 생성: {len(index):,}건 / {size_mb:.2f} MB (원본 siteData ~22MB → 인덱스)")
print(f"  생성시각(KST): {datetime.now(ZoneInfo('Asia/Seoul')).isoformat()}")
