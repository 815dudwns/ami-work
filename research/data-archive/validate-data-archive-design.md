# 검증관리자 데이터 아카이브·비용 설계

- 작성: 검증팀 (ami-work) · 2026-07-21 KST
- 상태: **조사+설계 (코드구현·삭제·이동 없음. PM 승인 후 집행)**
- 배경: ami-jongno Firebase 비용 급증(6월 56,287원). 주범 지목 = RTDB egress(workStatus 반복 다운로드). 계기팀이 workStatus 주간 아카이브 병행 설계 중. 영준님 지시 = "데이터관리자(검증관리자)도 같은 관점으로 데이터 처리 방식 검토".

---

## 0. 한 줄 결론

검증 데이터 자체의 **저장량은 미미**(아카이브 불필요). 그러나 검증 시스템의 **동작(자동검증 워처 + `/apply`)이 workStatus 전체 트리를 shallow 없이 반복 다운로드**해 egress에 구조적으로 관여한다. 따라서 이 문서의 실질 과제는 "검증 데이터 아카이브"가 아니라 **"검증쪽 read 패턴 절감"**이다.

---

## 1. 실측 데이터 (2026-07-21)

### 1-1. 검증 데이터가 어느 Firebase에 무엇을 쌓나
- 판정 노드 `ocr_review/*` = **ami-jongno** DB에 저장 (ami-work 아님). 근거: `dataset_config.json`의 `rtdb_review_url` = ami-jongno, app.py 수십 곳 참조.
- ami-work-1c49a 참조는 딱 1곳(`_AWMS_DONE_URL`, app.py:2841) = awms 전송완료 플래그용, 검증 데이터와 무관.
- 리뷰 HTML = ami-jongno **Storage `reviews/*.html`** (public). 사진은 신규 업로드 없음 — 기존 사진 다운로드 후 HTML에 base64 인라인(800px/q80 압축).

### 1-2. 저장 누적량 (shallow + 표본 실측)
| 항목 | 크기 | 비고 |
|---|---|---|
| `ocr_review` 전체 | **~28 KB** | 11일치 판정 누적(daily_val 7일 + daily_removal 4일 + cycle_review 등) |
| 판정 1건 | ~30~80 bytes | `{"text":"11798","type":"value"}` 수준 |
| 하루치 daily_val | 1~2 KB | 18~33건 |
| `workStatus/jongno` | **~6.5 MB** | 2,089 주소, 레코드당 median 1.6KB·max 90KB |

→ **검증 판정 데이터 = workStatus의 0.42% (1/238).** 저장·아카이브 관점에서 무시 가능.

### 1-3. egress(다운로드) — 검증쪽 관여 지점 (핵심)
검증 코드에 **shallow/부분 조회가 전무**(`grep shallow` 0건). workStatus는 항상 전체 트리를 GET한다.

1. **`daily_cycle.fetch_db`** (daily_cycle.py:396-400): run_daily 1회 = `workStatus/jongno.json` 전체(~5.9MB) 1 GET.
2. **자동검증 워처** (app.py:4880-4930): 기동 60초 후 시작, `sleep(3600)` = **1시간 주기**, KST **08~19시대에만** 실행 → 하루 **~12회** run_daily → 매번 fetch_db 전체 GET. 사용자 트래픽과 무관하게 상시 발생.
3. **`/apply`** (app.py:1958-1981): 안전 명목으로 캐시 우회, **apply 1건마다 workStatus 전체 트리 GET**.
4. UI 계열(/results·daily_summary·검색)은 45초 TTL 공유 캐시로 완화. 단 `/apply`·워처가 캐시 무효화(`_invalidate_ws_raw`, app.py:2071·4913)하면 다음 요청이 전체 재다운로드.
5. daily_cycle이 OCR 대상 사진을 Storage에서 증분 다운로드(run_daily마다 그날 신규분).

### 1-4. egress 비용 환산 (정직한 수치)
- 워처만: 5.9MB × 12회/일 × 30일 = **~2.1 GB/월 ≈ $2.07 ≈ 약 2,900원/월** (Firebase RTDB egress $1/GB).
- `/apply`: 건당 5.9MB. 하루 apply 100건이면 +0.59GB/일 = +17GB/월 = **+$17/월 급** (가변, 실사용 apply 빈도에 비례).
- **평가**: 워처 단독 기여는 6월 총액(56,287원)의 ~5%로 지배적이지 않다. 그러나 `/apply` 무캐시 전체 GET은 사용량에 따라 워처의 수 배가 될 수 있어 **잠재적으로 유의미**. 검증쪽이 egress의 유일·최대 축은 아니지만(라이브 작업자 앱의 workStatus 반복 read가 더 큰 축일 것 — 계기팀 소관), **줄일 수 있는 명확한 레버가 검증쪽에 존재**한다.

