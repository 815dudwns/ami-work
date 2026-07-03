# HANDOFF — ami-work(아미맵) / jongno-combined(종로맵) / 계기큐·아미큐·헬퍼

> ★ **이 문서는 영구 상태판이다. 휘발성 세션 진행메모를 여기 쓰지 말 것** — 작업 디테일·과정은 메모리(`~/.claude/.../memory/`)와 `research/` 문서에 남긴다.
> ami-work 세션이 여러 개라 충돌하므로, HANDOFF는 **잘 안 바뀌는 것**(미완 트랙·대기 액션·핵심 규칙)만 단일 권위로 유지한다. **완료·배포·검증된 건 여기 남기지 말고 즉시 지운다**(상세는 옵시디언 로그·메모리).
>
> 앱 통칭 [[app_naming_convention]]. 배포 시 APP_VERSION 갱신 [[jongno_app_version_deploy]]. 종로맵=Naver Maps.
> **awms API 모를 때 = `research/awms-poc/awms_API_레퍼런스.md`. 통신팀(mob/cst)/계기팀(mob/mtr) 별개 — 항상 구별.**

## 진행중 트랙
- **★배포 방식 전환 완료 (2026-07-02) — 이제 push=자동배포 안정**: legacy GitHub Pages가 `deployment_queued` 데드락(종일 실패 원인 = `.git` 517MB가 배포 artifact 463MB로 담겨 deploy 타임아웃) → **jongno-combined·ami-work 둘 다 GitHub Actions Pages 워크플로우로 전환**(`.github/workflows/pages.yml`, `concurrency: cancel-in-progress` + checkout 후 `rm -rf .git`). `.nojekyll`·data/백업 배포제외도 함께. ami-work remote URL 옛 PAT(ghp_)→gh인증(gho_) 교체로 workflow 파일 push 가능. **★근본: `.git` 517MB 히스토리 정리(data 백업 커밋 누적) 미착수** — git filter-repo로 정리하면 clone·배포 근본 경량화. GitHub 지불문제 아님(Gmail 확인).
- **★검증관리자 데이터워크벤치 재설계 (2026-07-02, 1~4단계 배포완료)** — "검증 전용"→**데이터가 주인공인 워크벤치**. 정본 `research/admin-validation/데이터그리드_재설계.md`. ①정합성 on-read(`backend/validation_rules.py`: workStatus 최신 검침값으로 status 재판정 → worker_missing 실시간 auto/need 해소, human/kepco 보존. app.py `_attach_photo_urls`에 통합) ②신설번호 workStatus 단일진실(스왑 시 CSV 수동교정 불필요) ③문제만·차수(cha)·검증대기 필터 ④OCR 자동토글(`_maybeAutoOcr`, 갭2=실패 재시도가드/갭3=자동 전체범위 수정). 탭 '검증'→'데이터'. **5단계 awms 등록=옆 세션 담당**. ★백엔드 app.py는 uvicorn `--reload` 없음 → 재시작 `lsof :8765 kill`+`start.sh`(터널 별개라 URL 유지). daily_cycle.py는 git 미추적(파일·실행엔 반영). [[validate-workbench-redesign]]
- **★사진 유실방지 (2026-07-02)** — 종로맵 웹사진 **IndexedDB 대기큐 배포완료**(`js/photo-queue.js`: onPhotoSelect 압축직후 put→onSave 성공시 delete→initMap `drainPhotoQueue` 복구배너. 촬영본이 메모리에만 있어 백그라운드freeze/OS킬 시 소실되던 문제). **미적용(TODO)**: ①보조앱↔계기맵 연동 누락 — `_temp/` Storage 영구종속(흡수 시 URL만 복사)·당일 미흡수 temp 이튿날 소멸·snap/메인 seq 계산 불일치·저장 시 temp 통째삭제 ②보조앱(snap) 자체 IDB큐. research 3문서: `종로맵_웹사진_누락분석.md`·`보조앱_계기맵_연동_누락분석.md`·`OCR자동_검증자동_체인분석.md`.
- **★F. 계기큐 맥 이식(전송탭) — 대부분 구현, 실행부 방식 교체가 핵심 남은것 (2026-07-03)** — 검증완료→전송탭→awms전송→완료표시→큐정리. **구현완료(커밋됨)**: 봉인계산(주입식·수령 실봉인범위 순차, 계정무관 물리봉인 [[awms_seal_real_range_rule]])·전송탭 UI(admin-validate.html **build 1758**: 공사명 드롭다운(getBusiList CONS_OVVW_CTT)·OTP로그인·세션확인·[미전송]/[전송완료]·진행·로그형식)·백엔드(`research/admin-validation/backend/app.py`: /transmit/config·plan·run·busilist·session·transmit_monitor·정식배선)·**실등록 2건 실검증**(구29171236503→신07530185945=315258, 구29171237513→신07530186168=315259, 계정726 mdp2603726, workStep28). 봉인 다음=**315260**.
  - **★★핵심 남은것 = 실행부 방식 교체**: 현 `_remote_register`=맥→폰 **CDP 리모컨**(폰이 registerReplacement 실행)이라 폰 켜져야만 동작(전송 2%서 멈춤=폰 freeze 발각). **영준님 요구(2026-07-03 강조)=아미큐처럼 맥 세션 직접**: 폰 OTP 로그인→awms 세션쿠키(JSESSIONID)를 맥으로→**맥이 mob/mtr requests 직접 호출**(철거→getDetail→신설→28), 폰은 OTP발급+모니터링만. `cst-input/backend/app.py`(아미큐, 이미 맥세션직접) 패턴 이식. **봉인·UI·로그·transmit_monitor 재사용, 실행부만 교체**. → [[metercq_mac_session_direct]] [[communication_team_mac_input_device]]
  - **중복방지=firebase awms_synced 기준**(전송기록이 관리자 통계에 남음, awms 재조회 전처리 불필요 — 영준님 확인). jongno admin-validate 미push 상태(pages CDN/Actions 빌드 지연 → 로컬 8080 정적서버로 데모). 폰 배너(queue.js transmit_monitor 구독)도 pages 반영 대기. → [[validate_portal_location_and_workflow]]
