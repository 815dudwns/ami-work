# 전기 계기판 OCR 자체 학습·운영 조사 보고서

작성일: 2026-06-06 (실측 정정: 2026-06-06)
작성 목적: 한국 전기 계기판(전력량계) 사진을 OCR로 읽어 **raw 데이터를 1차 자동검증**하는 시스템 구축. OCR 모델 자체 학습·운영 방안 조사.

> 아래 §3~§10(엔진 비교·AMR 사례·합성데이터·파이프라인·온디바이스)은 유효. 단 §0/§1의 **목적·데이터 전제는 실측으로 정정**되었으니 반드시 §0을 먼저 읽을 것.

---

## 0. 핵심 정정 — 진짜 목적과 철거/신설 분기 (2026-06-06 실측)

### 0-1. 목적 = 사진 분석이 아니라 "데이터 검증 시스템"

OCR을 학습시키는 이유는 **앞으로 들어오는 raw 데이터(작업자가 수집·입력한 계기번호·검침값)를 자동 검증**하기 위해서다.

```
[raw 데이터 + 계기 사진]
   → 1차: OCR이 사진에서 값을 읽어 입력값과 대조 (자동)
       → 일치: 통과
       → 불일치(문제건): 2차 사람 검증
```

따라서 핵심 지표는 단순 정확도가 아니라 **오통과율**(틀린 값을 일치로 잘못 판정해 통과시키는 비율)을 낮추는 것. (§9 평가지표 보강)

### 0-2. 1차 분류축 = 철거 vs 신설 (계기타입 아님)

원래 초안의 "모든 사진에서 계기번호+검침값 둘 다 인식"은 **틀렸다.** 무엇을 읽을지는 철거/신설로 갈린다:

| 사진 구분 | OCR이 읽을 영역 | 대조 대상 | 다수 타입 |
|---|---|---|---|
| **철거계기** | LCD의 **검침값(적산전력)** | 입력 검침값 | E (E는 신설 없음=항상 철거), G |
| **신설계기** | **계기번호**(명판/QR) | 입력 계기번호 | AMIGO |

- **철거/신설은 사진 업로드 시점에 이미 구별됨** → OCR이 분류 불필요. 플래그에 따라 검침값/계기번호 중 무엇을 읽을지만 분기.
- **E타입은 신설이 없다** → E = 항상 검침값 대상.
- 어떤 타입으로 raw를 가져올지는 미정 → 철거·신설 두 파이프라인 모두 준비.

### 0-3. 실측 6장으로 확인한 화면 패턴 (설계 직결)

- **철거(구형 E/G)**: LCD에 검침값 안정 표시(실측 `18558.0`, `99828.0` kWh), **QR 없음** → 검침값 OCR이 유일 수단.
- **신설(AMIGO)**: LCD가 **순환 표시** — 시계/`LOAD`/검침값이 프레임마다 랜덤(실측: 시계2·LOAD1·검침1). 명판+**QR 있음**.
  - → **신설 사진에서 검침값을 읽는 건 비현실적**(값 없는 프레임 다수). 신설은 **계기번호 검증**에 집중. 계기번호는 **QR 1순위**(기존 ZXing 자산 `research/awms-qr-reader/`), OCR은 명판 폴백.

### 0-4. 현재 데이터셋의 한계 (중요)

`data/phone_photos_20260606/Download/Download/` 라벨 파싱 **499장** 중:

| 구분 | 장수 | 검증 대상 |
|---|---|---|
| Amigo (신설) | 465 | 계기번호 |
| E (철거) | 34 | 검침값 — **표본 부족** |

- 즉 **검침값 학습 데이터가 34장뿐**. 영준님 확인: "철거계기 검침 사진은 더 구할 수 있다" → 검침값 파이프라인은 **추가 수집 후 본격화**.
- 신설 계기번호 라벨(465장)은 충분 → 계기번호 검증부터 착수 가능.

### 0-5. 라벨 출처 정정

- **검침값(철거)**: 파일명=철거계기번호 → 라이브 `ami-jongno` DB `replacement_list/{계기}/removal_values` 의 `whme_day`/`whme_mngt`/`dm_mt_day`/`var_day`(지침종류와 1:1). **로컬 백업엔 8건뿐**이라 라이브 필요. **읽기 전용**.
  - 신설사진 파일명(신설번호)→철거번호 매핑은 `research/awms-poc/all_complete_rows.json`의 `CREMO_WHM_NO`↔`WHM_NO`(92% 매칭).
