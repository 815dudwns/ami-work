# 아미맵 Part 2 — siteData 캐시-우선 로더 (IndexedDB)

> 다른 에이전트/사람이 "Part 2가 뭘 어떻게 바꿨나"를 빠르게 파악하기 위한 문서.
> 작성 2026-06-14. 커밋 `e83659e`(구현) + `32d52a7`(docs). 배포 완료(github.io 라이브).

## 1. 목적 (왜)
- 아미맵(`map.html`)은 앱 열 때마다 `data/site-data.json`(**16MB, 26,588건**)을 **매번 통째 재다운로드**(`fetch(..., {cache:'no-cache'})`)했다.
- 바뀐 것 없어도 16MB 재다운 → 대역폭 낭비 + 첫 화면 느림 + 콜드스타트 부담.
- ※ siteData는 **정적 파일이라 Firebase 요금과 무관**(돈 새는 곳 아님). Part 2는 순수 "대역폭·로딩속도" 개선. (Firebase 다운로드 주범은 workStatus 30초 폴링 → Part 3에서 이미 해결)

## 2. 동작 (어떻게) — stale-while-revalidate 단순화
앱 시작 시 실효(site-data) 로드 흐름:
1. 작은 `data/site-data.version.json`(`{version, count}`) 먼저 fetch
2. 폰 **IndexedDB 캐시**의 저장 버전과 비교
   - **같으면** → IDB에서 raw 텍스트 꺼내 파싱 → **16MB 재다운로드 0** (캐시 히트)
   - **다르면/캐시없음/IDB불가** → 풀 fetch + IDB 갱신(버전과 함께 저장)
3. 어떤 실패(버전 못받음/IDB 에러/용량초과)도 **풀 fetch로 폴백** → 데이터 누락 없음(불변 규칙 준수)
- skt/tou(작은 데이터셋)는 그대로 직접 fetch. category 태깅·`sampleData=loaded.flat()` 형태 보존.
- ★버전은 **IDB 안에 데이터와 함께** 저장(`{version, text}`). localStorage에 두면 휘발 시 desync 나서 안 됨.

## 3. 변경 파일 (무엇)
| 파일 | 변경 |
|---|---|
| **`js/idb.js`** (신규) | 작은 IndexedDB key-value 래퍼. `window.idbGet(key)` / `window.idbSet(key, value)`. DB명 `ami-cache`, store `kv`. 실패 시 reject(호출측 fetch 폴백). |
| **`data/site-data.version.json`** (신규) | `{version: sha256(site-data.json)[:12], count, generated}`. 캐시 무효화 판단용. |
| **`scripts/gen_site_version.py`** (신규) | 위 version.json 생성기. **★site-data.json 변경 후 반드시 실행**(안 하면 폰이 옛 캐시 유지). |
| **`js/map.js`** | `loadDataset(d)`·`loadSiteDataCached(file)` 추가. `initMap()`의 로딩부를 `DATASETS.map(loadDataset)`로 교체. 기존 `cache:'no-cache'` 풀로드 제거(실효만, skt/tou는 직접 fetch 유지). |
| **`map.html`** | `<script src="js/idb.js?v=...">` 추가(map.js 앞). detail/idb/map `?v=20260614a`로 캐시버스트. |

## 4. 운영 — ★중요
- **`site-data.json`을 바꾸면(새 사이트 추가 등) 반드시 `python3 scripts/gen_site_version.py` 실행** 후 커밋.
  - 안 하면 version이 그대로라 작업자 폰이 **옛 IndexedDB 캐시를 계속 사용** → 새 데이터 안 보임.
  - ami-work/CLAUDE.md "새 사이트 데이터 추가 프로세스" 5단계에 명시됨.
- 코드(map.js/idb.js) 변경 시엔 map.html `?v=` 올려야 폰이 새 JS 받음(기존 규칙 [[jongno_app_version_deploy]] 동일).

## 5. 검증 결과 (A33 실기)
- **로컬서버 테스트**: 캐시 미스(풀fetch+IDB저장) 1533ms → 캐시 히트(IDB) 562ms, **16MB 재다운로드 0**, 26,588건 일치.
- **라이브 배포 검증**: github.io 앱 로드 후 IndexedDB에 site-data 캐시됨(ver `fded6589e37a`, 17MB) → 다음 로드 캐시 사용.

## 6. 주의/한계
- **첫 로드는 여전히 16MB**(캐시-우선은 재방문만 빠르게 함). 첫 방문 속도는 개선 안 됨 — 정상.
- IndexedDB 용량초과 시 idbSet reject → 풀 fetch 폴백(동작엔 영향 없음, 캐시만 미적용).
- 같은 origin(github.io) IndexedDB라, 다른 ami-work 페이지가 같은 키 쓰면 충돌 주의(현재 `site-data` 키만 사용).

## 관련
- 계획 문서: `~/.claude/plans/soft-pondering-pelican.md` (Part 1~4 전체)
- Part 1(재로그인 출혈)·Part 3(workStatus 증분)은 완료. Part 1b(IDB 세션미러)는 **불필요로 정리**(localStorage가 WebView 완전종료에도 생존, [[ami_work_init_logout_fix]]).
- 같은 배포에 들어간 별건: **마커 좌표기준 합치기**(같은 좌표 여러 지번 1마커, map.js/detail.js) — Part 2와 무관하지만 같은 map.js commit 흐름.
