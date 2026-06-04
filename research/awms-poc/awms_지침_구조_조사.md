# awms 지침(검침값) 구조 — 계기종류별 지침칸 수

> 2026-06-04 조사. 1종/2종 계기는 지침이 4개(주간/야간/최대전력/무효전력)라 종로앱·빌더 확장 필요.
> ※ 반복 조회 방지용 — 매번 다시 까지 말 것.

## API 호출법 (전부 폰 awms 세션 필요 = CDP fetch credentials:'include', base `/ami/mob/mtr`)

| API | 경로/파라미터 | 용도 |
|---|---|---|
| 차수목록 | `mobMtr1000/getBusiList?DEPT1=3970` | CONS_NO(차수 busiKey) 목록 |
| 작업목록 | `mobMtr1000/getMainList?FLAG=1&DEPT1=3970&busiKey=<CONS_NO>&searchVal=&sortKey=&workStep=<28완료/20작업전>&pPageNo=N&pRowCount=100` | 완료/작업전 행 (WHM_NO,CREMO_WHM_NO,CNTR_CLAS_CD,CNTR_PWR,LAY_METR_CL_CD,STATUS_MOD_DATE) |
| 고객정보 | `mobMtr5000/selectCustomerInfo?BONBU_CD=3970&OFFC_CD=7793&vBarcdQr=<계기번호>&vMenu=10` | CNTR_CLAS_CD, CNTR_PWR, GUM_DAY, CUST_NO 등 |
| 상세(301키) | `mobMtr1000/getDetail?FLAG=1&HDQR_CD=3970&CONS_NO=<>&CNTR_NO=<>&CONS_TGT_SEQNO=<>` | 지침 필드 포함 전체 301키 |

### 시행착오 (주의)
- `selectCustomerInfo`는 **철거 전 계기만** 응답. 완료(철거된) 계기는 `[]` 빈배열.
- `getDetail`은 **WHM_NO 단독 안 됨(404)**. CONS_NO/CNTR_NO/CONS_TGT_SEQNO 셋 다 필요 (getMainList 행에서 취득).

## 지침 필드 체계 — 3종 계량 × D(철거)/C(신설) × DAY/EVEN/MNGT
- **WHME**(유효전력): `DGD_WHME_NDL_DAY_QTT`(주간)/`EVEN_QTT`(저녁)/`MNGT_QTT`(심야야간)
- **DM_MT**(최대수요전력): `DGD_DM_MT_NDL_DAY_QTT` …
- **VAR**(무효전력): `DGD_VAR_NDL_DAY_QTT` …
- `*_DGTS` = 자릿수
- C접두(CGD_…) = 신설계기 지침 (보통 0 세팅)

**영준님 "1종/2종 4개"** = `DGD_WHME_NDL_DAY_QTT`(주간) + `DGD_WHME_NDL_MNGT_QTT`(야간) + `DGD_DM_MT_NDL_DAY_QTT`(최대전력) + `DGD_VAR_NDL_DAY_QTT`(무효전력)

## 계기종류 판별 (어떤 계기가 4칸인가)
- `LAY_METR_CL_CD`(계기종류): 단상=`10` (14/20차 거의 전부). **1종/2종 코드값은 미확정** — 1종/2종 계기 나올 때 getDetail로 확정.
- `CNTR_CLAS_CD`(계약종별): 100(주택), 211, 610, **905=심야전력→야간 MNGT**
- `CNTR_PWR`(계약전력): 저압 3~15kW 다수, **큰 값(50kW 등)=고압/수요전력=DM_MT/VAR 후보**

## 현재 gap (왜 1종2종 안 됨)
- **빌더**(`queue_saverow_builder.py`): WHME 주간/야간만 (CNTR_CLAS_CD==905→MNGT_QTT, 그외→DAY_QTT). **DM_MT/VAR 없음**.
- **종로 데이터**(`replacement_list[계기]`): 지침이 `removal_value` **1개뿐**.
- → 1종/2종 4개를 줄 수도, awms에 채울 수도 없음.

## 해결 TODO (다음 세션)
1. **1종/2종 실제 계기**의 getDetail로 4칸 필드 + 계기종류 코드(LAY_METR_CL_CD 등) **확정** (현재 단상뿐이라 미확정)
2. **종로앱**: 계기 조회(selectCustomerInfo/getDetail)로 계기종류 판별 → 1종/2종이면 지침 입력칸 4개 동적 표시 + 저장
3. **빌더**: DM_MT_DAY / VAR_DAY 매핑 추가 + 계기종류 분기
4. "실시간 조회 가능" = 계기당 1회 getDetail로 종류+지침구조 받으므로 종로앱 동적 4칸 **가능**(확정됨)

관련: [[awms_완료_종로동기화_프로세스]] / queue_saverow_builder.py
