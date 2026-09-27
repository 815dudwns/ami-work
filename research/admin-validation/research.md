# 데이터 검증 관리자 페이지 — 사전 리서치

작성: 2026-06-26
목적: 웹 기반 검증 관리자 페이지 설계를 위한 현황 파악

---

## 1. daily_cycle.py 전체 흐름

### 위치
`research/ocr_poc/daily_cycle.py` (1211줄)

### 진입점 CLI
```
venv_parseq/bin/python3 daily_cycle.py [--date YYYYMMDD]  # 기본=오늘 KST
                                       [--stats]          # 상태 통계
                                       [--review --upload] # need_human HTML 생성+업로드
                                       [--sonnet]         # 2차 OCR(Google 캐스케이드)
                                       [--scan-swap]      # dm_mt↔var 스왑 스캔
                                       [--sync-review YYYYMMDD]  # RTDB 판정 반영
                                       [--no-sync]        # auto-sync 비활성
                                       [--meterid-only / --values-only]
```

### "자료별/전체"의 실제 단위
- **날짜(YYYYMMDD) 단위**가 1차 단위. `--date`로 하루치를 처리.
- 지역/차수 개념은 CLI 파라미터로 없음. DB에서 `replaced_at`(ms) 기준으로 날짜 필터링.
- "전체"는 CSV 누적(daily_state.csv, daily_meterid.csv, daily_removal_meterid.csv)으로 과거분이 계속 쌓임.
- 계기 단위(mid 별)로 각 레코드를 처리. 지역(구) 차원은 addr 필드에 있지만 필터 옵션 없음.

### 입력/출력
- **입력**: Firebase RTDB `ami-jongno/workStatus/jongno` 전체 읽기(날짜 필터는 파이썬에서)
- **중간**: Firebase Storage에서 사진 다운로드(/tmp/daily_cycle/)
- **출력 CSV**:
  - `daily_state.csv` — 검침값 (ts, fid, mid, type, worker_val, parseq, google, final, status, orig_status)
  - `daily_meterid.csv` — 신설 계기번호 (ts, mid, new_meter_id, vision_result, google_result, status)
  - `daily_removal_meterid.csv` — 철거 계기번호 (ts, mid, old_meter_id, vision_result, google_result, status)
- **출력 HTML**: need_human 건을 Firebase Storage에 업로드(reviews/ 경로), 공개 URL 반환

### 트랙 구조
- **트랙1 검침값**: lcd.jpg(서버크롭) → 없으면 원본+YOLO → PARSeq → 작업자값 대조
- **트랙2 신설번호**: new.jpg → Apple Vision(배치) → 불일치분만 Google Vision
- **트랙2b 철거번호**: old_meter_photo → Apple Vision → 불일치분 Google Vision
- **2차 OCR(--sonnet)**: need_sonnet 건을 G타입은 YOLO+PARSeq 동적크롭+Google, E타입은 Google

### 상태(status) 값
- `auto`: OCR=작업자 일치 (자동 통과)
- `pass2`: 2차 OCR에서 통과
- `google`: Google Vision에서 확인
- `need_sonnet`: 1차 PARSeq 불일치 → 2차 대기
- `need_human`: 사람 판정 필요
- `human` / `human_skip`: 사람이 판정 완료 / 사유 입력(불가)
- `swap_suspect`: dm_mt↔var_day 사진 스왑 의심
- `no_crop` / `crop_err` / `bad_ratio` / `no_photo`: LCD 크롭 실패 계열

### OCR 라이브러리 의존성
| 라이브러리 | 용도 | 맥 종속 여부 |
|---|---|---|
| PARSeq (PyTorch) | 검침값 LCD 숫자 판독 (주력) | 맥 전용 아님. GPU 없이 CPU 동작. 체크포인트 필요 |
| Apple Vision (Swift) | 계기번호(신설/철거) 명판 OCR — 배치 | **맥 전용** (visionocr_batch.swift, subprocess 호출) |
| Google Cloud Vision API | 계기번호 2차(Apple 실패분), 검침값 2차(E타입+G타입 백업) | 클라우드 — 맥 종속 없음 |
| YOLOv8 (ultralytics) | LCD 박스 검출(크롭), 숫자검출(DIGIT_PT) | 맥 종속 없음 |
| firebase_admin SDK | Storage 다운로드/업로드, RTDB 읽기 | 종속 없음 |
| gcloud CLI | Google 토큰 발급 (`gcloud auth print-access-token`) | **gcloud 설치 필요** — 서버에서는 서비스 계정으로 대체 가능 |

