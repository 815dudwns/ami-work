# awms-bridge-inject.js (헬퍼 리모컨) — 기능·버전

> awms.kdn.com 설비등록(통신팀 MOBCST) 작업 보조 리모컨. 2026-06-04 시공전·대표계기 완성.

## 개요
- **github pages 리모컨**: `https://815dudwns.github.io/ami-work/awms-bridge-inject.js`. awms 페이지 **새로고침**하면 최신 로드(`?t=` 캐시버스트). **APK 재빌드 불필요** — 로직 변경은 push만.
- 배포 = origin/main (github pages). 로컬 wip 브랜치는 옛 버전일 수 있음(v47~는 원격 직접 push). 수정은 `git worktree add /tmp/x main` 으로 main 기준.
- `window.__awmsHelper` 게이트 = 헬퍼 전용 신동작 격리(계기팀 awms-bridge 무영향).
- firebase 로그 = `ami-jongno .../awmslog/helper`. 화이트리스트 `_FBLOG_KEEP`만 전송(폭주차단). `window.__FBLOG_ALL=true`로 전체.

## 시공전(ATCH_FILE_ID_3) 슬래이브 전파 — 핵심 (상세 [[awms_sigongjeon_a3_solved]])
- **원인**: awms가 모뎀 동일 슬래이브를 `mainList.addRow(param)`로 자동생성할 때 `param.ATCH_FILE_ID_4`(모뎀맥)만 채우고 `_3`(시공전)은 빈값 → a4만 따라가고 a3 누락.
- **해결**: addRow 가로채 `param.ATCH_FILE_ID_3 = 같은모뎀 시공전` 주입. 모뎀별 맵 `window.__sigongMap[MAC_MODEM]`(cross-modem 안전). 미리보기 = `img.src=singleFile.innorix?atchFileId=<id>` 매 틱 유지.
- **한버튼(저장+슬래이브) 서버랙 케이스**: addRow가 saveAct 응답(시공전ID 생성)보다 먼저 끝나면 주입 실패 → **late-injection**(폴링이 응답 후 빈 슬래이브 행에 `setRow`로 채움)으로 보강.
- 버전: **v63** addRow후킹 / **v65** `_setMP3`에 모뎀맵 캡처(polling 타이밍 독립) / **v66** late-injection 부활(setRow, callback 아님 — v59~62 실패는 innorix callback 부작용).

## 대표계기 → 계기번호 자동복사 (헬퍼 설정 옵션)
- 옵션 ON + **마스터(MODEM_DIV=10)** + 대표계기(MB_METER_ID) **11자리 완성** → 계기번호(INSTR_NUM)에 같은 값 자동(빈칸만, 수동값 보존). 슬래이브 제외.
- **11자리 조건(v67)**: 수기 한 글자씩 입력 시 watch가 글자마다 발화 → 첫 글자만 복사되고 막히던 버그. QR/OCR은 한번에 11자리라 무관.
- 옵션값 `window.__helperMbToMeter` = 헬퍼앱 `DeptBridge` 네이티브 주입(지사/동행과 동일 경로) → **이 옵션은 APK 필요**(헬퍼 설정 "지사·동행" 카드 체크박스, 기본 OFF).
- 버전: **v64** 옵션추가 / **v67** 11자리 조건.

## 인앱 자동 업데이트 (작업중·미완)
- 앱 시작 시 `awms-helper-version.json`(github) versionCode 비교 → 새 버전이면 DownloadManager로 apk 받아 설치(안드로이드 보안상 마지막 "설치" 탭 1회). MainActivity checkUpdate/downloadAndInstall/installApk. **version.json 미배포 + 빌드 미완** → 다음에 마무리.

## 버전 빠른표
| v | 내용 |
|---|---|
| v62 | awms 로그인 자동입력(__awmsHelper 게이트 제거, bridge도) |
| v63 | 시공전 addRow 후킹 주입 |
| v64 | 대표계기→계기번호 옵션 |
| v65 | 시공전 모뎀맵 캡처를 _setMP3로(타이밍 독립) |
| v66 | 시공전 late-injection 부활(한버튼/서버랙) |
| v67 | 대표계기→계기번호 11자리 완성 시만 |
