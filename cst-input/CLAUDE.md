# 아미큐 (통신팀) — 웹 입력폼 (AMI 하위 시스템)

> 정본 지식 = 옵시디언 카드. 작업 전 반드시 읽기:
> - 시스템: `/Users/woodelight/Projects/obsidian/Projects/AMI/systems/아미큐.md`
> - 공용코어: `core/awms-공통.md` `core/계기도메인.md`
> auto-memory가 원자적 함정을 자동 recall. 상세 research 원본은 카드가 링크.

## 핵심 함정 (자세한 건 카드)
- awms 오버레이 트랙: [awms열기] 후 닫기 경로 없어 awmsWebView가 메인 UI를 덮음(onBackPressed 미구현). 복구=force-stop→OTP 재등록. 네이티브 재작성 결정의 핵심 이유.
- "맥이 키" 수집모델: 한 모뎀(맥)=한 마스터 그룹={마스터1, 슬래이브N}. 맥 입력=마스터, 맥 없음=슬래이브(주소 리스트 자동확장). 사진 마스터4/슬래이브1.
- OTP 감지 내장: 앱 내부에 KDN 카톡 OTP 감지 내장(자기앱이라 BAL·가시성 우회). 헬퍼 패턴 이식. 아미큐 재빌드 때 함께 심음.
- 통신팀(MOBCST)과 계기팀(MOBMTR)은 별개 시스템 — 엔드포인트·계정·권한 분리(교차호출 405). 모뎀맥·마스터/슬레이브는 통신팀 전용.
- 봉인 빈값은 omit(SEAL_*/ENCL 빈값이 Java parseInt 500). 동행시공 시 봉인은 계기팀 담당.

## 코드 위치
- `cst-input/` — 웹 입력폼(github 원격로드, push만으로 반영) / `cst-version.json` — 자동업뎃 비교기준
- 네이티브 앱 = `/Users/woodelight/Projects/cst-app/` (Capacitor, 풀 네이티브 재작성 진행중)
