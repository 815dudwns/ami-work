# HANDOFF — ami-work / jongno-combined

## 현재 상태 (2026-05-17)

- 마지막 작업: **크롬 확장 v0.1 작동 검증 — 503은 awms 전체 서버 다운 (밴 아님)**
- 진행 중: awms 서버 회복 대기
- **다음**: 회복 후 폼 자동 채움 방식(v0.2) 설계 — 100% API 직접 호출 폐기
- 블로커: awms.kdn.com 전체 503 다운 (일요일 정기 점검 추정)

## 2026-05-17 12:55 503 — 밴 추정 폐기

### 진실 (14:14 확인)
- 우리 서버(완전 다른 IP)에서도 awms 전체 503 응답
- = awms.kdn.com 사이트 자체 다운 (영준님 계정·IP·우리 자동화와 무관)
- 일요일 정기 점검 추정
- **밴 아님. 영준님 계정 안전.**

### 그래도 얻은 교훈 (자동화 시그니처 회피)
검증 못 했지만 사전 분석에서 식별한 위험 요소들:
- saveAct 단독 호출 (부수 호출 없음) = 자동화 시그니처
- 같은 INSTR_NUM 반복 = abuse 패턴
- 가짜 MAC(`01288888888`) = 명백한 시험값

영준님 통찰: "가짜 데이터는 awms 입장에서 상관없다. 진짜 문제는 자동화 탐지 장치"
→ 폼 자동 채움 + 사람이 저장 버튼 클릭하는 방식이 가장 안전

### v0.2 설계 방향 (다음 PoC)
1. **API 직접 호출 폐기** — 100% 자동 saveAct 위험
2. **폼 자동 채움 방식** — 페이지 input에 `.value` 주입 + change/input 이벤트
3. **저장 버튼은 작업자 클릭** — 페이지 JS가 정상 시퀀스(부수 호출 포함) 자동 실행 → 100% 정상 사용자 시그니처
4. **사진은 작업자 선택** — Innorix UI 통과
5. 효율: 5분 → 1분 (5배 효율, API 직접의 5초 대비 손해지만 안전)

### 다음 세션 시작 시 순서
1. awms 서버 회복 확인
2. 회복되면 영준님 계정 정상 동작 검증 (다른 페이지·메뉴 작동)
3. v0.2 폼 자동 채움 PoC 설계 시작 (paste 차단된 input에 `.value` 주입 가능한지 검증부터)
4. 모뎀맥 input부터 시험 (어제 paste 막혔던 것)

## 2026-05-17 awms PoC 최종 결과 (확정)

### ✅ 사진 포함 100% 자동화 검증 완료
- **`saveAct` = 텍스트 77필드 + 사진 3장(binary) 한 번에 multipart POST** (별도 업로드 API 아님)
- 어제 v1 캡처 스니펫이 req body 안 잡아서 "Native Agent 별도 업로드"로 잘못 추측
- HAR 재분석으로 `multipart/form-data, bodySize=707KB` 확인 → ATCH_FILE_ID_3/4/5_SRC 필드에 binary
- 콘솔에서 FormData + 1x1 PNG 3장으로 시뮬레이션 → `{"result":1, "atchFileId3":"F1002731276", "atchFileId4":"F1002731277"}` 성공
- 인증 = 세션 쿠키만 (CSRF 토큰·특별 헤더 없음)
- **AppleScript·mitmproxy·Native Agent 우회 모두 불필요** — 크롬 확장 단독으로 풀 자동화 가능

### 자동화 메커니즘 (확정)
```
Firebase 작업데이터 + 사진(blob)
  → JS FormData (77개 텍스트 필드 + ATCH_FILE_ID_3~5_SRC 사진)
  → fetch('/ami/mob/cst/mobCst1000/saveAct', POST multipart)
  → 응답 {"result":1, "atchFileId3":"..."} 검증
```