### 맥 종속 부분 (서버 이전 시 교체 필요)
1. `SWIFT = BASE / "visionocr_batch.swift"` + `subprocess.run(['swift', ...])` → Apple Vision 호출 — 서버에서 불가
2. `torch.device("mps" ...)` → Apple Silicon GPU. CPU 폴백 있어 동작은 됨
3. `CRED = "/Users/woodelight/Downloads/..."` → 하드코딩 서비스 계정 키 경로. 환경변수로 교체 필요
4. `gcloud auth print-access-token` → 서버에서는 서비스 계정 ADC(Application Default Credentials)로 대체

---

## 2. 후처리_자동화_기획.md 핵심

### 4단계 캐스케이드
```
1단계: 시스템 규칙 필터  (형식 위반·0값·날짜패턴 등 즉시 차단)
2단계: ocr-meter OCR 검증  (사진 vs 작업자값, 신뢰도>=0.9)
3단계: need_human  (사람 판정: verdict = value/reason/custom)
4단계: 처리  (종로DB patch / awms patch / 보고)
```

### need_human 판정 흐름
- 3종 verdict 타입: `value`(후보값 선택), `custom`(직접 입력), `reason`(불가 사유)
- 판정 결과는 RTDB `ami-jongno/ocr_review/daily_val_{YYYYMMDD}/{ts}` 에 저장
- `sync_review_daily()`가 RTDB 판정을 daily_state.csv final·status에 반영 (자동: AUTO_SYNC_REVIEW=True)
- 이미 human 처리된 행은 최신 판정으로 덮어씀(멱등)

### --apply 설계 (현재 미구현)
- 종로DB PATCH: `removal_values[fid]` = verdict 값 (Firebase REST)
- awms PATCH: awms_synced=True인 건만 mobMtr5000/saveRow 추가 (v1 이후 트랙)
- 안전조건 (2026-06-15 swap 사고 교훈):
  - live DB 재조회 후, 현재값 != verdict인 것만 건드림(멱등)
  - dry-run 출력 → 승인 후 실제 쓰기
  - 변경 로그 보존
- 롤백 UI 필요 (판정 수정/취소 페이지)

### 1단계 규칙 필터 확정 내용
- 후처리에서만 차단 (작업 입력 시점에서 막지 않음 — 영준님 결정 2026-06-15)
- 검침값: 정수부 3~6자리, 빈값·0 skip, 날짜패턴(20260615) 오크롭
- 계기번호: 숫자 11자리 / A·L 접두 허용, 타입코드 화이트리스트
- A/L 접두 계기번호: 타입코드 추출 전 알파벳 정규화 필요

---

## 3. 종로 검증 대상 데이터 구조

### Firebase RTDB 구조
```
ami-jongno-default-rtdb (asia-southeast1)
  workStatus/
    jongno/
      {주소}/                          # 예: "서울특별시 종로구 관철동 11-14"
        state: "complete" | "hold" | ...
        replacement_list/
          {mid}/                       # 계기번호(11자리)
            worker: "meter1"           # 작업자 ID
            worker_name: "장진교"
            replaced_at: 1781044947434  # ms timestamp
            old_meter_id: "02470001147"
            new_meter_id: "A0550094653"
            old_meter_photo: "https://firebasestorage.googleapis.com/..."
            new_meter_photo: "https://firebasestorage.googleapis.com/..."
            removal_values:            # 검침값 (작업자 입력)
              whme_day: 416189         # 주간 유효전력 (정수)
              whme_mngt: 64834         # 야간 유효전력 (정수)
              dm_mt_day: 31.99         # 최대전력 (소수2자리)
              var_day: 74039           # 무효전력 (정수)
            removal_photos:            # 검침 사진 (fid별)
              whme_day: "https://firebasestorage.googleapis.com/..."
              whme_mngt: "https://..."
              dm_mt_day: "https://..."
              var_day: "https://..."
```

