# ami-work 데이터 계약 (data contract)

> 2026-07-21 신설. 감사 거버넌스 승인(계층 분리: 로컬 계약=이 문서, 글로벌은 ~/CLAUDE.md 한 줄 확장).
> 배경: 검증팀·ocr-meter가 `daily_state.csv`를 공유하던 중 ocr-meter가 스키마를 축소(10→8컬럼) 재생성해 검증팀 `/report` 회귀가 빈결과가 됨(★데이터 손실 0, 파생물). worktree 물리 분리로는 안 풀리는 **공유 데이터레이어 충돌** → 물리 파일경계가 아니라 **논리 계약(소유권+스키마)**이 해법.

## 원칙 (모든 세션 공유 산출물에 적용)

1. **소유자 = 단일 생성 세션.** 그 산출물을 생성·재생성·스키마 변경할 수 있는 유일 주체.
2. **소비자 = 읽기 전용.** 생성·재생성·스키마 변경 금지. 읽기만.
3. **스키마 = append-only.** ★소비자가 읽는 컬럼은 **삭제·의미변경 금지**.
4. **스키마 변경(컬럼 추가/의미변경)은 소유자가 소비자에게 사전 통보·합의 후** 진행.
5. 위반(소비 컬럼 삭제·무단 스키마 축소) 발견 시 → 소유자가 계약 스키마로 즉시 복구 + PM 보고.
6. ★테스트·임시 스크립트는 프로덕션 산출물을 **직접 write 금지** — 읽더라도 tmp 카피로 작업. (2026-07-21 사고: 테스트 스크립트가 `daily_state.csv`를 직접 write → DictWriter가 `orig_status/google` 거부 예외로 파일 잘림. 재생성은 정식 파이프라인 `daily_cycle --date`로만.)
7. ★**공유 산출물 물리 위치 = worktree 밖 main 단일 절대경로.** (2026-07-21 in-project worktree 전환 대응. 감사 법전 `orca-multiagent-law.md` Art.3 PRIMARY 채택.)
   - 팀 데스크가 각자 브랜치 git worktree(`ami-work/workspaces/<팀>`)로 분리돼도 공유 상태파일은 **브랜치별로 복제하지 않는다.**
   - 4개 공유 상태파일(`daily_state.csv`·`daily_meterid.csv`·`cycle_state.csv`·`daily_removal_meterid.csv`)은 gitignore(untracked)로 두어 worktree 체크아웃에 복제되지 않게 하고, 모든 세션 코드는 절대경로 `/Users/woodelight/Projects/ami-work/research/ocr_poc/<파일>`로 참조한다(코드 상수 `SHARED_OCR_POC`).
   - `Path(__file__).parent` 등 **worktree-상대 참조 금지** — 자기 브랜치 체크아웃본을 봐서 diverge를 유발한다(오늘 아침 사고와 동류). 공유 상태파일 참조는 `SHARED_OCR_POC` 절대경로 상수로 통일.
   - 실제 백엔드(검증·cst)는 launchd가 main 트리 절대경로 uvicorn(`research/ocr_poc/venv_parseq/bin/uvicorn`)으로 실행 = 이미 단일정본. 세션 cwd가 worktree여도 데이터는 main.
   - 폴백(절대경로 불가 환경): 소유자 브랜치서만 write → 소비팀 merge 후 read.

## 계약표

| 산출물 | 소유자(생성/스키마) | 소비자(읽기) | 스키마 계약 |
|---|---|---|---|
| `daily_state.csv` | **ocr-meter** (`run_daily`) | **검증팀** (`/report`·집계) | 10컬럼. ★`orig_status`(crop_fail 정답경로)·`google` 포함. 소비 컬럼 삭제 금지 |
| `계기번호_아미큐_실패건/` | **스키마=ocr-meter / 쓰기=통신팀** (`/api/ocr`·`saveAct`) | **ocr-meter** (`harvest_trainset.py`) | 사진+JSON 사이드카 쌍, `schema_version 1`. 통신팀 임의 스키마 변경 금지 — ocr-meter 합의 후 append-only 확장만 |

> 추가 공유 산출물(cycle_state.csv, Firebase daily_val/ocr_review 노드 등)이 세션 간 공유될 경우 위 표에 소유자·소비자·스키마를 명시해 확장한다.

### ★스키마 소유자와 쓰기 주체가 분리된 사례 (2026-07-27 신설)
`계기번호_아미큐_실패건/`은 **파일을 만드는 세션(통신팀)과 스키마를 정하는 세션(ocr-meter)이 다른 첫 사례**다.
원칙 1(단일 소유자)의 예외이므로 아래를 명시한다.
- **스키마 정본 = ocr-meter.** 필드 추가·의미 변경은 ocr-meter 합의 후 **append-only**로만. 통신팀 임의 변경 금지.
- **쓰기 = 통신팀 백엔드**(`cst-input/backend/app.py`). 경로는 `SHARED_OCR_POC` 관례대로 **절대경로 상수**로 참조.
- **읽기·학습 승격 = ocr-meter.** 게이트(`status=matched` + 타입코드 검증) 미통과분은 학습에 쓰지 않는다.
- 경로: `/Users/woodelight/Projects/ami-work/research/ocr_poc/계기번호_아미큐_실패건/{pending,labeled}/`
  (`research/ocr_poc/`는 이미 gitignore — worktree에 복제되지 않음)
