# OCR 자동 = 검증까지 자동? — 코드 체인 분석

분석일: 2026-07-03
대상: `jongno-combined/admin-validate.html` (프론트) + `ami-work/research/admin-validation/backend/app.py` (백엔드)
배경: 오늘 재설계 4단계로 'OCR 자동' 토글 추가. 목표 = 영준님 비전 "데이터 들어오면 OCR·검증이 자동으로".

---

## 1. 전체 체인 (파일:라인 근거)

날짜 열림부터 검증완료 스탬프까지 실제로 이어진다. 단계별:

| # | 단계 | 위치 | 동작 |
|---|---|---|---|
| 1 | 날짜 로드 결과 반영 후 훅 호출 | `admin-validate.html:2552` | `loadResults()` 끝에서 `_maybeAutoOcr()` 호출 |
| 2 | 자동 실행 판단·가드 | `admin-validate.html:2266~2274` | 토글 ON(`av_autoOcr==='1'`) + 그룹 존재 + **검증대기(`groupBucket==='unverified'`) 있을 때만** → `_autoOcrRan`에 날짜키 추가 후 `runValidate(true)` |
| 3 | confirm 스킵 + POST /validate | `admin-validate.html:2310`, `2315~2329` | `auto=true`면 `confirm()` 통째 스킵(2310). `only_mids`(미검증 mid만)로 `POST /validate` → 성공 시 `startPolling(job_id)` |
| 4 | 백엔드 OCR 배치 | `app.py:618~686` | 백그라운드 스레드에서 `daily_cycle.run_daily(only_mids=...)` 실행. 완료 시 잡 `status="done"` (`app.py:715~721`), 오류 시 `"error"` (`app.py:724~729`) |
| 5 | 폴링 완료 감지 | `admin-validate.html:2444~2479` | 1.8초 간격 폴링(`2361`). `job.status==='done'`이면 결과 재로드(`2474`) |
| 6 | **자동 검증완료 스탬프** | `admin-validate.html:2476` | `autoValidatePassed(_validateScope)` 호출 → 통과/확인완료(문제없는)건 `POST /set_validated` (`3048`), 백엔드가 workStatus에 `validated=true` PATCH (`app.py:2457`) |

**핵심(load-bearing): `pollJob`은 수동·자동 공용이고, `done` 분기에서 `autoValidatePassed`를 조건 없이 호출한다(2476).** 따라서 자동 경로도 검증완료 스탬프까지 도달한다. 수동/자동 경로 차이는 오직 2310의 confirm 스킵 하나뿐 — 그 뒤(POST→폴링→autoValidatePassed)는 완전히 동일 코드.

## 2. 자동/수동 경계 (코드상 정확)

`autoValidatePassed` 스탬프 조건 (`admin-validate.html:3040~3043`):
```
(bucket==='pass' || bucket==='done') && _swapPartner==null && !groupConsistency(g).hasError && !g.validated
```
버킷 정의(`statusBucket` 2818~2827, `isVerified` 3066~3071):
- **자동통과(pass)** = `auto/google/pass2` → 항상 자동 검증완료 (사진 OCR이 DB와 일치)
- **확인완료(done)** = `human/human_skip` → **완료(non-draft)일 때만** (`isVerified`가 `!g.is_draft` 요구, 단 autoValidatePassed는 done 전부 스탬프 — is_draft 게이트는 isVerified 표시용, 스탬프는 pass·done 둘 다. draft done은 `!g.validated`라도 스탬프됨에 주의)
- **확인필요(need)·OCR미판독(ocrfail)·스왑의심·정합성오류** → 스탬프 제외 = **사람 판정 필요**

결론: OCR 판독은 자동, 자동통과·확인완료건 검증완료는 자동, need/ocrfail/스왑/정합성오류는 수동 — **경계가 코드상 의도대로 맞다.** over-read 검침값(§37)은 `rowBucketRefined`(2844)에서 need 유지되어 자동통과 안 됨(정상).

## 3. 갭·누락

### (a) 날짜별 1회 가드 — 같은 날 추가 작업
- `_autoOcrRan`은 **in-memory Set**(2263), localStorage 아님. 한 세션 안에서는 같은 날짜 재실행 안 됨(2269). **하지만 페이지 새로고침/재진입하면 초기화** → 그때 다시 자동 실행됨.
- 즉 "같은 날 나중에 들어온 작업"은 **관리자가 페이지를 다시 열어야** 잡힌다. 세션 유지 중엔 안 잡힘.

