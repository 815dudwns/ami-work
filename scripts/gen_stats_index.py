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

val = db.reference("siteData/charger4eleccar").get()
if isinstance(val, list):
    items = [x for x in val if x]
elif isinstance(val, dict):
    items = list(val.values())
else:
    items = []

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
