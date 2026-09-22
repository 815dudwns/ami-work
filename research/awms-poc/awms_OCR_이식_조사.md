# awms 인앱 OCR — jongno-combined 이식 사전 조사

> 작성: 2026-06-06
> 목적: awms의 계기 사진 OCR 기능을 jongno-combined 계기교체 입력 모달(`replacement-modal.js`)에 이식하기 위한 기술 규명 및 대안 분석.
> 참조 원본: `research/awms-qr-reader/raw/awms.kdn.com__assets__js__cf_component__popup__commons__ocrReaderWarebizPopupTemplate.js`

---

## 핵심 결론 (한 줄)

awms OCR은 **Warebiz 전용 서버 API** 의존. 우리가 그대로 호출 불가. 대체 경로 중 가장 현실적인 것은 **Google Cloud Vision API**(월 1,000건 무료, 즉시 도입 가능).

---

## 1. awms OCR API 완전 규명

### 1-1. 전체 흐름

```
[폰 카메라] → [canvas 캡처 (videoWidth x videoHeight, PNG)] → 크롭(높이 20% 중앙띠)
 → axios.post("/ami/mob/emr/api-proxy-warebiz", {image_data: "data:image/png;base64,..."})
 → 응답 JSON { kdata: "인식된 텍스트", time: "처리시간(초)", wasStartTimeStamp, wasEndTimeStamp }
 → kdata에서 parseMeterId()로 11자리 계기번호 추출 → 입력칸 자동완성
```

### 1-2. 엔드포인트 상세

| 항목 | 내용 |
|------|------|
| 메인 OCR 엔드포인트 | `POST https://awms.kdn.com/ami/mob/emr/api-proxy-warebiz` |
| HTTP 메서드 | POST |
| Content-Type | `application/json` |
| 인증 | awms 로그인 세션 쿠키 (OTP 2단계 인증 세션, 약 4시간 만료) |
| 요청 페이로드 | JSON 객체 |
| 응답 JSON 키 | `kdata`(인식 텍스트), `time`(OCR 처리 초), `wasStartTimeStamp`, `wasEndTimeStamp` |

**요청 페이로드 예시:**
```json
{
  "image_data": "data:image/png;base64,iVBORw0KGgo...(전체 PNG base64)",
  "tryHistoryItem": {
    "captureTimeStamp": 1749180000000,
    "sendTimeStamp": 0,
    "receiveTimeStamp": 0,
    "warebizKdata": "",
    "warebizTime": "",
    "wasStartTimeStamp": 0,
    "wasEndTimeStamp": 0
  }
}
```

**응답 예시 (추정 — HAR에 실제 OCR 호출 없음, 코드 분석 기반):**
```json
{
  "kdata": "01249852054",
  "time": "0.8",
  "wasStartTimeStamp": 1749180001200,
  "wasEndTimeStamp": 1749180002000
}
```

> 주의: HAR 파일(awms.har/awms2.har)에는 실제 OCR POST 요청이 포함되어 있지 않음.
> HAR 캡처 당시 OCR 기능을 사용하지 않은 것으로 보임.
> 위 페이로드/응답 구조는 JS 소스코드 분석으로 도출한 것. 실 응답 JSON은 확인이 필요하다.

### 1-3. 부속 API 2개

| 엔드포인트 | 용도 |
|-----------|------|
| `POST /ami/mob/emr/recevieCroppedImage` | 크롭 이미지 + OCR raw 결과 서버 저장 (이력/디버깅용) |
| `POST /ami/mob/emr/api-warebiz-ocr-history` | OCR 동작 시간 이력 기록 (세션 설정 `OCR_HISTORY_RECODE_YN == "Y"` 시에만 호출) |

이 두 API는 OCR 기능 자체에는 불필요. 이력 수집 목적이므로 이식 시 생략 가능.

### 1-4. 클라이언트 OCR 파싱 로직 (`parseMeterId`) — 이식 가능

OCR 서버가 반환한 `kdata` 텍스트에서 계기번호 11자리를 추출하는 함수. 순수함수이므로 그대로 재사용 가능.

```javascript
// awms 원본 parseMeterId 요약
function parseMeterId(inputText) {
  if (inputText.indexOf("error") > -1) return "";
  
  const typeNumbers = ["17","18","25","26","27","37","38","45","46","47",
                       "19","51","52","53","54","55","56","57"];
  
  // 11자리이고, 3~4번째 자리가 알려진 계기타입코드면 계기번호로 인정
  if (inputText && inputText.length == 11) {
    const typeStr = inputText.substring(2, 4);
    if (typeNumbers.includes(typeStr)) return inputText;
  }
  return "";
}
```

`kdata`가 여러 줄 텍스트를 반환할 경우, 각 줄을 순회하며 위 함수 적용해 11자리 추출 가능 (awms 코드 일부에서 줄 분리 후 반복 패턴 확인).

### 1-5. 이미지 크롭 방식

전체 프레임을 캡처한 후 **높이의 중앙 20% 띠**만 잘라서 서버에 전송.

