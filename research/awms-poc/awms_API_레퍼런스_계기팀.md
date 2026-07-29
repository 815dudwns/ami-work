# awms API 레퍼런스 — 계기팀 (MOBMTR)

> 한전 awms 시스템 중 **계기팀(계기 철거/신설)** 전용 API 호출과 응답 필드(섹터) 영구 레퍼런스.
> 2026-07-29 팀별 분리(구 `awms_API_레퍼런스.md` 섹션 0~7 + 구 8.6/8.6.1). 통신팀 = `awms_API_레퍼런스_통신팀.md`.

**★ 계기팀(MOBMTR) ↔ 통신팀(MOBCST)은 별개 시스템이다.**
- **계기팀 (MOBMTR)**: 계기 철거/신설. 베이스 `mob/mtr`. 계정 mdp/mmp(예: `mdp2504381`). **이 문서.**
- **통신팀 (MOBCST)**: 모뎀/통신망 시공. 베이스 `mob/cst`. 계정 우영준/장진교(예: `729201`).
- 계정 권한도 분리 — 통신팀 세션으로 `mob/mtr` 호출 시 405, 반대도 동일.
- **계기팀엔 `saveAct`가 없다.** saveAct는 통신팀 API(`mobCst1000/saveAct`). 계기팀 쓰기는 전부 **`saveRow`**.

> 프로세스/배경은 같은 폴더의 주제별 문서 참조:
> - `awms_큐_자동등록_프로세스.md` (jongno 완료 → awms saveRow 풀플로우)
> - `awms_완료_종로동기화_프로세스.md` (awms 완료 → 종로 동기화)
> - `awms_지침_구조_조사.md` (1종/2종 지침 4개 구조)
> - `awms_inject_helper_기능.md` / `findings_mainlist.md`
> 검증 구현체 = `awms-queue/www/awms-saverow.js` (라이브 검증본, 이 문서와 항상 일치 유지)

용어는 CLAUDE.md 소통규칙대로 한글 뜻을 괄호로 붙임.

---

## 0. 인프라

- **API 베이스(계기팀)**: `https://awms.kdn.com/ami/mob/mtr`  (코드 상수 `AWMS_API`)
- **API 베이스(자재)**: `https://awms.kdn.com/ami/mob/mtl`  (자재조회만 다른 도메인)
- (참고) 통신팀 베이스 `https://awms.kdn.com/ami/mob/cst` — 이 문서 범위 밖.
- **인증**: 로그인된 awms 세션 쿠키(`credentials:'include'`). OTP(인증번호) 2단계, 세션 약 4시간 만료. **세션 쿠키(JSESSIONID)만 있으면 PC(맥)에서도 직접 호출 가능** — 폰에서 OTP 로그인으로 세션 발급 → 맥이 세션 넘겨받아 직접 호출(맥 세션). (구조 파악 전 "PC 직접 403, 폰 세션 빌려야"라던 초기 기록은 폐기 — 2026-07-01.)
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
| `INSTR_NUM` | 계기번호 | mobCst(완료목록)에서의 계기번호 — **통신팀 필드**(매칭 시 참고) |
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

**awms 화면에는 [임시저장]과 [저장] 버튼이 둘 다 있다.** 두 버튼이 같은 `mobMtr4000/saveRow`를 부르되 `WORK_STEP` 값만 다르다.

| 값 | awms 화면 버튼 | 의미 |
|---|---|---|
| 20 | — | 대기(미작업) |
| 25 | **[임시저장]** | 임시저장 — 되돌릴 수 있음(`resetRows`로 20 복귀) |
| 28 | **[저장]** | 저장(완료) — 전송 전 최종. 이후 필드수정 제약 큼 |
| 29 | — | 전송완료 (통신팀 mobCst 화면. 계기팀 경로 아님) |

> ★ **28은 API 이름이 아니라 작업단계 값이다.** [저장](28)도 [임시저장](25)도 똑같이 `mobMtr4000/saveRow`다.
> 차이는 `WORK_STEP` 값과, 28일 때 추가로 필요한 것(getDetail 재조회 + 시공 17키 + 신설사진 재전송 — 빠지면 500).
> (saveAct 아님 — saveAct는 통신팀 API)

