# ocr-meter — 계기판 OCR 판독 프로젝트

> 2026-06-11 ami-work에서 독립. 코드는 ami-work에 그대로 두고 조직(PM·메모리·문서)만 분리.

## 프로젝트 정체성
- **목적**: 계기 교체 작업자의 **수기 입력값 오류를 사진 OCR로 1차 자동검출**. 사진 분석/판독 자체가 목표가 아니라, 저장된 입력값(QR/수기) vs 사진 각인·LCD OCR 대조 → 다른 것만 사람이 본다.
- 철거계기 = 검침값(LCD) 판독 / 신설계기 = 계기번호 판독. 철거·신설은 업로드 시점에 구분.
- 모회사: [[AMI 작업지도]](ami-work) — 실효계기 교체. 이 OCR은 그 데이터관리/검증 레이어.

## 코드 위치 (중요 — 물리이동 금지)
- 모든 코드·데이터·모델·venv는 **`ami-work/research/ocr_poc`에 그대로**. 12GB(venv 4개·학습데이터·크롭).
- 이 프로젝트에서는 symlink로 접근:
  - `./ocr_poc` → `ami-work/research/ocr_poc`
  - `./ami-research` → `ami-work/research`
- 스크립트 내부 경로(CKPT/CROP_DIR 등)는 코드가 안 움직이므로 안 깨짐. **ocr_poc 안에서 작업하면 기존 그대로 동작**.
- venv: `venv_parseq`(검침값 PARSeq), `venv_easyocr`, `venv312`, `venv`. 스크립트마다 쓰는 게 다름 — 헤더/import 확인.

## 현재 성능 (2026-06-09 기준)
- **계기번호**: Apple Vision(1차) → 구글 Vision(2차) 캐스케이드. Apple 일치 → auto, 불일치만 구글 호출, 구글도 불일치 → need_human. 채택 심판은 DB(작업자 입력값) substring 대조 = 오통과0. (EasyOCR·이중판독 방식 폐기 2026-06-18 [[ocr_dynamic_crop_google]])
- **LCD 크롭**: YOLOv8 mAP50 0.86 (까만 디스플레이 직접 검출, 파란 MAC스티커 금지 [[lcd_crop_no_blue]])
- **검침값**: PARSeq 88.8% (E 95% / G 70%). **오통과(틀린데 통과) 0이 핵심 지표**. VLM 폐기.
- 평가 함정: 라벨이 작업자 입력값이라 정확도/오통과 절대수치 측정 불가 [[ocr_label_provenance]]. 사진 대조로만 진짜 성능 확인.

## 판독 캐스케이드 [[ocr_cascade_architecture]] (상세·최신 = SSOT OCR_검증규칙.md §1)
- **검침값**: PARSeq(무료, 1차) → 2차[ G = YOLO 무료 동적크롭 재시도 → 실패분만 구글(유료) / E = 구글(유료) ] → 사람
- **계기번호**: Apple Vision(무료, 1차) → 구글(유료, 2차) → 사람
- 전건 2차 안 함. 1차 일치=통과, 불일치만 2차. **전문 Sonnet 2차는 폐기**(ANTHROPIC_API_KEY 부재 → 구글로 대체 2026-06-18). EasyOCR 폐기.
3. **사람** — 2차도 실패분. `make_review.py` 카드형 HTML [[human_review_tool]] (값클릭/직접입력/불가, JSON 내보내기)
- 지침 문서: `OCR판독_지침.md` (ocr_poc 내)

## ★검증 규칙 단일 진실원 (SSOT)
- **검침값 자릿수표준·계기번호 추출·오통과0 정책·캐스케이드의 상세 규칙 = `ocr_poc/OCR_검증규칙.md`** (ami-work와 공유). 코드 검증로직이 바뀌면 **그 파일만 갱신** → ami-work daily-analysis 스킬도 그걸 참조. 아래 항목은 요약/포인터이며 상세·최신은 SSOT 우선.

## 검침값 소수점 처리 규칙 (필드별 — 영준님 2026-06-17 확정) → 상세 [[OCR_검증규칙.md]]
- **필드마다 다름. 일괄 버림 아님:**
  - whme_day(주간)/whme_mngt(야간): 소수 **버림**(정수부 비교). 예 12233.8 → 12233
  - **dm_mt_day(최대전력): 소수 살림**(소수보존 비교). 예 7.33 → 7.33
  - var_day(무효): 소수 **없음**(정수). 데이터 확증 — 전건 정수
  - E타입 검침값(whme_day): LCD에 소수 표시되나 **버림**. ★단상(E/EA) 정수부 **5칸 물리고정**이라 parseq 6자리 점탈락은 끝1자리 소수 확정→자동통과(`_ewhme_dot_recon_match`, 2026-06-28). 경우 B(자리누락) 불가
