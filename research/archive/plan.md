# 종로구 합동시공 시스템 — plan.md

## 프로젝트 개요
- 사업명: 종로구 합동시공 (계기팀 노후 계기 교체 + 통신팀 AMI 재설치)
- 사용자: **4명** (계기팀 2 + 통신팀 2)
- 목적: 통신팀이 계기팀 뒤를 빈틈없이 쫓는 부담을 줄이고, 페이스 조절로 휴식 확보
- 기존 충전기4eleccar 코드를 거의 그대로 재활용, 종로용으로 변형

## 인프라
| 항목 | 결정 |
|---|---|
| git repo | **별도 — `jongno-combined`** (815dudwns/jongno-combined) |
| GitHub Pages | `815dudwns.github.io/jongno-combined/` |
| Firebase 프로젝트 | **새 프로젝트** (사무실 전송 카드 + 사진 큰 용량 위해, Blaze 플랜 검토) |
| 카카오맵 API | 기존 키 재사용 |

---

## 데이터 모델

### 종로 site-data (9,651건)
좌표추출_v2.py 변형 → JSON 생성. 데이터 모델은 기존 site-data 구조 그대로 + 종로 합동시공용 신규 필드 추가.

```jsonc
{
  "주소": "서울특별시 종로구 가회동 31-11",
  "도로명주소": "서울 종로구 북촌로11가길 8-2",
  "계기번호": "56170829659",         // 교체 전 (엑셀에 있던 노후 계기)
  "계기타입": "E",
  "변대주": "9927Z251",
  "상호": "",
  "lat": 37.xxx, "lng": 126.xxx,
  "좌표정확도": "exact",
  "고객번호": "0108612699",

  // ── 종로 합동시공 신규 필드 ──
  "법정동": "가회동",
  "번지": "31-11",
  "동그룹": "북촌·삼청",              // 8개 그룹 중 하나
  "검침일": 17,                       // 1~31 일자
  "검침일그룹": "G4",                 // G1~G6 색 그룹
  "순위": "4순위",                    // 한전 우선순위 (1·2·3·4순위 / 과년도 / null)
  "단상삼상": "단상",                 // 단상/삼상/미파악
  "공급방식": 322,
  "계약전력": 3,
  "공동주택명": "",

  "new_meter_no": null                // 교체 후 새 계기번호 — 자리만 잡아둠
}
```

### Firebase 경로
```
ami-jongno (새 프로젝트)
├── siteData/jongno
└── workStatus/jongno/{encodedAddress}
    ├── meter_state: 'pending' | 'complete' | 'hold' | 'fail'  // 계기팀
    ├── comm_state: 'pending' | 'complete' | 'hold' | 'fail'   // 통신팀
    ├── reason
    ├── meter_completed_at, meter_completed_by
    ├── comm_completed_at, comm_completed_by
    ├── meterChecks/{encodedMeter}: { checked, ts, by_role }
    ├── failedMeters/{encodedMeter}: 사유  (개별 불가)
    └── new_meter_no/{encodedMeter}: ''     (나중 채움)
```

기존 단일 `state` 필드를 **`meter_state` + `comm_state`** 두 개로 분리 — 양 팀 작업 상태 독립 추적.

### 작업완료 자동 처리 (589건)
좌표 추출 후 JSON 생성 시점에 작업완료 후보 589건은 **양 팀 모두 complete 상태로 자동 저장**:
- `meter_state: 'complete'`
- `comm_state: 'complete'`
- `meter_completed_by: 'AUTO_IMPORT'`
- `comm_completed_by: 'AUTO_IMPORT'`

사용자 손댈 필요 없이 시스템 켜자마자 회색 마커로 시작.

---

## 인증 / 역할

`js/auth.js` 보강:
```js
const ACCOUNTS = [
  { id: 'admin',  pw: '8414', name: '우영준',     role: 'admin' },
  { id: 'meter1', pw: '1111', name: '계기팀A',    role: 'meter' },
  { id: 'meter2', pw: '1111', name: '계기팀B',    role: 'meter' },
  { id: 'comm1',  pw: '1111', name: '통신팀A',    role: 'comm' },
  { id: 'comm2',  pw: '1111', name: '통신팀B',    role: 'comm' },
];
```

