# HANDOFF — ami-work(아미맵) / jongno-combined(종로맵) / 계기큐·아미큐·헬퍼

> ★ **이 문서는 영구 상태판이다. 휘발성 세션 진행메모를 여기 쓰지 말 것** — 작업 디테일·과정은 메모리(`~/.claude/.../memory/`)와 `research/` 문서에 남긴다.
> ami-work 세션이 여러 개라 충돌하므로, HANDOFF는 **잘 안 바뀌는 것**(미완 트랙·대기 액션·핵심 규칙)만 단일 권위로 유지한다. **완료·배포·검증된 건 여기 남기지 말고 즉시 지운다**(상세는 옵시디언 로그·메모리).
>
> 앱 통칭 [[app_naming_convention]]. 배포 시 APP_VERSION 갱신 [[jongno_app_version_deploy]]. 종로맵=Naver Maps.
> **awms API 모를 때 = `research/awms-poc/awms_API_레퍼런스.md`. 통신팀(mob/cst)/계기팀(mob/mtr) 별개 — 항상 구별.**

## 진행중 트랙 (통신팀 범위 — 아미큐/헬퍼/아미맵. 계기팀·검증팀 항목은 각자 HANDOFF로 이관됨)
- **★Tailscale 인프라 (진행중)**: tailnet=맥(100.121.228.87)+A33(100.93.223.21)+아이폰. 아미큐 백엔드(8766) tailnet 전환 실증완료. **미해결**: A33 무선adb 포트가 무선디버깅 토글마다 바뀌어 매번 재확인 필요(2026-07-27 세션 내내 `adb connect 100.93.223.21:5555` 거부 — 고정포트 아님, USB도 현재 미연결). 실기 설치·logcat 필요할 때마다 이게 막힌다 — 다음 세션 착수 전 영준님께 현재 무선디버깅 IP:포트 또는 USB 연결 요청할 것. start.sh tailnet 발행 영구화도 미착수(재기동 시 trycloudflare 폴백). [[tailscale_adoption]]
- **★아미큐(cst-app 네이티브) — 2026-07-27 세션 대량 작업, 폰 실기 확인만 남음**:
  - 경로 확정: `/Users/woodelight/Projects/ami-work/cst-app/`(독립 git repo, remote 없음, **통신팀 단독소유, main 워크트리 경로에서 직접 작업** — worktree 브랜치 아님). SettingsScreen.kt/HistoryScreen.kt/CollectViewModel.kt 등. [[pm-repo-ownership]] 참고(문서화는 docs/data-contract.md).
  - **v2.2.5**: 큐 담기 OOM 크래시 수정(스트리밍 write+catch(Throwable)) — 그동안 미커밋 방치된 걸 이번에 커밋(475df8f).
  - **v2.2.6→v2.2.7 배포완료**: 설정탭에 공사명(원본 그대로, 축약 폐기)+작업자명("장진교 (20118)" 형식) 표시(백엔드 `/api/config`의 `WORKER*_NM`/`BUSI_NM` 실측 매핑 의존). 이력 탭 [이력 삭제]+확인다이얼로그 추가(이력 메타만 삭제, 큐/사진/awms 등록분 무관). GitHub raw 자동업데이트 경로로 배포(`cst-input/amiqueue.apk`+`cst-input/cst-version.json`, push 완료).
  - **★미확인(다음 세션 우선)**: A33 adb 불가로 실제 폰 설치·설정탭 실물 텍스트를 못 봤다. 영준님이 아미큐 앱을 열면 업데이트 프롬프트가 뜨는 구조 — 열어봤는지, 설정탭이 의도한 형식으로 뜨는지 확인 필요.
