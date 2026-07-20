---
name: result-revalidate
description: ocr-meter 결과 재검증. 검증 완료된 정답(auto 성공 + need_human 판정완료)을 학습셋으로 PARSeq 재학습 → 학습모델로 다시 판독해 검침값 OCR 정확도를 올린다. 학습은 이 스킬에서만 한다. /result-revalidate 또는 "결과 재검증", "재학습" 시 실행.
---

# 결과 재검증 (ocr-meter 전용) — 유일한 학습 수단

## 핵심 정의 (영준님 2026-06-13)
**OCR 정확도를 실제로 올리는 학습은 이 스킬에서만 한다.**
데일리사이클(값 맞나 검증) · 일반사이클(표본 늘리기 + 측정확률 높이기)은 **데이터를 쌓고 측정만** 한다.
그렇게 **검증 확정된 정답**을 모아 PARSeq를 재학습하고, 학습 모델로 다시 판독해 개선을 확인하는 게 결과 재검증이다.

## 학습셋 = (데일리 + 일반) 검증 데이터 + need_human 판정결과 (영준님 2026-06-13)
**결과 재검증 대상 = 데일리사이클 검증분 + 일반사이클 검증분 + need_human 판정완료분을 전부 합친 것.**
양쪽 상태파일(daily_state.csv + cycle_state.csv)에서 정답 확정분을 모아 하나의 학습셋으로 만든다.

정답이 확정된 status:
- `auto` — PARSeq가 작업자값과 일치(성공)
- `sonnet` / `human` — 2차/사람이 확정한 정답
- need_human 중 **온라인 판정 페이지에서 판정 완료된 것** (sync로 human 반영된 분)
- ※ need_sonnet·need_human(미판정)·no_target·no_crop 은 정답 미확정 → 학습 제외
- 정답 = final 값, 입력 = 크롭(/tmp/cycle/{ts}.png, 없으면 검침_크롭_yolo/{ts}.png)
- 작업자 입력값 라벨 한계 [[ocr_label_provenance]] — 사람 판정 거친 것이 가장 신뢰. auto는 작업자값=PARSeq라 자기강화 주의(E편중 가능).

## 재검증 흐름
```
1) 수집  : 검증확정분(auto+sonnet+human+판정완료 need_human) → 크롭+정답 학습셋. E/G 균형 확인.
2) 학습  : PARSeq fine-tune (기존 CKPT 이어학습 또는 새 run). parseq_repo train 사용.
3) 재판독: 학습모델로 같은 표본 다시 판독 → 정확도 before/after (E/G별 분리)
4) 채택  : 개선되면 새 CKPT를 사이클 기본 모델로 교체. 오통과 0 유지 확인.
```

## 현재 약점 (2026-06-13 측정, 다음 학습 타겟)
- 검침값 PARSeq: E·G 모두 production 95% 미달. 특히 **G 7세그먼트를 거의 못 읽음**(크롭 멀쩡한데 자릿수 누락/완전실패: 139798→13798, 204552→0). 크롭/소수점/엔진교체 다 아님 — 순수 PARSeq 학습부족 확인.
- 갈아타기 폐기: EasyOCR·Vision·Paddle 다 PARSeq보다 못함(E에서 0~4% vs 55%). PARSeq 재학습이 유일한 길 [[ocr_engine_h2h]].
- 1차 재학습 표본: A31 591장(정답 확보), 특히 크롭 좋은 G 89건.

## 도구 / 모델
- 현 모델: outputs/parseq/2026-06-08_09-16-52/checkpoints/...val_accuracy=89.96.ckpt (run1_seg7 계열)
- 학습: parseq_repo (venv_parseq). 기존 학습 로그/스크립트 train_yolo4.sh 등 참고는 YOLO용 — PARSeq는 strhub train.
- 데이터 포맷: 크롭 이미지 + 라벨(정답 검침값 문자열). lmdb 또는 폴더구조.

## PM 행동 지침
1. 학습 실행(무거움)은 백그라운드 위임, PM은 영준님 대화
2. 학습 전 학습셋 정답 신뢰도 점검 — 비현실값(whme_day=10 등) 거르기, 사람판정분 우선
3. before/after 정확도를 E/G 분리 보고. 오통과 0 깨지면 채택 보류
4. 개선 CKPT 채택 시 cycle.py/daily_cycle.py CKPT 경로 갱신
