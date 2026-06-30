#!/bin/bash
# start.sh — 검증 포털 상시 기동 스크립트
# 역할: uvicorn 백엔드(8765) + 정적 서버(8080) 동시 기동
# 이미 떠 있으면 중복 기동하지 않음
# 로그: /tmp/amiwork-backend.log / /tmp/amiwork-static.log

set -euo pipefail

# 프로젝트 루트 (이 스크립트 위치 기준으로 상위 3단계)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

VENV_UVICORN="$PROJECT_ROOT/research/ocr_poc/venv_parseq/bin/uvicorn"
BACKEND_MODULE="research.admin-validation.backend.app:app"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT="8765"
STATIC_PORT="8080"
BACKEND_LOG="/tmp/amiwork-backend.log"
STATIC_LOG="/tmp/amiwork-static.log"

# ── 백엔드 기동 ──────────────────────────────────────
if lsof -i ":${BACKEND_PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
    echo "[backend] 이미 실행 중 (포트 ${BACKEND_PORT})"
else
    echo "[backend] 기동 중... 로그: ${BACKEND_LOG}"
    cd "$PROJECT_ROOT"
    nohup "$VENV_UVICORN" "$BACKEND_MODULE" \
        --host "$BACKEND_HOST" \
        --port "$BACKEND_PORT" \
        >> "$BACKEND_LOG" 2>&1 &
    echo "[backend] PID $!"
fi

# ── 정적 서버 기동 ───────────────────────────────────
if lsof -i ":${STATIC_PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
    echo "[static] 이미 실행 중 (포트 ${STATIC_PORT})"
else
    echo "[static] 기동 중... 로그: ${STATIC_LOG}"
    cd "$PROJECT_ROOT"
    nohup python3 -m http.server "$STATIC_PORT" \
        >> "$STATIC_LOG" 2>&1 &
    echo "[static] PID $!"
fi

echo ""
echo "접속 주소: http://localhost:${STATIC_PORT}/admin-validate.html"
echo "백엔드 헬스: http://${BACKEND_HOST}:${BACKEND_PORT}/health"
