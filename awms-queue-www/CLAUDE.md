# 계기큐 (계기팀) (AMI 하위 시스템)

> 정본 지식 = 옵시디언 카드. 작업 전 반드시 읽기:
> - 시스템: `/Users/woodelight/Projects/obsidian/Projects/AMI/systems/계기큐.md`
> - 공용코어: `core/awms-공통.md`
> auto-memory가 원자적 함정을 자동 recall. 상세 research 원본은 카드가 링크.

## 핵심 함정 (자세한 건 카드)
- JS는 github 원격로드 — 로직 변경은 push만으로 반영(작업자 폰 APK 재배포 불필요). APK 빌드는 네이티브(onShowFileChooser, SYSTEM_ALERT_WINDOW 등) 변경 시만.
- saveRow 조회 폴백 3종(봉인 getMainList + 고객조회 selectCustomerInfo + 작업목록 getMainList) — 작업목록 밖 계기도 등록 가능. 철거 전 필수.
- getDetail 타이밍 500: 철거 직후 awms 서버 미반영 → getDetail 빈값 → 신설 saveRow 500. 대기 후 재시도로 해결.
- webview 가시성 freeze: 화면 OFF·타앱 포그라운드 시 awms fetch 멈춤. 해법=awmsWebView를 SYSTEM_ALERT_WINDOW 오버레이로 항상 visible. A33 실기 PoC 게이트 전 풀빌드 금지.
- 세션 유지(재설치): JSESSIONID(httpOnly) CDP 백업·복원 필수. install-r 해도 세션쿠키 소실. suppress_origin 필수, page URL 동적탐색.
- complete28: 신설 후 getDetail 재조회 + 시공17키 + RE_SAVE_YN=Y + 신설사진 재전송(재전송 안 하면 사진 유실 — "재전송 안 함"은 오류).

## 코드 위치
- `app.js` — 메인 로직(APP_VER) / github pages 원격로드
- 계기팀 = MOBMTR(계기팀). 통신팀 MOBCST와 별개(교차호출 405).
