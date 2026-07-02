# AMI Queue — ami-work 설비등록 전송 큐앱 설계

> DataPush(수집, ami-work 모달)가 만든 `datapush_queue`를 읽어 **awms 설비등록(saveAct)으로 예약·전송**하는 폰 앱.
> 수집(1단계)=datapush-design.md / 전송(2단계)=이 문서. 이름 **AMI Queue**.
> 기존 `awms-queue`(종로 계기팀, saveRow/ami-jongno)와 **별개 앱** — 같은 인프라 패턴 재활용.

## 0. 작업방식 2종 + 수집 데이터소스 (영준님 확정 2026-06-13)

통신팀 아미큐는 **두 작업방식**을 함 → 수집 데이터소스가 갈린다. 수집은 **아미큐 앱 자체 수집폼**(collect.js)이 담당(폐기된 ami-work DataPush 모달 대체). 입력(모뎀맥·사진·통신방식)은 전부 아미큐에서.

| | **일반시공** (혼자) | **동행시공** (계기팀과, 종로/중구) |
|---|---|---|
| 데이터 소스 | ami-work `siteData/charger4eleccar` (숫자키→계기 dict) | ami-jongno `workStatus/jongno/{주소}/replacement_list/{old_meter_id}` |
| 신계기번호 | `계기번호` 필드 | `new_meter_id` 필드 (계기팀이 종로앱에 완료/임시저장) |
| 자동필드 | 계기유형(번호파싱)·지사→DEPT2 | 계기유형·칸수(`cntr_clas`계약종별+`cntr_pwr`계약전력)·봉인(`seal_no`)·차수(`cha`)·고객(`cust_no`) |
| MTR_WITH_YN | N | **Y** |
| 계기팀 미완료분 | — | **수기 보완** (replacement에 없으면 직접 입력) |

**공통 진입 규칙(영준님 핵심):** 계기번호 **하나만** 입력(현장 QR/수기)해도 → **그 주소의 전체 계기를 자동으로 끌어온다.** 현장에서 하나씩 안 넣게.
- 일반: 계기번호 → ami-work siteData 역조회(`.indexOn` 계기번호) → 주소(도로명주소) → 그 주소 전체 계기(`.indexOn` 주소).
- 동행: new_meter_id → ami-jongno에서 그 주소 찾기 → 그 주소 replacement_list 전체 new_meter_id. (workStatus/jongno는 주소키 구조라 new_meter_id 역조회는 종로 규모상 전체순회/캐시 검토 — 종로구+중구만이라 가벼움.)

**진입 경로 2개(공존):**
1. **아미맵 현장버튼**(A, 구현됨): 주소 통째 handoff → 아미큐. (일반시공)
2. **계기번호 직접입력**(QR/수기): 아미큐가 위 규칙으로 주소 전체 자동확장. 작업방식(동행/일반) 토글로 소스 선택.

**ami-jongno replacement_list 항목 필드**(실측 2026-06-13): `old_meter_id`(키)·`new_meter_id`·`cntr_clas`·`cntr_pwr`·`cust_no`·`gum_day`(검침일)·`seal_no`·`removal_value(s)`·`new_meter_mfg_ym`·`cha`·`replaced_at`·`source`·`worker`. 주소노드에 `comm_state`/`comm_completed_list`(통신팀 작업상태 이미 통합) + `meter_*`(계기팀 상태).

> 아래 1~9는 **전송(saveAct) 단계** 설계. 수집 소스가 동행이면 datapush_queue에 `workMode:'동행'`+MTR_WITH_YN=Y로 적재.

## 1. 정체 / 책임
- 입력: ami-work Firebase `datapush_queue/{id}` (DataPush 수집물).
- 출력: 한전 awms `POST /ami/mob/cst/mobCst1000/saveAct` (설비등록, 마스터·슬래이브 각 1행).
- 책임: 목록 표시 → **예약 시각 지정 또는 즉시** → 전송 시 **사진 EXIF를 전송시각에 맞춤** → saveAct push → 상태 갱신.
- 업로드 권한은 영준님 독점(게이트키핑). 작업자는 DataPush 수집까지, 전송은 AMI Queue(영준님 폰).

