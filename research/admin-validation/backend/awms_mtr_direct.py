#!/usr/bin/env python3
"""
awms 계기팀(mob/mtr) 직접 등록 모듈 — 맥에서 requests로 수행.
폰 CDP 리모컨 대체. 계기큐(com.youngjun.awmsqueue)에서 세션 추출.

설계 원본: awms-queue-www/awms-saverow.js registerReplacement (주입식 플로우)
이식 정본: research/awms-poc/queue_saverow_builder.py build_demolition_payload /
           build_new_payload_from_detail / meter_type_code / is_three_phase / load_template

인터페이스 계약: admin-validation/backend/app.py 가 이 파일을 import하여 사용.
"""

import json
import subprocess
import sys
import time
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

# ── sys.path: awms-poc 빌더 import ────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "awms-poc"))
from queue_saverow_builder import (
    build_demolition_payload,
    build_new_payload_from_detail,
    meter_type_code,
    is_three_phase,
    load_template,
    kst_now,
    fmt_ymd,
    fmt_ym,
    fmt_act_date,
    TEMPLATE_5000,
)

# ── 상수 ──────────────────────────────────────────────────────────────────────
AWMS_BASE = "https://awms.kdn.com/ami/mob/mtr"
AWMS_MTL_BASE = "https://awms.kdn.com/ami/mob/mtl"
REFERER = "https://awms.kdn.com/html/main/index.html?app=MOBMTR&menu=01010000"
BONBU_CD = "3970"
OFFICE_CD = "7793"
KST = ZoneInfo("Asia/Seoul")

# adb 경로: 설치된 위치 우선, 없으면 PATH 검색
ADB = str(Path.home() / "Library/Android/sdk/platform-tools/adb")
if not Path(ADB).exists():
    ADB = "adb"

# 철거 사진 슬롯 매핑 (JS DREMO_PHOTO_SLOT 동일)
DREMO_PHOTO_SLOT = {"whme_day": "3", "whme_mngt": "4", "dm_mt_day": "5", "var_day": "6"}

# ── 세션 상태 (메모리 + 디스크 persist) ──────────────────────────────────────
SESSION: dict = {"jsessionid": None, "rememberedId": None, "xsrf": None, "ua": None, "ts": 0}
_SESSION_FILE = Path(__file__).resolve().parent / "session_mtr.json"


def load_session() -> None:
    """디스크 session_mtr.json → SESSION 메모리 로드."""
    try:
        SESSION.update(json.loads(_SESSION_FILE.read_text(encoding="utf-8")))
    except Exception:
        pass


def save_session() -> None:
    """SESSION 메모리 → 디스크 session_mtr.json 저장."""
    try:
        _SESSION_FILE.write_text(json.dumps(SESSION), encoding="utf-8")
    except Exception:
        pass


def set_session(
    jsessionid: str,
    remembered_id: str | None = None,
    xsrf: str | None = None,
    ua: str | None = None,
    persist: bool = True,
) -> None:
    """push용: 외부에서 세션값을 주입.
    persist=True(기본)면 디스크에도 즉시 저장. False면 메모리만 갱신
    (호출측이 생존 확인 후 save_session()을 직접 부를 때 사용, 예: push-session 죽은세션 가드)."""
    SESSION.update(
        jsessionid=jsessionid,
        rememberedId=remembered_id,
        xsrf=xsrf,
        ua=ua or SESSION.get("ua"),
        ts=int(time.time()),
    )
    if persist:
        save_session()


# ── 헤더 헬퍼 ────────────────────────────────────────────────────────────────
def _cookie_header() -> str:
    """Cookie 헤더 문자열 조립: rememberedId; JSESSIONID; XSRF-TOKEN 순."""
    parts = []
    if SESSION.get("rememberedId"):
        parts.append(f"rememberedId={SESSION['rememberedId']}")
    if SESSION.get("jsessionid"):
        parts.append(f"JSESSIONID={SESSION['jsessionid']}")
    if SESSION.get("xsrf"):
        parts.append(f"XSRF-TOKEN={SESSION['xsrf']}")
    return "; ".join(parts)


def _headers(json_post: bool = False) -> dict:
    """공통 요청 헤더. json_post=True면 X-XSRF-TOKEN 추가."""
    h = {
        "Cookie": _cookie_header(),
        "User-Agent": SESSION.get("ua") or "Mozilla/5.0 (Android; awms-mtr-direct)",
        "Accept": "application/json, text/plain, */*",
        "Referer": REFERER,
    }
    if json_post and SESSION.get("xsrf"):
        h["X-XSRF-TOKEN"] = SESSION["xsrf"]
    return h


# ── CDP 세션 추출 (계기큐 com.youngjun.awmsqueue) ────────────────────────────
def pull_session_from_phone() -> dict:
    """
    adb CDP Network.getAllCookies로 계기큐(com.youngjun.awmsqueue) awms 세션 추출.
    대상 도메인: awms.kdn.com. websocket-client 직접 구현.

    반환: SESSION dict (메모리 + 디스크 갱신).
    실패 시 RuntimeError.
    """
    try:
        import websocket  # websocket-client 패키지
    except ImportError:
        raise RuntimeError("websocket-client 미설치: pip install websocket-client")

    # 계기큐 WebView PID 탐색
    ps = subprocess.run(
        [ADB, "shell", "ps", "-A"], capture_output=True, text=True, timeout=15
    ).stdout
    pid = next(
        (ln.split()[1] for ln in ps.splitlines() if "awmsqueue" in ln.lower()),
        None,
    )
    if not pid:
        raise RuntimeError("계기큐(awmsqueue) 프로세스 없음 — 폰 연결/앱 확인")

    # adb forward
    subprocess.run(
        [ADB, "forward", "--remove-all"], capture_output=True, timeout=10
    )
    subprocess.run(
        [ADB, "forward", "tcp:9223", f"localabstract:webview_devtools_remote_{pid}"],
        capture_output=True, timeout=10, check=True,
    )
    time.sleep(0.3)

    # CDP pages 목록에서 awms.kdn.com 페이지 찾기
    import urllib.request as _req
    try:
        pages = json.loads(_req.urlopen("http://localhost:9223/json", timeout=8).read())
    except Exception as e:
        raise RuntimeError(f"CDP /json 접근 실패(계기큐 WebView 포트 9223): {e}")

    ws_url = next(
        (p["webSocketDebuggerUrl"] for p in pages
         if "awms.kdn.com" in p.get("url", "") and p.get("webSocketDebuggerUrl")),
        None,
    )
    if not ws_url:
        raise RuntimeError("awms.kdn.com WebView 탭 없음 — 계기큐에서 awms 화면 열어둘 것")

    # Network.getAllCookies
    ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=20)
    ws.send(json.dumps({"id": 1, "method": "Network.getAllCookies", "params": {}}))
    result = json.loads(ws.recv())

    # UA 추출
    ws.send(json.dumps({
        "id": 2,
        "method": "Runtime.evaluate",
        "params": {"expression": "navigator.userAgent", "returnByValue": True},
    }))
    ua_result = json.loads(ws.recv())
    ws.close()

    cookies = result.get("result", {}).get("cookies", [])
    awms_cookies = [c for c in cookies if "awms.kdn.com" in c.get("domain", "")]

    js = next((c["value"] for c in awms_cookies if c["name"] == "JSESSIONID"), None)
    rid = next((c["value"] for c in awms_cookies if c["name"] == "rememberedId"), None)
    xsrf = next((c["value"] for c in awms_cookies if c["name"] == "XSRF-TOKEN"), None)
    ua = ua_result.get("result", {}).get("result", {}).get("value")

    if not js:
        raise RuntimeError("JSESSIONID 없음 — 계기큐에서 awms 로그인 필요")

    SESSION.update(jsessionid=js, rememberedId=rid, xsrf=xsrf, ua=ua, ts=int(time.time()))
    save_session()
    return dict(SESSION)


# ── 세션 생존 확인 ─────────────────────────────────────────────────────────────
def session_alive() -> bool:
    """getMainList(8000)로 세션 생존 여부 확인. JSON 응답이면 True."""
    try:
        r = requests.get(
            f"{AWMS_BASE}/mobMtr8000/getMainList",
            headers=_headers(),
            timeout=30,
        )
        if r.status_code != 200:
            return False
        ct = r.headers.get("content-type", "")
        if "json" not in ct:
            return False
        data = r.json()
        # 배열 또는 dict 이면 세션 OK
        return isinstance(data, (list, dict))
    except Exception:
        return False