### ★★ 원복(되돌리기) 규칙 — 25만 삭제 가능 (영준님 확정 2026-07-29)

| 단계 | 되돌리기 | 방법 |
|---|---|---|
| **25 (임시저장)** | **삭제 가능** | `mobMtr1000/resetRows` — 행객체 배열 POST → **25→20(대기) 복귀** |
| **28 (저장/완료)** | **★삭제 불가** | 검침값 수정만 가능 (`mobMtr5000/saveRow`, `EX_WORK_STEP=28`+`RE_SAVE_YN=Y`. 신설계기번호는 잠김, 사진은 별도 재전송 경로) |

- **원복 자동화 범위 = 25 삭제까지. 28은 설계상 손대지 않는다.**
- 구현: `POST /transmit/reset-row?dataset=&mid=&apply=` (기본 dry-run, `apply=true`여야 실제 삭제).
  25가 아니면 거부하는 2중 가드 + 삭제 후 재조회 검증 포함. 실증(2026-07-29): 28 건 호출 시
  `"완료(28) 건은 삭제 불가"`로 거부됨.
- ⚠ `resetRows` 페이로드는 실호출 캡처본이 없어 통신팀 `deleteRows`(행객체 배열) 패턴을 따랐다.
  **첫 실운영은 dry-run으로 대상 확인 후 apply** 할 것.
- ⚠ awms에서 지워도 **DB(workStatus)의 `awms_synced`·`awms_seal`은 남는다.** 안 지우면
  "이미 등록됨"으로 재등록에서 제외될 수 있어 별도 정리가 필요하다(라우트가 `db_hint`로 알려줌).
- (통신팀 참고) MOBCST 완료건은 `saveAct` 재전송 시 모뎀결합 unique 제약으로 500 → awms UI로만 수정.

### ★★ 자동화 방침 — 임시저장(25)까지만 (영준님 지시 2026-07-20)

**우리 자동화(계기큐·전송탭)는 [임시저장](25)까지만 한다. [저장](28)은 절대 금지.**
완료 처리는 **사람이 awms 앱에서 직접** 한다.

- 근거 코드: `awms-saverow.js:163` (`WORK_STEP:'25' // 완료 28 금지 — 영준님 지시`),
  `awms_mtr_direct.py` (`no_complete` 플래그 = 28 단계 전체 스킵, 기본 방침).
- 이유: 25는 `resetRows`로 되돌릴 수 있지만 28은 사실상 되돌리기 어렵고, 완료 판단은 사람 몫.
- 그래서 28로 올리는 코드가 남아 있어도 **호출하지 않는 것이 정상 운영**이다. 게이트 테스트도 25까지.

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
- awms 사진 통과조건 (★2026-07-02 실측 교정): **800px / JPEG q40 / ICC 제거**가 검증 하한(54KB 통과). 옛 기록 "2992px+/700KB+ 하한"은 허구로 판명. 상한 검증 없음(옛 1~2MB 원본도 통과). 과압축(하한 미만)만 업로드 거부. 근거: jongno photo-uploader.js 커밋 5ed58de, 세션로그 2026-07-03.
- 큐 사진 경로: awms 웹뷰는 jongno Storage CORS 차단 → 큐 웹뷰(localhost)에서 fetch→base64→awms 표현식 임베드→atob→Blob→FormData. 가상테스트 = `vqphoto:{key}` → firebase `vqueue_photos/{key}`(data URL).

---

## 7. 완료 판정 (진실의 출처)

- **awms 서버가 진실.** 큐는 로드 시 전 차수 getMainList(workStep=25,28)를 라이브 조회해 `_completedNewMeters`(WHM_NO/CREMO_WHM_NO) Set 구성 → 이 Set으로 done 판정.
- firebase `awms_synced` 플래그는 **표시 캐시**일 뿐 — 큐는 일부러 무시(awms 임시저장 삭제→큐 재등장 동작 보장).
- 종로 DB(ami-jongno) 연동: 큐가 `workStatus/jongno/{주소}/replacement_list/{구계기}`에 등록흔적 기록(`awms_synced`/`awms_synced_at`/`awms_response`{consTgtSeqno,seal,status} / 실패시 `awms_error`).

---

## 8. 검침값(철거 지침) 수정 — 완료(28) 레코드 (2026-06-15 실측)