## 1.5 수집 데이터 모델 — "맥이 키" (브레인스토밍 확정 2026-06-14)

> 한 주소의 N개 계기 중 무엇이 마스터/슬래이브인지 데이터가 안 알려줌. 영준님과 브레인스토밍으로 확정한 모델·작업흐름. **핵심: 작업자 입력 = 사진 + 계기번호 + 맥, 나머지 전부 자동/사전세팅.**

### 핵심 단위 = 마스터 그룹 (맥이 키)
- **한 모뎀(맥) = 한 마스터 그룹** = {마스터1, 슬래이브N}. 맥이 그룹 식별자.
- 한 주소 = 1개 이상 마스터 그룹.
- awms saveAct와 정확히 일치: 마스터행(MODEM_DIV10, 맥) + 슬래이브행(MODEM_DIV20, MB_METER_ID=마스터, 같은 맥).

### 마스터/슬래이브 판별
- **마스터 = 맥 입력 계기**(신설) / 리스트밖 추가계기(기설, 작업자 옵션선택). "맥 넣는 행위 = 마스터 선언". 깨지는 경우 없음.
- **슬래이브 = 맥 없는 대상 계기**. 계기번호는 주소 리스트(조회)에서 자동으로 싹 나옴 → **작업자는 사진만 매칭**.
  - 아미고(무선): 같은 함체 마스터 외 **전부 자동 슬래이브** (무선이라 선 연결 불필요)
  - 그 외(0.5, 485 통신선): **작업자가 마스터에 연결 지정**

### 신설/기설
- 기본 **신설 자동**. 핵심 신호 = "리스트에 없는 계기 = 추가계기". 그걸 마스터로 쓰면 기설(WORK_DIV M1030). 작업자가 고르는 옵션.

### 함체 / 시설유형(FCLTY_DIV) 자동산출
- 함체(단독/집합) = 데이터에 없음 → 작업자 지정.
- 시설유형 자동: 단독+슬0 → **단독(10)**(대표계기·함내수 비움) / 단독+슬有 → **집합단독(40)** / 집합 첫마스터 → **집합기본(20)** / 같은함체 2번째+ → **집합추가(30)**.
- 대표계기(MB_METER_ID) = 마스터, 함내계기수(MB_CNT) = 마스터+슬래이브.

### 사진 (ATCH 3/4/5/6)
- **마스터 4장**: 3 시공전 / 4 맥 / 5 시공후1(계기) / 6 시공후2(전체) — 직접 촬영.
- **슬래이브**: 3·4(마스터 파일ID 복사) + **5(자기 계기, 직접 찍는 1장)**, **6 없음**(마스터에 있음).

### 통신방식 / 분기
- 통신방식 = **맥 prefix 판별(helper 로직) + site-data 통신방식 필드 교차** → 추천값. 14% 겹침/현장변경 → **수동 드롭다운 확정**.
- 분기(BUNGI) = 통신방식 따라 자동: 아미고=무선 / 그 외=0.5. **마스터는 분기 비활성**.

### 부가필드
- **변대주**(PLC/k-dcu): site-data 변대주 (≠DCUID, DCUID=변대주+뒤2자리). 복사버튼 파생값. **PLC 법칙은 helper(awms-bridge-inject)에 구현됨 → 그대로 가져옴**.
- **연결장치**(EXT_CONN_DEV): AE타입(HW4040)만 Y/N 체크박스(기본 N). = etype(단종된 E모뎀 재고를 AE에 연결장치로 활용).
- **봉인**: 동행시공은 통신팀이 **안 넣음**(계기팀이 계기설치 시 넣음). 수령 시에만 **새 봉인번호**(replacement seal_no 기존값 절대 안 씀). 기본 빈값 omit.