- **★아미큐 백엔드(cst-input/backend/app.py) — 이번 세션 다수 반영, 전부 main에서 직접 작업**:
  - `BUSI_NUM` 25년도(C11G250023)→26년도(202651005002) 전환, `/api/config`에 `WORKER1/2/3_NM`·`BUSI_NM` 실측 매핑 추가(getUserList DEPT1=3970&FLAG=M10 + BLON_CL_CD=='20' 필터로 KDN 실직원명단 확정, getBusiList로 공사명).
  - `pull_workgroup()`의 `except: pass` 실패은폐 문제 — 성공/실패 전부 로그로 남기게 수정. (2026-07-22 구현된 pull_workgroup·config persist 자체가 그동안 **미커밋 상태로 방치**돼있던 것도 이번에 커밋 정리)
  - **awms 신규필드 `BUILTIN_YN`(=사전체결여부, 영준님 확정) 항상 `N` 고정** — `_MASTER_BASE`에 리터럴 추가, `_common()` 공유라 마스터/슬레이브 자동커버. **실등록 검증은 안 함(지시) — 다음 실작업 때 자연확인.**
  - **OCR 실패표본 자동수집 신규 구현** — `/api/ocr` 계기번호 추출 실패 시 사진+원시라인을 `research/ocr_poc/계기번호_아미큐_실패건/pending/`에 저장, saveAct 제출 시 같은 사진(픽셀 SHA256 — EXIF 스탬프와 무관하게 불변 실측확인)을 매칭해 `labeled/`로 이동. 계약(스키마=ocr-meter/쓰기=통신팀) `docs/data-contract.md` 등재완료. 전 구간 예외격리, pending 14일 만료. **다음: ocr-meter가 `harvest_trainset.py`를 두번째 소스로 확장하는 건 표본이 쌓인 뒤(그쪽 소관, 대기만 하면 됨).**
  - ★**구조 이슈**: 이 파일은 tongsin(통신팀) 워크트리에도 사본이 있는데, 이번 세션 변경은 전부 **main 경로에서만** 이뤄져 tongsin 사본이 상당히 stale하다(pull_workgroup/config persist/OCR표본/BUILTIN_YN 전부 없음). 다음 세션 착수 전 main 기준으로 볼 것 — tongsin 사본을 어떻게 정리할지(동기화 or cst-app처럼 "공유경로+단독소유"로 전환)는 PM 판단 필요.
  - 재구동: `launchctl kickstart -k gui/$(id -u)/com.ami.cst-backend`(launchd KeepAlive, `bash start.sh` 대신 이걸로 충분 — 터널은 `com.ami.cst-tunnel`이 별도 관리).
  - awms 신규필드 조사 중 발견한 미확정 잔여: `GAETONG_YN`(getMainList전용, 값="개통") 정체 불명 — 사전체결여부는 아닌 걸로 확정됐으나 뭔지는 모름. **범위 아님, 손대지 말 것.** 그 외 안전정보류 클러스터(`DANGER_INFO_SEQ`/`NEAR_ROAD`/`GOSO_LOCA` 등, 전부 빈값)도 범위 아님.
- **아미큐 큐 담기 크래시 (LTE+기설+슬레이브) — 관찰 상태, 재발시 logcat 필요**: v2.2.5 OOM 픽스로 근접 원인 일부 해소 가능성 있으나 미확정. 재발 시 A33 USB/adb로 logcat 확정.
- **아미큐 변대주 DATA_NUM 재전송 — 실검증 대기(2026-07-15부터)**: backend 수정은 반영됐으나 현장 재전송 결과 미확인.

## 대기 액션 (영준님 확인 필요)
- **★ 아미큐 v2.2.7 실기 확인** — 앱을 열어 업데이트가 설치됐는지, 설정탭이 "26년 AMI 통신망 보강공사_강북" / "장진교 (20118)" 형식으로 뜨는지, 이력 탭 삭제버튼이 잘 보이는지 확인 부탁.
- **★ A33 adb 접근** — USB 연결 또는 무선디버깅 현재 IP:포트 필요(포트가 토글마다 바뀜). 실기 확인·logcat·직접 install 필요할 때마다 막힘.

## Firebase 요금제/사용량
- ami-work Storage 안 씀(사진은 ami-jongno만, 계기팀 소관).

