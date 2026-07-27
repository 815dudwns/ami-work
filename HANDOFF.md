# HANDOFF — 계기팀 데스크(gyegi) / 종로맵·계기큐·snap·명륜·구로 + 공통 참조

> ★ **이 문서는 영구 상태판이다. 휘발성 세션 진행메모를 여기 쓰지 말 것** — 작업 디테일·과정은 메모리(`~/.claude/.../memory/`)와 `research/` 문서에 남긴다.
> **완료·배포·검증된 건 여기 남기지 말고 즉시 지운다**(상세는 옵시디언 로그·메모리). 남기는 건 **미완 트랙·대기 액션·핵심 규칙**뿐.
>
> 앱 통칭 [[app_naming_convention]]. 배포 시 APP_VERSION 갱신 [[jongno_app_version_deploy]]. 종로맵=Naver Maps.
> **awms API 모를 때 = `research/awms-poc/awms_API_레퍼런스.md`. 통신팀(mob/cst)/계기팀(mob/mtr) 별개 — 항상 구별.**

## ★ 작업 경로 · 소유 (2026-07-27 PM 결정)
- **jongno-combined는 ami-work git에 없는 별개 repo**(github.com/815dudwns/jongno-combined, ami-work `.gitignore` L46). **gyegi 브랜치로 체크아웃 불가.**
- **독립 repo는 worktree로 쪼개지 않고 main 경로에서 소유 데스크가 직접 작업**한다. 종로맵·snap 작업 경로 = `/Users/woodelight/Projects/ami-work/jongno-combined` (계기팀 단독 소유). 커밋은 그 repo 자체 브랜치(main), gyegi 브랜치와 무관.
- 착수 전 반드시 `git status` — 타 세션 미커밋 변경(예: `admin-validate.html`=검증팀 소관)을 **내 커밋에 딸려 넣지 말 것**.
- gyegi 워크트리(`workspaces/gyegi`)에 있는 것 = ami-work 추적분(계기큐 `awms-queue-www` 등). 종로맵은 여기 없다.

## 다음 할 일 (바로 집을 것)
1. **종로맵 임시 노란마커 코드 회수** — 2026-07-27 하루짜리 기능. 날짜 게이트(`TEMP_LASTDAY_DATE='2026-07-27'`)로 **7/28부터 자동 비활성**이라 동작상 급하지 않으나, 죽은 코드로 남아 있다. 회수 대상 = `jongno-combined/js/map.js`의 `[임시 2026-07-27]` 주석 3곳(`meterLastDayAddresses`·`_commActiveClass`·`MARKER_FILL`/`CIRCLE_CLASSES` 항목) + `css/marker.css` 2곳. 회수 시 `_commActiveClass`를 원래 삼항식으로 되돌리면 됨(호출부 2곳).
2. **아미큐 저장값 진단 — main 미머지 상태 해소**(아래 트랙 참조). 폰 실측이 막혀 있어 공사명 필드 확정이 진행 불가.
3. 구로 잔여·보강현황 재산정 등은 아래 대기 액션.

## 진행중 트랙