로그인하면 `role`에 따라 자동으로 다른 마커 모드. 같은 페이지, 같은 데이터, 다른 시각.

---

## 마커 시각

### 계기팀 화면

**pending 상태** — 3가지 표시 모드 (admin이 토글로 전환):
1. **검침일 모드** — 채도 낮춘 6색 (G1~G6) + `D17` 라벨
2. **우선순위 모드** — 채도 낮춘 5색 (1~4순위 + 과년도) + `①` 라벨
3. **둘다 모드** — 배경색=검침일, 라벨=`D17 ①`

**상태 마커 (채도 강함, 항상 즉시 인지)**:
| 상태 | 색 |
|---|---|
| 완료 (`meter_state: complete`) | 🔘 회색 |
| 보류 (`hold`) | 🔵 파랑 |
| 불가 (`fail`) | 🔴 빨강 |
| 부분완료 (체크박스 일부) | 🔵 파랑(보류색) + `3/4` 숫자 |

### 통신팀 화면 (같은 데이터, 다른 시각)
| 계기팀 상태 | 통신팀 상태 | 마커 색 |
|---|---|---|
| pending | — | 검침일 색 더 옅게 (배경처럼) |
| **complete** | pending | 🟢 **초록** (= 가야 할 곳) |
| complete | **complete** | 🔘 회색 (= 끝) |
| complete | complete + **마지막 작업** | 🟢 **찐초록** (오늘 마지막 친 곳) |
| hold/fail | — | 파랑/빨강 (계기팀 그대로 표시) |

"마지막 작업"은 통신팀이 가장 최근에 `comm_state=complete` 친 마커 1개를 자동으로 찐초록.

### 마커 라벨 (공통)
- 색 + `D17` (검침일) + `①` (우선순위) + 계기 개수 또는 `?`(approximate)
- 부분완료: `3/4` 식

---

## 법정동 그룹 필터 (체크박스 8개)

| 그룹 | 주요 동 | 계기 |
|---|---|---|
| 🟫 북촌·삼청 | 가회, 삼청, 화동, 안국, 소격, 팔판, 사간, 재, 계, 원서 | 797 |
| 🟩 부암·평창 | 부암, 신영, 홍지, 평창, 구기 | 1,032 |
| 🟨 청운효자·사직 | 청운, 효자, 통의, 통인, 누상, 누하, 옥인, 사직, 필운, 체부, 세종로 | 1,763 |
| 🟧 무악·교남 | 무악, 교남, 행촌, 평동, 송월, 홍파 | 348 |
| 🟦 종로 도심 | 종로1~6가, 인사동, 관철, 관수, 익선, 낙원, 봉익 | 1,488 |
| 🟪 혜화·이화 | 혜화, 이화, 동숭, 연건, 충신, 원남, 효제, 연지 | 1,199 |
| 🟥 창신 | 창신동 | 2,408 |
| 🟦 숭인 | 숭인동 | 612 |

기본값: **다 체크**. 끄고 싶은 그룹만 해제.

UI: 지도 상단 또는 사이드 패널에 체크박스 그룹. 기존 `jisa-filter` 자리에 배치.

---

## 실시간 동기화

기존 30초 polling → **Firebase `onValue` 리스너**로 전환:
```js
statusRef.on('value', (snapshot) => {
    mergeFirebaseData(snapshot.val() || {});
    refreshAllMarkers();
});
```

- 모든 작업(완료/체크/보류/불가)에 이벤트 즉시 발생
- 다른 사용자 화면 1초 안에 반영
- 사용자 4명이라 부하 부담 없음

`flushEventQueue`는 그대로 사용 (오프라인 복귀 시 큐 전송).

---

## 재활용 vs 변경

### 거의 그대로 재활용
| 파일 | 비고 |
|---|---|
| `js/utils.js` | parseType, copyMeterNo |
| `js/detail.js` | 상세 패널, 체크박스, 개별 불가 — 전부 그대로 |
| `css/*` | marker.css만 색 추가 (검침일 6색, 우선순위 5색) |
| `좌표추출_v2.py` | 한글 prefix 처리 보강 완료 |
| `주소변환.py` | 그대로 |

