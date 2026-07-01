#!/usr/bin/env python3
"""맥 백엔드 터널 URL을 Firebase에 발행 → 앱이 자동 발견(폰에서 URL 입력 불필요).

앱은 무인증 REST로 {DB}/cstBackend/url.json 을 읽어 백엔드 베이스로 사용.
쓰기는 서비스계정(firebase-adminsdk)으로. 터널이 바뀔 때마다(start.sh) 이 스크립트가 갱신.

사용:  python3 publish_backend_url.py <tunnel_url>
       (인자 없으면 로컬 8766 터널 로그에서 자동 추출 시도)
"""
import sys, re, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]                      # ami-work/
SA = ROOT / "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json"
DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
TUNNEL_LOG = "/tmp/cst-tunnel.log"


def find_url_from_log() -> str:
    try:
        txt = Path(TUNNEL_LOG).read_text(errors="ignore")
        m = re.findall(r"https://[a-z0-9-]+\.trycloudflare\.com", txt)
        return m[-1] if m else ""
    except Exception:
        return ""


def main():
    url = sys.argv[1].strip() if len(sys.argv) > 1 else find_url_from_log()
    if not url:
        print("[publish] 터널 URL 없음 — 인자로 넘기거나 터널 로그 확인", file=sys.stderr)
        sys.exit(1)
    url = url.rstrip("/")

    import firebase_admin
    from firebase_admin import credentials, db as fdb
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(SA)), {"databaseURL": DB_URL})
    fdb.reference("cstBackend").update({"url": url, "updatedAt": int(time.time() * 1000)})
    print(f"[publish] cstBackend/url = {url}")


if __name__ == "__main__":
    main()