- **계기번호(신설)**: 파일명 계기번호 자체가 정답.

### 0-6. 남은 미해결 (다음 세션이 검증)

- 파일명 지침종류(DAY/EVEN)가 실제 화면 표시 항목과 일치하는지 (awms 사진슬롯명일 수 있음).
- removal_values 라이브 매칭률 실측.
- AMIGO 검침 프레임 유효비율(필요 시 유효프레임 필터).

---

## 1. 우리 데이터 특성 재정리

> 주의: 아래 표의 "인식 대상 1·2를 모든 사진에서"라는 전제는 §0-2로 정정됨(철거=검침값 / 신설=계기번호).

| 항목 | 내용 |
|------|------|
| 이미지 수 | 약 500장 (지속 수집 가능) |
| 계기 종류 | G-Type(7세그먼트 LCD), AMIGO, E/EA(전자식 LCD), 일부 기계식 숫자휠 |
| 인식 대상 1 | 계기번호 — 영숫자 11자리, 계기 표면/바코드 근처 |
| 인식 대상 2 | 검침값(지침값) — 순수 숫자, 소수점 포함 가능, LCD 표시부 |
| 라벨 | 파일명에 계기번호+시각+지침종류(WHME_DAY 등), 정답 검침값은 DB 별도 보유 |
| 목표 환경 | (a) 서버/PC 배치처리, (b) 안드로이드 온디바이스 검토 |

---

## 2. 계기판·7세그먼트 OCR의 특수성

### 왜 일반 OCR이 약한가

일반 OCR(Tesseract 기본, EasyOCR 기본)은 인쇄 문서·자연 이미지 문자에 최적화되어 있다. 계기판 LCD/7세그먼트 숫자는 다음 특징 때문에 별도 처리가 필요하다.

- **폰트 고정**: 7세그먼트는 획 구성이 고정(a~g 세그먼트 ON/OFF). 일반 OCR 훈련 데이터에 거의 없다.
- **조도 편차 극심**: 현장 야외 촬영 — 역광, 반사, 그림자.
- **카메라 각도**: 수직 정렬 아닌 비스듬한 촬영 빈번.
- **숫자 경계 모호**: LCD 세그먼트가 밝기 차이로만 구분, 문자 간격이 불균일.
- **계기번호(영숫자 혼합)와 검침값(숫자 전용)의 영역이 다름**: 단일 모델로 처리하면 혼선.

### 핵심 연구 결과 (출처 확인)

- DBNet(PaddleOCR) + PARSeq 조합 실험 결과, 7세그먼트 숫자 인식 정확도 **56.97%** (베이스라인 기준). 전처리 없이 범용 모델 적용 시 이 정도 수준.
  - 출처: "Detecting and recognizing seven segment digits using a deep learning pipeline", ITM Web of Conferences / ResearchGate
  - https://www.researchgate.net/publication/detecting-seven-segment-digits-deep-learning
- Fast-YOLO로 계기 영역 검출 후 CNN 인식하는 2단계 파이프라인이 AMR(Automatic Meter Reading) 분야 표준.
  - 출처: "Convolutional Neural Networks for Automatic Meter Reading", Rayson Laroca et al.
  - https://raysonlaroca.github.io/
- YOLOv8 + 별도 숫자 인식기 조합이 2024년 현재 가장 많이 채택되는 구조.
  - 출처: GitHub "Wolfkissed6040/Electric-Meter-Reading-using-YOLO-architecture"

---

## 3. 학습 가능한 OCR 엔진·프레임워크 비교

### 3-1. 비교표