- **D/G. 아미큐(통신팀 cst-app) — 풀 네이티브(Compose) 재작성 완료 (2026-07-01, v2.1.6, 배포+이 폰 설치)** — 웹뷰 원격로드 폐기→네이티브(same appId com.youngjun.cstinput, debug 키스토어 유지). **탭 설정/수집/큐**(단계이동 하단 화살표). 수집=마스터사진4(개별탭+4장일괄)+신설기설토글+QR/바코드 분리스캔+OCR→**큐 담기**→큐탭 **[올려]=EXIF 시각보정(마지막사진=현재-10초, 실제간격 보존 admin.html방식, 앱 ExifInterface 스탬프)→awms 전송(진행바)**, **[사진저장]**(갤러리 Pictures/아미큐, 파일명=YYYYMMDD_HHMMSS.jpg=EXIF시각 1:1). **OTP 자동입력**(채널 startsWith픽스·__markOtpReq 네이티브배선), **인앱 자동업데이트**(APK+cst-version.json push), **백엔드URL 자동발견**(Firebase cstBackend, 폰입력 불필요), 사진 EXIF 굽기+정사각(90도 픽스), OCR=검증포털 extract_meter 이식, 신설/기설 WORK_DIV M1010/M1030(슬레이브 항상 M1010), 상단겹침·흰띠 픽스. 맥 백엔드(FastAPI 8766 `cst-input/backend/app.py`, `bash cst-input/start.sh`=백엔드+터널+URL발행). 배포=APK+version.json push→앱 자동업뎃. 빌드=`cd ~/Projects/cst-app/android && ./gradlew :app:assembleDebug`. 상세 [[communication_team_mac_input_device]].
  - **남은 것(라이브/폰 검증)**: ①신설/기설 M1030 실전송 미실측 ②슬레이브 라이브 saveAct BUNGI/INST_S 재조회 확인 ③awms 라이브 saveAct는 더미(0999)로만 실증 ④현장 셀룰러 터널(현 quick tunnel, 재기동마다 URL바뀜→자동발견으로 앱은 무관). OTP는 이 폰 adb로 활성화 완료(`cmd notification allow_listener`), **다른 폰=알림접근+접근성 수동 켜기(개발자옵션 불필요, 사이드로드는 앱정보⋮ 제한된설정 허용)**. (주말 A.아미맵·B.종로앱·C.계기큐 경량화 완료.)