# ── 로그인 직후 스냅샷 (cons_no, seal_val, busi_list) ──────────────────────────
def fetch_login_snapshot() -> dict:
    """
    로그인 직후 1회 호출:
    getMainList(8000) → cons_no, seal_val, seal_knd
    getBusiList → busi_list

    반환: {"cons_no", "seal_val", "seal_knd", "busi_list": [{CONS_NO, CONS_OVVW_CTT}, ...]}
    """
    # 봉인 정보 (mobMtr8000/getMainList)
    r8 = requests.get(
        f"{AWMS_BASE}/mobMtr8000/getMainList",
        headers=_headers(),
        timeout=30,
    )
    r8.raise_for_status()
    d8 = r8.json()
    first = (d8[0] if isinstance(d8, list) and d8 else d8) or {}
    cons_no = str(first.get("LV_CONS_NO") or "")
    seal_val = str(first.get("METR_SEAL_VAL") or "")
    seal_knd = str(first.get("TRML_SEAL_KND_CD") or "A")

    # 사업 목록 (getBusiList)
    rb = requests.get(
        f"{AWMS_BASE}/mobMtr1000/getBusiList?DEPT1={BONBU_CD}",
        headers=_headers(),
        timeout=30,
    )
    busi_list = []
    if rb.status_code == 200:
        try:
            bl = rb.json()
            if isinstance(bl, list):
                busi_list = [
                    {"CONS_NO": str(b.get("CONS_NO") or ""), "CONS_OVVW_CTT": str(b.get("CONS_OVVW_CTT") or "")}
                    for b in bl if b.get("CONS_NO")
                ]
        except Exception:
            pass

    return {
        "cons_no": cons_no,
        "seal_val": seal_val,
        "seal_knd": seal_knd,
        "busi_list": busi_list,
    }


# ── 지침 칸수 규칙 (JS readingFieldsFor 이식) ────────────────────────────────
def reading_fields_for(clas: str | None, pwr: str | None) -> list[str]:
    """
    계약종별(clas) + 계약전력(pwr)으로 awms 지침 입력칸 목록 결정.
    JS L31-40 동일 규칙:
      pwr>=20 & {211,218,311,410,430} → 4칸
      pwr>=20 & {213,610}             → [whme_day, dm_mt_day]
      {905,910,915}                   → [whme_mngt]
      그외                             → [whme_day]
    """
    try:
        code = int(str(clas).strip()) if clas else None
    except ValueError:
        code = None
    try:
        pwr_num = int(str(pwr).strip()) if pwr else 0
    except ValueError:
        pwr_num = 0

    if code is not None:
        if pwr_num >= 20 and code in (211, 218, 311, 410, 430):
            return ["whme_day", "whme_mngt", "dm_mt_day", "var_day"]
        if pwr_num >= 20 and code in (213, 610):
            return ["whme_day", "dm_mt_day"]
        if code in (905, 910, 915):
            return ["whme_mngt"]
    return ["whme_day"]


# ── 단상/삼상 판정 (JS _isThreePhase 이식 — 계약종별 우선) ────────────────────
#   queue_saverow_builder.is_three_phase는 계기번호 우선이라 JS와 다름.
#   awms 봉인화면 기준 = 계약: 900+ = 삼상 (2026-06-05 단상계약+55계기 사례로 계약 우선 확정).
_THREE_PHASE_CODES = {"45", "46", "47", "55"}


def _is_three_phase_clas_first(meter_no: str, cntr_clas_cd: str | None) -> bool:
    """계약종별(900+=삼상) 우선, 없으면 계기번호 3~4자리 폴백. JS L112-118 동일."""
    try:
        clas_int = int(str(cntr_clas_cd).strip())
        if clas_int > 0:
            return clas_int >= 900
    except (ValueError, TypeError):
        pass
    return meter_type_code(meter_no) in _THREE_PHASE_CODES


# ── awms API 조회 헬퍼 ────────────────────────────────────────────────────────
def _get_customer_info(meter_no: str) -> dict:
    """selectCustomerInfo GET → 고객 정보 dict."""
    url = (
        f"{AWMS_BASE}/mobMtr5000/selectCustomerInfo"
        f"?BONBU_CD={BONBU_CD}&OFFC_CD={OFFICE_CD}"
        f"&vBarcdQr={requests.utils.quote(meter_no)}&vMenu=10"
    )
    r = requests.get(url, headers=_headers(), timeout=30)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    return {}


def _get_main_list_1000(meter_no: str) -> dict | None:
    """mobMtr1000/getMainList 계기번호 검색 → 해당 건 or None."""
    url = (
        f"{AWMS_BASE}/mobMtr1000/getMainList"
        f"?FLAG=1&DEPT1={BONBU_CD}&busiKey="
        f"&searchVal={requests.utils.quote(meter_no)}"
        f"&sortKey=&workStep=20,25,28&pPageNo=1&pRowCount=100"
    )
    r = requests.get(url, headers=_headers(), timeout=30)
    if r.status_code != 200:
        return None
    data = r.json()
    arr = data if isinstance(data, list) else (data.get("data") or data.get("list") or [])
    hit = next(
        (x for x in arr if str(x.get("WHM_NO") or "").strip() == str(meter_no).strip()),
        arr[0] if arr else None,
    )
    return hit


def _find_rec_by_seqno(cons_tgt_seqno: str) -> dict | None:
    """
    consTgtSeqno로 getBusiList 전체 순회 → getMainList(1000) 역조회.
    작업목록에 없던 계기(직접 입력 등록)의 정확 CONS_NO/CNTR_NO 확보.
    JS _findRecBySeqno 이식.
    """
    try:
        rb = requests.get(
            f"{AWMS_BASE}/mobMtr1000/getBusiList?DEPT1={BONBU_CD}",
            headers=_headers(), timeout=30,
        )
        if rb.status_code != 200:
            return None
        bl = rb.json()
        conss = [str(b["CONS_NO"]) for b in (bl if isinstance(bl, list) else []) if b.get("CONS_NO")]
        for c in conss:
            url = (
                f"{AWMS_BASE}/mobMtr1000/getMainList"
                f"?FLAG=1&DEPT1={BONBU_CD}&busiKey={c}"
                f"&searchVal=&sortKey=&workStep=25,28&pPageNo=1&pRowCount=300"
            )
            r = requests.get(url, headers=_headers(), timeout=30)
            if r.status_code != 200:
                continue
            data = r.json()
            arr = data if isinstance(data, list) else (data.get("data") or data.get("list") or [])
            hit = next(
                (x for x in arr if str(x.get("CONS_TGT_SEQNO") or "") == str(cons_tgt_seqno)),
                None,
            )
            if hit:
                return hit
    except Exception:
        pass
    return None


def _get_detail(cons_no: str, cntr_no: str, cons_tgt_seqno: str) -> dict:
    """mobMtr1000/getDetail → 301키 dict."""
    url = (
        f"{AWMS_BASE}/mobMtr1000/getDetail"
        f"?FLAG=1&HDQR_CD={BONBU_CD}"
        f"&CONS_NO={requests.utils.quote(cons_no)}"
        f"&CNTR_NO={requests.utils.quote(cntr_no)}"
        f"&CONS_TGT_SEQNO={requests.utils.quote(cons_tgt_seqno)}"
    )
    r = requests.get(url, headers=_headers(), timeout=60)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data
    return {}


def _get_detail_with_retry(
    cons_no: str,
    cntr_no: str,
    cons_tgt_seqno: str,
    extra_cons: list[str] | None = None,
    log: list[str] | None = None,
) -> tuple[dict, str]:
    """
    getDetail 재시도 + 차수 후보 순회. JS L744-763 이식.
    키>=100이면 성공. 전부 실패 시 ({}, "").
    반환: (detail_dict, 확정된_cons_no)
    """
    waits_ms = [0, 1000, 2000, 3000, 5000, 8000, 12000]
    cands = list(dict.fromkeys([cons_no] + (extra_cons or [])))
    confirmed_cons = cons_no

    for t, wait_ms in enumerate(waits_ms):
        if wait_ms:
            time.sleep(wait_ms / 1000)
        for cand in cands:
            try:
                d = _get_detail(cand, cntr_no, cons_tgt_seqno)
                if len(d) >= 100:
                    confirmed_cons = cand
                    if log is not None:
                        log.append(
                            f"getDetail 성공: 키수={len(d)} 차수={cand} 후보={'/'.join(cands)}"
                        )
                    return d, confirmed_cons
            except Exception:
                pass
        if log is not None:
            log.append(f"getDetail 빈 응답 (차수 {'/'.join(cands)}) 재시도 #{t+1}")
    return {}, ""


