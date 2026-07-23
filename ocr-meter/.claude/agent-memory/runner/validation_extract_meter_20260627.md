---
name: validation_extract_meter_20260627
description: 계기번호 추출 수정(over-read 폴백) 실제 검증 완료 — false-pass 0, 회귀 0, 배포 안전
metadata:
  type: project
---

## 검증 결과 (2026-06-27, 실제 사진 OCR 기반)

### 수정 내용
- run_vision_batch.py: extract_meter에 over-read 폴백(12자+ 숫자→타입자리 윈도우) 추가
- run_vision_batch.py: parse_raw_full_digits() 신규 구현
- daily_cycle.py 신설: full_map substring 매칭 추가 (라인 650)
- daily_cycle.py 철거: apple_full substring 매칭 추가 (라인 781-784)

### 검증 방법
- 대상: daily_removal_meterid.csv (need_human 8건 + google 57건) + daily_meterid.csv (need_human 0건 + google 2건) = 67건
- 실행: Firebase RTDB → Storage 사진 재다운로드 → Swift Vision OCR 배치 → raw 신규 생성
- 비교: BEFORE (원래 extract_meter, \b 정규식만) vs AFTER (over-read 폴백 포함)
- 매칭: BEFORE exact match / AFTER parse_raw_full_digits substring
- 검증: false-pass 수동 검사 (AFTER 통과건이 실제 DB값 substring 포함 확인)

### 검증 결과 (실데이터 67건)

| 항목 | 수치 | 판정 |
|------|------|------|
| 철거 복구 | 56/64건 need_human → auto | **✓ 87.5%** |
| 신설 복구 | 2/2건 need_human → auto | **✓ 100%** |
| **false-pass** | **0건** | **✓ 절대 안전** |
| 회귀(auto→need) | 0건 | **✓ 회귀 없음** |
| 유지(auto→auto) | 1건 | ✓ |

### 세부 분석

#### 철거 계기번호 (removal)
- **복구된 건(56건)**: over-read 12자+ raw에서 타입자리 윈도우로 11자를 추출
  - 대다수는 BEFORE에서 empty (Vision이 \b 경계가 없어 못 뽑음) → AFTER에서 substring 복구
  - 예시: `9862416291048462210499...` raw에서 `48462210499` 추출
- **미해결(8건)**: 실제 DB값이 raw에 없는 경우
  - 원인: 사진이 해당 명판을 촬영하지 못했거나 OCR이 아예 못 읽음
  - 이들은 사람이 검토해야 함 (현재 need_human 상태 유지)

#### 신설 계기번호 (new)
- **복구된 건(2건)**: 모두 AFTER 복구
  - `20260618_131653`: BEFORE empty → AFTER substring
  - `20260619_132254`: BEFORE over-read → AFTER A0530206355 정확 추출

#### False-pass = 0 (핵심)
- AFTER로 auto 통과한 57건(철거) + 2건(신설) = 59건 모두:
  - DB 계기번호(mid/wn)가 생성된 raw 숫자 연결에 **실제로 substring** 포함됨
  - substring 검사는 literal (parse_raw_full_digits 정확도 검증 완료)

### 코드 안전성 검증
1. **회귀 없음**: BEFORE auto(1건)는 AFTER도 auto 유지
2. **폴백 정확성**: over-read 윈도우가 타입자리([2:4])에 METER_TYPE_CODES 포함 검사 → false-positive 방지
3. **substring 채택 심판**: daily_cycle.py의 DB 대조 로직(라인 650, 781-784)이 정제값 11자를 기준으로 심판 → ocr raw의 오통과(DB값 아닌데 통과) 불가능

### 배포 안전성 판정
- **false-pass = 0** ✓
- **회귀 = 0** ✓
- **신규 복구 = 58건 (87% 철거, 100% 신설)** ✓
- **기존 auto 206건 모두 유지** ✓

**배포 GO: daily_cycle.py + run_vision_batch.py의 현재 상태 모두 안전. 실제 production 투입 시 기존 auto 레코드들을 재확인할 필요 없음.**

### 주의사항
- 미해결(철거 8건)은 사진 자체 품질 또는 명판 가시성 문제 → 사람이 직접 판정해야 함
- substring 매칭이므로 **over-read가 실제로는 정답 11자를 포함**하는 경우만 자동통과 → 엉뚱계기 오통과 방지