- **E. status 지역별 부분로딩 (quota 근본해결, 영준님 지시 2026-06-22, 미착수)** — 아미맵·종로맵 workStatus를 **구(동그룹) 단위로 쪼개 저장 → 선택 구만 로딩 + 이벤트 증분**. 지금은 전체 workStatus를 localStorage 통째 저장 → iOS Safari 5MB quota 터짐(아래 핫픽스로 임시방어만). site-data는 이미 IDB 캐시(1회). **Firebase workStatus 구조 재편 + 기존 상태 구별 마이그레이션** 필요 → 작업자 데이터 다루니 **맥에서 설계·검증 후 배포**(영준님 "배포만 하지말것"). 필터는 데이터 `동그룹` 필드 사용(map.js:560). [[jongno_lightweight_done]]

## 대기 액션 (영준님 결정/확인 필요)
- **★ 보강현황 site-data 반영 — 주덕기 수정본 대기 중**(2026-06-30): 6/30 수정본(`data/계기교체 보강현황_20260629_1.xlsx`)은 **주소 행 오정렬(지사↔주소 38%만 일치) = 쓰레기로 반려**. 다음 수정본 오면 **정합성 게이트(지사 관할구 ⊇ 주소구 90%+) 먼저** 통과해야 진행 [[boranggi_excel_integrity_gate]]. 아래는 6/29 엑셀 기준 재구성 규칙(수정본도 0순위만·고객번호 대조 동일): 주덕기 6/29 메일 엑셀 `data/boranggi-20260629.xlsx`(KDN 대용량첨부 다운로드분, 85,938행). **안 숨긴 행=작업대상**(오토필터로 비대상 미표기 63,203 숨김). 26열(헤더는 "계기타입"이나 실제값=순위) **0순위 19,380 / 그외 3,355**. 넣을 건 **0순위만**. 대조키=**고객번호**(계기교체로 계기번호 바뀜).
  - **재구성 규칙**(영준님 확정): 기존 site-data에서 workStatus **complete(24,380) 제외**, **미완료(pending/fail/none)+보류(hold) 남김**, **0순위 19,380 추가**, **중복(고객번호) 합침**. → **최종 19,846** = 0순위 19,380 + 기존순수유지 466. 중복 1,742는 1,741이 계기번호 동일(무손실), 1건만 계기교체(0116263328).
  - **파이프라인**: 0순위 신규 14,136 **좌표변환 필요**(주소→lat/lng, 카카오/네이버) / 0순위 기존 5,244·기존유지 466은 현 site-data 좌표 재사용 → site-data 재생성 → `gen_site_version.py` → `upload_sitedata.py`(Firebase) → workStatus는 주소기준이라 미완료/보류 진행상태 보존됨.
  - **백업 완료**: `data/site-data.backup-보강반영전-20260630.json`(26.6MB, 6/1자 26,588건).
  - **확인필요**: "보안계기" 타입 다수(0순위 8,240) — 기존 분류(E/EA/G/Amigo)에 없는 새 타입. site-data엔 이미 존재. 검기만료 98%(긴급=이미만료+이번달 7,605).
