# awms 계기교체 완료 → 종로 작업지도 동기화 프로세스

> awms 계기팀(MOBMTR) 완료 데이터를 종로(jongno-combined) 작업지도에 "완료"로 반영하는 표준 절차.
> 확립: 2026-06-03 (14차 기준 검증 완료, 610/610 매칭).

## 전체 흐름
awms-bridge 앱 "완료받기" → Firebase(ami-work) awmscomplete/ → awms-all.json → **작업자 완료 보호 필터** → sync 도구 업로드 → ami-jongno DB push

---

## ★ 우선순위 규칙 — 작업자 앱 완료가 awms보다 우선 (필수, 영구)

> 영준님 지시(2026-06-03): **작업자가 종로 앱에서 직접 교체 완료한 계기가 항상 우선.**
> awms 완료는 "정보 없는 완료"(사진·제조년월·철거지침 없음)다. 작업자 실작업을 절대 덮어쓰면 안 된다.

- **awms import에서 작업자 완료 계기는 반드시 제외**한다.
- **판정 (live ami-jongno `replacement_list[계기번호]` 기준):** 아래 중 하나라도 있으면 = 작업자 완료 → 제외
  - `source` ≠ `'awms'`
  - `worker` ≠ `'AWMS_IMPORT'`
  - `new_meter_photo` / `old_meter_photo` (사진)
  - `removal_value` (철거 지침값)
  - `new_meter_mfg_ym` (제조년월)
- **이유:** sync 도구는 같은 계기번호를 만나면 replacement_list 항목을 **통째 교체**한다(머지 아님). 작업자가 넣은 사진·지침·제조년월이 awms 빈값으로 날아간다. → 입력 단계에서 제외해야 안전.
- **절차:** 도구 업로드 **전에** live ami-jongno DB를 받아 보호 계기를 awms-all.json에서 제거한 `*-safe.json`을 만들어 업로드.
  - 필터 스크립트 예: `research/awms-poc/` 에서 live 백업 ∩ 14차 → `is_worker_done()` 판정 → 제외
- (검증 사례 14차: 610건 중 작업자 완료 1건(48171604499, 사진 있음) 제외 → 609건 적용)

---

## 1단계 — awms에서 완료 데이터 수집

### 방법 A (권장): awms-bridge 앱 "완료받기" 버튼
1. awms-bridge 앱을 **계기팀 계정**으로 로그인 (awms는 OTP, 폰 세션 유지)
2. awms 화면 우하단 초록 **"완료받기"** 버튼 누름
3. 내부 동작: `mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey=<공사>&workStep=28&pPageNo=N&pRowCount=100` 를 페이지 루프로 전부 수집
4. 결과를 Firebase(ami-work) `awmscomplete/{key}` 에 PUT — `{count, total, rows[]}`
5. 코드: `awms-bridge/android/.../MainActivity.java` 의 `COMPLETE_FETCH_JS`
   - **차수 변경 시 `var BUSI='...'` 수정 후 재빌드+설치** (현재 14차=397820263153 고정)

### 방법 B (구): PC 크롬 console
- 로그인된 awms 탭 console에서 fetch — 매번 로그인·복붙이라 번거로움. 방법 A로 대체.
- 분석: [findings_mainlist.md](findings_mainlist.md)

### 공사(차수) busiKey 매핑 — `getBusiList?DEPT1=3970`
| 차수 | busiKey(CONS_NO) |
|---|---|
| 5차 | 397820263032 |
| 6차 | 397820263033 |
| 7차 | 397820263034 |
| 8차 | 397820263035 |
| 12차 | 397820263150 |
| 13차 | 397820263151 |
| **14차** | **397820263153** |

### 데이터 필드 (mobMtr1000/getMainList 행)
- **WHM_NO** = 신설계기번호(11자리) = **종로 계기번호 매칭키**
- **CREMO_WHM_NO** = 철거(기존)계기번호
- **WORK_STEP** = `'28'`(완료, 문자열), `'20'`=작업전
- **LAY_STS_CD** = `30`(완료)
- **STATUS_MOD_DATE** = 완료시각(unix ms)
- CNT = 해당 조건 전체 건수(페이지 메타)

---

## 2단계 — 종로 sync 도구로 반영

### 도구 URL
**https://815dudwns.github.io/jongno-combined/tools/sync-meter-from-awms.html**
(소스: `jongno-combined/tools/sync-meter-from-awms.html`)

### 절차
1. awmscomplete의 `rows[]` 를 **awms-all.json**(배열)으로 저장 — 형식 동일, 그대로 사용
2. 도구를 **PC 크롬**에서 열고 awms-all.json 업로드
3. 도구 동작:
   - `WORK_STEP==='28'` AND `CREMO_WHM_NO` 채워진 건만 필터
   - 같은 계기번호 중복은 `STATUS_MOD_DATE` 최신 보존
   - **WHM_NO ↔ 종로 site-data 계기번호** 매칭 (형식 동일 11자리, zfill 불필요)
   - 미리보기(덮어쓰기/신규 구분) → **백업 자동**(`jongno-workStatus-awms-sync-backup-*.json`) → 적용
4. 적용 = 종로 **ami-jongno** DB `workStatus/jongno` 에 직접 push

### 중요 규칙
- **종로 DB = `ami-jongno`** (`jongno-combined/js/config.js`). **ami-work 아님** — 헷갈리지 말 것
- 완료는 **현장(주소) 단위**. 현장 계기 전부 완료면 `meter_state='complete'`, 일부면 앱이 `x/y` 자동표시 (map.js decideMarkerStyle)
- 계기단위 완료 = `checkedMeters[]` 배열 + `meterChecks{}` (firebase.js)
- **`comm_state`(통신)는 안 건드림** — awms는 계기교체 완료만. 통신팀 완료는 별개
- 계기팀 계정으로 awms에서 **저장(saveRow) 금지** — 완료받기는 조회(GET)만 안전