- **★아미큐 awms 저장값(작업자·공사명) 미수신 — 진단코드 작성됐으나 폰에 안 올라감 (2026-07-27)**
  - **증상**: 아미큐가 awms에 저장된 작업자·공사명을 못 받아옴. 앱에는 숫자(SEQ)로만 보임.
  - **원인 분석(PM 세션 조사, 미수정 인계)**: ①작업자 — `ami-queue-www/collect.js` `_amiqAutoLoad`가 `getUserWorkGroup`의 SEQ를 `_amiqWorkerList`(`getUserList?DEPT2=<현재지사>`)에서 이름 매핑하는데, **SEQ가 현재 지사 명단 밖이면 매핑 실패 → 이름 빈문자열 → 숫자만 남음**. 실패가 조용해서 "값이 없음"과 "매핑 실패"가 구분 안 됨. ②공사명 — **`getUserWorkGroup` 응답의 공사 필드를 아예 안 읽는다.** `getBusiList` 목록에서 `/^C/` 첫 항목을 임의 선택하고, 그것도 `!s.busiNum`일 때만이라 한 번 값이 박히면 갱신 안 됨. ③백엔드 `cst-input/backend/app.py` `pull_workgroup()`도 WORKER1/2/3_SEQ만 반영, BUSI_NUM은 CONFIG 기본값 고정.
  - **통신팀 작업분**: 사전설정 화면에 `getUserWorkGroup`·`getBusiList` 원시응답 키=값 진단 섹션 추가(SEQ→이름 매핑 실패 시 사유 명시). 공사명 자동매핑은 **의도적으로 미착수**(필드 실측 확정 전 추측 매핑 금지). APP_VER `v0727a-저장값진단`, **tongsin 브랜치 커밋 4da495a1 push 완료**.
  - **★블로커**: 아미큐 www는 `https://815dudwns.github.io/ami-work/ami-queue-www/collect.js` 원격로드 = **ami-work Pages(소스 브랜치 main)**. tongsin 브랜치에만 있어 **main 미머지 → 라이브 미반영**(라이브 `app.js` APP_VER은 아직 `v0614f-여러그룹`, 라이브 collect.js에 진단코드 0건). 폰에서 사전설정을 열어도 진단 섹션이 안 보인다.
  - **추가 확인 필요**: ami-work Pages **legacy build API가 2026-07-02부터 `errored`("Page build failed")**. jongno-combined는 Actions 워크플로우로 정상 배포되는데 ami-work도 같은 방식인지, 머지해도 실제 배포되는지 확인 필요.
  - **다음**: main 머지 → 라이브 반영 확인 → 폰 사전설정 열어 **공사명이 어느 필드인지 실측 확정** → 확정 후 통신팀이 자동반영 로직 추가.

- **★Tailscale 인프라 전환 (2026-07-19 개시)**: tailnet=맥(100.121.228.87)+A33+아이폰. **남은것**: start.sh tailnet 발행 영구화(지금은 재기동 시 trycloudflare 복귀=안전폴백), 검증관리자 8765 tailnet화, A31 적용(주인협조 1회). 아미큐 맥세션 로그아웃=8766 `/api/session/push`에 무효 JSESSIONID(시크릿 cst-amiq-2026). ★폰 Tailscale VPN 상시 ON 필수 — 꺼짐=접속불가. [[tailscale_adoption]] [[otp_adb_notification_read]]

- **★조직 배선 (2026-07-19~) — 정본 `research/조직배선_설계_20260719.md`**: 3팀 = 통신팀(아미큐·헬퍼·아미맵) / 계기팀(계기큐·종로맵+snap·명륜·구로·OTP수집기) / 검증팀(검증관리자·데일리검진) + ocr-meter + PM. 팀 표준=`.claude/agents/<팀>.md`(git 추적 필수 — 2026-07-23 untracked 유실 사고). **PM간 통신=Orca terminal send**(핸들 매번 재조회, TUI엔 orchestration inject 유실). **남은것**: 검증팀 실무 인수인계 PM 검수, agent-memory/ 축적 확인. ★세션 삭제 절대금지(닫기만) — 경로 공유 형제 세션 전멸. [[org_three_teams_wiring]] [[pm_comm_orca_mailbox_deprecated]] [[team_desk_report_pm_only]]

