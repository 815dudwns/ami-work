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

## awms 시스템 (문서화 — 매번 다시 조사 말 것)
> awms 정보는 아래 문서에 영구 기록. HANDOFF(휘발성) 말고 여기/research 문서로.

### awms 완료 → 종로 동기화
- **프로세스 문서**: `research/awms-poc/awms_완료_종로동기화_프로세스.md` (작업 전 반드시 참조)
- 요약: awms 완료(workStep=28) 수집 → 작업자완료 보호필터 → sync(매칭 WHM_NO↔종로 계기번호) → **ami-jongno** push
- sync 도구: https://815dudwns.github.io/jongno-combined/tools/sync-meter-from-awms.html / 종로 DB = **ami-jongno** (ami-work 아님)
- **차수 = 완료 기간** (한전이 날짜별 재배정 → 14차 일부가 20차로 이동). **전 차수(getBusiList) 받아 합쳐야** 누락 없음.
- **adb(CDP)로 전 차수 직접 수집 가능** = 완료받기 버튼/재빌드 불필요 (cdp_eval.py). awms-bridge PID는 재시작마다 바뀜.
- **삭제 경고**: replacement_list에 worker≠awms·사진 있으면 작업자 실작업 → 삭제 금지 ([[jongno_delete_protect]], 오삭제 사고 2026-06-04).
- 동기화큐 자동정리(완료건 큐 제외)는 awms-queue 멀티앱 TODO.

### awms inject 리모컨 (헬퍼)
- **문서**: `research/awms-poc/awms_inject_helper_기능.md` (시공전·대표계기·버전 v62~67)
- 리모컨 = `awms-bridge-inject.js` (github pages). awms 새로고침=최신. **로직변경=push만, APK 불필요**. 수정은 `git worktree add /tmp/x main`.
- 시공전(a3) 슬래이브 전파: addRow param 주입 + late-injection (한버튼/서버랙 대비). 대표계기→계기번호: 마스터 11자리 시(헬퍼 설정 옵션, APK).

### LCD YOLO 자동 검출 (종로맵 계기교체 모달)
- **모델**: YOLOv8n, 학습 데이터 yolo4(487장)/yolo5(508장), mAP50=0.85, 64/64 검출
- **모델 파일**: `jongno-combined/models/lcd_detector.onnx` (11.7MB)
- **추론 코드**: `jongno-combined/js/lcd-yolo.js` (onnxruntime-web, wasm 백엔드)
- **연동 위치**: `replacement-modal.js` `onPhotoSelect()` — openLcdEditor 전에 YOLO 추론 → `removalPhotoRegions[field]` 자동 세팅
- **흐름**: 사진 선택 → LcdYolo.detect() → bbox → 편집기 열릴 때 박스 자동 위치 → 유저 확인/수정
- **서버 불필요**: 폰 안에서 완전 온디바이스. 첫 로드 시 모델 프리로드(백그라운드).
- **학습 데이터**: `research/ocr_poc/검침_yolo4/`, `검침_yolo5/` — train/val 라벨 있음
- **버전 표시**: 앱 메뉴 하단 `lcd-yolo 20260610`

### awms 지침(검침값) 구조
- **문서**: `research/awms-poc/awms_지침_구조_조사.md`
- 1종/2종 계기 = 지침 4개(주간 WHME_DAY / 야간 WHME_MNGT / 최대전력 DM_MT_DAY / 무효전력 VAR_DAY). 단상은 주간/야간만.
- 현재 빌더·종로는 1개~2개만 → 1종2종 미지원(TODO). selectCustomerInfo/getDetail로 계기종류 판별 가능.

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
