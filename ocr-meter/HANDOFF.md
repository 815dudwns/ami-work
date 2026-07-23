# ocr-meter HANDOFF

> 최종 업데이트: 2026-07-21

## 현재 상태

- 마지막 작업: **ami-work 검증팀과 harvest/crop_fail 학습큐 공동설계 + daily_state.csv 사고 복구.**
  1. **crop_fail 학습큐 신설(원래 목표)**: daily_cycle.py에 판정시점 크롭·실패건 원본 영속저장 추가
     (검침값 LCD 크롭 → `검침_크롭_daily/`, no_crop/crop_err/bad_ratio 원본 → `검침_원본_실패건/`,
     계기번호 need_human 원본 → `계기번호_원본_실패건/`, 전부 egress 0). harvest_trainset.py에
     `harvest_crop_fail_queue()` 신설 — 위 원본을 daily_state.csv/daily_meterid.csv와 ts조인해
     `data_7seg/harvest/crop_fail_queue.csv` 생성(ready=사람판정 final 확정된 것만).
  2. **daily_state.csv 사고 및 복구(중간에 발생)**: crop_fail 테스트 스크립트가 daily_cycle.py 내부
     미사용 지역변수(8컬럼)를 정본으로 착각해 daily_state.csv(정본 10컬럼)를 직접 write하다 1,543행
     삭제. 07-02 백업(1,309행)+정식 파이프라인(`daily_cycle.py --date`/`--sync-review`) 재생성으로
     복구, 최종 1,431행/10컬럼/human 83건 final 100%(사고 전보다 오히려 완전). 검증팀 검수 통과.
  3. **전체스윕 모드 신설(재발방지)**: `daily_cycle.py --sweep-review` — ocr_review RTDB 노드 전체를
     스캔해 daily_val_*(날짜+레거시) 키 자동발견·반영. AUTO_SYNC_REVIEW가 최근 3일만 봐서 생기던
     "오래된 캐치업 리뷰 영구 미반영" 사각지대를 막음. human/human_skip은 절대 덮어쓰지 않음(검증팀
     요구). 멱등 확인 완료.
  4. **`ami-work/docs/data-contract.md` 신설**: daily_state.csv 10컬럼 계약(소유자=ocr-meter,
     소비자=검증팀 읽기전용, orig_status/google 삭제금지, 스키마변경 사전통보). 검증팀 검수완료 마킹됨.
  5. **1,543행 vs 1,431행 간극(auto -187) 완전 규명**: 내 실수 아님 — 검증팀 P3 아카이브(Firebase
     비용최적화)가 사고 전 있던 auto 행의 근거 사진(removal_photos)을 사고 이후에 스트립해서, 재생성
     시점엔 그 완료건이 OCR 불가 상태가 됨. "P3 아카이브 + 과거 daily_state 재생성" 시퀀싱 문제.
     human/crop_fail(어려운 표본, 학습가치 높음) 손실은 0. 필요시 나중에
     `archive/workStatus/jongno/{week}/{addr}`(Storage) 원본으로 재크롭+재OCR해 auto만 복원 가능
     (급하지 않음).
- 진행 중: 없음 (세션 매듭). 검증팀·PM에 전부 보고·검수 완료.
- 다음:
  1. **검증팀 `_status_group` 배포 확인**: crop_fail을 "확인필요" 판정 대기열에 노출시키는 배포,
     저녁 저트래픽 시간대 예정이었음 — 배포됐는지, `/report` 회귀 통과했는지 다음 세션에서 확인.
  2. **crop_fail_queue.csv 실데이터 축적 확인**: 다음 데일리사이클 실행 후 검침_원본_실패건/
     계기번호_원본_실패건에 실제 파일이 쌓이는지, `harvest_trainset.py`(자동으로 crop_fail 큐도
     같이 산출) 재실행해서 ready=1 건이 생기는지 확인.
  3. **계기번호 트랙 crop_fail 리뷰파이프라인**: daily_meterid.csv엔 사람판정 확정 필드(final) 자체가
     없어 need_human 원본이 전량 pending. 검증팀이 리뷰파이프라인 신설 검토 예정 — 진행상황 확인.
  4. (이월, 급하지 않음) **아미큐 E5 처방 적용 회신**, EA(code-19) 실사진 표본 확보, cycle8 검침값
     재학습(빌드완료·eval스크립트 미작성).
- 블로커: 없음 (오늘 발생한 daily_state.csv 사고는 복구·검수 완료로 해소됨).

## 이번 세션 한 일 (7/21)

### crop_fail 학습큐 + harvest 자동연결 공동설계 (ami-pm 소환)
- 역할분담 확정: harvest_trainset.py·cycle8_prepare.py·PARSeq/YOLO 재학습·daily_cycle.py 검증로직
  (크롭저장 포함)은 ocr-meter 소관(물리위치 무관). 검증팀은 판정시점 사진·정답·status 확보/전달,
  정답품질(사람판정→final 확정) 담당.
- daily_cycle.py: `_persist_fail_orig()` 헬퍼 신설 + 3개 실패분기(no_crop/crop_err/bad_ratio)와
  성공 크롭 저장 지점, 계기번호 need_human 분기에 배선. egress 0 유지(이미 다운로드된 로컬 파일
  재사용, 신규 다운로드 경로는 제거).
- harvest_trainset.py: `harvest_crop_fail_queue()` 신설, `main()`에서 harvest 실행 시 자동 동반.

### daily_state.csv 사고 → 복구 → 전체스윕 → 검수 (같은 세션 안에서 발생·해결)
- 사고: 테스트 스크립트가 프로덕션 CSV를 직접 write하다 스키마 불일치로 1,543행 소실.
- 복구: 로컬 .bak(07-02, 1,309행)로 즉시 복원 + `daily_cycle.py --date`(19일 순차)로 갭 백필 +
  RTDB `ocr_review` 전체조회로 AUTO_SYNC_REVIEW 사각지대에 방치돼있던 캐치업 리뷰 103건 발견·반영.
- 재발방지: `_apply_verdicts_daily(preserve_human=...)` 파라미터 추가 + `sync_review_sweep()`/
  `--sweep-review` CLI 신설.
- `ami-work/docs/data-contract.md` 신설(감사 승인, daily_state.csv 10컬럼 계약).
- 검증팀 검수 통과(10컬럼/행수/human final 100%/멱등/human보존 전부 확인).

## 재현/위치
- daily_cycle.py: `_persist_fail_orig`(신규), `CROP_DAILY_DIR`/`FAIL_ORIG_DIR`/`METERID_FAIL_DIR`(신규
  상수), `sync_review_sweep`/`--sweep-review`(신규), `_apply_verdicts_daily(preserve_human=...)`.
- harvest_trainset.py: `harvest_crop_fail_queue()`, `CROP_FAIL_QUEUE_CSV`, `DAILY_CROP_DIR`,
  `FAIL_ORIG_DIR`/`METERID_FAIL_DIR`.
- 복구본: `daily_state.csv`(1,431행/10컬럼), 원본 백업은 `daily_state.csv.bak-swap교정전-20260702-222737`.
- 계약 문서: `ami-work/docs/data-contract.md`.
- 이전 세션(7/14~16, 아미큐 E5/800px/cycle8)은 이월 상태 그대로 — 위 "다음" 4번 참고,
  상세는 이전 HANDOFF 히스토리(git 없음, 필요시 옵시디언 로그 참조).
