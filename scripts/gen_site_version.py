#!/usr/bin/env python3
"""data/site-data.json → data/site-data.version.json 생성.
캐시-우선 로더(js/idb.js + map.js)가 이 버전으로 폰 IndexedDB 캐시 무효화 판단.
★ site-data.json 변경(새 사이트 추가 등) 후 반드시 다시 실행할 것.
   (안 하면 작업자 폰이 옛 캐시 계속 사용)
"""
import json, hashlib, sys
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "site-data.json"
OUT = ROOT / "data" / "site-data.version.json"

raw = SRC.read_bytes()
ver = hashlib.sha256(raw).hexdigest()[:12]
try:
    count = len(json.loads(raw))
except Exception:
    count = -1

OUT.write_text(json.dumps({
    "version": ver,
    "count": count,
    "generated": datetime.now(ZoneInfo("Asia/Seoul")).isoformat(),
}, ensure_ascii=False), encoding="utf-8")
print(f"site-data.version.json 생성: version={ver} count={count}")