| 엔진 | 학습 난이도 | 계기 인식 정확도 기대치 | 온디바이스(안드로이드) | 라이선스 | 한국 현장 적합성 |
|------|------------|----------------------|----------------------|----------|----------------|
| **Tesseract 5 LSTM 파인튜닝** | 중 (tesstrain 도구, 데이터 준비 복잡) | 중하 (영숫자 파인튜닝 시 70~85% 기대, 7세그먼트엔 약함) | 불가 (네이티브 추론 미지원) | Apache 2.0 | 영숫자(계기번호)에 한정 활용 가능 |
| **PaddleOCR PP-OCRv4/v5** | 중 (문서 풍부, 파인튜닝 가이드 있음) | 높음 (전이학습 시 90%+ 기대) | 가능 (Paddle-Lite, ONNX 변환) | Apache 2.0 | 가장 적합 — 경량 서버~모바일 모두 커버 |
| **EasyOCR 커스텀 학습** | 중하 (구조 단순, 데이터 준비 쉬움) | 중 (기본 CRNN 구조, 파인튜닝 효과 중간) | 불가 (PyTorch 직접 추론, 무거움) | Apache 2.0 | 프로토타입 적합, 배포엔 부적합 |
| **TrOCR (Microsoft, HuggingFace)** | 중상 (Transformer 기반, GPU 필요) | 높음 (문서 이미지 강점, 계기는 파인튜닝 필요) | 불가 (모델 크기 300M+) | MIT | 서버 배치처리 전용 |
| **YOLO + CRNN/CTC (커스텀 파이프라인)** | 높음 (두 모델 별도 학습·통합) | 가장 높음 (도메인 특화 시 95%+ 사례 있음) | 가능 (ONNX 변환 후 TFLite) | 각 모델별 | AMR 분야 검증된 표준 구조 |
| **Google Vision API** | 학습 불가 | 중 (범용 OCR, 7세그먼트 약함) | 네트워크 필요 | 유료 | 개인정보·인터넷 의존 문제 |
| **Naver CLOVA OCR** | 학습 불가 (커스텀 템플릿만) | 중상 (한국어 문서 강점) | 불가 | 유료 구독 | 계기 특화 어려움, 비용 문제 |

### 3-2. 엔진별 세부 분석

#### Tesseract 5 LSTM