- **★ 검증포털 import·과거분 '준공반영' 분리 (2026-07-01, 대부분 완료·종로474 재기동만 남음)** — 원칙: **작업자 실작업만 검증 대상, import(한전준공·awms)·검증도입 전 작업분은 전부 '준공반영'(회색, status='kepco')**. ①구로=한전준공 **9차수 통합 재업로드**(4180→9253, cust_no 100%, 백업 `data/backup-guro-workstatus-재업로드전-20260701-004737.json`) ②import(`KEPCO_IMPORT`/`AWMS_IMPORT`)→준공반영, **집계뷰는 과설계라 롤백**(기존 종로식 테이블 유지) ③검증시스템 **실도입일=2026-06-17**(6/10 아님, ocr_review 첫 verdict), 그 전 **종로 실작업 474건**(meter1 404+admin 70)도 준공반영. 백엔드 `research/admin-validation/backend/app.py`: `_merge_unverified` worker분기 + `_attach_photo_urls` worker/replaced_at 부착 + `_overlay_verdicts` 뒤 `ADOPTION_DATE_MS(1781622000000=6/17 KST)` 분기 + `/results` guro CSV누수차단(csv_dir없으면 빈결과). `fetch_db` KEPCO OCR제외·`daily_summary` import제외. 프론트 `admin-validate.html` **build 1752** 배포완료(집계뷰 제거+.st-kepco 준공반영 회색). → [[guro_kepco_import_jungong_aggregate]] [[validate_portal_location_and_workflow]]
  - **★남은 것**: 종로474 준공반영 = developer 에이전트 구현 마무리 후 **백엔드 재기동(kill 8765+start.sh)+status 분포 검증**(도입전=kepco/도입후 유지). **app.py 변경 4건 git 미커밋**(로컬 재기동으로만 반영중 — 영구화하려면 커밋 필요). uvicorn=--reload 없음.
- **★ 구로(구로금천) 후속 — 멀티지역·완료마킹·좌표는 배포완료, 남은 것만**(2026-06-29): ①차수 미매칭(9차수 통합으로 재산정, 미매칭 18건 site-data 부재분 제외) ②삼상 계기 검침값이 차수엑셀에 단일값뿐 → `whme_day`만 채움(주간/야간/무효/최대 4필드 미완, 마커무관·검증부정확) ③잔여 ?좌표 1건(금천 시흥동 138-5, 어디에도 없는 폐지번) ④**구로 작업자 계정 미발급** — 발급 시 auth.js ACCOUNTS에 `region:'guro'` 추가하면 그 아이디는 구로 고정. ⑤구로 차수 4개(5·14·15·18차)가 완료분 전부라는 전제로 마킹(더 있으면 hold 111주소 중 일부가 complete). → [[jongno_multiregion_structure]]
- **★ 22차 중복 관철동 11-14(02470001147) awms 관리자 삭제요청**(2026-06-26) — 종로아이디 기등록건이 중구아이디 22차로 중복 saveRow됨. 완료(28)+작업자권한이라 현장삭제 불가 → **한전 관리자 삭제 필요**. 보고문 작성됨(관철12-12=25라 현장삭제됨). 원인=계기큐 완료판정 계정단위(위 v0623b가 근본수정).
- **★ 명륜 site-data 944→새엑셀 2576 교체**(미진행) — `~/Downloads/명륜동.xlsx`(2026 중구 실효대상, 1가744/2가106/3가1657/4가69=2576) 작업대상. 현 jongno-site-data 명륜944는 그 부분집합(고아0). 종합문서 `jongno-combined/research/명륜_종합정리.md`. ★주의: `convert_myeongryun.py`가 옛944 가리킴+컬럼인덱스 +1어긋남(병합열)+동그룹='명륜'. 교체순서=2576변환·삽입→`gen_jongno_site_version.py`→그 다음 마킹. awms 10차(중구) 명륜163건↔새2576 매칭 163/163(중구작업 status='중구작업' 완료마킹 가능).