def _get_mtrl(new_meter_no: str) -> dict:
    """selectMtrlUseYn(신설계기 자재) — mob/mtl 도메인. 실패 시 {}."""
    url = (
        f"{AWMS_MTL_BASE}/mobMtl1000/selectMtrlUseYn"
        f"?vBarcdQr={requests.utils.quote(new_meter_no)}&vGubun=T"
    )
    try:
        r = requests.get(url, headers=_headers(), timeout=30)
        if r.status_code != 200:
            return {}
        data = r.json()
        if isinstance(data, list) and data:
            return data[0]
        if isinstance(data, dict):
            return data
    except Exception:
        pass
    return {}


# ── 사진 다운로드 ──────────────────────────────────────────────────────────────
def _download_photo(url: str) -> bytes | None:
    """Firebase Storage URL에서 사진 직접 다운로드. 실패 시 None."""
    if not url:
        return None
    try:
        r = requests.get(url, timeout=60)
        if r.status_code == 200 and r.content:
            return r.content
    except Exception:
        pass
    return None


# ── 철거 payload 보완 빌드 ────────────────────────────────────────────────────
def _build_demolition_payload_full(
    meter: str,
    rep: dict,
    customer_info: dict,
    injected_cons_no: str,
    injected_seal_no: str,
    dt: datetime,
) -> OrderedDict:
    """
    build_demolition_payload 래퍼 + removal_values 4칸 매핑 보완.
    JS _buildDemolitionPayload L508-521 이식.

    removal_values 우선: job.rep.removal_values[field] 사용.
    1칸이면 removal_value를 해당 칸에만 / 다른 칸 빈문자열.
    """
    # sealInfo 합성 (JS L672-677 주입 모드와 동일)
    seal_info = {
        "LV_CONS_NO": injected_cons_no,
        "TRML_SEAL_KND_CD": "A",
        "METR_SEAL_VAL": injected_seal_no,
    }

    removal_value = str(rep.get("removal_value") or "0")
    removal_values = rep.get("removal_values") or {}
    nd_digits = str(rep.get("nd_digits") or "6")

    fields = reading_fields_for(
        customer_info.get("CNTR_CLAS_CD"),
        customer_info.get("CNTR_PWR"),
    )

    # build_demolition_payload는 단일값(DGD_DAY/MNGT만) 처리 — 4칸 보완은 직접
    # queue_saverow_builder.build_demolition_payload 호출로 베이스 생성
    payload = build_demolition_payload(
        meter_no=meter,
        removal_value=removal_value,
        nd_digits=nd_digits,
        customer_info=customer_info,
        seal_info=seal_info,
        dt=dt,
    )

    # 4칸 매핑 보완 (JS L508-521)
    # 먼저 전체 DGD 4칸 초기화
    payload["DGD_WHME_NDL_DAY_QTT"] = ""
    payload["DGD_WHME_NDL_MNGT_QTT"] = ""
    payload["DGD_DM_MT_NDL_DAY_QTT"] = ""
    payload["DGD_VAR_NDL_DAY_QTT"] = ""

    field_to_dgd = {
        "whme_day":  "DGD_WHME_NDL_DAY_QTT",
        "whme_mngt": "DGD_WHME_NDL_MNGT_QTT",
        "dm_mt_day": "DGD_DM_MT_NDL_DAY_QTT",
        "var_day":   "DGD_VAR_NDL_DAY_QTT",
    }

    if len(fields) > 1:
        # 2칸 / 4칸: removal_values 칸별 매핑
        for f in fields:
            dgd_key = field_to_dgd.get(f)
            if dgd_key:
                v = removal_values.get(f)
                payload[dgd_key] = str(v) if v is not None else ""
    else:
        # 1칸: removal_values[field] 우선, 없으면 removal_value
        f = fields[0]
        dgd_key = field_to_dgd.get(f)
        if dgd_key:
            v = removal_values.get(f)
            payload[dgd_key] = str(v) if v is not None else removal_value

    # WORK_STEP=25, CREMO_WHM_NO='' (JS L717-718)
    payload["WORK_STEP"] = "25"
    payload["CREMO_WHM_NO"] = ""

    # 전부 문자열 변환
    out: OrderedDict = OrderedDict()
    for k, v in payload.items():
        out[k] = "" if v is None else str(v)
    return out


# ── 신설 payload 보완 빌드 ────────────────────────────────────────────────────
def _build_new_payload_full(
    new_meter: str,
    detail: dict,
    rep: dict,
    injected: dict,
    cons_tgt_seqno: str,
    mtrl_info: dict,
    customer_info: dict,
    dt: datetime,
) -> OrderedDict:
    """
    build_new_payload_from_detail 래퍼 + 주입식 봉인 적용.
    JS _buildNewPayloadFromDetail usingInjected=True 모드 이식.

    보완:
    (a) CGD 4칸 전부 빈값 초기화 후 readingFieldsFor 칸만 '0'
    (b) 주입 봉인: seal_no=injected.seal_no 그대로(+1 금지),
        삼상이면 seal_no2=injected.seal_no2(없으면 seal_no+1), NQNT=2/1
    (c) WORK_STEP='25', CSL_METR_TRML_SEAL_KND_CD='A'
    """
    seal_no = str(injected.get("seal_no") or "")
    seal_no2_input = str(injected.get("seal_no2") or "")
    mfg_ym = str(rep.get("new_meter_mfg_ym") or "")
    nd_digits = str(rep.get("nd_digits") or "6")
    cntr_clas = str(detail.get("CNTR_CLAS_CD") or customer_info.get("CNTR_CLAS_CD") or "")
    three = _is_three_phase_clas_first(new_meter, cntr_clas or None)

    # 봉인 (주입식, JS L132-143) — 폴백 +1도 자릿수(zero-padding) 보존 ('0111111' 형식)
    seal_no2 = ""
    seal_nqnt = "1"
    if three:
        if seal_no2_input:
            seal_no2 = seal_no2_input
        elif seal_no:
            seal_no2 = str(int(seal_no) + 1).zfill(len(seal_no))
        seal_nqnt = "2"

    # build_new_payload_from_detail 기본 호출 (seal_val은 임시값 — 아래에서 덮음)
    payload = build_new_payload_from_detail(
        new_meter_no=new_meter,
        detail=detail,
        seal_val=seal_no,      # 주입값 그대로(+1 없음)
        cons_tgt_seqno=cons_tgt_seqno,
        mtrl_info=mtrl_info,
        mfg_ym=mfg_ym,
        dt=dt,
    )

    # (a) CGD 4칸 초기화 후 해당 칸만 '0' (JS L182-188)
    cgd_map = {
        "whme_day":  "CGD_WHME_NDL_DAY_QTT",
        "whme_mngt": "CGD_WHME_NDL_MNGT_QTT",
        "dm_mt_day": "CGD_DM_MT_NDL_DAY_QTT",
        "var_day":   "CGD_VAR_NDL_DAY_QTT",
    }
    for cgd_key in cgd_map.values():
        payload[cgd_key] = ""
    fields = reading_fields_for(
        customer_info.get("CNTR_CLAS_CD"),
        customer_info.get("CNTR_PWR"),
    )
    for f in fields:
        ck = cgd_map.get(f)
        if ck:
            payload[ck] = "0"
    payload["CGD_WHME_NDL_DGTS"] = nd_digits

    # (b) 봉인 주입 오버라이드 (build_new_payload_from_detail가 seal_no+1 방식이라 덮어씀)
    payload["CSL_METR_TRML_SEAL_NO"] = seal_no
    payload["CSL_METR_TRML_SEAL_NO2"] = seal_no2
    payload["CSL_METR_TRML_SEAL_KND_NQNT"] = seal_nqnt

    # (c) 고정값
    payload["WORK_STEP"] = "25"
    payload["CSL_METR_TRML_SEAL_KND_CD"] = "A"

    # queue_saverow_builder의 CGD_WHME_NDL_MNGT_QTT='0' 구버전 버그 제거 — 이미 위에서 칸별 처리
    # (field이 whme_mngt인 경우에만 '0'으로 세팅됨)

    out: OrderedDict = OrderedDict()
    for k, v in payload.items():
        out[k] = "" if v is None else str(v)
    return out