### 변경 필요
| 파일 | 변경 내용 |
|---|---|
| `js/auth.js` | 계정 5개 (admin + meter×2 + comm×2), role 종류 확장 |
| `js/map.js` | 마커 모드 토글 / 역할별 색 분기 / 동그룹 필터 / 클러스터링은 추후 |
| `js/firebase.js` | onValue 리스너로 변경, statusRef 경로 `workStatus/jongno`, state 필드 분리 |
| `js/config.js` | 새 Firebase 설정, STORAGE_KEY 변경 |
| `map.html` | 지사 드롭다운 → 동그룹 체크박스 8개, 마커 모드 토글 admin 메뉴 |
| `좌표추출_*` | 종로 엑셀 컬럼 맵 + 신규 필드(검침일/우선순위/단상삼상/동그룹) |

---

## 단계별 작업 (실행 순서)

### 1단계 — 데이터 적재 (병렬 가능)
1. **종로용 좌표 추출** (`좌표추출_jongno.py` 새로 작성, 좌표추출_v2.py 변형)
   - 엑셀 9,651건 (빈 행 제외) → 좌표 + 신규 필드 추가
   - 작업완료 후보 589건 표시
   - 출력: `data/jongno-site-data.json`
2. **새 Firebase 프로젝트 셋업** (영준님이 콘솔에서)
   - 프로젝트 생성, RTDB + Storage 활성화
   - config 받아오기
3. **work-status 초기 데이터 생성** (589건 자동 완료 박힘)
   - 스크립트: `scripts/seed_work_status_jongno.py`

### 2단계 — 새 git repo 생성
1. ami-work 코드 복사 → `jongno-combined` repo
2. config 교체, 경로 교체
3. GitHub Pages 배포

### 3단계 — 핵심 UI 구현
1. 인증: 5계정 + role 분기
2. 동그룹 체크박스 필터
3. 마커 모드 토글 (검침일/우선순위/둘다)
4. 역할별 마커 색 분기 (계기팀/통신팀)
5. 부분완료 시각화 (보류색 + N/M)

### 4단계 — 실시간 동기화
1. onValue 리스너로 변경
2. state 필드 분리 (meter_state / comm_state)
3. 통신팀 "마지막 작업" 찐초록 처리

### 5단계 — 테스트
1. 4명 같이 동시 접속 테스트
2. 실시간 반영 확인
3. 폰 부하 측정 (필요시 클러스터링 추가)

---

## 나중 과제 (MVP 후)

| 과제 | 비고 |
|---|---|
| **카드 시스템** (사진+정보→사무실) | 영준님이 계기팀과 협의 중 |
| **새 계기번호 수집** | 카드 시스템과 연결되면 자연 해결, `new_meter_no` 자리 미리 잡아둠 |
| **통신팀 GPS 위치 추적** | 마지막 작업 자동 마킹과 별개로 실시간 위치 표시 |
| **마커 클러스터링** | 9,651건 폰 부하 발생 시 |
| **엑셀 일괄 완료 도구** | admin이 추가로 엑셀 받았을 때 일괄 처리 |

---

## 결정된 사항 요약 (한 페이지로 확인용)

- 별도 git repo + 새 Firebase 프로젝트
- 종로 9,651건 적재 (작업완료 자동 589건 + 합동시공 대상 9,062건)
- 매칭 키: 법정동+번지 (도로명은 보조)
- 4계정 + role(meter/comm/admin)
- 마커 모드 3가지(검침일/우선순위/둘다), 채도 낮춤
- 동그룹 필터 8개 체크박스, 기본 다 체크
- 계기팀 완료=회색, 통신팀 화면에선 그게 초록(가야할곳), 통신팀 완료=회색, 마지막작업=찐초록
- 부분완료=보류색(파랑)+N/M
- onValue 실시간 동기화
- 한글 prefix("상계") 처리는 fix_meter_no에 이미 보강
- new_meter_no 필드 자리만 잡아둠, 수집 방식은 나중
