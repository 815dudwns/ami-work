#!/bin/bash
# 통신팀 awms 맥 입력장치 — 백엔드 + cloudflare 터널 기동 + 터널 URL 자동발행(앱 자동발견)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"          # ami-work/
VENV_UVICORN="$PROJECT_ROOT/research/ocr_poc/venv_parseq/bin/uvicorn"
PYTHON="$PROJECT_ROOT/research/ocr_poc/venv_parseq/bin/python"   # firebase_admin 설치됨
PORT="8766"
LOG="/tmp/cst-input-backend.log"
TLOG="/tmp/cst-tunnel.log"

# ── 1) 백엔드(uvicorn) ──
if lsof -i ":${PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
    echo "[cst-input] 백엔드 이미 실행 중 (포트 ${PORT})"
else
    echo "[cst-input] 백엔드 기동... http://127.0.0.1:${PORT}  로그: ${LOG}"
    cd "$PROJECT_ROOT"
    nohup "$VENV_UVICORN" app:app \
        --app-dir "$SCRIPT_DIR/backend" \
        --host 127.0.0.1 --port "$PORT" \
        >> "$LOG" 2>&1 &
    echo "[cst-input] 백엔드 PID $!"
    sleep 2
fi

# ── 2) cloudflare 터널 (소유 관리 — URL 캡처 위해 기존 8766 터널 정리 후 새로 기동) ──
pkill -f "cloudflared tunnel --url http://localhost:${PORT}" 2>/dev/null || true
sleep 1
: > "$TLOG"
echo "[cst-input] 터널 기동... 로그: ${TLOG}"
nohup cloudflared tunnel --url "http://localhost:${PORT}" >> "$TLOG" 2>&1 &
echo "[cst-input] 터널 PID $!"

# ── 3) 터널 URL 추출 → Firebase 발행(앱 자동발견) ──
URL=""
for i in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TLOG" | tail -1 || true)
    [ -n "$URL" ] && break
    sleep 1
done
if [ -n "$URL" ]; then
    "$PYTHON" "$SCRIPT_DIR/publish_backend_url.py" "$URL" || echo "[cst-input] 경고: URL 발행 실패(앱 수동입력 필요)"
    echo "[cst-input] 백엔드 URL: $URL  (앱이 자동 발견)"
else
    echo "[cst-input] 경고: 터널 URL을 못 찾음 — 앱 자동발견 불가(수동입력 필요)"
fi
