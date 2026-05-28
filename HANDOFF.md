# HANDOFF — ami-work / jongno-combined / awms-bridge (신규)

## 현재 상태 (2026-05-27)

- 마지막 작업: **AWMS Bridge 안드로이드 앱(Capacitor) 신규 — 영준님 폰에 빌드 성공 + WebView navigate + CapacitorHttp + 자동 레코더 + 다크모드 + 떠있는 4-아이콘 툴바 / awms 7854건 전체 분석 + 종로 동기화 도구(sync-meter-from-awms.html) 푸쉬 완료**
- 진행 중: **AWMS 자동 레코더가 영준님 폰에 셋업됨**. 내일 작업자/통신팀 awms 계정으로 실 작업 1건씩 하면 모든 fetch/XHR 본문까지 자동 기록 → 그 JSONL로 자동화 함수 작성
- **다음**:
  - 영준님이 sync-meter-from-awms.html 실행 (awms 완료 907건 → 종로앱 양쪽 complete 동기화)
  - 내일 작업자 awms 계정 (예: 273584) 영준님 폰 우리 앱에서 로그인 → 실효계기관리 1건 임시저장 → 레코더 자동 캡처 → JSONL 추출
  - 통신팀 측 awms 작업도 1건 (영준님 본업) → 동일 캡처
  - 두 JSONL 분석 → 계기팀/통신팀 두 자동화 함수 작성 → 우리 앱에 모드 토글
  - 종로 알파벳 버튼 결정 (영준님 답 대기 — 이전 이슈)
  - 과거 awms 완료 이력(영준님 한전에서 받기로 함) 받으면 추가 동기화
- 블로커:
  - **awms POST URL/body 미캡처** — 내일 작업자 1건 등록 시 우리 레코더가 잡음
  - 작업자 awms OTP = 작업자 폰으로 옴 → 매번 카톡 전달 (A안 확정)
  - awms 자동화 = 한전 적대 리스크 유지

## 2026-05-27 (이번 세션) 작업 요약

### 1. AWMS 데이터 종합 분석 (영준님 awms-all.json 7854건 받음)
- 콘솔 fetch 한 줄로 다운로드 (`getMainList?pRowCount=10000`)
- WORK_STEP 분포: 20(미작업) 6939 / 25(임시저장) 5 / 28(완료) 910
- 차수 7종 (5/6/7/8차 + 12/13/14차) 매핑 확인
- 우리 site와 매칭: 6464/7854 (82.3%) — 같은 키 페어 불일치 0건
- 매칭 실패 1378건 = 누상동 562, 행촌동 141, 신영동·이화동·무악동 등 — site-data 생성 이후 한전 신규 발주
- awms 중복 2395건 (같은 계기 여러 차수 동시 등록 패턴) = 한전 운영 잔재
- 우리 엑셀 12728행 = 빈줄 3077 + 유효 9651 (= 우리 site와 완벽 일치, 누락 없음)

### 2. getDetail 5건 호출 → 입력 필드 명세 추출
- 콘솔 fetch 5번 → awms-detail-5.json
- 301필드 중 의미있는 것 54개 (고정 34 + 변수 13 + 작업자 입력 5~)
- 작업자가 진짜 입력하는 것 4~5개만:
  - CREMO_WHM_NO (신계기번호, QR 가능)
  - DGD_WHME_NDL_DAY_QTT (철거 사용량)
  - CSL_METR_TRML_SEAL_NO (봉인번호 — awms 자동일 가능성 ★)
  - DREMO/CREMO_ATCH_FILE_ID_3 (사진 2장)
- 신계기 QR 스캔 시 CREMO_PRDC_YM, CREMO_MATL_NO 자동 매핑
- 종로앱 replacement_list 구조 = awms 완료 데이터와 100% 호환

### 3. sync-meter-from-awms.html 도구 신규
- jongno-combined/tools/sync-meter-from-awms.html (푸쉬 완료)
- awms-all.json 업로드 → WORK_STEP=28 + CREMO_WHM_NO 채워진 것만 → 우리 site 계기번호로 매칭
- 정책: **AWMS 완료 우선 → 기존 임의 완료 덮어쓰기**, **meter_state + comm_state 둘 다 complete로 마킹**
- 영준님이 실행 대기

