"""
awms 계기교체 자동등록 큐 — saveRow payload 빌더
dry-run: payload 생성/검증만 (push 안 함)
--push 플래그 시에만 CDP로 saveRow POST
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.error
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

# ---------------------------------------------------------------------------
# 경로
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).parent
TEMPLATE_5000 = BASE_DIR / "template_5000_L195.json"
TEMPLATE_4000 = BASE_DIR / "template_4000_L201.json"

AWMS_BASE = "https://awms.kdn.com/ami/mob/mtr"
ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")

KST = ZoneInfo("Asia/Seoul")


# ---------------------------------------------------------------------------
# 날짜 헬퍼
# ---------------------------------------------------------------------------
def kst_now() -> datetime:
    return datetime.now(KST)


def fmt_ymd(dt: datetime) -> str:
    """YYYYMMDD"""
    return dt.strftime("%Y%m%d")


def fmt_ym(dt: datetime) -> str:
    """YYYYMM"""
    return dt.strftime("%Y%m")


def fmt_act_date(dt: datetime) -> str:
    """YYYYMMDD HH:MM"""
    return dt.strftime("%Y%m%d %H:%M")


# ---------------------------------------------------------------------------
# CDP 헬퍼 (dry-run에서는 호출 안 함)
# ---------------------------------------------------------------------------
def _cdp_ws_url() -> str:
    """awms.kdn.com 페이지의 webSocketDebuggerUrl 반환"""
    try:
        with urllib.request.urlopen("http://localhost:9222/json", timeout=5) as r:
            pages = json.loads(r.read())
    except Exception as e:
        raise RuntimeError(f"CDP /json 접근 실패: {e}")

    for page in pages:
        url = page.get("url", "")
        ws = page.get("webSocketDebuggerUrl", "")
        if "awms.kdn.com" in url and ws:
            return ws
    raise RuntimeError("awms.kdn.com 페이지를 CDP에서 찾을 수 없음. 폰 세션 확인 요망.")


def cdp_fetch(url: str) -> dict:
    """
    CDP Runtime.evaluate로 awms 내부 fetch 실행 → 응답 dict 반환.
    폰 세션의 credentials:include 쿠키를 그대로 사용.
    """
    try:
        import websocket  # websocket-client 패키지
    except ImportError:
        raise RuntimeError("websocket-client 미설치: pip install websocket-client")

    ws_url = _cdp_ws_url()
    js = f"""