### 자동/사전세팅 (입력 최소화)
- **상단 체크박스(사전세팅)**: 동행시공여부(작업방식 동행/일반), 작업자1·2, 지사(동행=서울본부직할).
- **맥 넣는 순간 자동**: 마스터/슬래이브, 대표계기, 함내계기수, 통신방식, 변대주, 분기, 시설유형.
- **계기별 체크박스**: 연결장치(AE타입만).

### 현장 작업 흐름 → UI
1. 시공전 사진 → 2. 모뎀 꽂고(마스터)+슬래이브 연결(아미고 자동무선) → 3. 사진 다다닥 → 4. 마스터 4장 올림 → 5. 계기번호+맥 입력.
- **UI**: `[상단 공통 체크박스]` + `[마스터그룹 카드: 사진4·계기번호·맥·통신방식·변대주]` + `[슬래이브: 리스트에서 계기 탭 + 사진1슬롯]`. 슬래이브는 통신·분기를 마스터에서 상속 → 입력 0.

### ★ UI = awms 설비등록 화면 본뜨기 (영준님 2026-06-14, 캡처 레퍼런스)
> collect.js 1차 UI(마스터그룹 카드)는 **폐기**. awms 설비등록 폼(AMI 현장관리 시스템 > 시공관리)을 **그대로 본뜨되**, 안 쓰는 필드 간편화 + 파생값 자동채움. 작업자는 **맥+사진**만. awms 캡처 2장 = 레퍼런스(/tmp/awms_screen.png 류, 재캡처 가능).

**awms 필드별 처리 (영준님 확정):**
| awms 필드 | 처리 |
|---|---|
| 지사 · 사업명 · 동행시공여부 · 작업자1·2 | **사전설정**(아미큐 설정페이지에서 미리) |
| 대표계기 | 마스터 계기번호로 **자동대체** |
| 함내계기수 | 마스터+슬래이브 수 **자동** |
| 계기번호 | **입력**(진입 시 자동채움/QR) |
| 모뎀맥 | **입력** — ★QR/바코드 스캔 시 **스캔화면=모뎀맥 사진 겸용**(맥값+사진 한번에, "사진1번 맥1번"→1번). GmsBarcodeScanner 이미지 반환 가능하면 채택 |
| 사진 | **입력** 시공전·시공후 (모뎀맥은 스캔겸용 가능) |
| 작업구분(신설/기설) | **입력** / 구분상세 안 씀 |
| 연결장치(EXT_CONN_DEV) | **입력**(AE) |
| 변대주 | PLC·HPGP일 때만 **자동조회**(site-data) |
| 계기유형·통신방식·분기·시설유형 | **자동 파생** (분기=슬래이브, 통신=맥) |
| 기존모뎀맥·인입선·방문구분·신호레벨·신호측정·비고·봉인(함체/계기/외부 6개) | **안 씀(지금은)** |

- **슬래이브 = 번호 할당 + 사진만** (나머지 마스터 상속).
- 하단 버튼: awms처럼 [기설추가][SLAVE추가][완료(=큐담기)].

