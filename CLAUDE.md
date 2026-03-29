# AMI 작업지도 프로젝트

## 프로젝트 개요
- 앱: AMI 작업지도 (전기차 충전기 AMI 현장 작업 관리)
- 배포: https://815dudwns.github.io/ami-work/
- GitHub: github.com/815dudwns/ami-work
- 기술: HTML + 바닐라 JS + Kakao Maps + Firebase Realtime DB
- 데이터: site-data.json (현재 252개 레코드)

## 워크플로우 (필수 준수)
### 새 기능 개발 시
1. research.md 작성 — 현재 코드/구조 파악, '상세히', '깊게' 분석
2. plan.md 작성 — 구현 방법, 수정 파일, 트레이드오프
3. 영준님 검토 — plan.md에 메모/수정 → "아직 구현하지 마"
4. 승인 후 구현 — 설계도대로 기계적 실행
5. 실패 시 — git reset으로 되돌리고 범위 좁혀서 재시작

### 일상 작업 (버그 수정, 텍스트 변경 등)
- 간단한 건 바로 실행 OK
- 커밋 & push까지 완료

## 에이전트 구성
| 작업 | 에이전트 | 모델 |
|------|---------|------|
| 파일 검색 | quick-search | Haiku |
| 테스트/빌드 | task-runner | Haiku |
| 코딩/수정 | code-worker | Sonnet |
| 조사 | researcher | Sonnet |
| 디버깅 | code-worker | Sonnet |

## 데이터 규칙 (절대 준수)
- 데이터 누락 금지 — 좌표 실패해도 동 중심 좌표로 넣기
- 좌표 폴백: 도로명→지번→동 중심, 정확도 표시 (exact/approximate)
- 계기번호: 엑셀 float→int→str→zfill(11), 하이픈 금지
- 계기타입: 엑셀 믿지 말고 계기번호 3~4자리에서 직접 파싱
  - 17→E, 19→EA, 25/26/27→G, 45/46/47→G, 53→Amigo, 55→Amigo
- 변대주/상호 '0' → 빈 문자열

## 새 사이트 데이터 추가 프로세스
1. 데이터 수집 (사진 OCR / 엑셀 / 스프레드시트)
2. 데이터 가공 (site-data.json 형식)
3. 기존 데이터와 합치기 (계기번호 중복 체크)
4. 좌표 변환 (좌표추출.py → 카카오 API)
5. git commit & push
6. 브라우저 확인

## 계정 정보
- admin / 8414 / 우영준
- user01 / 1111 / 김민성
- user02 / 1111 / 이영길

## Firebase
- DB: https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app
- workStatus 30초 동기화
- Rules .read/.write가 false면 동기화 안 됨

## 예정 기능 (우선순위순)
1. UI 개선 (DaisyUI 또는 Variant 방식)
2. 리스트 선택 페이지
3. 구/동 필터 패널
4. 관리자 전용 기능
5. 다중 사이트 리스트
6. 작업 완료 현황 엑셀 내보내기

## 도메인 지식
- 변대주: 변압기 번호, PLC 작업 시 같은 변대주끼리 통신
- 뒤 2자리 중복 = 485 주소 충돌 → 모뎀 별도 필요
- 통신방식: LTE / KS-PLC / IoT-PLC / HPGP
- 현재 전기차 리스트 = 100% LTE