(async () => {{
    const r = await fetch({json.dumps(url)}, {{credentials: 'include'}});
    const text = await r.text();
    try {{ return JSON.parse(text); }} catch {{ return {{_raw: text}}; }}
}})()
""".strip()

    ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=20)
    msg_id = 1
    ws.send(json.dumps({
        "id": msg_id,
        "method": "Runtime.evaluate",
        "params": {"expression": js, "awaitPromise": True, "returnByValue": True},
    }))
    result = json.loads(ws.recv())
    ws.close()
    val = result.get("result", {}).get("result", {}).get("value")
    if val is None:
        raise RuntimeError(f"CDP 응답에 value 없음: {result}")
    return val


def adb_setup(pid: str) -> None:
    """adb forward 설정 + 화면 깨우기"""
    import subprocess
    subprocess.run([ADB, "forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}"], check=True)
    subprocess.run([ADB, "shell", "input", "keyevent", "KEYCODE_WAKEUP"], check=False)


def lookup_customer_info(meter_no: str, bonbu_cd: str = "3970", offc_cd: str = "7793") -> dict:
    """
    selectCustomerInfo API 조회 → 고객 정보 dict 반환.
    CDP를 통해 폰 세션 사용.

    반환 dict 주요 키:
      CUST_NO (= CNTR_NO), PRDC_YM, CNTR_CLAS_CD, GUM_DAY, WRK_PLCE_ADDR_CTT, CNTR_PWR
    CNTR_NO는 이 응답의 CUST_NO와 동일 (recording 교차검증 완료 2026-06-03).
    CONS_NO는 이 응답에 없음 — lookup_seal()의 LV_CONS_NO 사용.
    """
    url = (
        f"{AWMS_BASE}/mobMtr5000/selectCustomerInfo"
        f"?BONBU_CD={bonbu_cd}&OFFC_CD={offc_cd}"
        f"&vBarcdQr={meter_no}&vMenu=10"
    )
    data = cdp_fetch(url)
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    raise RuntimeError(f"selectCustomerInfo 응답 형식 이상: {data}")


def lookup_seal(meter_no: str = "") -> dict:
    """
    mobMtr8000/getMainList API 조회 → 봉인번호(METR_SEAL_VAL) + 공사번호(LV_CONS_NO) 등 반환.
    무파라미터 호출이 정답 (CDP 검증 2026-06-03: METR_SEAL_VAL=3967103, LV_CONS_NO=397820263153).
    CDP를 통해 폰 세션 사용.

    반환 dict 주요 키:
      LV_CONS_NO (= CONS_NO), METR_SEAL_VAL (봉인번호)
    """
    url = f"{AWMS_BASE}/mobMtr8000/getMainList"
    data = cdp_fetch(url)
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    raise RuntimeError(f"getMainList 응답 형식 이상: {data}")


def lookup_mtrl(meter_no: str) -> dict:
    """
    selectMtrlUseYn(신설계기 자재) 조회 → 제조월(MNFCT_YM) + 자재번호(MTRL_NO).
    URL은 mob/mtl (mtr 아님). CDP read-only. 실패/빈값이면 {} 반환.
    예: 99551111111 → {MTRL_NO:127827, MNFCT_YM:''} (가짜계기는 MNFCT_YM 빈값)
    """
    url = (
        "https://awms.kdn.com/ami/mob/mtl/mobMtl1000/selectMtrlUseYn"
        f"?vBarcdQr={meter_no}&vGubun=T"
    )
    try:
        data = cdp_fetch(url)
    except Exception:
        return {}
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    return {}


def lookup_get_detail(
    cons_no: str,
    cntr_no: str,
    cons_tgt_seqno: str,
    hdqr_cd: str = "3970",
    flag: str = "1",
) -> dict:
    """
    mobMtr1000/getDetail 조회 → 철거 임시저장 건의 301키 전체 반환.
    신설 payload의 베이스로 사용 (DREMO_PRDC_YM, REG_ID, OFFICE_CD 등 awms가 채운 값 그대로).
    CDP를 통해 폰 세션 사용 (read-only).

    반환 dict 주요 키:
      DREMO_PRDC_YM, CNTR_CLAS_CD, WORK_STEP, REG_ID, OFFICE_CD,
      TGT_YEAR, CONS_NO, CNTR_NO, CONS_TGT_SEQNO, HDQR_CD,
      CSL_METR_TRML_SEAL_NO, CSL_METR_TRML_SEAL_KND_CD
    """
    url = (
        f"{AWMS_BASE}/mobMtr1000/getDetail"
        f"?FLAG={flag}&HDQR_CD={hdqr_cd}"
        f"&CONS_NO={cons_no}&CNTR_NO={cntr_no}"
        f"&CONS_TGT_SEQNO={cons_tgt_seqno}"
    )
    data = cdp_fetch(url)
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    raise RuntimeError(f"getDetail 응답 형식 이상: {data}")


# ---------------------------------------------------------------------------
# 단상/삼상 판별
# ---------------------------------------------------------------------------
# 계기번호 3~4자리 기반 계기타입 → 단상/삼상 매핑
# 단상: E(17), EA(19), G(25/26/27), Amigo(53)
# 삼상: G(45/46/47), Amigo(55)
# CNTR_CLAS_CD: 100계열=단상 / 900계열(905 등)=삼상
_THREE_PHASE_CODES = {"45", "46", "47", "55"}
_SINGLE_PHASE_CODES = {"17", "19", "25", "26", "27", "53"}


def meter_type_code(meter_no: str) -> str:
    """
    계기번호(11자리 str)에서 3~4자리 타입코드 추출.
    예: '99531111111' → '53', '99551111111' → '55', '02171625850' → '17'
    """
    cleaned = meter_no.replace("-", "").zfill(11)
    # 3~4자리: 인덱스 2~5
    code4 = cleaned[2:4]
    code3 = cleaned[2:3]
    # 2자리 코드 우선 (더 구체적)
    if code4 in _THREE_PHASE_CODES or code4 in _SINGLE_PHASE_CODES:
        return code4
    # 첫자리가 1이면 3자리 시도 (17, 19)
    if cleaned[2] == "1":
        code2 = cleaned[2:4]
        return code2
    return code4


def is_three_phase(meter_no: str, cntr_clas_cd: str | None = None) -> bool:
    """
    단상/삼상 판별.
    1차: 신설 계기번호 3~4자리 파싱
    2차(교차검증): CNTR_CLAS_CD (100계열=단상 / 900계열=삼상)
    불일치 시 계기번호 기준을 우선하고 경고 출력.
    """
    code = meter_type_code(meter_no)
    by_meter = code in _THREE_PHASE_CODES

    if cntr_clas_cd is not None:
        try:
            clas_int = int(str(cntr_clas_cd))
            by_clas = clas_int >= 900
            if by_meter != by_clas:
                print(
                    f"[WARN] 단상/삼상 불일치: 계기번호({meter_no}, code={code})={by_meter} "
                    f"vs CNTR_CLAS_CD={cntr_clas_cd}={by_clas} → 계기번호 우선"
                )
        except ValueError:
            pass

    return by_meter


def classify_meter(meter_no: str, cntr_clas_cd: str | None = None) -> str:
    """
    '단상' 또는 '삼상' 문자열 반환. 판별 로그 포함.
    """
    code = meter_type_code(meter_no)
    three = is_three_phase(meter_no, cntr_clas_cd)
    label = "삼상" if three else "단상"
    return label


# ---------------------------------------------------------------------------
# 템플릿 로드
# ---------------------------------------------------------------------------
def load_template(path: Path) -> OrderedDict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f, object_pairs_hook=OrderedDict)


# ---------------------------------------------------------------------------
# payload 빌더
# ---------------------------------------------------------------------------
def build_demolition_payload(
    meter_no: str,           # 철거 계기번호 (11자리 str)
    removal_value: str,      # 철거 지침값
    nd_digits: str,          # 지침 자릿수 (기본 "6")
    customer_info: dict,     # selectCustomerInfo 응답 (or stub)
    seal_info: dict | None = None,  # getMainList(8000) 응답 — CONS_NO 출처
    dt: datetime | None = None,
) -> OrderedDict:
    """
    mobMtr5000/saveRow FormData payload 조립.
    customer_info 키 (selectCustomerInfo 응답):
      CUST_NO (=CNTR_NO), PRDC_YM, CNTR_CLAS_CD, GUM_DAY, WRK_PLCE_ADDR_CTT, CNTR_PWR
    seal_info 키 (mobMtr8000/getMainList 응답):
      LV_CONS_NO (=CONS_NO), METR_SEAL_VAL
    CONS_NO 우선순위: seal_info.LV_CONS_NO > customer_info.CONS_NO (구버전 폴백)
    CNTR_NO 출처: selectCustomerInfo.CUST_NO (recording 교차검증: CUST_NO == CNTR_NO)
    """
    tmpl = load_template(TEMPLATE_5000)
    dt = dt or kst_now()
    seal_info = seal_info or {}

    today_ymd = fmt_ymd(dt)
    today_ym = fmt_ym(dt)
    today_act = fmt_act_date(dt)

    # CONS_NO: seal_info.LV_CONS_NO 우선, 없으면 customer_info.CONS_NO(구버전 폴백)
    cons_no = (
        seal_info.get("LV_CONS_NO")
        or customer_info.get("CONS_NO")
        or "<CDP:LV_CONS_NO>"
    )
    # CNTR_NO: selectCustomerInfo.CUST_NO (== 계약번호, recording N=2 검증완료)
    cntr_no = customer_info.get("CUST_NO") or "<CDP:CUST_NO>"

    # 동적 필드 오버라이드
    overrides = {
        # 고객/계약 식별자
        "CONS_NO": cons_no,
        "CNTR_NO": cntr_no,
        # 계기번호
        "WHM_NO": meter_no,
        # 고객 정보 (CDP)
        "DREMO_PRDC_YM": customer_info.get("PRDC_YM", "<CDP:PRDC_YM>"),
        "DREMO_CNTR_CLAS_CD": customer_info.get("CNTR_CLAS_CD", "<CDP:CNTR_CLAS_CD>"),
        "CNTR_CLAS_CD": customer_info.get("CNTR_CLAS_CD", "<CDP:CNTR_CLAS_CD>"),
        "DREMO_MR_DD": customer_info.get("GUM_DAY", "<CDP:GUM_DAY>"),
        "GUM_DAY": customer_info.get("GUM_DAY", "<CDP:GUM_DAY>"),
        "WRK_PLCE_ADDR_CTT": customer_info.get("WRK_PLCE_ADDR_CTT", "<CDP:WRK_PLCE_ADDR_CTT>"),
        "CNTR_PWR": customer_info.get("CNTR_PWR", "<CDP:CNTR_PWR>"),
        # 지침값 (계약종별 905=심야전력→야간 MNGT_QTT / 그외=주간 DAY_QTT)
        # 해당 안 되는 칸은 명시적으로 비움 (템플릿 잡값 잔재 방지 — 2026-06-04 905인데 DAY=111 남던 버그)
        # TODO: removal_values 매핑 — whme_day→DGD_WHME_NDL_DAY_QTT, whme_mngt→DGD_WHME_NDL_MNGT_QTT, dm_mt_day→DGD_DM_MT_NDL_DAY_QTT, var_day→DGD_VAR_NDL_DAY_QTT
        "DGD_WHME_NDL_DAY_QTT": ("" if str(customer_info.get("CNTR_CLAS_CD", "")) == "905" else removal_value),
        "DGD_WHME_NDL_MNGT_QTT": (removal_value if str(customer_info.get("CNTR_CLAS_CD", "")) == "905" else ""),
        "DGD_WHME_NDL_DGTS": nd_digits,
        # 날짜 (KST)
        "ACT_DATE": today_act,
        "DREMO_CHRG_APLY_ST_YMD": today_ymd,
        "DREMO_DISM_YMD": today_ymd,
        "DREMO_LST_MR_YMD": today_ymd,
        "DTTB_DISM_YMD": today_ymd,
        "DPT_DISM_YMD": today_ymd,
        "DREMO_EFEC_YM": today_ym,
        "DCTD1_PRDC_YM": today_ym,
        "DCTD2_PRDC_YM": today_ym,
        "DCTD3_PRDC_YM": today_ym,
        "DTTB_PRDC_YM": today_ym,
    }

    payload = OrderedDict(tmpl)
    payload.update(overrides)
    return payload


def build_new_payload(
    new_meter_no: str,       # 신설 계기번호 (11자리 str)
    removal_meter_no: str,   # 철거 계기번호
    removal_value: str,      # 철거 지침값
    nd_digits: str,          # 지침 자릿수
    customer_info: dict,     # selectCustomerInfo 응답 (or stub)
    seal_info: dict,         # mobMtr8000/getMainList 응답 (or stub)
    cons_tgt_seqno: str = "",  # 5000/saveRow 응답의 consTgtSeqno (실제 push 시 필수)
    cremo_efec_ym: str | None = None,  # 실효년월 YYYYMM (None이면 오늘월)
    dt: datetime | None = None,
) -> OrderedDict:
    """
    mobMtr4000/saveRow FormData payload 조립.
    customer_info 키 (selectCustomerInfo 응답):
      CUST_NO (=CNTR_NO), PRDC_YM, CNTR_CLAS_CD, GUM_DAY, WRK_PLCE_ADDR_CTT, CNTR_PWR
    seal_info 키 (mobMtr8000/getMainList 응답):
      LV_CONS_NO (=CONS_NO), METR_SEAL_VAL (봉인번호)
    cons_tgt_seqno:
      5000/saveRow 응답 JSON의 consTgtSeqno 값 (dry-run에서는 빈 문자열)
    CONS_NO 우선순위: seal_info.LV_CONS_NO > customer_info.CONS_NO (구버전 폴백)
    CNTR_NO 출처: selectCustomerInfo.CUST_NO (recording 교차검증: CUST_NO == CNTR_NO)
    """
    tmpl = load_template(TEMPLATE_4000)
    dt = dt or kst_now()

    today_ymd = fmt_ymd(dt)
    today_ym = fmt_ym(dt)
    today_act = fmt_act_date(dt)
    efec_ym = cremo_efec_ym or today_ym

    # CONS_NO: seal_info.LV_CONS_NO 우선, 없으면 customer_info.CONS_NO(구버전 폴백)
    cons_no = (
        seal_info.get("LV_CONS_NO")
        or customer_info.get("CONS_NO")
        or "<CDP:LV_CONS_NO>"
    )
    # CNTR_NO: selectCustomerInfo.CUST_NO (== 계약번호, recording N=2 검증완료)
    cntr_no = customer_info.get("CUST_NO") or "<CDP:CUST_NO>"

    overrides = {
        # 고객/계약 식별자
        "CONS_NO": cons_no,
        "CNTR_NO": cntr_no,
        # 신설 계기번호
        "WHM_NO": new_meter_no,
        "CREMO_WHM_NO": new_meter_no,
        # 고객 정보 (CDP)
        "DREMO_CNTR_CLAS_CD": customer_info.get("CNTR_CLAS_CD", "<CDP:CNTR_CLAS_CD>"),
        "CREMO_CNTR_CLAS_CD": customer_info.get("CNTR_CLAS_CD", "<CDP:CNTR_CLAS_CD>"),
        "DREMO_MR_DD": customer_info.get("GUM_DAY", "<CDP:GUM_DAY>"),
        "CREMO_MR_DD": customer_info.get("GUM_DAY", "<CDP:GUM_DAY>"),
        "WRK_PLCE_ADDR_CTT": customer_info.get("WRK_PLCE_ADDR_CTT", "<CDP:WRK_PLCE_ADDR_CTT>"),
        "CNTR_PWR": customer_info.get("CNTR_PWR", "<CDP:CNTR_PWR>"),
        "DREMO_PRDC_YM": customer_info.get("PRDC_YM", "<CDP:PRDC_YM>"),
        # 철거 지침값
        "DGD_WHME_NDL_DAY_QTT": removal_value,
        "DGD_WHME_NDL_DGTS": nd_digits,
        "CGD_WHME_NDL_DGTS": nd_digits,
        # 봉인번호 (CDP getMainList)
        "CSL_METR_TRML_SEAL_NO": seal_info.get("METR_SEAL_VAL", "<CDP:METR_SEAL_VAL>"),
        # 봉인 고정값 (템플릿에서 유지되지만 명시)
        "CSL_METR_TRML_SEAL_KND_CD": tmpl.get("CSL_METR_TRML_SEAL_KND_CD", "A"),
        "CSL_METR_TRML_SEAL_KND_NQNT": tmpl.get("CSL_METR_TRML_SEAL_KND_NQNT", "1"),
        # 5000 응답값 (순서대로 처리: 5000 POST → consTgtSeqno 받아서 여기에 주입)
        "CONS_TGT_SEQNO": cons_tgt_seqno,
        # 실효년월
        "CREMO_EFEC_YM": efec_ym,
        # 날짜 (KST)
        "ACT_DATE": today_act,
        "CMS_LAY_YMD": today_ymd,
        "DREMO_CHRG_APLY_ST_YMD": today_ymd,
        "DREMO_DISM_YMD": today_ymd,
        "DREMO_LST_MR_YMD": today_ymd,
        "DTTB_DISM_YMD": today_ymd,
        "DPT_DISM_YMD": today_ymd,
        "CTS_LAY_YMD": today_ymd,
        "CREMO_CHRG_APLY_ST_YMD": today_ymd,
        "CTTB_LAY_YMD": today_ymd,
        "CSPD_LAY_YMD": today_ymd,
        "DREMO_EFEC_YM": today_ym,
        "DCTD1_PRDC_YM": today_ym,
        "DCTD2_PRDC_YM": today_ym,
        "DCTD3_PRDC_YM": today_ym,
        "DTTB_PRDC_YM": today_ym,
        "CCTD1_PRDC_YM": today_ym,
        "CCTD2_PRDC_YM": today_ym,
        "CCTD3_PRDC_YM": today_ym,
        "CTS_PRDC_YM": today_ym,
        "CMS_PRDC_YM": today_ym,
        "CPT_PRDC_YM": today_ym,
        "CTTB_PRDC_YM": today_ym,
        "CSPD_PRDC_YM": today_ym,
    }

    payload = OrderedDict(tmpl)
    payload.update(overrides)
    return payload


def build_new_payload_from_detail(
    new_meter_no: str,        # 신설 계기번호 (11자리 str)
    detail: dict,             # getDetail 응답 301키 dict (awms가 채운 값)
    seal_val: str,            # 현재 봉인번호 (getMainList.METR_SEAL_VAL)
    cons_tgt_seqno: str = "", # 철거 saveRow 응답 consTgtSeqno (push 시 필수)
    mtrl_info: dict | None = None,  # selectMtrlUseYn(신설계기) → MNFCT_YM, MTRL_NO
    mfg_ym: str = "",         # jongno 입력 신설 제조월 (YYYY-MM, 최우선)
    dt: datetime | None = None,
) -> OrderedDict:
    """
    mobMtr4000/saveRow payload — getDetail 응답을 베이스로 신설 전용 필드만 덮어씀.

    설계 원칙:
    - getDetail 301키를 베이스 dict로 삼는다
    - WHM_NO/CREMO_WHM_NO, EX_WORK_STEP, 봉인, 신설 날짜필드, CONS_TGT_SEQNO만 오버라이드
    - DREMO_PRDC_YM, CNTR_CLAS_CD, REG_ID, OFFICE_CD, TGT_YEAR 등 awms가 채운 메타는 건드리지 않음
    - 사진 ATCH_FILE_ID_* 는 빈값 유지 (innorix 별도)

    삼상/단상:
    - 단상: SEAL_NO=seal_val, NQNT="1"
    - 삼상: SEAL_NO=seal_val, SEAL_NO2=seal_val+1, NQNT="1"
      * NQNT는 recording 검증값 기준 삼상도 "1" (현장 확인 필요: 아래 주석 참고)

    [WARN - 영준님 확인 필요] CSL_METR_TRML_SEAL_KND_NQNT (봉인 수량):
    task 지시는 삼상=2개이나 recording 실제 성공 saveRow(Line 645/702)는 삼상도 NQNT="1".
    현재 코드는 recording 기준(삼상 NQNT="1")으로 생성. 영준님 의도와 다를 수 있음.

    getDetail에 없는 신설 전용 필드 (recording Line 645 기준):
      EX_WORK_STEP, DEPT2, LAY_METR_DTLS_CL_CD,
      CTS_PRDC_YM, CMS_PRDC_YM, CSPD_PRDC_YM, CTTB_PRDC_YM (신설 제조월),
      CTS_LAY_YMD, CMS_LAY_YMD, CSPD_LAY_YMD, CTTB_LAY_YMD (신설 설치일)
    """
    dt = dt or kst_now()
    today_ymd = fmt_ymd(dt)
    today_ym = fmt_ym(dt)
    today_act = fmt_act_date(dt)

    # 단상/삼상 판별 (신설계기 기준, getDetail CNTR_CLAS_CD 교차확인)
    cntr_clas = str(detail.get("CNTR_CLAS_CD", ""))
    three = is_three_phase(new_meter_no, cntr_clas or None)
    seal_int = int(str(seal_val).strip())

    # 봉인번호: 단상=1개, 삼상=2개
    seal_no = str(seal_int)
    seal_no2 = str(seal_int + 1) if three else ""

    # getDetail 301키를 OrderedDict 베이스로 복사
    # (숫자형 값을 str으로 변환 — FormData는 전부 문자열)
    payload: OrderedDict = OrderedDict()
    for k, v in detail.items():
        if v is None:
            payload[k] = ""
        elif isinstance(v, float) and v == int(v):
            payload[k] = str(int(v))
        else:
            payload[k] = str(v)

    # 사진 필드는 빈값으로 초기화 (innorix 별도 처리)
    for k in list(payload.keys()):
        if "ATCH_FILE_ID" in k:
            payload[k] = ""

    # 신설 전용 오버라이드
    overrides: dict = {
        # 신설 계기번호
        "WHM_NO": new_meter_no,
        "CREMO_WHM_NO": new_meter_no,
        # 임시저장 건 불러온 표시 — 봉인 +1/+2 트리거
        "EX_WORK_STEP": "25",
        # 봉인번호
        "CSL_METR_TRML_SEAL_NO": seal_no,
        "CSL_METR_TRML_SEAL_NO2": seal_no2,
        # NQNT: 단상=1, 삼상=2 (2026-07-02 전송탭 설계 §봉인 처리에 따라 삼상은 봉인 2개)
        #   recording(line 528 WARN)은 삼상도 "1"이었으나, 주입식 플로우에서는 2개가 정답.
        #   app.py _seal_alloc이 삼상 seal_no2=cur+1 할당 — NQNT=2와 쌍을 이뤄야 함.
        "CSL_METR_TRML_SEAL_KND_NQNT": "2" if three else "1",
        # 철거건 연결
        "CONS_TGT_SEQNO": cons_tgt_seqno,
        # 작업일시 (KST 오늘)
        "ACT_DATE": today_act,
        # 신설 날짜필드 (getDetail에 없거나 빈값, saveRow에서 오늘로 채워야 함)
        "CMS_LAY_YMD": today_ymd,
        "CTS_LAY_YMD": today_ymd,
        "CREMO_CHRG_APLY_ST_YMD": today_ymd,
        "CTTB_LAY_YMD": today_ymd,
        "CSPD_LAY_YMD": today_ymd,
        # 신설 제조년월 (오늘월 — getDetail에 없는 필드)
        "CTS_PRDC_YM": today_ym,
        "CMS_PRDC_YM": today_ym,
        "CSPD_PRDC_YM": today_ym,
        "CTTB_PRDC_YM": today_ym,
        # CPT_PRDC_YM은 getDetail에 있을 수 있으나 saveRow 기준 오늘월
        "CPT_PRDC_YM": today_ym,
        # CCTD1/2/3_PRDC_YM: getDetail 빈값 → saveRow 오늘월
        "CCTD1_PRDC_YM": today_ym,
        "CCTD2_PRDC_YM": today_ym,
        "CCTD3_PRDC_YM": today_ym,
        # 신설 계기 제조월: jongno 작업자 입력(mfg_ym) 최우선 > selectMtrlUseYn MNFCT_YM > 오늘월
        "CREMO_PRDC_YM": (mfg_ym.replace("-", "") if mfg_ym else "") or (mtrl_info or {}).get("MNFCT_YM") or today_ym,
        "CREMO_MATL_NO": (mtrl_info or {}).get("MTRL_NO", ""),
        "CREMO_MATL_STAT_CLCD": "1",
        # 신설 실효년월
        "CREMO_EFEC_YM": today_ym,
        # getDetail에 없는 신설 전용 정적 필드 (recording Line 645 기준)
        "LAY_METR_DTLS_CL_CD": "10",
        "DEPT2": str(detail.get("OFFICE_CD", "7793")),
        # getDetail에서 빈값이지만 saveRow에서 '0'으로 채워지는 필드 (recording Line 645 기준)
        # awms 앱이 신설계기 초기 지침을 0으로 세팅하는 값
        "CGD_WHME_NDL_MNGT_QTT": "0",
    }

    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# FormData 직렬화 (push용)
# ---------------------------------------------------------------------------
def payload_to_formdata_str(payload: OrderedDict) -> str:
    """FormData\nKEY=VALUE\n... 형식 재현"""
    lines = ["FormData"]
    for k, v in payload.items():
        lines.append(f"{k}={v}")
    return "\n".join(lines)


def _photo_b64(url: str) -> str:
    """사진 URL을 맥에서 직접 다운로드해 base64 반환.
    awms 페이지(CSP/CORS)가 외부 firebase fetch를 막으므로, awms 컨텍스트가 아닌
    맥에서 받아 base64로 awms saveRow에 주입한다(2026-06-04 검증: awms fetch=Failed, 맥=OK)."""
    if not url:
        return ""
    try:
        import urllib.request, base64
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=20).read()
        print(f"  [사진] 다운로드 {len(data)} bytes")
        return base64.b64encode(data).decode()
    except Exception as e:
        print(f"  [!] 사진 다운로드 실패: {e}")
        return ""


def push_via_cdp(endpoint: str, payload: OrderedDict) -> dict:
    """
    CDP로 awms saveRow POST.
    endpoint: "mobMtr5000/saveRow" 또는 "mobMtr4000/saveRow"
    """
    url = f"{AWMS_BASE}/{endpoint}"
    fd_entries = json.dumps(list(payload.items()))
    js = f"""
