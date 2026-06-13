# HANDOFF — ami-work(아미맵) / jongno-combined(종로맵) / 계기큐·아미큐·헬퍼

> ★ **이 문서는 영구 상태판이다. 휘발성 세션 진행메모를 여기 쓰지 말 것** — 작업 디테일·과정은 메모리(`~/.claude/.../memory/`)와 `research/` 문서에 남긴다.
> ami-work 세션이 여러 개라 충돌하므로, HANDOFF는 **잘 안 바뀌는 것**(트랙 상태·핵심 규칙·대기 액션)만 단일 권위로 유지한다. 매 세션 덮어쓰는 "마지막 작업/진행중" 식 로그 금지.
>
> 앱 통칭 [[app_naming_convention]]. 배포 시 APP_VERSION 갱신 [[jongno_app_version_deploy]]. 종로맵=Naver Maps.
> **awms API 모를 때 = `research/awms-poc/awms_API_레퍼런스.md`. 통신팀(mob/cst)/계기팀(mob/mtr) 별개 — 항상 구별.**

## 주말 4트랙 (2026-06-13)

> "DB 구조변경" = 스키마 변경 아님. **매번 받기 → 한 번 받고 캐시·증분으로 가볍게**. 계획: `~/.claude/plans/soft-pondering-pelican.md`

| 트랙 | 내용 | 상태 |
|---|---|---|
| **A. ami-work** | 로딩 경량화(Part1·3·**Part2 siteData캐시-우선**) + 개별불가동기화 + UI상태리셋 + **마커 좌표기준 합치기** | **완료** → [[amimap_part2_sitedata_cache]] [[amimap_marker_coord_merge]] |
| **C. 계기큐**(awms-queue) | 경량화(캐시즉시렌더+dedup) + UI(진행비주얼·로그버튼·실패번역) + 깜빡임수정 | **완료** → [[awms_queue_lightweight_done]] |
| **B. 종로앱** | APP_VERSION통일+siteData force-cache+초기화2배다운로드제거 | **완료** → [[jongno_lightweight_done]] |
| **D. ami-queue**(통신큐) | OTP내장+자체awms로그인+겹침방지+saveAct빌더(500해결·마스터슬레이브·사진) 완료 / 앱통합(수집폼·예약전송·EXIF시프트·QR) 남음 | **진행중**(2026-06-13) → [[awms_saveact_500_fix]] [[awms_otp_amiqueue_embed]] |

순서: A✓ → C✓ → B✓ → **D**. 종로 머지로직은 ami-work와 상이(comm/replacement) — child_*증분 보류(폴링없어 이득작음).
※종로 캐시버스트/APP_VERSION 분리 정착: 코드변경=map.html `?v=`만, APP_VERSION은 전원 재로드 필요시만.

## 대기 액션 (영준님 결정/확인 필요)
- **★ 7/1 ami-work Blaze→Spark 복귀** — 무료체험 크레딧(7/2 종료) 전 되돌려야 DB 차단 방지. `gcloud billing projects unlink ami-work-1c49a`. 7월이면 무료한도 리셋+경량화로 Spark 충분. 맥 미리알림 등록됨.
- **계기큐 옛 awmscomplete c키 2개 청소** — `latest` 고정키가 한 번 생성된(다음 awms 새로고침) 뒤 안전.
- **종로맵 #6 계기종류 표시방식 + 폰 실측** — 버벅임/필터/완료숨김.

## 블로커
없음. (제주 완료0 / 종로 미연계 = 영준님 지시로 제외)

## Firebase 요금제/사용량 (2026-06-13 갱신)
- **ami-work RTDB 다운로드 무료 한도 100% 소진 → 차단 위험. Blaze 전환으로 해제.**
  - billing 계정 = **무료체험 크레딧 `01214A-10A39B-960378` "내 결제 계정"**(₩453,008, 7/2 종료). gcloud로 link → `billingEnabled=true` 확인. ★"Firebase 결제"(01CCFF)는 실제 청구 계정이라 안 씀.
  - 과금은 무료 크레딧 차감(경량화로 거의 0). 예산 알림 ₩10,000 설정(알림용, 차단 아님).
  - **DB 이전(B안)은 안 함** — 일시적(이번달) 문제에 영구·광범위 변경(작업자 폰 재배포·awmscomplete 등 허브 참조 전부 수정)이라 리스크 과다. 경량화로 다음달 현 DB도 무료 내.
