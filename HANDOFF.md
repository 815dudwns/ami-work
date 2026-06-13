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
| **A. ami-work** | 로딩 경량화(Part1·3) + 개별불가동기화 + UI상태리셋 | **완료**(Part2 보류) |
| **C. 계기큐**(awms-queue) | 경량화(캐시즉시렌더+dedup) + UI(진행비주얼·로그버튼·실패번역) + 깜빡임수정 | **완료** → [[awms_queue_lightweight_done]] |
| **B. 종로앱** | 로딩 경량화 = A/C 공통패턴 이식 + map↔stats APP_VERSION 불일치 1줄 버그 | 대기(다음) |
| **D. ami-queue**(통신큐) | 완성 = C 이식 + awms 호출 확인 + C 구조 반영 | 대기(C 연동) |

순서: A✓ → C✓ → **B → D**. 종로 머지로직은 ami-work와 상이(comm/replacement) 주의.

## 대기 액션 (영준님 결정/확인 필요)
- **awms 통신팀 0553 6건 전송(sendSelections) 여부** — 맥변경 완료, 전송 전 상태. 영준님 결정 대기.
- **계기큐 옛 awmscomplete c키 2개 청소** — `latest` 고정키가 한 번 생성된(다음 awms 새로고침) 뒤 안전.
- **계기큐 site-data 재다운로드 측정** — 폰 풀리면(awms 로그인 무관). force-cache 유지 여부 → loadSiteMap 캐시 필요성 결정.
- **TOU 작업자 폰 새로고침 반영 확인** — 정적파일이라 자동 reload 아님.
- **종로맵 #6 계기종류 표시방식 + 폰 실측** — 버벅임/필터/완료숨김.

## 블로커
없음. (제주 완료0 / 종로 미연계 = 영준님 지시로 제외)

## 사용량/요금제 결론 (2026-06-13, 영구)
- **ami-work = Spark 무료, billingEnabled=false → 돈 0원.** "10GB 다 씀"은 무료 한도(차단 위험)지 과금 아님.
- 범인 = workStatus 30초 폴링(≈9.6GB/일) → **Part3 증분 리스너로 해결됨.** DB 이전·유료전환 불필요.
- ocr-meter는 ami-jongno만 읽음(ami-work 무관). 분리위반: 종로 sync-meter-from-awms.html이 ami-work DB awmscomplete 사용 → ami-jongno 이전 검토(별건).

## 핵심 규칙 (사고 방지 — 영구)
- **awms 맥변경 = 모뎀 재결합(saveAct 아님), 마스터 먼저.** 통신팀(mob/cst)/계기팀(mob/mtr) 별개·교차호출 405. 모뎀맥·마스터/슬레이브는 통신팀 전용. → `awms_API_레퍼런스.md` 8.5.
- **계기큐 코드수정 = ami-work/awms-queue-www push**(APK빌드 아님, USB 불필요). 네이티브(카메라/파일선택)만 빌드.
- **종로맵 배포 시 APP_VERSION 갱신**(map.html/stats.html 통일) — 안 하면 옛화면 잔존.
- **TOU = 정적파일(data/tou-data.json), Firebase 아님 — push로 반영.** 마커 미완은 해당 배치만.
- **28(완료) 되돌리기 불가**(계기팀). 통신팀은 전송 전이면 삭제·수정 자유.
- **주소상태(workStatus)는 무조건 Firebase.** 종로DB=ami-jongno.
- **ami-work/jongno 코드는 PM 직접 수정**(에이전트 권한거부). 계기큐 APK는 빌드 가능.
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감.
- **AUTH/FORCE_LOGOUT_VERSION 평소 배포에 건드리지 말 것** — 잦은 범프가 "앱 초기화" 원인 [[ami_work_init_logout_fix]].
