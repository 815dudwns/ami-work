# 네이버 밴드 자동 업로드 가능성 조사

> 조사일: 2026-04-18
> 조사자: researcher-deep

---

## 결론 요약

**댓글 이미지 자동 업로드: 공식 API로는 불가 (텍스트 댓글만 가능)**

| 경로 | 가능 여부 | 비고 |
|------|-----------|------|
| 공식 Open API - 댓글에 이미지 첨부 | 불가 | body(텍스트)만 지원 |
| 공식 Open API - 텍스트 댓글 작성 | 가능 | `POST /v2/band/post/comment/create` |
| 공식 Open API - 게시글 작성 (이미지 없이) | 가능 | `POST /v2.2/band/post/create` |
| 헤드리스 브라우저 자동화 | 기술적 가능하나 약관 위반 위험 | |
| 반자동 (앱 공유) | 가능 | 사람 개입 1회 필요 |

---

## 1. Naver BAND Open API 2.0 현황 (2026-04 기준)

### 공식 문서
- 개발자 센터: https://developers.band.us/develop/guide/api
- API 엔드포인트 베이스: `https://openapi.band.us`
- OAuth 인증: `https://auth.band.us/oauth2/`

### 지원 엔드포인트 전체 목록

읽기 (GET):
- `/v2/profile` — 사용자 정보
- `/v2.1/bands` — 밴드 목록
- `/v2/band/posts` — 글 목록
- `/v2.1/band/post` — 글 상세
- `/v2/band/post/comments` — 댓글 목록
- `/v2/band/albums` — 앨범 목록
- `/v2/band/album/photos` — 사진 목록

쓰기 (POST):
- `/v2.2/band/post/create` — **글 작성** (content, do_push 파라미터, 이미지 첨부 파라미터 없음)
- `/v2/band/post/remove` — 글 삭제
- `/v2/band/post/comment/create` — **댓글 작성** (body 파라미터만, 이미지 첨부 파라미터 없음)
- `/v2/band/post/comment/remove` — 댓글 삭제

### 댓글 작성 API 명세

```
[POST] https://openapi.band.us/v2/band/post/comment/create

파라미터:
- access_token (필수)
- band_key (필수)
- post_key (필수)
- body (필수) — 텍스트만

응답:
{ "result_code": 1, "result_data": { "message": "success" } }
```

**이미지 첨부 파라미터 없음 — 공식 확인.**

### 에러 코드에서 이미지 관련 코드 존재