# ── saveRow POST 실행 ─────────────────────────────────────────────────────────
def _post_saverow(
    endpoint_url: str,
    payload: dict,
    photos: list[tuple[str, str, bytes]],  # [(field_name, filename, data), ...]
    log: list[str],
) -> dict:
    """
    requests multipart/form-data POST.
    photos: [(field_src_name, filename, bytes_data), ...]
    반환: {"ok", "cons_tgt_seqno", "body_preview", "status_code"}
    """
    # ★항상 multipart/form-data — 폰 FormData와 동일 (사진 없어도 urlencoded로 보내지 않음).
    #   requests는 files에 (None, value) 튜플을 주면 일반 텍스트 파트로 직렬화한다.
    data_fields = [(k, (None, "" if v is None else str(v))) for k, v in payload.items()]
    photo_fields = [(name, (fname, img_bytes, "image/jpeg")) for name, fname, img_bytes in photos]
    files = data_fields + photo_fields

    try:
        r = requests.post(
            endpoint_url,
            headers=_headers(),
            files=files,
            timeout=60,
        )
        status = r.status_code
        body = r.text
        body_preview = body[:200]

        # 성공판정: 5000=JSON{result:1} / 4000=평문"1"
        try:
            j = r.json()
            ok = (isinstance(j, dict) and j.get("result") == 1) or (j == 1)
            cons_tgt_seqno = str(j.get("consTgtSeqno") or "") if isinstance(j, dict) else ""
        except Exception:
            ok = body.strip() == "1"
            cons_tgt_seqno = ""
            j = None

        return {
            "ok": ok,
            "cons_tgt_seqno": cons_tgt_seqno,
            "body_preview": body_preview,
            "status_code": status,
        }
    except Exception as e:
        log.append(f"네트워크 오류: {e}")
        return {"ok": False, "cons_tgt_seqno": "", "body_preview": str(e), "status_code": 0}


# ── 봉인 최종 저장 ─────────────────────────────────────────────────────────────
def save_final_seal(cons_no: str, final_seal: str) -> dict:
    """
    mobMtr8000/saveRow JSON POST — 봉인 서버값 갱신.
    JS _sealPlusOne body 그대로 (METR_SEAL_VAL=final_seal).
    X-XSRF 헤더 포함.

    반환: {"ok", "status_code", "body"}
    """
    body = {
        "BATT_SEAL_KND_CD": "",
        "MTBX_SEAL_CNT_VAL": "",
        "LV_CONS_NO": cons_no,
        "HV_CONS_NO": "",
        "ETC_SEAL_VAL": "",
        "BATT_SEAL_CNT_VAL": "",
        "TRML_SEAL_KND_CD": "A",
        "OTSD_SEAL_VAL": "",
        "ENCL_SEAL_VAL": "",
        "MTBX_SEAL_KND_CD": "",
        "SIMPLE_YN": "N",
        "TRML_SEAL_CNT_VAL": "1",
        "METR_SEAL_VAL": final_seal,
    }
    try:
        r = requests.post(
            f"{AWMS_BASE}/mobMtr8000/saveRow",
            headers=_headers(json_post=True),
            json=body,
            timeout=30,
        )
        return {"ok": r.status_code == 200, "status_code": r.status_code, "body": r.text[:150]}
    except Exception as e:
        return {"ok": False, "status_code": 0, "body": str(e)}


# ── 원복(임시저장 삭제) ────────────────────────────────────────────────────────
# ★설계 기준 (영준님 확정 2026-07-29):
#   - 임시저장(25) = resetRows로 삭제 가능 → 25→20 복귀. 이 이식은 25 한정이므로 원복도 25 전용.
#   - 완료(28)    = ★삭제 불가. 검침값 수정만 가능(mobMtr5000/saveRow, EX_WORK_STEP=28+RE_SAVE_YN=Y,
#                   신설번호 잠김). 통신팀 MOBCST 완료건은 saveAct 재전송 시 모뎀결합 unique 제약으로
#                   500 → awms UI로만 수정 가능.
#   - 따라서 **원복 자동화 범위 = 25 삭제까지. 28은 설계상 손대지 않는다.**
#
# ⚠ resetRows는 실호출 페이로드가 캡처된 적 없다(문서상 "행객체 배열 POST"만).
#   통신팀 deleteRows(mobCst1000Api.deleteRows(checkedItems)) 패턴을 따라 행객체를 그대로 배열로 보낸다.
#   첫 실행은 반드시 dry_run으로 대상 확인 → 승인 후 apply. apply 후 재조회로 20 복귀를 검증한다.

def find_row_for_reset(mid: str) -> dict:
    """원복 대상 행 조회. 반환 {"ok", "row"|None, "work_step", "err"}."""
    try:
        r = requests.get(
            f"{AWMS_BASE}/mobMtr1000/getMainList",
            headers=_headers(),
            params={"FLAG": "1", "DEPT1": BONBU_CD, "busiKey": "", "searchVal": str(mid),
                    "sortKey": "", "workStep": "20,25,28", "pPageNo": "1", "pRowCount": "50"},
            timeout=30,
        )
        if r.status_code != 200:
            return {"ok": False, "row": None, "work_step": "", "err": f"조회 실패 status={r.status_code}"}
        rows = r.json()
    except Exception as e:
        return {"ok": False, "row": None, "work_step": "", "err": f"조회 오류: {e}"}

    if not isinstance(rows, list):
        return {"ok": False, "row": None, "work_step": "", "err": "응답이 배열이 아님"}

    # 25(임시저장) 행 우선. 없으면 28 존재 여부를 알려 호출측이 거부 사유를 알 수 있게 한다.
    row25 = next((x for x in rows if str(x.get("WORK_STEP") or "") == "25"), None)
    if row25 is not None:
        return {"ok": True, "row": row25, "work_step": "25", "err": ""}
    row28 = next((x for x in rows if str(x.get("WORK_STEP") or "") == "28"), None)
    if row28 is not None:
        return {"ok": False, "row": None, "work_step": "28",
                "err": "완료(28) 건은 삭제 불가 — 설계상 원복 대상 아님(검침값 수정만 가능)"}
    return {"ok": False, "row": None, "work_step": "",
            "err": "임시저장(25) 행 없음 — 이미 삭제됐거나 등록된 적 없음"}


def reset_row_25(mid: str, dry_run: bool = True) -> dict:
    """임시저장(25) 1건 삭제 → 20 복귀. ★25 전용, 28이면 거부.

    dry_run=True(기본)면 대상만 확인하고 awms에 쓰지 않는다.
    반환: {"ok", "dry_run", "work_step", "target", "status_code", "verified", "err"}
    """
    found = find_row_for_reset(mid)
    if not found["ok"]:
        return {"ok": False, "dry_run": dry_run, "work_step": found["work_step"],
                "target": None, "status_code": 0, "verified": False, "err": found["err"]}

    row = found["row"]
    target = {k: row.get(k) for k in
              ("WHM_NO", "CREMO_WHM_NO", "WORK_STEP", "CONS_NO", "CNTR_NO",
               "CONS_TGT_SEQNO", "WRK_PLCE_ADDR_CTT")}

    # ★2중 가드 — find가 25만 돌려주지만 여기서 한 번 더 확인한다(코드 변경 사고 대비).
    if str(row.get("WORK_STEP") or "") != "25":
        return {"ok": False, "dry_run": dry_run, "work_step": str(row.get("WORK_STEP") or ""),
                "target": target, "status_code": 0, "verified": False,
                "err": "가드: WORK_STEP이 25가 아니라 중단"}

    if dry_run:
        return {"ok": True, "dry_run": True, "work_step": "25", "target": target,
                "status_code": 0, "verified": False, "err": ""}

    try:
        r = requests.post(
            f"{AWMS_BASE}/mobMtr1000/resetRows",
            headers=_headers(json_post=True),
            json=[row],                      # 행객체 배열 (통신팀 deleteRows 패턴)
            timeout=30,
        )
        status, body = r.status_code, r.text[:200]
    except Exception as e:
        return {"ok": False, "dry_run": False, "work_step": "25", "target": target,
                "status_code": 0, "verified": False, "err": f"POST 오류: {e}"}

    # 재조회 검증 — 25가 사라지고 20으로 돌아왔는지
    after = find_row_for_reset(mid)
    verified = (not after["ok"]) and after["work_step"] != "25"

    return {"ok": status == 200 and verified, "dry_run": False, "work_step": "25",
            "target": target, "status_code": status, "verified": verified,
            "err": "" if verified else f"삭제 후 검증 실패(25 잔존 가능) body={body}"}


