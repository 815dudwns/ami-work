# awms 계기교체 큐 자동등록 (jongno 완료 → awms saveRow)

> 작업자가 종로앱(jongno)에서 교체 완료 → 큐가 awms에 자동 등록(임시저장).
> 2026-06-04 새벽: 모든 필드 출처 규명 완료. 통합 push 테스트만 남음(awms 세션 4시간 만료로 내일).
> 빌더: `research/awms-poc/queue_saverow_builder.py` (문법 OK)

## CDP 인프라 (맥이 폰 awms 세션 빌려 fetch)
- awms 세션은 폰 awms-bridge WebView에만 있음 (OTP 2단계, 4시간 만료). PC는 403.
- adb forward + CDP(Chrome DevTools Protocol)로 맥에서 폰 세션 fetch:
  ```
  ADB=~/Library/Android/sdk/platform-tools/adb
  $ADB shell svc power stayon true; $ADB shell input keyevent KEYCODE_WAKEUP
  PID=$($ADB shell ps -A | grep awmsbridge | awk '{print $2}')
  $ADB forward tcp:9222 localabstract:webview_devtools_remote_$PID
  # localhost:9222/json → awms.kdn.com 페이지 webSocketDebuggerUrl
  # websocket-client suppress_origin=True, Runtime.evaluate(awaitPromise,returnByValue)
  ```
- **주의: CDP 타임아웃 = 폰 절전. KEYCODE_WAKEUP + stayon true 먼저.**

## 큐 1건 흐름 (철거 → 신설, 한 행 연결)
1. **봉인 조회**: `mobMtr8000/getMainList`(무파라미터) → METR_SEAL_VAL(현재봉인), LV_CONS_NO(=CONS_NO)
2. **고객조회**: `mobMtr5000/selectCustomerInfo?BONBU_CD=3970&OFFC_CD=7793&vBarcdQr=<철거계기>&vMenu=10`
   → PRDC_YM(철거제조월), CNTR_CLAS_CD(계약종별), CUST_NO(=CNTR_NO), GUM_DAY, 주소, CNTR_PWR
3. **철거 saveRow**: `mobMtr5000/saveRow` (FormData) → 응답 `consTgtSeqno`
4. **getDetail**: `mobMtr1000/getDetail?...&CONS_TGT_SEQNO=<consTgtSeqno>` → 301키(awms가 채운 제조월·메타)
5. **자재조회**: `mobMtl1000/selectMtrlUseYn?vBarcdQr=<신설계기>&vGubun=T` → MNFCT_YM(제조월), MTRL_NO(자재번호)
6. **신설 saveRow**: `mobMtr4000/saveRow` (getDetail 베이스 + 신설정보, EX_WORK_STEP=25, CONS_TGT_SEQNO 주입)
7. **봉인 +수량**: `mobMtr8000/saveRow {METR_SEAL_VAL: 현재+수량}` (단상+1/삼상+2) — awms 자동 안 함, 큐가 직접

## 필드 출처 (규명 완료)
| 필드 | 출처 |
|---|---|
| CONS_NO | 봉인조회 LV_CONS_NO (397820263153=14차) |
| CNTR_NO | selectCustomerInfo CUST_NO |
| 철거 제조월 DREMO_PRDC_YM | getDetail (selectCustomerInfo PRDC_YM) |
| 신설 제조월 CREMO_PRDC_YM | **jongno new_meter_mfg_ym** (작업자입력) 우선 > selectMtrlUseYn MNFCT_YM > 오늘월 |
| 신설 자재번호 CREMO_MATL_NO | selectMtrlUseYn MTRL_NO |
| 1행 연결 | 철거 consTgtSeqno → 신설 CONS_TGT_SEQNO 주입 (+ EX_WORK_STEP=25) |
| 봉인 SEAL_NO | 현재 봉인값. 삼상이면 SEAL_NO2=현재+1 (2개) |
| 봉인 +수량 | 신설 후 mobMtr8000/saveRow로 +1(단상)/+2(삼상) 직접 설정 |
| **지침 주간/야간** | 계약종별 905(심야전력)→`DGD_WHME_NDL_MNGT_QTT` / 그외→`DGD_WHME_NDL_DAY_QTT` |
| **사진 철거전** | 철거 saveRow `DREMO_ATCH_FILE_ID_3_SRC` = jongno old_meter_photo (blob) |
| **사진 철거후** | 신설 saveRow `CREMO_ATCH_FILE_ID_3_SRC` = jongno new_meter_photo (blob) |
| 단상/삼상 | 계기번호 3~4자리 (53=단상 Amigo / 55=삼상 Amigo, 45-47=삼상 G) |

## 계약종별 (getCommonCode)
- 100 = 주택용 (주간 지침)
- 905 = 심야전력(갑) (야간 지침 MNGT_QTT) ← 영준님 발견

## 검증된 것 (2026-06-04)
- 철거·신설 saveRow 200, consTgtSeqno 1행 연결 ✓
- getDetail 기반 제조월·메타 정확 ✓
- 봉인 +1(단상)/+2(삼상) — mobMtr8000/saveRow 직접 설정 (3967106→07→09 일관) ✓
- 사진 = saveRow FormData `_SRC` 필드에 Blob 직접 (innorix 불필요, awms-extension 확인) ✓
- 지침 주간/야간 = CNTR_CLAS_CD 905→MNGT_QTT 확인 ✓

## 내일 통합 테스트 (영준님 재로그인 후)
세션 살린 뒤 CDP forward → 삭제 → push:
```
# 9953 단상/주택용: 02171625850 → 99531111111
python3 queue_saverow_builder.py --removal-meter 02171625850 --new-meter 99531111111 \
  --removal-value 1 --mfg-ym 2026-01 --old-photo "<jongno old_meter_photo URL>" \
  --new-photo "<jongno new_meter_photo URL>" --push --adb-pid $PID
# 9955 삼상/심야전력: 06450097553 → 99551111111 (지침 야간 MNGT, 봉인+2)
python3 queue_saverow_builder.py --removal-meter 06450097553 --new-meter 99551111111 \
  --removal-value 2 --mfg-ym 2026-01 --old-photo "<URL>" --new-photo "<URL>" --push --adb-pid $PID
```
검증 항목: 제조월(202601)·봉인(단상+1/삼상+2)·1행·사진2장(DREMO_3/CREMO_3)·지침(100→DAY/905→MNGT)

## 남은 정리
- awms에 가짜 임시저장 잔여 (9953/9955 등) — 내일 세션 살린 뒤 resetRows 삭제
- 실제 운영: 큐 입력 = jongno 완료 데이터(계기번호·지침·사진URL·제조월) 자동 추출 → 위 인자