## 후처리 자동화 (`/daily-analysis` 스킬 — 진행중)
- 스킬 `~/.claude/skills/daily-analysis/SKILL.md`. 파이프라인 **데이터검증→need_human→후처리→엑셀/사진zip→awms**. 문서 `research/후처리_자동화_기획.md`, 메모리 [[postprocess_automation_plan]]. ocr-meter `research/ocr_poc/daily_cycle.py`=수집·검진.
- 1단계 규칙필터 완료(신설=EA/G/Amigo, 철거=타입코드중점). 계기번호 검증=Apple Vision 단독. 검침 필드법칙=readingFieldsFor(계약종별+계약전력) — ★계약정보 위치 정정(2026-06-17): 계약종별·계약전력은 `jongno-combined/data/jongno-site-data.json` 계기객체에 저장돼 있음(옛 "미저장" 기록 틀림). 단 workStatus/replacement_list엔 없음. 데이터 정합성(칸바뀜·위상일치) 검증 포함.
- **★5단계 순서 확정(영준님 2026-06-17, 스킬 반영)**: 누락정리→(작업자)채우기→정합성→OCR→need_human = "데이터검증 완료". **OCR부터 달려들지 말 것. 데일리=오늘거 기준만**(옛 타일 draft 섞지 말 것). 임시저장도 작업누락분. A그룹(채울것)/B그룹(디스플레이오류·조회불가=못채움→임시저장 냅두고 넘어감). **현장 YOLO 미검출은 daily_cycle이 PM YOLO 폴백 자동재검출(사각지대 자동해소, 별도스크립트 불필요)**.
- **★awms 필드없음 케이스(영준님 2026-06-17)**: 한전조회 1필드인데 실제 2종 4필드(주간·야간·무효·최대) 넣어야 하는 계기 → awms 전송불가. **비고 "awms 필드없음" + 추가데이터 엑셀 별도.** 오늘 seq33(06450094903) 해당. TODO: **종로앱 추가데이터 입력UI에 야간·무효·최대 필드 추가**(지금 단순 1필드).
- **검증포털↔스킬 동기화 완료(2026-06-29)**: 판정 저장노드가 이미 `ocr_review/daily_val_{date}` 단일(페이지 /verdict·스킬 --review·/apply 공유) → 자동 동기화. backend `/apply`(app.py L1466) **구현돼 있음**(옛 "--apply 미구현"은 daily_cycle CLI 기준 오기). **need_human은 데이터검증 페이지 딥링크로 일원화**(`admin-validate.html?auth=admin&dataset=jongno&date=YYYYMMDD&review=need` → setFilter('need') 니드휴먼뷰). 단 영준님 퇴근길 선호 = `--review --upload` **리뷰HTML URL**(로그인없이 사진+판정, 같은 노드라 동기화). SKILL.md 반영. → [[validate_sync_daily_val_node]]
- **★daily_cycle 3단계 순서 확정(2026-06-20, 스킬 반영)**: `--date`(PARSeq 1차)→`--sonnet`(구글비전+YOLO 2차)→`--review --upload --date`(그날만). **--sonnet 빠뜨리면 need_sonnet이 구글비전 미경유로 리뷰에 통째 유입**(6/19 사고). 리뷰 코드수정(daily_cycle.py): run_review에 날짜필터(`_today`)+검침/계기번호 카드에 **Google Vision 후보**+계기번호 todo에 `google` 상태 포함.
## 종로 보조앱(snap) — 미완 항목만
> 2인1조 사진분담 컴패니언. 상세·완료분은 [[jongno_snap_companion]] [[jongno_snap_bg_upload]] + `jongno-combined/research/보조앱_snap_설계.md`
- **QR 직행경로+도크 업로드로그 = 배포완료(v20260617.1, 2026-06-17, APK URL설치)**. 원인규명: QR 계기번호는 사진과 달리 메인 직행경로가 없어 temp 고립(사진은 계기할당시 autoSave가 workStatus 직접기록). 수정=handleScanResult에 hit분기(할당계기면 statusRef 직접 update, ★draft의 new_meter_id는 ''빈문자열이라 setIfEmpty 아닌 `!cur`로 판정) + ujRegister/ujSet 도크('계기번호'-성공/실패, slot='qr' 구독건너뜀·재전송=QR재스캔). temp orphan·Storage apk 삭제 완료. **남은 확인: 폰서 QR 1건 스캔→도크 '성공'+계기 직접반영 동작 검증**(미검증). 빌드법=아래 로컬번들.
- **검침값 사진 늘림(4필드 대응) — 조사완료·미구현(2026-06-17)**. 현재 snap=철거 검침 1칸(주간)뿐, 메인앱은 최대 4필드(주간·야간·무효·최대) 각 사진슬롯+입력칸. 영준님 결정: **매칭계기=계약정보로 자동판별(필요칸만), 미리찍기=모드토글(주간/야간/4필드)**. 구현 순서(advisor): ①메인앱 `replacement-modal.js:1253` payload에 `계약종별`·`계약전력` 2줄 저장(push 즉시반영, snap이 seqIndex.entry서 읽음) → Firebase 1건 검증 → ②snap utils.js import + readingFieldsFor 자동판별 + 모드토글 + temp 스키마 필드별(`removal_photos[fid]`/`removal_values[fid]`)·**하위호환(구 단일 removal_photo는 firstActive로)** ③`prefillTempForSeq` 다필드 순회. ★새 슬롯에 실패/재전송/job-status UI 만들지 말 것(snap GATE 안). snap=로컬번들(아래 배포법).
- ★**로컬번들**: jongno-snap은 server.url 없음 → snap.html 변경은 **github push로 폰 반영 안 됨**. `cp jongno-combined/snap.html → jongno-snap/android/app/src/main/assets/public/index.html` + `assembleDebug` + `install -r`(`~/Projects/jongno-snap/deploy.sh RFCT710YTFW`) + 재시작 필수. cap sync 금지.
- ★**백그라운드 업로드 실동작 미검증(GATE)** — 워커 자기로그 0줄. **사진찍고 즉시 화면끄기 60초 → 워커 doWork/Storage 로그+새 tempPhotos 생기는지** 확인 전엔 실패/재전송/job-status 구현 금지(advisor).
- 시트 삭제메뉴(없음=촬영/앨범, 있음=+삭제[temp만·부모보호·슬롯단위], 실패=재전송/촬영/앨범) **미구현** — 위 GATE 검증 후.
- ★**보조앱은 들어낼 수도 있음(영준님)** — 통합 깔끔히 제거 가능하게. 메인앱 흡수로직은 snap 없으면 no-op이라 무해.

