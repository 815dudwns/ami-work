---
name: daily-cycle
description: ocr-meter 데일리 사이클. 오늘 Firebase DB 완료 작업 → Storage 사진 → OCR 대조 (검침값 + 계기번호 두 트랙). /daily-cycle 또는 "데일리사이클", "오늘 사이클 돌려" 시 실행.
---

# 데일리 사이클 (ocr-meter 전용)

## 목적
매일 작업 완료분(철거+신설)을 Firebase에서 받아 OCR로 자동 검증.
- 트랙1 철거 검침값: removal_values 매칭돼 있으니 그걸 정답 삼아 검침값 뽑기. Storage lcd.jpg(없으면 원본+YOLO) → PARSeq → removal_values 대조
- 트랙2 신설 계기번호: 작업자가 입력한 계기번호 vs OCR 검출 계기번호 일치 확인. Storage new.jpg → Apple Vision → DB new_meter_id 대조
- 최종 목표는 일반사이클과 공유 = **검침값 OCR 정확도 향상** (약한 고리가 PARSeq)

## 실행 순서

### 1단계 — 사이클 실행
```bash
cd /Users/woodelight/Projects/ocr-meter/ocr_poc
venv_parseq/bin/python3 daily_cycle.py [--date YYYYMMDD]
```
- 기본값: 오늘 KST
- 결과: `daily_state.csv` (검침값) + `daily_meterid.csv` (계기번호)

### 2단계 — 현황 확인
```bash
venv_parseq/bin/python3 daily_cycle.py --stats
```

### 3단계 — 불일치 사람검증 HTML 업로드
```bash
venv_parseq/bin/python3 daily_cycle.py --review --upload
```
- Firebase Storage 업로드 후 URL 출력
- 검침값 + 계기번호 각각 HTML 생성

### 4단계 — 판정 JSON 반영 (사람 검토 완료 후)
```bash
venv_parseq/bin/python3 daily_cycle.py --apply 검침값_판정.json
venv_parseq/bin/python3 daily_cycle.py --apply-meterid 계기번호_판정.json
```

## 상태값
- `auto`: PARSeq/Vision 자동 일치
- `need_sonnet`: PARSeq 불일치, Sonnet 필요
- `need_human`: 사람 검토 필요
- `no_crop`: YOLO 미검출
- `no_photo`: Storage 사진 없음

## 파일 위치
- 코드: `ocr_poc/daily_cycle.py`
- 임시 사진: `/tmp/daily_cycle/`
- 상태: `ocr_poc/daily_state.csv`, `ocr_poc/daily_meterid.csv`

## PM 행동 지침
1. `--date` 없으면 오늘 날짜로 실행
2. 실행은 백그라운드 위임, 완료 후 stats 보고
3. need_human 있으면 --review --upload 후 URL 영준님께 전달
4. 판정 JSON 받으면 --apply로 반영