- **★F. 계기큐 맥 이식(전송탭) — 배선 완료, awms 라이브 실등록만 남음 (2026-07-17)**: 검증완료→전송탭→awms전송→완료표시→큐정리. 백엔드 `research/admin-validation/backend/awms_mtr_direct.py`(맥이 mob/mtr 직접호출), app.py `/transmit/run` `exec_mode=direct`, 전송탭 프론트 build 1800. **awms 라이브는 배선검증 모드**(session_alive만 확인, 실등록 안 함).
  - **남은것**: awms 로그인 개방 후 게이트 순서 = G1 더미(0999) 1건 → G2 실계기 1건(28+사진+필드대조) → G3 소배치. 실등록 시 `exec_mode` 기본 direct, `live:true`. **봉인 다음=315699**(DB 전역최대+1, width6). 관문 때 카톡 OTP adb 직독 실물검증 병행.
  - **봉인 규칙**: 계정 무관 **전역 물리 시퀀스**, `seal_last` 1개 기억(config+Firebase awms_seal max), **zfill 보존**('0111111'), 단상+1/삼상+2. 불일치 시 [봉인 동기화](`/transmit/seal-sync`). [[awms_seal_real_range_rule]]
  - **세션 전송 툴(확정, 착수 대기)**: 계기큐 APK에 네이티브 쿠키 브릿지+로그인성공 자동 push(`/transmit/push-session`, 받는쪽 완성). 계기팀 폰=tailnet 밖이라 공개터널+Firebase 자동발견. **APK 재빌드+계기팀 폰 1회 재설치 필요.**
  - **P0 자동검증 워처 = jongno ON**: 근무 08~20시 매시간 daily_cycle 자동검진, config 저장이라 재시작 생존. 상태 `GET /transmit/auto-validate?dataset=jongno`, 로그태그 `[autoval]`.
  - ★백엔드 재시작 = `lsof :8765 kill` + `start.sh`(launchd KeepAlive라 kill만 해도 새 코드로 재기동). `--reload` 없음. → [[metercq_mac_session_direct]] [[validate_portal_location_and_workflow]]

- **★검증관리자 데이터워크벤치 (1~4단계 배포완료, 5단계 남음)** — 정본 `research/admin-validation/데이터그리드_재설계.md`. **5단계 awms 등록=옆 세션 담당**. ★`daily_cycle.py`는 git 미추적(파일·실행엔 반영). [[validate-workbench-redesign]]

- **★사진 유실방지 — 미적용분(TODO)**: ①보조앱↔계기맵 연동 누락 — `_temp/` Storage 영구종속(흡수 시 URL만 복사)·당일 미흡수 temp 이튿날 소멸·snap/메인 seq 계산 불일치·저장 시 temp 통째삭제 ②보조앱(snap) 자체 IDB큐. research 3문서: `종로맵_웹사진_누락분석.md`·`보조앱_계기맵_연동_누락분석.md`·`OCR자동_검증자동_체인분석.md`. (종로맵 웹사진 IndexedDB 대기큐 `js/photo-queue.js`는 배포완료)

- **★D/G. 아미큐(통신팀 cst-app) — 남은 라이브/폰 검증**: ①신설/기설 M1030 실전송 미실측 ②슬레이브 라이브 saveAct BUNGI/INST_S 재조회 확인 ③awms 라이브 saveAct는 더미(0999)로만 실증 ④라이브 verify(실 getMainList 매칭) 미검증.
  - ★아미큐 실사용=**cst-app 네이티브(CollectScreen.kt)**, `cst-input/collect.js`(웹)는 안 씀 — 웹 고쳐도 반영0(반나절 삽질). [[amiqueue_native_meter_qr]]
  - **★변대주(DCU_ID) = 필드명 `DATA_NUM`이 정답**(DCU_ID 아님). backend app.py dc19c8ad 수정+재구동 완료, **재전송 실검증 대기**. 슬레이브 6개(79190494164 등)는 이미 DCU_ID로 잘못 등록→getDetail 막혀 API 정정 불가, 헬퍼/CDP 수정 필요. [[amiqueue_bdju_dcuid_rule]]
  - **헬퍼 바코드 Code93 추가 미착수** — 추가하면 inject v84 원복 불필요. [[mlkit_barcode_code93]]
  - ★`cst-input` backend(8766)도 `--reload` 없음 → 코드수정 시 재구동 필수. 안 하면 옛 코드로 계속 돔(변대주 안 올라간 원인).