> ★ 구 통합문서에서 §8.6/§8.6.1로 **통신팀 절 안에 잘못 들어가 있던 내용**(2026-07-29 분리 시 교정).
> 내용은 전부 `mobMtr*` = 계기팀 API다.

**철거 지침 필드** (신설은 `CGD_*`):
| 칸 | 철거 필드 |
|---|---|
| 주간 | `DGD_WHME_NDL_DAY_QTT` |
| 야간 | `DGD_WHME_NDL_MNGT_QTT` |
| 최대전력 | `DGD_DM_MT_NDL_DAY_QTT` |
| 무효 | `DGD_VAR_NDL_DAY_QTT` |
| 자릿수 | `DGD_WHME_NDL_DGTS` |

- **읽기**: `mobMtr1000/getDetail` 응답에 `DGD_*` 현재값 들어있음(0=미입력).
- **★ mobMtr4000/saveRow(신설)로 DGD 보내면 응답 `"1"`(성공처럼) 뜨지만 철거지침 반영 안 됨(no-op).** 철거지침은 철거(mobMtr5000) 소관. getDetail 301키(신설베이스)+DGD override+RE_SAVE_YN='Y'를 4000에 보낸 실측: status 200/body "1"인데 재조회 DGD 그대로 0. **속지 말 것.**
- **awms UI 수정저장 = 철거지침 변경 OK** (DGD 바뀜, **봉인·사진·WORK_STEP 28 그대로 유지, 봉인+1 없음**). 실측: #28 `02171928121`→12233, #67 `02171927585`→25594 (21차 CONS_NO 397820263220). 수정저장은 **사진 재첨부 불필요**(기존 ATCH_FILE_ID 유지).
- **현행 절차**: 검침값만 누락된 28 완료건 = **awms 앱에서 직접 수정저장**(안전·검증됨). 종로앱(ami-jongno) 검침값은 별도로 `removal_value`+`removal_values.whme_day` PATCH로 채움(데이터, awms와 무관).

### 8.1 검침값 수정 API — 확정 (2026-06-15 실측 캡처, window.fetch 후킹)

**철거 지침(검침값) 수정 = `mobMtr5000/saveRow`** (신설 4000 아님! — 4000으로 보내면 "1" 떠도 DGD no-op).
- POST `/ami/mob/mtr/mobMtr5000/saveRow` (FormData, 307필드 = getDetail 전체 + 아래 키)
- **`WORK_STEP=28`, `EX_WORK_STEP=28`, `RE_SAVE_YN=Y`** (★28 편집은 EX_WORK_STEP도 **28**. 25→28 완료와 다름)
- `DGD_WHME_NDL_DAY_QTT`=새 검침값 (야간/최대/무효는 DGD_WHME_NDL_MNGT/DM_MT_NDL_DAY/VAR_NDL_DAY)
- 식별: `CONS_TGT_SEQNO`+`CONS_NO`+`CNTR_NO`, `WHM_NO`(철거)·`CREMO_WHM_NO`(신설)
- **사진 재첨부 불필요**(수정저장이라 기존 ATCH_FILE_ID 유지), 봉인 그대로(봉인+1 없음).
- **신설계기번호(CREMO_WHM_NO)는 수정 불가**(awms UI 잠김) — 신설 틀리면 delete+재등록.
- 캡처법: 계기큐 CapacitorHttp=true라 CDP Network 안 잡힘 → `window.fetch`/XHR 후킹(Runtime.evaluate)으로 `__capturedSaves` 수집 후 수정저장 1회 관찰. (검증된 캡처)

**자동화 레시피**: getDetail(mobMtr1000, 301키) → `DGD_WHME_NDL_DAY_QTT` override + `WORK_STEP=28`+`EX_WORK_STEP=28`+`RE_SAVE_YN=Y` 추가 → mobMtr5000/saveRow POST(사진 없이). (5000이 307필드 기대 — getDetail 301에 누락분 있으면 보강 필요, 다음 실행시 캡처 body와 diff로 확정.)

> 참고: 완료(28) 건의 **지사/일반 필드 수정은 saveAct 재전송으로 불가**(통신팀 경로, 모뎀결합 unique 충돌 500). 계기팀 완료건 수정은 위 mobMtr5000 경로 또는 awms UI.
