# awms getMainList 분석 (2026-05-17)

## 호출 방법 (영준님 브라우저 콘솔)

```
fetch('/ami/mob/cst/mobCst1000/getMainList?FLAG=M10&DEPT1=3970&workStep=25,28&pPageNo=1&pRowCount=200&strDate=20260515&endDate=20260515')
  .then(r=>r.text()).then(t=>{window.X=t;console.log('LEN',t.length)})
```

- 인증: 로그인된 awms 탭에서 fetch → 세션 쿠키 자동 첨부
- 응답 본문은 그냥 JSON 배열 (래퍼 없음)

## workStep 코드 매핑

| workStep | 의미 | 화면 탭 |
|---|---|---|
| 25,28 | 미확인 (5/15 기준 0건) | — |
| **29** | **완료 (전송 대기)** | **"완료" 탭** |
| 25,28,29 | 전체 보기 (HAR에 패턴 잡힘) | — |

영준님 화면 "완료 / 전송" 탭 구조:
- **완료** = 작업 완료, 전송 안 한 (작업자 PC에 쌓임) → workStep=29
- **전송** = "전송" 버튼 눌러 KDN에 전송 완료된 작업
- 표 안의 "전송" 글자 = **액션 버튼** (workStep 컬럼 표시값 아님)

5/15 단일 = 79건, 5/14~5/17 = 174건 (모두 workStep=29 추정).

## 응답 필드 (한 건 = 한 계기)

| 필드 | 예시 | 의미 | 우리 site-data 매핑 |
|---|---|---|---|
| **INSTR_NUM** | `02530016421` | **계기번호 11자리** | `meter_id` |
| **MAC_MODEM** | `01248232297` / `8472070DCAFD` | 모뎀 MAC | `modem_mac` |
| **DCU_ID** | `9826H7546` 또는 `""` | DCU ID (DCU 케이스만) | `dcuid` |
| **DATA_NUM** | `9826H754` 또는 `""` | DCU_ID 앞 8자리 | — |
| **MB_METER_ID** | `02530016421` | **대표(마스터) 계기번호** | (마스터 식별) |
| **MB_CNT** | `2.0` ~ `9.0` | 마스터에 묶인 계기 수 (=함내계기 수) | — |
| **MB_REG_CNT** | `2` ~ `9` | 등록된 박스 계기 수 | — |
| **MODEM_DIV** | `10` / `20` | **10=마스터, 20=슬레이브** | — |
| **FCLTY_DIV** | `10` / `20` / `30` / `40` | 시설구분 (20=집합형기본, 30=집합형추가, 40=단독형, 10=?) | — |
| **WORK_DIV** | `M1010` / `M1030` | 작업구분 | — |
| **GAETONG_YN** | `개통` / `""` | 개통 여부 | — |
| **WORK_DATE** | `20260515` | 작업일 | — |
| **REG_DATE** | `1778800810000` | 등록 시각 (Unix ms) | — |
| **DEPT1** | `3970` | 본부 코드 (서울본부직할) | — |
| **DEPT2** | `7793` | 부서 코드 | — |
| **INST_M** | `HW4040` / `HW4050` | 설치자 마스터 (인력업체 그룹) | — |
| **INST_S** | `HW404090` / `HW405092` | 설치자 세부 (개인) | — |
| **BUSI_NUM** | `C11G250023` | 사업번호 (대부분 동일) | — |
| **WORK_STEP** | `29` | 작업단계 코드 | — |
| **GUBUN** | `01` | 구분 코드 | — |
| **CNT** | `79` | 전체 건수 (모든 행 동일, 페이지 메타) | — |
| **RNUM** | `1`~`79` | 행 번호 | — |

## 마스터/슬레이브 그룹핑

같은 `MAC_MODEM`을 공유하는 계기들이 한 그룹:
- `MODEM_DIV=10` 1개 (마스터, `INSTR_NUM == MB_METER_ID`)
- `MODEM_DIV=20` 여러 개 (슬레이브, `MB_METER_ID`는 마스터 계기번호)

예: 모뎀 `01249850696` 그룹 = 9건 (마스터 1 + 슬레이브 8)

## 우리 site-data와 매칭

**핵심 키 = `INSTR_NUM` (11자리 계기번호)** — 우리 site-data의 `meter_id`와 같은 형식.

- 매칭되면 → 기존 데이터와 크로스 체크 가능 (자동 검증)
- 매칭 안 되면 → 신규 계기 (계기팀이 새로 만든 것) → 수동 검토 큐

## PoC 활용 시나리오

### 시나리오 A: 작업 완료 폴링 (감지)
1. 우리 시스템(또는 크롬 확장)이 주기적으로 `getMainList(workStep=29)` 호출
2. 새 항목 발견 → 우리 site-data와 매칭 시도
3. 매칭 = 자동 검증 OK / 미매칭 = 의심 큐로

### 시나리오 B: 작업자 직접 등록 + 자동 전송
1. 작업자가 현장에서 우리 앱으로 시공 → Firebase 큐 저장
2. 검증 통과 → 크롬 확장이 작업자 PC에서 awms에 자동 입력 → workStep=29로 들어감
3. 사후 "전송" 버튼은 사람이 일괄 클릭 (또는 추가 자동화)

## 미확인 (다음 단계)

1. **`workStep=25,28`이 0건인 이유** = 작업 미시작 or 완료 후 전송 완료(다른 코드)? 추측: `workStep=30` 이상이 "전송 완료"
2. **시공등록 폼(MOBCST3000) 입력 → 저장 흐름** — `saveAct` 또는 동등 API 캡처 필요
3. **Innorix 사진 첨부 흐름** — multipart? chunked? 별도 업로드 API?
4. **`workStep=29` 1건을 삭제하면 어떻게 되는지** (영준님 제안) — 직접 삭제 → fetch로 재조회 → 차이 비교 (필드 추적)
5. **새 작업 1건 직접 등록 → fetch로 그 건만 받기** = saveAct payload를 역으로 추정 가능

## 다음 호출 후보

```javascript
// 전송 완료된 작업 (workStep 다른 값 시도)
fetch('/ami/mob/cst/mobCst1000/getMainList?FLAG=M10&DEPT1=3970&workStep=30&pPageNo=1&pRowCount=10&strDate=20260515&endDate=20260515').then(r=>r.json()).then(d=>console.log('30:',d.length,d))

// 모뎀 탭 (MAC_MODEM 단위 그룹)
fetch('/ami/mob/cst/mobCst1000/getMainList?FLAG=D10&DEPT1=3970&workStep=29&pPageNo=1&pRowCount=10&strDate=20260515&endDate=20260515').then(r=>r.json()).then(d=>console.log('D10:',d.length,d))
```
