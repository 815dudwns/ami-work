# awms.kdn.com API 레퍼런스 (호출 + 필드 사전)

> 한전 awms 시스템의 API 호출과 응답 필드(섹터)를 한곳에 정리한 영구 레퍼런스.
> 프로세스/배경은 같은 폴더의 주제별 문서 참조:
> - `awms_큐_자동등록_프로세스.md` (jongno 완료 → awms saveRow 풀플로우)
> - `awms_완료_종로동기화_프로세스.md` (awms 완료 → 종로 동기화)
> - `awms_지침_구조_조사.md` (1종/2종 지침 4개 구조)
> - `awms_inject_helper_기능.md` / `findings_mainlist.md`
> 검증 구현체 = `awms-queue/www/awms-saverow.js` (라이브 검증본, 이 문서와 항상 일치 유지)

용어는 CLAUDE.md 소통규칙대로 한글 뜻을 괄호로 붙임.

---

> **시스템 2분할 (계기팀 / 통신팀) — 2026-06-06 규명**
> awms는 작업 주체별로 모듈·엔드포인트·계정이 완전히 분리된다. 본 문서도 분리 정리한다.
> - **계기팀 (MOBMTR)**: 계기 철거/신설. 베이스 `mob/mtr`. 계정 mdp/mmp(예: `mdp2504381`). 섹션 1~7.
> - **통신팀 (MOBCST)**: 모뎀/통신망 시공. 베이스 `mob/cst`. 계정 우영준/장진교(예: `729201`). 섹션 8.
> - 계정 권한도 분리 — 통신팀 세션으로 `mob/mtr` 호출 시 405, 반대도 동일.

## 0. 인프라

- **API 베이스(계기팀)**: `https://awms.kdn.com/ami/mob/mtr`  (코드 상수 `AWMS_API`)
- **API 베이스(통신팀)**: `https://awms.kdn.com/ami/mob/cst`  (MOBCST, 섹션 8)
- **API 베이스(자재)**: `https://awms.kdn.com/ami/mob/mtl`  (자재조회만 다른 도메인)
- **인증**: 로그인된 awms 세션 쿠키(`credentials:'include'`). OTP(인증번호) 2단계, 세션 약 4시간 만료. PC 직접 호출 403 → 폰 awms-bridge WebView 세션을 빌려야 함.
- **공통 파라미터 상수** (config.js `DEFAULT_AWMS`):
  - `HDQR_CD`(본부코드) = `3970` (서울본부직할) — 파라미터명은 호출마다 `BONBU_CD`/`DEPT1`/`HDQR_CD`로 다름(값은 동일)
  - `OFFICE_CD`(부서코드) = `7793` — 파라미터명 `OFFC_CD`/`DEPT2`
  - `REG_ID`(등록자 아이디) = `mdp2504381`
- **호출 경로**: 큐는 awmsEval(멀티웹뷰)로 awms 웹뷰(background)에서 fetch 실행 → 세션 공유. 맥 디버깅은 adb forward + CDP.
- **응답 형태**: 대부분 JSON 배열(래퍼 없음). 코드의 `_first()`가 배열 첫 원소를 꺼냄.

---

## 1. API 엔드포인트 카탈로그

### 조회(GET) 4종 — 등록 전 정보 수집

| # | 엔드포인트 | 용도(한글) | 핵심 파라미터 | 반환 핵심필드 |
|---|---|---|---|---|
| 1 | `mobMtr8000/getMainList` | **봉인조회** (현재 활성차수+봉인값) | 무파라미터 | `LV_CONS_NO`(활성차수 공사번호), `METR_SEAL_VAL`(현재봉인값), `TRML_SEAL_KND_CD`(봉인종류), `TRML_SEAL_CNT_VAL`(봉인수량) |
| 2 | `mobMtr5000/selectCustomerInfo` | **고객조회** (계기번호 직접입력 동작) | `BONBU_CD=3970&OFFC_CD=7793&vBarcdQr={계기번호}&vMenu=10` | `CUST_NO`(고객번호=계약번호), `CNTR_CLAS_CD`(계약종별), `CNTR_PWR`(계약전력), `PRDC_YM`(제조월), `GUM_DAY`(검침일), `WRK_PLCE_ADDR_CTT`(주소) |
| 3 | `mobMtr1000/getMainList` | **작업목록조회** (배정된 건이면 차수 정확) | `FLAG=1&DEPT1=3970&busiKey=&searchVal={계기번호}&sortKey=&workStep=20,25,28&pPageNo=1&pRowCount=100` | `WHM_NO`(계기번호), `CONS_NO`(공사번호=배정차수), `CNTR_NO`(계약번호), `CONS_TGT_SEQNO`(등록번호), `CNTR_CLAS_CD`(계약종별), `CNTR_PWR`(계약전력), `WRK_PLCE_ADDR_CTT`(주소), `REG_DATE`(등록시각) |
| 4 | `mobMtr1000/getDetail` | **신설 상세 베이스** (301키, 신설 payload 토대) | `FLAG=1&HDQR_CD=3970&CONS_NO={공사번호}&CNTR_NO={계약번호}&CONS_TGT_SEQNO={철거응답}` | 신설 saveRow에 그대로 쓰는 **301개 키**(awms가 채운 제조월·메타 포함) |
| 5 | `mobMtl1000/selectMtrlUseYn` | **신설 자재조회** (mtl 도메인) | `vBarcdQr={신설계기번호}&vGubun=T` | `MTRL_NO`(자재번호), `MNFCT_YM`(제조월) |

