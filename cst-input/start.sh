#!/bin/bash
# 통신팀 awms 맥 입력장치 — 백엔드+UI 기동 (uvicorn 단일, 정적 StaticFiles 마운트)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"          # ami-work/
VENV_UVICORN="$PROJECT_ROOT/research/ocr_poc/venv_parseq/bin/uvicorn"
PORT="8766"
LOG="/tmp/cst-input-backend.log"

if lsof -i ":${PORT}" -sTCP:LISTEN -t > /dev/null 2>&1; then
    echo "[cst-input] 이미 실행 중 (포트 ${PORT})"
    exit 0
fi
echo "[cst-input] 기동... http://127.0.0.1:${PORT}  로그: ${LOG}"
cd "$PROJECT_ROOT"
nohup "$VENV_UVICORN" app:app \
    --app-dir "$SCRIPT_DIR/backend" \
    --host 127.0.0.1 --port "$PORT" \
    >> "$LOG" 2>&1 &
echo "[cst-input] PID $!"