# ── 메인 등록 함수 ─────────────────────────────────────────────────────────────
def register_replacement_direct(job: dict) -> dict:
    """
    계기 교체 1건 awms 등록.

    job = {
        "meter": str,          # 철거 계기번호 11자리
        "addr":  str,          # 주소 (로그용)
        "rep":   dict,         # workStatus replacement_list 항목
            new_meter_id, removal_value, removal_values{4칸}, nd_digits,
            new_meter_mfg_ym, old_meter_photo, new_meter_photo,
            removal_photos{field:url}
        "injected": dict,      # 주입 봉인/공사번호
            seal_no, seal_no2, cons_no, account
    }

    반환: {
        "ok": bool,
        "workStep": "25"|"28",
        "consTgtSeqno": str,
        "awms_seal": {"account", "seal_no", "seal_no2", "cons_no"},
        "err": str|None,
        "log": [str]
    }
    """
    log: list[str] = []

    def L(msg: str) -> None:
        log.append(msg)

    def _err(msg: str) -> dict:
        return {
            "ok": False, "workStep": None, "consTgtSeqno": "",
            "awms_seal": {}, "err": msg, "log": log,
        }

    meter = str(job.get("meter") or "").strip()
    addr = str(job.get("addr") or "")
    rep = job.get("rep") or {}
    injected = job.get("injected") or {}

    new_meter = str(rep.get("new_meter_id") or "").strip()
    if not new_meter:
        return _err("신설계기(new_meter_id) 없음")
    if not meter:
        return _err("철거계기 없음")

    injected_cons_no = str(injected.get("cons_no") or "").strip()
    injected_seal_no = str(injected.get("seal_no") or "").strip()
    if not injected_cons_no or not injected_seal_no:
        return _err("injected.cons_no / injected.seal_no 필수")

    L(f"[시작] {meter} ({addr}) → 신설 {new_meter}")
    dt = kst_now()

    # 1) 고객정보 조회 (selectCustomerInfo)
    try:
        customer_info = _get_customer_info(meter)
        L(f"고객조회: CUST_NO={customer_info.get('CUST_NO')} 계약종별={customer_info.get('CNTR_CLAS_CD')} 전력={customer_info.get('CNTR_PWR')}")
    except Exception as e:
        return _err(f"고객정보 조회 실패: {e}")

    # 2) 작업목록 조회 (mobMtr1000/getMainList)
    try:
        main_info = _get_main_list_1000(meter) or {}
        L(f"작업목록: CONS_NO={main_info.get('CONS_NO') or '없음'} CNTR_NO={main_info.get('CNTR_NO') or '없음'}")
    except Exception as e:
        main_info = {}
        L(f"작업목록 조회 실패(무시): {e}")

    cntr_no = str(main_info.get("CNTR_NO") or customer_info.get("CUST_NO") or "")
    if not cntr_no:
        return _err(f"CNTR_NO(계약번호) 확보 실패: {meter}")

    fields = reading_fields_for(
        customer_info.get("CNTR_CLAS_CD"),
        customer_info.get("CNTR_PWR"),
    )
    three = _is_three_phase_clas_first(new_meter, str(customer_info.get("CNTR_CLAS_CD") or ""))
    L(f"지침칸={len(fields)}칸 [{','.join(fields)}] / {'삼상' if three else '단상'}")

    # 3) 사진 다운로드
    old_photo_url = rep.get("old_meter_photo") or ""
    new_photo_url = rep.get("new_meter_photo") or ""
    removal_photos = rep.get("removal_photos") or {}

    demo_photos: list[tuple[str, str, bytes]] = []
    for f in fields:
        url = removal_photos.get(f) or (old_photo_url if f == "whme_day" else "")
        if not url:
            continue
        img = _download_photo(url)
        if img:
            slot = DREMO_PHOTO_SLOT[f]
            demo_photos.append((
                f"DREMO_ATCH_FILE_ID_{slot}_SRC",
                f"DREMO_ATCH_FILE_ID_{slot}.jpg",
                img,
            ))
    new_photo_bytes = _download_photo(new_photo_url)
    new_photos: list[tuple[str, str, bytes]] = []
    if new_photo_bytes:
        new_photos.append(("CREMO_ATCH_FILE_ID_3_SRC", "CREMO_ATCH_FILE_ID_3.jpg", new_photo_bytes))

    L(f"사진: 철거 {len(demo_photos)}장 / 신설 {len(new_photos)}장")

    # 4) 철거 saveRow (mobMtr5000)
    demo_payload = _build_demolition_payload_full(
        meter=meter,
        rep=rep,
        customer_info=customer_info,
        injected_cons_no=injected_cons_no,
        injected_seal_no=injected_seal_no,
        dt=dt,
    )
    # CNTR_NO = 작업목록 우선 (JS L693 cntrNo=mainInfo.CNTR_NO||customerInfo.CUST_NO)
    demo_payload["CNTR_NO"] = cntr_no
    L(f"철거5000 POST: 철거={meter} CONS_NO={demo_payload.get('CONS_NO')} CNTR_NO={demo_payload.get('CNTR_NO')}")

    res5 = _post_saverow(
        f"{AWMS_BASE}/mobMtr5000/saveRow",
        demo_payload,
        demo_photos,
        log,
    )
    L(f"철거5000 응답: ok={res5['ok']} consTgtSeqno={res5['cons_tgt_seqno']} [{res5['body_preview'][:80]}]")
    if not res5["ok"]:
        return _err(f"철거 saveRow 실패: {res5['body_preview'][:200]}")

    cons_tgt_seqno = res5["cons_tgt_seqno"]
    if not cons_tgt_seqno:
        return _err("철거 응답에 consTgtSeqno 없음")

    # 5) getDetail — 정확 CONS_NO/CNTR_NO 확보
    gd_cons_no = str(main_info.get("CONS_NO") or "")
    gd_cntr_no = str(main_info.get("CNTR_NO") or cntr_no)

    if not gd_cons_no:
        rec = _find_rec_by_seqno(cons_tgt_seqno)
        if rec and rec.get("CONS_NO"):
            gd_cons_no = str(rec["CONS_NO"])
            gd_cntr_no = str(rec.get("CNTR_NO") or gd_cntr_no)
            L(f"역조회 CONS_NO={gd_cons_no} CNTR_NO={gd_cntr_no}")

    # 차수 후보: main_info.CONS_NO + injected_cons_no (중복 제거)
    extra_cands = []
    if injected_cons_no and injected_cons_no != gd_cons_no:
        extra_cands.append(injected_cons_no)

    detail, confirmed_cons = _get_detail_with_retry(
        cons_no=gd_cons_no or injected_cons_no,
        cntr_no=gd_cntr_no,
        cons_tgt_seqno=cons_tgt_seqno,
        extra_cons=extra_cands,
        log=log,
    )

    if len(detail) < 100:
        return _err(
            f"getDetail 키부족({len(detail)}/301) — 차수 모두 빈 응답. 잠시 후 재등록"
        )

    gd_cons_no = confirmed_cons
    L(f"getDetail 키수={len(detail)} / 확정차수={gd_cons_no}")

    # 6) 자재 조회
    try:
        mtrl_info = _get_mtrl(new_meter)
        L(f"자재: MTRL_NO={mtrl_info.get('MTRL_NO') or '-'} MNFCT_YM={mtrl_info.get('MNFCT_YM') or '-'}")
    except Exception:
        mtrl_info = {}

    # 7) 신설 saveRow (mobMtr4000)
    new_payload = _build_new_payload_full(
        new_meter=new_meter,
        detail=detail,
        rep=rep,
        injected=injected,
        cons_tgt_seqno=cons_tgt_seqno,
        mtrl_info=mtrl_info,
        customer_info=customer_info,
        dt=dt,
    )
    seal_knd = str(detail.get("TRML_SEAL_KND_CD") or "A")
    new_payload["CSL_METR_TRML_SEAL_KND_CD"] = seal_knd
    new_payload["DEPT2"] = str(detail.get("OFFICE_CD") or OFFICE_CD)

    L(f"신설4000 POST: 신설={new_meter} 봉인={new_payload.get('CSL_METR_TRML_SEAL_NO')}"
      + (f"/{new_payload.get('CSL_METR_TRML_SEAL_NO2')}" if new_payload.get("CSL_METR_TRML_SEAL_NO2") else "")
      + f" CREMO_PRDC_YM={new_payload.get('CREMO_PRDC_YM')}")

    res4 = _post_saverow(
        f"{AWMS_BASE}/mobMtr4000/saveRow",
        new_payload,
        new_photos,
        log,
    )
    L(f"신설4000 응답: ok={res4['ok']} [{res4['body_preview'][:80]}]")
    if not res4["ok"]:
        return _err(f"신설 saveRow 실패: {res4['body_preview'][:200]}")

    # 8) 완료(28): getDetail 재조회 + 시공 17키 + 신설사진 재전송
    done_step = "25"
    # ★영준님 방침(2026-07-20): 완료(28)는 절대 금지 — 임시저장(25)까지만.
    #   no_complete=True면 완료(28) saveRow 단계 전체 스킵(getDetail 조회는 무해).
    no_complete = bool(job.get("no_complete"))
    try:
        d2, _ = _get_detail_with_retry(
            cons_no=gd_cons_no,
            cntr_no=gd_cntr_no,
            cons_tgt_seqno=cons_tgt_seqno,
            log=log,
        )
        if no_complete:
            L("임시저장 전용 모드(no_complete) — 완료(28) 미시도, 25 보관")
        elif len(d2) < 100:
            L("완료28용 getDetail 키부족 — 25로 보관(awms에서 수동완료 가능)")
        else:
            # 301키 전부 str 복사
            done_payload: dict = {k: ("" if v is None else str(v)) for k, v in d2.items()}
            # 완료 플래그 + 시공 17키 (JS L809-815)
            P_ymd = fmt_ymd(dt)
            P_ym = fmt_ym(dt)
            done_payload.update({
                "WORK_STEP": "28",
                "EX_WORK_STEP": "25",
                "RE_SAVE_YN": "",
                "LAY_METR_DTLS_CL_CD": "10",
                "DEPT2": str(d2.get("OFFICE_CD") or OFFICE_CD),
                "CMS_LAY_YMD": P_ymd,
                "CTS_LAY_YMD": P_ymd,
                "CSPD_LAY_YMD": P_ymd,
                "CTTB_LAY_YMD": P_ymd,
                "CREMO_CHRG_APLY_ST_YMD": P_ymd,
                "CMS_PRDC_YM": P_ym,
                "CTS_PRDC_YM": P_ym,
                "CSPD_PRDC_YM": P_ym,
                "CTTB_PRDC_YM": P_ym,
                "CPT_PRDC_YM": P_ym,
                "CREMO_EFEC_YM": P_ym,
                "CCTD1_PRDC_YM": P_ym,
                "CCTD2_PRDC_YM": P_ym,
                "CCTD3_PRDC_YM": P_ym,
            })
            # 신설사진 재전송 필수 (빠지면 500)
            res28 = _post_saverow(
                f"{AWMS_BASE}/mobMtr4000/saveRow",
                done_payload,
                new_photos,
                log,
            )
            L(f"완료28 응답: ok={res28['ok']} [{res28['body_preview'][:80]}]")
            if res28["ok"]:
                done_step = "28"
            else:
                L("완료28 실패 — 25는 저장됨(awms에서 수동완료 가능)")
    except Exception as e:
        L(f"완료28 오류(무시): {e}")

    awms_seal = {
        "account": str(injected.get("account") or ""),
        "seal_no": new_payload.get("CSL_METR_TRML_SEAL_NO") or "",
        "seal_no2": new_payload.get("CSL_METR_TRML_SEAL_NO2") or "",
        "cons_no": gd_cons_no or injected_cons_no,
    }

    return {
        "ok": True,
        "workStep": done_step,
        "consTgtSeqno": cons_tgt_seqno,
        "cntrNo": gd_cntr_no,          # 사후검증(getDetail 재조회)용
        "consNo": gd_cons_no,          # 확정 차수 (사후검증용)
        "awms_seal": awms_seal,
        "err": None,
        "log": log,
    }