```javascript
// 크롭: 전체 캔버스 너비, 높이의 20% 중앙
const rectWidth  = canvas.width;
const rectHeight = canvas.height * 0.2;
const rectX = (canvas.width - rectWidth) / 2;
const rectY = (canvas.height - rectHeight) / 2;
```

계기 명판의 계기번호가 계기 전면 중앙에 있어 이 영역만 보내는 방식.

---

## 2. 이식 불가 이유 — Warebiz 서버 의존

`/ami/mob/emr/api-proxy-warebiz`는 awms 서버가 내부적으로 Warebiz OCR 엔진을 프록시 호출하는 구조.

- awms 세션 쿠키 없이는 403 또는 인증 오류
- 직접 호출 시 CORS 차단 (awms.kdn.com 도메인 외부 요청)
- awms 세션을 빌리는 방법(CDP/awms-bridge)을 써도 한전KDN 입장에서 "시스템 우회"로 인식될 가능성 높음 → 한전 적대 리스크 (메모리 `awms_kepco_risk.md` 참조)

**결론: awms OCR API 직접 재사용은 기술적·정책적으로 모두 불가.**

---

## 3. 기존 추출물 현황 (`research/awms-qr-reader/`)

| 파일 | 내용 | 이식 가능 여부 |
|------|------|--------------|
| `raw/ocrReaderWarebizPopupTemplate.js` | awms OCR UI 원본 전체 (26KB) | UI 참고용. OCR 서버 호출 부분은 재사용 불가 |
| `awms-parseValue.js` | QR/바코드 raw 파싱 순수함수 | 이식 가능 (node 검증 완료) |
| `FINDINGS.md` | 바코드/OCR 분석 결론 요약 | 참조 문서 |

`parseMeterId`(11자리 계기번호 추출)는 `parseValue`와 별개로 awms OCR 코드에 있음. 이것만 따로 추출해 재사용 가능.

---

## 4. 대체 OCR 경로 비교

### jongno-combined 현재 스캐너 구조

`replacement-modal.js`(`rpl-new-meter-id` 입력 필드)에는 현재 QR/OCR 기능 없음. `qr-scanner.js`는 jongno-combined 프로젝트 디렉토리에 있지만 replacement-modal에는 연결되어 있지 않음. OCR은 순수 신규 추가.

### 4-1. Google Cloud Vision API (Text Detection)

| 항목 | 내용 |
|------|------|
| 방식 | 클라이언트(브라우저)에서 base64 이미지 → Google API 서버 → 텍스트 반환 |
| 요금 | **월 1,000건 무료**, 이후 $1.50/1,000건 (최대 500만 건까지) |
| 인증 | API Key (브라우저 호출 가능, HTTP Referer 제한 설정 필요) |
| 정확도 | 숫자 각인 OCR에 매우 강함. 계기번호(11자리 숫자) 인식 적합 |
| 응답 형태 | `responses[0].textAnnotations[0].description` = 전체 인식 텍스트 |
| CORS | 허용 (Google API는 브라우저 직접 호출 지원) |
| 작업량 | API Key 발급 + fetch 호출 30줄 + parseMeterId 연결 |
| 리스크 | API Key 노출 위험 — HTTP Referer 제한 필수. 월 1,000건 초과 시 과금 시작 |

**계기교체 작업량 추정**: 종로 동행시공 기준 하루 수십 건 수준이면 월 1,000건 무료 한도 내 충분히 커버 가능. 확인이 필요하다.

**요청 예시:**
```javascript
const apiKey = 'YOUR_API_KEY';
const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
const body = {
  requests: [{
    image: { content: base64ImageData },  // data:image/... 접두 제거 후
    features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
  }]
};
const resp = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
const data = await resp.json();
const text = data.responses[0]?.textAnnotations?.[0]?.description || '';
const meterId = parseMeterId(text.replace(/\s/g, '').trim());
```

### 4-2. Naver CLOVA OCR (General)

| 항목 | 내용 |
|------|------|
| 방식 | 서버(Node.js/Python 프록시) 또는 클라이언트에서 Naver API 호출 |
| 요금 | 종량제. 정확한 무료 한도는 Naver Cloud 포털에서 확인 필요 (확인이 필요하다) |
| 인증 | Secret Key + APIGW Invoke URL (노출 위험 — 서버 프록시 권장) |
| 정확도 | 한국어 최적화. 숫자 인식은 Google Vision과 유사하거나 약간 낮을 가능성 있음 |
| CORS | 브라우저 직접 호출 불가 (CORS 미허용) → 서버 프록시 필수 |
| 작업량 | Firebase Functions 또는 별도 프록시 서버 구축 필요 → 작업량 큼 |
| 리스크 | 서버 프록시 추가 유지 관리 부담 |

**평가**: Google Vision 대비 작업량이 크고 즉시 도입 어려움. 한국어 강점은 계기번호(순수 숫자)에는 해당 없음. 비추.

### 4-3. Tesseract.js (클라이언트사이드 로컬 OCR)

