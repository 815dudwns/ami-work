# [[AMI 작업지도]] 프로젝트

## 프로젝트 개요
- 앱: AMI 작업지도 — **실효계기 교체 단독시공** 관리
- 배포: https://815dudwns.github.io/ami-work/
- GitHub: github.com/815dudwns/ami-work
- 기술: HTML + 바닐라 JS + Kakao Maps + Firebase Realtime DB

## ★ 지식베이스 (시스템별 모듈 — 작업 전 해당 카드부터 로드)
> 2026-07-13 재구조화. 지식이 시스템(도메인) 단위 카드로 봉합됨. **특정 시스템 작업 시 이 CLAUDE.md 전체가 아니라 해당 카드 + L0 공용코어만 읽으면 독립적으로 작동**한다. 각 카드 = 구조·동작 / 결정이력(함정) / 배포·버전 / TODO 4요소. 정본 = 옵시디언, 원자적 사실 = auto-memory(카드가 [[slug]]로 링크), repo = 실무·진입점.
>
> 볼트 루트: `/Users/woodelight/Projects/obsidian/Projects/AMI/`

**L0 공용코어** (`core/`) — 모든 시스템 공유:
- `core/사업구조.md` — 단독/동행·한전 발주체인·전략·B2B·10팀확장·한전리스크
- `core/계기도메인.md` — 계기타입5종·단상삼상·4필드검침·변대주/DCUID·통신방식·모뎀MAC판별
- `core/데이터규칙.md` — 누락금지·zfill·좌표폴백·네이버캐스케이드·사이트추가·보강파이프라인·KEPCO_IMPORT보존
- `core/Firebase.md` — DB구조·통째삭제보호·롤백·스토리지정책·rules복구
- `core/작업방식_글로벌.md` — 앱호칭·버전보고·위임병렬·화법·금지규칙·포트·폰CDP디버깅·tavily

**L1 awms 시스템** (`systems/`) — 공용 인프라, 통신팀 MOBCST ↔ 계기팀 MOBMTR 분리:
- `systems/awms-공통.md` (API레퍼런스·saveAct/saveRow·완료동기화·inject·양팀 공통함정)
- `systems/아미큐.md` (통신팀) · `systems/헬퍼.md` · `systems/OTP수집기.md` · `systems/계기큐.md` (계기팀)

**L2 지도/현장 앱**:
- `systems/아미맵.md` (단독시공) · `systems/구로금천.md`
- `systems/종로맵/` — `_종로맵-인덱스.md` · `지도-workStatus.md` · `교체모달-검침.md` · `통계.md` · `디자인.md` · `보조앱-snap.md` · `명륜-팀배분.md`

**L3 데이터관리** (본업):
- `systems/검증관리자.md` · `systems/후처리-데일리검진.md` · `systems/OCR.md`(소관=ocr-meter) · `systems/한전포털.md`

**운영/기록**: 세션로그·타임라인·매뉴얼·결정이력 = 옵시디언 `logs/` `manuals/` `decisions/`.
설계 정본: `research/지식재구조화_설계_20260713.md`.

---

## 앱 버전 현황 (★ 배포·코드변경 시 반드시 여기 갱신 — 단일 출처)
> 시스템별 상세 배포규칙은 각 카드 §3. 앱 호칭은 [[app_naming_convention]].

| 앱(호칭) | 버전 위치 | 현재 버전 | 갱신일 |
|---|---|---|---|
| **계기큐**(계기교체·계기팀) | `awms-queue-www/app.js` `APP_VER` / APK | `v0626b-아이디선택` / APK 오버레이fetch | 2026-06-26 |
| **아미큐**(통신큐·통신팀) | `cst-app` `versionName`(네이티브) / `cst-input/cst-version.json`(자동업뎃) | `2.2.1` (Amigo A053 QR MID추출+A접두 허용 — 11자리아님 노란색 해결. 2.2.0 기능 유지) | 2026-07-15 |
| **종로맵**(meter care solution) | `jongno-combined/map.html` `APP_VERSION` / 메뉴라벨 | `20260702.4` / `v20260706.1` (workStatus 미러 IndexedDB 이전=iOS quota 해결. map.js ?v=20260706b) | 2026-07-06 |
| **종로 보조앱**(jongno-snap) | `snap.html` `APP_VER` + 라벨 / snap-version.json / APK | `v20260707.7` (사진 재촬영 덮어쓰기 / 실시간QR / 카메라선택. ★범프 시 3곳 APP_VER+라벨2 갱신) | 2026-07-07 |
| **아미맵**(ami-work 작업지도) | `ami-work/js/auth.js` `FORCE_LOGOUT_VERSION` | `20260624a` | 2026-06-24 |
| **헬퍼**(awms-helper) | `versionName` / inject | `1.0.77` / inject `v80` | 2026-06-28 |
| **OTP수집기**(awms-otp-collector) | `versionName` | `1.0.1` (카톡 백그라운드만 정리. ★네이티브 자동배포X, APK수동설치) | 2026-07-03 |
| **awms-bridge-inject**(리모컨 공용) | `awms-bridge-inject.js` `VER` | `v80` | 2026-06-20 |
| **명륜 팀배분**(myungroon) | `jongno-combined/myungroon.html` `myungroon_app_version` / 메뉴라벨 | `20260624.1` | 2026-06-24 |