- **소수 보존 비교는 dm_mt_day 하나뿐**. 코드: `DECIMAL_FIDS = {'dm_mt_day'}` (var_day 잘못 포함됐던 것 06-17 수정)
- **작업자값 신뢰 불가**: 작업자가 최대전력(7.33)을 버림으로 착각해 7로 입력한 케이스 多 → OCR 소수값이 정답, 작업자 오류. 라벨 함정 [[ocr_label_provenance]]
- **dm_mt 점탈락 보정 = 위치고정 `_dm_recon_match` (2026-06-27 갱신)**: 점 없으면 `digits/100`로 `XXXX.XX` 재구성(2130→21.30, 000738→7.38), 0~10000 가드. 옛 위치무관 `_dm_norm`(끝0무시 숫자열) 폐기 — 2130을 2.13·213에까지 over-pass. 단일소스 `FIELD_STANDARD`/`field_decimal()`. ★작업자 버림착각(7.33→7)·검침값 over-read는 **자동통과 금지**(정수필드 일반) — review 유지. **단 E/EA whme 점탈락은 5칸 물리고정 예외**(`_ewhme_dot_recon_match`): parseq 점없이 정확히 6자리 ∧ 앞5자리==worker정수부면 자동통과. seq51(254087/25408)은 사람 final=25408=worker로 case A 확증, 회귀 over-pass 0 [[ewhme_dot_recon_5digit]]. 상세 [[OCR_검증규칙.md]]

## 검침값 4필드 패턴 [[meter_4field_pattern]]
- 1종/2종 계기 = 지침 4개: 주간(whme_day)/야간(whme_mngt)/최대전력(dm_mt_day)/무효(var_day). 단상은 주간/야간만.
- whme_day/mngt = 정수(버림), **dm_mt_day = 소수 살림**, var_day = 정수. fid별 비교규칙·자릿수 다름. (소수규칙 상세는 아래 "검침값 소수점 처리 규칙")

## 계기타입 파싱 (ami-work 데이터 규칙 상속)
- 계기번호 3~4자리에서 타입 판별 (엑셀 믿지 말 것): 17→E, 19→EA, 25/26/27→G, 45/46/47→G, 53→Amigo, 55→Amigo
- 타입별 OCR 난이도/비율 다름 — 검출 전략 멀티트랙 [[ocr_meter_detect_strategy]]
- **계기번호 over-read 추출 (2026-06-27)**: OCR이 명판 다른 숫자까지 길게 읽으면 기존 `\b\d{11}\b`로 추출 실패 → **타입자리 슬라이딩 폴백**(3~4자리가 타입코드인 11자 윈도우)으로 따냄. 채택은 DB substring 대조(오통과0). 상세 [[OCR_검증규칙.md]] · [[meterid_overread_typeslot_extract]]
- **타입별 표시후보 추출 `meterid_extract_typed` (2026-06-28)**: 옛 gnorm 첫매칭이 OA/WH 허깨비(LCD 글자조각 연결 가짜)를 표시 → DB로 타입 인지 후 E/EA·Amigo=word단위11자리+타입자리+최빈 / G=제조행 행단위연결+타입코드11윈도우 유일채택. 검증 Apple246·Google75: 현행 0% → E·Amigo 100%, G 틀림0. **표시(gres)만 교체, 채택심판 불변(오통과0)**. 상세 [[OCR_검증규칙.md]] · [[meterid_typed_extract]]

## 글로벌 규칙 상속
- 한국어, 한국 단위(₩/km/kg/24시간), KST(Asia/Seoul) 강제
- 아이콘/이모지/한자/원문자(①②③) 금지
- 위임: 로그분석·반복 Bash·복수 검색·학습 = 서브에이전트 백그라운드. PM은 판단·조율·영준님 대화.

## 주요 문서 (ocr_poc 내)
- 진행: cycle1_보고서.md, 학습준비_결과.md, 엔진비교_결과.md, 이중판독_G_결과_20260610.md, 평가셋_진실_판정_20260610.md
- 리서치: 7세그먼트_LCD_OCR_리서치.md, 맥_GPU_paddleocr_리서치.md
- 모델: run1_seg7.ckpt (PARSeq 검침값)

## 다음 (이월)
- OCR cycle3 (HANDOFF 이월). 검침값 G 정확도 개선, 오통과 0 유지.
