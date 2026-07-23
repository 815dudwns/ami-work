---
name: ocr-cycle
description: ocr-meter 일반 사이클. A31 과거 핸드폰 사진(라벨 없음)에서 계기번호 OCR→DB 매칭으로 검침값 정답 확보 후 200개 배치 판독. /ocr-cycle 또는 "일반 사이클", "사이클 돌려" 시 실행.
---

# 일반 OCR 사이클 (ocr-meter 전용)

> ★**OCR 검증 규칙 SSOT = `ocr_poc/OCR_검증규칙.md`** (검침값 자릿수표준·계기번호 추출·오통과0). 매칭·판독 규칙은 여기 따른다.

## 최신 검증결과 (2026-06-27 갱신)
- **계기번호 추출 개선이 이 사이클의 표본확보 레버.** `phone_match.py`가 over-read(명판 다른 숫자까지 길게 읽힘)로 계기번호를 못 따내면 DB매칭 실패 → 검침값 정답 못 확보였음. → **타입자리 슬라이딩 폴백**(연속숫자에서 3~4자리가 타입코드인 11자 윈도우) + **유일매칭 가드**(한 사진이 DB 여러 계기에 매칭되면 ambiguous로 제외, 오매칭 방지) 추가. 전에 over-read·토큰병합(특히 G 하이픈 다중라인)으로 놓친 사진 **재수확** → G 표본 증가 기대. 재수확 결과는 phone_match_before_0627.csv와 비교.
- **재학습은 표본부족으로 보류**(2026-06-27): 진짜 G 학습신호 27건뿐. 이 사이클로 G need_human 사람판정을 충분히(~100+) 쌓는 게 result-revalidate의 전제. [[revalidate_20260627_sample_short]]

## 핵심 개념 (영준님 정의 2026-06-13)
**일반 사이클 = A31 철거계기만 뽑아서 검침값 대조 → 검침값 OCR(PARSeq) 정확도를 높이는 게 목표.**
최종 목표는 **검침값 OCR 확률 향상**. YOLO(LCD 크롭)는 이미 쓸 만하고 약한 고리가 PARSeq 검침값 판독 — 그걸 개선하는 평가·학습 데이터를 이 사이클로 확보한다.

A31 폰의 철거계기 사진 ~수천 장은 **검침값 라벨이 없다.**
그러나 종로 DB에는 작업자가 입력한 검침값(removal_values)이 5,250건 있고, 키가 **철거계기번호(mid)**다.
→ 사진에서 **계기번호를 OCR로 읽어 DB에 매칭하면 작업자 검침값(정답)을 가져올 수 있다.**
이게 그동안 못 쓰던 정답이다.
- A31 철거 587장 = 검침값 정답 확보 표본 (일반사이클 본체)
- 신설계기 계기번호 확인은 일반사이클 대상 아님 → 데일리사이클 소관
- A33 폴더 = 통신팀(전체사진+MAC) → OCR 무관, 전량 제외

## 데이터
- A31 철거계기 사진: `ami-work/data/phone_photos_20260606/DCIM/DCIM/Camera` (검침값 LCD + 철거계기번호)
- A33 신계기 사진: `ami-work/data/phone_photos_A33_20260606/DCIM/Camera` (신설 계기번호)
- DB 룩업: `/tmp/db_meter_lookup.json` — {철거계기번호: {removal_values, replaced_at, new_meter_id, addr}}
- 룩업 재빌드 필요시: 종로 DB(workStatus/jongno) → mid별 removal_values 추출

## 사이클 흐름
```
1) 매칭(전수) : 사진 계기번호 Apple Vision OCR → 모든 후보 추출(타입자리 슬라이딩 폴백 포함)
              → DB 양방향 set 멤버십 매칭(철거 mid) → 유일매칭만 검침값 정답 확보(복수=ambiguous 제외)
              → phone_match.csv
2) 판독(200배치): removal 매칭분 → cycle_state 주입(worker_val=DB검침값)
              → LCD YOLO 크롭 → PARSeq → 작업자값 대조
3) 캐스케이드(전부 공짜): PARSeq → 불일치 시 공짜 멀티엔진(EasyOCR+AppleVision) 대조 → 사람
4) 4필드(1종2종)= need_human 바로 (자동판독 안 함, 영준님 지시)
5) need_human 큐 누적 → review HTML 업로드 → 판정 반영, 계속 업데이트
```