---

## 2. 결론 층위 분리

### 층 A — 검증 데이터 저장/아카이브: **미미 → 과설계 금지**
- ocr_review 28KB는 아카이브해도 절감 0. **주간 아카이브 이관 불필요.**
- 최소 retention만: 오래된 `daily_val_/daily_removal_` 노드를 일정 기간 후 정리(선택). **단 human 판정(human/human_skip)·verdict은 의도적 보존** — 사람 판정 보호 규칙(daily_cycle_human_status_preserve).
- retention은 비용이 아니라 **위생(노드 정돈)** 목적. 시급도 낮음.

### 층 B — 검증 시스템 egress: **진짜 레버 (코드수정 필요, 집행은 승인 후)**
저장 아카이브와 무관하게, read 패턴을 고치면 검증쪽 egress를 크게 줄일 수 있다. 우선순위순:

| # | 레버 | 현재 | 개선안 | 예상 효과 | 리스크 |
|---|---|---|---|---|---|
| B1 | **워처 빈도** | 08~19시 매시간(12회/일) | 마감 후 1~2회 + on-demand 트리거로 축소, 또는 신규 레코드 있을 때만 실행 | 12회→2회 = egress 1/6 | 실시간성 하락(검증은 마감후 배치라 무해) |
| B2 | **워처 fetch_db 조건부 GET (rev/ETag)** ★계기팀 강추 | 매시간 무조건 전체 5.9MB | RTDB REST 조건부 GET: `X-Firebase-ETag:true`로 ETag 수신 → 다음부터 `if-none-match:<etag>`. **변경 없으면 304(바디 없음), 변경 있을 때만 5.9MB.** 워처가 매시간 돌아도 실제 변경 회차만 풀다운 | 하루 12회 중 변경 없는 회차 egress 제거. **신선도 100% 유지**(B1과 달리 트레이드오프 없음) | 낮음. 표준 HTTP 캐시 메커니즘 |
| B3 | **`/apply` 무캐시 전체 GET** | 매 건 전체 트리 | 해당 addr 서브트리만 GET(`workStatus/jongno/{addr}.json`) | 건당 5.9MB→수 KB. 최대 효과 | 안전장치(전체 대조) 축소 검토 — 리프 단위라 addr 서브트리로 충분 |
| B4 | **캐시 무효화 남발** | apply·워처가 전역 캐시 flush | 무효화를 해당 addr만 부분 무효화 | UI 재다운로드 감소 | 캐시 일관성 |

**우선순위 재정렬 (계기팀 catch-up 레버 정합, 2026-07-21)**:
- **B2(워처 조건부 GET) = 즉효·무해 최우선.** 계기팀 P1(catch-up 풀다운 횟수 감축)과 동일 성격 — "풀다운을 꼭 필요할 때만". 신선도 손실 없이 워처 egress를 변경 없는 회차만큼 제거. **B1(빈도 축소)의 상위호환** → B1은 B2 적용 후 재검토(대부분 불필요해질 수 있음).
- **B3(`/apply` addr 서브트리 GET)** = 스파이크·확장 대비 구조개선. apply는 사용량 비례라 잠재비용 크고, 리프 write라 전체 트리 대조 불필요.
- 셋 다 "shallow 없는 전체 풀다운을 없앤다"는 계기팀 catch-up 레버와 한 묶음 → **패키지 집행 적합**.

**양팀 공동 집행 순서 (계기팀 정합 확정, 2026-07-21)**:
- **1차 = 조건부 풀다운 패키지("변경 있을 때만")**: 계기팀 P1(catch-up gate) + P2(워처 ETag) + **검증팀 B2(워처 조건부GET)·B3(`/apply` addr 서브트리GET)**. 성격 동일 → 한 패키지로 먼저 PM에 올림.
- **2차 = P3(주간 아카이브)**: 남은 풀다운 크기 축소용으로 뒤에 붙임. 검증데이터는 저장 미미라 이관 없음(규약만 채택).

---

## 3. 계기팀 정합 규약 (합의 완료)