### (b) confirm/UI 의존 차단
- `auto=true`는 `confirm()`을 스킵(2310)해서 UI 블로킹 없음. **단 range 상속 함정**: `_validateScope`는 UI 라디오 상태를 그대로 읽음(`_readValidateScope` 3021~3030). 기본 라디오는 `all checked`(1327)라 보통은 전체지만, **관리자가 이전에 순번 범위를 썼으면 `av_valFrom/To`가 localStorage에 저장(2966)되고 `_restoreValScope`가 페이지 로드 시 range 라디오를 복원(3013~3014)** → 자동 OCR도 그 범위만 돌고, `autoValidatePassed`도 그 범위만 스탬프. **"OCR 자동"이 조용히 부분범위로 동작할 수 있음.**

### (c) /validate 실패·중단
- POST가 throw/network 실패 시 `runValidate` catch는 `showErr`만(2331) — 폴링 미시작, `autoValidatePassed` 미도달. 409(이미 실행 중)도 `showJobBox`만(2323). 잡 자체 오류는 `status==='error'`로 표시(2480~2488)되고 스탬프 안 됨.
- **문제**: 실패해도 `_autoOcrRan`에는 이미 날짜키가 들어감(2272가 `runValidate(true)` 호출 **전**에 실행). → **실패해도 그 세션에서 재시도 안 됨(자가치유 없음).** 새로고침해야 재시도.

### (d) 무한/중복 방지
- 안전. 재진입 경로 존재: `autoValidatePassed`→`_loadResultsAndSummary`→`loadResults`→`_maybeAutoOcr`(2552) 및 폴링 done 분기가 다시 loadResults를 태움. **이 재귀를 막는 유일한 장치가 날짜별 `_autoOcrRan` 가드(2269)**다. 가드 덕에 2회차 진입은 즉시 return → 무한루프·재과금 없음. (부수효과: 가드가 곧 (c) 재시도 불가의 원인이기도 함.)

### (e) 트리거가 "데이터 도착"이 아니라 "페이지 열림"
- 전체 체인의 시발점은 `loadResults`(2552) = 순수 클라이언트. **데이터가 firebase에 들어오는 것으로는 아무것도 안 켜짐.** 관리자가 그 날짜로 페이지를 열어야만 돈다.

### (참고) need/ocrfail 재-OCR 비용
- `_maybeAutoOcr`는 unverified 유무로 트리거하지만, scope=all의 `runValidate`는 `!validated` 전건을 `only_mids`로 보냄(2302~2304) → 이미 판독된 need/ocrfail도 재-OCR. 재과금 소폭.

## 4. 결론

**"OCR 자동 = 검증까지 자동"은 해피패스·한 페이지 세션 안에서는 성립한다.**
- OCR 판독 → 자동통과/확인완료(문제없는)건 `validated` 스탬프까지 사람 개입 0. need/ocrfail/draft/스왑/정합성오류는 정확히 수동으로 남김. 경계 정확.

**단, "무인 자동"은 아니다.** 비전("데이터 들어오면 자동")의 정확한 번역 = **"관리자가 그 날짜 페이지를 열면 자동."** 데이터 도착 트리거 없음, 실패 시 세션 내 자가치유 없음.

---

## 갭·해결책 요약 (5개 이내)

1. **트리거가 페이지 열림뿐(무인 아님)** — firebase 데이터 도착으로는 안 돔. 해결: 백엔드에 cron/워커로 "그날 unverified 있으면 run_daily" 스케줄(daily-analysis 스킬/서버 크론), 또는 workStatus 변경 감시 훅. 프론트 토글은 관리자 확인용으로 유지.

2. **실패 시 자가치유 없음** — `_autoOcrRan.add`(2272)가 `runValidate(true)` **전**이라 POST 실패/409/잡 error여도 세션 내 재시도 안 됨. 해결: 가드 추가를 성공(startPolling 도달) 후로 옮기거나, 실패 catch(2331)·error 분기(2480)에서 `_autoOcrRan.delete(key)`.

3. **range 상속 함정** — 이전 순번 범위가 localStorage로 복원(3013)되면 "OCR 자동"이 조용히 부분범위만 처리. 해결: 자동 경로에선 scope를 강제 all로(`_maybeAutoOcr`에서 `_validateScope={scope:'all'}` 고정) 또는 자동 시 range 무시.

4. **같은 날 추가 작업 세션 내 미처리** — in-memory 가드라 새로고침 전엔 안 잡힘. 해결: 가드를 (날짜+처리한 unverified 개수) 기준으로 하거나, 완료 후 새 unverified 생겼는지 재평가.

5. **need/ocrfail 재-OCR 비용(경미)** — scope=all이 `!validated` 전건 재판독. 해결: 자동 시 `only_mids`를 unverified 그룹의 mid로 한정(never-OCR'd만).