### 4. 라이브 종로 work-status 분석
- workStatus/jongno 628 주소 등록 (613 양쪽 complete, 통신팀만=0)
- awms 미완료 + 종로 양쪽 complete = 959건 (영준님 외부 작업분 마킹 결과 — 정상)

### 5. AWMS Bridge 안드로이드 앱 신규 (★ 큰 작업)
경로: `/Users/woodelight/Projects/awms-bridge/`

**환경 셋업**
- JDK 17 (Temurin) + Android Studio brew install
- ANDROID_HOME / JAVA_HOME zshrc 자동 등록
- Capacitor 7 프로젝트 (npm install + cap add android)
- 영준님 폰(갤럭시 A33 5G, RFCT710YTFW) USB 디버깅 + 빌드 성공

**구조**
- Capacitor Android WebView 단일
- 우리 페이지(https://localhost) = 메인 (동기화 큐/AWMS 안내/기록/로그 4탭)
- AWMS 페이지 = 같은 WebView가 https://awms.kdn.com으로 navigate (iframe 불가 확인 후 전환)
- 같은 WebView 쿠키 자동 공유

**해결한 이슈들 (순서대로)**
- ERR_CLEARTEXT_NOT_PERMITTED → network_security_config.xml + usesCleartextTraffic=true
- iframe ERR_BLOCKED_BY_RESPONSE (naver 포함 전체) → iframe 포기, WebView navigate 방식
- session-info Failed to fetch (CORS) → CapacitorHttp 네이티브 호출 + capacitor-cookies enable
- 시스템 바 투명/한 줄만 보임 → edge-to-edge 비활성화 (windowOptOutEdgeToEdgeEnforcement + WindowCompat.setDecorFitsSystemWindows + fitsSystemWindows)
- awms 페이지 다크모드 미적용 → androidx.webkit + WebSettingsCompat.setAlgorithmicDarkeningAllowed
- 떠있는 툴바 라벨 큼 → 아이콘만 (← → ↻ ⌂), 높이 38px
- 폰 navigation bar 색 통일 → values + values-night styles.xml 분리

**자동 레코더 (영준님 의도 — 작업 시 자동 정보 수집)**
- MainActivity.RecorderBridge (@JavascriptInterface)
- BridgeWebViewClient onPageFinished에서 모든 페이지에 fetch/XHR patch JS 자동 주입
- 모든 요청/응답 → /data/data/com.youngjun.awmsbridge/files/awms-recording.jsonl 한 줄씩 append
- 우리 앱 [기록] 탭에서: 건수 확인 / JSONL 다운로드 / awms 호출만 추출 / 모두 삭제
- 페이지 도메인 무관 동작 (awms 페이지에도 주입됨)

**다크모드**
- 우리 페이지 CSS @media (prefers-color-scheme: dark) 전체 색 정의
- awms 페이지 알고리즘적 다크 (Android 13+ 자동 반전)
- 떠있는 툴바도 다크/라이트 감지 분기
- 시스템 바 색 values + values-night 분리

### 6. 종로 admin.html (이전 세션) 큰 이슈 없음 — handoff 보존

## 메모리 추가/업데이트 (이번 세션 없음)
이전 세션 메모리 그대로 유효.

## 푸쉬 상태
- jongno-combined: sync-meter-from-awms.html 푸쉬 완료 (commit b1vokx82n 다음)
- awms-bridge: 신규 디렉토리 (아직 git init 안 됨 — 내일 결정)
- ami-work: 변경 없음

## 다음 세션 시작 시 확인
1. 영준님이 sync-meter-from-awms.html 실행했는지 (awms 완료 907 → 종로앱 마킹)
2. AWMS Bridge 앱으로 작업자 awms 로그인 + 1건 임시저장 캡처
3. 캡처된 JSONL 받으면 awms-poster.js의 POST URL/body 채우기
4. 통신팀 모드 (영준님 본업) — 별도 캡처 후 두 번째 자동화 함수
5. 영준님 한전에서 과거 awms 완료 이력 받기로 한 거 진행 상황
