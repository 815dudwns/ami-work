# 네이버 밴드 Open API — photo_key 2단계 업로드 플로우 검증

> 조사일: 2026-04-18
> 목적: "이미지 먼저 업로드 → photo_key 반환 → 글쓰기에 photo_key 포함" 2단계 플로우의 진위 판단
> 이전 리서치와의 차이: 이번엔 `image_data` 대신 `photo_key` 키워드로 집중 검색

---

## 결론: FALSE (UNCLEAR 아님)

**2단계 업로드 플로우는 공개 밴드 Open API에 존재하지 않는다.**

- `photo_key`라는 필드는 실제로 공식 문서에 존재하지만, 이미지 **업로드 결과**가 아닌 **이미지 조회 응답(GET)** 필드다.
- 이미지를 업로드하는 공개 엔드포인트 자체가 없다.
- 지식iN 답변은 실제 구현 경험이 없는 AI 생성 텍스트로 판단된다.

---

## 1. 공식 문서 전체 API 메뉴 목록 확인

출처: https://developers.band.us/develop/guide/api (HTML 직접 수신, 2026-04-18)

공식 문서에 존재하는 API 전체 목록:

| API 이름 | URL |
|----------|-----|
| Login - Get OAuth Token | /develop/guide/api/get_authorization_code_from_user |
| Get User Profile | /develop/guide/api/get_user_information |
| Get Bands | /develop/guide/api/get_bands |
| Get Posts | /develop/guide/api/get_posts |
| Get Specific Post | /develop/guide/api/get_post |
| **Write Post** | /develop/guide/api/write_post |
| Delete Post | /develop/guide/api/remove_post |
| Get Comments | /develop/guide/api/get_comments |
| **Write Comment** | /develop/guide/api/write_comment |
| Delete Comment | /develop/guide/api/remove_comment |
| Check Write/Delete Permissions | /develop/guide/api/get_post_permission |
| Get Albums | /develop/guide/api/get_albums |
| **Get Photos** | /develop/guide/api/get_photos |
| Handle Errors | /develop/guide/api/handle_errors |

**총 14개 엔드포인트. 이미지 업로드(Upload Photo, Create Photo 등) 엔드포인트 없음. 확정.**

---

## 2. photo_key의 실제 위치 — 조회 응답 필드

`photo_key`는 실제로 공식 문서에 존재한다. 단, **이미지 업로드 엔드포인트의 반환값이 아니라**, **Get Photos API(사진 목록 조회)**의 응답 필드다.

출처: https://developers.band.us/develop/guide/api/get_photos (HTML 직접 수신, 2026-04-18)

```
[GET] https://openapi.band.us/v2/band/album/photos

응답 items[i]:
  photo_key         string   Photo ID
  url               string   URL of an image
  width             int      Width of an image
  height            int      Height of an image
  photo_album_key   string   Album ID
  created_at        long     Created date and time
```

**photo_key는 이미 밴드에 올라간 사진을 식별하는 ID다. 이미지를 업로드하고 받는 키가 아니다.**

---

## 3. Write Post / Write Comment 파라미터 최종 확인 (HTML 원문)

출처: https://developers.band.us/develop/guide/api/write_post (직접 접속)
출처: https://developers.band.us/develop/guide/api/write_comment (직접 접속)

### Write Post [POST] /v2.2/band/post/create

| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| access_token | string | Y | Access token of the user |
| band_key | string | Y | Band ID |
| content | string | Y | Body content |
| do_push | boolean | N | Push notification |

**photo_key, image, upload, file, multipart 파라미터 없음. 확정.**

### Write Comment [POST] /v2/band/post/comment/create

| Name | Type | Mandatory | Description |
|------|------|-----------|-------------|
| access_token | string | Y | Access token of the user |
| band_key | string | Y | Band ID |
| post_key | string | Y | Post ID |
| body | string | Y | Comment content |

**photo_key, image 파라미터 없음. 확정.**

---