(async () => {{
    const fd = new FormData();
    const entries = {fd_entries};
    for (const [k, v] of entries) {{
        if (v !== null && v !== undefined) fd.append(k, v);
    }}
    const r = await fetch({json.dumps(url)}, {{
        method: 'POST',
        credentials: 'include',
        body: fd,
    }});
    const text = await r.text();
    return {{status: r.status, body: text}};
}})()
""".strip()
    return cdp_fetch.__wrapped__(js) if hasattr(cdp_fetch, "__wrapped__") else _cdp_eval_raw(js)


def _cdp_eval_raw(js: str) -> dict:
    """cdp_fetch URL 버전 대신 raw JS 평가용"""
    try:
        import websocket
    except ImportError:
        raise RuntimeError("websocket-client 미설치")
    ws_url = _cdp_ws_url()
    ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=30)
    ws.send(json.dumps({
        "id": 1,
        "method": "Runtime.evaluate",
        "params": {"expression": js, "awaitPromise": True, "returnByValue": True},
    }))
    result = json.loads(ws.recv())
    ws.close()
    return result.get("result", {}).get("result", {}).get("value", {})


# ---------------------------------------------------------------------------
# 검증
# ---------------------------------------------------------------------------
def validate_payload(payload: OrderedDict, name: str) -> list[str]:
    warnings = []
    placeholder_fields = [k for k, v in payload.items() if str(v).startswith("<CDP:")]
    if placeholder_fields:
        warnings.append(f"[{name}] CDP 플레이스홀더 {len(placeholder_fields)}개: {placeholder_fields}")

    meter_no = payload.get("WHM_NO", "")
    if meter_no and not meter_no.startswith("<"):
        cleaned = meter_no.replace("-", "")
        if len(cleaned) != 11 or not cleaned.isdigit():
            warnings.append(f"[{name}] WHM_NO 형식 이상: {meter_no!r}")

    return warnings


# ---------------------------------------------------------------------------
# dry-run: recording과 생성 payload 비교 검증
# ---------------------------------------------------------------------------
def diff_against_recording(generated: dict, reference: dict, label: str) -> list[str]:
    """
    생성 payload와 recording의 성공 saveRow reqBody를 필드 단위로 비교.
    반환: 차이 메시지 리스트
    """
    issues = []
    all_keys = set(generated) | set(reference)
    for k in sorted(all_keys):
        gv = str(generated.get(k, "")).strip()
        rv = str(reference.get(k, "")).strip()
        # 사진 필드, ACT_DATE, 날짜필드는 비교 제외 (실행 시각 다름)
        skip_exact = {"ACT_DATE", "REG_DATE"}
        if k in skip_exact:
            continue
        if "ATCH_FILE_ID" in k:
            continue
        if gv != rv:
            # 값이 있는 쪽만 보고
            if rv and not gv:
                issues.append(f"  [{label}] {k}: 생성=<빈값>  recording={rv!r}")
            elif gv and not rv:
                # recording에는 없는데 생성에 있음 — 신설 전용 필드일 수 있음
                issues.append(f"  [{label}] {k}: 생성={gv!r}  recording=<빈값>")
            elif gv != rv:
                issues.append(f"  [{label}] {k}: 생성={gv!r}  recording={rv!r}")
    return issues


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="awms saveRow payload 빌더 (getDetail 기반)")
    parser.add_argument("--removal-meter", default="06450094432", help="철거 계기번호 (11자리)")
    parser.add_argument("--new-meter", default="08559999001", help="신설 계기번호 (11자리)")
    parser.add_argument("--removal-value", default="12345", help="철거 지침값")
    parser.add_argument("--nd-digits", default="6", help="지침 자릿수")
    parser.add_argument("--efec-ym", default=None, help="실효년월 YYYYMM (기본: 오늘)")
    parser.add_argument("--mfg-ym", default="", help="신설 제조월 (jongno new_meter_mfg_ym, YYYY-MM)")
    parser.add_argument("--old-photo", default="", help="철거전 사진 URL (jongno old_meter_photo) → 철거 DREMO_3")
    parser.add_argument("--new-photo", default="", help="철거후 사진 URL (jongno new_meter_photo) → 신설 CREMO_3")
    parser.add_argument("--push", action="store_true", help="CDP로 saveRow POST (기본 OFF — dry-run)")
    parser.add_argument("--adb-pid", default=None, help="awmsbridge WebView PID (CDP 조회/push 시 필요)")
    parser.add_argument("--out-dir", default=".", help="payload JSON 출력 디렉토리")
    parser.add_argument(
        "--dry-run-recording",
        default=None,
        help="recording JSONL 경로 — 지정 시 recording 기반 stub으로 getDetail 없이 검증",
    )
    args = parser.parse_args()

    dt = kst_now()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ===========================================================
    # [WARN - 영준님 확인 필요] NQNT 삼상값 불일치
    # task 지시: 삼상 CSL_METR_TRML_SEAL_KND_NQNT = "2"
    # recording 검증값(Line 645/702 성공 saveRow): 삼상도 NQNT = "1"
    # 현재 코드는 recording 기준(삼상 NQNT="1")으로 생성함.
    # ===========================================================
    print("[!] 영준님 확인 필요: 삼상 NQNT 값")
    print("    task 지시=2, recording 성공 saveRow(Line 645/702)=1")
    print("    현재 코드는 recording 기준 삼상 NQNT='1'로 생성합니다.")
    print("    실제 awms 정책 확인 후 is_three_phase 로직을 조정하세요.")
    print()

    # ---- CDP 조회 게이트 ----
    # --dry-run-recording: recording JSONL에서 stub 추출 (CDP 없이 테스트)
    # --adb-pid: 실제 CDP 조회
    detail_single: dict = {}   # 단상 getDetail (CONS_TGT_SEQNO=5807921)
    detail_triple: dict = {}   # 삼상 getDetail (CONS_TGT_SEQNO=5807924)
    seal_val: str = "3967105"  # 기본 stub

    if args.dry_run_recording:
        rec_path = Path(args.dry_run_recording)
        print(f"[DRY-RUN] recording 기반 stub 추출: {rec_path}")
        with open(rec_path, "r", encoding="utf-8") as f:
            rec_lines = f.readlines()
        for line in rec_lines:
            d = json.loads(line)
            url = d.get("url", "")
            rb = d.get("resBody", "")
            if "mobMtr1000/getDetail" in url and rb:
                try:
                    rows = json.loads(rb)
                    if rows and isinstance(rows, list):
                        row = rows[0]
                        seqno = str(row.get("CONS_TGT_SEQNO", ""))
                        clas = str(row.get("CNTR_CLAS_CD", ""))
                        if seqno == "5807921" and not detail_single:
                            detail_single = row
                            print(f"  단상 getDetail 추출 완료 (CONS_TGT_SEQNO={seqno}, CNTR_CLAS_CD={clas})")
                        if seqno == "5807924" and not detail_triple:
                            detail_triple = row
                            print(f"  삼상 getDetail 추출 완료 (CONS_TGT_SEQNO={seqno}, CNTR_CLAS_CD={clas})")
                except Exception:
                    pass
        # 봉인번호 stub (recording 기준 3967105)
        seal_val = "3967105"
        print(f"  봉인번호 stub: {seal_val}")
        print()

    elif args.adb_pid:
        print(f"[CDP] adb forward 설정 (pid={args.adb_pid})")
        adb_setup(args.adb_pid)
        print("[CDP] mobMtr8000/getMainList 조회 → 봉인번호")
        seal_info = lookup_seal()
        seal_val = str(seal_info.get("METR_SEAL_VAL", ""))
        print(f"  METR_SEAL_VAL={seal_val}, LV_CONS_NO={seal_info.get('LV_CONS_NO')}")
        # getDetail은 철거 saveRow 후 cons_tgt_seqno를 받아 호출 (push 흐름에서만)
    else:
        print("[DRY-RUN] --adb-pid / --dry-run-recording 없음 — stub 사용")
        print()

    # ---- payload 조립 (철거는 기존 방식 유지) ----
    print(f"[BUILD] 철거 payload (mobMtr5000): {args.removal_meter}")
    # 철거는 기존 selectCustomerInfo 기반 유지 (변경 범위 아님)
    CUSTOMER_INFO_STUB = {
        "CUST_NO": "<CDP:selectCustomerInfo.CUST_NO>",
        "PRDC_YM": "<CDP:selectCustomerInfo.PRDC_YM>",
        "CNTR_CLAS_CD": "<CDP:selectCustomerInfo.CNTR_CLAS_CD>",
        "GUM_DAY": "<CDP:selectCustomerInfo.GUM_DAY>",
        "WRK_PLCE_ADDR_CTT": "<CDP:selectCustomerInfo.WRK_PLCE_ADDR_CTT>",
        "CNTR_PWR": "<CDP:selectCustomerInfo.CNTR_PWR>",
    }
    SEAL_INFO_STUB = {
        "LV_CONS_NO": "<CDP:getMainList8000.LV_CONS_NO>",
        "METR_SEAL_VAL": seal_val,
    }

    if args.adb_pid:
        print(f"[CDP] selectCustomerInfo 조회 (철거계기): {args.removal_meter}")
        customer_info = lookup_customer_info(args.removal_meter)
        print(f"  CUST_NO={customer_info.get('CUST_NO')}, PRDC_YM={customer_info.get('PRDC_YM')}")
    else:
        customer_info = CUSTOMER_INFO_STUB

    demo_payload = build_demolition_payload(
        meter_no=args.removal_meter,
        removal_value=args.removal_value,
        nd_digits=args.nd_digits,
        customer_info=customer_info,
        seal_info=(seal_info if args.adb_pid else SEAL_INFO_STUB),
        dt=dt,
    )

    # ---- 신설 payload (getDetail 기반) ----
    # dry-run-recording 모드: recording stub으로 단상/삼상 둘 다 생성
    ts_str = dt.strftime("%Y%m%d_%H%M%S")

    if args.dry_run_recording and (detail_single or detail_triple):
        print()
        print("=" * 60)
        print("DRY-RUN 검증 (recording 기반 getDetail stub)")
        print("=" * 60)

        # --- recording의 실제 성공 saveRow 파싱 ---
        rec_saverow_single: dict = {}
        rec_saverow_triple: dict = {}
        with open(args.dry_run_recording, "r", encoding="utf-8") as f:
            rec_lines_raw = f.readlines()
        for line in rec_lines_raw:
            d = json.loads(line)
            url = d.get("url", "")
            if "mobMtr4000/saveRow" in url:
                rb = d.get("reqBody", "")
                parsed: dict = {}
                for l2 in rb.split("\n"):
                    if "=" in l2:
                        k, v = l2.split("=", 1)
                        parsed[k.strip()] = v.strip()
                ex = parsed.get("EX_WORK_STEP", "")
                if ex != "25":
                    continue
                # Line 645: SEAL_NO2=3967104 (첫 번째 EX=25 삼상)
                # Line 702: SEAL_NO=3967105 (두 번째 EX=25)
                seqno = parsed.get("CONS_TGT_SEQNO", "")
                seal_no = parsed.get("CSL_METR_TRML_SEAL_NO", "")
                clas = parsed.get("CNTR_CLAS_CD", "")
                whm = parsed.get("WHM_NO", "")
                if seqno == "5807924" and seal_no == "3967103" and not rec_saverow_triple:
                    rec_saverow_triple = parsed
                    print(f"  recording 삼상 saveRow 참조: SEAL_NO={seal_no}, SEAL_NO2={parsed.get('CSL_METR_TRML_SEAL_NO2')}, NQNT={parsed.get('CSL_METR_TRML_SEAL_KND_NQNT')}")

        # --- 단상 9953 검증 ---
        if detail_single:
            print()
            print(f"[단상 9953] 판별 테스트: meter_no=99531111111")
            code_s = meter_type_code("99531111111")
            three_s = is_three_phase("99531111111", str(detail_single.get("CNTR_CLAS_CD", "")))
            print(f"  type_code={code_s}, is_three_phase={three_s} -> {'삼상' if three_s else '단상'} (기대: 단상)")
            assert not three_s, "단상 9953 판별 실패"

            new_p_single = build_new_payload_from_detail(
                new_meter_no="99531111111",
                detail=detail_single,
                seal_val=seal_val,
                cons_tgt_seqno="5807921",
                dt=dt,
            )
            out_single = out_dir / f"payload_4000_single_{ts_str}.json"
            with open(out_single, "w", encoding="utf-8") as f:
                json.dump(new_p_single, f, ensure_ascii=False, indent=2)
            print(f"  출력: {out_single}")
            print(f"  총 필드: {len(new_p_single)}")
            print(f"  EX_WORK_STEP = {new_p_single.get('EX_WORK_STEP')} (기대: 25)")
            print(f"  DREMO_PRDC_YM = {new_p_single.get('DREMO_PRDC_YM')} (기대: getDetail값 201603)")
            print(f"  CNTR_CLAS_CD = {new_p_single.get('CNTR_CLAS_CD')} (기대: 100)")
            print(f"  CONS_TGT_SEQNO = {new_p_single.get('CONS_TGT_SEQNO')} (기대: 5807921)")
            print(f"  CSL_METR_TRML_SEAL_NO = {new_p_single.get('CSL_METR_TRML_SEAL_NO')} (기대: {seal_val})")
            print(f"  CSL_METR_TRML_SEAL_NO2 = '{new_p_single.get('CSL_METR_TRML_SEAL_NO2')}' (기대: 빈값 — 단상)")
            print(f"  CSL_METR_TRML_SEAL_KND_NQNT = {new_p_single.get('CSL_METR_TRML_SEAL_KND_NQNT')} (기대: 1)")
            print(f"  WHM_NO = {new_p_single.get('WHM_NO')} (기대: 99531111111)")
            print(f"  CREMO_WHM_NO = {new_p_single.get('CREMO_WHM_NO')} (기대: 99531111111)")
            print(f"  CMS_LAY_YMD = {new_p_single.get('CMS_LAY_YMD')} (기대: KST 오늘)")

        # --- 삼상 9955 검증 ---
        if detail_triple:
            print()
            print(f"[삼상 9955] 판별 테스트: meter_no=99551111111")
            code_t = meter_type_code("99551111111")
            three_t = is_three_phase("99551111111", str(detail_triple.get("CNTR_CLAS_CD", "")))
            print(f"  type_code={code_t}, is_three_phase={three_t} -> {'삼상' if three_t else '단상'} (기대: 삼상)")
            assert three_t, "삼상 9955 판별 실패"

            new_p_triple = build_new_payload_from_detail(
                new_meter_no="99551111111",
                detail=detail_triple,
                seal_val=seal_val,
                cons_tgt_seqno="5807924",
                dt=dt,
            )
            out_triple = out_dir / f"payload_4000_triple_{ts_str}.json"
            with open(out_triple, "w", encoding="utf-8") as f:
                json.dump(new_p_triple, f, ensure_ascii=False, indent=2)
            print(f"  출력: {out_triple}")
            print(f"  총 필드: {len(new_p_triple)}")
            print(f"  EX_WORK_STEP = {new_p_triple.get('EX_WORK_STEP')} (기대: 25)")
            print(f"  DREMO_PRDC_YM = {new_p_triple.get('DREMO_PRDC_YM')} (기대: getDetail값 201604)")
            print(f"  CNTR_CLAS_CD = {new_p_triple.get('CNTR_CLAS_CD')} (기대: 905)")
            print(f"  CONS_TGT_SEQNO = {new_p_triple.get('CONS_TGT_SEQNO')} (기대: 5807924)")
            print(f"  CSL_METR_TRML_SEAL_NO = {new_p_triple.get('CSL_METR_TRML_SEAL_NO')} (기대: {seal_val})")
            print(f"  CSL_METR_TRML_SEAL_NO2 = {new_p_triple.get('CSL_METR_TRML_SEAL_NO2')} (기대: {int(seal_val)+1} — 삼상)")
            print(f"  CSL_METR_TRML_SEAL_KND_NQNT = {new_p_triple.get('CSL_METR_TRML_SEAL_KND_NQNT')}")
            print(f"  [!] NQNT 영준님 확인: task지시=2, recording={rec_saverow_triple.get('CSL_METR_TRML_SEAL_KND_NQNT', 'N/A')}, 코드=1")
            print(f"  WHM_NO = {new_p_triple.get('WHM_NO')} (기대: 99551111111)")

            # recording 비교 diff
            if rec_saverow_triple:
                print()
                print("  --- recording Line 645 vs 생성 payload diff ---")
                diffs = diff_against_recording(new_p_triple, rec_saverow_triple, "삼상9955")
                if not diffs:
                    print("  차이 없음 (사진/날짜 필드 제외)")
                else:
                    for d in diffs:
                        print(d)

        print()
        print("[DRY-RUN 완료] getDetail 기반 신설 payload 생성 완료")
        print("push 하려면 --adb-pid 와 --push 플래그 사용")
        return

    # ---- 일반 모드: 기존 방식 호환 (CDP 또는 stub) ----
    print(f"[BUILD] 신설 payload (mobMtr4000 getDetail 기반): {args.new_meter}")
    print("  [!] CDP 없이는 getDetail 조회 불가 — stub payload 생성 불가")
    print("  --dry-run-recording 또는 --adb-pid 를 지정하세요.")

    # ---- 저장 (철거만) ----
    out5000 = out_dir / f"payload_5000_{ts_str}.json"
    with open(out5000, "w", encoding="utf-8") as f:
        json.dump(demo_payload, f, ensure_ascii=False, indent=2)
    print(f"\n[OUT] {out5000}")

    # ---- push ----
    if args.push:
        print("\n[PUSH] mobMtr5000/saveRow ...")
        res5 = _cdp_eval_raw(
            f"""
