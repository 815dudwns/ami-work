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
| **D. ami-queue**(통신큐) | OTP내장+자체awms로그인+겹침방지+saveAct빌더 완료. 수집폼 A(아미맵 연동버튼)·B(handoff/계기번호조회·datapush_queue)·C(딥링크/사진 네이티브) 완료. **수집폼 UI는 awms 설비등록 폼 본뜨기로 전면 재설계 필요**(1차 마스터그룹 카드 폐기) + 설정페이지·맥QR·동행조회·builder슬래이브사진·예약·EXIF 남음 | **진행중**(2026-06-14) → [[amiqueue_collect_masterkey]] [[awms_saveact_500_fix]] |

순서: A✓ → C✓ → B✓ → **D**. 종로 머지로직은 ami-work와 상이(comm/replacement) — child_*증분 보류(폴링없어 이득작음).
※종로 캐시버스트/APP_VERSION 분리 정착: 코드변경=map.html `?v=`만, APP_VERSION은 전원 재로드 필요시만.

## 대기 액션 (영준님 결정/확인 필요)
- **★ 7/1 ami-work Blaze→Spark 복귀** — 무료체험 크레딧(7/2 종료) 전 되돌려야 DB 차단 방지. `gcloud billing projects unlink ami-work-1c49a`. 7월이면 무료한도 리셋+경량화로 Spark 충분. 맥 미리알림 등록됨.
- **계기큐 옛 awmscomplete c키 2개 청소** — `latest` 고정키가 한 번 생성된(다음 awms 새로고침) 뒤 안전.
- **종로맵 #6 계기종류 표시방식 + 폰 실측** — 버벅임/필터/완료숨김.
- **아미큐 수집폼 awms폼 본뜨기 재설계** — 캡처 레퍼런스 `research/awms-poc/awms_설비등록화면_{상단,하단}_20260614.png`, 설계 design.md §1.5. collect.js를 awms 설비등록 폼 모양으로(자동값 채움+맥/사진만) + 설정페이지(지사·사업명·동행·작업자) + 맥QR=모뎀맥사진겸용. **목적=맥+사진 모으기, 나머지 파생/자동**(영준님 못박음). → [[amiqueue_collect_masterkey]].
- **아미큐 OTP = APK 재설치 시 접근성 꺼짐** → 설정→접근성→AMI Queue 수동 재활성화(adb 강제 삼성차단). → [[awms_otp_amiqueue_embed]].
- ✓**4앱 신규 아이콘 적용 완료·폰검증(2026-06-14)**: 웹 2개(아미맵 PWA화 신규 + 종로맵) push, APK 3개(계기큐·아미큐·보조앱) install-r 완료. 폰 앱서랍 확인 — adaptive 마스킹 정상(스쿼클 라벨 안잘림). 아미큐 awms 세션쿠키 백업은 0개(보존불가)였으나 재로그인은 id/pw 자동+수동OTP. 아미맵=홈화면추가 시 standalone. 생성레시피·자산 [[app_icons_system]](`design/app-icons/`).