- **E. status 지역별 부분로딩 (quota 근본해결, 영준님 지시 2026-06-22, 미착수)** — 아미맵·종로맵 workStatus를 구(동그룹) 단위로 쪼개 저장 → 선택 구만 로딩 + 이벤트 증분. **Firebase workStatus 구조 재편 + 기존 상태 마이그레이션** 필요 → **맥에서 설계·검증 후 배포**(영준님 "배포만 하지말것"). 필터는 데이터 `동그룹` 필드(map.js:560).

- **★OTP수집기(A31) — 2건 미해결**: ①**카톡 자동진입 간헐실패** — 알림패널은 열리나 KDN노드 클릭→카톡 간헐실패, 수동클릭=정상 → 케이스A(그룹접힘/미리보기숨김으로 KDN 텍스트노드 실종) 유력. A31/A33 USB `OTPCOL` logcat으로 A/B 확정 후 수정. ②**awmsID 저장 미반영** — A31에 mdp2603726 설정했다는데 Firebase `awmsOtp`엔 옛 mdp2504381(읽기실패 유력). A31=남의폰 USB불가 → 진단버전(Firebase 브레드크럼)+인앱자동업뎃으로 원격진단 제안. ★네이티브라 자동배포X, APK 수동설치(`~/Projects/awms-otp-collector`, git 아님). [[otp_collector_kakao_autoclick_intermittent]]

- **★`.git` 517MB 히스토리 정리 미착수** — data 백업 커밋 누적. git filter-repo로 정리하면 clone·배포 근본 경량화. (Pages Actions 전환 자체는 완료되어 push=자동배포 안정)

## 대기 액션 (영준님 결정/확인 필요)
- **★보강현황 정기 반영 = 엑셀 올 때마다 재방문 재산정**: **다음 엑셀 오면 재산정**(그동안 LP 올라온 건 한전이 대상서 뺌→자동 제외). 정합성 게이트 먼저(지사↔주소구 일치율, 90%+ 합격) [[boranggi_excel_integrity_gate]]. **재방문 정의 = 완료했으나 LP 미수신 = 모뎀 슬레이브 재등록 누락**. Firebase siteData(26,588)는 아미큐 영향 때문에 미갱신(아미맵/stats는 로컬 기준). [[boranggi_pipeline]] [[실효계기_엑셀_라이프사이클]]
- **★구로(구로금천) 잔여**: ①차수 미매칭(9차수 통합 재산정, 미매칭 18건 site-data 부재분 제외) ②삼상 계기 검침값이 차수엑셀에 단일값뿐 → `whme_day`만 채움(4필드 미완) ③잔여 ?좌표 1건(금천 시흥동 138-5, 폐지번) ④**구로 작업자 계정 미발급** — 발급 시 auth.js ACCOUNTS에 `region:'guro'` ⑤구로 차수 4개(5·14·15·18차)가 완료분 전부라는 전제로 마킹(더 있으면 hold 111주소 중 일부가 complete). [[jongno_multiregion_structure]]
- **★한전 데이터 열람 포털 자동화 (미조사)** — awms 아닌 별개 웹포털. 권한자(김창숙 사장님) OTP로 열어줌 → 세션쿠키 이식(권장 A=직접 로그인+OTP실시간). **30분 sliding세션 → keep-alive 필수**(25~28분 heartbeat). 스켈레톤 `research/kepco-portal/kepco_API_레퍼런스.md`. 준비물=포털URL·로그인방식·데이터·세션방식. [[kepco_portal_session_automation_idea]]
- **★22차 중복 관철동 11-14(02470001147) awms 관리자 삭제요청** — 완료(28)+작업자권한이라 현장삭제 불가, **한전 관리자 삭제 필요**. 보고문 작성됨.
- **★옵시디언 Obsidian Git 자동백업 설정 + 폰 옵시디언 repo 연결** (영준님 직접). ★`js/auth.js` 평문 클라이언트 인증 = 이미 노출, 서버인증 전환 별도과제.
- **Firebase 요금제 — Spark 복귀 여부 미확인**: 무료체험 크레딧(`01214A-10A39B-960378`) 7/2 종료 예정이었음. 현재 요금제 상태 확인 필요. DB 이전(B안)은 안 함(리스크 과다). ★비용 주범=RTDB catch-up 풀다운 → P1 델타화+P3 주간아카이브 배포됨(라이브 6.73→1.73MB). [[firebase_cost_rtdb_catchup]]