### Firebase Storage 경로 패턴
```
replacements/{주소}/{mid}_{replaced_at_ms}/{fid}.jpg
  예: replacements/서울특별시 종로구 관철동 10-23/06450095035_1780959812573/whme_day.jpg

또는 lcd 크롭 후:
replacements/.../whme_day_lcd.jpg     # 서버크롭 결과 (앱이 업로드)
```
- 신설계기 사진: Storage의 `replacements/.../new.jpg` (new_meter_photo URL)
- 철거계기 사진: Storage의 `replacements/.../old.jpg` (old_meter_photo URL)

### 계기번호 형식 (실측)
- 숫자 11자리: 18,194건 (92.8%)
- A 접두 11+1자리: 1,188건 (신설 EA·Amigo 포함)
- L 접두: 231건

### 검침값 4필드 비교 규칙 (FIELD_STANDARD)
| 타입 | fid | 비교 방식 |
|---|---|---|
| E/EA | whme_day | 정수부 비교(intpart) |
| G | whme_day / whme_mngt / var_day | 정수부 비교 |
| G | dm_mt_day | 소수 보존(numval) + 점탈락 보정(_dm_recon_match) |

---

## 4. Firebase 반영 경로

### RTDB 읽기 (현재 방식)
- daily_cycle.py: `urllib.request.urlopen(DB_URL)` — 인증 없는 공개 읽기 (rules .read=true)
- scripts/restore_firebase.py, upload_work_status.py: `firebase_admin` SDK + 서비스 계정 키

### RTDB 쓰기 (Firebase Admin SDK 방식)
```python
from firebase_admin import credentials, db as firebase_db
cred = credentials.Certificate(SERVICE_ACCOUNT_KEY_PATH)
firebase_admin.initialize_app(cred, {'databaseURL': DB_URL})
ref = firebase_db.reference('workStatus/jongno/{주소}/replacement_list/{mid}/removal_values')
ref.update({'whme_day': verdict_value})
```
- 서비스 계정 키 파일: `ami-jongno-firebase-adminsdk-fbsvc-dfacd1e2ad.json` (로컬 Downloads/)
- ami-work(ami-work-1c49a)와 ami-jongno는 별도 프로젝트 — 서비스 계정 키도 별도

### Firebase REST API (서버 무인증 쓰기)
- RTDB REST: `PATCH https://ami-jongno-default-rtdb.../workStatus/jongno.json` + `?auth=<token>`
- 서비스 계정으로 ID Token 발급 후 사용 가능 (firebase-admin으로 custom token → ID token 교환)
- 또는 서비스 계정 키로 직접 `firebase_admin` 초기화 후 SDK 사용이 더 간단

### Storage 접근
- `firebase_admin.storage.bucket().blob(path).download_to_filename(...)` — 서비스 계정
- 공개 URL 다운로드: `urllib.request.urlretrieve(public_url, local)` — 토큰 필요 시 URL에 포함
- 현재 업로드(upload_review.py): `blob.upload_from_filename()` + `blob.make_public()`

---

## 5. ocr-meter 프로젝트 경계

### 실제 파일 관계
- `~/Projects/ocr-meter/ocr_poc` → `~/Projects/ami-work/research/ocr_poc` (심볼릭 링크)
- 코드는 물리적으로 ami-work/research/ocr_poc에 있고, ocr-meter는 링크만 걸려있음
- ocr-meter 프로젝트 루트에 독립 CLAUDE.md, HANDOFF.md 있음

### 책임 분리 기준 (확정 — 메모리 [[ocr_project_split]])
| ami-work 책임 | ocr-meter 책임 |
|---|---|
| 종로맵 replacement-modal YOLO LCD 검출 통합 | PARSeq 학습·체크포인트 관리 |
| daily_cycle.py의 OCR 호출 인터페이스 | OCR 정확도 개선·모델 교체 |
| Firebase DB 반영(--apply) | cycle.py 학습 라벨 관리 |
| 관리자 웹 페이지 판정 UI | 오탐·미탐 분석, 학습데이터 빌드 |

### OCR 인터페이스 현재 형태
- 검침값: `parseq_model(transform(image))` → 문자열 반환. 직접 호출(함수 아님).
- 계기번호: `subprocess.run(['swift', SWIFT, list_file], stdout=f)` → raw_out 파일 → `parse_raw_output()`
- Google Vision: `google_vision_text(img_path, token)` → 텍스트 반환