## 4. 숨겨진 엔드포인트 탐색 결과

아래 경로에 대해 HTTP 상태 코드 확인 시도:
- `POST /v2/band/photo/upload`
- `POST /v2/band/photo/create`
- `POST /v2/band/file/upload`
- `/develop/guide/api/create_photo`
- `/develop/guide/api/upload_photo`
- `/develop/guide/api/photo_upload`
- `/develop/guide/api/write_photo`

curl 환경 제약으로 HTTP 상태 코드 확인 실패. 단, 공식 문서 사이드바에 위 경로 중 어느 것도 메뉴로 포함되어 있지 않다.

---

## 5. 지식iN 답변 분석 — AI 생성 텍스트로 판단

**출처: https://kin.naver.com/qna/detail.naver?dirId=113&docId=484104597**

질문 날짜: 2025.04.14, 답변 날짜: 2025.04.19

답변 내용 요약:
> "이미지를 먼저 네이버 밴드에 미리 올리기 → photo_key 반환 → 글쓰기 시 photo_key 포함"

**이 답변을 신뢰할 수 없는 이유 5가지:**

1. **코드 예제 없음**: 실제 구현 경험이 있다면 `requests.post()` 코드나 실제 엔드포인트 URL이 포함되어야 한다. 답변 전체에 API URL, 코드 블록이 단 하나도 없다.

2. **엔드포인트 URL 없음**: "이미지를 먼저 올린다"면 어느 URL로 올리는지 명시해야 하나 없다.

3. **AI 생성 텍스트 특징 집중**: "쉽게 설명하면", "비유로 설명하면", "✅ 꼭 기억해야 할 핵심", "마무리 팁", "채택해주시면 다른 분께도 도움됩니다!" 구조가 AI 챗봇 답변 패턴과 일치한다.

4. **개념적으로 옳지만 구현이 없음**: `photo_key`라는 개념 자체는 Get Photos API 응답에 실제 존재한다. AI가 이 필드를 학습해 "업로드하면 받는 키"로 잘못 재구성했을 가능성이 높다.

5. **동일 패턴이 `image_data` 주장과 같음**: 이전 리서치에서 확인한 `image_data` + `post_srl` 조합과 동일하게, 코드 없이 개념만 서술하는 AI 환각 패턴이다.

---

## 6. SDK 검토 결과

### voyageth/bandopenapi (공식 Python SDK)
출처: https://raw.githubusercontent.com/voyageth/bandopenapi/main/python/bandopenapi/client.py

구현된 함수 목록:
- `get_album_photos()` — 앨범 사진 목록 조회
- `get_albums()` — 앨범 목록 조회
- `create_post_comments()` — 댓글 작성 (photo 파라미터 없음)
- `create_post()` — 게시글 작성 (photo 파라미터 없음)
- `get_post_comments()`, `get_post()`, `get_posts()`, `get_bands()`

이미지 업로드 함수 없음. 확정.

### search5/openbandpy (비공식 Python SDK)
출처: https://github.com/search5/openbandpy

이미지 업로드 관련 함수 없음. 확정.

### BANDDevelopers/BAND_REST_OpenAPI_Sample (공식 Java 샘플)
출처: https://github.com/BANDDevelopers/BAND_REST_OpenAPI_Sample

band-urls.properties에 정의된 URL:
- `https://auth.band.us/oauth2/authorize`
- `https://auth.band.us/oauth2/token`
- `https://openapi.band.us/v2/profile`
- `https://openapi.band.us/v2.1/bands`

이미지 업로드 URL 없음. 확정.

---

## 7. GitHub 코드 검색 결과

| 검색어 | 결과 건수 |
|--------|----------|
| `photo_key band openapi` | 0건 |
| `openapi.band.us photo` | 0건 |
| `openapi.band.us upload` | 0건 |
| `band_key content access_token photo` | 0건 |
| `band api image upload access_token band_key` | 0건 |

실제로 작동하는 구현 코드 전무.

---

## 8. 결론 및 트레이드오프

