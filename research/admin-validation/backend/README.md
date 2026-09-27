# admin-validation 백엔드 — 로컬 실행법 (Phase 1)

---

## v1 운영 안내 — 맥 상시 가동

### 접속 주소
- 포털: `http://localhost:8080/admin-validate.html`
- 백엔드 헬스: `http://127.0.0.1:8765/health`

### 한 번에 기동 (백엔드 + 정적 서버)
```bash
research/admin-validation/start.sh
```
이미 떠 있는 포트는 건너뜁니다.

### 맥 부팅/로그인 시 자동 실행 (launchd)
```bash
# 1. plist를 LaunchAgents에 복사
cp research/admin-validation/com.amiwork.validate.plist \
   ~/Library/LaunchAgents/

# 2. 등록 (이 명령은 영준님이 직접 실행)
launchctl load ~/Library/LaunchAgents/com.amiwork.validate.plist

# 3. 수동 시작
launchctl start com.amiwork.validate

# 4. 등록 해제
launchctl unload ~/Library/LaunchAgents/com.amiwork.validate.plist
```
plist 파일 경로는 영준님 홈 디렉토리에 맞게 수정 필요.
ANTHROPIC_API_KEY가 필요하면 plist의 EnvironmentVariables 블록 주석 해제 후 입력.

### 외부 접속 (선택)
맥 외부(다른 기기, 사무실 내 PC 등)에서 접속하려면 cloudflared 터널 한 줄:
```bash
cloudflared tunnel --url http://localhost:8080
# 출력된 https://*.trycloudflare.com URL을 상대방에게 공유
```
백엔드(8765)도 외부에서 호출해야 하면 별도 터널:
```bash
cloudflared tunnel --url http://localhost:8765
# admin-validate.html의 API_BASE 상수를 해당 URL로 교체
```

---

## 전제

- 맥 로컬 전용. uvicorn이 영준님 맥에서 상시 실행.
- Python 환경: `research/ocr_poc/venv_parseq` (torch/firebase_admin/ultralytics 등 이미 설치됨)
- `daily_cycle.py` import 경로: `research/ocr_poc/daily_cycle.py`
- 서비스 계정 키: `~/Downloads/ami-jongno-firebase-adminsdk-fbsvc-dfacd1e2ad.json`

---

## 1. 패키지 설치 (최초 1회)

```bash
# ami-work 프로젝트 루트에서 실행
research/ocr_poc/venv_parseq/bin/pip install -r research/admin-validation/backend/requirements.txt
```

> daily_cycle.py 의존성(torch, ultralytics, firebase_admin 등)은 venv_parseq에 이미 있으므로
> fastapi / uvicorn / anthropic 만 추가 설치됨.

---

## 2. 서버 기동

```bash
# ami-work 루트에서 실행
ANTHROPIC_API_KEY=sk-ant-... \
research/ocr_poc/venv_parseq/bin/uvicorn \
  research.admin-validation.backend.app:app \
  --host 127.0.0.1 --port 8765 --reload
```

또는 backend/ 폴더에서:

```bash
cd research/admin-validation/backend
ANTHROPIC_API_KEY=sk-ant-... \
../../../ocr_poc/venv_parseq/bin/uvicorn app:app --host 127.0.0.1 --port 8765 --reload
```

- `ANTHROPIC_API_KEY` 없이 기동해도 동작함 — `/suggest`만 `{available: false}` 폴백.
- `--reload` 옵션: 코드 변경 시 자동 재기동 (개발 편의용). 검증 잡 실행 중에는 파일 변경으로 프로세스가 재기동되어 잡이 중단됨 — 실제 검증 중에는 `--reload` 제거 후 기동할 것.

---

## 3. 동작 확인

```bash
# 헬스체크
curl http://127.0.0.1:8765/health

# 자료 목록
curl http://127.0.0.1:8765/datasets

# 대화형 API 문서 (브라우저)
open http://127.0.0.1:8765/docs
```

---

## 4. 검증 실행 예시

```bash
# 검증 시작 (백그라운드 잡)
curl -X POST http://127.0.0.1:8765/validate \
  -H "Content-Type: application/json" \
  -d '{"dataset":"jongno","date":"20260625"}'
# → {"job_id":"a1b2c3d4","status":"running"}

# 잡 상태 확인
curl http://127.0.0.1:8765/jobs/a1b2c3d4

# 결과 조회
curl "http://127.0.0.1:8765/results?dataset=jongno&date=20260625"
```

---

## 5. daily_cycle.py import 경로 설명

`app.py`는 시작 시 아래 경로를 `sys.path`에 추가합니다:

```
research/ocr_poc/         ← daily_cycle.py, visionocr_batch.swift 등 위치
```

`daily_cycle.py`는 내부에서 `parseq_repo/`(PARSeq 모델) 경로도 자동으로 추가하므로
별도 조치 불필요합니다.

---

## 6. 주의 사항

- **동시 검증 금지**: MPS(Apple Silicon GPU) 프로세스는 1개만 가능.
  `/validate` 진행 중 재호출하면 `HTTP 409` 반환.
- **Phase 4 미포함**: `/verdict`는 판정을 RTDB `ocr_review/`에 기록만 함.
  실제 `removal_values` DB 반영(`--apply`)은 Phase 4에서 구현.
- **인증 미포함**: Phase 3에서 역할(validator) 기반 인증 추가 예정.
- **서비스 계정 키**: `dataset_config.json`의 `cred` 경로가 존재해야 `/verdict` 동작.
  경로가 없으면 `ApplicationDefault()` 폴백 시도.

---

## 7. 파일 구조

```
research/admin-validation/
  backend/
    app.py              ← FastAPI 앱 (이 디렉토리)
    requirements.txt    ← fastapi/uvicorn/anthropic
    README.md           ← 이 파일
  dataset_config.json   ← 자료 설정 (DB URL, 버킷, 서비스 계정 키)
  plan.md
  research.md

research/ocr_poc/
  daily_cycle.py        ← 검증 엔진 (import 대상, 수정 금지)
  venv_parseq/          ← Python 환경 (여기서 uvicorn 실행)
```