## 후처리 자동화 (`/daily-analysis` 스킬 — 진행중)
- 스킬 `~/.claude/skills/daily-analysis/SKILL.md`. 파이프라인 **데이터검증→need_human→후처리→엑셀/사진zip→awms**. 문서 `research/후처리_자동화_기획.md` [[postprocess_automation_plan]]. `research/ocr_poc/daily_cycle.py`=수집·검진.
- **★5단계 순서(영준님)**: 누락정리→(작업자)채우기→정합성→OCR→need_human. **OCR부터 달려들지 말 것. 데일리=오늘거 기준만**(옛 타일 draft 섞지 말 것). A그룹(채울것)/B그룹(디스플레이오류·조회불가=못채움→임시저장 두고 넘어감).
- **★daily_cycle 3단계 순서**: `--date`(PARSeq 1차)→`--sonnet`(구글비전+YOLO 2차)→`--review --upload --date`. **--sonnet 빠뜨리면 need_sonnet이 구글비전 미경유로 리뷰 통째 유입**(6/19 사고).
- **★awms 필드없음 케이스**: 한전조회 1필드인데 실제 2종 4필드 넣어야 하는 계기 → awms 전송불가. **비고 "awms 필드없음" + 추가데이터 엑셀 별도.** **TODO: 종로앱 추가데이터 입력UI에 야간·무효·최대 필드 추가**(지금 1필드).
- 계약종별·계약전력은 `jongno-combined/data/jongno-site-data.json` 계기객체에 있음(workStatus/replacement_list엔 없음). 검침 필드법칙=readingFieldsFor(계약종별+계약전력).
- need_human은 데이터검증 페이지 딥링크로 일원화(`admin-validate.html?auth=admin&dataset=jongno&date=YYYYMMDD&review=need`). 영준님 퇴근길 선호 = `--review --upload` 리뷰HTML URL(같은 노드라 동기화). [[validate_sync_daily_val_node]]