### 부수 자동화 (이전 확인 완료)
- 모든 폼 필드 — `getDetail` 응답으로 자동 매핑
- 중복 검사 — `checkDuplication` / `checkMeterDuplication`
- 작업자 ID 매핑 — `getUserList` (우리 user01~14 → awms USER_ID)
- 대상리스트 — 종로 강북 사업(`C11G250023`) 475건, site-data 매칭률 69.3%

### 사업 모델 (재확정)
**풀 자동화 PoC** — 1건 5분 → 약 5초 (60배 효율)
- 모든 단계 자동, 작업자는 "자동 등록 시작" 1회 클릭만
- Firebase 사진 + 데이터 → 우리 확장 → awms saveAct 직접 호출

### 한전 식별 가능성 (검토 완료)
- 단순 액세스 로그로는 사람/자동화 구분 불가 (정상 multipart, 정상 헤더)
- 패턴 분석(타이밍/순서) 시 의심 가능 → 제품화 시 getDetail 등 부수 호출 흉내로 보완

## 계기팀(MTR) 모드 — 별도 검증 필요
- 어제·오늘 검증한 건 통신팀(AMI/MOBCST1000) 폼
- 계기팀 모드는 폼 필드·사진 슬롯 수 다를 것 (전계기/후계기 2장 예상)
- 영준님이 계기팀 폼 HAR 캡처 확보 예정
- 통신팀 PoC 완성 후 계기팀으로 확장

## 다음 세션 시작 시 순서

1. **통신팀(AMI) 크롬 확장 PoC 코드 작성** — `research/awms-extension/`
   - manifest.json (host_permissions: awms.kdn.com)
   - content.js — awms 페이지 진입 감지 + Firebase 데이터 fetch + saveAct 호출
   - popup.html — "현재 위치 자동 등록" 버튼
   - 사진 = Firebase Storage URL → blob fetch → FormData
2. 영준님 본인 awms로 1건 풀 자동 시연
3. 작업자 PC 설치 + 시범 운영 (1조 1일)
4. 계기팀 폼 캡처 받으면 → MTR 모드 확장
5. 단가 협상 진입

## awms PoC 자료 정리
- `research/awms-poc/capture_full_2026-05-17.json` — 66개 요청/응답 (v1, req body 없음)
- `research/awms-poc/findings_mainlist.md` — getMainList 분석
- `research/awms-poc/mainlist_20260515_완료.json` — 완료탭 79건 샘플
- `research/awms-poc/saveAct_test.js` — **자동화 검증 콘솔 스크립트 (성공 확인)**
- `/Users/woodelight/Downloads/awms_등록페이지.rtf` — HAR (3,483건, saveAct multipart 본문 포함)
- 옵시디언 `Projects/AMI/logs/2026-05-17-awms-poc.md` — 오늘 세션 흐름 (사진 불가 결론으로 작성됨, 정정 필요)

## 2026-05-15 종로 계기팀 소장 미팅 결과 (요약)
- 업계 구조 정정: **한전 → 공사수주업체 → 인력제공업체 → 작업자** (정리회사는 인력업체 내부 사무직)
- 작업자가 한전앱 + 종이 카드 이중 입력 → 사무직이 카드 사진 받아 한전 청구 정리
- 인력업체 1곳이 **종로·중구·노원·도봉 4구** 동시 관리. 다른 지역 업체 소개 가능
- 현장 소장: 우리 지도앱 적극 사용 결정 + 인력업체 미팅 다리 약속

상세: 옵시디언 `Projects/AMI/사업_실효계기데이터관리.md`

## 2026-05-16~17 사업 모델 정립 (영준님 결정 사항)

