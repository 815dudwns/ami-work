#!/usr/bin/env python3
"""
새 work-status 가공:
- Firebase에서 백업한 1,085건의 상태를 새 site-data 기준으로 필터
- 새 DB에 없는 주소는 제거 (사무실이 완료처리해서 빠진 것)
- 새 DB에 남은 주소 중:
  - cutoff(2026-05-13 15:54 KST=06:54 UTC) 이후 완료 → 그대로 유지
  - cutoff 이전 complete → state=pending + 재작업 플래그 추가 (33건 추정)
- pending/hold/fail은 그대로 유지
"""

import json
import datetime
from datetime import timezone
from collections import defaultdict, Counter

BASE = '/Users/woodelight/Projects/ami-work'
SITE_NEW = f'{BASE}/data/site-data-new.json'
WS_OLD = f'{BASE}/data/work-status-firebase-backup.json'
OUT = f'{BASE}/data/work-status-new.json'

# cutoff: 2026-05-13 15:54:58 KST = 06:54:58 UTC (aware)
CUTOFF_UTC = datetime.datetime(2026, 5, 13, 6, 54, 58, tzinfo=timezone.utc)
CUTOFF_TS = CUTOFF_UTC.timestamp()  # epoch seconds — timezone-safe 비교용

def main():
    with open(SITE_NEW) as f:
        new = json.load(f)
    new_addrs = set(d['주소'] for d in new if d.get('주소'))
    
    with open(WS_OLD) as f:
        old_ws = json.load(f)
    
    print(f"새 DB 주소 unique: {len(new_addrs)}")
    print(f"기존 workStatus: {len(old_ws)}")
    
    new_ws = {}
    stats = Counter()
    reworks = []
    
    for addr, v in old_ws.items():
        if not isinstance(v, dict): continue
        state = v.get('state')
        in_new_db = addr in new_addrs

        if state == 'complete':
            at = v.get('updatedAt', '')
            if not in_new_db:
                # 완료된 건 새 DB에서 빠져도 그대로 complete 유지 (히스토리 보존)
                new_ws[addr] = v
                stats['완료_새DB에없음_유지'] += 1
                continue
            try:
                # fromisoformat: 'Z' 제거 → naive UTC, '+09:00' → aware KST
                # 양쪽 epoch(timestamp)로 변환하면 aware/naive 혼합 TypeError 없음
                raw = at.replace('Z', '+00:00')
                t = datetime.datetime.fromisoformat(raw)
                # naive이면 UTC로 간주
                if t.tzinfo is None:
                    t = t.replace(tzinfo=timezone.utc)
                is_today = t.timestamp() >= CUTOFF_TS
            except:
                # 타임스탬프 없거나 오류 → 시드 데이터(옛 일괄 업로드) → 그대로 complete 유지
                new_ws[addr] = v
                stats['시드데이터_완료유지'] += 1
                continue

            if is_today:
                # 오늘 완료 + 새 DB에 남음 → 그대로 유지
                new_ws[addr] = v
                stats['오늘완료_유지'] += 1
            else:
                # 이전 완료인데 새 DB에 또 등장 → 재작업 플래그
                new_ws[addr] = {
                    **v,
                    'state': 'pending',
                    'rework': True,
                    'previousCompleteAt': at,
                    'previousCompleteBy': v.get('updatedByName', ''),
                    'updatedAt': '',
                    'updatedBy': '',
                    'updatedByName': '',
                    'reason': '',
                }
                stats['재작업_플래그'] += 1
                reworks.append((addr, at, v.get('updatedByName','')))
        elif state in ('hold', 'fail', 'pending'):
            if in_new_db:
                new_ws[addr] = v
                stats[f'{state}_유지'] += 1
            else:
                stats[f'{state}_새DB에없음_제거'] += 1
        else:
            stats['기타'] += 1
    
    print(f"\n=== 가공 통계 ===")
    for k, v in stats.most_common():
        print(f"  {k}: {v}")
    print(f"  최종 workStatus: {len(new_ws)}건")
    
    print(f"\n=== 재작업 플래그 33건 샘플 ===")
    for addr, at, name in reworks[:10]:
        print(f"  {at} | {name} | {addr}")
    
    with open(OUT, 'w') as f:
        json.dump(new_ws, f, ensure_ascii=False, indent=2)
    print(f"\n저장: {OUT}")

if __name__ == '__main__':
    main()