## 종로 보조앱(snap) — 미완 항목만
> 2인1조 사진분담 컴패니언. [[jongno_snap_companion]] + `jongno-combined/research/보조앱_snap_설계.md`
- **★GATE: 전파불량 배경 업로드 미실증** — 네트워크 차단→촬영→화면끄기→복구 시 배경 자동업로드. adb 네트워크 차단으로 재현 가능. (평시 즉시업로드는 실기 확인됨)
- **정밀리뷰 잔여**(`scratchpad/snap-review-20260719.md`): ①저장 시 temp 통째삭제→흡수 필드만 삭제 ②흡수 `tempPhotos/jongno` 하드코딩(구로 흡수불가, 구로 확장 전 RG 변수화) ③검침값 temp행 영영 미흡수(모달 재오픈 필요).
- **검침값 사진 늘림(4필드) — 조사완료·미구현**: 현재 snap=철거 검침 1칸(주간)뿐. 영준님 결정=**매칭계기는 계약정보로 자동판별, 미리찍기는 모드토글**. 순서 ①메인앱 `replacement-modal.js:1253` payload에 `계약종별`·`계약전력` 저장 → Firebase 1건 검증 → ②snap utils.js import + readingFieldsFor + 모드토글 + temp 스키마 필드별(`removal_photos[fid]`/`removal_values[fid]`, **구 단일 `removal_photo`는 firstActive 하위호환**) ③`prefillTempForSeq` 다필드 순회. ★새 슬롯에 실패/재전송/job-status UI 만들지 말 것(GATE 밖).
- 시트 삭제메뉴(없음=촬영/앨범, 있음=+삭제[temp만·부모보호·슬롯단위], 실패=재전송/촬영/앨범) **미구현** — GATE 검증 후.
- **폰 실기 미검증**: QR카메라 화질·인식률.
- ★**보조앱은 들어낼 수도 있음(영준님)** — 통합 깔끔히 제거 가능하게. 메인앱 흡수로직은 snap 없으면 no-op이라 무해.
- ★**로컬번들**: jongno-snap은 server.url 없음 → snap.html 변경은 **github push로 폰 반영 안 됨**. `cp jongno-combined/snap.html → jongno-snap/android/app/src/main/assets/public/index.html` + `assembleDebug` + `install -r`(`~/Projects/jongno-snap/deploy.sh RFCT710YTFW`) + 재시작. cap sync 금지. ★APP_VER(JS상수)이 자동업뎃 비교기준 → 범프 시 3곳(APP_VER+라벨2) 다 갱신(안 하면 무한업뎃).

## 블로커
- **★아미큐 진단코드 main 미머지 → 폰 실측 불가** (위 트랙 1번). ami-work Pages legacy build `errored`(2026-07-02~) 동반 확인 필요.
- **★아미큐 변대주 DATA_NUM 재전송 실검증 대기** — backend 재구동됨, 현장 재전송 결과 미확인.
- **아미큐 큐 담기 크래시 (LTE+기설+슬레이브) — 관찰로 하향**: v2.2.5 스트리밍+catch(Throwable) 반영. 재발 시 A33(RFCT710YTFW, USB 가능)으로 logcat 확정. 근본=사진 파일분리 TODO. [[amiqueue_queue_oom_crash]]
- (제주 완료0 / 종로 미연계 = 영준님 지시로 제외)