계기팀과 주차경계·위치 규약 정합(2026-07-21 협의):
- **주차경계**: KST(Asia/Seoul) 기준 ISO week, 월 00:00 ~ 일 24:00. 주키 = `YYYY-Www` (예: `2026-W30`). Python `isocalendar`/JS 동일계산.
- **아카이브 위치**: 같은 DB(ami-jongno), 라이브 앱이 안 읽는 `archive/` 하위. 계기팀 = `archive/workStatus/jongno/{YYYY-Www}`, 검증팀 = 형제노드 `archive/ocr_review/{YYYY-Www}`. 같은 DB라도 라이브 read 경로 밖이면 egress 0.
- **삭제/보존**: 아카이브 write 성공 확인 후 원본 remove를 1회 multi-path update로 원자처리, 실행 전 백업 json 필수, 복원 = archive 읽어 원경로 되쓰기. 핵심경계값(월요일/KST/ISO)만 공유, 위치·복원은 팀별 독립.

**검증팀 입장**: 저장이 미미하므로 검증 데이터는 **아카이브 이관을 하지 않는다**(층 A). 다만 만약 향후 필요해지면 위 규약(`archive/ocr_review/{YYYY-Www}`, 동일 경계값) 그대로 채택. **계기팀 아카이브(층 B2 간접 기여)**: 라이브 workStatus 노드가 주간 아카이브로 작아지면 검증 fetch_db 전체 GET egress도 자동으로 줄어든다 — 두 팀 레버가 상보적.

---

## 4. 권고 (PM 결정 요청)

1. **층 A(검증 데이터 아카이브)**: **하지 않음.** 저장 미미. 최소 retention은 선택사항·저시급.
2. **층 B(egress 절감)**: 검증쪽 실질 과제. **B3(`/apply` addr 서브트리 GET) + B1(워처 빈도 축소)** 우선 집행 권고. 코드수정이므로 PM 승인 후 별도 작업.
3. **계기팀 workStatus 아카이브**가 라이브 노드를 줄이면 검증 fetch_db egress도 동반 감소 — 계기팀 진행분과 정합 유지.
4. **다음 스텝**: B3/B1 구현 착수 승인 여부 결정. 승인 시 dry-run(egress 계측 로그) → 검증 → 집행 순.

---

## 부록 B: B1/B3 절감액·트레이드오프 (2026-07-21 실측, PM 대기용)

**apply 빈도 실측** (`admin_validate/audit` 349건 집계): apply 110건 / 6일. 일평균 18.3건(초기폭주 포함·과대), **정상운영(6/30~7/3) ~3.75건/일**, 최대일 62건(6/28 초기 백필). apply 7/3 이후 0 — 워크플로우 변경 가능성(전송탭 흐름). validate 237·swap 2·rollback 0.

### B3 — `/apply` addr 서브트리 GET
- **절감액**: apply 1건당 5.9MB→수KB. 정상운영 3.75건/일 = **~0.66GB/월 ≈ 900원/월**. 초기폭주 기준(18.3건/일) = 3.2GB/월 ≈ 4,400원. **최대일 62건 = 366MB/일 스파이크**.
- **평가**: 현재 비용 절감은 작음(월 ~900원). 가치는 비용보다 ①대량 백필·재검증일 egress 스파이크 방지 ②향후 실사용(데이터관리팀 확대·apply 증가) 대비 구조 개선. 리프 write라 전체 트리 대조 불필요 → **안전성 손실 없이 개선 가능**.

### B1 — 워처 빈도 12→2회
- **절감액**: 워처 5.9MB × (12→2회) = **1.75GB/월 절감 ≈ 2,400원/월**.
- **지연영향(트레이드오프)**: 워처는 당일 신규 레코드 자동검증을 매시간 반영. 2회(예: 정오+마감후)로 줄이면 **근무 중 검증현황 반영이 최대 반나절 지연**. 단 데일리검진은 본질적으로 마감 후 배치이고, 영준님 실사용도 퇴근길 리뷰HTML 선호 → **마감후 1~2회로 흐름상 무해**(오히려 마감 정렬). 관리자가 근무 중 실시간 검증 진행을 봐야 하는 경우에만 지연 체감. → **영준님 판단사항**.

**합계**: 검증쪽 egress 절감 총 월 ~3천~7천원 수준(부수적). 진짜 레버(80~85%)는 계기팀 workStatus catch-up. B3는 비용보다 스파이크·확장 대비 구조개선으로 가치. → 계기팀 설계와 **패키지 집행**(PM 결정).

---

## 부록 C: 집행 결과 (2026-07-21, 영준님 최종승인)