## 종로 보조앱(snap) — 신규 진행중 (2026-06-14)
> 2인1조 사진분담 컴패니언. 시공자가 사진만, daily_seq(=작업번호)로 메인앱 자동연동. 상세 [[jongno_snap_companion]] + `jongno-combined/research/보조앱_snap_설계.md`
- 앱: **jongno-snap** (`com.youngjun.jongnosnap`), 안드로이드 WebView 셸 **로컬 내장**. 화면=`jongno-combined/snap.html`. 수정반영=`~/Projects/jongno-snap/deploy.sh RFCT710YTFW`(복사+빌드+install, **폰 직접** — 원격아님). 종로 계정/Firebase(ami-jongno)/PhotoUploader 재사용. 화면 버전라벨 하단 `v20260614.N`
- 완료: 셸빌드·내장전환·캐시off(LOAD_NO_CACHE)·툴바제거 / 자체로그인(login.html 안거침) / 작업번호 빈번호자동제안+계기역검색 / 사진 자동저장(★Storage는 **REST 우회** — Capacitor XHR shim이 firebase SDK put() 깨뜨림 storage/unknown400, fetch REST POST는 200. snap만 우회, 종로 메인앱 PWA는 SDK 정상이라 안건드림) / RTDB 저장 성공 검증 / stats교체모달 **1건 fresh fetch**(`db.ref(.../replacement_list/계기).once()`, encodeKey 주소키, 경량유지 — 전체재로드X)
- ✓**해결(2026-06-14, "?" 원인규명+수정+폰검증 완료)**: 보조앱 저장 사진 "?" = snap `restUpload`가 **Blob을 2바이트 `{}`로 업로드**(Capacitor `convertBody`는 File만 무손실 base64, Blob/ArrayBuffer 둘다 `{}`로 떨어짐). 표시·CSS·prefill·크기 전부 정상이었고 **업로드 내용물만 깨짐**. 수정=blob을 `new File()`로 감싸 전송+업로드 size검증(fail-loud). snap **v20260614.6** 배포·폰검증완료(2바이트→1.77MB 정상 JPEG, naturalW=2992 렌더OK). → [[jongno_snap_photo_empty_upload]]. ★**기존에 깨진 `{}` 사진들은 재촬영해야 정상화**(자동복구 아님).
- ★**stats/map 교체모달 디자인 다름** — stats가 별도 모달HTML 씀. map과 통일 필요(RplModal·필드순서 재사용). map 데이터경로(실시간)는 동작중이라 건드리지 말 것(advisor).
- ✓**시나리오 B 구현(2026-06-14, 종로맵 v20260614.5 배포)**: 미할당 temp저장(`tempPhotos/jongno/{날짜}/{seq}`) → 메인앱 모달 열/작업번호변경 시 그 seq에 temp+빈칸 있으면 **confirm("보조앱 작업번호 N 사진 불러올까요?")** → 예=흡수+저장성공시 temp삭제. 자동흡수 아님(다른 계기일 수 있어 사람 확정 — 영준님 지시). draft 재오픈 포함. `replacement-modal.js` prefillTempForSeq. (영준님 폰 최종 저장검증은 미완 — 다음 세션서 그 레코드 흡수+temp삭제 curl 확인.)
- ★**보조앱은 들어낼 수도 있음(영준님)** — 통합 깔끔히 제거 가능하게. 메인앱 흡수로직은 snap 없으면 no-op이라 무해. → [[jongno_snap_companion]].
- ✓**보조앱 4기능 확장 완료·폰검증(2026-06-14, snap v20260614.11 / 종로맵 v20260614.7 배포)**: ①YOLO(lcd-yolo 이식, ort 지연로드, **검출+초록박스 표시 폰확인 OK**) ②QR=**네이티브 구글스캐너**(GmsBarcodeScanner, `window.AndroidScanner.scan()`→`__onNativeScan`, 헬퍼와 동일)→신계기번호·제조월 ③철거지침(대표 검침값, **자체 숫자키패드** — 삼성 inputmode 회피) ④설정→옵션 토글 3개(**기본 전부 꺼짐**). 앨범=**단일선택**(헬퍼 최대4장강제 제거, 네이티브). temp 스키마+메인앱 흡수 확장(빈칸만, confirm). **수정은 종로앱에서 가능**(입력칸 readonly 아님). 검침값→temp removal_value 저장 검증완료.
  - ★**YOLO가 snap만 "거의 못찾던" 원인 해결**: 삼성 content:// 파일 createImageBitmap 다중호출 디코드실패 → file→메모리 Blob 1회 materialize 후 compress/detect/박스 재사용(종로맵 동일). 모델=종로맵과 동일 `lcd_detector_512.onnx`(ocr-meter 분리정책 소관이나 물리적으론 ami-work/research·jongno/models, ocr-meter엔 모델파일 없음).
  - ✓**흡수 폰검증 완료(새로고침 후)**: temp seq3,4,5에 사진·검침값·QR계기번호·YOLO region 다 저장됨 확인. 종로앱 흡수도 동작. ★단 **"반영안됨"은 폰 종로앱이 옛 캐시(v20260614.4, 흡수코드없는 ?v=b)를 들고 있던 것** — APP_VERSION 자기리로드는 HTML 자체가 stale캐시면 못 돈다(순환). **새로고침(캐시버스트)하니 최신 로드→흡수 정상**. 코드는 처음부터 정상. → [[jongno_cache_busting]].
  - 자산복사=deploy.sh(폰 앱 완전종료 후 재실행 필요). → [[jongno_snap_companion]].

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
- **★실효계기 데이터 단일원본 = `data/site-data.json`. Firebase siteData(charger4eleccar) 소비자 = stats.html(분모)+아미큐(조회). 아미맵은 site-data.json만 봄(Firebase 아님).** 새 엑셀은 윤용운(←주덕기) 정기 누적 → site-data.json 갱신 시 **반드시 `upload_sitedata.py`(소스=site-data.json으로 고정됨)+`gen_site_version.py` 같이** 돌려야 Firebase·아미맵캐시 안 어긋남. 2026-06-14 Firebase 19613(5/7옛스냅샷)→26588 재업로드로 어긋남 해소(24530178317 등 6975 신규대상). → [[실효계기_엑셀_라이프사이클]]. **종로/철거 대조 키=고객번호(계기번호는 교체로 바뀜).**
- **ami-work/jongno 코드는 PM 직접 수정**(에이전트 권한거부). 계기큐 APK는 빌드 가능.
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감.
- **AUTH/FORCE_LOGOUT_VERSION 평소 배포에 건드리지 말 것** — 잦은 범프가 "앱 초기화" 원인 [[ami_work_init_logout_fix]].
- **awms 로그인 OTP 자동입력** = 카톡 OTP(인증번호)를 **네이티브 접근성 서비스**가 읽어(웹뷰 JS로는 타앱 화면 불가) webview otpWrap에 입력. 헬퍼=자기앱 내장(완료, 개인폰 전용·외부빌드X) / 아미큐=재빌드 시 내장 / 계기큐=A31 별도수집기→Firebase→inject 폴링. 로그태그 `AWMS_OTP`(수집기는 `OTPCOL`). 헬퍼 재시작 시 접근성 INSTANCE 재바인드 필요(설정 토글). 전부 [[awms_otp_amiqueue_embed]].