### 쓰기(POST) 4종 — 등록 실행

| # | 엔드포인트 | 용도(한글) | 입력형태 | 성공판정 |
|---|---|---|---|---|
| 6 | `mobMtr5000/saveRow` | **철거 등록** | FormData (295키 TMPL_5000 + 사진 `_SRC` base64) | 객체 `{result:1, consTgtSeqno}` |
| 7 | `mobMtr4000/saveRow` | **신설 등록** | FormData (getDetail 301키 베이스 + 신설정보 + 사진) | **평문 `"1"`** (객체 아님 — result===1 단독판정 금지) |
| 8 | `mobMtr8000/saveRow` | **봉인설정 +1** (다음계기 유니크용) | JSON body `{METR_SEAL_VAL: 현재+1, ...}` | — |
| 9 | `mobMtr1000/resetRows` | **임시저장 삭제** (롤백) | 행객체 배열 POST | step25→20 (큐에 재등장) |

### 메타/폴링

| # | 엔드포인트 | 용도(한글) | 파라미터 | 반환 |
|---|---|---|---|---|
| 10 | `mobMtr1000/getBusiList` | **차수 목록** (세션 확인 겸용) | `DEPT1=3970` | 차수 배열(CONS_NO + 차수명) |
| 11 | `mobMtr1000/getMainList` (workStep=25,28) | **완료/임시저장 수집** (중복등록 제외) | `FLAG=1&DEPT1=3970&busiKey={CONS_NO}&searchVal=&workStep=25,28&pPageNo=N&pRowCount=1000` | 차수별 완료건(`WHM_NO`/`CREMO_WHM_NO`) |

> 세션 체크 = 10번(getBusiList) 성공 여부. HTML(login.html) 받으면 세션 만료.
> 완료판정(큐) = 전 차수(getBusiList) 순회 → 각 차수 workStep=25,28 수집 → `WHM_NO`/`CREMO_WHM_NO`(신설계기) Set. **awms 서버가 진실** — firebase 플래그 아님.

---

## 2. 핵심 필드 사전 (섹터)

| 필드 | 한글 뜻 | 비고 |
|---|---|---|
| `WHM_NO` | 계기번호 | 11자리. 작업목록/완료의 구계기 |
| `CREMO_WHM_NO` | 신설계기번호 | 신설 saveRow의 새 계기 |
| `INSTR_NUM` | 계기번호 | mobCst(완료목록)에서의 계기번호 |
| `CONS_NO` | 공사번호 (=차수) | 차수 식별. **활성차수(LV_CONS_NO) 우선** |
| `LV_CONS_NO` | 활성 공사번호 | 봉인조회가 주는 현재 폰이 올라간 차수 = 수동등록과 동일 |
| `CNTR_NO` | 계약번호 | 계기별, 차수무관. `CUST_NO`와 동일값 |
| `CUST_NO` | 고객번호(=계약번호) | 고객조회 반환 |
| `CONS_TGT_SEQNO` | 등록번호 (awms 등록일련번호) | 철거응답 → 신설 입력으로 1행 연결 |
| `CNTR_CLAS_CD` | 계약종별 | 지침칸수·단상삼상 판정 (≥900=삼상) |
| `CNTR_PWR` | 계약전력 | kW. 지침칸수 판정(≥20) |
| `PRDC_YM` / `MNFCT_YM` | 제조년월 | 철거=PRDC_YM, 신설자재=MNFCT_YM |
| `GUM_DAY` | 검침일 | |
| `METR_SEAL_VAL` | 봉인값 | 봉인조회 현재값, 신설 후 +1 |
| `MTRL_NO` | 자재번호 | 신설 자재 |
| `WRK_PLCE_ADDR_CTT` | 작업장소 주소 | |
| `WORK_STEP`(=EX_WORK_STEP) | 작업단계 | 20=대기, 25=임시저장, 28=완료 |
| `DREMO_ATCH_FILE_ID_n` | 철거 첨부파일(사진) | n=3~6, 지침칸 매핑 |
| `CREMO_ATCH_FILE_ID_3` | 신설 첨부파일(사진) | 1장 |