### datapush_queue 스키마 계약 (producer collect.js ↔ consumer amiqueue-saveact.js)
> 새 `groups` 키 안 만듦 — 기존 `boxes[].masters[].slaves[]`가 이미 마스터그룹과 동형. **필드만 확장**(builder/queue.js 호환).
```
datapush_queue/{id}: { workMode:'일반'|'동행', addr, jisa, createdAt, createdBy, status, workDiv:'M1010'(신설)|'M1030'(기설),
  boxes: [{ hamType:'단독'|'집합', masters: [{          // master = 마스터 그룹(맥=키)
    meterNo, meterType, mac, comm, commSuffix,           // 통신방식 자동(helper) / suffix 10·20·40·70·90·92
    fcltyDiv:'10|20|30|40', fcltyLabel, mbMeterId, mbCnt, // 시설유형 자동산출 / 대표계기=마스터·함내수=마스터+슬래이브
    ext:'Y'|'N',  bdju,                                   // 연결장치(AE만), 변대주(PLC, ≠DCUID; awms필드매핑 TODO)
    photos: { pre, mac, post1, post2 },                  // 마스터 4장 = ATCH 3·4·5·6
    slaves: [{ meterNo, meterType, bungi:'무선'|'0.5', photo }]  // 슬래이브 photo=ATCH5(자기1장). ATCH3·4=builder가 마스터ID복사, ATCH6=omit
  }]}] }
```
- **슬래이브 사진은 1슬롯(`photo`=계기/slot5)만 저장.** 3·4(마스터복사)·6(omit)은 builder(saveAct-time)가 처리 — collect.js 책임 아님.

## 2. 아키텍처 (awms-queue 패턴 재활용)
- **2탭 멀티웹뷰**: 큐탭(localhost www) ↔ awms탭(awms.kdn.com). awms 세션(OTP, 4시간)은 폰 WebView에만 있음 → 큐탭이 awms탭에 `evaluateJavascript`로 fetch 위임해 same-origin+쿠키 우회. (PC/맥 크론은 세션 없어 불가 = FLAG2 회피)
- **세션 자동체크** + 로그인 id/pw 자동입력(OTP만 수동). 아이디 mdp2504381.
- **예약 스케줄러 = 폰 자체 타이머** (세션이 폰에만 있으므로). 앱이 백그라운드에서 예약시각 도달 시 전송.
- Firebase: 읽기/상태쓰기 = ami-work DB(`datapush_queue`). 통합 로그 = `awmslog/amiqueue`.

## 3. 데이터 소스 — datapush_queue 구조
```
datapush_queue/{id}: {
  addr, createdAt, createdBy, createdByName, status: 'pending'|'scheduled'|'sent'|'error',
  scheduledAt?,            // 예약 시각(ISO KST). 없으면 수동/즉시
  boxes: [{
    hamType: '단독'|'집합',
    masters: [{
      meterNo, meterType,        // 계기번호, 계기유형(E/AE/G/AMIGO)
      mac, comm,                 // 모뎀맥, 통신방식(ks-plc/hpgp/lte_IV/k-dcu/smgw-c)
      fcltyDiv, fcltyLabel,      // 시설유형 코드(10/20/30/40)
      mbCnt, mbMeterId,          // 함내계기수, 대표계기(단독형은 '')
      slaves: [{meterNo, meterType}],
      photos: {pre, mac, post1, post2}   // dataURL (2단계서 Storage 전환 검토)
    }]
  }]
}
```

## 4. 화면
- **목록**: 카드별 [주소 / 함체·마스터·슬래이브 수 요약 / 시설유형 / 상태배지(대기·예약·완료·실패) / 예약시각]. 날짜 필터.
- **카드 상세/액션**: [지금 전송] [예약…](시각 picker) [내용 보기] [삭제].
- **처리상황 패널**(하단): 전송 진행 로그 실시간(awms-queue 방식).
- **상단 배너**: 전송중/성공/실패.
- awms 세션 없으면 [awms 열기] 유도(로그인).

## 5. 전송 플로우
공통: 전송 직전 **사진 EXIF 시각을 "전송시각 T"에 맞춤**(admin.html 로직 흡수). 서버 등록시각은 awms가 T로 박으므로 사진시각=T로 정합. **위치(GPS)는 awms가 수집 안 함 → 무시. 사진 EXIF GPS는 현장 촬영이라 그대로 둠.**

