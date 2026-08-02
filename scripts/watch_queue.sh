#!/bin/bash
# 상향 큐 감시 — 발주 직후 백그라운드로 띄운다.
#   에이전트 보고가 큐에 도착하면 즉시 종료 -> PM 세션이 깨어나 영준님께 올린다.
#   영준님 입력창은 읽지도 쓰지도 않는다.
#
# 사용: scripts/watch_queue.sh <PM핸들> [최대대기초]
#   예: scripts/watch_queue.sh term_eef4ca6e-... 1800
#
# ── 실측으로 얻은 제약 (2026-08-02) ────────────────────────────────────────
#  * `--unread` 와 `--peek` 은 배타적이다. 같이 주면 invalid_argument.
#  * legacy 메시지는 읽음 처리가 아예 안 된다(legacy_read_only). 계속 다시 뜨므로
#    본 메시지 id 를 SEEN 파일에 적어두고 걸러야 한다.
#  * `--wait --timeout-ms` 가 이미 있다. 손으로 폴링 루프를 짤 필요 없다.
#  * 에러를 삼키면 '조용함'과 '고장남'이 구분되지 않는다. ok:false 는 즉시 노출한다.
#
# 부수 기능: --check-input <핸들> — 그 터미널 입력줄이 비었는지 판정.
#   0=비었음 1=타이핑중 2=판정불가. preview 의 '❯' 뒤 글자로 판별(지연 2초 이내).
#   ※ 상향 `terminal send` 를 정당화하는 근거로 쓰지 말 것 — 검사와 전송 사이
#     찰나에 타이핑이 시작되면 여전히 깨진다. 입력창을 안 건드리는 게 정답이다.

set -u

SEEN="${WATCH_QUEUE_SEEN:-/private/tmp/claude-501/watch_queue_seen.txt}"

if [ "${1:-}" = "--check-input" ]; then
    orca terminal show --terminal "$2" --json 2>/dev/null | python3 -c "
import json,sys
try:
    pv = json.load(sys.stdin)['result']['terminal'].get('preview','')
except Exception:
    sys.exit(2)                       # 조회 실패 = 판정 불가, 보내지 마라
line = next((l for l in pv.split('\n') if l.strip().startswith('❯')), None)
if line is None: sys.exit(2)
sys.exit(0 if not line.strip().lstrip('❯').strip() else 1)
"
    exit $?
fi

SELF="${1:?사용: watch_queue.sh <PM핸들> [최대대기초]}"
MAX="${2:-1800}"

mkdir -p "$(dirname "$SEEN")"
touch "$SEEN"

OUT=$(orca orchestration check --terminal "$SELF" --peek --json \
        --wait --timeout-ms "$((MAX * 1000))" 2>/dev/null \
      | grep -v '_keepalive')

printf '%s' "$OUT" | SEEN="$SEEN" python3 -c "
import json, os, sys

raw = sys.stdin.read().strip()
if not raw:
    print('TIMEOUT — 큐 조용함'); sys.exit(0)
try:
    d = json.loads(raw)
except Exception:
    print('WATCHER_BROKEN 응답 파싱 실패: ' + raw[:300]); sys.exit(2)
if not d.get('ok'):
    print('WATCHER_BROKEN ' + str((d.get('error') or {}).get('message'))); sys.exit(2)

msgs = (d.get('result') or {}).get('messages') or []
seen_path = os.environ['SEEN']
seen = set(open(seen_path).read().split()) if os.path.exists(seen_path) else set()

fresh = [m for m in msgs if not m.get('read') and m.get('id') not in seen]
if not fresh:
    print('NO_NEW — 미읽음 %d건 전부 기보고' % len(msgs)); sys.exit(0)

with open(seen_path, 'a') as f:
    for m in fresh:
        f.write(m['id'] + '\n')

print('QUEUE_HIT %d건' % len(fresh))
for m in fresh:
    print('---')
    print('from   : ' + str(m.get('from_handle')))
    print('subject: ' + str(m.get('subject')))
    print('body   : ' + str(m.get('body')))
    print('payload: ' + str(m.get('payload')))
"
exit $?