## 캐스케이드 = 전부 공짜 (Sonnet 폐기, 영준님 2026-06-13)
EasyOCR·AppleVision·PARSeq 모두 공짜 → 유료 Sonnet 쓸 이유 없음.
- 1차 PARSeq → 작업자값과 일치하면 auto
- 2차 multi_engine.py: PARSeq 불일치분에 EasyOCR+Vision 추가 판독
  - 2개+ 엔진 합의값 == 작업자값 → auto (PARSeq만 틀렸던 것, 토큰0 회수)
  - 합의값 != 작업자값 → need_human (작업자 입력오류 의심 = 이 사이클이 잡는 진짜 가치)
  - 다 갈림/판독실패 → need_human. 애매하면 무조건 사람 (오통과 0 최우선)
- 3차 사람: 공짜 엔진도 갈린 것만

## 학습은 여기서 안 한다 → [[result-revalidate]] 전담 (영준님 2026-06-13)
일반사이클 목표 = **표본 늘리기 + 검침값 측정확률 높이기(측정/평가)**까지.
검증 확정된 정답(auto + 사람판정)은 쌓아두기만 하고, **PARSeq 재학습은 "결과 재검증" 스킬에서만** 한다.
- 데일리 + 일반 검증분 + need_human 판정결과 → 결과 재검증이 학습셋으로 사용
- A31 591장(특히 크롭 좋은 G 89건)이 첫 재학습 표본 공급원

## 커맨드
```bash
cd /Users/woodelight/Projects/ocr-meter/ocr_poc
source venv_parseq/bin/activate

# 1단계 매칭 (전수, 계기번호 OCR→DB)
venv_parseq/bin/python3 phone_match.py        # phone_match.csv 생성/갱신

# 2단계 판독 (200개씩)
python3 cycle.py prep                          # phone_match.csv removal분 → cycle_state 주입
python3 cycle.py parseq 200                    # 200개 배치 PARSeq (무료)
python3 cycle.py sonnet [N]                    # 불일치분 Sonnet (유료, N 상한)
python3 cycle.py review --upload               # need_human HTML 생성+업로드 → URL 공유
python3 cycle.py sync                           # RTDB 온라인 판정 → cycle_state 자동 반영
python3 cycle.py stats                         # 현황 (항상 먼저)
# (구) cycle.py apply <json> — JSON 내보내기 방식, 백업용으로만 유지
```

## 상태값 (cycle_state.csv)
- `auto`: PARSeq 자동 일치 (무료, 0토큰)
- `sonnet`: Sonnet 해결
- `human`: 사람 판정 완료 / `human_skip`: 판독 불가
- `need_sonnet`: PARSeq 불일치, Sonnet 대기
- `need_human`: Sonnet도 실패, 사람 필요 (큐 누적)
- `multi_field` / 4필드: 1종2종 → need_human 직행
- `no_crop`: YOLO 미검출 / `no_target`: DB 매칭 안 됨(검침값 정답 없음)

## PM 행동 지침
1. 세션 시작 시 stats로 현황 파악 후 착수
2. 매칭/판독 실행은 백그라운드 위임, PM은 영준님 대화
3. 200개 단위로 끊어서 판독, sonnet은 N 상한 (세션 토큰 주의)
4. need_human → review --upload → URL 영준님께 전달 (모바일/PC 어디서나 판정)
   - 판정 클릭=RTDB 즉시 저장, 판정된 건 다시 안 나옴 → cycle.py sync로 자동 반영
5. need_human 큐는 비우는 게 목표가 아니라 **계속 쌓으며 업데이트**
   - 판정 결과 저장 위치: RTDB `ocr_review/<store_key>` (검침값=cycle_review)