## 블로커
- (제주 완료0 / 종로 미연계 = 영준님 지시로 제외)

## Firebase 요금제/사용량
- **★ 7/1 Spark 복귀 필수**(대기 액션 참조) — 무료체험 7/2 종료 전. billing 계정=무료체험 크레딧 `01214A-10A39B-960378`(₩453,008, 7/2 종료). DB 이전(B안)은 안 함(리스크 과다).
- 다운로드 100% 범인=workStatus 30초 폴링 → Part3 증분 리스너로 해결(완료). ami-work Storage 안 씀(사진은 ami-jongno만).
- ocr-meter는 ami-jongno만 읽음. 분리위반: 종로 sync-meter-from-awms.html이 ami-work DB awmscomplete 사용 → ami-jongno 이전 검토(별건).

## 핵심 규칙 (사고 방지 — 영구)
- **awms 맥변경 = 모뎀 재결합(saveAct 아님), 마스터 먼저.** 통신팀(mob/cst)/계기팀(mob/mtr) 별개·교차호출 405. 모뎀맥·마스터/슬레이브는 통신팀 전용. → `awms_API_레퍼런스.md` 8.5.
- **계기큐 코드수정 = ami-work/awms-queue-www push**(APK빌드 아님, USB 불필요). 네이티브(카메라/파일선택)만 빌드.
- **종로팀 awms 아이디 = mdp2504271 전용 고정**(2026-06-26 확정) — 중구가 **별도 아이디 발급**받기로 해 같은아이디 공유 종료. 봉인차수 전환 불필요(종로 봉인차수=22차 397820263291 고정). 계기큐 [종로구]/[중구] **토글 제거**(v0626a). 공유시절 전환버튼(v0623a)·봉인 백업/원복 운영은 종료. 옛 종로 awms아이디=mdp2504381. ※봉인값(METR_SEAL_VAL)·차수(LV_CONS_NO)는 계정전역이라 한 계정 내선 그대로 이어짐(계기큐 빌더가 활성봉인차수 따라감, awms-saverow.js:651).
- **계기큐 백그라운드 일괄등록 = awms fetch 오버레이로 해결**(APK). 다른앱 쓰며 등록 OK. ★단 배치 중 계기큐를 최근앱서 스와이프 종료 금지(Activity 죽으면 오버레이도 죽음). → [[awms_queue_webview_visibility_freeze]].
- **종로맵 배포 시 APP_VERSION 갱신**(map.html/stats.html 통일) — 안 하면 옛화면 잔존.
- **TOU = 정적파일(data/tou-data.json), Firebase 아님 — push로 반영.**
- **★site-data.json 변경 시 `python3 scripts/gen_site_version.py` 필수**(Part2 캐시-우선 로더 — 안 하면 작업자 폰 옛 IDB캐시 유지). → [[amimap_part2_sitedata_cache]].
- **아미맵 마커 = 좌표 기준 그룹핑**(같은 좌표 여러 지번 1마커, 재건축 한건물 통합). 완료 시 구성 지번 전부 기록. → [[amimap_marker_coord_merge]].
- **종로맵 검침값 입력규칙** — 자릿수 단상(17/19/25/26/27/53)5·나머지6, 최대전력만 7(4자리.2자리), 순서 주·야·무효·최대, 소수칸 inputmode=decimal, 최대전력≥10000 저장경고. 최대↔무효 작업자혼동 빈발. → [[jongno_reading_input_rules]].
- **28(완료) 되돌리기 불가**(계기팀). 통신팀은 전송 전이면 삭제·수정 자유.
- **주소상태(workStatus)는 무조건 Firebase.** 종로DB=ami-jongno.
- **★실효계기 데이터 단일원본 = `data/site-data.json`. Firebase siteData(charger4eleccar) 소비자 = stats.html(분모)+아미큐(조회). 아미맵은 site-data.json만 봄.** site-data.json 갱신 시 **반드시 `upload_sitedata.py`+`gen_site_version.py` 같이**. → [[실효계기_엑셀_라이프사이클]]. **종로/철거 대조 키=고객번호(계기번호는 교체로 바뀜).**
- **ami-work/jongno 코드는 PM 직접 수정**(에이전트 권한거부). 계기큐 APK는 빌드 가능.
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감.
- **AUTH/FORCE_LOGOUT_VERSION 평소 배포에 건드리지 말 것** — 잦은 범프가 "앱 초기화" 원인 [[ami_work_init_logout_fix]].
- **awms 로그인 OTP 자동입력** = 카톡 OTP를 네이티브 접근성 서비스가 읽어 webview에 입력. 헬퍼=자기앱 내장 / 아미큐=재빌드 시 내장 / 계기큐=A31 별도수집기→Firebase→inject 폴링. 로그태그 `AWMS_OTP`(수집기 `OTPCOL`). 전부 [[awms_otp_amiqueue_embed]].