- 100% 범인 = workStatus 30초 폴링(≈9.6GB/일) → **Part3 증분 리스너로 해결**(경량화 전부 push). 다음달부터 무료 한도 내 예상.
- **ami-work Storage = 안 씀(버킷 404, 미생성)** — 한도 걱정 0. 사진 Storage는 ami-jongno만. config.js storageBucket은 기본값일 뿐 실파일 0.
- **★ 7/1 Spark 복귀 필수**(대기 액션 참조) — 무료체험 7/2 종료 전.
- ocr-meter는 ami-jongno만 읽음(ami-work 무관). 분리위반: 종로 sync-meter-from-awms.html이 ami-work DB awmscomplete 사용 → ami-jongno 이전 검토(별건).

## 핵심 규칙 (사고 방지 — 영구)
- **awms 맥변경 = 모뎀 재결합(saveAct 아님), 마스터 먼저.** 통신팀(mob/cst)/계기팀(mob/mtr) 별개·교차호출 405. 모뎀맥·마스터/슬레이브는 통신팀 전용. → `awms_API_레퍼런스.md` 8.5.
- **계기큐 코드수정 = ami-work/awms-queue-www push**(APK빌드 아님, USB 불필요). 네이티브(카메라/파일선택)만 빌드.
- **계기큐 백그라운드 일괄등록 = awms fetch 오버레이로 해결**(2026-06-13, APK). 다른앱(아미큐/헬퍼/지도) 쓰며 등록 OK. ★단 배치 중 계기큐를 최근앱서 스와이프 종료 금지(Activity 죽으면 오버레이도 죽음), 화면OFF 주머니(Doze)는 미검증. → [[awms_queue_webview_visibility_freeze]].
- **종로맵 배포 시 APP_VERSION 갱신**(map.html/stats.html 통일) — 안 하면 옛화면 잔존.
- **TOU = 정적파일(data/tou-data.json), Firebase 아님 — push로 반영.** 마커 미완은 해당 배치만.
- **★site-data.json 변경 시 `python3 scripts/gen_site_version.py` 필수**(Part2 캐시-우선 로더 — 안 하면 작업자 폰 옛 IDB캐시 유지). → [[amimap_part2_sitedata_cache]].
- **아미맵 마커 = 좌표 기준 그룹핑**(같은 좌표 여러 지번 1마커, 재건축 한건물 통합). 완료 시 구성 지번 전부 기록. → [[amimap_marker_coord_merge]].
- **28(완료) 되돌리기 불가**(계기팀). 통신팀은 전송 전이면 삭제·수정 자유.
- **주소상태(workStatus)는 무조건 Firebase.** 종로DB=ami-jongno.
- **ami-work/jongno 코드는 PM 직접 수정**(에이전트 권한거부). 계기큐 APK는 빌드 가능.
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감.
- **AUTH/FORCE_LOGOUT_VERSION 평소 배포에 건드리지 말 것** — 잦은 범프가 "앱 초기화" 원인 [[ami_work_init_logout_fix]].
- **awms 로그인 OTP 자동입력** = 카톡 OTP(인증번호)를 **네이티브 접근성 서비스**가 읽어(웹뷰 JS로는 타앱 화면 불가) webview otpWrap에 입력. 헬퍼=자기앱 내장(완료, 개인폰 전용·외부빌드X) / 아미큐=재빌드 시 내장 / 계기큐=A31 별도수집기→Firebase→inject 폴링. 로그태그 `AWMS_OTP`(수집기는 `OTPCOL`). 헬퍼 재시작 시 접근성 INSTANCE 재바인드 필요(설정 토글). 전부 [[awms_otp_amiqueue_embed]].
