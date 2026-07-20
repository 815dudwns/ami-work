# ocr-meter HANDOFF

> 최종 업데이트: 2026-07-16

## 현재 상태

- 마지막 작업: **아미큐(계기큐) 계기번호 OCR 판독률 규명 → E5 처방 도출 → ami-work 전달** + 800px 압축저장 검증 + 오늘 검침값 표본.
  1. **아미큐 판독률 규명(핵심 성과)**: 영준님 체감("아미큐 계기번호 가끔 안 나온다") 실측. 아미큐=cst-input(v2)가 우리 `visionocr_batch.swift`(Apple Vision)+`_extract_meter_no` 이식. 진짜 원인=**조합(파싱) 버그, Apple OCR은 숫자 다 읽음**(정답이 raw에 96%+ 존재). DB 대조는 아미큐 불가(동시시공/기설 시 DB 공백).
  2. **E5 처방 확정**: `_extract_meter_no` 4가지 변경 — ①모든 후보에 타입코드[2:4] 유효 강제(전화번호·일련번호 오판 제거) ②공백·하이픈 낀 11자리 정규화 ③하이픈 끝4자리(-1607 부가번호) 요구 완화 ④인접1줄 결합 하이픈앵커. **실측: 구로 신설 G 50%→100%(오판0), 철거 G 55.7%→84.5%, 전체 82.1%→98.5%(오판4→0). E·Amigo 무회귀.** E6(인접2줄+전체concat)는 유해→폐기.
  3. **800px 압축저장 검증**: 영준님 "원본 800px/57KB 확정"에 실측 답. 계기번호 800px 98%(원본95%보다↑, over-read노이즈감소)·검침값 97.6%(no_crop0). ami-work 전 데이터 800 재압축+신규수집 800 예정. PARSeq 고해상학습이라 전환후 검침값 판독률 모니터 필요.
  4. **오늘 검침값 표본**: 06-30분 138건 이미 처리·검증완료(PARSeq 92.8%, 작업자오류 2건 적발). 06-09/10/12는 이미 검증된 정답이라 OCR 재실행 금지(daily_state 부재≠미처리) — 영준님 제동, 원복.
- 진행 중: 없음 (세션 매듭). ami-work에 E5 처방 전달 완료.
- 다음:
  1. **★아미큐 E5 적용 회신 대기**: ami-work PM이 `cst-input/backend/app.py` `_extract_meter_no`를 E5로 교체. 회신·질문 오면 대응. 연락=Orca(`orca terminal send`).
  2. **★EA(code-19) 실사진 표본 확보**: E5의 유일 미검증 타입. 골드셋·철거표본 모두 EA 0장. EA는 G와 동일 하이픈 프로세스라 될 것으로 예상되나 실증 필요. EA 신설 사진 나오면 검증.
  3. **cycle8 검침값 재학습(이월)**: 빌드완료·대기. `cycle8_train.sh`. c8_heldout으로 cycle7b vs cycle8 비교+over-pass0. eval 스크립트 미작성(채택판정 차단요소).
  4. Google G추출 개선(이월, 실익제한 판단대기).
- 블로커: **EA 표본 0장**(E5 EA검증 불가). cycle8 eval 스크립트 미작성.

## 이번 세션 한 일 (7/14~16)

### 아미큐 계기번호 판독률 규명 (핵심)
- 아미큐 구조 확인: OCR 도는 건 cst-input(v2)뿐(계기큐 v1은 QR/수기). Apple Vision + 우리 추출로직 이식.
- 채택방식 비교(철거 명판 표본): A 현행(순수OCR) vs B(DB substring). DB대조가 우리 인식률 숨은공신이나 **아미큐 현장은 DB 공백이라 불가**(영준님 지적).
- 조합 개선 실측: 영준님 통찰("Apple은 숫자 다 따는데 조합이 문제") 실증. raw 확인=정답이 `25-45-0079993-1607`로 찍혔는데 현행 정규식이 끝4자리 필수+공백낀11자리 못잡아 실패. E1(라인정규화)→E4(하이픈앵커)→**E5(하이픈앵커+라인폴백)** 도출.
- 구로 골드셋 검증: G 50→100(오판0), E6 유해 확인. EA는 골드셋에 0장(태스크의 'EA20'은 실제 E17).
- G·EA=같은 프로세스(하이픈, 타입코드값만 차이), Amigo=별도(하이픈없음+QR백업).
- ami-work에 E5 처방 전달.

### 800px 압축 + 오늘 표본
- 800px A/B/C 실측(계기번호·검침값 무손상, 계기번호는 향상). 영준님 800 확정.
- daily-cycle 06-30 138건(검증완료 표본). 06-09/10/12 미처리 오판→원복.

## 재현/위치
- 아미큐 실측: `ocr_poc/amiq_recognition_gap.md`, `guro_readrate_result.md`, `_amiq_analyze.py`(A/E5/E6 인라인, E5 참조구현).
- 800px 실측: `res_test_meterid_result.md`, `res_test_meter_result.md`.
- 골드셋: `ocr_poc/meterid_goldset/`(guro_GOLD67.csv, photos_guro/, a31_g_GOLD119.csv).
- cycle8(이월): `cycle8_prepare.py`, `cycle8_train.sh`, `lmdb/c8_heldout`.
