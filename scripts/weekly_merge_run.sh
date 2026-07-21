#!/bin/bash
# 종로 workStatus/jongno 주간 아카이브 자동실행 (launchd 월요일 05:00 KST).
# 감독모드(첫 3~4주): 실행 후 결과를 로그+macOS알림+best-effort orca로 PM 보고. 실패 시 자동중단(비정상 exit).
# 안전: python 스크립트가 write 직전 백업 선행 + 배치별 리드백검증, 리드백 불일치 시 RuntimeError→비정상 exit.
set -o pipefail
PY=/Library/Frameworks/Python.framework/Versions/3.14/bin/python3
DIR=/Users/woodelight/Projects/ami-work
RDIR="$DIR/data/weekly_merge_reports"
TS=$(date +%Y%m%d-%H%M%S)
LOG="$RDIR/merge-$TS.log"
mkdir -p "$RDIR"
cd "$DIR" || exit 1
{
  echo "=== 종로 주간 아카이브 $TS (KST $(date '+%Y-%m-%d %H:%M:%S %Z')) ==="
  "$PY" scripts/weekly_workstatus_merge.py --apply
} > "$LOG" 2>&1
RC=$?
ln -sf "merge-$TS.log" "$RDIR/latest.log"

SUM=$(grep -E "stub화|라이브 예상 크기|절감\(freed\)|아카이브 대상|리드백 불일치|RuntimeError|Traceback" "$LOG" | tail -6 | tr '\n' ' | ')
if [ $RC -eq 0 ]; then
  MSG="[성공] $SUM"
else
  MSG="[★실패 RC=$RC — 자동중단] 백업선행됐으니 안전. 로그=$LOG | $SUM"
fi
echo "$MSG" >> "$LOG"

# macOS 알림(감독모드 능동보고)
/usr/bin/osascript -e "display notification \"$MSG\" with title \"종로 주간 아카이브\" sound name \"Glass\"" 2>/dev/null

# best-effort: ami-work PM 세션에 orca 보고(핸들 있으면)
ORCA=$(command -v orca || echo /opt/homebrew/bin/orca)
if [ -x "$ORCA" ]; then
  H=$("$ORCA" terminal list 2>/dev/null | grep -i "Projects/ami-work" | grep -iE "Firebase|비용|PM|아카이브" | head -1 | awk '{print $1}')
  [ -n "$H" ] && "$ORCA" terminal send --terminal "$H" --text "[주간아카이브 자동/$TS] $MSG" --enter 2>/dev/null
fi
exit $RC
