# [[AMI 작업지도]] 프로젝트

## 프로젝트 개요
- 앱: AMI 작업지도 — **실효계기 교체 단독시공** 관리
- 배포: https://815dudwns.github.io/ami-work/
- GitHub: github.com/815dudwns/ami-work
- 기술: HTML + 바닐라 JS + Kakao Maps + Firebase Realtime DB

## 조직·운영 (PM 관리체계 — 2026-07-21)
> 조직 정본 = `research/조직배선_설계_20260719.md`. 지침 계층: 감사=글로벌(`~/CLAUDE.md`), PM=이 프로젝트 지침+팀 배선.

**★사업 라인은 둘이고 우리는 KDN 조공이다** (영준님 2026-08-21 정정. 상세 [[industry_chain]] [[people_titles]])
```
계기 라인   한전 → 남경전설 → 탑성천 → 실작업자      (계기교체)      awms=MOBMTR
통신 라인   한전KDN → 우리(조공)                      (모뎀·통신 시공)  awms=MOBCST
```
- **우리는 계기 체인에 속하지 않는다. KDN 직속 조공이다.** awms 가 두 프로그램으로 갈린 것도 발주 주체가 달라서다 — 한쪽 실측을 다른 쪽 근거로 쓰지 마라
- 호칭: **조공 반장은 전부 "반장"**(윤용운 반장=작업자 캡틴, 장진교 반장) · **KDN 쪽은 직급대로**(주덕기 과장 — 실효·고압·SKT 리스트 발주, awms 정정 요청 창구)

**조직도**: 영준님(대표) · 감사(거버넌스) · **ami-work PM**(조율·판단, 실행자 아님)
- **통신팀** (본업 KDN 조공): 아미큐·헬퍼·아미맵. awms=MOBCST. 폴더 `cst-input/`·`js/`·`awms-helper/`
- **계기팀** (B2B 종로 동행): 계기큐·종로맵·snap·명륜·구로금천·OTP수집기. awms=MOBMTR. 폴더 `jongno-combined/`·`awms-queue-www/`
- **검증팀** (데이터회사 본업): 검증관리자(8765)·후처리/데일리검진(daily_cycle). 폴더 검증백엔드·`daily_cycle.py`
- **ocr-meter** (독립사무소): OCR 판독. `~/Projects/ocr-meter` (검증팀은 판정 의문 시 OCR_검증규칙.md 먼저)

**문서 4층** (정체성·지식이 어디에 있나):
1. 글로벌 지침 = `~/CLAUDE.md` — 감사 소관(조직·언어·위임·Orca 공통규약)
2. 프로젝트 지침 = 이 파일 — PM 소관(앱버전표·데이터규칙·프로세스·이 조직표)
3. 팀 전용 지침 = `.claude/agents/<팀>.md` — 통신팀·계기팀·검증팀(정체성·필독카드·전결·보고)
4. 시스템 매뉴얼 정본 = 옵시디언 카드(`core/`·`systems/`, 아래 지식베이스 인덱스)
- 메모리: PM=auto-memory / 팀=`.claude/agent-memory/<팀>/` (상호 오염 금지)

**팀 운영 방식** (감사 §4):
- (a) 호출형 — PM이 Agent 툴 `subagent_type: <팀>` 호출. 정의파일이 정체성·메모리 자동분리(감사 권장, 기본)
- (b) 상주형 — Orca 세션에 팀 정의 주입(`.claude/agents/<팀>.md` 읽혀 정체성). 영준님 직접 대화 필요 시. **통신 규약 정본 = `~/.claude/rules/orca-comms.md`** (사본 두지 말 것)
- 전결 = 팀 카드범위 내 코드·운영. PM 보고 후 = 스키마변경·Firebase구조/rules·배포·awms실등록(live)·대량삭제
- 보고 = 결과요약은 PM에, 긴 산출물 `/tmp/relay/`. HANDOFF는 PM 단일권위(팀은 읽기만)

## ★ 지식베이스 (시스템별 모듈 — 작업 전 해당 카드부터 로드)
> 2026-07-13 재구조화. 지식이 시스템(도메인) 단위 카드로 봉합됨. **특정 시스템 작업 시 이 CLAUDE.md 전체가 아니라 해당 카드 + L0 공용코어만 읽으면 독립적으로 작동**한다. 각 카드 = 구조·동작 / 결정이력(함정) / 배포·버전 / TODO 4요소. 정본 = 옵시디언, 원자적 사실 = auto-memory(카드가 [[slug]]로 링크), repo = 실무·진입점.
>
> 볼트 루트: `/Users/woodelight/Projects/obsidian/Projects/AMI/`

