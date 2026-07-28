#!/usr/bin/env python3
"""검증관리자 백엔드 터널 URL을 Firebase에 발행 → 화면이 자동 발견(URL 하드코딩·push 불필요).

화면(admin-validate.html)은 무인증 REST로 {DB}/valBackend/url.json 을 읽어 API_BASE로 사용.
쓰기는 서비스계정(firebase-adminsdk)으로. 터널이 바뀔 때마다(start.sh) 이 스크립트가 갱신.

사용:  python3 publish_backend_url.py <tunnel_url>
       (인자 없으면 로컬 8765 터널 로그에서 자동 추출 시도)
"""
import sys, re, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]                     # ami-work/
SA = ROOT / "ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json"
DB_URL = "https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
TUNNEL_LOG = "/tmp/amival-tunnel.log"


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
    fdb.reference("valBackend").update({"url": url, "updatedAt": int(time.time() * 1000)})
    print(f"[publish] valBackend/url = {url}")


if __name__ == "__main__":
    main()