에러 처리 문서(https://developers.band.us/develop/guide/api/handle_errors)에서:
- `3002` Image file size has been exceeded
- `3003` Number of image files has been exceeded
- `60800` Image URL is invalid or the format is not supported

이 에러들은 내부적으로 이미지 처리가 존재함을 시사하지만, **공개 API 문서에는 이미지 업로드 파라미터가 노출되어 있지 않다.** 글 작성(`/v2.2/band/post/create`)이나 댓글 작성 API 모두 이미지 관련 파라미터를 문서화하지 않는다.

---

## 2. OAuth 인증 흐름

**웹앱에서 사용 가능하나 제약이 있다.**

표준 OAuth 2.0 Authorization Code 방식:
1. `https://auth.band.us/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...` 로 사용자 리다이렉트
2. 사용자가 밴드 로그인 + 권한 동의
3. redirect_uri로 authorization_code 전달
4. 서버에서 `https://auth.band.us/oauth2/token`으로 access_token 교환

토큰 유효기간: `expires_in: 315359999` (약 10년, 사실상 무제한에 가까움)

**서버용 토큰 발급 방법**: 개발자 센터 '내 서비스' 화면에서 '밴드 계정 연동' 클릭으로 특정 계정의 토큰을 미리 발급받아 환경변수에 저장 가능. 이 경우 OAuth 리다이렉트 없이 서버에서 직접 API 호출 가능.

**결론**: 자동화 서버에서 사용하려면 관리자 계정으로 한 번만 토큰 발급 후 저장하는 방식으로 충분히 가능하다.

---

## 3. API 중단/정책 변경 이력

공개된 중단 이력은 확인되지 않는다. 다만:
- 공식 문서는 현재도 정상 서비스 중 (2026-04 기준 접근 가능)
- 개발자 센터 앱 등록, OAuth, API 호출 모두 정상 작동 상태
- GitHub 공식 예제 레포(voyageth/bandopenapi)가 최근까지 유지 관리됨

"밴드 API가 막혔다"는 소문의 진위는 명확히 확인할 수 없으나, 현재 공식 문서와 엔드포인트는 활성 상태이다.

단, **이미지 첨부 쓰기 기능은 처음부터 공개 API에 없었던 것으로 보인다.** 읽기 전용 앨범/사진 API만 있고, 사진 업로드 엔드포인트는 공개 문서에 없다.

---

## 4. 대안 분석

### 대안 A: 헤드리스 브라우저 (Puppeteer/Playwright) — 권장하지 않음

기술적 가능성: 밴드 웹(band.us)에 로그인 후 댓글 입력창에 이미지 파일 업로드하는 흐름을 자동화할 수 있다.

**약관 위반 위험**:
- 밴드 이용약관 및 네이버 계정 약관은 자동화 도구를 통한 서비스 접근을 금지한다 (일반적인 네이버 서비스 정책).
- 계정 정지 위험 있음.
- 밴드 측 UI 변경 시 즉시 중단.
- 현장 작업용 서비스에 사용하기에는 안정성이 너무 낮다.

**결론: 프로덕션 용도로 사용하지 않는 것을 권장한다.**

### 대안 B: 반자동 — 이미지 생성 후 공유 (권장)

흐름:
1. 웹앱 서버가 사진 + 표 오버레이 합성 이미지를 생성 (현재 계획대로)
2. 작업자가 웹앱에서 "밴드 공유" 버튼 탭 1회
3. iOS Share Sheet / Android Intent → 밴드 앱 선택 → 이미지가 댓글 작성창으로 전달

**구현 방법**: Web Share API + Files 지원
```javascript
const file = new File([blob], 'report.jpg', { type: 'image/jpeg' });
if (navigator.canShare && navigator.canShare({ files: [file] })) {
  await navigator.share({ files: [file], title: '작업 현황' });
}
```

**장점**:
- 약관 위반 없음
- 밴드 앱 자체 UI를 통해 업로드 → 안정적
- 구현 난이도 낮음
- 어느 밴드, 어느 게시글이든 작업자가 직접 선택 가능

**단점**:
- 완전 자동화 아님 — 사람이 탭 1회 필요
- 모바일 환경만 지원 (PC 웹에서는 Web Share Files 미지원)
- Android Chrome, iOS Safari 최신 버전에서만 동작

### 대안 C: 텍스트 댓글 자동화 + 이미지 링크 삽입

공식 API의 댓글 작성은 텍스트만 가능하다. 단, **이미지를 외부 URL에 올려두고 링크를 댓글 본문에 넣는 방식**은 가능하다.

흐름:
1. 합성 이미지를 Firebase Storage 또는 S3에 업로드
2. 공개 URL 획득
3. 댓글 body에 URL 텍스트 삽입

한계: 밴드 댓글에서 URL이 클릭 가능한 링크나 미리보기 이미지로 렌더링되는지 확인이 필요하다. 단순 텍스트로만 보일 수 있다.

### 대안 D: 최악 시나리오 — 이미지 ZIP 다운로드 후 수동 업로드

현재 시스템(사람이 직접 업로드)의 불편함을 줄이는 용도:
- 웹앱에서 오전/오후 일괄 이미지를 ZIP으로 한 번에 다운로드
- 작업자가 밴드에 한꺼번에 업로드

---

## 5. 권장 구현 경로

### 1순위: 반자동 (대안 B) — Web Share API

AMI 작업지도 웹앱이 모바일 환경 중심이고, 작업자가 이미 웹앱을 쓰고 있으므로 "이미지 생성 후 공유 버튼 1탭" 방식이 현실적으로 가장 빠르고 안정적이다.

구현 범위:
- 서버: 사진 + 표 합성 이미지 생성 (이미 계획된 기능)
- 프론트엔드: "밴드에 공유" 버튼 → Web Share API 호출
- 추가 인프라 없음

### 2순위: 텍스트 댓글 + 이미지 URL (대안 C)

완전 자동화가 필요한 경우. 이미지를 Firebase Storage에 올리고 공개 URL을 댓글로 전송. 밴드에서 URL 미리보기 렌더링 여부는 실제 테스트로 확인이 필요하다.

---

## 출처

- Naver BAND Developers 공식 문서: https://developers.band.us/develop/guide/api
- 댓글 작성 API: https://developers.band.us/develop/guide/api/write_comment
- 글 작성 API: https://developers.band.us/develop/guide/api/write_post
- OAuth 인증: https://developers.band.us/develop/guide/api/get_authorization_code_from_user
- 에러 코드 (이미지 관련): https://developers.band.us/develop/guide/api/handle_errors
- Python 공식 예제: https://github.com/voyageth/bandopenapi/blob/main/python/bandopenapi/client.py
- Web Share API (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API
