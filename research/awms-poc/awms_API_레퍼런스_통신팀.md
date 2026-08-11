# awms API 레퍼런스 — 통신팀 (MOBCST)

> 한전 awms 시스템 중 **통신팀(모뎀/통신망 시공)** 전용 API 호출과 응답 필드 영구 레퍼런스.
> 2026-07-29 팀별 분리(구 `awms_API_레퍼런스.md` 섹션 8). 계기팀 = `awms_API_레퍼런스_계기팀.md`.
> 구 섹션번호 병기(§8.x) — 기존 문서들이 "섹션 8" 로 참조하고 있어 대조용으로 남김.

**★ 통신팀(MOBCST) ↔ 계기팀(MOBMTR)은 별개 시스템이다.**
- **통신팀 (MOBCST)**: 모뎀/통신망 시공. 베이스 `mob/cst`. 계정 우영준/장진교(예: `729201`). **이 문서.**
- **계기팀 (MOBMTR)**: 계기 철거/신설. 베이스 `mob/mtr`. 계정 mdp/mmp(예: `mdp2504381`).
- 계정 권한도 분리 — 통신팀 세션으로 `mob/mtr` 호출 시 405, 반대도 동일.
- **`saveAct`는 통신팀 전용**(`mobCst1000/saveAct`). 계기팀 쓰기는 `saveRow`(mobMtr4000/5000/8000).

> API 정의 JS = `app-assets/js/api/ami/mob/cst/MOBCST{1000,3000,5000}.api.js`.
> 상세 배경: `통신팀_설비등록_조사.md`, `통신팀_맥입력장치_설계.md`, `awms_미연계_검증_프로세스.md`.

용어는 CLAUDE.md 소통규칙대로 한글 뜻을 괄호로 붙임.

---

## 0. 인프라/파라미터 (구 §8.1)

- **API 베이스**: `https://awms.kdn.com/ami/mob/cst`
- **본부코드** `DEPT1=3970`(서울본부), **부서코드** `DEPT2=7793` — 계기팀의 HDQR_CD/OFFICE_CD와 같은 값, 파라미터명만 DEPT1/DEPT2.
- **호출 방식**: 조회는 대부분 **GET (axios.get, querystring)**, 쓰기는 POST. (계기팀은 조회도 POST라 캡처 필터 주의 — GET까지 잡아야 함.)
- **인증/세션**: 계기팀과 동일하게 폰 awms WebView 쿠키. 맥은 adb forward + CDP. **A33(SM-A336N)** = 통신팀 helper 로그인 폰.

---

## 1. API 카탈로그 (구 §8.2)

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
| `saveAct` | POST | `mobCst1000/saveAct` | 작업 저장 (params **객체** 또는 **FormData**+사진Blob). **★봉인 빈문자열("")=500 → 빌더 빈값 omit 필수. MTR_WITH_YN=Y(통신팀). 상세 `통신팀_설비등록_조사.md` §saveAct500 / 메모리 awms_saveact_500_fix** |
| `sendSelections` | POST | `mobCst1000/sendSelections` | **선택건 전송** (전송 → WORK_STEP 29) ★ |
| `revokeSelections` | POST | `mobCst1000/revokeSelections` | 전송 취소 |
| `deleteRows` / `checkDuplication` | POST | `mobCst1000/...` | 행삭제/중복체크 |

### MOBCST3000 (모뎀/공사)
| 함수 | 메소드 | 용도 |
|---|---|---|
| `getConsList` | POST(JSON `{DEPT1}`) | 통신 공사 목록 (예: "25년도 AMI 통신망 보강공사_강북", WORK_BUSI_NUM `C11G250023`) |
| `getNewModemList` | POST(JSON `{MENU}`) | 신규 모뎀 목록 |
| `getSigModemList` | POST | 신호 모뎀 목록 |

---

## 2. 작업목록 조회 (getMainList) — 핵심 (구 §8.3)

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

---

## 3. 종로 동기화 (통신팀 comm) (구 §8.4)

- 종로 DB(ami-jongno) `workStatus/jongno/{주소}`의 **통신팀 상태 = `comm_*`** (계기팀 = `meter_*`).
- 통신팀 우선자료 = 이 getMainList(WORK_STEP=29 전송완료). **매칭축 = `INSTR_NUM`(계기번호) ↔ 종로 계기번호**.
- 2026-06-06: 기존 comm 완료마커 'AMI 자동 매칭'(신뢰불가, 239건)은 전부 pending 되살림 → 이 통신팀 전송리스트로 재구성 예정.

---

## 4. 모뎀 마스터/슬레이브 결합 · 맥 변경 (2026-06-11 실측) (구 §8.5)

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

---

## 5. awms 업데이트 신규 필드 (2026-07-27 실측, "사전체결여부" 조사) (구 §8.5.1)

영준님 지시로 등록건 1건(`INSTR_NUM=08550107650`, `MAC_MODEM=01253657627`, WORK_STEP=28)을
getMainList/getDetail로 조회해 §2 기존 필드목록과 diff한 결과, 아래가 신규 키다.

★★ **"사전체결여부" = `BUILTIN_YN` 확정(영준님 확인, 2026-07-27). 항상 `N`.**
saveAct 빌더 `_MASTER_BASE`(app.py)에 `"BUILTIN_YN": "N"` 리터럴 고정 반영 완료 — `_common()`을
마스터/슬레이브 둘 다 이 dict를 베이스로 쓰므로 양쪽 경로 자동 커버. 빈문자열 금지(리터럴 "N").
- `GAETONG_YN` = `"개통"` (getMainList에만 존재) — **사전체결여부 아님**(영준님 확인). 정체 미상, 손대지 않음.
- 그 외 신규(이 테스트건에선 전부 빈값 — 별도 안전정보류 클러스터로 추정, **이번 범위 아님, 건드리지 않음**):
  `DANGER_INFO_SEQ`, `NEAR_ROAD`, `TOUGH_ROAD`, `LONG_DIS`, `MORE10`, `GOSO_LOCA`, `PHASE3`, `CORPS`,
  `ETC`(ETC1/2 외 번호없는 것), `ETC3`.
- 표시용 신규 companion 필드(값 아님): `WORK_STEP_NM`("완료"), `MODEM_DIV_NM`("마스터").
- getMainList 전용 신규(페이지네이션 추정, 필드 성격 아님): `CNT`, `RNUM`.
- 계기팀(MOBMTR/계기큐)은 무관(영준님 확인) — 전파 안 함.

★현재 saveAct는 이 필드들을 안 보내도 등록 정상 완료됨(이 테스트건도 완료 상태로 확인) —
**필수(NOT NULL) 아님, 지금 등록 실패 상황 아님.**

원본 응답: getMainList/getDetail 전체 키 스냅샷은 `/tmp/mainlist_recent.json` `/tmp/detail_recent.json`(임시, 세션 종료 시 소실 — 필요시 재조회).
