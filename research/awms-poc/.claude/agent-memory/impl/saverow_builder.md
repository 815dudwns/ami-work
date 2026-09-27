---
name: saverow-builder
description: awms saveRow payload 빌더 스크립트 위치 및 구조 — 철거(5000)+신설(4000) FormData 자동 조립
metadata:
  type: project
---

`queue_saverow_builder.py` — awms-poc 루트에 위치

**Why:** jongno 완료 계기 1건을 awms 철거/신설 등록에 필요한 FormData payload로 자동 조립. dry-run 기본, --push 시에만 CDP POST.

**How to apply:** 큐 실행 시 이 스크립트를 base로 확장. 템플릿은 template_5000_L195.json / template_4000_L201.json (파일첨부 없는 깔끔한 295/315 필드 버전).

## 템플릿 선정 근거
- recording_2255.jsonl line 195 (5000, 295필드, 43채움) — 파일첨부 없음
- recording_2255.jsonl line 201 (4000, 315필드, 69채움) — 파일첨부 없음
- line 434/440은 ATCH_FILE_ID 필드 추가됨 (사진첨부 포함 케이스)

## 동적 필드 출처 (2026-06-03 확정)
- jongno DB: removal_meter_no, new_meter_no, removal_value, nd_digits, cremo_efec_ym
- CDP selectCustomerInfo(철거계기): **CUST_NO(=CNTR_NO)**, PRDC_YM, CNTR_CLAS_CD, GUM_DAY, WRK_PLCE_ADDR_CTT, CNTR_PWR
  - CUST_NO == CNTR_NO 검증: 2건(06450094432, 02171625850) 일치, 불일치 없음
  - selectCustomerInfo 응답에 CONS_NO 없음 (CUST_NO가 계약번호)
- CDP mobMtr8000/getMainList(무파라미터): **LV_CONS_NO(=CONS_NO)**, METR_SEAL_VAL(봉인번호)
  - CONS_NO 출처는 mobMtr8000 전용. mobMtr1000/getMainList(busiKey=CONS_NO, workStep=25)도 CNTR_NO/CONS_NO 있으나 WHM_NO 매칭 필요
- 자동(KST): ACT_DATE(YYYYMMDD HH:MM), *_YMD(YYYYMMDD), *_YM(YYYYMM)

## CDP 조회 게이트 (2026-06-03 분리)
- --adb-pid 있으면 읽기 조회(selectCustomerInfo + getMainList8000) 실행
- --push 있을 때만 saveRow POST 실행 (조회와 독립)

## 고정값 (HDQR_CD=3970, DEPT2=7793, WORK_STEP=25, EX_WORK_STEP=20)
템플릿에서 그대로 유지. 종로본부/사무소 코드 고정.
