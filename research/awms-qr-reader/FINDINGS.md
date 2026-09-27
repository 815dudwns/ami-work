# awms 스캐너(바코드/QR/OCR) 완전 분석 — 이식용

목적: awms.kdn.com 모바일 스캔 리더를 **종로앱(jongno-combined) + 아미워크(ami-work) 계기추가**에 이식.
핵심(영준님): **"스캔 raw → 무엇을 출력값으로 뽑느냐(파싱)"가 자산. UI는 부차.**

수집: `worker/grab_scanner.js` (2026-05-31 awms 로그인 후 자동 수집) → `raw/` 60여 파일.

---

## 결론: 바코드/QR은 이식 가능, OCR은 서버 의존(대체 필요)

| 대상 | 방식 | 구현 | 이식 |
|------|------|------|------|
| 모뎀/계기 | **바코드·QR** | **ZXing**(오픈소스) + `parseValue`(순수함수) | **그대로 가능** ✅ |
| 계기 | **OCR(사진)** | Warebiz **서버 API** `/ami/mob/emr/api-proxy-warebiz` | 그대로 불가 ❌ (대체 OCR 필요) |

---

## 1. 바코드/QR 리더 — `barcodeReaderPopupTemplate.js` (Vue `<barcode-reader>`)

- **라이브러리: ZXing** (`raw/...__vendor__zxing__umd__index.min.js`, 332KB). 오픈소스 `@zxing/library`.
- 흐름:
  ```
  openBarcodeScanner() → codeReader.decodeFromVideoDevice(backCam, video, cb)
    → result.text (raw)
    → [바코드면 * 제거: text.replace(/\*/g,'')  // L643]
    → parseValue(raw)  → { value, value2 }
    → setReadValueThenClose({value, value2})
        → this.readValue = value;  this.prdcYm = value2(제조년월)
        → @callback emit  → 부모가 받아서 vBarcdQr 등에 사용
  ```
- 사진선택 디코딩도 지원: `decodeFromImageElement` (앨범 사진에서 QR 읽기, L696/730).
- 후방카메라 선택, 줌(쿠키 저장), 권한요청 등 부가기능 다수.

### parseValue (핵심) — `awms-parseValue.js` 로 추출·검증 완료
스캔 raw 길이/포맷별로 출력값 결정 (원본 L1040-1516):

- **숫자 바코드**
  - 13자 `*\d{11}*` → 별표 제거 → 11자리
  - 11자 `\d{11}` → 그대로
  - 15자 `*[\d-]{11,}*` → `*`,`-` 제거
- **텍스트 QR (제조사별 포맷, 멀티라인 `\r`/`\n` 분리 후 키:값 추출)**
  - `자재 ID :` → 그 값  *(← fuckmigobox의 `G1S3...` 케이스가 여기)*
  - `계기ID`/`계기 ID :` → 그 값 + `제조년월` → value2 = "20"+YYMM
  - `전화번호`, `제조번호(기기명)`, `PID/YYMM/MID`, `BID.NO/PID/BID/Q'TY` 등
  - `BID/PID` old QR은 `lpad(v,"0",6)` = 끝 6자리 0패딩, new QR(B/P 접두)은 원본
- 반환: `{ value: 출력값, value2: 제조년월(있을때) }`

검증:
```
'01249852054'                          → {value:'01249852054'}
'*01249852054*'                        → {value:'01249852054'}
'자재 ID : G1S349849692' (멀티라인 QR) → {value:'G1S349849692'}   // 변환 전 raw 그대로
```

> 참고: awms는 `G1S3...`를 **그대로** `vBarcdQr`로 보냄. `012`로 바꾸는 건 우리 쪽 추가 요구(별도 변환 건). parseValue 뒤에 후처리로 붙이면 됨.

## 2. OCR 리더 — `ocrReaderWarebizPopupTemplate.js` (Vue `<ocr-reader-warebiz>`)

- 계기 사진 촬영/크롭 → **서버로 전송** → 서버(Warebiz OCR 엔진)가 텍스트 반환:
  - `axios.post("/ami/mob/emr/api-proxy-warebiz", {이미지...})` → `response.kdata` = 인식 텍스트
  - `recevieCroppedImage`, `api-warebiz-ocr-history` 등 부속 API
  - 결과에서 "에러발생"/"error"/"Error" 제거
- **이식 불가 지점**: OCR 엔진이 awms 서버 뒤(Warebiz). 우리가 그대로 호출 못 함.
- **대체안**: (a) 클라이언트 OCR(Tesseract.js 등) (b) 자체 OCR 서버 (c) Google/Naver OCR API.
  어느 쪽이든 OCR이 뱉은 텍스트는 **위 parseValue 텍스트 분기로 그대로 파싱 가능** (계기ID/제조번호 추출 재사용).

---

## 산출물 (research/awms-qr-reader/)
- `raw/` — awms 원본 JS/HTML 전부 (barcodeReader·ocrReaderWarebiz·zxing·MOBMTL1000.html 등)
- `awms-parseValue.js` — parseValue 순수함수 추출본 (node 검증 OK, ESM export)
- `FINDINGS.md` — 이 문서

## 이식 플랜 (다음)
1. **종로앱·아미워크 계기추가에 ZXing + parseValue 도입**
   - `@zxing/library` 또는 CDN(`zxing/umd`) → `decodeFromVideoDevice`(카메라) + `decodeFromImageElement`(앨범)
   - `awms-parseValue.js` 그대로 import → 스캔 raw 넣고 `value` 사용
   - 모뎀이면 vGubun=M 흐름, 계기면 계기번호 흐름
2. OCR은 분리 — 우선 QR/바코드만 이식, OCR은 대체 엔진 정해지면 추가 (텍스트 파싱은 parseValue 재사용)
3. 모뎀 `G1S3→012` 변환은 parseValue 후처리로 (영준님 별도 요구)