| 항목 | 내용 |
|------|------|
| 방식 | 브라우저 내 WebAssembly OCR. 서버 호출 없음 |
| 요금 | 무료 (오픈소스) |
| 정확도 | 숫자 인식 정확도 낮음. 계기 각인(작은 숫자, 반사) 환경에서 오인식 빈번 |
| 초기화 시간 | 첫 인식 시 모델 로딩 3~8초 (모바일 환경에서 더 느림) |
| 용량 | 한국어 모델 다운로드 수 MB |
| 작업량 | 라이브러리 로드 + 초기화 코드. 정확도 개선 전처리(이진화/대비) 추가 작업 필요 |
| 리스크 | 계기 각인 OCR에 실용 정확도 미달 가능성 높음. 현장 사용자 불만 예상 |

**평가**: 무료·서버 불필요이지만 현장 계기번호 인식 정확도가 Google Vision/Warebiz에 크게 못 미침. 권장하지 않음.

### 4-4. 자체 OCR 모델 (research/ocr_poc, PaddleOCR 등)

`research/ocr_poc`에 있는 배치 검증용 OCR은 계기판 사진 대량 처리용(서버 Python 실행)으로 설계된 것. 브라우저 이식을 위해서는 ONNX 경량화 + WebAssembly 변환이 필요하며 작업량이 매우 큼. 현 시점에서는 고려 대상이 아님.

---

## 5. jongno-combined 이식 권고안

### 권고 1순위: Google Cloud Vision API 직접 연동

**이유**: 작업량 최소(30~50줄 추가), 무료 한도 내 충분, CORS 해결됨, 정확도 검증됨.

**작업 범위:**
1. Google Cloud 프로젝트에서 Vision API 활성화 + API Key 발급 (HTTP Referer 제한 설정)
2. `replacement-modal.js`의 `rpl-new-meter-id` 입력 필드 옆에 "OCR 인식" 버튼 추가
3. 버튼 클릭 시 카메라 스트림 열기 → 캡처 → base64 → Vision API POST → `parseMeterId`로 11자리 추출 → `rpl-new-meter-id` 자동 입력
4. awms 방식(높이 20% 중앙 크롭) 동일하게 적용

**UI 흐름 (awms와 동일 패턴):**
```
[OCR 인식] 버튼 클릭
 → 후방 카메라 스트림 열기 (getUserMedia facingMode:environment)
 → 카메라 미리보기 + "인식시작" 버튼 표시
 → 캡처 → 중앙 20% 크롭 → base64 PNG
 → Google Vision API POST
 → kdata 파싱 → parseMeterId → 11자리 추출
 → 성공 시 모달 닫고 rpl-new-meter-id 채우기
 → 실패 시 "다시 찍기" 안내
```

**주의사항:**
- API Key는 `config.js`에 별도 상수로 관리, HTTP Referer를 `*.github.io/jongno-combined/*`로 제한
- 철거 검침값(지침) OCR은 별도 구현 (awms도 이 기능은 다른 컴포넌트). 계기번호 OCR 먼저 구현 후 필요 시 확장.

### 권고 2순위: 신설 계기 QR/바코드 우선, OCR 보조

계기에 QR코드나 바코드가 있으면 스캔이 OCR보다 빠르고 정확함. `qr-scanner.js`(ZXing + BarcodeDetector)가 이미 있으므로, QR/바코드 스캔을 1순위 입력 수단으로, OCR을 "QR이 없거나 읽기 어려울 때" 보조 수단으로 구성하는 것이 현실적.

---

## 6. 트레이드오프 요약

| 방식 | 정확도 | 작업량 | 비용 | 리스크 |
|------|--------|--------|------|--------|
| awms 서버 직접 재사용 | 최고 | 없음 | 없음 | 한전 적대 리스크, 기술적 불가 |
| Google Cloud Vision | 높음 | 소 (30~50줄) | 월 1,000건 무료 | API Key 노출 (Referer 제한으로 완화) |
| Naver CLOVA OCR | 높음 | 중 (프록시 서버) | 확인 필요 | 서버 유지 관리 |
| Tesseract.js | 낮음 | 중 (전처리 필요) | 무료 | 현장 정확도 미달 가능 |
| 자체 OCR (PaddleOCR) | 높음 (학습 후) | 대 | 서버 운영비 | 개발/유지 비용 큼 |

---

## 7. 다음 단계 (결정 후 진행)

1. 영준님이 Google Vision API 방식 동의 시:
   - Google Cloud 프로젝트 API Key 발급 (영준님 계정)
   - replacement-modal.js에 OCR 버튼 + Vision API 연동 구현
   - 현장 테스트 (실제 계기 사진으로 인식률 확인)

2. 철거 검침값(지침) OCR 필요 여부도 함께 결정 권장:
   - 지침칸(`whme_day`/`whme_mngt` 등)은 숫자 여러 줄 → OCR 후 parseValue 분기로 파싱 가능
   - 단, awms는 지침 OCR에 별도 컴포넌트 사용하지 않음 (수동 입력). 우선순위 낮음.
