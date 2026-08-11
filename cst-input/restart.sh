#!/bin/bash
# 통신팀 백엔드 재구동 — app.py 를 고쳤으면 **이걸 돌려야 반영된다.**
#
# 왜 따로 있나: start.sh 는 포트가 응답하면 "이미 실행 중"으로 그냥 끝난다(기동 전용).
#   그래서 코드를 고치고 start.sh 를 다시 돌려도 아무 일도 일어나지 않는다.
#   2026-08-11 사고: 그 상태로 12일간 옛 코드가 돌아 addl/EXT_CONN_DEV 가 통째로 무시됐다.
# uvicorn --reload 를 안 쓰는 이유: 감시범위(ami-work 전체 .py 465개)와 **전송 중 재시작 유실**.
#
# 사용법:
#   ./cst-input/restart.sh            # 진행 중 전송 있으면 물어보고, yes 일 때만 재구동
#   ./cst-input/restart.sh --check    # 재구동 없이 상태만 본다 (안전)
#   ./cst-input/restart.sh --force    # 묻지 않고 강행 (진행 중 전송이 있어도 죽인다)
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="8766"
ARCHIVE="$HOME/.ami-cst-archive"
TMPJSON="${TMPDIR:-/tmp}/.cst_health.json"
FORCE=0; CHECK=0
for a in "$@"; do
    case "$a" in
        --force) FORCE=1 ;;
        --check) CHECK=1 ;;
        *) echo "알 수 없는 옵션: $a  (--check | --force)"; exit 2 ;;
    esac
done

# 현재 백엔드 상태 출력. 반환값 0=정상 / 1=stale / 2=응답없음
show_health() {
    curl -s -m 3 "http://127.0.0.1:${PORT}/api/health" 2>/dev/null > "$TMPJSON" || true
    python3 - "$TMPJSON" <<'PY'
import sys, json
try:
    d = json.load(open(sys.argv[1]))
except Exception:
    d = None
# 404 는 FastAPI 가 {"detail":"Not Found"} 로 답한다 — 파싱은 되지만 헬스가 아니다.
# 이 엔드포인트가 없는 옛 코드가 돌고 있는 상태이며, 2026-08-11 사고가 정확히 이 모습이었다.
if not isinstance(d, dict) or "boot_ts" not in d:
    print("  /api/health 없음 — 백엔드가 죽었거나, 이 엔드포인트가 없는 **옛 코드**가 돌고 있다")
    print("     -> app.py 를 고친 뒤 재구동을 안 한 상태일 수 있다. 이 스크립트로 재구동하라.")
    raise SystemExit(2)
print(f"  기동   {d.get('boot_ts', '?')}")
print(f"  app.py {d.get('app_py_mtime', '?')}  sha={d.get('app_py_sha256_12', '?')}  git={d.get('git_head') or '?'}")
print(f"  stale  {d.get('stale')}  — {d.get('hint', '')}")
raise SystemExit(1 if d.get('stale') else 0)
PY
}

echo "=== 현재 상태 ==="
show_health
[ "$CHECK" = "1" ] && exit 0

# ── 진행 중 전송 확인 (전송 도중 죽이면 그 건이 끊긴다) ──
# 전송 아카이브 job.json 은 전송이 끝나면 status 가 sending 에서 바뀐다.
# sending 인 채로 최근 10분 안에 갱신된 잡 = 지금 awms 로 사진을 밀고 있는 중일 수 있다.
INFLIGHT=$(python3 - "$ARCHIVE" <<'PY'
import sys, json, time, glob, os
base = sys.argv[1]
now = time.time()
out = []
for p in glob.glob(os.path.join(base, "*", "*", "job.json")):
    try:
        if now - os.path.getmtime(p) > 600:      # 10분 넘게 안 바뀐 건 중단된 잔재로 본다
            continue
        j = json.load(open(p))
        if str(j.get("status", "")) == "sending":
            out.append(f"{os.path.basename(os.path.dirname(p))}  (시작 {j.get('ts', '?')})")
    except Exception:
        pass
print("\n".join(out))
PY
)

echo
if [ -n "$INFLIGHT" ]; then
    echo "!! 진행 중일 수 있는 전송이 있다 (status=sending, 최근 10분 내 갱신):"
    echo "$INFLIGHT" | sed 's/^/     /'
    echo "   지금 죽이면 그 건의 awms 전송이 중간에 끊긴다(사진 일부만 올라갈 수 있다)."
    if [ "$FORCE" = "1" ]; then
        echo "   --force 지정됨 — 그대로 진행한다."
    elif [ -t 0 ]; then
        printf "   그래도 재구동할까? (yes 입력 시에만 진행) > "
        read -r ANS
        [ "$ANS" = "yes" ] || { echo "   중단했다. 전송이 끝난 뒤 다시 실행하라."; exit 1; }
    else
        echo "   대화형 터미널이 아니라 물어볼 수 없다 — 중단했다. 확인 후 --force 로 실행하라."
        exit 1
    fi
else
    echo "진행 중 전송 없음 — 재구동해도 안전하다."
fi

# ── 재구동 ──
echo
echo "=== 재구동 ==="
PIDS=$(lsof -tiTCP:${PORT} -sTCP:LISTEN 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "  종료: PID $PIDS"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
    for _ in $(seq 1 20); do
        sleep 0.5
        lsof -tiTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1 || break
    done
    if lsof -tiTCP:${PORT} -sTCP:LISTEN >/dev/null 2>&1; then
        echo "  정상 종료 실패 — kill -9"
        # shellcheck disable=SC2086
        kill -9 $(lsof -tiTCP:${PORT} -sTCP:LISTEN) 2>/dev/null || true
        sleep 1
    fi
else
    echo "  돌고 있는 백엔드 없음 — 새로 띄운다."
fi

"$SCRIPT_DIR/start.sh"

# ── 반영 확인 ──
echo
echo "=== 반영 확인 ==="
for _ in $(seq 1 10); do
    sleep 1
    curl -s -m 3 -o /dev/null "http://127.0.0.1:${PORT}/api/health" 2>/dev/null && break
done
if show_health; then
    echo "  OK — 디스크 코드가 그대로 올라갔다."
else
    echo "  !! 아직 stale 이거나 응답이 없다. 로그 확인: /tmp/cst-input-backend.log"
fi