규칙: 계기큐·아미큐 JS는 github 원격로드라 `APP_VER`+push만으로 반영(APK는 네이티브 변경 시만). 종로맵은 `APP_VERSION`+`?v=`+메뉴라벨 함께([[jongno_app_version_deploy]]). 아미맵 `FORCE_LOGOUT_VERSION`은 긴급 시만([[ami_work_init_logout_fix]]).

## 데이터 규칙 (절대 준수 — 상세 `core/데이터규칙.md`, `core/계기도메인.md`)
- 데이터 누락 금지 — 좌표 실패해도 동 중심 좌표로 넣기 (폴백: 도로명→지번→동중심, exact/approximate 표시)
- 계기번호: 엑셀 float→int→str→zfill(11), 하이픈 금지
- 계기타입: 엑셀 믿지 말고 계기번호 3~4자리 직접 파싱 (17→E, 19→EA, 25/26/27·45/46/47→G, 53/55→Amigo)
- 변대주/상호 '0' → 빈 문자열

## 새 사이트 데이터 추가 프로세스
1. 데이터 수집 (사진 OCR / 엑셀 / 스프레드시트)
2. 주소 변환: 주소변환.py (지번 → 도로명, 카카오 API)
3. 좌표 추출: 좌표추출.py (도로명 → 좌표, 3단계 폴백) → ami_data_coords.json
4. site-data.json에 합치기 (계기번호 중복 체크)
5. **★ `python3 scripts/gen_site_version.py`** — site-data.version.json 재생성 (안 하면 작업자 폰이 옛 IndexedDB 캐시 사용. site-data.json 바꾸면 무조건)
6. Firebase 업로드: upload_sitedata.py → siteData/charger4eleccar
6.5. **★ `python3 scripts/gen_stats_index.py`** — data/stats-site-index.json 재생성 (stats 지사별 분모. upload_sitedata.py 후 반드시)
7. 작업상태 업로드: scripts/upload_work_status.py → workStatus/charger4eleccar
8. git commit & push
9. 브라우저 확인

## 운영 도구
- scripts/reset_work_status.py — 작업상태 초기화 (롤백용)
- scripts/restore_firebase.py — 백업에서 Firebase 복원
- 좌표채우기.py — 기존 데이터 중 좌표 null인 항목 보충

## 계정 정보
계정·비밀번호 정본 = `js/auth.js`(작업자 로그인 배열). 공개 문서에 평문 중복 두지 않음.
계정 추가·변경 시 auth.js 갱신. (보안 주의: 현재 클라이언트 사이드 평문 인증 — 서버 인증 전환은 별도 과제)

## Firebase (상세 `core/Firebase.md`)
- DB: https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app
- siteData/charger4eleccar (현장데이터) · workStatus/charger4eleccar (작업상태, 30초 동기화)
- Rules .read/.write false면 동기화 안 됨. 통째삭제 보호규칙 적용(2026-07-13).

## 시스템별 상세 (옵시디언 카드가 정본 — 여기선 진입점만)
- **통계 페이지**(stats.html, 관리자+윤용운) → `systems/종로맵/통계.md`. 분모=경량 인덱스 `data/stats-site-index.json`(Firebase 직접 안 읽음, egress 절감).
- **awms 시스템** → `systems/awms-공통.md`. ★통신팀(MOBCST `mob/cst`)↔계기팀(MOBMTR `mob/mtr`) 별개, 교차호출 405. API레퍼런스 `research/awms-poc/awms_API_레퍼런스.md`.
- **awms 완료→종로 동기화** → `systems/awms-공통.md`. 종로 DB=**ami-jongno**(ami-work 아님). 삭제경고 [[jongno_delete_protect]].
- **LCD YOLO / 교체모달** → `systems/종로맵/교체모달-검침.md`. OCR판독은 ocr-meter 소관 → `systems/OCR.md`.
- **종로맵 디자인(clay)** → `systems/종로맵/디자인.md`. 토큰 단일출처 `jongno-combined/css/clay.css`. ★임의 토큰 금지([[jongno_design_system_path]]).
- **한전 데이터 열람 포털**(awms 아님) → `systems/한전포털.md`.

## 예정 기능 (우선순위순)
1. UI 개선 (DaisyUI/Variant) 2. 리스트 선택 페이지 3. 구/동 필터 패널 4. 관리자 전용 기능 5. 다중 사이트 리스트 6. 작업 완료현황 엑셀 내보내기

세션 상태/블로커는 HANDOFF.md 참고
