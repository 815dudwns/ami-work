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
# 생존체크는 curl (lsof는 맥 업데이트 후 매달릴 수 있어 스크립트 전체가 멈춤)
if curl -s -m 2 -o /dev/null "http://127.0.0.1:${PORT}/" 2>/dev/null; then
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
# ★발행한 URL 이 **외부에서 실제로 열리는지** 확인한다 (2026-09-29 사고).
#   cloudflared 가 한 번 기동에 URL 을 둘 이상 찍는 일이 있다(연결이 끊겨 재등록하면 새 호스트를
#   받는다). 그중 하나는 죽어 있을 수 있는데 `tail -1` 은 그걸 가릴 수 없다.
#   실측 2026-09-29 15:29: 발행한 URL 이 cloudflare 에러 페이지를 내는 동안 같은 기동의 다른
#   URL 은 멀쩡히 살아 있었다. 폰은 Firebase 에 적힌 것만 보므로 죽은 URL 이 발행되면
#   **앱이 백엔드를 못 찾는다** — 현장에서는 원인을 알 수 없다.
#   그래서 발행 후 한 번 찔러보고, 죽었으면 로그의 다른 URL 로 갈아탄다.
verify_url() {   # 0 = 살아있다
    curl -s --max-time 12 "$1/api/health" 2>/dev/null | grep -q '"ok":true'
}

# ★후보는 **매번 로그를 다시 읽는다.** 터널이 늦게 뜨거나 재등록해서 새 URL 이 나중에 찍히는
#   일이 있다(실측 2026-09-29 16:47: 첫 후보가 죽어 있었고 살아 있는 URL 은 우리가 포기한 뒤
#   로그에 나타났다). 한 번 읽고 끝내면 그 URL 을 못 본다.
# ★왜 URL 이 둘 이상 나오나 — 터널 주인이 둘이다:
#   launchd `com.ami.cst-tunnel`(KeepAlive, scripts/tunnel-run.sh, 같은 로그·같은 발행 스크립트)
#   + 이 스크립트의 nohup cloudflared. 이 스크립트가 pkill 하면 launchd 가 곧 되살려 새 URL 을 받는다.
#   ★근본 해결은 '터널 주인을 하나로' 다 — PM 보고 후 정리할 사항이라 여기서는 검증으로만 막는다.
if [ -n "$URL" ]; then
    GOOD=""
    for round in 1 2 3 4 5 6 7 8; do          # 최대 ~2분, 후보를 매 라운드 다시 수집
        CANDS=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TLOG" | awk '!seen[$0]++' | tail -r 2>/dev/null \
                || grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TLOG" | awk '!seen[$0]++')
        for c in $CANDS; do
            if verify_url "$c"; then GOOD="$c"; break; fi
        done
        [ -n "$GOOD" ] && break
        echo "[cst-input] 터널 URL 아직 응답 없음(라운드 $round) — 후보: $(echo $CANDS | tr '\n' ' ')"
        sleep 8
    done
    if [ -n "$GOOD" ]; then
        [ "$GOOD" != "$URL" ] && echo "[cst-input] ★처음 뽑힌 URL($URL)이 죽어 있어 갈아탔다 -> $GOOD"
        "$PYTHON" "$SCRIPT_DIR/publish_backend_url.py" "$GOOD" || echo "[cst-input] 경고: URL 발행 실패(앱 수동입력 필요)"
        echo "[cst-input] 백엔드 URL: $GOOD  (앱이 자동 발견 · 외부 응답 확인됨)"
    else
        echo "[cst-input] ★경고: 어느 터널 URL 도 외부에서 응답하지 않는다 — 발행하지 않았다."
        echo "[cst-input]   Firebase 의 옛 URL 이 그대로 남으니, 앱이 못 붙으면 이 스크립트를 다시 돌려라."
    fi
else
    echo "[cst-input] 경고: 터널 URL을 못 찾음 — 앱 자동발견 불가(수동입력 필요)"
fi