---

## 3. 코드값

### WORK_STEP (작업단계)
| 값 | 의미 |
|---|---|
| 20 | 대기(미작업) |
| 25 | **임시저장** (큐 등록 후 최종상태 — awms 수동완료 전) |
| 28 | 완료 |
| 29 | 완료/전송대기 (mobCst 화면) |

### CONS_NO (차수 — 종로 사업)
| CONS_NO | 차수 | 지역 |
|---|---|---|
| 397820263032 | 5차 | 청운동, 신교동 |
| 397820263033 | 6차 | 궁정/효자/창성/통의/적선/통인동 |
| 397820263034 | 7차 | 누상동, 누하동 |
| 397820263035 | 8차 | 옥인/체부/필운동 |
| 397820263150 | 12차 | |
| 397820263151 | 13차 | |
| 397820263153 | 14차 | |
| 397820263219 | 20차 | (현재 활성) |

> CONS_NO 우선순위: `seal.LV_CONS_NO`(활성차수, 수동등록과 동일) > `main.CONS_NO`(한전 옛 배정차수, 재배정 전이라 불일치 가능) > `cust.CONS_NO`. getMainList CONS_NO는 폴백으로만.

### 계약종별 (CNTR_CLAS_CD) — 지침에 영향
- 100 = 주택용 (주간 지침)
- 905/910/915 = 심야전력류 (야간 지침 `whme_mngt`)
- 211/218/311/410/430 = (전력≥20kW) 4칸 지침
- 213/610 = (전력≥20kW) 2칸 지침
- ≥900 = 삼상 계약 (단상삼상 판정은 계기번호보다 계약종별 우선)

---

## 4. saveRow 페이로드 구조

### 철거 mobMtr5000/saveRow (295키 템플릿 TMPL_5000)
- 베이스 = 295키 템플릿 + 조회값 채움.
- `CONS_NO` = 활성차수 우선, `CNTR_NO` = CUST_NO, `DREMO_PRDC_YM`(철거제조월) = 고객조회 PRDC_YM.
- 지침: readingFieldsFor 칸별 `CGD_*_QTT = '0'`(신설지침 0), 철거지침은 jongno removal_values.
- 사진: 지침칸 매핑된 `DREMO_ATCH_FILE_ID_n_SRC`에 base64.

### 신설 mobMtr4000/saveRow (getDetail 301키 베이스)
- 베이스 = getDetail 301키 복사(null→'', float→int str).
- 오버라이드: `CREMO_WHM_NO`(신설계기), `CREMO_PRDC_YM`(제조월=jongno new_meter_mfg_ym 우선), `CREMO_MATL_NO`(자재번호), `CONS_TGT_SEQNO`(철거응답 주입 = 1행 연결), `EX_WORK_STEP=25`(임시저장 유지).
- 사진: `CREMO_ATCH_FILE_ID_3_SRC`(철거후 1장).

### 봉인설정 mobMtr8000/saveRow (JSON)
- `METR_SEAL_VAL` = 봉인조회값 + 1. 신설 직후 호출 → 다음 계기가 유니크 봉인값 받게.
- 봉인종류 `CSL_METR_TRML_SEAL_KND_CD = 'A'`(스틱II 녹색), 봉인번호 `CSL_METR_TRML_SEAL_NO` = 봉인조회값+1.
- **봉인번호2 미사용, 봉인수량 1 고정** (삼상도 1개 — 영준님 지시). inc=1 고정.

---

## 5. 지침 칸수 (readingFieldsFor)

계약종별(CNTR_CLAS_CD) + 계약전력(CNTR_PWR)으로 결정. 단상삼상 무관.

```
pwr≥20 & {211,218,311,410,430}  → 4칸 [whme_day, whme_mngt, dm_mt_day, var_day]
pwr≥20 & {213,610}              → 2칸 [whme_day, dm_mt_day]
{905,910,915}                  → 야간1칸 [whme_mngt]
그 외                          → 주간1칸 [whme_day]
```

