# HANDOFF — ami-work(아미맵) / jongno-combined(종로맵) / 계기큐·아미큐·헬퍼

> ★ **이 문서는 영구 상태판이다. 휘발성 세션 진행메모를 여기 쓰지 말 것** — 작업 디테일·과정은 메모리(`~/.claude/.../memory/`)와 `research/` 문서에 남긴다.
> ami-work 세션이 여러 개라 충돌하므로, HANDOFF는 **잘 안 바뀌는 것**(미완 트랙·대기 액션·핵심 규칙)만 단일 권위로 유지한다. **완료·배포·검증된 건 여기 남기지 말고 즉시 지운다**(상세는 옵시디언 로그·메모리).
>
> 앱 통칭 [[app_naming_convention]]. 배포 시 APP_VERSION 갱신 [[jongno_app_version_deploy]]. 종로맵=Naver Maps.
> **awms API 모를 때 = `research/awms-poc/awms_API_레퍼런스.md`. 통신팀(mob/cst)/계기팀(mob/mtr) 별개 — 항상 구별.**

## 진행중 트랙
- **★F. 데이터검증관리자 ↔ 계기큐 연결 (영준님 2026-06-30 지정, 다음 1순위)** — **검증완료 → 계기큐 진입 → awms 전송완료 → 검증관리자 "전송완료" 컬럼 → 전송완료 건 계기큐 삭제.** ①계기큐 게이트를 isVerified(자동통과 포함)와 정합(지금 validated 도장 기반이라 자동통과 건이 도장 없이 큐 진입하려면 정합 필요) ②"전송완료" 컬럼 신설(검증완료 옆) ③전송완료→큐삭제(awms_queue 동기화큐 자동정리 TODO와 연결). ★검증포털 정본=`jongno-combined/admin-validate.html`(ami-work 중복삭제됨), 검증완료=상태기반 isVerified, 백엔드·스킬=ami-work, build 1750. → [[validate_portal_location_and_workflow]] [[daily_cycle_human_status_preserve]]
- **D. 아미큐**(통신큐) — OTP내장+자체awms로그인+saveAct빌더 완료. **수집폼 UI를 awms 설비등록 폼 본뜨기로 전면 재설계 필요**(1차 마스터그룹 카드 폐기) + 설정페이지·맥QR·동행조회·builder슬래이브사진·예약·EXIF 남음. → [[amiqueue_collect_masterkey]] [[awms_saveact_500_fix]]
  - (주말 4트랙 A.아미맵경량화 · B.종로앱경량화 · C.계기큐경량화 = 완료. 메모리 [[amimap_part2_sitedata_cache]] [[jongno_lightweight_done]] [[awms_queue_lightweight_done]])
- **G. 통신팀 awms 맥 입력장치 (cst-input) — 핵심 플로우 구현 완료, 2026-07-01 야간 자율작업** — 맥 백엔드(FastAPI 8766, `cst-input/backend/app.py`, `bash cst-input/start.sh`) + 안드로이드앱(`~/Projects/cst-app`, com.youngjun.cstinput v1.0.1, capacitor `server.url`로 github 원격로드 `cst-input/www` → push만으로 UI반영). 플로우=설정(지사DEPT2/동행/카메라/awms계정)→사진수집(마스터4슬롯 3·4·5·6+슬레이브N)→OCR(visionocr_batch.swift 계기번호, **실검증✓**)→맥수집(QR/바코드)→계기번호확인(OCR/QR/수기)→saveAct(마스터+슬레이브결합, **빌더 정본76필드 완전일치✓**, 통신방식 macToSuffix·계기유형 TYPE_MAP **자동✓**). PoC로 맥직접 saveAct result:1+MB_REG_CNT=2 검증완료. **남은 것(영준님 확인/폰물리 필요)**: ①라이브 saveAct 1건(삭제경로=헬퍼 MOBCST 수동메뉴 mobCst1000Api, vue라 CDP 자율불가) ②QR/바코드 폰 ScannerBridge 실연동(미검증) ③통신방식 미상(AC5E8C 등) 직접선택 UI ④EXIF 미세보정(awms 검증안함=감사용) ⑤현장 셀룰러 cloudflared 터널(현재 USB adb reverse). 상세 [[communication_team_mac_input_device]] + `research/awms-poc/통신팀_맥입력장치_설계.md`. D 아미큐의 맥백엔드 재방향.
- **E. status 지역별 부분로딩 (quota 근본해결, 영준님 지시 2026-06-22, 미착수)** — 아미맵·종로맵 workStatus를 **구(동그룹) 단위로 쪼개 저장 → 선택 구만 로딩 + 이벤트 증분**. 지금은 전체 workStatus를 localStorage 통째 저장 → iOS Safari 5MB quota 터짐(아래 핫픽스로 임시방어만). site-data는 이미 IDB 캐시(1회). **Firebase workStatus 구조 재편 + 기존 상태 구별 마이그레이션** 필요 → 작업자 데이터 다루니 **맥에서 설계·검증 후 배포**(영준님 "배포만 하지말것"). 필터는 데이터 `동그룹` 필드 사용(map.js:560). [[jongno_lightweight_done]]