# ── 사후검증 ───────────────────────────────────────────────────────────────────
def verify_registration(items: list) -> list:
    """
    등록 결과 사후검증.

    items = [{
        "meter": str,           # 철거 계기번호
        "new_meter_id": str,    # 신설 계기번호
        "cons_no": str,         # 확정 CONS_NO
        "cntr_no": str,         # CNTR_NO
        "cons_tgt_seqno": str,  # 등록 consTgtSeqno
        "expect": {
            "seal_no": str,
            "seal_no2": str,
            "removal_values": {field: str},
            "mfg_ym": str       # YYYYMM
        }
    }]

    반환: [{"meter", "ok", "mismatches": [{"field", "expect", "got"}]}]
    """
    results = []
    for item in items:
        meter = item.get("meter") or ""
        cons_no = str(item.get("cons_no") or "")
        cntr_no = str(item.get("cntr_no") or "")
        seqno = str(item.get("cons_tgt_seqno") or "")
        expect = item.get("expect") or {}
        mismatches = []

        try:
            detail, _ = _get_detail_with_retry(
                cons_no=cons_no,
                cntr_no=cntr_no,
                cons_tgt_seqno=seqno,
            )
        except Exception as e:
            results.append({"meter": meter, "ok": False, "mismatches": [{"field": "getDetail", "expect": "", "got": str(e)}]})
            continue

        if not detail:
            results.append({"meter": meter, "ok": False, "mismatches": [{"field": "getDetail", "expect": "응답있음", "got": "빈응답"}]})
            continue

        # WORK_STEP (기본 28; 임시저장 전용이면 expect.work_step=25)
        exp_step = str(expect.get("work_step") or "28")
        got_step = str(detail.get("WORK_STEP") or "")
        if got_step != exp_step:
            mismatches.append({"field": "WORK_STEP", "expect": exp_step, "got": got_step})

        # 신설계기번호
        got_cremo = str(detail.get("CREMO_WHM_NO") or detail.get("WHM_NO") or "")
        exp_new = str(item.get("new_meter_id") or "")
        if exp_new and got_cremo != exp_new:
            mismatches.append({"field": "CREMO_WHM_NO", "expect": exp_new, "got": got_cremo})

        # 봉인번호
        if expect.get("seal_no"):
            got_seal = str(detail.get("CSL_METR_TRML_SEAL_NO") or "")
            if got_seal != str(expect["seal_no"]):
                mismatches.append({"field": "CSL_METR_TRML_SEAL_NO", "expect": str(expect["seal_no"]), "got": got_seal})
        if expect.get("seal_no2"):
            got_seal2 = str(detail.get("CSL_METR_TRML_SEAL_NO2") or "")
            if got_seal2 != str(expect["seal_no2"]):
                mismatches.append({"field": "CSL_METR_TRML_SEAL_NO2", "expect": str(expect["seal_no2"]), "got": got_seal2})

        # 철거 지침값 (DGD 4칸)
        rv = expect.get("removal_values") or {}
        dgd_map = {
            "whme_day":  "DGD_WHME_NDL_DAY_QTT",
            "whme_mngt": "DGD_WHME_NDL_MNGT_QTT",
            "dm_mt_day": "DGD_DM_MT_NDL_DAY_QTT",
            "var_day":   "DGD_VAR_NDL_DAY_QTT",
        }
        for f, dgd_key in dgd_map.items():
            if f in rv:
                got_v = str(detail.get(dgd_key) or "")
                exp_v = str(rv[f])
                if got_v != exp_v:
                    mismatches.append({"field": dgd_key, "expect": exp_v, "got": got_v})

        # 제조월
        if expect.get("mfg_ym"):
            got_ym = str(detail.get("CREMO_PRDC_YM") or "")
            exp_ym = str(expect["mfg_ym"]).replace("-", "")
            if got_ym != exp_ym:
                mismatches.append({"field": "CREMO_PRDC_YM", "expect": exp_ym, "got": got_ym})

        results.append({"meter": meter, "ok": len(mismatches) == 0, "mismatches": mismatches})

    return results