**B2 — 워처 fetch_db 조건부 GET** (`daily_cycle.py`, git 미추적):
- `_fetch_ws_raw()` 추가: RTDB REST `X-Firebase-ETag:true`+`If-None-Match` → 변경 없으면 304(0B)로 로컬 캐시(`.ws_cache/jongno_raw.json`) 재사용, 변경 시만 전체 풀다운. 캐시 미스/에러 시 전체GET 폴백(기존 동작 보존).
- `fetch_db()`가 `_fetch_ws_raw()` 경유. **검증**: 1차 200(6.37MB)→2차 304(egress 0), 두 raw 완전 동일(신선도 100%). fetch_db 필터 정상(6/29 124건). `.gitignore`에 `.ws_cache/` 추가.

**B3 — `/apply` addr 서브트리 GET** (`app.py`, git 추적):
- mid→addr 인덱스 캐시(`_MID_ADDR_IDX`, TTL 600s) 추가. apply write는 매핑을 안 바꾸므로 무효화 안 함. `/apply`가 인덱스로 addr를 찾아 **해당 addr 서브트리만 fresh GET**(현재값 신선도=안전장치 유지) → 전체 트리(~6MB) 회피. 인덱스 미스/stale/신규 mid → 전체GET 폴백+인덱스 재구축(기존 동작 보존). 스왑은 같은 addr 내 필드 교환이라 매핑 불변 → 무효화 불필요.
- **검증**(dry_run/멱등 skip만, 실제 값 변경 0): 인덱스 미스(구축)·히트(서브트리) 두 경로 현재값이 DB와 정확 일치, 멱등 skip 정상, 없는 mid 폴백→404.

**재시작**: `launchctl kickstart -k gui/501/com.ami.val-backend`(launchd 관리, 이중기동 회피). 새 프로세스 정상 startup, health 200.

**별도 발견(PM 보고)**: 8765에 유령 프로세스 `python -m http.server 8765`(pid 22107, IPv6 `*:8765`, 7/18~)가 상주. IPv4 localhost는 uvicorn이 서빙해 검증 API엔 무관하나, IPv6로는 파일서버가 노출될 수 있어 정리 대상(원인 불명 → 신중 처리).

---

## 부록 D: P3 관문 정합 확정 (검증 데이터관리자 안 깨지게)

계기팀 P3(주간 아카이브, 완료계기 stub화) 착수 전 "fetch_db가 아카이브된 완료계기 상세를 필요로 하는가" 판정:

1. **fetch_db(데일리검진) = 무해(OK)**. `fetch_db`는 `replaced_at`이 **오늘 날짜**인 완료 레코드만 필터(daily_cycle.py:410). 아카이브 대상 = "complete AND ≥7d old"라 최소 7일 지난 것 → **오늘 작업분과 절대 안 겹침**. 오늘 작업분은 라이브에 full로 남아있음. 계기팀 문서 §48도 "same-date filter, Harmless"로 동일 판정. **archive/{주간} 병합조회 경로 불필요.**
2. **/apply = 당일 검증분 대상이라 stub과 정상적으로 안 겹침.** stub도 `new_meter_id`를 유지하므로 B3 인덱스는 stub의 mid도 정상 인덱싱 → addr 탐색 정상.
   - **[엣지, P3 착수 시 협의]**: 검증원이 **7일+ 과거의 stub된 계기 검침값을 수동 apply**하면, stub엔 `removal_values`(검침값)가 drop돼 있어(계기팀 §62) current=None→write가 stub에 부분 필드를 새로 만들어 archive full과 불일치할 수 있음. 현실적으로 apply 대상은 당일분이라 발생 희박하나, P3 착수 시 **`/apply`가 `archived:true` 감지 시 거부 또는 archive 병합조회**하도록 계기팀과 인터페이스 확정 필요. → 이것이 데이터관리자 P3 관문의 유일한 잔여 항목.

**결론**: P3 진행에 검증쪽 blocker 없음. 잔여 = apply-vs-stub 엣지 인터페이스 1건(P3 착수 시점 협의). PM 정합 확정 보고 완료.