| 칸 | 한글 |
|---|---|
| whme_day | 주간 (정상) |
| whme_mngt | 야간 (심야) |
| dm_mt_day | 최대전력 |
| var_day | 무효전력 |

---

## 6. 사진 슬롯 매핑 (지침칸 고정, 4타입 전수검증 2026-06-05)

| 지침칸 | 철거 슬롯 |
|---|---|
| whme_day(주간) | `DREMO_ATCH_FILE_ID_3` |
| whme_mngt(야간) | `DREMO_ATCH_FILE_ID_4` |
| dm_mt_day(최대전력) | `DREMO_ATCH_FILE_ID_5` |
| var_day(무효) | `DREMO_ATCH_FILE_ID_6` |
| 신설(철거후) | `CREMO_ATCH_FILE_ID_3` (1장) |

- 4칸 계기 = 철거사진 4장(_3~_6, 지침별 계기판).
- awms 사진 통과조건: 큰 해상도(2992+) + 700KB+ + ICC프로파일 없음.
- 큐 사진 경로: awms 웹뷰는 jongno Storage CORS 차단 → 큐 웹뷰(localhost)에서 fetch→base64→awms 표현식 임베드→atob→Blob→FormData. 가상테스트 = `vqphoto:{key}` → firebase `vqueue_photos/{key}`(data URL).

---

## 7. 완료 판정 (진실의 출처)

- **awms 서버가 진실.** 큐는 로드 시 전 차수 getMainList(workStep=25,28)를 라이브 조회해 `_completedNewMeters`(WHM_NO/CREMO_WHM_NO) Set 구성 → 이 Set으로 done 판정.
- firebase `awms_synced` 플래그는 **표시 캐시**일 뿐 — 큐는 일부러 무시(awms 임시저장 삭제→큐 재등장 동작 보장).
- 종로 DB(ami-jongno) 연동: 큐가 `workStatus/jongno/{주소}/replacement_list/{구계기}`에 등록흔적 기록(`awms_synced`/`awms_synced_at`/`awms_response`{consTgtSeqno,seal,status} / 실패시 `awms_error`).

---

# 8. 통신팀 (MOBCST) — 모뎀/통신망 시공

> 베이스 `https://awms.kdn.com/ami/mob/cst`. 계정 = 우영준/장진교(예 `729201`). API 정의 JS = `app-assets/js/api/ami/mob/cst/MOBCST{1000,3000,5000}.api.js`.
> 계기팀(MOBMTR)과 별개 시스템 — 계정 권한·엔드포인트 분리(교차 호출 405).

## 8.1 인프라/파라미터
- **본부코드** `DEPT1=3970`(서울본부), **부서코드** `DEPT2=7793` — 계기팀의 HDQR_CD/OFFICE_CD와 같은 값, 파라미터명만 DEPT1/DEPT2.
- **호출 방식**: 조회는 대부분 **GET (axios.get, querystring)**, 쓰기는 POST. (계기팀은 조회도 POST라 캡처 필터 주의 — GET까지 잡아야 함.)
- 세션: 계기팀과 동일하게 폰 awms WebView 쿠키. 맥은 adb forward + CDP. **A33(SM-A336N)** = 통신팀 helper 로그인 폰.

## 8.2 API 카탈로그

### MOBCST1000 (시공관리 = 작업목록/전송)
| 함수 | 메소드 | 엔드포인트 | 용도(한글) |
|---|---|---|---|
| `getMainList` | GET | `mobCst1000/getMainList` | **작업목록 조회** (통신팀 시공/전송 리스트) ★ |
| `getDetail` | GET | `mobCst1000/getDetail` | 작업 상세 |
| `getBusiList` | GET | `mobCst1000/getBusiList` | 차수/사업 목록 (세션체크 겸용) |
| `getDept` | GET | `mobCst1000/getDept` | 부서 |
| `getCommonCode` | GET | `mobCst1000/getCommonCode` | 공통코드 |
| `getUserList` / `getUserWorkGroup` | GET | `mobCst1000/...` | 작업자/작업조 |
| `getBusiMacConnection` / `getBusiMacBoxConnection` | GET | `mobCst1000/...` | 모뎀 MAC 연결정보 |
| `checkMeterDuplication` | GET | `mobCst1000/checkMeterDuplication` | 계기 중복체크 |
| `saveAct` | POST | `mobCst1000/saveAct` | 작업 저장 |
| `sendSelections` | POST | `mobCst1000/sendSelections` | **선택건 전송** (전송 → WORK_STEP 29) ★ |
| `revokeSelections` | POST | `mobCst1000/revokeSelections` | 전송 취소 |
| `deleteRows` / `checkDuplication` | POST | `mobCst1000/...` | 행삭제/중복체크 |