## 핵심 규칙 (사고 방지 — 영구)
- **★독립 repo(jongno-combined)는 main 경로에서 소유 데스크가 직접 작업.** worktree로 쪼개지 않는다. 착수 전 `git status`로 타 세션 미커밋 변경 확인 — 남의 파일 딸려 커밋 금지. (2026-07-27 PM 결정)
- **★팀 데스크 = 작업 + PM 보고만.** PM을 추측해 복수 터미널에 발송 금지. 배포·타팀 지시는 PM 경유. [[team_desk_report_pm_only]]
- **awms 맥변경 = 모뎀 재결합(saveAct 아님), 마스터 먼저.** 통신팀(mob/cst)/계기팀(mob/mtr) 별개·교차호출 405. 모뎀맥·마스터/슬레이브는 통신팀 전용. → `awms_API_레퍼런스.md` 8.5.
- **계기큐 코드수정 = ami-work/awms-queue-www push**(APK빌드 아님, USB 불필요). 네이티브(카메라/파일선택)만 빌드. **아미큐 www도 원격로드 = Pages 소스 브랜치(main)에 있어야 반영된다.**
- **종로팀 awms 아이디 = mdp2504271 전용 고정** — 중구 별도 아이디 발급으로 공유 종료. 종로 봉인차수=22차 397820263291 고정. 계기큐 [종로구]/[중구] 토글 제거(v0626a). 옛 종로 awms아이디=mdp2504381. ※봉인값(METR_SEAL_VAL)·차수(LV_CONS_NO)는 계정전역.
- **계기큐 백그라운드 일괄등록 = awms fetch 오버레이로 해결**(APK). ★배치 중 계기큐를 최근앱서 스와이프 종료 금지(Activity 죽으면 오버레이도 죽음). [[awms_queue_webview_visibility_freeze]]
- **종로맵 배포 시 APP_VERSION 갱신**(map.html/stats.html 통일) + `?v=` 캐시버스트 + **메뉴 하단 버전라벨** 3종 함께. 안 하면 옛화면 잔존. 배포 보고 시 버전 표시(영준님이 폰 버전으로 새코드/캐시 판별). [[push_show_version]]
- **★Pages 배포 = APK·웹무관 제외**: ami-work `pages.yml`이 `*.apk`·research/·worker/·design/·scripts·`*.py`·`*.xlsx`·ami_data_coords.json 제외. **APK는 pages 아니라 `raw.githubusercontent.com/815dudwns/ami-work/main/<파일>.apk`**. 종로 snap 자동업뎃만 예외(snap-version.json+apk/). ★배포 실패 시 `rerun --failed`는 artifact 중복 → **빈 커밋 fresh run**으로 재배포.
- **★작업앱(접근성/오버레이) = 금융앱 피싱탐지에 악성 오탐**: 토스 피싱제로가 헬퍼·아미큐·계기큐·OTP수집기를 원격제어 사기앱으로 감지→삭제권고+송금제한. 영준님 "냅둬"(대응 보류).
- **TOU = 정적파일(data/tou-data.json), Firebase 아님 — push로 반영.**
- **★site-data.json 변경 시 `gen_site_version.py`(폰 IDB캐시) + `gen_stats_index.py`(stats 분모) 필수.** ★`upload_sitedata.py`는 **없는 스크립트**(옛 기록 오류) — Firebase siteData 갱신은 REST PUT 수동이고 아미큐 영향이라 신중. ★`gen_stats_index.py`는 Firebase 아닌 **로컬 파일 합산**(site-data.json + `site-data-completed-archive-*.json` + rework-data.json). **종로/철거 대조 키=고객번호**(계기번호는 교체로 바뀜). [[실효계기_엑셀_라이프사이클]]
- **아미맵 마커 = 좌표 기준 그룹핑**(같은 좌표 여러 지번 1마커, 재건축 한건물 통합). 완료 시 구성 지번 전부 기록. [[amimap_marker_coord_merge]]
- **종로맵 검침값 입력규칙** — 자릿수 단상(17/19/25/26/27/53)5·나머지6, 최대전력만 7(4자리.2자리), 순서 주·야·무효·최대, 소수칸 inputmode=decimal, 최대전력≥10000 저장경고. 최대↔무효 작업자혼동 빈발. [[jongno_reading_input_rules]]
- **28(완료) 되돌리기 불가**(계기팀). 통신팀은 전송 전이면 삭제·수정 자유.
- **주소상태(workStatus)는 무조건 Firebase.** 종로DB=**ami-jongno**(ami-work 아님). 통째삭제 보호규칙 적용(2026-07-13).
- **종로 workStatus 주소키 제약** — 주소당 meter_state 1개라 **완전완료만 complete, 일부완료는 hold(파랑)**. [[jongno_workstatus_address_key_partial]]
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감. 삭제 시 `replacement_list`에 worker≠awms·사진 있으면 삭제 금지. [[jongno_delete_protect]]
- **AUTH/FORCE_LOGOUT_VERSION 평소 배포에 건드리지 말 것** — 잦은 범프가 "앱 초기화" 원인. [[ami_work_init_logout_fix]]
- **awms 로그인 OTP 자동입력** = 카톡 OTP를 네이티브 접근성 서비스가 읽어 webview 입력. 헬퍼=자기앱 내장 / 아미큐=재빌드 시 내장 / 계기큐=A31 별도수집기→Firebase→inject 폴링. 로그태그 `AWMS_OTP`(수집기 `OTPCOL`). [[awms_otp_amiqueue_embed]]
- **Firebase Storage 사진 자동삭제 금지** — 증거물, lifecycle 삭제 X. 정리는 수동만. [[firebase_storage_no_autodelete]]