## 대기 액션 (영준님 결정/확인 필요)
- **★ 보강현황 site-data 반영 — 주덕기 수정본 대기 중**(2026-06-30): 6/30 수정본(`data/계기교체 보강현황_20260629_1.xlsx`)은 **주소 행 오정렬(지사↔주소 38%만 일치) = 쓰레기로 반려**. 다음 수정본 오면 **정합성 게이트(지사 관할구 ⊇ 주소구 90%+) 먼저** 통과해야 진행 [[boranggi_excel_integrity_gate]]. 아래는 6/29 엑셀 기준 재구성 규칙(수정본도 0순위만·고객번호 대조 동일): 주덕기 6/29 메일 엑셀 `data/boranggi-20260629.xlsx`(KDN 대용량첨부 다운로드분, 85,938행). **안 숨긴 행=작업대상**(오토필터로 비대상 미표기 63,203 숨김). 26열(헤더는 "계기타입"이나 실제값=순위) **0순위 19,380 / 그외 3,355**. 넣을 건 **0순위만**. 대조키=**고객번호**(계기교체로 계기번호 바뀜).
  - **재구성 규칙**(영준님 확정): 기존 site-data에서 workStatus **complete(24,380) 제외**, **미완료(pending/fail/none)+보류(hold) 남김**, **0순위 19,380 추가**, **중복(고객번호) 합침**. → **최종 19,846** = 0순위 19,380 + 기존순수유지 466. 중복 1,742는 1,741이 계기번호 동일(무손실), 1건만 계기교체(0116263328).
  - **파이프라인**: 0순위 신규 14,136 **좌표변환 필요**(주소→lat/lng, 카카오/네이버) / 0순위 기존 5,244·기존유지 466은 현 site-data 좌표 재사용 → site-data 재생성 → `gen_site_version.py` → `upload_sitedata.py`(Firebase) → workStatus는 주소기준이라 미완료/보류 진행상태 보존됨.
  - **백업 완료**: `data/site-data.backup-보강반영전-20260630.json`(26.6MB, 6/1자 26,588건).
  - **확인필요**: "보안계기" 타입 다수(0순위 8,240) — 기존 분류(E/EA/G/Amigo)에 없는 새 타입. site-data엔 이미 존재. 검기만료 98%(긴급=이미만료+이번달 7,605).