- **기존 `계기번호_원본_실패건/`(crop_fail, 검증팀 daily_cycle 전용)과 통합하지 않는다.** provenance가 다르고
  라벨 획득 방법이 달라(ts 정확조인 vs 사진매칭) 한 파일에 섞으면 두 팀이 같은 파일을 다른 가정으로 건드리게 된다.
  최종 학습셋 병합만 `harvest_trainset.py`에서 두 번째 소스로 수행.

## daily_state.csv 계약 스키마 (10컬럼)

- 필수 보존 컬럼: **`orig_status`**(crop_fail→human 전이 추적, crop_fail 학습 정답경로의 핵심), **`google`**.
- 확정(2026-07-21, ocr-meter 복구본 기준. daily_cycle.py STATE_COLS와 동일):

  ```
  ts, fid, mid, type, worker_val, parseq, google, final, status, orig_status
  ```

  | 컬럼 | 의미 | 소비자 |
  |---|---|---|
  | ts | 조인키(YYYYMMDD_HHMMSS_fid) | 양팀 |
  | fid | 검침값 필드ID(whme_day/whme_mngt/dm_mt_day/var_day) | 검증팀+ocr-meter |
  | mid | 계기ID | 검증팀+ocr-meter |
  | type | 계기타입(E/EA/G/Amigo) | 검증팀+ocr-meter |
  | worker_val | 작업자 입력값 | 프론트 표시 |
  | parseq | 1차 OCR(PARSeq) 결과 | 프론트 표시 |
  | google | 2차 OCR(Google Vision) 결과 | ★프론트 판정카드 2차판독 표시(admin-validate.html:3619) |
  | final | 확정 정답값(사람판정 또는 자동일치) | 프론트+ocr-meter 학습라벨(ts조인 정답) |
  | status | 판정 상태(auto/human/need_human/no_crop/crop_err/bad_ratio 등) | 검증팀 `_status_group`/`/report` 집계 |
  | orig_status | swap_guard 적용 전 원본 status 보존 | ★daily_cycle apply_swap_guard swap 탐지(354행) |

- 복구 원본: `daily_state.csv.bak-swap교정전-20260702-222737`(2026-07-02, 1309행, 10컬럼 정본 유지 확인).

### 복구본 검수 완료 (검증팀, 2026-07-21)
- ✅ 10컬럼 실측 확정: `ts,fid,mid,type,worker_val,parseq,google,final,status,orig_status`.
- ✅ 행수 1,431(ocr-meter DB 재조회 기준 진짜 수치). 사고 전 검증팀 실측 1,543은 auto-sync 누적 캐시본 추정(재현 불가) — DB 완료 0건 확인으로 복구본 신뢰.
- ✅ ★human final(사람정답) 무결성: human 83건(human 77+human_skip 6) final 100%, 사고 전(71)보다 증가(캐치업 리뷰 103건 반영). **정답 손실 0.**
- ✅ auto final 100%(1,198건), worker_missing 81건은 worker_val 빈값 100%(오분류 아닌 정확분류).
- ✅ crop_fail(bad_ratio) 6/18 건은 캐치업으로 human 정답(40618) 확정 = 판정 실증. 7/1 1건 미판정(going-forward).
- 부수 발견(ocr-meter): AUTO_SYNC_REVIEW 3일 윈도우 밖 옛 캐치업 리뷰 103건 미반영 방치(사고 무관 원래 사각지대) → 정식 반영 완료. 재발방지 전체스윕 모드 PM 판단 대기.

## 물리 위치 · worktree 격리 대응 (2026-07-23, 4-desk 상주 구조 확정)

> 근거: 감사 ocr-meter 물리편입 판정 Q2(2026-07-23). ocr-meter가 ami-work로 subtree 병합되고 4개 데스크(검증팀·계기팀·통신팀·ocr_meter)가 각자 브랜치 in-project worktree로 상주하면서, 공유 산출물이 브랜치마다 갈라져 머지 시 조용히 row 유실될 위험(=2026-07-21 사고 유형)에 대한 봉합.

- **4-desk 배치**: `~/Projects/ami-work/workspaces/<데스크>`, 브랜치 = 데스크명(`geomjeung`·`gyegi`·`tongsin`·`ocr-meter`, 접두어 없음). ocr-meter 코드는 병합으로 `ocr-meter/`(main 추적).
- **★공유 산출물은 worktree 밖 단일 물리 진실파일.** `daily_state.csv` 정본 = `/Users/woodelight/Projects/ami-work/research/ocr_poc/daily_state.csv` (main 트리, 어느 데스크 worktree에도 사본 두지 않음).
- **모든 데스크 코드는 이 절대경로로만 참조** — `SHARED_OCR_POC = Path('/Users/woodelight/Projects/ami-work/research/ocr_poc')` 상수 경유(cycle.py·daily_cycle.py 등 이미 채택). 브랜치별 상대경로/사본 참조 금지.
- **`.gitignore` 추적 제외**로 브랜치 분기 원천 차단: 공유 CSV 4종 + `research/ocr_poc/`(38GB, untracked 유지). git이 추적하지 않으므로 브랜치 머지가 이 파일을 건드릴 수 없음.
- 팀 정의파일(`.claude/agents/*.md`)은 반대로 **git 추적 필수**(2026-07-23 untracked 유실 사고 → tracked 전환). 공유 상태데이터=추적 제외, 공유 설정/코드=추적 유지 원칙.

## 소관

- 이 문서 소유 = ami-work PM (로컬 데이터 계약).
- 글로벌 규약(공유 산출물 일반 원칙)은 `~/CLAUDE.md` "같은 파일 동시수정 금지" 항목에 한 줄로 확장 — 영준님 승인 후 감사가 반영.