---

## 재현 절차 (자주 할 때 — 차수마다 반복)

1. **awms-bridge "완료받기"** — 앱(계기팀 로그인)에서 우하단 초록 버튼 → Firebase(ami-work) `awmscomplete/{key}` 에 적재
   - 차수 변경 시: `awms-bridge MainActivity.COMPLETE_FETCH_JS` 의 `var BUSI='...'` 를 해당 busiKey로 수정 후 재빌드+설치
2. **rows 다운로드**: `curl ".../awmscomplete/{key}/rows.json" -o awmsNN_complete.json`
3. **작업자 완료 보호 필터** (필수):
   ```
   python3 research/awms-poc/filter_worker_done.py awmsNN_complete.json
   ```
   → live ami-jongno 백업 자동 + 작업자 완료 제외 → `~/Desktop/awmsNN_complete-safe.json`
4. **sync 도구 업로드**: https://815dudwns.github.io/jongno-combined/tools/sync-meter-from-awms.html
   - safe.json 선택 → 미리보기(미매칭/덮어쓰기/새로) → **일괄 동기화 실행**(처리 직전 백업 자동) → ami-jongno push
5. 종로 앱 새로고침 → 14차 완료 마커 확인

### 미리보기 숫자 해석
- **계기 미매칭**: 0이어야 정상(우리 site에 없는 계기 = 신규/타지사)
- **덮어쓰기**: 이미 있던 주소(대부분 source=awms 이전 동기화 → 갱신 무방). 작업자 완료는 3번에서 이미 제외됨
- **새로 완료 표시**: 처음 완료로 들어가는 것
- daily_seq(No.) = `STATUS_MOD_DATE` 오름차순, KST 날짜별 1부터 (시간순)

### 알려진 한계
- 도구는 plan의 **모든 주소를 meter_state=complete 강제** → 현장 일부만 해당 차수인 "부분완료"도 완전완료로 표시됨("4/5" 아님). 정확히 하려면 해당 주소를 입력에서 빼야 함.
- 도구는 `comm_state`도 complete로 함(영준님 정책: ami-work 별도추적).

## 검증 기준
- awms WHM_NO ↔ 종로 계기번호 매칭률이 높으면(14차=100%) scope 정상
- 매칭 안 되면 = 신규 계기(수동 검토) 또는 다른 지사/공사

---

## ★ 차수 = 완료 기간 (한전 재배정) — 전체 차수 받아야 (2026-06-04 규명)

**차수는 "완료된 기간" 라벨이다. 한전이 완료 건을 날짜별로 차수에 재배정한다.**
- 예: 13차=05/12~22 완료분 / 14차=05/20~29 / 20차=06/04(당일) 전부
- **재배정 사례**: 14차가 어제 610건 → 오늘 510건(100건 감소). 그 100건이 전부 20차(06/04)로 이동(STATUS_MOD_DATE도 당일로 갱신).
- **함의**: 차수 하나만 받으면 재배정된 건 놓친다. **모든 차수(getBusiList 전체)를 받아 합쳐야** 현재 완료 전체가 커버됨.
- 옛 차수(5~12차)는 완료 0건이어도 종로엔 과거 동기화분이 남아있음(sync는 매칭된 것만 갱신 → 안전).

## adb(CDP)로 전체 차수 직접 수집 — 완료받기 버튼/재빌드 불필요 (2026-06-04)

awms-bridge "완료받기" 버튼은 `var BUSI` 고정이라 차수마다 재빌드가 필요하지만, **adb forward + CDP fetch로 폰 awms 세션에서 직접 전 차수 수집 가능**(재빌드 0).
```
adb forward tcp:9222 localabstract:webview_devtools_remote_<awmsbridge PID>
# getBusiList로 전 차수 CONS_NO → 각 차수 getMainList(workStep=28) 페이지루프 fetch
# research/awms-poc/cdp_eval.py (suppress_origin=True, credentials:'include')
```
- awms-bridge가 awms.kdn.com 페이지에 있어야(localhost/큐탭이면 Page.navigate로 복구). PID는 앱 재시작마다 바뀜 → 매번 재확인.

## ★ 삭제 경고 — 작업자 실작업 보호 (2026-06-04 사고)
- 오토모드 "큐 가짜 N건 삭제"가 누상동166-9(작업자 실작업 계기 48171604499, 사진/제조월/철거값 포함)를 가짜로 오판 삭제한 사고 발생.
- **주소 하위 `replacement_list[계기]`에 worker≠'AWMS_IMPORT'(예 admin)·사진·removal_value·new_meter_mfg_ym 있으면 = 작업자 실작업 → 절대 삭제 금지.** meter_state 없다고 "가짜"로 판정 말 것.
- 복구: `~/Desktop/ami-jongno-workStatus-backup-*.json` 에서. (메모리 [[jongno_delete_protect]])

## 동기화큐 자동정리 (TODO — 핸드폰 멀티앱)
- awms 완료된 계기가 동기화큐(awms-queue)에 계속 보임. 완료된 건 큐에서 자동 제외돼야.
- 방식: awms-queue(멀티웹뷰)가 핸드폰에서 awms 완료목록(workStep=28) 받아 → 큐에서 **화면 제외**(loadQueue, DB 삭제 아님 — 삭제는 위험). syncCompleted 골격 보강.