### 핵심 통찰
- **awms는 어디서·누가 입력하든 한전 관심 X** → IP 추적·통일 등 우회 트릭 폐기
- 본질: **데이터 정확도** 한 가지
- 모뎀팀 vs 계기팀:
  - 모뎀팀: site-data 크로스 체크 → 자동 검증 가능
  - 계기팀: **새 계기번호**가 작업 중 생성 → 비교 원본 없음 → 검증 공백 큼 → 우리 시스템 가치 최대

### awms 카톡 OTP
- 모바일 강제 보안 (카톡 데스크탑 활용 X — 모바일 인증 강제)
- 세션 만료: 4~5시간
- → OTP 1번 받으면 4~5시간 자동 처리 충분
- **작업자 본인 awms 계정 사용**, OTP는 작업자 본인이 받음 → 영준님 부담 0

### 워크플로 (확정)
```
[현장 작업] — 작업자 (5초/건, 속도 우선)
   QR 스캔 + 사진 3장 + Firebase 큐 저장

[사후 검증] — 자동 90~95% + 사람 의심 큐만 (1조당 1분)
   QR/OCR 자동 매칭 → 확정 / 불일치 → 의심 큐

[awms 자동 입력] — 크롬 확장
   작업자 본인 PC + 본인 awms 로그인(OTP 1회) + 우리 확장 자동 입력
```

### 시장가 정보 (원조 개발자 기준)
- 지도 시스템: **계기 작업 1건당 600원**
- 데이터 관리: 별도 단가 (미확인)
- 앱 작성(awms): 별도 단가 (미확인)
- 우리 차별점: 3개 통합 패키지 → 단가 정당화 (1,500~2,000원/건 가능)

### 수익 추정 (4조 × 80건/일 × 22일 = 월 7,040건)
| 단가 | 인력업체 1곳 월 수익 | 5곳 확장 |
|---|---|---|
| 지도만 (600원) | 422만 | 2,110만 |
| 통합 (2,000원) | 1,408만 | 7,040만 |

### 단가는 awms 검증 이후 확정 (현재 우선순위 아님)

## awms 자동화 — 크롬 확장 PoC 검증 항목

**왜 크롬 확장으로 가는가**
- Playwright 무인 자동화는 storage_state 발급·OTP·multipart payload 분석 부담 큼
- 크롬 확장 = 사용자 평소 로그인 그대로 + DOM 조작만 → 개발 난이도 낮음, 비용 0
- OpenClaw 등 AI agent도 OTP·세션 문제 동일 + LLM 비용 발생 → awms 시나리오엔 과함

**검증 항목 (다음 세션 우선)**
1. awms 페이지 셀렉터 조사 — 폼 input id/class, 저장 버튼 위치
2. 파일 input에 File 객체 attach 가능한지 (Innorix 업로더 사용 — JS로 File 주입 허용 여부)
3. saveAct API가 페이지 form submit으로 호출되는지, 별도 JS 호출인지
4. 모바일: 안드로이드 Chrome은 확장 미지원 → Kiwi(폐기)/Mises/Yandex 검증
5. iOS Safari 확장 가능성 (제한적)

**대안 (검증 실패 시)**
- 데스크탑만 지원 (작업자 PC 또는 사무직 PC)
- worker/ 디렉토리 Playwright 접근 재개 (마지막 수단)

## ami-work 시스템 현황 (2026-05-15까지 패치 완료)

### 데이터
- site-data.json: **19,613건** (보강현황 엑셀 머지 완료, 2026-05-15)
  - 신규 필드: 교체사유·시스템등록일·계기교체일·연계수신일·등록소요일·DCU장애여부·모뎀MAC·사업차수(신/전)·통신방식_전·검침방법(신/전)
  - 19,611/19,613 매칭 성공
  - 변대주 필드는 한글명(엑셀 27번)으로 통일

### detail.js 표시 규칙 (2026-05-15)
- 큰 글씨: DCUID(전산화+2자리)
  - 영문자 포함 → 끝 2자리 강조 + 복사 시 절단
  - 숫자만 (LTE 케이스, DCU 미사용) → 강조 없음 + 전체 복사