**★P3 관문 교훈 — 과거 날짜 daily_state 재생성 한계 (2026-07-21 실증, 계기팀 P3설계에도 기록 요청)**:
- 초기 P3 관문 판정 "fetch_db는 same-date filter라 archived(7일+)와 안 겹침 → 무해"는 **당일 실행에만 맞다.**
- **과거 날짜 daily_state 재생성/재검증**(예: 사고 복구로 `daily_cycle --date 20260703` 재실행)은 그날 완료건을 보는데, 그 건이 이미 P3 stub화됐으면 라이브 workStatus에 `removal_photos`가 없어(archive로 이동) **OCR 재현 불가** → auto 등 학습 라벨 재생성 누락.
- 실증: 2026-07-21 daily_state 사고 복구 시 P3 apply 후라 과거 완료건(7/3 등)이 archived로 사진 스트립 → auto 187건 재현 불가(복구한계). human/crop_fail(어려운 표본)은 daily_val Firebase 보존이라 손실 0.
- **대응**: 과거 날짜 daily_state 재생성이 필요하면 (a)`archive/workStatus/jongno/{week}/{addr}`에서 사진 병합조회, 또는 (b)해당 시점 daily_state 백업 우선 복원. 정상 운영(당일 실행)은 무영향.
- **상호참조**: 계기팀 `workstatus-archive-design.md §3.8`에 동일 교훈 기록. **★이 한계가 c1(archive 사진 lazy 병합조회)의 우선순위를 명확히 함** — c1이 원래 "검증 UI 과거 archived건 사진 열람"용이었는데, "daily_cycle 과거 재생성 auto 라벨 복원"도 같은 archive 병합조회로 커버된다. c1 하나가 두 니즈 해결(여전히 fast-follow — archive 보존이라 손실 0, 급하지 않음).

**엣지 협의방향 확정 (계기팀 합의 2026-07-21, 계기팀 문서 §3.5-4에 P3 필수 인터페이스로 명기)**:
- **채택 = un-archive-then-apply**: `/apply`가 `archived:true` 감지 시 `archive/workStatus/jongno/{week}/{addr}` full을 라이브로 복원(un-stub)한 뒤 정상 apply → 라이브·archive 일관, 검증원에게 투명. (단순 폴백 "restore first 거부"는 비채택.)
- 불변식: **`/apply`가 stub에 부분필드를 새로 쓰는 것만 금지.**
- 전제: P3 착수 시 stub 스키마에 `archived:true` + week키 포함(계기팀). 그때 검증쪽 `/apply`에 un-archive 분기 추가(검증팀 소관).
- 시점: 계기팀 P1(헤드리스 PASS·미배포, 저부하 카나리 배포 PM 결정 대기) 안정화+관문통과 후 P3 착수. 그때 함께 확정·구현.

**★un-archive 구현 완료 (2026-07-21, 영준님 P3 go / 계기팀 dry-run 전 게이트)**:
- 계기팀 stub 스키마 확정: 아카이브 주소 = addr레벨 `archived:true`+`archive_week:'YYYY-Www'`(레거시 16건은 `'legacy'` literal). 원본 verbatim = `archive/workStatus/jongno/{archive_week}/{addr}`. stub 유지필드=meter_state/comm_state/updatedAt/x/y+replacement_list{new_meter_id,old_meter_id,replaced_at,source,draft,daily_seq,quarantine}. **빠지는 것=removal_values(검침값)·removal_photos·awms_response 등.**
- 검증팀 소관 구현: `app.py` `_unarchive_addr_if_needed()` + `/apply` 분기. addr `archived:true` 감지 → `archive/{ws_path}/{archive_week}/{addr}` full GET → 라이브에 통째 되쓰기(archived/archive_week 및 per-meter archived 제거=un-stub) → 그 뒤 정상 apply. **stub에 부분필드 새로쓰기 금지**(full 복원 후에만 write). 복원 실패=apply 중단(500). `archive_week`는 정규식 파싱 없이 문자열 그대로 경로 사용(legacy 대응). 라이브 키==archive 키(동일 인코딩)라 addr 그대로 사용.
- 검증: 회귀(archived 없는 현재 데이터 → 기존 apply 정상, un-archive 스킵) + 격리 단위테스트 전체 통과(정상week/legacy/플래그제거/검침값복원/에러500). 라이브 백엔드 반영(재시작).
- [C] 사진 재조회: **c2 시작 + c1 fast-follow** 채택. /apply un-archive가 값수정 시 사진도 자동복원 → 순수 열람만 과거 archived건만 초기 미지원(archive verbatim 보존, 유실 0). c1(lazy fetch)는 fast-follow.
- 잔여: 계기팀 P3 apply(실아카이브) 실행 후 실 archived 주소로 양팀 통합검증.

---

## 부록: 근거 파일
- `research/admin-validation/backend/app.py` — 워처(4880-4930), /apply(1958-1981·2038-2051), 캐시(98-168), verdict(1434-1482), _AWMS_DONE_URL(2841)
- `research/ocr_poc/daily_cycle.py` — fetch_db(396-400), run_daily(1365), DB_URL(43-44)
- `research/admin-validation/dataset_config.json` — rtdb_review_url·db_url·bucket
- 실측: ocr_review 28KB / workStatus 6.5MB (shallow=true + 표본 GET, 통째 GET 회피)
