#!/bin/bash
# tunnel-run.sh — cloudflared quick 터널을 foreground(exec)로 실행 + URL 자동발행.
# launchd가 이 프로세스(=cloudflared)를 직접 감시(KeepAlive) → 죽으면 재시작.
# 재시작 시 새 URL이 나오면 백그라운드 감지 루프가 다시 Firebase에 발행 → 화면/앱 자동발견.
#
# 사용: tunnel-run.sh <PORT> <TUNNEL_LOG> <PUBLISH_PY>
set -uo pipefail
PORT="$1"
TLOG="$2"
PUBLISH_PY="$3"
PYTHON="/Users/woodelight/Projects/ami-work/research/ocr_poc/venv_parseq/bin/python"
CLOUDFLARED="/opt/homebrew/bin/cloudflared"

: > "$TLOG"

# URL 감지 → 발행 (백그라운드). cloudflared가 로그에 URL 찍을 때까지 대기.
(
  for i in $(seq 1 90); do
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TLOG" 2>/dev/null | tail -1)
    if [ -n "$url" ]; then
      "$PYTHON" "$PUBLISH_PY" "$url" >> "${TLOG}.publish" 2>&1
      break
    fi
    sleep 1
  done
) &

# cloudflared를 이 프로세스로 대체 → launchd가 직접 관리
exec "$CLOUDFLARED" tunnel --url "http://localhost:${PORT}" >> "$TLOG" 2>&1