- **★ 헬퍼 바코드 1.0.78 영준님 폰 테스트 대기**: BARCODE=1D전용 scanBarcode(QR제외 CODE_128/39, 12자리 검증 자동재시도). APK `https://815dudwns.github.io/jongno-combined/apk/awms-helper-1.0.78.apk`. inject v81 push됨(폴백안전). 검증되면 자동업데이트(보조앱 UpdateBridge 이식) 넣어 정식배포 — applicationId 충돌없음/매니페스트 권한 이미 있음/호스팅 jongno-combined/apk/, 첫 1.0.78은 부트스트랩 1회 수동(카톡링크). 코드 awms-helper MainActivity scanBarcode.
- **★ 구로(구로금천) 후속 — 멀티지역·완료마킹·좌표는 배포완료, 남은 것만**(2026-06-29): ①차수 미매칭 6건(한전 엑셀 계기번호 오타 35→37 등, 보류) ②삼상 계기 검침값이 차수엑셀에 단일값뿐 → `whme_day`만 채움(주간/야간/무효/최대 4필드 미완, 마커무관·검증부정확) ③잔여 ?좌표 1건(금천 시흥동 138-5, 어디에도 없는 폐지번) ④**구로 작업자 계정 미발급** — 발급 시 auth.js ACCOUNTS에 `region:'guro'` 추가하면 그 아이디는 구로 고정. ⑤구로 차수 4개(5·14·15·18차)가 완료분 전부라는 전제로 마킹(더 있으면 hold 111주소 중 일부가 complete). → [[jongno_multiregion_structure]]
- **★ 22차 중복 관철동 11-14(02470001147) awms 관리자 삭제요청**(2026-06-26) — 종로아이디 기등록건이 중구아이디 22차로 중복 saveRow됨. 완료(28)+작업자권한이라 현장삭제 불가 → **한전 관리자 삭제 필요**. 보고문 작성됨(관철12-12=25라 현장삭제됨). 원인=계기큐 완료판정 계정단위(위 v0623b가 근본수정).
- **★ 명륜 site-data 944→새엑셀 2576 교체**(미진행) — `~/Downloads/명륜동.xlsx`(2026 중구 실효대상, 1가744/2가106/3가1657/4가69=2576) 작업대상. 현 jongno-site-data 명륜944는 그 부분집합(고아0). 종합문서 `jongno-combined/research/명륜_종합정리.md`. ★주의: `convert_myeongryun.py`가 옛944 가리킴+컬럼인덱스 +1어긋남(병합열)+동그룹='명륜'. 교체순서=2576변환·삽입→`gen_jongno_site_version.py`→그 다음 마킹. awms 10차(중구) 명륜163건↔새2576 매칭 163/163(중구작업 status='중구작업' 완료마킹 가능).
- **★ 7/1 ami-work Blaze→Spark 복귀** — 무료체험 크레딧(7/2 종료) 전 되돌려야 DB 차단 방지. `gcloud billing projects unlink ami-work-1c49a`. 7월이면 무료한도 리셋+경량화로 Spark 충분. 맥 미리알림 등록됨.
- **아미큐 수집폼 awms폼 본뜨기 재설계** — 캡처 레퍼런스 `research/awms-poc/awms_설비등록화면_{상단,하단}_20260614.png`, 설계 design.md §1.5. collect.js를 awms 설비등록 폼 모양으로(자동값 채움+맥/사진만) + 설정페이지(지사·사업명·동행·작업자) + 맥QR=모뎀맥사진겸용. **목적=맥+사진 모으기, 나머지 파생/자동**(영준님 못박음). → [[amiqueue_collect_masterkey]].