## 핵심 규칙 (사고 방지 — 영구)
- **awms 맥변경 = 모뎀 재결합(saveAct 아님), 마스터 먼저.** 통신팀(mob/cst)/계기팀(mob/mtr) 별개·교차호출 405. 모뎀맥·마스터/슬레이브는 통신팀 전용. → `awms_API_레퍼런스.md` 8.5.
- **계기큐 코드수정 = ami-work/awms-queue-www push**(APK빌드 아님, USB 불필요). 네이티브(카메라/파일선택)만 빌드.
- **종로팀 awms 아이디 = mdp2504271 전용 고정**(2026-06-26 확정) — 중구가 **별도 아이디 발급**받기로 해 같은아이디 공유 종료. 봉인차수 전환 불필요(종로 봉인차수=22차 397820263291 고정). 계기큐 [종로구]/[중구] **토글 제거**(v0626a). 공유시절 전환버튼(v0623a)·봉인 백업/원복 운영은 종료. 옛 종로 awms아이디=mdp2504381. ※봉인값(METR_SEAL_VAL)·차수(LV_CONS_NO)는 계정전역이라 한 계정 내선 그대로 이어짐(계기큐 빌더가 활성봉인차수 따라감, awms-saverow.js:651).
- **계기큐 백그라운드 일괄등록 = awms fetch 오버레이로 해결**(APK). 다른앱 쓰며 등록 OK. ★단 배치 중 계기큐를 최근앱서 스와이프 종료 금지(Activity 죽으면 오버레이도 죽음). → [[awms_queue_webview_visibility_freeze]].
- **종로맵 배포 시 APP_VERSION 갱신**(map.html/stats.html 통일) — 안 하면 옛화면 잔존.
- **★Pages 배포 = APK·웹무관 제외 (2026-07-06)**: ami-work `pages.yml`이 `*.apk`·research/·worker/·design/·scripts·`*.py`·`*.xlsx`·ami_data_coords.json 제외(artifact 122MB→~25MB, "Deployment failed try again later"=CDN sync 타임아웃 근본해결, 지메일 실패알림 스팸 원인). **APK는 pages 아니라 `raw.githubusercontent.com/815dudwns/ami-work/main/파일명.apk`로 받음**(자동업뎃 apkUrl도 raw). 종로보조앱 자동업뎃만 예외=snap-version.json+apk/(pages). ★배포 실패 시 `rerun --failed`는 artifact 중복(count 2) 유발 → **빈 커밋 fresh run**으로 재배포.
- **★작업앱(접근성/오버레이) = 금융앱 피싱탐지에 악성 오탐**: 토스 피싱제로가 헬퍼·아미큐·계기큐·OTP수집기(접근성/오버레이/알림접근 씀)를 원격제어 사기앱 패턴으로 감지→삭제권고+송금제한. MCS보조앱(snap)·웹앱(종로맵/아미맵)은 접근성 안 써서 무관. **작업폰/금융폰 분리가 근본**(작업자 폰 1대라 어려움). 영준님 "냅둬"(2026-07-07, 대응 보류).
- **TOU = 정적파일(data/tou-data.json), Firebase 아님 — push로 반영.**
- **★site-data.json 변경 시 `python3 scripts/gen_site_version.py` 필수**(Part2 캐시-우선 로더 — 안 하면 작업자 폰 옛 IDB캐시 유지). → [[amimap_part2_sitedata_cache]].
- **아미맵 마커 = 좌표 기준 그룹핑**(같은 좌표 여러 지번 1마커, 재건축 한건물 통합). 완료 시 구성 지번 전부 기록. → [[amimap_marker_coord_merge]].
- **종로맵 검침값 입력규칙** — 자릿수 단상(17/19/25/26/27/53)5·나머지6, 최대전력만 7(4자리.2자리), 순서 주·야·무효·최대, 소수칸 inputmode=decimal, 최대전력≥10000 저장경고. 최대↔무효 작업자혼동 빈발. → [[jongno_reading_input_rules]].
- **28(완료) 되돌리기 불가**(계기팀). 통신팀은 전송 전이면 삭제·수정 자유.
- **주소상태(workStatus)는 무조건 Firebase.** 종로DB=ami-jongno.
- **★실효계기 데이터 단일원본 = `data/site-data.json`(아미맵 직접). stats 분모 = `data/stats-site-index.json`(정적). Firebase siteData(charger4eleccar)는 아미큐 조회용.** site-data.json 갱신 시 **`gen_site_version.py`(폰 IDB캐시) + `gen_stats_index.py`(stats 분모)** 실행. ★★`upload_sitedata.py`는 **없는 스크립트**(옛 기록 오류) — Firebase siteData 갱신은 REST PUT 수동이고 아미큐 영향이라 신중(2026-07-05 재구성 시 Firebase는 26,588 유지). ★★`gen_stats_index.py`는 2026-07-05부터 **Firebase 아닌 로컬 파일 합산**(site-data.json + `site-data-completed-archive-*.json` + rework-data.json). → [[실효계기_엑셀_라이프사이클]]. **종로/철거 대조 키=고객번호(계기번호는 교체로 바뀜).**
- **ami-work/jongno 코드는 PM 직접 수정**(에이전트 권한거부). 계기큐 APK는 빌드 가능.
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감.
- **AUTH/FORCE_LOGOUT_VERSION 평소 배포에 건드리지 말 것** — 잦은 범프가 "앱 초기화" 원인 [[ami_work_init_logout_fix]].
- **awms 로그인 OTP 자동입력** = 카톡 OTP를 네이티브 접근성 서비스가 읽어 webview에 입력. 헬퍼=자기앱 내장 / 아미큐=재빌드 시 내장 / 계기큐=A31 별도수집기→Firebase→inject 폴링. 로그태그 `AWMS_OTP`(수집기 `OTPCOL`). 전부 [[awms_otp_amiqueue_embed]].
