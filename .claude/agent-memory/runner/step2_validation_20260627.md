---
name: ocr_step2_validation_20260627
description: 학습셋 정밀 점검 결과 (재학습 2단계 직전) — G 신호 27건, cycle 오염 346건 적발
metadata:
  type: project
---

# OCR 학습셋 정밀 점검 (재학습 2단계, 2026-06-27)

## 핵심 발견

### 1. G 325건 source 분해
- **진짜 G 신호 (human + daily_state): 27건만**
  - PARSeq 오독을 사람이 수정한 경우 = 학습 가치 있음
  - daily_state 258건 중 27건만 사람 개입 (10.5%)
  - 나머지 231건은 auto-G (자기강화, 신호 약함)

- **cycle_state G: 67건**
  - human 61건 (사람 개입)
  - auto 6건
  - 다만 fid 미기입 → 신뢰도 낮음

### 2. cycle_state 390건 중 346건 오염 적발
- **magnitude_excessive (>10000): 346건**
  - 정상 범위: 0~9999.99
  - **dm_mt ↔ var 필드 스왑 강력 의심**
  - cycle.py 자동추출 오류

### 3. 오염 3건 제거 확정
| 파일 | final | 사유 |
|------|-------|------|
| 20260615_081233_dm_mt_day.png | 98240 | dm_mt 초과범위 |
| 20260615_090345_dm_mt_day.png | 181741 | dm_mt 초과범위 |
| 20260617_110617_whme_mngt.png | 31 | whme_mngt 비현실 |

### 4. 크롭 정합
- ✓ 1062건 전체 무결성 확인 (누락 0, 깨짐 0)

### 5. held-out 평가셋
- cycle7b 아직 미생성
- E 575건 + G 325건 모두 held-out으로 분리 가능

## 학습셋 구성

### 옵션 1: gt_daily.txt (신뢰도 높음)
- 672건 - 3건 제외 = **669건**
- E 414 + G 256

### 옵션 2: gt_all.txt (샘플 크기 크지만 오염 포함)
- 1062건 - 3건 제외 = **1059건**
- E 575 + G 322 + ? 162
- cycle_state 오염 346건 포함 → 성능 저하 우려

## 권장 다음 단계
- [ ] gt_daily.txt, gt_all.txt 생성 (3건 제외)
- [ ] held-out G 평가셋 분리 및 고정 (100~120건 예약)
- [ ] 두 버전 병렬 학습 테스트
- [ ] E 무회귀 확인 (cycle신뢰도 낮음)

**원본 CSV 불변 유지. harvester 산출물만 가공.**
