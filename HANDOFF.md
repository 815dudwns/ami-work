# HANDOFF — ami-work(아미맵) / jongno-combined(종로맵) / 계기큐·아미큐·헬퍼

> 앱 통칭은 메모리 [[app_naming_convention]] 참조 (계기큐=awms queue, 아미큐=ami queue, 헬퍼=awms helper, 종로맵=meter care solution, 아미맵=ami-work).
> 배포 시 APP_VERSION 갱신 필수 [[jongno_app_version_deploy]]. 종로맵=Naver Maps.
> **awms API 모를 때 = `research/awms-poc/awms_API_레퍼런스.md`. 통신팀(mob/cst)/계기팀(mob/mtr) 별개 — 항상 구별.**

## 이번 주말 작업 4트랙 (2026-06-13 영준님 정리)

> "DB 구조변경" = 노드 스키마 변경 아님. **매번 DB 받기 → 한 번 받고 캐시·증분으로 가볍게**. 계획 상세: `~/.claude/plans/soft-pondering-pelican.md`

| 트랙 | 내용 | 상태 | 의존 |
|---|---|---|---|
| **A. ami-work** | 로딩 경량화(Part1~3) + UI 개선 | 진행: Part1 완료, Part3 위임중, Part2 대기 | — |
| **B. 종로앱** | 로딩 경량화 = A 공통모듈 이식 + map↔stats APP_VERSION 불일치 버그 1줄 | 대기 | A 검증 후 |
| **C. 계기큐**(awms-queue) | UI·구조 변경 + 버그 수정 | 대기 | — |
| **D. ami-queue**(통신큐) | 완성 = C 이식 + awms 호출 확인 + C 구조 반영 | 대기 | C 연동 |

순서: A 마무리 → C·D 한 묶음 → B(A 결과물 이식). A·C 병렬 가능.

### 사용량/요금제 조사 결론 (2026-06-13)
- **ami-work = Spark 무료, billingEnabled=false → 돈 0원 확정.** "10GB 다 씀"은 무료 한도 채운 것(차단 위험)이지 과금 아님. (사용량에이전트 "Blaze 과금" 오판 — billing API로 정정)
- **범인 = workStatus 30초 폴링** (0.5MB×20명×120/h×8h ≈ **9.6GB/일**, 일별 송신 6~11GB와 일치). siteData/stats·ocr-meter는 부차/무관(ocr-meter는 ami-jongno만 읽음).
- **해결 = Part3(증분 리스너).** DB 이전·유료전환 불필요. 차단 급하면 Blaze 임시전환(0원 안전장치).
- **저장공간 284MB 정리 완료**(awmslog 삭제·awmscomplete 옛스냅샷). 백업 `data/backup-*-20260613.json`(git 커밋 금지). 재발: 계기큐가 awmscomplete 키 누적 → prune 로직 TODO.
- 분리위반: 종로 awms동기화(sync-meter-from-awms.html)가 ami-work DB awmscomplete 사용 → ami-jongno로 이전 검토(별건).

## 현재 상태 (2026-06-11)

- **마지막 작업: TOU 6/9 import + awms 통신팀 모뎀맥 변경 + awms API 문서화**

  - **TOU 6/9 일일점검 import** (data/tou-data.json 110→157, push `fa3f380`):
    - 보이는 57 − 실효 site-data 중복1 = **56** = 기존TOU 중복9(재) + 신규47(개통불가9 포함).
    - 신규47 좌표추출(exact46/approx1). 개통불가9 한전사유(접근불가·위치확인불가·계기불량·입전차단) 디테일.
    - 재9 = `tou_type=rework`(재마커) + charger4eleccar 앱작업 박제(완료5/불가3/기록없음1).
    - 엑셀 디테일10종(통신방식·제조사·통신사·차수·등록일·LP수신·조치구분·수행주체·보강순위·모뎀MAC) + 괄호건물명→상호2건.
    - **★ map.js: TOU 미완표시는 이번배치(tou_source=일일점검_260609 or 재)만** — 기존110·실효는 workStatus 따름(전체 미완 덮던 버그 정정). detail.js TOU섹션 표시라인 추가. `?v=20260611tou2`.

  - **★ awms 통신팀 0553그룹 모뎀맥 변경** (01253658708→01253658563, 6건 — A33 helper 폰):
    - 충돌발견: 한 맥(01253658708)에 마스터2개(05530135823·07530069339)·16계기 섞임. 0553그룹 6개 분리.
    - **맥변경=모뎀 재결합(saveAct로는 안 바뀜!). 마스터 먼저→슬레이브 자동 따라감**. saveAct 자동(슬레이브만)은 옛맥 잔존 꼬임 유발 → 옛맥중복6건 `deleteRows`(복합키, 새맥보존) 삭제로 정리. 새맥6건(마스터 div10 + 슬레이브5) 정합 완료.
    - **전송(sendSelections) 안 함 = 전송 전 상태.** 영준님 전송 결정 대기.

  - **awms API 문서화** (push, docs):
    - `awms_API_레퍼런스.md` **8.5 신설**(마스터/슬레이브·맥변경 재결합·deleteRows·saveAct 64필드·vm/CDP 조작).
    - CLAUDE.md awms섹션: API레퍼런스 참조 + 통신/계기 별개 강조.

- **진행 중:** awms 0553 맥변경 완료(전송 전). TOU 정적파일 push 반영됨.

- **다음:**
  - awms 0553 6건 **전송(sendSelections) 여부** — 영준님 결정.
  - TOU 작업자 폰 새로고침 반영 확인 (정적파일이라 자동reload 아님).
  - 계기큐 전체 일괄 완주(대기+실패 한번에). [이전 미완]
  - 종로맵 #6 계기종류 표시방식 확인 + 폰 실측(버벅임 컬링/필터/완료숨김). [이전 미완]

- **블로커:** 없음. (제주 완료0 / 종로 미연계 = 영준님 지시로 제외)

## 핵심 규칙 (사고 방지)
- **awms 맥변경 = 모뎀 재결합(saveAct 아님), 마스터 먼저.** 통신팀(mob/cst)/계기팀(mob/mtr) 별개·교차호출 405. 모뎀맥·마스터/슬레이브는 통신팀 전용. → `awms_API_레퍼런스.md` 8.5.
- **계기큐 코드수정 = ami-work/awms-queue-www push** (APK빌드 아님). 네이티브(카메라/파일선택)만 빌드. USB 불필요.
- **종로맵 배포 시 APP_VERSION 갱신** (map.html/stats.html 통일) — 안 하면 옛화면 잔존.
- **TOU = 정적파일(data/tou-data.json), Firebase 아님 — push로 반영.** 마커 미완은 이번배치만.
- **28(완료) 되돌리기 불가**(계기팀). **통신팀은 전송 전이면 삭제·수정 자유.**
- **주소상태(workStatus)는 무조건 Firebase.** 종로DB=ami-jongno.
- **ami-work/jongno 코드는 PM 직접 수정**(에이전트 권한거부). 계기큐 APK는 빌드 가능.
- 종로 import: 실작업(source없음) 보호. 추가계기·추가데이터는 awms 안 감.
