# [[AMI 작업지도]] 프로젝트

## 프로젝트 개요
- 앱: AMI 작업지도 — **실효계기 교체 단독시공** 관리
- 배포: https://815dudwns.github.io/ami-work/
- GitHub: github.com/815dudwns/ami-work
- 기술: HTML + 바닐라 JS + Kakao Maps + Firebase Realtime DB

## 사업 구조
- **단독 시공** = ami-work (각 지사·구별 실효계기 교체팀 작업, 작업자만 등록)
- **동행 시공** = jongno-combined (계기팀 + 통신팀 합동, 현재 종로·중구 진행)
- 충전기 시스템은 종료됨 (구버전, 더 이상 사용 안 함)
- 실효계기 교체 = 한전이 각 지사·구 계기교체팀에 발주, 작업 후 데이터 관리가 우리 영역

## 데이터 규칙 (절대 준수)
- 데이터 누락 금지 — 좌표 실패해도 동 중심 좌표로 넣기
- 좌표 폴백: 도로명→지번→동 중심, 정확도 표시 (exact/approximate)
- 계기번호: 엑셀 float→int→str→zfill(11), 하이픈 금지
- 계기타입: 엑셀 믿지 말고 계기번호 3~4자리에서 직접 파싱
  - 17→E, 19→EA, 25/26/27→G, 45/46/47→G, 53→Amigo, 55→Amigo
- 변대주/상호 '0' → 빈 문자열

## 새 사이트 데이터 추가 프로세스
1. 데이터 수집 (사진 OCR / 엑셀 / 스프레드시트)
2. 주소 변환: 주소변환.py (지번 → 도로명, 카카오 API)
3. 좌표 추출: 좌표추출.py (도로명 → 좌표, 3단계 폴백)
   - 출력: ami_data_coords.json
4. site-data.json에 합치기 (계기번호 중복 체크)
5. Firebase 업로드: upload_sitedata.py → siteData/charger4eleccar
6. 작업상태 업로드: scripts/upload_work_status.py → workStatus/charger4eleccar
7. git commit & push
8. 브라우저 확인

## 운영 도구
- scripts/reset_work_status.py — 작업상태 초기화 (롤백용)
- scripts/restore_firebase.py — 백업에서 Firebase 복원
- 좌표채우기.py — 기존 데이터 중 좌표 null인 항목 보충

## 계정 정보
- admin / 8414 / [[우영준]]
- user01 / 1111 / 김민성
- user02 / 1111 / 이영길
- user03 / 1111 / 김상권
- user04 / 1111 / 김지호
- user05 / 1111 / 장성훈

## Firebase
- DB: https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app
- siteData/charger4eleccar — 현장 데이터 저장
- workStatus/charger4eleccar — 작업 상태 저장
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

세션 상태/블로커는 HANDOFF.md 참고