### MOBCST3000 (모뎀/공사)
| 함수 | 메소드 | 용도 |
|---|---|---|
| `getConsList` | POST(JSON `{DEPT1}`) | 통신 공사 목록 (예: "25년도 AMI 통신망 보강공사_강북", WORK_BUSI_NUM `C11G250023`) |
| `getNewModemList` | POST(JSON `{MENU}`) | 신규 모뎀 목록 |
| `getSigModemList` | POST | 신호 모뎀 목록 |

## 8.3 작업목록 조회 (getMainList) — 핵심

```
GET /ami/mob/cst/mobCst1000/getMainList
  ?FLAG=M10
  &DEPT1=3970&DEPT2=7793
  &searchKeyword=&sortKey=0
  &workStep=25,28,29            # 25=임시저장 28=완료 29=전송완료
  &pPageNo=1&pRowCount=5000     # pRowCount 크게 주면 전건 (1735건 단일응답 OK)
  &strDate=20250101&endDate=20260606   # WORK_DATE(작업일) 범위
```
- 응답: JSON 배열(래퍼 없음). 2026-06-06 전송분 = **1,735건 전건(WORK_STEP=29)**, 작업일 20260401~20260605.
- 저장본: `data/cst-worklist-통신팀전송-20260606.json`.

### 응답 필드 사전 (통신팀)
| 필드 | 한글 뜻 | 비고 |
|---|---|---|
| `INSTR_NUM` | 계기번호 | 11자리. **종로 comm 매칭축** (계기팀 WHM_NO와 동일 계기) |
| `MB_METER_ID` | 모뎀결합 계기번호 | 모뎀에 물린 계기 |
| `MAC_MODEM` | 모뎀 MAC주소 | 통신모뎀 식별 |
| `DCU_ID` | 집중기 ID | |
| `BUSI_NUM` | 공사번호 | C11G250023 (통신망 보강공사_강북) |
| `WORK_STEP` | 작업단계 | 25=임시저장 28=완료 **29=전송완료** |
| `WORK_DIV` | 작업구분 | M1010(모뎀신설, 1589) / M1030(146) |
| `MODEM_DIV` | 모뎀구분 | 10 / 20 |
| `FCLTY_DIV` | 설비구분 | 20 |
| `MTR_WITH_YN` | 계기동반여부 | Y=계기와 함께 |
| `INST_M` / `INST_S` | 설치 대분류/소분류 | HW4030/HW403070 등 |
| `WORK_DATE` | 작업일 | YYYYMMDD |
| `REG_DATE` | 등록시각 | unix ms |
| `CUST_NO` | 고객번호 | (현 데이터 비어있음) |
| `MB_CNT` / `MB_REG_CNT` | 모뎀수/등록수 | |
| `GUBUN` | 구분 | 01 등 |

## 8.4 종로 동기화 (통신팀 comm)
- 종로 DB(ami-jongno) `workStatus/jongno/{주소}`의 **통신팀 상태 = `comm_*`** (계기팀 = `meter_*`).
- 통신팀 우선자료 = 이 getMainList(WORK_STEP=29 전송완료). **매칭축 = `INSTR_NUM`(계기번호) ↔ 종로 계기번호**.
- 2026-06-06: 기존 comm 완료마커 'AMI 자동 매칭'(신뢰불가, 239건)은 전부 pending 되살림 → 이 통신팀 전송리스트로 재구성 예정.

## 8.5 모뎀 마스터/슬레이브 결합 · 맥 변경 (2026-06-11 실측)

> ★ **계기팀(MOBMTR)과 혼동 금지** — 아래는 전부 통신팀(MOBCST `mob/cst`) 모뎀 시공 전용. 계기팀엔 모뎀맥/마스터 개념 없음.

