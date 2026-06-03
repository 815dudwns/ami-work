# HANDOFF — ami-work / jongno-combined / awms-bridge / awms-queue

## 현재 상태 (2026-06-04 새벽, 오토모드 야간작업)

- 마지막 작업:
  1. **종로 큐 가짜 3건 삭제 완료(검증됨)** — workStatus/jongno에서 누상166-9·창신651-4·무악82 제거, 평창 2건(9953/9955) 유지. 백업 후 5→2 assert 통과.
  2. **독립 큐앱 `awms-queue` 분리·빌드 성공** — awms-bridge에서 복제→큐 중심 슬림화. 2탭 멀티웹뷰, 완료받기 자동화, saveRow 빌더 포팅. 디버그 APK 빌드 OK(02:32, 4.8MB).

- 진행 중: **plumbing(JS↔네이티브 콜백)은 검증 완료**, 실제 awms 인증호출만 미검증(세션 만료).
  - [검증됨 02:43] APK 설치·실행 → Promise.resolve(42)→json=42, fetch await도 정상(login.html HTML 수신). awmsEval/AwmsResult.deliver 콜백 경로 OK.
  - ※ 중요 수정: Android evaluateJavascript는 CDP awaitPromise가 없어 Promise를 안 기다림 → JS가 await 후 네이티브로 직접 콜백(AwmsResult.deliver)하는 방식으로 고침(advisor 발견).

- **다음 (영준님 OTP 재로그인 후)**:
  - awms-queue APK는 폰에 이미 설치됨. OTP 로그인 후 awms 탭이 메인 뜨면 → **통합 테스트**: 평창 9953(단상/주간/봉인+1)·9955(삼상/심야야간MNGT/봉인+2) 큐 등록 → 제조월(202601)·봉인·1행·사진2장·지침 검증
  - 남은 미검증(세션 필요): 실제 awms fetch 인증호출 / saveRow 등록 결과 / 사진 cross-origin fetch→blob(CORS) / 봉인 NQNT 값(삼상도 "1"?, 빌더 WARN) / `<input type=file>` onShowFileChooser / awms탭 시스템 백버튼
  - 큐 입력 자동화(jongno 완료 → registerReplacement 인자)는 이미 queue.js loadQueue가 workStatus/jongno에서 추출하도록 연결됨

- 블로커:
  - **awms 세션 4시간 만료** — 폰 awms-bridge/awms-queue 재로그인(OTP) 후에만 awms 호출 검증 가능
  - **awms-queue는 git 원격 없음**(awms-bridge도 동일, 로컬 운영) → 로컬 커밋만 보존됨(`Projects/awms-queue/.git`). push 대상 없음.

## awms-queue 구조 (신규, Projects/awms-queue/)
- 독립·비공유(영준님 폰 전용). awms-bridge 원본은 디버깅/recorder용으로 보존(무손상).
- **2탭 멀티웹뷰**(MainActivity.java): queueWebView(앱UI) ↔ awmsWebView(awms.kdn.com). 둘 다 백그라운드 생존 → awms 폼 입력상태·세션 보존. 홈=큐탭.
- **awms 호출 = awmsWebView에 evaluateJavascript 위임**(`AwmsQ.callAwms` → `window.__awmsResult` 콜백). same-origin+쿠키 자동, 맥 CDP 불필요. 쿠키는 CookieManager 앱전역 공유.
- **완료받기 자동화**(queue.js syncCompleted): 큐 진입/새로고침 시 getMainList(28,14차) → firebase awmscomplete PUT + 큐에서 완료된 신설계기 자동 제외.
- **saveRow**(awms-saverow.js): queue_saverow_builder.py 1:1 포팅. registerReplacement({addr,meter,rep}) 진입점. app.js runOne/runAll이 호출. 큐 등록은 영준님 직접(자동 아님).
- 빌드: node_modules는 awms-bridge에서 복사 필요(복제 시 제외됨). `cd android && ./gradlew assembleDebug`.

## 이번 세션 기타
- firebase awmscomplete 완료 610건 확인(ami-work DB). 큐 5건 전부 완료에 없는 테스트로 판정(중복 0).
- ami-work 핵심 문서/스크립트 WIP 브랜치 push. 데이터 덤프 json은 로컬만(미push).

## 다음 세션 시작 시 확인
1. 영준님 OTP 재로그인 → awms-queue APK 설치·plumbing 실측 → 평창 9953/9955 통합 테스트
2. awms 가짜 임시저장(WORK_STEP=25) 잔여 resetRows 삭제(세션 후)
3. 종로앱 APK/QR 배포
4. 종로앱 리포트 검증 페이지 (영준님 구상 대기)