- **즉시 전송(개별/일괄)**: T=now. awms-queue처럼 건당 랜덤 8~18초 텀(봇감지 회피), 5건마다 세션 재확인.
- **예약 전송**: 카드에 scheduledAt 저장 → 폰 타이머가 그 시각 도달 시 자동 전송(T=scheduledAt). 여러 건 예약 시 텀 두고 순차.
- 1건 = 함체들의 모든 마스터·슬래이브 행을 saveAct로 순차 등록(한 주소 묶음). 성공 시 status='sent', 실패 시 'error'+사유.

## 6. saveAct 빌더 (수집물 → 설비등록 행)
한 마스터 = 1행(MODEM_DIV=10), 그 슬래이브들 = 각 1행(MODEM_DIV=20). 필드(saveAct_test.js 99필드 기준):

| saveAct 필드 | 값 출처 |
|---|---|
| DEPT1 | 3970 고정 |
| DEPT2 | site-data 지사 → DEPT2 코드표(datapush-design §지사) |
| WORK_DIV / FLAG / WORK_STEP | M1010(신설) / M10 / 28 |
| MTR_WITH_YN | N (ami=단독시공) |
| FCLTY_DIV | 마스터 fcltyDiv (10/20/30/40) |
| MODEM_DIV | 마스터 10 / 슬래이브 20 |
| INSTR_NUM | 계기번호 |
| INST_M | 계기유형→HW코드 (E=4020·AE=4040·G=4030·AMIGO=4050·표준=4010) |
| INST_S | INST_M + 통신방식 suffix (ks-plc10·hpgp20·lte_IV70·k-dcu90·smgw-c92·lte40) |
| MAC_MODEM | 모뎀맥 |
| MB_METER_ID | 대표계기 (단독형 10은 '') |
| MB_CNT | 함내계기수 (단독형 10은 '') |
| BUNGI | 슬래이브 분기기 (smgw-c=무선 / 그외 0.5) |
| EXT_CONN_DEV | AE타입(HW4040)일 때만 Y/N (외장 연결장치) |
| ATCH_FILE_ID_3/4/5_SRC | 사진(EXIF 시각조정 후 Blob) |

- 슬래이브 통신방식 = 마스터 INST_S suffix 따라감(helper applyCommBungi 규칙).
- 사진은 awms 통과조건(고해상도·700KB+·ICC없음) 충족 필요(awms_API_레퍼런스 §6). 큐탭에서 fetch→Blob→FormData.

## 7. 미해결 (실제 saveAct 로그 1건으로 확정 — 영준님 "로그 보면 안다")
- **사진 슬롯 매핑**: 수집 4종(시공전/모뎀맥/시공후1·2) ↔ saveAct 3슬롯(ATCH_3/4/5) 대응. + 슬래이브 사진("5번 사진") 구조 미확정.
- **단독형의 "나머지 3개"**: 단독형이 대표계기·함내계기수 빼고 채우는 3필드 정체.
- **BUSI_NUM**(사업번호), **WORKER1/2_SEQ**(작업자), **etype/변대주**(EXT_CONN_DEV·EXT_DCU_*) 코드.
- → 영준님이 awms에 실제 1건 등록 시 recorder로 saveAct 요청바디 캡처해 확정.

## 8. 기존 awms-queue와 관계
| | awms-queue (종로) | AMI Queue (ami-work) |
|---|---|---|
| 입력 | ami-jongno replacement_list | ami-work datapush_queue |
| 출력 | mobMtr saveRow (계기 철거/신설) | mobCst1000 saveAct (설비등록) |
| 사진 | 철거전/철거후 | 시공전/모뎀맥/시공후 |
| 동행 | Y | N |
- **재활용**: 2탭 웹뷰·세션·fetch위임·랜덤텀·로그패널·로그인자동입력. **신규**: saveAct 빌더, 예약 스케줄러, EXIF 시각조정.

## 9. 단계
1. saveAct 빌더 (필드 매핑) — 실제 로그로 미해결 7 확정 후
2. 목록·상태 화면 + 즉시 전송(EXIF 포함)
3. 예약 스케줄러(폰 타이머)
4. 가상 1건 테스트 → 실등록 검증 (awms 라이브 write 리스크 = 영준님 판단)