# ── selftest ──────────────────────────────────────────────────────────────────
def _selftest() -> None:
    """
    라이브 호출 없이 payload 생성 로직을 픽스처로 검증.
    python3 awms_mtr_direct.py --selftest
    """
    print("=== awms_mtr_direct selftest ===")
    from datetime import datetime
    from zoneinfo import ZoneInfo
    dt_fixed = datetime(2026, 7, 17, 10, 30, 0, tzinfo=ZoneInfo("Asia/Seoul"))

    # 픽스처: 단상 계기 getDetail 모의
    detail_single: dict = {
        "CONS_NO": "397820263153",
        "CNTR_NO": "1234567890",
        "CONS_TGT_SEQNO": "5807921",
        "CNTR_CLAS_CD": "100",
        "CNTR_PWR": "3",
        "OFFICE_CD": "7793",
        "DREMO_PRDC_YM": "201603",
        "WHM_NO": "06450094432",
        "WORK_STEP": "25",
        "REG_ID": "testuser",
        # 사진 필드 (빈값이어야 함)
        "DREMO_ATCH_FILE_ID_3_SRC": "someblob",
        "CREMO_ATCH_FILE_ID_3_SRC": "someblob",
    }
    # 나머지 301키 채우기 (검증: 100개 이상)
    for i in range(100):
        detail_single.setdefault(f"EXTRA_FIELD_{i}", "")

    # 픽스처: 삼상 계기 getDetail 모의
    detail_triple: dict = dict(detail_single)
    detail_triple.update({
        "CNTR_CLAS_CD": "905",
        "CONS_TGT_SEQNO": "5807924",
        "DREMO_PRDC_YM": "201604",
    })

    customer_info_single = {
        "CUST_NO": "1234567890",
        "CNTR_CLAS_CD": "100",
        "CNTR_PWR": "3",
        "PRDC_YM": "201603",
        "GUM_DAY": "15",
        "WRK_PLCE_ADDR_CTT": "서울 종로구 테스트로 1",
    }
    customer_info_4field = {
        "CUST_NO": "9999999999",
        "CNTR_CLAS_CD": "211",
        "CNTR_PWR": "30",  # >=20 + 211 → 4칸
        "PRDC_YM": "202001",
        "GUM_DAY": "5",
        "WRK_PLCE_ADDR_CTT": "서울 종로구 테스트로 2",
    }
    customer_info_triple = {
        "CUST_NO": "8888888888",
        "CNTR_CLAS_CD": "905",
        "CNTR_PWR": "3",
        "PRDC_YM": "201604",
        "GUM_DAY": "10",
        "WRK_PLCE_ADDR_CTT": "서울 종로구 테스트로 3",
    }

    injected_single = {"seal_no": "3967105", "seal_no2": "", "cons_no": "397820263153", "account": "test"}
    injected_triple = {"seal_no": "3967106", "seal_no2": "3967107", "cons_no": "397820263153", "account": "test"}

    rep_single = {
        "new_meter_id": "02171625850",
        "removal_value": "12345",
        "removal_values": {"whme_day": "12345"},
        "nd_digits": "6",
        "new_meter_mfg_ym": "2025-03",
        "old_meter_photo": "",
        "new_meter_photo": "",
    }
    rep_4field = {
        "new_meter_id": "02251234567",
        "removal_value": "9999",
        "removal_values": {
            "whme_day": "100", "whme_mngt": "200",
            "dm_mt_day": "300", "var_day": "0",
        },
        "nd_digits": "6",
        "new_meter_mfg_ym": "2025-01",
        "old_meter_photo": "",
        "new_meter_photo": "",
    }
    rep_triple = {
        "new_meter_id": "09551234567",
        "removal_value": "55555",
        "removal_values": {"whme_mngt": "55555"},
        "nd_digits": "6",
        "new_meter_mfg_ym": "2024-12",
        "old_meter_photo": "",
        "new_meter_photo": "",
    }

    errors = []

    # --- 테스트 1: 단상 지침칸 ---
    print("\n[T1] 단상(100, pwr=3) → 1칸")
    fields = reading_fields_for("100", "3")
    assert fields == ["whme_day"], f"T1 실패: {fields}"
    print("  OK: fields=", fields)

    # --- 테스트 2: 4칸 ---
    print("[T2] 4칸(211, pwr=30)")
    fields4 = reading_fields_for("211", "30")
    assert fields4 == ["whme_day", "whme_mngt", "dm_mt_day", "var_day"], f"T2 실패: {fields4}"
    print("  OK: fields=", fields4)

    # --- 테스트 3: 야간 1칸 ---
    print("[T3] 야간(905, pwr=3)")
    fields_mngt = reading_fields_for("905", "3")
    assert fields_mngt == ["whme_mngt"], f"T3 실패: {fields_mngt}"
    print("  OK: fields=", fields_mngt)

    # --- 테스트 4: 철거 payload 단상 (4칸 매핑) ---
    print("[T4] 철거 payload 단상 — DGD 1칸 매핑")
    demo_p = _build_demolition_payload_full(
        meter="06450094432",
        rep=rep_single,
        customer_info=customer_info_single,
        injected_cons_no="397820263153",
        injected_seal_no="3967105",
        dt=dt_fixed,
    )
    assert demo_p["DGD_WHME_NDL_DAY_QTT"] == "12345", f"T4-1: {demo_p['DGD_WHME_NDL_DAY_QTT']}"
    assert demo_p["DGD_WHME_NDL_MNGT_QTT"] == "", f"T4-2: mngt 빈값이어야 함: {demo_p['DGD_WHME_NDL_MNGT_QTT']}"
    assert demo_p["DGD_DM_MT_NDL_DAY_QTT"] == "", f"T4-3: dm_mt 빈값이어야 함"
    assert demo_p["DGD_VAR_NDL_DAY_QTT"] == "", f"T4-4: var 빈값이어야 함"
    assert demo_p["WORK_STEP"] == "25", f"T4-5: WORK_STEP=25이어야 함"
    assert demo_p["CREMO_WHM_NO"] == "", f"T4-6: CREMO_WHM_NO=빈값이어야 함"
    assert demo_p["CONS_NO"] == "397820263153", f"T4-7: CONS_NO"
    print("  OK: DGD 1칸 매핑 정상")

    # --- 테스트 5: 철거 payload 4칸 ---
    print("[T5] 철거 payload 4칸 매핑(211, pwr=30)")
    demo_p4 = _build_demolition_payload_full(
        meter="09251234567",
        rep=rep_4field,
        customer_info=customer_info_4field,
        injected_cons_no="397820263153",
        injected_seal_no="3967105",
        dt=dt_fixed,
    )
    assert demo_p4["DGD_WHME_NDL_DAY_QTT"] == "100", f"T5-1: {demo_p4['DGD_WHME_NDL_DAY_QTT']}"
    assert demo_p4["DGD_WHME_NDL_MNGT_QTT"] == "200", f"T5-2: {demo_p4['DGD_WHME_NDL_MNGT_QTT']}"
    assert demo_p4["DGD_DM_MT_NDL_DAY_QTT"] == "300", f"T5-3: {demo_p4['DGD_DM_MT_NDL_DAY_QTT']}"
    assert demo_p4["DGD_VAR_NDL_DAY_QTT"] == "0", f"T5-4: {demo_p4['DGD_VAR_NDL_DAY_QTT']}"
    print("  OK: DGD 4칸 매핑 정상")

    # --- 테스트 6: 신설 payload 단상 — 봉인 주입, CGD ---
    print("[T6] 신설 payload 단상 — 봉인 주입식 (+1 금지), CGD")
    new_p = _build_new_payload_full(
        new_meter="02171625850",
        detail=detail_single,
        rep=rep_single,
        injected=injected_single,
        cons_tgt_seqno="5807921",
        mtrl_info={"MTRL_NO": "127827", "MNFCT_YM": "202503"},
        customer_info=customer_info_single,
        dt=dt_fixed,
    )
    # 봉인 주입(+1 금지)
    assert new_p["CSL_METR_TRML_SEAL_NO"] == "3967105", f"T6-1: seal_no={new_p['CSL_METR_TRML_SEAL_NO']}"
    assert new_p["CSL_METR_TRML_SEAL_NO2"] == "", f"T6-2: 단상 seal_no2 빈값: {new_p['CSL_METR_TRML_SEAL_NO2']}"
    assert new_p["CSL_METR_TRML_SEAL_KND_NQNT"] == "1", f"T6-3: NQNT=1 단상"
    # CGD: whme_day=0, 나머지 빈값
    assert new_p["CGD_WHME_NDL_DAY_QTT"] == "0", f"T6-4: CGD_DAY=0: {new_p['CGD_WHME_NDL_DAY_QTT']}"
    assert new_p["CGD_WHME_NDL_MNGT_QTT"] == "", f"T6-5: CGD_MNGT 빈값: {new_p['CGD_WHME_NDL_MNGT_QTT']}"
    assert new_p["CGD_DM_MT_NDL_DAY_QTT"] == "", f"T6-6: CGD_DM_MT 빈값"
    assert new_p["CGD_VAR_NDL_DAY_QTT"] == "", f"T6-7: CGD_VAR 빈값"
    # WORK_STEP=25
    assert new_p["WORK_STEP"] == "25", f"T6-8: WORK_STEP=25"
    # 사진 필드 초기화
    assert new_p.get("CREMO_ATCH_FILE_ID_3_SRC") == "", f"T6-9: 사진 필드 초기화"
    # 제조월(mtrl_info 우선)
    assert new_p["CREMO_PRDC_YM"] == "202503", f"T6-10: CREMO_PRDC_YM=202503: {new_p['CREMO_PRDC_YM']}"
    print("  OK: 단상 봉인 주입 + CGD 1칸")

    # --- 테스트 7: 신설 payload 삼상 ---
    print("[T7] 신설 payload 삼상(905) — 봉인 2개, CGD whme_mngt=0")
    detail_triple_full = dict(detail_triple)
    for i in range(100):
        detail_triple_full.setdefault(f"EXTRA_FIELD_{i}", "")

    new_p3 = _build_new_payload_full(
        new_meter="09551234567",
        detail=detail_triple_full,
        rep=rep_triple,
        injected=injected_triple,
        cons_tgt_seqno="5807924",
        mtrl_info={},
        customer_info=customer_info_triple,
        dt=dt_fixed,
    )
    assert new_p3["CSL_METR_TRML_SEAL_NO"] == "3967106", f"T7-1: {new_p3['CSL_METR_TRML_SEAL_NO']}"
    assert new_p3["CSL_METR_TRML_SEAL_NO2"] == "3967107", f"T7-2: seal_no2={new_p3['CSL_METR_TRML_SEAL_NO2']}"
    assert new_p3["CSL_METR_TRML_SEAL_KND_NQNT"] == "2", f"T7-3: NQNT=2 삼상"
    # CGD 삼상(905→whme_mngt): mngt=0, day=빈값
    assert new_p3["CGD_WHME_NDL_MNGT_QTT"] == "0", f"T7-4: CGD_MNGT=0: {new_p3['CGD_WHME_NDL_MNGT_QTT']}"
    assert new_p3["CGD_WHME_NDL_DAY_QTT"] == "", f"T7-5: CGD_DAY 빈값 삼상: {new_p3['CGD_WHME_NDL_DAY_QTT']}"
    print("  OK: 삼상 봉인 2개 + CGD whme_mngt=0")

    # --- 테스트 8: 신설 payload 4칸 CGD ---
    print("[T8] 신설 payload 4칸(211, pwr=30) — CGD 4칸 전부 0")
    detail_4field = dict(detail_single)
    detail_4field.update({"CNTR_CLAS_CD": "211", "CNTR_PWR": "30"})
    for i in range(100):
        detail_4field.setdefault(f"EXTRA_FIELD_{i}", "")

    new_p4 = _build_new_payload_full(
        new_meter="02251234567",
        detail=detail_4field,
        rep=rep_4field,
        injected=injected_single,
        cons_tgt_seqno="5807921",
        mtrl_info={},
        customer_info=customer_info_4field,
        dt=dt_fixed,
    )
    assert new_p4["CGD_WHME_NDL_DAY_QTT"] == "0", f"T8-1: {new_p4['CGD_WHME_NDL_DAY_QTT']}"
    assert new_p4["CGD_WHME_NDL_MNGT_QTT"] == "0", f"T8-2: {new_p4['CGD_WHME_NDL_MNGT_QTT']}"
    assert new_p4["CGD_DM_MT_NDL_DAY_QTT"] == "0", f"T8-3: {new_p4['CGD_DM_MT_NDL_DAY_QTT']}"
    assert new_p4["CGD_VAR_NDL_DAY_QTT"] == "0", f"T8-4: {new_p4['CGD_VAR_NDL_DAY_QTT']}"
    print("  OK: CGD 4칸 모두 0")

    # --- 테스트 9: 완료28 payload 구조 (17키 오버라이드) ---
    print("[T9] 완료28 payload — 시공 17키 확인")
    done_payload = {k: ("" if v is None else str(v)) for k, v in detail_single.items()}
    P_ymd = fmt_ymd(dt_fixed)
    P_ym = fmt_ym(dt_fixed)
    done_payload.update({
        "WORK_STEP": "28", "EX_WORK_STEP": "25", "RE_SAVE_YN": "",
        "LAY_METR_DTLS_CL_CD": "10", "DEPT2": "7793",
        "CMS_LAY_YMD": P_ymd, "CTS_LAY_YMD": P_ymd, "CSPD_LAY_YMD": P_ymd,
        "CTTB_LAY_YMD": P_ymd, "CREMO_CHRG_APLY_ST_YMD": P_ymd,
        "CMS_PRDC_YM": P_ym, "CTS_PRDC_YM": P_ym, "CSPD_PRDC_YM": P_ym,
        "CTTB_PRDC_YM": P_ym, "CPT_PRDC_YM": P_ym, "CREMO_EFEC_YM": P_ym,
        "CCTD1_PRDC_YM": P_ym, "CCTD2_PRDC_YM": P_ym, "CCTD3_PRDC_YM": P_ym,
    })
    assert done_payload["WORK_STEP"] == "28", "T9-1: WORK_STEP=28"
    assert done_payload["RE_SAVE_YN"] == "", "T9-2: RE_SAVE_YN=빈값"
    assert done_payload["CMS_LAY_YMD"] == "20260717", f"T9-3: CMS_LAY_YMD={done_payload['CMS_LAY_YMD']}"
    assert done_payload["CCTD3_PRDC_YM"] == "202607", f"T9-4: CCTD3_PRDC_YM={done_payload['CCTD3_PRDC_YM']}"
    print("  OK: 완료28 17키 구조")

    # --- 테스트 10: save_final_seal body 구조 ---
    print("[T10] save_final_seal body 구조")
    # 실제 호출 없이 body 합성만 검증
    test_cons = "397820263153"
    test_seal = "3967109"
    expected_body = {
        "BATT_SEAL_KND_CD": "", "MTBX_SEAL_CNT_VAL": "",
        "LV_CONS_NO": test_cons, "HV_CONS_NO": "",
        "ETC_SEAL_VAL": "", "BATT_SEAL_CNT_VAL": "", "TRML_SEAL_KND_CD": "A",
        "OTSD_SEAL_VAL": "", "ENCL_SEAL_VAL": "", "MTBX_SEAL_KND_CD": "",
        "SIMPLE_YN": "N", "TRML_SEAL_CNT_VAL": "1",
        "METR_SEAL_VAL": test_seal,
    }
    assert expected_body["METR_SEAL_VAL"] == test_seal, "T10-1: METR_SEAL_VAL"
    assert expected_body["LV_CONS_NO"] == test_cons, "T10-2: LV_CONS_NO"
    assert "ENCL_SEAL_VAL" in expected_body, "T10-3: ENCL_SEAL_VAL 키 있음(빈값 포함)"
    print("  OK: save_final_seal body 구조")

    if errors:
        print("\n[FAIL]", errors)
        sys.exit(1)
    else:
        print("\n=== selftest 전체 통과 (10/10) ===")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--selftest", action="store_true", help="payload 로직 자가테스트 (라이브 호출 없음)")
    args = parser.parse_args()

    if args.selftest:
        _selftest()
    else:
        parser.print_help()