(async () => {{
    const fd = new FormData();
    const entries = {json.dumps(list(demo_payload.items()))};
    for (const [k, v] of entries) {{ fd.append(k, v); }}
    const _b64 = {json.dumps(_photo_b64(args.old_photo))};
    if (_b64) {{ const _bs=atob(_b64); const _a=new Uint8Array(_bs.length); for(let _i=0;_i<_bs.length;_i++)_a[_i]=_bs.charCodeAt(_i); fd.append('DREMO_ATCH_FILE_ID_3_SRC', new Blob([_a],{{type:'image/jpeg'}}), 'DREMO_ATCH_FILE_ID_3.jpg'); }}
    const r = await fetch('https://awms.kdn.com/ami/mob/mtr/mobMtr5000/saveRow', {{method:'POST', credentials:'include', body:fd}});
    return {{status: r.status, body: await r.text()}};
}})()
"""
        )
        print(f"  5000 응답: status={res5.get('status')} body={str(res5.get('body',''))[:200]}")

        # 철거 응답 consTgtSeqno → getDetail 조회 → 신설 payload
        try:
            cts = json.loads(res5.get("body", "{}")).get("consTgtSeqno")
            if cts:
                print(f"  -> consTgtSeqno={cts} → getDetail 조회 → 신설 payload 생성")
                cons_no_val = demo_payload.get("CONS_NO", "")
                cntr_no_val = demo_payload.get("CNTR_NO", "")
                detail_live = lookup_get_detail(
                    cons_no=cons_no_val,
                    cntr_no=cntr_no_val,
                    cons_tgt_seqno=str(cts),
                )
                mtrl_info = lookup_mtrl(args.new_meter)
                print(f"  selectMtrlUseYn: MNFCT_YM={mtrl_info.get('MNFCT_YM')!r} MTRL_NO={mtrl_info.get('MTRL_NO')}")
                new_payload = build_new_payload_from_detail(
                    new_meter_no=args.new_meter,
                    detail=detail_live,
                    seal_val=seal_val,
                    cons_tgt_seqno=str(cts),
                    mtrl_info=mtrl_info,
                    mfg_ym=args.mfg_ym,
                    dt=dt,
                )
            else:
                print("  ! 철거 응답에 consTgtSeqno 없음")
                return
        except Exception as e:
            print(f"  ! consTgtSeqno/getDetail 실패: {e}")
            return

        # checkBeforeSave
        try:
            chk = _cdp_eval_raw(
                "(async()=>{const r=await fetch('https://awms.kdn.com/ami/mob/mtr/mobMtr4000/checkBeforeSave"
                f"?HDQR_CD=3970&CONS_NO={new_payload.get('CONS_NO','')}&CONS_TGT_SEQNO={new_payload.get('CONS_TGT_SEQNO','')}'"
                ",{credentials:'include'});return {status:r.status, body:await r.text()};})()"
            )
            print(f"  checkBeforeSave: status={chk.get('status')} body={str(chk.get('body',''))[:80]}")
        except Exception as e:
            print(f"  checkBeforeSave 실패(무시): {e}")

        out4000 = out_dir / f"payload_4000_{ts_str}.json"
        with open(out4000, "w", encoding="utf-8") as f:
            json.dump(new_payload, f, ensure_ascii=False, indent=2)

        print("[PUSH] mobMtr4000/saveRow ...")
        res4 = _cdp_eval_raw(
            f"""
