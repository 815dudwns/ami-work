#!/bin/bash
# start.sh — 검증 포털 상시 기동 스크립트
# 역할: uvicorn 백엔드(8765) + 정적 서버(8080) + cloudflare 터널 + URL 자동발행(화면 자동발견)
# 이미 떠 있으면 중복 기동하지 않음 (생존체크는 curl — lsof는 맥 업데이트 후 매달릴 수 있음)
# 로그: /tmp/amiwork-backend.log / /tmp/amiwork-static.log / /tmp/amival-tunnel.log
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

VENV_UVICORN="$PROJECT_ROOT/research/ocr_poc/venv_parseq/bin/uvicorn"
PYTHON="$PROJECT_ROOT/research/ocr_poc/venv_parseq/bin/python"
BACKEND_MODULE="research.admin-validation.backend.app:app"
BACKEND_PORT="8765"
STATIC_PORT="8080"
BACKEND_LOG="/tmp/amiwork-backend.log"
STATIC_LOG="/tmp/amiwork-static.log"
TLOG="/tmp/amival-tunnel.log"

# curl 기반 생존체크 (lsof hang 회피)
alive() { curl -s -m 2 -o /dev/null "http://127.0.0.1:$1/" 2>/dev/null; }

# ── 백엔드(8765) ──
if alive "$BACKEND_PORT"; then
    echo "[backend] 이미 실행 중 (포트 ${BACKEND_PORT})"
else
    echo "[backend] 기동 중... 로그: ${BACKEND_LOG}"
    cd "$PROJECT_ROOT"
    nohup "$VENV_UVICORN" "$BACKEND_MODULE" --host 127.0.0.1 --port "$BACKEND_PORT" >> "$BACKEND_LOG" 2>&1 &
    echo "[backend] PID $!"
fi

# ── 정적 서버(8080) ──
if alive "$STATIC_PORT"; then
    echo "[static] 이미 실행 중 (포트 ${STATIC_PORT})"
else
    echo "[static] 기동 중... 로그: ${STATIC_LOG}"
    cd "$PROJECT_ROOT"
    nohup python3 -m http.server "$STATIC_PORT" >> "$STATIC_LOG" 2>&1 &
    echo "[static] PID $!"
fi

# ── cloudflare 터널 (소유 관리 — URL 캡처 위해 기존 8765 터널 정리 후 새로 기동) ──
pkill -f "cloudflared tunnel --url http://localhost:${BACKEND_PORT}" 2>/dev/null || true
sleep 1
: > "$TLOG"
echo "[tunnel] 기동... 로그: ${TLOG}"
nohup cloudflared tunnel --url "http://localhost:${BACKEND_PORT}" >> "$TLOG" 2>&1 &
echo "[tunnel] PID $!"

# ── 터널 URL 추출 → Firebase 발행(화면 자동발견) ──
URL=""
for i in $(seq 1 30); do
    URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TLOG" | tail -1)
    [ -n "$URL" ] && break
    sleep 1
done
if [ -n "$URL" ]; then
    "$PYTHON" "$SCRIPT_DIR/publish_backend_url.py" "$URL" || echo "[tunnel] 경고: URL 발행 실패(화면 폴백 사용)"
    echo "[tunnel] 백엔드 URL: $URL  (화면이 자동 발견)"
else
    echo "[tunnel] 경고: 터널 URL을 못 찾음 — 화면 폴백 URL 사용"
fi

echo ""
echo "화면(정본): https://815dudwns.github.io/jongno-combined/admin-validate.html"
echo "백엔드 헬스: http://127.0.0.1:${BACKEND_PORT}/health"
