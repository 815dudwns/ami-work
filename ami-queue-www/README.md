# ami-queue-www — 죽은 옛 웹뷰 (DEAD, 수정 금지)

**여기를 고치면 폰 반영 0이다.** 2026-06 이전 동결된 아미큐 옛 웹뷰이고,
cst-app 네이티브가 이 폴더를 로드하지 않는다.

## 아미큐(통신큐) 진짜 위치
| 무엇 | 어디 |
|---|---|
| 수집 UI (사진→OCR→맥→계기확인) | `cst-input/www/collect.js` · `index.html` · `settings.js` |
| saveAct 빌더 (FCLTY_DIV·EXT_CONN_DEV 등 awms 필드) | `cst-input/backend/app.py` |
| 앱 버전 / 자동업데이트 | `cst-input/cst-version.json` (`versionName`) |
| APK | `cst-input/amiqueue.apk` |

cst-app 소스에서 유일한 원격 로드는 `AwmsLoginScreen.kt:29` 의 `awms-bridge-inject.js` 하나뿐이다.

사고 이력: 2026-08-11 PM이 이 폴더를 아미큐로 오인해 발주 → 구현·푸시까지 갔으나 폰 반영 0.
근거: `.claude/agents/통신팀.md`