- tesstrain(https://github.com/tesseract-ocr/tesstrain)으로 파인튜닝 가능.
- 영숫자(계기번호 11자리)에는 유용하나, 7세그먼트 LCD 숫자(검침값)는 구조적으로 약함.
- 훈련 데이터: 각 문자 단위 box 파일 + tiff 이미지 필요 → 라벨링 공수가 가장 많음.
- **결론**: 계기번호 보조 검증 용도로만 활용 검토.

#### PaddleOCR PP-OCRv4/v5

- PP-OCRv5(2025 출시): 5M 파라미터로 PP-OCRv4 대비 정확도 13% 향상, 단 모바일 모델은 370 FPS+ 가능.
  - 출처: PP-OCRv5 논문, CVPR 2025 (https://openaccess.thecvf.com/), Reddit 커뮤니티 논의
- 파인튜닝 경로: 검출(DBNet) + 인식(SVTR/PARSeq) 각각 별도 파인튜닝 가능.
- ONNX 변환 후 Paddle-Lite로 안드로이드 배포 공식 지원.
  - 공식 문서: https://github.com/PaddlePaddle/PaddleOCR/blob/main/deploy/lite/readme.md
- HuggingFace에 ONNX 변환 모델 공개됨: https://huggingface.co/monkt/paddleocr-onnx
- **결론**: 이 프로젝트의 1순위 엔진.

#### YOLO + CRNN/CTC

- AMR(자동검침) 분야에서 가장 검증된 2단계 파이프라인.
- 1단계: YOLOv8로 계기 LCD 영역, 계기번호 영역 바운딩박스 검출.
- 2단계: CRNN+CTC 또는 PARSeq로 해당 영역 숫자 인식.
- GitHub 참고 레포:
  - https://github.com/Wolfkissed6040/Electric-Meter-Reading-using-YOLO-architecture
  - https://github.com/MuhammadWaqar621/Smart-Meter-Reading
- 단점: 두 모델을 별도로 학습·관리해야 함. 파이프라인 통합 공수 필요.
- **결론**: 정확도를 최우선으로 할 때 2순위 또는 PaddleOCR와 병행.

#### TrOCR

- Microsoft 제공, HuggingFace에서 파인튜닝 용이.
- 문서 스캔 이미지에서 강점. 계기 특화는 파인튜닝 필요.
- 모델 크기(300M+)로 온디바이스 불가. 서버 배치처리 전용.
- **결론**: 서버 측 보조 검증 모델로 검토 가능, 주력은 아님.

---

## 4. AMR 오픈소스·논문·캐글 사례

### 주요 오픈소스

| 레포/자료 | 구조 | 데이터 규모 | 결과 |
|----------|------|-----------|------|
| Wolfkissed6040/Electric-Meter-Reading (GitHub) | YOLOv8 + 인식기 | 논문 기반 | 높은 정확도·효율 |
| ayseceyda/analog-meter-reading-openCV (GitHub) | OpenCV 기반 | 소규모 | 아날로그 포인터 전용 |
| MATLAB OCR ENGINE / Digital Meter Reading (GitHub) | CNN + PyTesseract | 소규모 | 개념 증명 수준 |
| Laroca et al. "CNNs for AMR" (PDF, UFPR) | Fast-YOLO + 3종 CNN | 공개 데이터셋 | AMR 분야 기준 논문 |
| Water Meters Dataset (Kaggle) | 다양 | 5,000장+ | 수도계기 OCR 라벨 포함 |

### 관련 Kaggle 데이터셋

- Water Meters Dataset (5,000장+, OCR 라벨 포함): https://www.kaggle.com/datasets/water-meters-ocr
  - 전기계기와 유사 구조. 전이학습 초기화에 활용 가능.
- Water Meters (1,244장 + 마스크): https://www.kaggle.com

### 핵심 논문

1. "Detecting and recognizing seven segment digits using a deep learning pipeline"
   - DBNet(검출) + PARSeq(인식) 비교, 7세그먼트 특화
   - https://www.itm-conferences.org / https://www.researchgate.net
2. "Convolutional Neural Networks for Automatic Meter Reading" (Laroca et al.)
   - AMR 2단계 파이프라인의 기준 논문
   - https://raysonlaroca.github.io/
3. "Text detection and recognition in raw image dataset of seven segment displays"
   - ScienceDirect, 에너지 계기 데이터셋 수집·인식 방법론
   - https://www.sciencedirect.com
4. PP-OCRv5 논문: "A Specialized 5M-Parameter Model Rivaling Billion-Parameter Models"
   - https://openaccess.thecvf.com/ (CVPR 2025)

---

## 5. 데이터 요구량과 증강 전략

### 500장으로 가능한가

- **가능하다. 단, 전이학습(Fine-tuning) 필수.**
- PaddleOCR PP-OCRv4 기반 파인튜닝 사례(스테이크캠 프로젝트): CER 89% → 10%, 정확매칭 27% → 70%로 개선.
  - 출처: https://timc.me (PP-OCRv5 파인튜닝 단계별 블로그)
- 계기번호(영숫자): 500장이면 충분 (영숫자 조합이 제한적, 전이학습 효과 큼).
- 검침값(7세그먼트 숫자): 500장은 부족할 수 있음. 합성 데이터 증강 필수.

### 합성 데이터 증강 전략

#### 7세그먼트 폰트 렌더링

- DSEG 폰트(https://www.keshikan.net/fonts.html) — 7세그먼트 전용 TTF 폰트.
- TextRecognitionDataGenerator(https://github.com/Belval/TextRecognitionDataGenerator)로 배경+노이즈+각도 변형 포함 합성 이미지 대량 생성.
- 생성 방법:
  ```
  1. DSEG 폰트 설치
  2. 0~9, 소수점 조합 무작위 생성 (계기 자릿수 맞춤: 7~8자리)
  3. 배경: 실제 계기판 촬영본 크롭 사용
  4. 변형: 밝기/대비/모션블러/원근변환/노이즈 랜덤 적용
  ```
- 합성:실제 = 3:1 ~ 5:1 비율 권장. 합성만 쓰면 도메인 갭 발생.

#### 실제 데이터 증강

```python
# 현장 이미지에 적용할 증강 조합
- 밝기 ±30%, 대비 ±20%
- 가우시안 블러 (σ=0.5~1.5)
- 회전 ±15도
- 원근 변환 (±10%)
- JPEG 압축 노이즈 (quality=50~90)
- 색온도 변환 (형광등/자연광 시뮬레이션)
```

### 목표 데이터량

| 단계 | 실제 이미지 | 합성 이미지 | 목표 |
|------|-----------|-----------|------|
| 최소 (프로토타입) | 500장 | 1,500장 | 계기번호 90%+, 검침값 80%+ |
| 권장 (운영) | 1,000장+ | 3,000장+ | 계기번호 95%+, 검침값 90%+ |
| 목표 (고도화) | 2,000장+ | 5,000장+ | 95%+ 전체 |

---

## 6. 권장 파이프라인

### 1순위: PaddleOCR 기반 2-ROI 분리 파이프라인

#### 핵심 설계 원칙

계기번호와 검침값은 **반드시 별도 처리**. 두 영역의 폰트·구조·위치가 다르고, 하나의 모델로 묶으면 정확도가 떨어진다.

#### 단계별 구조

```
[입력: 현장 사진]
       |
[1단계: 전처리]
  - 이미지 리사이즈 (1280px 이내)
  - CLAHE(적응형 히스토그램 평활화) → LCD 대비 강화
  - 노이즈 제거 (bilateral filter)
       |
[2단계: ROI 검출 — YOLOv8 또는 PaddleOCR DBNet]
  - ROI-A: 검침값 LCD 영역 (바운딩박스)
  - ROI-B: 계기번호 영역 (바코드 라벨 또는 각인 영역)
       |
    [분기]
  _____|_____
  |         |
[ROI-A 처리]  [ROI-B 처리]
검침값 인식    계기번호 인식
PaddleOCR    PaddleOCR
숫자 전용     영숫자 파인튜닝
파인튜닝      or Tesseract
  |              |
  [후처리·검증]
  - 검침값: 자릿수 범위 체크, 소수점 위치 검증, 이전 검침값 대비 이상치 탐지
  - 계기번호: 11자리 형식 체크, DB 존재 여부 대조
       |
[출력: {계기번호, 검침값, 신뢰도}]
```

#### 구현 로드맵

| 단계 | 작업 | 예상 기간 |
|------|------|----------|
| 1 | 라벨링: 500장 바운딩박스 어노테이션 (ROI-A, ROI-B) | 1~2주 |
| 2 | YOLOv8 ROI 검출 모델 학습 (500장) | 3~5일 |
| 3 | PaddleOCR 검침값 인식 파인튜닝 (합성+실제) | 1주 |
| 4 | PaddleOCR 계기번호 인식 파인튜닝 | 3~5일 |
| 5 | 후처리 규칙 구현 + DB 대조 연동 | 3일 |
| 6 | 평가 (정확도·오탐·미탐 분석) | 2~3일 |

#### 학습 환경

- 서버: Google Colab Pro (A100) 또는 로컬 GPU (RTX 3060+)
- YOLOv8: `pip install ultralytics`
- PaddleOCR: `pip install paddlepaddle paddleocr`

### 2순위: YOLO + 커스텀 CRNN 파이프라인

1순위보다 정확도 상한이 높으나 구현 공수가 크다. PaddleOCR 내부 인식 모델이 이미 CRNN 계열이므로, 실제 차이는 미미할 수 있다. 데이터가 2,000장+ 이상으로 늘었을 때 재검토.

---

## 7. 온디바이스 안드로이드 옵션

### 옵션 비교

| 방법 | 모델 크기 | 추론 속도 | 커스텀 학습 | 적합도 |
|------|----------|----------|-----------|------|
| **PaddleOCR + Paddle-Lite** | ~5MB (경량) | 빠름 (370 FPS+) | 가능 (ONNX 변환) | 높음 |
| **PaddleOCR + ONNX Runtime Android** | ~10MB | 빠름 | 가능 | 높음 |
| **Google ML Kit Text Recognition v2** | 온디바이스 내장 | 매우 빠름 | 불가 | 중 (계기 특화 어려움) |
| **TFLite (자체 CRNN)** | 2~5MB | 매우 빠름 | 가능 | 중상 (변환 공수) |
| **PyTorch Mobile (EasyOCR 기반)** | 30MB+ | 느림 | 가능 | 낮음 |

### 권장 온디바이스 경로

```
PaddleOCR 파인튜닝 완료
      ↓
ONNX 변환 (paddle2onnx)
      ↓
ONNX Runtime Android 배포
또는
Paddle-Lite 변환 (.nb 파일)
      ↓
안드로이드 앱 통합
```

- 공식 튜토리얼: https://github.com/PaddlePaddle/PaddleOCR/blob/main/deploy/lite/readme.md
- ONNX 사전변환 모델: https://huggingface.co/monkt/paddleocr-onnx

### ML Kit 한계

- 범용 OCR이므로 7세그먼트 LCD 특화 인식에 취약.
- 커스텀 모델 학습 불가. 정확도 개선 여지 없음.
- **계기번호 보조 인식**(바코드 스캔 병행) 용도로는 유용.

---

## 8. 상용·클라우드 비교 (간략)

| 서비스 | 학습 가능 | 비용 | 7세그먼트 성능 | 개인정보 |
|--------|----------|------|--------------|---------|
| Google Vision API | 불가 | 유료/장당 | 중 | 외부 전송 |
| Naver CLOVA OCR | 제한적 (템플릿) | 유료 구독 | 중상 | 외부 전송 |
| AWS Textract | 불가 | 유료/장당 | 중 | 외부 전송 |

**결론**: 계기 이미지는 개인정보(주소, 고객정보) 포함 가능성 있음. 외부 전송 방식은 법적 리스크. 자체 모델 필수.

---

## 9. 실행 체크리스트 (시작 전 준비)

### 데이터 준비

- [ ] 500장 이미지 정리 (파일명 → 계기번호·검침값 매핑 테이블 생성)
- [ ] 라벨링 도구 선택: LabelImg(무료), Roboflow(무료 플랜 있음)
- [ ] ROI 바운딩박스 2종 어노테이션: LCD 영역(ROI-A), 계기번호 영역(ROI-B)
- [ ] 검침값 텍스트 라벨: ROI-A 크롭 이미지 + 정답 문자열 쌍
- [ ] 합성 데이터 생성 스크립트 작성 (DSEG 폰트 + TextRecognitionDataGenerator)

### 환경 구성

```bash
# PaddleOCR
pip install paddlepaddle-gpu paddleocr paddle2onnx

# YOLOv8
pip install ultralytics

# 증강
pip install albumentations

# 합성 데이터
pip install trdg  # TextRecognitionDataGenerator
```

### 평가 지표

- **계기번호**: 11자리 완전 일치율 (Exact Match)
- **검침값**: 문자 단위 정확도(CER), 소수점 포함 완전 일치율
- **파이프라인 전체**: ROI 검출 실패율 + 인식 오류율 분리 측정

---

## 10. 참고 링크 모음

### 오픈소스·레포

- PaddleOCR 공식: https://github.com/PaddlePaddle/PaddleOCR
- PaddleOCR Lite 배포: https://github.com/PaddlePaddle/PaddleOCR/blob/main/deploy/lite/readme.md
- tesstrain (Tesseract 학습): https://github.com/tesseract-ocr/tesstrain
- TextRecognitionDataGenerator: https://github.com/Belval/TextRecognitionDataGenerator
- Electric Meter Reading YOLOv8: https://github.com/Wolfkissed6040/Electric-Meter-Reading-using-YOLO-architecture
- Smart Meter Reading: https://github.com/MuhammadWaqar621/Smart-Meter-Reading

### 논문·자료

- "Detecting and recognizing seven segment digits" (DBNet+PARSeq): https://www.researchgate.net
- "CNNs for AMR" (Laroca et al.): https://raysonlaroca.github.io/
- PP-OCRv5 논문: https://openaccess.thecvf.com/
- ScienceDirect 7세그먼트 데이터셋: https://www.sciencedirect.com

### 튜토리얼

- PaddleOCR 파인튜닝 (단계별): https://timc.me
- PaddleOCR Fine-Tuning For Dummies: https://anushsom.medium.com
- Tesseract LSTM 파인튜닝 YouTube: https://www.youtube.com (Training/Fine Tuning Tesseract OCR LSTM)

### 데이터셋

- Water Meters Dataset (Kaggle, 5000장+): https://www.kaggle.com
- DSEG 7세그먼트 폰트: https://www.keshikan.net/fonts.html
- HuggingFace PaddleOCR ONNX: https://huggingface.co/monkt/paddleocr-onnx

---

## 요약

**1순위 권장**: PaddleOCR PP-OCRv4/v5 파인튜닝 + YOLOv8 ROI 검출 2-ROI 분리 파이프라인.

**근거**:
- 검침값(7세그먼트)과 계기번호(영숫자)를 분리 처리해야 정확도 최대화.
- PaddleOCR은 경량 서버~온디바이스 안드로이드까지 동일 모델 체인으로 커버.
- PP-OCRv5(2025)는 5M 파라미터로 범용 VLM(Gemini 2.5 Pro 등)을 능가하는 정확도.
- 500장 + 합성 데이터 1,500장으로 프로토타입 가능. 1,000장+ 수집 시 운영 수준 도달.

**2순위 대안**: 데이터 2,000장+ 확보 후 YOLO + 커스텀 CRNN/CTC 파이프라인으로 전환 검토.

**온디바이스**: PaddleOCR → ONNX 변환 → ONNX Runtime Android 경로가 가장 현실적.