### photo_key 2단계 플로우 존재 여부

| 항목 | 판단 |
|------|------|
| 공식 API 문서에 이미지 업로드 엔드포인트 존재 | 없음 |
| photo_key 파라미터가 write_post/write_comment에 존재 | 없음 |
| photo_key 개념 자체가 공식 문서에 존재 | 존재 (Get Photos 응답 필드) |
| 실제 작동하는 구현 코드 존재 | 없음 |
| 지식iN 답변 신뢰도 | AI 생성으로 판단 |

**photo_key 2단계 업로드 플로우는 공개 API에 없다. FALSE.**

### 해석

`photo_key`라는 용어가 공식 문서에 실재하기 때문에 AI가 이를 학습해 "업로드하면 받는 키"로 재구성한 것으로 보인다. 실제로는 기존 업로드된 사진의 조회용 ID다.

이미지 첨부 기능은 밴드 앱 내부 전용 비공개 API에서만 가능하며, 공개 Open API에는 노출되지 않는다.

### 권장 경로 (기존 리서치와 동일)

1. **Web Share API 반자동** — 사용자가 탭 1회로 밴드 앱에 공유 (이미지 포함 가능)
2. **텍스트 댓글 + Firebase Storage URL** — 이미지는 Firebase Storage에 올리고 URL을 댓글에 포함

---

## 검색 로그

| 검색 방법 | 검색어 | 결과 |
|----------|--------|------|
| curl 직접 | developers.band.us/develop/guide/api | 14개 API 메뉴 목록 수신 |
| curl 직접 | developers.band.us/develop/guide/api/write_post | 파라미터 4개, photo 없음 확인 |
| curl 직접 | developers.band.us/develop/guide/api/write_comment | 파라미터 4개, photo 없음 확인 |
| curl 직접 | developers.band.us/develop/guide/api/get_photos | photo_key 필드 확인 (조회 응답 전용) |
| curl 직접 | developers.band.us/develop/guide/api/get_albums | photo_album_key 확인 |
| curl 직접 | developers.band.us/develop/guide/api?lang=ko | 한국어 write_post 파라미터 4개 동일 |
| GitHub API | photo_key band openapi | 0건 |
| GitHub API | openapi.band.us photo | 0건 |
| GitHub API | openapi.band.us upload | 0건 |
| GitHub raw | voyageth/bandopenapi/client.py | 이미지 업로드 함수 없음 |
| GitHub raw | BANDDevelopers/BAND_REST_OpenAPI_Sample | band-urls.properties에 upload URL 없음 |
| GitHub raw | search5/openbandpy/band.py | 이미지 업로드 함수 없음 |
| 네이버 검색 | 밴드 open api photo_key (블로그) | 지식iN 답변 1건 발견 |
| 지식iN 직접 | docId=484104597 | AI 생성 답변으로 판단 (코드 없음) |
| 스택오버플로우 API | naver band | 0건 |
| 스택오버플로우 API | band api | 0건 |

---

## 출처 목록

- 밴드 API 전체 메뉴 (직접 접속): https://developers.band.us/develop/guide/api
- 게시글 쓰기 API (직접 접속): https://developers.band.us/develop/guide/api/write_post
- 댓글 쓰기 API (직접 접속): https://developers.band.us/develop/guide/api/write_comment
- 사진 목록 조회 API (직접 접속): https://developers.band.us/develop/guide/api/get_photos
- 앨범 목록 조회 API (직접 접속): https://developers.band.us/develop/guide/api/get_albums
- 공식 Python SDK: https://raw.githubusercontent.com/voyageth/bandopenapi/main/python/bandopenapi/client.py
- 공식 Java 샘플 레포: https://github.com/BANDDevelopers/BAND_REST_OpenAPI_Sample
- 비공식 Python SDK: https://github.com/search5/openbandpy
- 지식iN 답변 (AI 생성 추정): https://kin.naver.com/qna/detail.naver?dirId=113&docId=484104597
