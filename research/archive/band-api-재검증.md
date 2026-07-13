# 네이버 밴드 Open API 댓글 이미지 업로드 재검증

> 조사일: 2026-04-18
> 목적: 이전 리서치 결론(이미지 업로드 불가)과 사용자 제공 정보(image_data 파라미터 존재) 충돌 해소

---

## 결론: FALSE

**`image_data` 파라미터는 공식 밴드 Open API에 존재하지 않는다.**

사용자 제공 정보(`image_data`, `post_srl`)는 AI 환각(hallucination)으로 추정된다.

---

## 1. 공식 문서 직접 확인 결과

### 댓글 작성 API — 파라미터 테이블 원문

출처: https://developers.band.us/develop/guide/api/write_comment (2026-04-18 직접 접속, HTML 전체 수신)

```
[POST] https://openapi.band.us/v2/band/post/comment/create

파라미터:
Name           Type     Mandatory   Description
access_token   string   Y           Access token of the user
band_key       string   Y           Band ID
post_key       string   Y           Post ID
body           string   Y           Comment content

응답:
{ "result_code": 1, "result_data": { "message": "success" } }
```

**파라미터 4개 전부. `image_data`·`image`·`photo`·`file`·`multipart` 없음. 확정.**

### 글 작성 API — 파라미터 테이블 원문

출처: https://developers.band.us/develop/guide/api/write_post

```
파라미터:
access_token   string    Y
band_key       string    Y
content        string    Y   Body content
do_push        boolean   N   Sends push notifications

응답:
result_data.band_key   string   Band ID
result_data.post_key   string   Post ID
```

이미지 파라미터 없음.

---

## 2. 의심 포인트 해소

### 2-1. `post_srl` vs `post_key`

| 항목 | 공식 밴드 API | 사용자 제공 정보 |
|------|--------------|----------------|
| 게시글 식별자 파라미터명 | `post_key` | `post_srl` |
| 응답 필드명 | `result_data.post_key` | — |

`post_srl`은 **XE(구 Zeroboard), 네이버 카페, 그누보드 계열** 오픈소스 CMS에서 쓰는 필드명이다. 밴드 API와 무관하다. 공식 SDK(`voyageth/bandopenapi`)도 `post_key`만 사용한다.

**결론: `post_srl` 사용 자체가 사용자 정보가 밴드 API 기준이 아님을 보여주는 강력한 증거.**

### 2-2. `image_data` 파라미터

공식 문서 파라미터 테이블에 없다. GitHub 공식 Python SDK(`voyageth/bandopenapi`) 함수 시그니처:

```python
def create_post_comments(self, band_key: str, post_key: str, body: str):
    return self._api_call('/v2/band/post/comment/create',
                          params={'band_key': band_key, 'post_key': post_key, 'body': body},
                          method='post')
```

파라미터 3개(`band_key`, `post_key`, `body`). `image_data` 없음.

출처: https://raw.githubusercontent.com/voyageth/bandopenapi/main/python/bandopenapi/client.py

---

## 3. 이미지 에러 코드의 의미

공식 에러 문서(https://developers.band.us/develop/guide/api/handle_errors)에는 이미지 관련 에러가 존재한다:

- `3002` — Image file size has been exceeded
- `3003` — Number of image files has been exceeded
- `60800` — Image URL is invalid or the format is not supported

이 에러들은 **내부 이미지 처리 시스템의 존재**를 시사하지만, 공개 API에 이미지 업로드 파라미터가 없다는 사실을 바꾸지 않는다. 밴드 자체 앱(네이티브/웹)에서 이미지를 처리하는 내부 API가 별도로 있을 가능성이 있으나, 그것은 비공개 내부 API이며 외부 개발자에게 공개되지 않는다.

---

## 4. 사용자 제공 정보의 출처 추정

`image_data` + `post_srl` 조합은 다음 중 하나에서 나왔을 가능성이 높다:

1. **AI 환각**: ChatGPT/Claude 등이 다른 API(네이버 카페, Kakao 등)의 파라미터를 밴드 API와 혼용해 생성
2. **구버전 비공개 API**: 과거 내부 테스트 혹은 비공개 베타 단계에 존재했던 파라미터가 인터넷 어딘가에 남아 있는 것을 LLM이 학습
3. **다른 서비스 혼동**: `post_srl`은 네이버 카페 API나 카페 연동 도구에서 실제로 쓰인다. 밴드와 카페를 혼동한 정보

검색 결과(Google, GitHub)에서 `image_data` + 밴드 API를 조합한 실제 사용 코드나 문서는 **단 한 건도 발견되지 않았다.**

---

## 5. 현재 리서치 결론과의 일치

이전 리서치(`band-api-research.md`)의 결론 "공식 API에 이미지 업로드 파라미터 없음"이 **재검증으로 재확인**됐다.

권장 경로는 이전 리서치 §5와 동일:
- 1순위: Web Share API 반자동 (탭 1회)
- 2순위: 텍스트 댓글 + Firebase Storage URL

---

## 출처 목록

- 밴드 API 댓글 작성 공식 문서 (직접 접속): https://developers.band.us/develop/guide/api/write_comment
- 밴드 API 글 작성 공식 문서 (직접 접속): https://developers.band.us/develop/guide/api/write_post
- 밴드 API 에러 코드 공식 문서: https://developers.band.us/develop/guide/api/handle_errors
- 공식 Python SDK (raw): https://raw.githubusercontent.com/voyageth/bandopenapi/main/python/bandopenapi/client.py
