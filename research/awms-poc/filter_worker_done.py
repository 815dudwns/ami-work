#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
awms 완료 → 종로 동기화: 작업자 완료 보호 필터 (자주 쓰는 프로세스)

목적: sync-meter-from-awms 도구에 올리기 전, 작업자가 종로 앱에서 직접 완료한 계기
      (사진/제조년월/지침 = "정보 있는 완료")를 awms 입력에서 제외한다.
      → awms("정보 없는 완료")가 작업자 실작업을 덮어쓰는 것을 막는다.
      참고: [[awms_worker_done_priority]] / awms_완료_종로동기화_프로세스.md

사용:
  python3 filter_worker_done.py <awms_rows.json> [출력경로]
    1) live ami-jongno workStatus 백업을 ~/Desktop 에 자동 다운로드
    2) 작업자 완료(정보 있는) 계기 판정
    3) awms 입력에서 그 계기 제외 → *-safe.json (기본 ~/Desktop)

  <awms_rows.json> = awms-bridge "완료받기"로 Firebase awmscomplete/{key}/rows 받아 저장한 배열.
                     (각 행에 WHM_NO=신설계기번호, WORK_STEP, CREMO_WHM_NO 등)
"""
import json, sys, os, urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

JONGNO_DB = "https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app"
KST = ZoneInfo("Asia/Seoul")


def is_worker_done(info):
    """작업자가 앱에서 직접 완료(정보 있는 완료) = 보호 대상."""
    if not isinstance(info, dict):
        return False
    if info.get('source') and info.get('source') != 'awms':
        return True
    if info.get('worker') and info.get('worker') != 'AWMS_IMPORT':
        return True
    for k in ('new_meter_photo', 'old_meter_photo', 'removal_value', 'new_meter_mfg_ym'):
        if info.get(k):
            return True
    return False


def main():
    if len(sys.argv) < 2:
        print("사용: python3 filter_worker_done.py <awms_rows.json> [출력경로]")
        sys.exit(1)
    awms_path = sys.argv[1]
    awms = json.load(open(awms_path, encoding='utf-8'))
    awms_whm = {str(r.get('WHM_NO', '')).strip() for r in awms if str(r.get('WHM_NO', '')).strip()}

    # 1) live ami-jongno 백업 (처리 전 안전망)
    ts = datetime.now(KST).strftime('%Y%m%d-%H%M%S')
    bk = os.path.expanduser(f'~/Desktop/ami-jongno-workStatus-backup-{ts}.json')
    with urllib.request.urlopen(JONGNO_DB + "/workStatus/jongno.json", timeout=30) as r:
        live = json.load(r)
    json.dump(live, open(bk, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"[백업] {bk} ({len(live)}개 주소)")

    # 2) 작업자 완료(보호) 계기
    protect = set()
    for addr, st in live.items():
        if not isinstance(st, dict):
            continue
        for meter, info in (st.get('replacement_list') or {}).items():
            if is_worker_done(info):
                protect.add(str(meter).strip())
    overlap = awms_whm & protect
    print(f"[보호] 작업자 완료 계기 전체 {len(protect)}건 / awms와 겹쳐 제외할 것 {len(overlap)}건")
    if overlap:
        print(f"       제외: {sorted(overlap)}")

    # 3) awms 입력에서 보호 계기 제외 → safe
    filtered = [r for r in awms if str(r.get('WHM_NO', '')).strip() not in protect]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(awms_path)[0] + '-safe.json'
    if not os.path.isabs(out):
        out = os.path.expanduser(os.path.join('~/Desktop', os.path.basename(out)))
    json.dump(filtered, open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"[출력] {out}  ({len(awms)} → {len(filtered)}건, 제외 {len(awms)-len(filtered)})")
    print("\n→ 이 *-safe.json 을 sync-meter-from-awms 도구에 업로드하세요.")


if __name__ == '__main__':
    main()