## 후처리 자동화 (`/daily-analysis` 스킬 — 진행중)
- 스킬 `~/.claude/skills/daily-analysis/SKILL.md`. 파이프라인 **데이터검증→need_human→후처리→엑셀/사진zip→awms**. 문서 `research/후처리_자동화_기획.md`, 메모리 [[postprocess_automation_plan]]. ocr-meter `research/ocr_poc/daily_cycle.py`=수집·검진.
- 1단계 규칙필터 완료(신설=EA/G/Amigo, 철거=타입코드중점). 계기번호 검증=Apple Vision 단독. 검침 필드법칙=readingFieldsFor(계약종별+계약전력) — ★계약정보 위치 정정(2026-06-17): 계약종별·계약전력은 `jongno-combined/data/jongno-site-data.json` 계기객체에 저장돼 있음(옛 "미저장" 기록 틀림). 단 workStatus/replacement_list엔 없음. 데이터 정합성(칸바뀜·위상일치) 검증 포함.
- **★5단계 순서 확정(영준님 2026-06-17, 스킬 반영)**: 누락정리→(작업자)채우기→정합성→OCR→need_human = "데이터검증 완료". **OCR부터 달려들지 말 것. 데일리=오늘거 기준만**(옛 타일 draft 섞지 말 것). 임시저장도 작업누락분. A그룹(채울것)/B그룹(디스플레이오류·조회불가=못채움→임시저장 냅두고 넘어감). **현장 YOLO 미검출은 daily_cycle이 PM YOLO 폴백 자동재검출(사각지대 자동해소, 별도스크립트 불필요)**.
- **★awms 필드없음 케이스(영준님 2026-06-17)**: 한전조회 1필드인데 실제 2종 4필드(주간·야간·무효·최대) 넣어야 하는 계기 → awms 전송불가. **비고 "awms 필드없음" + 추가데이터 엑셀 별도.** 오늘 seq33(06450094903) 해당. TODO: **종로앱 추가데이터 입력UI에 야간·무효·최대 필드 추가**(지금 단순 1필드).
- **검증포털↔스킬 동기화 완료(2026-06-29)**: 판정 저장노드가 이미 `ocr_review/daily_val_{date}` 단일(페이지 /verdict·스킬 --review·/apply 공유) → 자동 동기화. backend `/apply`(app.py L1466) **구현돼 있음**(옛 "--apply 미구현"은 daily_cycle CLI 기준 오기). **need_human은 데이터검증 페이지 딥링크로 일원화**(`admin-validate.html?auth=admin&dataset=jongno&date=YYYYMMDD&review=need` → setFilter('need') 니드휴먼뷰). 단 영준님 퇴근길 선호 = `--review --upload` **리뷰HTML URL**(로그인없이 사진+판정, 같은 노드라 동기화). SKILL.md 반영. → [[validate_sync_daily_val_node]]
- **★daily_cycle 3단계 순서 확정(2026-06-20, 스킬 반영)**: `--date`(PARSeq 1차)→`--sonnet`(구글비전+YOLO 2차)→`--review --upload --date`(그날만). **--sonnet 빠뜨리면 need_sonnet이 구글비전 미경유로 리뷰에 통째 유입**(6/19 사고). 리뷰 코드수정(daily_cycle.py): run_review에 날짜필터(`_today`)+검침/계기번호 카드에 **Google Vision 후보**+계기번호 todo에 `google` 상태 포함.
- **6/19 검증결과**: 85건 누락0·정합성0위반(종별칸·위상·자릿수). A그룹 80(56170601294)·81(48171616913) 철거검침/사진 작업자보완 / seq85 연번구멍 작업자확인 / OCR auto78+구글2차 pass2 9 → 판정 검침2(seq2 dm_mt_day·seq42 whme_day)+계기번호1(48171588364=Google A0530206365) 영준님 판정대기(리뷰URL).
- **daily_cycle 소수점 비교 수정완료(2026-06-17)**: 최대전력(dm_mt_day)·무효(var_day)는 cmp_match로 소수점 포함 비교(주간/야간은 정수부). 사진 swap(최대↔무효) 검출 = 사진 단위 kW/kVArh로 판별, 수집코드는 fid그대로 매핑(뒤바뀜은 작업자 원천). 변경건 리뷰 = build_changed_review_today.py(작업자값≠verdict만), 재확인 verdict는 **ocr_review/daily_val_recheck** 노드(원본 daily_val 불변).
## 검증 대기 (코드 배포됨 — 영준님 폰 확인만)
- **아미맵 quota 핫픽스 v20260622.2**(2026-06-22, github 원격로드) — localStorage(iOS 5MB) 꽉차면 **상태변경/체크가 멈추던 버그**(saveStateEvent/saveCheckEvent의 setItem이 quota throw→updateStatus 중단→모달 안닫힘·마커 안바뀜·DB 미반영). 수정=setItem 전부 try/catch + 상태/체크를 **statusRef.update/set으로 직접 전송(큐 우회)** → quota여도 Firebase 반영, 실패시만 큐 폴백. 폰서 완료/체크 동작 확인. ★근본해결은 진행중트랙 E(구별 부분로딩).
- **종로맵 명륜 지역 추가 v20260622.1**(2026-06-22) — 2026 종로구 명륜동 944건(명륜1~4가) 종로 site-data 추가(12745→13689), 동그룹 '명륜' 신설(map.js DONG_GROUPS). 좌표 exact940/동중심4(명륜2가 39 미등록 3건 보정), 중복0, 디테일·교체 기존과 동일. 폰 새로고침→동그룹 메뉴 '명륜' + 마커 확인. 변환스크립트 `scripts/convert_myeongryun.py`, 중간산출 `data/myeongryun-converted.json`.
- **종로맵·보조앱 사진유실 방지**(종로 v20260621.2 / 보조앱 v20260621.4, 2026-06-21) — 보조앱 temp 사진 Storage 경로에 고유토큰(`_temp/{날짜}/{번호}/{slot}_{uniq}.jpg`) → 번호(daily_seq) 중복할당 시 원본 blob 덮어쓰기 차단(사진유실 핵심). + 저장이력 `saveLog/jongno/{날짜}` append(덮여도 복구) + 다다음날 prune(앱접속시, 맥무관). + 보조앱 신설사진↔QR 칸 교환. 보조앱은 **인앱 자동업데이트**로 작업자 배포(영준님 폰만 USB). 검침값 소멸은 prefill로 이미 보호 확인.
- **헬퍼 inject v80**(2026-06-20 push, github 원격로드) — 847207 통신방식 정밀화: `8472070E3`·`8472070E4`·`8472070D9`=ks-plc 분기(나머지 7번째 0/E=k-dcu, B/C/D=ks-plc). 실사용 작업폰 3대 awms 새로고침→버전배지 `v80` 확인. 모뎀 MAC→통신방식 판별규칙 전체 = 메모리 [[modem_mac_comm_classification]], `research/통신방식-판별-결론.md` ★최종정리. (8·9번째 예외 TODO였던 것 → v80으로 반영완료)
- **종로맵 교체모달 임시저장으로 되돌리기 버튼 + map/stats 통일**(v20260617.2, 모달 ?v=20260617b) — 완료건을 임시저장(draft)으로 되돌림(검침값·사진 유지). map/stats 양쪽 교체모달에 `#rpl-revert` 버튼 뜨고 동작하는지 폰 확인.
- **계기큐 v0626a-토글제거 + v0623b-완료누적**(2026-06-26 배포, github 원격로드) — ①[종로구]/[중구] 전환버튼 제거(종로 전용 아이디 mdp2504271 고정, 중구 별도아이디 발급예정). ②완료판정을 계정무관 영구누적(awmsDoneMeters merge+`_persistedDone` 합산)으로 — 한번 완료한 건 큐에 다시 안 뜸(중복등록 방지). 폰 재시작→우상단 `v0626a-토글제거` 확인(상단 팀바 사라지고 큐 정상).
- **계기큐 v0617a**(2026-06-17 배포, github 원격로드) — ①격리탭[큐]/[격리(N)]+항목별 격리/복귀 버튼(rep.quarantine Firebase저장) ②awms임시저장(WORK_STEP25)→빨강'실패' 표시+전체올리기/개별등록 자동제외(28과 분리, _awmsDraftMeters) ③종로앱draft 큐제외 원복(완료28건 정상 done — 02171921762) ④**업로드 중 화면 슬립방지(navigator.wakeLock)** — 폰 새로고침 후 확인. ★wakeLock WebView 미지원이면 [로그]에 "wakeLock 미지원" → 네이티브 KEEP_SCREEN_ON 빌드 필요.
- **종로맵 20260616.7**(디자인 클레이토큰 admin/login/guide/stats/map + 완료현황 child단위 경량화) — on('value')전체재처리→child_added/changed/removed 단건+updateMarkerColor, topbar/찐초록 증분캐시(자정무효화), 첫진입 전체build유지. 맥 로컬선 hang 없음 확인. 폰서 ①마커 정상 ②완료 누르면 그것만 갱신 확인.

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