## 10. 변대주(0000A000) saveAct 반영 + 자동채움 (영준님 지시 2026-07-02, 조사결과)
> 요구: 통신방식 PLC계열(KS-PLC 10/HPGP 20/K-DCU 90) + 신설일 때, 마지막 단계에 **변대주 텍스트박스**(마스터 1개, 슬레이브 상속) → saveAct에 반영. + 자동채움.

**확정(영준님):**
- 동행 여부 = **초기설정 토글**대로.
- 자동채움 출처: **동행 YES** → 아미큐 계기번호 == 종로 workStatus/jongno `new_meter_id` 매칭 → 종로 site-data `변대주`(예 `9926G874`, 0000A000). **동행 NO** → 아미큐 계기번호 == ami-work site-data `계기번호` → 그 계기의 0000A000 값. (아미큐 계기번호 = 그냥 계기번호, 신설번호 개념 없음. 데이터가 이미 교체분 위주.)
- QR = **보조앱(jongno-snap) 파싱 재사용**(계기 QR 전체 읽고 계기번호만 추출).

**★awms 필드 확정(영준님 2026-07-02):**
- **saveAct 필드 = `DCU_ID`**. 값 = **변대주번호(0000A000) + "00"**. 예: 변대주 `9926G874` → DCU_ID `9926G87400`. **마스터·슬레이브 둘 다** 같은 DCU_ID.
- 용어 정리: awms 조회컬럼 "변대주"(=`TR_FEED_NM`/`TR_FEED`, "현저간 18L8R2")는 실은 **전주번호**(원하는 게 아님). 원하는 건 **변대주번호=0000A000**. (awms 폼 form0113=DCU_ID / form0105=TR_POLE_NO=전주 / form0111=TR_FEED_NM.)
- 변대주번호는 **신설이라 awms getDetail엔 없을 수 있음** → 자동채움은 awms 아닌 **site-data**에서: **동행 YES** → 계기번호==종로 workStatus `new_meter_id` → 종로 site-data `변대주`(9926G874). **동행 NO** → 계기번호==ami-work site-data 계기번호 → 변대주번호(ami-work `DCUID` 앞8자 등, 라이브 재확인). QR=보조앱 파싱 재사용.
- **자동채움 우선순위(영준님 2026-07-02)**: ①마스터 계기번호로 조회 → 있으면 채움 ②없으면 슬레이브 계기번호 순회 조회 → 첫 매칭 채움 ③다 없으면 **빈칸(수동입력)**. (변대주는 그룹 공유값이라 마스터·슬레이브 중 데이터에 있는 계기 걸로.)
- **★동행 매칭은 workStatus(임시저장 포함)로**(영준님 2026-07-02): 종로 site-data `new_meter_no`는 **0건**(신설이 임시저장이라 site-data 미동기). 신설번호(new_meter_id)는 **workStatus/jongno replacement_list에만** 있고 **임시저장/draft도 포함**. 따라서 동행 자동채움 = 아미큐 계기번호 == workStatus replacement_list `new_meter_id`(draft 포함) → 그 항목의 old_meter_id/주소로 종로 site-data `변대주`(0000A000) 조회. site-data new_meter_no로 매칭 금지(비어있음).
- **구현 순서**: Part1(설정=PLC계열(suffix 10/20/90)+신설 시 마지막단계 변대주 텍스트박스 → body 실어 백엔드 → app.py SACT 빌더 `DCU_ID=변대주+"00"` → 더미 saveAct result:1 검증) → Part2(동행분기 자동채움 + QR). 라이브 write는 result:1 실증 후.
- 범위: 앱 `cst-app`(CollectViewModel/CollectScreen 변대주 상태·UI·body) + 백엔드 `cst-input/backend/app.py`(SACT DCU_ID). 빌드=gradlew assembleDebug+install(폰 필요).