**교체 가능 인터페이스로 추상화 가능 여부**: 현재는 각 트랙 함수 안에 인라인으로 호출. `ocr_backend(img_path) -> (text, confidence)` 형태로 분리 가능하지만 현재 미분리. 웹 관리자 페이지용으로 새로 설계 시, OCR을 별도 마이크로서비스(HTTP 엔드포인트)로 래핑하는 것이 자연스러움.

---

## 6. 서버/클라우드 OCR 후보

### 현재 사용 중
- **Google Cloud Vision API** (`vision.googleapis.com/v1/images:annotate`): 계기번호 2차, 검침값 2차 백업. 토큰은 `gcloud auth print-access-token` 또는 서비스 계정 ADC. scope `cloud-vision` 이미 있음(`~/.google-tokens/token.pickle` CLAUDE.md 확인). 유료(1000건당 약 $1.5).

### Apple Vision 대체 후보
Apple Vision(맥 전용 Swift)을 서버에서 대체할 선택지:

| 후보 | 특징 | 장점 | 단점 |
|---|---|---|---|
| **Google Cloud Vision** | 이미 2차로 쓰는 중 | 기존 연동 있음, 정확도 높음, 계기번호 명판 텍스트 추출에 충분 | 유료($1.5/1000), 외부 API 의존 |
| **PARSeq (서버 배포)** | 검침값 LCD에 특화된 현재 학습 모델 | 무료, 가장 특화, 이미 학습 완료(90.88%) | 계기번호 명판(자유 텍스트)에는 부적합. 서버에 PyTorch 환경 필요. 체크포인트 파일 12MB+ |
| **Tesseract OCR** | 오픈소스 범용 OCR | 무료, 서버 설치 간단, 한글 지원 | LCD 숫자 정확도 낮음(기존 PARSeq 비교 불리). 명판 OCR은 어느정도 가능 |
| **EasyOCR** | Python 오픈소스 딥러닝 OCR | 무료, pip install | GPU 없으면 느림, 정확도 Google보다 낮음 |
| **AWS Textract** | 클라우드 OCR | 문서 구조 파악 잘함 | 별도 계정 필요, 추가 비용 |
| **Azure Computer Vision / Document Intelligence** | 클라우드 | 숫자 정확도 양호 | 별도 계정 필요, 추가 비용 |

**결론(추천 방향)**:
- 계기번호(명판) OCR: Google Cloud Vision으로 통일 (이미 연동, 정확도 충분, Apple Vision 대체)
- 검침값 LCD OCR: PARSeq를 서버에 배포하거나, Google Cloud Vision의 숫자 추출(현재 2차로 사용 중인 방식) 주력으로 전환
- Apple Vision 완전 제거 시: 계기번호 정확도 검증 필요(현재 Apple 1차 → Google 2차 구조)

---

## 7. 재사용 껍데기

### stats.html (592줄)
- **로그인 게이트**: `authGetSession()` → role 체크 → 비허가 시 body 비우고 redirect
  ```javascript
  (function statsGate() {
      const session = authGetSession();
      const allowed = !!session && (session.role === 'admin' || session.id === 'user09');
      if (!allowed) { document.body.innerHTML = ''; window.location.replace('login.html'); }
  })();
  authRequire();
  ```
- **Firebase 연동**: `firebaseConfig` (js/config.js)로 초기화, `firebase.database()` SDK
- **구조**: 탭 UI(작업자별/구별/전체), 날짜 필터, 테이블 렌더링
- **재사용 가능**: 로그인 게이트 패턴(IIFE+role 체크), Firebase SDK 초기화 패턴, 탭 구조

### admin.html (385줄)
- **로그인 게이트**: 동일 패턴 (role='admin' 체크만, user09 제외)
- **기능**: 사진 등록(JPEG 업로드)
- **재사용 가능**: admin role 게이트 코드, 헤더/컨테이너 레이아웃

### auth.js 구조
- 계정: 하드코딩 배열 (ACCOUNTS). role: 'admin' / 'user'
- 세션: `localStorage['ami_auth']` (JSON)
- 함수: `authLogin(id, pw)`, `authGetSession()`, `authLogout()`, `authRequire()`
- 검증 관리자 페이지: admin role만 허용. 별도 role(예: 'validator') 추가하면 유연성 확보 가능.
- 한계: 하드코딩이라 "데이터검증 사장님" 계정 추가 = auth.js 코드 수정 필요 (또는 별도 인증 시스템)