(async () => {{
    const fd = new FormData();
    const entries = {json.dumps(list(new_payload.items()))};
    for (const [k, v] of entries) {{ fd.append(k, v); }}
    const _b64 = {json.dumps(_photo_b64(args.new_photo))};
    if (_b64) {{ const _bs=atob(_b64); const _a=new Uint8Array(_bs.length); for(let _i=0;_i<_bs.length;_i++)_a[_i]=_bs.charCodeAt(_i); fd.append('CREMO_ATCH_FILE_ID_3_SRC', new Blob([_a],{{type:'image/jpeg'}}), 'CREMO_ATCH_FILE_ID_3.jpg'); }}
    const r = await fetch('https://awms.kdn.com/ami/mob/mtr/mobMtr4000/saveRow', {{method:'POST', credentials:'include', body:fd}});
    return {{status: r.status, body: await r.text()}};
}})()
"""
        )
        print(f"  4000 응답: status={res4.get('status')} body={str(res4.get('body',''))[:200]}")

        # 봉인 +수량: 신설 성공 후 8000/saveRow로 봉인 갱신 (단상+1 / 삼상+2). awms 자동 안 함.
        if str(res4.get("status")) == "200":
            try:
                inc = 2 if new_payload.get("CSL_METR_TRML_SEAL_NO2") else 1
                new_seal = str(int(str(seal_val).strip()) + inc)
                seal_body = {
                    "BATT_SEAL_KND_CD": "", "MTBX_SEAL_CNT_VAL": "",
                    "LV_CONS_NO": new_payload.get("CONS_NO", ""), "HV_CONS_NO": "",
                    "ETC_SEAL_VAL": "", "BATT_SEAL_CNT_VAL": "", "TRML_SEAL_KND_CD": "A",
                    "OTSD_SEAL_VAL": "", "ENCL_SEAL_VAL": "", "MTBX_SEAL_KND_CD": "",
                    "SIMPLE_YN": "N", "TRML_SEAL_CNT_VAL": "1", "METR_SEAL_VAL": new_seal,
                }
                sres = _cdp_eval_raw(
                    "(async()=>{const r=await fetch('https://awms.kdn.com/ami/mob/mtr/mobMtr8000/saveRow',"
                    "{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},"
                    "body:JSON.stringify(" + json.dumps(seal_body) + ")});return {s:r.status,b:await r.text()};})()"
                )
                print(f"  봉인 +{inc} 설정 ({seal_val}→{new_seal}): {sres}")
            except Exception as e:
                print(f"  봉인 설정 실패: {e}")
    else:
        print("\n[DRY-RUN 완료] --push 없이 실행 — saveRow POST 하지 않음")


if __name__ == "__main__":
    main()