**L0 공용코어** (`core/`) — 모든 시스템 공유:
- `core/사업구조.md` — 단독/동행·한전 발주체인·전략·B2B·10팀확장·한전리스크 + **영준님 배경·앱 탄생사·김창숙 브릿지·2027 데이터회사·에이전트 조직**(2026-07-19 구술 통합. 사업 판단 전 필독)
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
| **아미큐**(통신큐·통신팀) | `cst-input/cst-version.json` `versionName`(인앱 자동업뎃) + `cst-app/android/app/build.gradle` `versionCode`·`versionName` · **★UI=네이티브 `cst-app/`(Compose) · saveAct빌더=`cst-input/backend/app.py`** | `2.2.28` (2.2.28: 동행시공 칩·표시를 '동행시공 X / 동행시공 O' 로(단독과 헷갈림) · 큐 [수정]에서 수집과 같은 옵션 — 동행시공·슬레이브 분기(아미고 모뎀 92 + 아미고 슬레이브만)·마스터 사진 4칸 보기·칸별 교체·슬레이브 사진 교체(QueueScreen QueueEditDialog, QueueItem.masterPhotos/masterTimes 가 var, 보낸 항목은 전처럼 수정 막힘) · 확인화면에서 합동 대상 계기와 동행시공 선택이 어긋나면 바꿀지 물음 — 대상 있는데 N 이면 Y 로, 하나도 없는데 Y 면 N 으로, [바꾸기]=칩과 같은 길(vm.selectWith), 합동 조회 실패·미도착이면 안 물음, 계기 묶음당 한 번(ui/WithYnPrompt.kt withYnAsk + 단위시험) · **자동업데이트 배포 2026-11-02** — 2.2.27: 동행시공 선택을 설정에서 빼고 맥 화면 설비 옵션으로, 마지막 값 유지(Prefs with_yn), 큐 항목마다 withYn 고정 → 백엔드 saveAct 가 body withYn 우선(없으면 CONFIG), 선택 시 CONFIG WITH_YN 도 같이 맞춤 · 2.2.26: 계기 입력·확인화면에 지도 리스트 배지([선조치] 등, 이름은 백엔드 /api/michunggu badges 가 meter-list-index.json 에서), 백엔드 쪽은 같은 날 반영 · **자동업데이트 배포 2026-10-26** — 2.2.25: 계기 입력·전송 전 확인화면에 합동 리스트 표시 [합동] 배지·"합동 리스트 — 작업일·지사"(백업분 "지도 내려감"), 화면 전용·비고 무관, 백엔드 /api/michunggu 에 inHapdong · 2.2.24: 백엔드 토큰 인증(설정 탭 토큰)·재전송 멱등·입력 게이트·주소 자동재발견 · 2.2.23: 맥 스캔 시 내 출고 모뎀 배지 **[출고]/[미출고]/[이미 시공]** · 출고목록에 없는 새 맥이면 [다음]에서 경고 박스 — 신설·교체 대상, 기설 마스터 그룹은 배지만 · 출고목록=awms 자재이력조회>출고 MOBMTL6000 · 변대주 자동조회에 25미청구·불가 포함(지도 복사값 규칙) · 2.2.22 지사·동행 덮어쓰기 차단 포함) | 2026-11-09 |
| **종로맵**(meter care solution) | `jongno-combined/map.html` `APP_VERSION` / 메뉴라벨 | `20260813.3` / `v20260813.3` (계기팀 디테일에 DCU ID + 통신방식 표시. detail.js ?v=20260813c) | 2026-08-13 |
| **종로 보조앱**(jongno-snap) | `snap.html` `APP_VER` + 라벨 / snap-version.json / APK | `v20260707.7` (사진 재촬영 덮어쓰기 / 실시간QR / 카메라선택. ★범프 시 3곳 APP_VER+라벨2 갱신) | 2026-07-07 |
| **아미맵**(ami-work 작업지도) | `ami-work/js/auth.js` `FORCE_LOGOUT_VERSION` · 앱버전 `js/app-version.js` `APP_VERSION` = `app-version.json` | `20261019a` / 앱 `v20261110.7` (합동 11/10 밤 서울본부직할 종로구 등재분 추가 반영 — 종로 보강 대상에 다 들어가 채워짐, 보존 그대로 11/10·11/09·11/06, 새 백업 없음 · 앞 판 v20261110.6: 합동 11/10 정규 수집 반영 — 보존 11/10·11/09·11/06, 11/05 백업으로, 작업일 예외 남산동2가 1건을 SEQNO 로 못 박음(scripts/build_hapdong_data.py WORK_DAY_OVERRIDES 'seqno' — 공사번호로 걸면 같은 공사번호 11/10 직할 작업분이 통째로 11/09 로 끌려감) · 앞 판 v20261110.5: 미조치 마커 위에 PLC / IoT 글씨 — 마커 안 계기의 DCU통신방식 PLC -> 'PLC', K-DCU -> 'IoT', 둘 다 있으면 'PLC·IoT', 미조치(lte)는 글씨 없음, 레지스트리 badgeFrom { field, map }(js/datasets.js·scripts/datasets.py, js/map.js registryBadgeText, css .tag-reg), 상세는 그대로 · test_datasets_parity 가 js 레지스트리를 node 로 실제 실행해 대조(중첩 객체) · 앞 판 v20261110.4: 미조치를 미조치 / 미조치(lte) 로 나눔 — 계기 단위, 미조치 = DCU 대장에서 찾았고 DCU 통신방식 PLC·K-DCU, 나머지(대장미등재·HPGP) = 미조치(lte) data/michochi-lte/<지사>.json, 섞인 개소는 두 리스트에 다 나오고 마커마다 그 리스트 계기만, 상태키는 둘 다 '주소|미조치'(레지스트리 statusCategory — 나누기 전 기록 그대로, 섞인 개소 상태 공유·계기 체크는 계기별), lte 마커 진초록 #166534(markerColor 'lte'), 기본 꺼짐·켤 때만 받음, 메뉴는 미조치 바로 밑, 상세는 그대로(추가 없음) · 리스트 처리 레지스트리화 — plainKey(맨 주소 키)·statusCategory(키 이름)·deferred(켤 때만 받기)·markerColor(마커 색) 필드, js/status-key.js·scripts/status_key.py 네임스페이스·키 카테고리를 레지스트리에서(옛 목록은 대조용, map.html·stats.html 은 datasets.js 를 먼저 실음), js/map.js DEFERRED_CATEGORIES·리스트 색, scripts/archive_done_sites.py CODES, scripts/cst_daily_check.py NS_LIST(공유 키는 두 리스트 계기 합침), 아미큐 백엔드 변대주 미조치 파일 목록(app.py _michochi_globs — lte 의 HPGP 계기 변대주 유지) 이 레지스트리를 따름, gen_stats_index.py 가 통계·리스트 라벨에 들어가야 할 리스트가 0행이면 이름을 대고 멈춤 + --out-dir(임시 폴더로 세 인덱스), 시험 scripts/test_status_key_registry.py(모든 리스트 옛 키 그대로) · 앞 판 v20261110.3: 검색이 모든 리스트 + 완료 아카이브를 찾음 — 검색 창 처음 열 때 data/search-index.json 한 번 받음(scripts/gen_search_index.py, gen_stats_index.py 끝에서 같이 생성 = main 에서, 줄어들면 멈춤), 결과 이름표 = 레지스트리 리스트 이름(아카이브는 '· 완료 아카이브', 지도에서 내린 리스트는 '· 지도에서 내림'), 결과를 눌러도 지사·구·리스트 선택은 그대로 — 그 대상만 검정 임시 마커로 띄우고 이동 + 상세(위에 '리스트 이름' 줄, 지도 리스트 행은 평소 상세·상태키 그 리스트 규칙 — 안 받아 둔 지사 파일이면 그 파일로 키 계산), 아카이브·내린 리스트 행은 읽기 전용 창, 임시 마커는 다른 결과·검색 표시 줄 x·검색 창 닫기로 치움, 마커를 눌러 연 평소 상세는 그대로(js/map.js 검색 · js/detail.js _detailSearchCtx) · 앞 판 v20261110.2: 미조치에서 내년(2027) 실효 대상 계기 뺌 — 올해 실효 대상과 같은 영구 축에 목록 파일만 더함(scripts/build_michochi_data.py SILHYO_TARGETS, 목록 data/reference/michochi_exclude_silhyo_target_2027_20261110.json, 확인 = 전체번호 검색 일치·앞4·뒤4·지번 양쪽 유일 일치만), 계기를 다 잃은 개소는 빠지고 일부만 잃은 개소는 상태키 그대로, 제외 내역 엑셀 '내년 실효 대상' 시트 · 앞 판 v20261110.1: 합동 11/09 밤 서울본부직할 중구 등재분 추가 반영 — 11/10 아침 1건도 작업일 11/09 로(WORK_DAY_OVERRIDES 명시 목록), 보존 그대로 11/09·11/06·11/05, 새 백업 없음 · 앞 판 v20261109.4: 합동 11/09 정규 수집 반영 — 보존 11/09·11/06·11/05, 11/04 백업으로, 형태 위반 계기번호 3건 확인 대기 등록(원본 유지) · 앞 판 v20261109.3: 미조치 '?' 중 위치를 모르는 것(번지 없음·주소 해석 불가·본번 다름 — 본번 같은 '?' 는 그대로)만 같은 변대주의 정확 개소 옆으로 — 키 = 변대주번호(대장) > 변대주번호_원장 > 변대주명, 같은 구(같은 동 있으면 그것만) 정확 개소 medoid 둘레 고리 20m(+15m씩)에 다른 미조치 마커와 12m 이상 떨어진 자리, '?' 는 그대로, 상세 문구 없음('?' 가 신호), 좌표출처 'pole_<변대주명>_근처' 는 데이터 추적용(화면 안 그림), 옮긴 목록 data/reference/michochi_pole_near_moved_20261109.json, 주소·상태키 그대로(scripts/build_michochi_data.py where_unknown·pole_near) · 앞 판 v20261109.2: 미조치 변대주 영역을 DCU 대장(dcu_master)으로 — 25미청구·불가와 같은 fix_bdju(형태로 칸, 번호 -> 이름 -> DCUID 같은 축끼리), 찾으면 이름·번호·DCUID·통신방식·회선상태·철거판정·차수 한 묶음, 못 찾으면 번호·DCUID 비우고 대장출처 '대장미등재'(상세 'DCU 없음'), 원장 값은 변대주_원장·변대주번호_원장, 칸별 출처는 안 실음 · 앞 판 v20261109.1: 미조치를 통계에 넣음 — 레지스트리 noStats 뺌(js/datasets.js·scripts/datasets.py), 통계 인덱스 35.6MB(gzip 3.0MB), 통계 첫 화면 시간 그대로(4배 CPU 제한 5.6초→5.8초) · 앞 판 v20261108.9: 미조치 같은 지번 표기만 다른 개소를 정확 좌표로 — '219-0' 과 '219' 처럼 부번 0 이 없는 것과 같고 구·동도 같으면 exact, 산 표기가 다르면 그대로 '?', 좌표·상태키는 안 바뀜(scripts/michochi_geocode.py same_lot · --recheck 가 캐시를 API 없이 다시 판정) · 앞 판 v20261108.8: 미조치에서 올해 실효 대상 1,162 계기 뺌 — 빌더 영구 축, 목록 main data/reference/michochi_exclude_silhyo_target_2026_20261108.json(awms 연간대상 실효계기 목록을 앞4·뒤4·지번으로 맞춤), 제외 내역 엑셀 '올해 실효 대상' 시트 · 상태키 대조 테스트가 encodeKey 를 js/ws-format.js 에서 찾게 고침 · 이 판에 레벨 6+ 계기 수 동그라미(v20261108.7)도 함께 나감 · 앞 판 v20261108.7: 레벨 6 이상이면 리스트 무관 마커 대신 계기 수 동그라미 — 레벨별 지도 좌표 고정 격자(레벨 6 칸 위도 0.00865° x 경도 0.01088°, 레벨마다 2배, 전체 마커로 집계라 밀어도 칸·숫자 그대로), 글자 '미완료/전체' 계기 수(미완료 = 계기 자기 키 완료·불가 아니고 개별불가 아님, 체크는 안 셈), 상태 바뀌면 다시 셈, 누르면 레벨 4, 안내 문구 없앰(js/map.js renderClusterBubbles) · 지사·구 맞춤 상한 레벨 5 도 리스트 무관 · 앞 판 v20261108.6: 통계를 지도 위 창으로 — 메뉴 통계가 페이지를 넘기지 않고 stats.html?embed=1 을 전체 화면 iframe 으로 띄움, 닫으면 지도 그대로, 휴대폰 뒤로가기 = 닫기(js/stats-overlay.js) · 창 안 통계는 지도의 메모리 workStatus 를 그대로 씀(전송 0), stats.html 직접 열면 지도 미러(IndexedDB) + syncAt 델타만 받아 합치고 같은 키로 다시 저장(미전송 큐 있으면 저장 안 함) — 미러 형식·보관 키는 js/ws-format.js 한 곳(지도 firebase.js 와 통계가 같이 씀) · 앞 판 v20261108.5: 미조치 통계에서 뺌 — 레지스트리 noStats(통계 인덱스 36MB 방지) · LP무기록 지도 메뉴에서 내림 — 레지스트리 onMap:false(js/datasets.js·scripts/datasets.py), 파일·workStatus 그대로 · 앞 판 v20261108.4: 첫 실행(저장된 지도 위치 없음)이면 첫 마커가 생길 때 고른 지사로 한 번 맞춤 — 기본 위치 용산에 머물러 리스트를 켜도 마커가 전부 화면 밖이던 것(js/map.js _fitOnFirstMarkers) · 앞 판 v20261108.3: 구는 한 번에 하나만 — 지사 안 구 체크박스를 버튼으로, 켜진 하나만 칠함, 전체·전부 끔 없음, 저장값 ami_selected_gu 는 늘 1개(옛 여러 개·빈 값·다른 지사 구는 이 지사 구 중 먼저 나온 것 또는 첫 구로), 지사 바꾸면 첫 구(js/map.js renderGuCheckboxes·onGuSelect) · 앞 판 v20261108.2: 미조치 켰을 때 레벨 6 이상이면 마커 숨김 + '확대하면 마커가 보입니다' 안내(js/map.js markerPolicyForLevel — 카카오가 보이는 마커마다 동기 레이아웃을 돌려 수십 초 멈추던 것) · 지사·구 맞춤이 레벨 5 보다 넓으면 5로 줄임(미조치 켰을 때만) · 미조치 빌더에 합동 철거계기 제외 축 — 합동 지도 파일+아카이브의 계기번호_전 과 같은 계기는 뺌(원시 FMPMTR 만 있는 건 둠), 뺀 목록 data/reference/michochi_exclude_hapdong_removed_20261108.json, 좌표 풀 맨 끝에 미조치 이전 판 · 앞 판 v20261108.1: 마커 화면 안만 그리기 — 마커는 자료만 만들어 두고 지도 범위+사방 반 화면 안에 들어올 때 DOM·오버레이를 만들어 붙임, 나가면 뗌(js/map.js cullMarkers·attachMarker, 줌 아웃 동작은 markerPolicyForLevel 한 곳 — 미정) · 미조치 지사별 파일 data/michochi/<지사영문>.json 7개(레지스트리 fileByJisa, '*' 자리에 JISA_FILE_SLUG), 지도는 고른 지사 파일만 받고 지사 바꾸면 그 파일만 더 받음, 합친 파일 삭제 · 스크립트는 scripts/datasets.py dataset_files(d) 로 파일 목록, 지사 판정 scripts/jisa_split.py(= 지도 jisaOf), 빌더 게이트에 지사 파일 하나만 읽어도 상태키 같은지(key_diff) · 미조치를 리스트 메뉴 맨 위로(레지스트리 menuOrder, 메뉴 순서만 — 마커 겹침 우선순위는 맨 뒤 그대로) · 미조치 마커 '조' 뱃지 없앰(기본 초록) · 25미청구 마커를 분홍으로(선조치 색 물려받음, 근사 노랑이 이김) · 미조치 리스트 — 주덕기 과장 미설치 고객 리스트(11/06) AE·G·아미고(번호 기준) + 실효 잔여 15, 상태키 주소|미조치, 기본 꺼짐·켤 때만 받음, 마커 초록+'조' 뱃지, 상세에 LP 하루 수신 x/96·상 구분·계약종별·계약상태·미설치 개소, 헬퍼·아미큐 라벨 인덱스에서는 뺌(noLabel, 크기), 생성 scripts/build_michochi_data.py · 좌표 scripts/michochi_geocode.py · 실효·선조치 지도 메뉴에서 내림(onMap:false, 통계 줄은 아카이브로) · 지오코딩 구·동 검사 — geocode_cascade 가 물어본 구·동과 다른 응답을 버림(키워드 검색은 번지까지 같아야 exact), 행정동→법정동 맞춤, 게이트 validate_bdju 에 주소 구=응답 주소 구 + scripts/check_geo_gu.py --reverse(좌표 역지오코딩), 다른 구로 찍힌 합동·25미청구·25불가·광명 5건 고침 · 합동 11/07 정규 수집 반영 — 토요일 등재분 11/06 으로, 보존 11/06·11/05·11/04, 11/03 백업으로 · 실효·선조치·25미청구·25불가에서 완료·불가 개소를 리스트별 아카이브로 — 지도 파일에서 빼고 data/<리스트>-completed-archive-YYYYMMDD.json(실효는 silhyo-), 레지스트리 archivesGlob 으로 통계 분모·헬퍼/아미큐 라벨은 그대로, scripts/archive_done_sites.py(상태키 게이트), 미청구·불가 빌더는 아카이브 계기를 다시 안 올림 · 합동 11/05 정규 수집 반영 — 보존 11/05·11/04·11/03, 11/02 백업으로 · 25불가 LP 제외에서 작업 기록 있는 개소는 남김 — 유지 목록 data/reference/bulga25_lp_keep_worked_*.json 을 B10 이 먼저 봄, 개소 단위 · 25불가에서 한전 LP 성공 회신 계기 뺌 — 목록 정본 data/reference/bulga25_lp_success_*.json, 빌더 제외축 B10, 재생성 없이 적용은 build_michunggu_bulga_20260920.py --lp-only · 합동 11/04 정규 수집 반영 — 보존 11/04·11/03·11/02, 10/30 백업으로 · 합친 마커 계기 체크·불가를 마커 안 모든 상태키 합집합으로 표시, 쓰기는 계기 자기 키·해제는 마커 안 전부 — js/detail.js meterOwnKey/markerKeys, 상태 버튼은 그대로 · 합동 11/03 밤 마포용산 현석동 등재분 반영(23:50 수집, 새 백업 없음) · 합동 11/03 정규 수집 반영 — 보존 11/03·11/02·10/30, 10/29 백업으로, 형태 위반 계기번호 1건 확인 대기 등록(원본 유지) · 합동 11/02 밤 마포용산 등재분 반영 — 11/03 원본은 넣지 않음, 원본 파일 직접 지정 빌드 · 합동 11/02 저녁 등재 서울본부직할분 반영(21:53 원본, 다른 지사 그대로) · 합동 11/02 수집 반영 · 선조치를 통계에 자기 리스트로 — noStats 뺌, 통계 인덱스 지사 이름 맞춤('노원도봉'→'노원도봉지사') · 헬퍼·아미큐 리스트 라벨 인덱스 data/meter-list-index.json 을 레지스트리에서 직접 만듦(scripts/gen_meter_list_index.py, 이름표 __names 포함 — 새 리스트 자동) · 강북 계정 리스트 메뉴에서 '추가' 줄 없앰 — js/datasets.js datasetVisibleToUser 가 ORG_CAN_ADD 로 판정, kmtest 는 그대로, 7월 추가 계기는 기존 개소 상세 안 '추가' 표시로 그대로 · 합동 11/01 수집 반영 — 주말 등재분 직전 영업일로 · 강북 계정 계기·주소 추가 전부 없앰 — 왼쪽 아래 +·주소 추가 창(이미 있는 주소에 계기 붙이기 포함)·상세 '+ 계기 추가'·추가 계기/개소 삭제, js/config.js ORG_CAN_ADD(광명 kmtest 만 true)로 add-site.js·detail.js·firebase.js 함수가 먼저 거절, 이미 들어간 추가 계기는 보기만, 공지 20261031-1 내림 · 광명 시험 작업내역 — scripts/seed_gm_demo.py 로 workStatus/gwangmyeong 에 demo:true 50곳(10/27~31, 시험작업자1~3) 넣음, --remove 로 그것만 지움 · kmtest 통계(stats.html GM_STATS): 기록 workStatus/gwangmyeong + 분모 광명 개소 목록, 묶음>지역 트리, 강북 기록·통계 인덱스 안 받음, 메뉴에 통계 · kmtest 광명 작업 계정 — 보기 전용 해제, 완료·보류·불가·계기 체크·계기 추가(어느 개소든)·주소 추가 가능, 기록은 workStatus/gwangmyeong 따로(js/config.js WS_DATASET_BY_GROUP, 소속 설계 0단계), 보관소 키 '__kmtest' 접미로 분리, 강북 경로는 읽지도 쓰지도 않음, 주소 추가 구역 = 켜진 묶음 · view-only.js 삭제 · 지도에서 주소 추가 — 왼쪽 아래 + → 위치 누르기 → 리스트 고르고 계기번호 → 저장, js/add-site.js · 켜진 지사 구역 밖·주소 없는 곳 거부 · 이미 있는 주소면 그 개소에 계기 붙이기 · 리스트 = 보이고 켜진 리스트 + '추가'(기본, 청록+'추'), 상태키는 그 리스트 규칙(네임스페이스면 '지번|리스트', 실효는 맨 지번 — 예전 기록 있으면 막음) · 기록 = workStatus 의 site 하위 + added_meters, rules 변경 없음, 삭제 = site.deleted 표시(만든 사람·관리자, 상태 있으면 막음) · 통계 분모 제외·일별 실적엔 포함 · 공지 20261031-1 · 길찾기 T·N·K 를 종로맵과 같은 자리·크기로 — 주소 오른쪽 × 옆, 버튼 34px·마크 21px, 평면 브랜드색, '길찾기' 줄 삭제 · UI 정리 — 그림 이모지 제거(로그인 아이콘·주소 앞·완료/보류/불가/초기화 버튼, 화살표·×·◎ 등 기호는 유지), 로그인 '한전KDN 강북지사' 빼고 글자 로고, 주소 앞 '도로명'·'지번' 회색 표시, 고객번호 복사 버튼, 상태 버튼 46px · 선조치 리스트 — KDN 보강공사 추가분 기시설 재시공, 전 계정 공개·kmtest 제외, 업데이트 후 켜진 채로(defaultOn), 상태키 주소|선조치, 분홍 마커+'선' 뱃지·겹치면 맨 위, 통계 분모 제외(noStats), 상세에 요청일·비고 전부·LP·이전 시공, 공지 '기시설·교체로 작성' · 생성 scripts/build_seonjochi_data.py · LP 무기록(확인용) 리스트 복원 — 관리자 혼자(AUTH_GROUPS.owner), 파일은 9/20 내리기 직전 판 · 광명 근처 단계 ? 다시 붙임 — 위치는 전주 근처로 옮긴 그대로, 6차 pole_near 되돌림 · 광명 ? 줄이기 — 근사 좌표 계기를 같은 동 안의 같은 전주 정확 개소 위치로(엄격=좌표정확도 pole, 느슨=? 유지)·장소 이름 키워드(같은 동만, keyword), 상세에 위치 출처 줄 · 광명 공지 분리 data/notices-gwangmyeong.json · 광명 — 지사·구 필터 대신 리스트 밑 묶음 4개(광명동·철산·하안·소하·일직·학온·옥길, 빌더 GROUP_BY_AREA), kmtest 첫 진입 전부 끔 · 광명지사 리스트 — 다른 회사 작업분, 전용 계정 kmtest 에만 보이고 우리 계정엔 안 보임 · kmtest 는 보기 전용(Firebase 연결·저장 0, js/view-only.js) · 지역(시·구·동) 필터 · 상태키 주소|광명 · 생성 scripts/build_gwangmyeong_data.py · 합동 종로 보강 대상 확대 — 서울본부직할이면 공사번호 무관, 대장 고객번호+철거계기 두 키 정확일치만 · 합동 10/29 수집 반영 · 합동 10/28 마포 밤 등재분 재수집 반영 · 합동 10/28 수집 반영 · 통계 전체 탭 지사>구 트리 · 25미청구 한전 원문 형식 주소를 '서울특별시 구 동 지번' 체계로 정규화 — scripts/michunggu_addr_norm.py, 빌더가 저장 전 호출, 기존 완료 주소와 합쳐지는 계기는 HOLD_METERS 로 보류 · 구 판별 폴백 — 주소에 구 없으면 도로명주소·지번주소로, 25미청구 구 없는 주소가 구 필터에서 사라지던 것 수정 · 합동 10/27 수집 반영 · 상세 모달 리콜 의심 계기 띠 "제조년도 2603·2604 작업불가" — 표 `js/recall.js` 하나, 해제 시 표 비우기. ★배포마다 라벨·모든 ?v=·APP_VERSION·app-version.json 같은 값) | 2026-11-10 |
| **헬퍼**(awms-helper) | `versionName` / inject | `1.0.79` (영준님 폰만 1.0.79.1 시험판 — 키보드 높이 반영) / inject `v94` (카톡 OTP 요청 표시를 Enter 키 로그인·POST /login 요청에서도 찍음 — 버튼만 보던 구멍으로 아미큐·헬퍼 OTP 자동입력이 스킵되던 것 · 계기 리스트 라벨에 선조치 + 리스트 이름을 인덱스 __names 에서 읽어 새 리스트 자동 · 계기 리스트 라벨 매번 최신 확인 · AC5E8C 모뎀 통신방식 자동 k-dcu · 전 작업자 공개 — 새 실험만 __isTester 게이트: 키보드에 가린 칸 끌어올리기 · 계기번호 형식·리스트 소속 라벨 · 모뎀맥 내 자재 라벨 · 새 행 지사·동행을 헬퍼 설정값으로 강제 · 25미청구 계기면 비고에 25) | 2026-11-03 |
| **OTP수집기**(awms-otp-collector) | `versionName` | `1.0.1` (카톡 백그라운드만 정리. ★네이티브 자동배포X, APK수동설치) | 2026-07-03 |
| **awms-bridge-inject**(리모컨 공용) | `awms-bridge-inject.js` `VER` | `v80` | 2026-06-20 |
| **명륜 팀배분**(myungroon) | `jongno-combined/myungroon.html` `myungroon_app_version` / 메뉴라벨 | `20260624.1` | 2026-06-24 |

★**`ami-queue-www/`는 죽은 옛 웹뷰다 — 아미큐 아님, 고쳐도 폰 반영 0**(2026-08-11 실증).
★**`cst-input/www/`(collect.js·index.html)도 폰 반영 0 이다** — 백엔드가 static 으로 서비스하지만
작업자 앱이 쓰지 않는다. 실사용 화면은 **네이티브 `cst-app/android/.../ui/CollectScreen.kt`**(Compose)다.
판별법: 폰이 보내는 saveAct body 에 `ham`·`bdju`·`extMac`·`replaceReason` 이 들어 있는데
`cst-input/www/collect.js` 는 그 넷을 보내지 않는다(실측 2026-09-29, `~/.ami-cst-archive/<날짜>/*/job.json` 대조).
★**`cst-app/` 은 `.gitignore` 라 레포에 없다** — 맥 로컬에만 있고 배포는 `assembleDebug` 로 만든
APK(debug 키 서명, 배포본과 서명 동일)를 `cst-input/amiqueue.apk` 로 덮어쓰는 방식이다.

규칙: 계기큐·아미큐 JS는 github 원격로드라 `APP_VER`+push만으로 반영(APK는 네이티브 변경 시만). 종로맵은 `APP_VERSION`+`?v=`+메뉴라벨 함께([[jongno_app_version_deploy]]). 아미맵 `FORCE_LOGOUT_VERSION`은 긴급 시만([[ami_work_init_logout_fix]]).

## 데이터 규칙 (절대 준수 — 상세 `core/데이터규칙.md`, `core/계기도메인.md`)
- 데이터 누락 금지 — 좌표 실패해도 동 중심 좌표로 넣기 (폴백: 도로명→지번→동중심, exact/approximate 표시)
- **★엑셀은 `0` 으로 시작하는 번호의 앞 0 을 생략해서 준다 — 자릿수로 판단해 복원하라.** 한전 자료가 전부 엑셀이라 항상 겪는다. 눈으로 "0 으로 시작하나" 보지 말고 **길이를 세라**. 실측 자릿수(2026-09-20, 미청구 8,994 기준):

| 필드 | 자릿수 | 0 시작 | 영문 포함 | 복원 |
|---|---|---|---|---|
| 계기번호 | **11** 고정 | 2,462 | 566 | 순수 숫자면 `zfill(11)`, 영문 접두는 그대로 |
| 고객번호 | **10** 고정 | 전건 | 0 | `zfill(10)` |
| 변대주번호 | **8** 고정 | 3,401 | 5,181 | 영문 섞임 — 길이만 확인 |
| DCU ID | **10** 고정 | 3,976 | 전건 | 영문 섞임 — 길이만 확인 |
| 모뎀 MAC | 11 또는 12 | 4,996 | 3,989 | **자릿수가 둘이라 zfill 금지**([[boranggi_mac_restore_and_amigo_wireless]]) |
| 봉인번호 | **7** 고정 | — | — | `zfill(7)` |

  ★`zfill` 은 **자릿수가 하나로 고정된 필드에만** 쓴다. MAC 처럼 11·12 가 섞이면 짧은 쪽을 늘려 틀린 값을 만든다.
- **★계기번호 법칙 — 11자리 · 1~2번째만 영문 가능 · 3~4번째는 타입코드 · 5~11번째는 전부 숫자**(영준님 2026-09-20).
  검사식 `^[0-9A-Z]{2}[0-9]{9}$`. 3번째 이후에 영문자가 있으면 **오타다**.
  - 실측 2026-09-20: 미청구 8,306 중 4건 · 불가 5,696 중 2건이 위반(`071909442S1`·`0753G186525`·
    `3919048106A`·`4719B160548`·`9419007057`·`2450090698`). **한전 원본 엑셀에 그대로 들어온 값**이다 —
    우리가 망가뜨린 게 아니라 현장에서 잘못 적어 올린 것이다(`S↔5` `G↔0` `B↔8` 혼동, 한 자리 누락).
  - **★오타 계기는 대장에 안 붙어 '미처리 유령 건' 으로 남는다.** MAC·고객번호로 역추적해 제대로 된
    번호를 찾아보면 이미 끝난 일인 경우가 많다 — 위 6건 중 **4건이 청구완료·26년 시공완료·중복**이었다.
    리스트업 때 이걸 잡으면 헛걸음이 줄어든다.
  - **자동 교정 금지.** 추정으로 고치면 없는 계기를 만든다. MAC·고객번호로 **다른 소스에서 확인**하고,
    근거가 없으면 그대로 두고 한전에 물어라.
- **계기번호: 영문자 접두를 지우지 마라.** `A0530188699`·`LA530151258` 처럼 신설계기에 접두가 붙는다(한전 보강현황 9/8 판 10%·8,205건). 정규화는 **영문자가 섞였으면 그대로 두고(공백·하이픈만 제거·대문자화), 순수 숫자일 때만 `zfill(11)`**. ★"엑셀 float→int→str→zfill(11)"은 **엑셀이 숫자로 읽어 앞 0 이 날아간 경우를 복원**하라는 뜻이지 숫자만 남기라는 뜻이 **아니다** — 2026-09-10 에 그렇게 오독해 167건을 뭉갰다. 아미큐 `normMeter`(CollectScreen.kt)·통신팀 합동 빌더가 정답 구현이다, **새로 짜기 전에 그걸 봐라**. [[meter_no_prefix_preserve]]
- **★고객번호는 10자리 고정이고 전부 `0` 으로 시작한다** (실측 2026-09-20: 미청구 7,349 · 실효 3,166 · 합동 5,035 — 전건 10자리·100% 0 시작). 계기번호와 달리 영문자가 섞이는 일은 없다.
  - **★판단 기준은 자릿수다.** 자릿수가 고정이므로 **10자리가 아니면 앞의 0 이 잘려 온 것**이다 — 엑셀·CSV 가 숫자로 읽으면 `0152086658` 이 `152086658`(9자리)로 온다. `0` 으로 시작하는지 눈으로 보지 말고 **길이를 세서 `zfill(10)`** 로 복원하라. 같은 원리로 계기번호는 11자리다(단 영문자 접두가 붙으면 그대로 둔다).
  - **매칭 1순위 키가 이것이다**([[ledger_match_key_rule]]). 계기는 교체·재사용으로 개소를 옮겨다니지만 고객번호는 계약에 붙어 안 변한다.
  - **★한전 파일에 고객번호 열이 둘 있을 수 있다.** 9/20 회신 `25년미청구분_v2` 는 O열 고객번호가 `#N/A` 투성이라 유효 4,926 뿐이고 BC열에 `고객번호_2` 가 따로 4,612 있었다. **두 열을 coalesce 해야 유효 7,254** 가 된다 — 한 열만 보면 매칭이 절반으로 깎인다(둘 다 값이 있는데 서로 다른 행이 22건 있으니 우선순위를 정해 기록할 것).
- **★변대주 3축은 형태가 다르고 끼리끼리만 매칭한다 — 리스트업마다 게이트를 통과시켜라.**
  `변대주명`=한글(`갈현간 48R2R3`) / `전산화번호`=8자리(`9628E291`) / `DCU ID`=10자리(`9628E2916S` = 번호+2자리).
  이름으로 찾아 번호를 붙이는 식으로 **축을 넘나들면 조용히 틀린다**([[dcu_match_axis_separation]]).
  단 `DCUID 앞 8자리 = 전산화번호` 는 대장 19,007건 예외 0 인 **계산**이라 유도해도 된다(조회가 아니다).
  이름 비교는 **공백만 지우고** 한다(대장 고유 18,993개, 공백 제거해도 충돌 0 — 저장은 원문 그대로).
  - **게이트: `python3 scripts/validate_bdju.py <산출물.json>` — 실패하면 산출물을 내지 마라.**
    영준님이 리스트업마다 같은 지적을 반복하셨다(9/18·9/20). 메모리에 적어도 코드에 게이트가 없으면
    산출물 단계에서 안 걸린다. 실측 2026-09-20: 미청구 8,326건 중 이름 칸에 번호 903·DCUID 574 가 들어가 있었다.
- **★리스트업 산출물은 반드시 원본과 대조하고 배포한다.** 자기 산출물 안에서만 보는 검사("11자리 아님 0건·중복 0건·빈값 0건")는 **뭉갠 값도 통과**시킨다. 원본 엑셀과 **계기번호 집합 차집합 양방향 + 접두 문자 건수 + 좌표 null** 을 대조하라 — 위 사고는 이 대조 한 번이면 배포 전에 걸렸다.
- 계기타입: 엑셀 믿지 말고 계기번호 3~4자리 직접 파싱 (17→E, 19→EA, 25/26/27·45/46/47→G, 53/55→Amigo)
- 변대주/상호 '0' → 빈 문자열

## 새 사이트 데이터 추가 프로세스
1. 데이터 수집 (사진 OCR / 엑셀 / 스프레드시트)
2. 주소 변환: 주소변환.py (지번 → 도로명, 카카오 API)
3. 좌표 추출: 좌표추출.py (도로명 → 좌표, 3단계 폴백) → ami_data_coords.json
4. site-data.json에 합치기 (계기번호 중복 체크)
4.5. **★ `python3 scripts/apply_dcu_status.py data/site-data.json data/rework-data.json`** — DCU 철거예정 판정 부착 (해지→'DCU 철거예정 개소 LTE 시설' / 유지→'DCU 유지'). 매칭키=변대주명+지사, 태그는 `dcu_철거예정` 필드에만. 목록 정본 `data/reference/DCU_철거_예정_개소_목록.xlsx`. **새 리스트마다 무조건**([[dcu_removal_tag_rule]])
5. **★ `python3 scripts/gen_site_version.py`** — site-data.version.json 재생성 (안 하면 작업자 폰이 옛 IndexedDB 캐시 사용. site-data.json 바꾸면 무조건)
6. ~~Firebase 업로드: upload_sitedata.py → siteData/charger4eleccar~~ **폐지(2026-08-02)**. Firebase `siteData` 노드를 읽는 곳이 이제 없다 — 지도는 `js/map.js`가 `./data/site-data.json`을 GitHub Pages에서 직접 읽고, 통계는 `data/stats-site-index.json`(정적)을 읽는다(RTDB 22MB 반복 다운로드 제거 조치). 올릴 필요 없고, `scripts/upload_new_data.py`는 workStatus를 통째 교체(`ref.set`)하므로 **실행 금지**(완료 1만여 건 유실 위험)
6.5. **★ `python3 scripts/gen_stats_index.py`** — data/stats-site-index.json 재생성 (stats 지사별 분모 = site-data + 완료 아카이브 + 재방문. **로컬 파일 기준**이며 Firebase를 안 읽는다. site-data.json 바꾸면 무조건)
6.6. **★새 리스트를 올리면 헬퍼·아미큐 라벨도 확인**(영준님 2026-11-02 "통계는 하면서 헬퍼·아미큐 리스트 띄우는 건 왜 안 하니"). 레지스트리(js/datasets.js + scripts/datasets.py)에 한 줄 넣고 6.5 를 main 에서 돌리면 끝에서 `data/meter-list-index.json` 이 **레지스트리 기준**으로 같이 만들어진다(통계 noStats 와 무관). 로그 마지막 줄 `lists ...` 에 새 코드가 있는지 보고 두 파일 함께 커밋. 헬퍼 inject(v93~)·아미큐(2.2.26~, 백엔드 /api/michunggu badges)는 인덱스 `__names` 를 읽어 코드 수정 없이 따라온다. 확인: 헬퍼 계기번호 칸 라벨, 아미큐 계기 입력 배지. 라벨에서도 빼야 하면 `allowGroup`
7. 작업상태 업로드: scripts/upload_work_status.py → workStatus/charger4eleccar
8. git commit & push
9. 브라우저 확인

## ★한전 엑셀이 오면 (영준님 지시 2026-09-08)
1. **원본을 `data/inbox_jdg_<받은날짜>/` 에 보관한다.** 스크래치패드에 두지 마라 — 비워지면 사라진다(2026-09-08 실증: 8/28 모뎀작업리스트를 못 찾아 30분 낭비)
2. **로컬 SQLite `data/ami.db` 에 적재한다** — `python3 scripts/xlsx_to_db.py <xlsx>`. 시트 하나 = 테이블 하나, 열 이름 원문 보존, `계기번호_norm`(zfill11)·`snapshot`·`src_file` 추가. 같은 snapshot 재적재는 멱등, 다른 snapshot 은 누적(리스트 간 변화 대조용)
3. **조회는 `python3 scripts/db.py <계기번호|MAC|키워드>`** 또는 생 SQL. 외부 DB·웹 서비스 금지 — 로컬 파일 하나다
- **★Gmail 첨부는 zip 인 경우가 많다** — 주덕기 과장(`deokgi_7149@kdn.com`)은 리스트를 zip 으로 보낸다. `filename:xlsx` 로만 검색하면 놓친다. `from:deokgi_7149@kdn.com` 로 첨부 전체를 봐라. 압축 안 파일명은 cp949 라 `cp437→cp949` 로 풀어야 안 깨진다
- **awms 전 작업자 시공기록 정본 = 장애 엑셀의 '모뎀작업리스트' 시트**(8/28분 51,779행, 6/8~8/28 서울 7지사). 변대주번호·DCUID·봉인·신호레벨·사진유무까지 있다. 계기 단위 재(再) 판정축이 이것이다

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