---

## 8. 호스팅 선택지

검증 서버(파이썬 백엔드 + OCR)를 상시 운영하기 위한 현실적 옵션:

| 옵션 | 비용 | 복잡도 | 비고 |
|---|---|---|---|
| **Oracle Cloud Free Tier** (VM.Standard.A1 / E2.1.Micro) | 무료 | 중 | 상시 무료 VM. 2~4 vCPU, 12~24GB RAM(A1 arm). PARSeq CPU 동작 가능. 한국 리전 없음(일본/미국). 가입 필요 |
| **Google Cloud Run** (serverless 컨테이너) | 요청당 과금, 월 200만 무료 호출 | 중 | 콜드스타트 있음(모델 로드 ~10초). 단발 검증 트리거에 적합. PARSeq 모델 포함 시 이미지 크기 큼 |
| **Fly.io** | 소형 무료 tier ($0~5/월) | 낮음 | Docker 배포, 상시 기동. 512MB RAM free — PARSeq PyTorch 부족. 업그레이드 시 $5~15/월 |
| **Railway / Render** | $5~10/월 | 낮음 | Python 앱 git push 배포. 512MB~1GB RAM. OCR없이 API 서버만 두고 Google Vision 호출 시 가능 |
| **Hetzner VPS CAX11** (ARM, 독일) | 약 4유로/월 | 중 | 2vCPU, 4GB RAM. PARSeq CPU 동작. SSH로 직접 관리. 한국에서 약 150ms 레이턴시 |
| **AWS/GCP/Azure 소형 VM** | 한국 리전 t3.small 등 $15~25/월 | 중-높음 | 낮은 레이턴시(서울 리전), 관리 복잡도 있음 |
| **GitHub Pages** | 무료 | - | **정적 파일만** — 파이썬 백엔드 불가 |

**권장 방향**:
- OCR을 Google Cloud Vision API에 위임하면 파이썬 백엔드는 경량화됨(Firebase RTDB 읽기/쓰기 + 사진 URL 전달만)
- 경량 백엔드: Railway/Render $5~10/월 또는 Cloud Run (요청 적으면 거의 무료)
- PARSeq를 서버에서도 직접 돌리려면 최소 2GB RAM 필요 — Hetzner CAX11 또는 Oracle Free가 현실적
- 초기 v1은 Google Cloud Vision API 위임으로 최소화 권장 (Apple Vision 대체 포함)

---

## 종합 설계 포인트 (웹 관리자 페이지 구축 시)

1. **백엔드 역할**: Firebase RTDB에서 날짜/지역 기준으로 레코드 조회, 사진 URL 전달, verdict 수신해 DB PATCH. PARSeq는 선택(Google Vision 위임이면 불필요)

2. **자료/지역 1급 차원**: `dataset_config = {id: "jongno", db_url: ..., bucket: ..., service_key: ...}` 구조로 설정 파일화. 나중에 구로·금천 추가 시 설정만 추가.

3. **OCR 인터페이스 추상화**: `ocr_backend.meter_value(img_url) -> {text, confidence}` / `ocr_backend.meter_id(img_url) -> {text, confidence}` 형태. v1은 Google Vision, 나중에 PARSeq 서버로 교체 가능.

4. **판정 저장**: 현재 RTDB `ocr_review/daily_val_{YYYYMMDD}/{ts}` 패턴 유지 가능. 웹에서 POST → 백엔드 → RTDB 저장.

5. **--apply(Firebase PATCH)**: verdict → `workStatus/jongno/{addr}/replacement_list/{mid}/removal_values/{fid}` PATCH. live 재조회 게이트 + 로그 필수.

6. **인증**: auth.js 패턴 재사용 or 별도 비밀번호 + 역할 테이블(validator role 추가). 새 관리자에게 맥 없이 접근 가능해야 하므로 새 계정 추가가 코드 수정 없이 되어야 함 → 환경변수 또는 Firebase 인증 전환 검토.

7. **서버 선택**: v1에서 OCR을 Google Vision으로 단일화하면 경량 서버($5~10/월)로 충분.