### 마스터/슬레이브 구조
- `MODEM_DIV`: **10=마스터, 20=슬레이브**. 같은 `MAC_MODEM`을 공유하는 계기들이 한 모뎀박스 그룹.
- `MB_METER_ID` = **대표(마스터) 계기번호**. 마스터는 `INSTR_NUM == MB_METER_ID`.
- `MB_CNT`/`MB_REG_CNT` = 박스 결합 계기 수(함내계기 "n/n").
- 정상: 1 MAC_MODEM = 마스터(10) 1개 + 슬레이브(20) N개.
- **이상(충돌)**: 같은 MAC_MODEM에 마스터 2개 → 두 그룹이 한 맥에 섞임. (실측: 한 맥에 16계기·마스터 2개 발견)

### 완료/전송 구분 (★ "완료 72건" 같은 화면 수치)
- **WORK_STEP=28 = 완료(전송 전)** = 화면 "완료"탭. **전송(`sendSelections`) 눌러야 29(전송완료)**. 저장만으론 전송 아님.
- getMainList(workStep=29)는 **전송완료까지 포함**(전건). 미전송분만 보려면 화면 그리드(vm.mainList.data) 또는 28만 필터.
- 그리드 1행=1계기(마스터+슬레이브 펼침). "72건"은 보통 화면 그리드 행수, 서버 getMainList 건수와 다를 수 있음.

### 맥 연결 조회 (GET, MAC_MODEM 입력 중 awms가 실시간 자동호출)
- `getBusiMacConnection?MAC_MODEM={맥}&BUSI_NUM={차수}` → 그 맥의 **연결 계기 수**(숫자 평문).
- `getBusiMacBoxConnection?MAC_MODEM={맥}&MB_METER_ID={대표}&BUSI_NUM={차수}` → **박스 결합 수**.

### ★★ 맥 변경 = 모뎀 재결합 (saveAct로는 안 바뀜!)
- **saveAct의 `MAC_MODEM` 필드로는 모뎀결합이 안 바뀐다.** result:1이어도 getDetail/getMainList 맥 그대로. saveAct는 작업정보(사진·봉인) 저장용일 뿐.
- 진짜 맥 변경 흐름: `getDetail` → `getSigModemList`(모뎀 재선택) → `checkDuplication`(POST JSON) → `saveAct`. **모뎀결합 테이블이 별도.**
- **마스터를 먼저 바꿔야 한다.** 마스터(MODEM_DIV=10) 맥을 바꾸면 박스 슬레이브가 자동 따라감(helper 법칙: 모뎀맥4 awms 자동공유). 슬레이브만 개별 변경하면 마스터-슬레이브 맥 분리 + 옛맥 결합 잔존(중복) → 양쪽 등록 꼬임.

### 중복 결합 삭제 (deleteRows)
- `vm.deleteRow()` = `checkedItems.forEach(FLAG=radio)` → `mobCst1000Api.deleteRows(checkedItems)`. response.data>0 = 성공 → fnSearch 갱신.
- **복합키 삭제**: row의 `INSTR_NUM`+`MAC_MODEM`으로 식별 → **옛맥 행만 지우고 새맥(정상)·타 그룹은 보존**(실측 확인). 통신팀은 삭제 자유(전송 전이면 부담 없음). 계기팀은 완료 삭제 불가 — 팀별 차이.

### saveAct FormData (64필드)
- 계기별 다름: `INSTR_NUM`, `MODEM_DIV`(+_NM), `MB_METER_ID`, `ATCH_FILE_ID_3/4/5/6`(사진).
- `ATCH_FILE_ID_3`=마스터 시공전(슬레이브 공유), `_4`=모뎀맥 사진(awms 자동공유), `_5/_6`=계기별 고유. `BUNGI`=무선/유선, `WORK_DIV`=M1010.
- 공통: BUSI_NUM, DEPT1/2, INST_M/S, WORK_STEP=28, FLAG=M10.
- **주의**: 한 계기 페이로드를 다른 계기에 템플릿 복사 금지 — 마스터가 div=20 격하 / 사진 뒤바뀜(result:1로 조용히 깨짐). 값은 **각 계기 currentRow에서** 뽑을 것.

### vm/CDP 조작 (자동화)
- `getAwmsVM()` = 모든 `__vue__` 순회 → `mainList && ('vFlmnCl' in c)` 컴포넌트.
- `vm.mainList.data`(현재 리스트), `vm.mainList.currentRow`(선택행, 사진ID 포함).
- `vm.rowClick(idx)` → `fnSelectDetail`(getDetail) → currentRow 로드(비동기 ~1.8s 대기 후 읽기).
- `mobCst1000Api`는 전역 접근 가능 → `deleteRows([row])` 등 직접 호출.
- 세션 흔들림 잦음 → 병렬 금지, await + result 체크, 실패 시 중단.