- 작은 글씨: 통신방식(빨강) · 변대주(한글) · 인입주 · 차수(신/전) · 이전통신 · 이전계기(다를 때만) · 고객번호

### 인증
- AUTH_VERSION='20260515-1' (2026-05-15 갱신)
- 조장 한글 이름 ID 시도 → user 번호로 롤백
- 신규: user13(양선왕), user14(이용택) — 성북·노원 조장

### 어드민 페이지
- admin.html — 사진 등록 페이지 리뉴얼 (시간 기준 EXIF 일괄 변환)
- stats.html — 작업 현황 통계 (구별/작업자별 탭)
- 두 페이지 모두 IIFE adminGate로 즉시 차단 (admin role 외 진입 시 throw)

---

## 종로구 합동시공 시스템 (변경 없음)

### 인프라
- repo: https://github.com/815dudwns/jongno-combined
- 배포: https://815dudwns.github.io/jongno-combined/
- Firebase 프로젝트: `ami-jongno` (별도)
- 계정: admin/8414, meter1/1111, comm1/1111

### 데이터
- `data/jongno-site-data.json`: 9,651건 (자동완료 589 + 합동시공 9,062)
- 동그룹 8개 / 검침일그룹 4개 / approximate 마커 53개 주소
- DCUID 빈값 (종로엔 DCU 미설치, 변대주만)

### 데이터 모델 핵심
- `meter_state` / `comm_state` 완전 분리
- `meter_forced_by_comm: true` 플래그 — 통신팀 강제 양쪽 완료 표시

### 초기화 규칙
- 계기팀 초기화 + comm_state=complete → alert + 차단
- 통신팀 초기화 + meter_forced_by_comm → 양쪽 pending
- 통신팀 초기화 + 정상 → comm_state만 pending

### 마커 시각
- 계기팀: 검침일 4색 + 완료 회색 / 보류 파랑 / 불가 빨강
- 통신팀: 최근 계기팀 완료 찐초록 → 그 외 초록 → 통신팀 완료 회색

### 도메인 지식 (메모리 `dcuid_변대주_규칙.md`)
- 변대주 = 변압기 달린 전주, DCU = 그 위 PLC 검침 장치
- 변대주의 두 표기: **전산화번호** (영문/숫자, 예: 0130S4415M) + **한글명** (예: 솔샘간 17R1)
- `DCUID = 변대주 전산화번호 + 차수+번호 2자리`
- DCUID 영문자 포함 → DCU 케이스. 숫자만 → LTE 케이스
- 복사 시 끝 2자리 떼고 변대주 전산화번호만 (KDN 요청·앱 입력 시 형식)

---

## 다음 세션 시작 시 순서
1. **awms 크롬 확장 PoC 시작**
   - awms.kdn.com 로그인 후 시공등록 페이지 DOM 구조 캡처
   - 폼 필드 셀렉터·이벤트 구조 분석
   - 파일 attach + 저장 동작 JS 시뮬레이션 가능성 검증
2. 모바일 확장 가능성 평가 (안드로이드 Kiwi/Yandex, iOS Safari)
3. PoC 통과 시 → 입력 시스템(작업자 카드 대체) 설계로 진행
4. PoC 실패 시 → worker/ Playwright 재개 또는 사용 시나리오 변경

## 알아야 할 점
- **메인 디렉토리**: `/Users/woodelight/Projects/ami-work/`
- **종로 시스템**: `/Users/woodelight/Projects/jongno-combined/` (별도 repo)
- worker/ 디렉토리: awms Playwright 자동화 PoC (현재 보류, 크롬 확장 우선)
- Firebase 프로젝트 분리: ami-work-1c49a (충전기) vs ami-jongno (종로)
- 옵시디언 사업 노트: `Projects/AMI/사업_실효계기데이터관리.md` (영준님 결정 흐름 누적)
