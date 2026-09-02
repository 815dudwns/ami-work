#!/usr/bin/env python3
"""통신팀 awms 맥 입력장치 — 백엔드 (FastAPI).

설계: research/awms-poc/통신팀_맥입력장치_설계.md
정본 페이로드: research/awms-poc/통신팀_saveact_정본.json (PoC 검증)

흐름: 로그인(세션 핸드오프) → 사진수집 → OCR(계기번호) → 맥수집(QR/바코드)
      → 계기번호 확인 → saveAct(마스터+슬레이브 결합) 전송.
PoC 검증 완료(2026-07-01): 맥 직접 saveAct result:1, 마스터+슬레이브 MB_REG_CNT=2.
"""
import json, subprocess, urllib.request, time, os, re, base64, tempfile, shutil, glob
import hashlib, io, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path


def _cleanup_old_temp(max_age_sec=3600):
    """오래된 OCR/전송 임시 사진폴더 청소(맥 누적 방지). 기동 시 + 주기적 안전망."""
    base = tempfile.gettempdir()
    now = time.time()
    for pat in ("cstocr_*", "cstsave_*"):
        for d in glob.glob(os.path.join(base, pat)):
            try:
                if now - os.path.getmtime(d) > max_age_sec:
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
import requests
from PIL import Image
from fastapi import FastAPI, Body, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]          # ami-work/
WWW = Path(__file__).resolve().parents[1] / "www"   # cst-input/www
CDP_DIR = ROOT / "research" / "awms-poc"             # cdp_cookies.py 등

AWMS = "https://awms.kdn.com/ami/mob/cst/mobCst1000"
CDP_PORT = 9222
KST = timezone(timedelta(hours=9))

# ── 코드 신선도(stale) 감시 ──────────────────────────────
# 사고 2026-08-11: app.py를 고치고 커밋까지 했는데 백엔드를 재구동하지 않아 **12일 된 코드가 계속 돌았다**.
#   그 프로세스엔 addl/EXT_CONN_DEV 산출이 아예 없어서 폰을 두 번 고쳐도(2.2.8/2.2.9) 아무 변화가 없었고,
#   원인을 찾는 데 반나절이 갔다. uvicorn --reload 는 감시범위(ami-work 전체 .py 465개)와
#   전송 중 재시작 유실 때문에 쓰지 않는다 — 대신 "안 했으면 즉시 들키게" 만든다.
# 판정: 디스크의 app.py mtime > 프로세스 기동시각  ->  stale.
BOOT_TS = datetime.now(KST)                      # 모듈 로드 = 프로세스 기동
_SRC = Path(__file__).resolve()


def _src_info():
    """(mtime(KST), sha256 앞12) — 읽기 전용. 실패해도 예외를 밖으로 내지 않는다."""
    try:
        st = _SRC.stat()
        return (datetime.fromtimestamp(st.st_mtime, KST),
                hashlib.sha256(_SRC.read_bytes()).hexdigest()[:12])
    except Exception:
        return (None, "")


def _git_head():
    """돌고 있는 코드가 어느 커밋인지 대조용. 읽기 전용, 실패 시 빈 문자열."""
    try:
        return subprocess.run(["git", "-C", str(_SRC.parent), "rev-parse", "--short", "HEAD"],
                              capture_output=True, text=True, timeout=2).stdout.strip()
    except Exception:
        return ""


def _is_stale():
    mt, _ = _src_info()
    return bool(mt and mt > BOOT_TS)


def _stale_note():
    """stale일 때만 로그에 붙일 한 줄. 아니면 빈 문자열."""
    if not _is_stale():
        return ""
    mt, sha = _src_info()
    return (f"\n!! 백엔드 코드가 디스크보다 오래됐다 — 기동 {BOOT_TS:%Y-%m-%d %H:%M:%S} < "
            f"app.py {mt:%Y-%m-%d %H:%M:%S} (sha {sha}). `cst-input/restart.sh` 로 재구동해야 반영된다.")

# ── OCR 실패 표본 수집 (계약: docs/data-contract.md §스키마소유자ocr-meter/쓰기통신팀, 2026-07-27) ──
# 스키마 정본=ocr-meter, 쓰기=통신팀. 임의 필드변경 금지 — 바꿀 땐 ocr-meter 합의 후 append-only.
# worktree-상대참조 금지(data-contract 원칙) — SHARED_OCR_POC 절대경로 상수로만 참조.
SHARED_OCR_POC = Path("/Users/woodelight/Projects/ami-work/research/ocr_poc")
AMIQ_OCR_FAIL_DIR = SHARED_OCR_POC / "계기번호_아미큐_실패건"
AMIQ_OCR_PENDING = AMIQ_OCR_FAIL_DIR / "pending"
AMIQ_OCR_LABELED = AMIQ_OCR_FAIL_DIR / "labeled"
AMIQ_OCR_PENDING_TTL_SEC = 14 * 24 * 3600   # ocr-meter 정책: pending 14일 미매칭 시 자동삭제
# _extract_meter_no 추출로직 버전(로직 바뀔 때마다 갱신 — app_version 대신 PM 지시 2026-07-27).
_OCR_LOGIC_VER = "e5-2026-07-14"

# ── 세션 보관 (메모리 + 디스크 persist) ─────────────────
# 폰 헬퍼 awms 세션(JSESSIONID httpOnly + XSRF) + UA를 넘겨받아 보관.
# 디스크 persist → 백엔드 재기동해도 세션 생존(무USB 자립: 폰 재전송 없이도 4시간 내 유지).
SESSION = {"jsessionid": None, "rememberedId": None, "xsrf": None, "ua": None, "ts": 0}
SESSION_FILE = Path(__file__).resolve().parent / "session.json"   # *.py·session.json은 .gitignore
# 무USB 원격 세션 전송 보호용 공유 시크릿 (헬퍼 inject와 동일값). 공개 터널 write 보호.
PUSH_SECRET = "cst-amiq-2026"


def _save_session():
    try:
        SESSION_FILE.write_text(json.dumps(SESSION), encoding="utf-8")
    except Exception:
        pass


def _load_session():
    try:
        SESSION.update(json.loads(SESSION_FILE.read_text(encoding="utf-8")))
    except Exception:
        pass


def _parse_cookie_header(cookie_str: str) -> dict:
    """'JSESSIONID=x; rememberedId=273584; XSRF-TOKEN=y' → dict."""
    out = {}
    for part in str(cookie_str or "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out

# 설정값 — /api/config로 갱신 (헬퍼 설정페이지: 지사/동행/계정 + awms 공사설정)
CONFIG = {"BUSI_NUM": "202651005002", "WORKER1_SEQ": "273584", "WORKER2_SEQ": "20118",
          "DEPT1": "3970", "DEPT2": "7793",
          "WITH_YN": "", "CRED_ID": "", "CRED_PW": ""}   # WITH_YN=동행시공, CRED=awms계정(자동입력용)
# WORKER1_SEQ=정본 기본값(=로그인 rememberedId, pull시 자동덮어씀).
# WORKER2_SEQ=awms 저장 작업조2 — pull_workgroup(getUserWorkGroup)이 세션 pull/push 때 awms 저장값으로 갱신(하드코딩 20118은 폴백). 폰은 WORKER2 안 push(설정 read-only).
# 631 NOT NULL 재발 방지: 빈값이면 saveAct가 거부(_assert_config). (awms 공사설정 조회 반영 2026-07-22 구현완료)
# CONFIG persist — 폰이 지정한 설정값(지사/동행/계정)이 재기동 기본값 리셋으로 날아가던 문제 해결(2026-07-22).
#   폰은 지사를 재선택할 때만 pushConfig → 저장 안 하면 재시작 후 기본값(7793)으로 등록됨. session.json처럼 config.json에 persist.
CONFIG_FILE = Path(__file__).resolve().parent / "config.json"


def _save_config():
    try:
        CONFIG_FILE.write_text(json.dumps(CONFIG), encoding="utf-8")
    except Exception:
        pass


def _load_config():
    """폰이 지정한 설정값(DEPT2/WITH_YN/CRED)을 디스크에서 복원 — 재기동해도 설정 유지."""
    try:
        saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        CONFIG.update({k: v for k, v in saved.items() if k in CONFIG})
    except Exception:
        pass


def _adb_forward_helper():
    """헬퍼 webview 소켓을 찾아 adb forward 갱신."""
    ps = subprocess.run(["adb", "shell", "ps", "-A"], capture_output=True, text=True, timeout=10).stdout
    pid = next((ln.split()[1] for ln in ps.splitlines() if "awmshelper" in ln), None)
    if not pid:
        raise RuntimeError("헬퍼(awmshelper) 프로세스 없음 — 폰 연결/앱 확인")
    subprocess.run(["adb", "forward", "--remove-all"], capture_output=True, timeout=10)
    subprocess.run(["adb", "forward", f"tcp:{CDP_PORT}", f"localabstract:webview_devtools_remote_{pid}"],
                   capture_output=True, timeout=10)


def _cdp_eval(expr: str):
    """헬퍼 webview에서 JS 평가 (cdp_eval.py 재사용)."""
    out = subprocess.run(["python3", str(CDP_DIR / "cdp_eval.py"), expr],
                         capture_output=True, text=True, timeout=40)
    return out.stdout.strip()


def pull_session():
    """폰 헬퍼에서 awms 세션(JSESSIONID/XSRF) + UA 추출 → SESSION 보관.
    httpOnly라 cdp_cookies.py(Network.getAllCookies) 사용.
    """
    _adb_forward_helper()
    # 쿠키 추출
    raw = subprocess.run(["python3", str(CDP_DIR / "cdp_cookies.py")],
                         capture_output=True, text=True, timeout=20).stdout
    cookies = json.loads(raw[:raw.index("\nCOOKIE_HEADER")]) if "COOKIE_HEADER" in raw else json.loads(raw)
    js = next((c["value"] for c in cookies if c["name"] == "JSESSIONID"), None)
    rid = next((c["value"] for c in cookies if c["name"] == "rememberedId"), None)
    xsrf = next((c["value"] for c in cookies if c["name"] in ("XSRF-TOKEN",)), None)
    ua = _cdp_eval("navigator.userAgent")
    if not js:
        raise RuntimeError("JSESSIONID 없음 — 폰 awms 로그인 필요")
    SESSION.update(jsessionid=js, rememberedId=rid, xsrf=xsrf, ua=ua, ts=int(time.time()))
    # WORKER1_SEQ 자동 배선: 정본에선 WORKER1==로그인계정(273584)이라 일치하나 개념상 다를 수 있음
    # (rememberedId=로그인아이디 / WORKER1_SEQ=작업자일련번호). 숫자열(작업자SEQ 형태)일 때만 덮어쓰고,
    # 아니면 검증된 기본값(273584) 유지. 라이브 전 /api/session/pull 응답의 worker1로 273584인지 눈으로 확인할 것.
    if rid and str(rid).isdigit():
        CONFIG["WORKER1_SEQ"] = rid
    _save_session()
    pull_workgroup()   # awms 저장 작업조(WORKER2_SEQ 등) 반영
    return SESSION


def _cookie_header():
    parts = []
    if SESSION["rememberedId"]:
        parts.append(f"rememberedId={SESSION['rememberedId']}")
    if SESSION["jsessionid"]:
        parts.append(f"JSESSIONID={SESSION['jsessionid']}")
    if SESSION["xsrf"]:
        parts.append(f"XSRF-TOKEN={SESSION['xsrf']}")
    return "; ".join(parts)


def _headers(json_post=False):
    h = {"Cookie": _cookie_header(), "User-Agent": SESSION["ua"] or "",
         "Accept": "application/json, text/plain, */*",
         "Referer": "https://awms.kdn.com/html/main/index.html?app=MOBCST&menu=01010000"}
    if json_post and SESSION["xsrf"]:
        h["X-XSRF-TOKEN"] = SESSION["xsrf"]   # deleteRows 등 JSON POST에 필요
    return h


def session_alive():
    """getBusiList로 세션 생존 확인. HTML(login) 오면 만료."""
    try:
        r = requests.get(f"{AWMS}/getBusiList?DEPT1={CONFIG['DEPT1']}", headers=_headers(), timeout=15)
        return r.status_code == 200 and "json" in r.headers.get("content-type", "")
    except Exception:
        return False


def pull_workgroup():
    """awms getUserWorkGroup으로 저장된 작업조(WORKER2_SEQ 등)를 받아와 CONFIG에 반영.
    awms 공사설정이 정본 — 하드코딩/폰 대신 이 저장값을 사용(2026-07-22 본구현, 75줄 TODO 해결).
    응답 예: [{"WORKER1_SEQ":"273584","WORKER2_SEQ":"7290005","WORKER3_SEQ":"",...}].
    실패가 조용히 묻히던 문제(PM 지시 2026-07-27) — 실패/비정상 응답 전부 로그로 남긴다."""
    try:
        r = requests.get(f"{AWMS}/getUserWorkGroup", headers=_headers(), timeout=15)
        if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
            arr = r.json()
            if arr and isinstance(arr, list):
                wg = arr[0]
                before = {k: CONFIG.get(k) for k in ("WORKER1_SEQ", "WORKER2_SEQ", "WORKER3_SEQ")}
                for k in ("WORKER1_SEQ", "WORKER2_SEQ", "WORKER3_SEQ"):
                    v = str(wg.get(k, "") or "").strip()
                    if v:   # awms 저장값 있을 때만 갱신(빈값이면 기존/폴백 유지)
                        CONFIG[k] = v
                after = {k: CONFIG.get(k) for k in ("WORKER1_SEQ", "WORKER2_SEQ", "WORKER3_SEQ")}
                print(f"[pull_workgroup] awms 응답={wg} 반영전={before} 반영후={after}", flush=True)
            else:
                print(f"[pull_workgroup] 빈/비배열 응답 — 반영 안 함: {arr!r}", flush=True)
        else:
            print(f"[pull_workgroup] 실패 응답 status={r.status_code} content-type="
                  f"{r.headers.get('content-type','')} body={r.text[:200]!r}", flush=True)
    except Exception as e:
        print(f"[pull_workgroup] 예외로 실패(조용히 묻히던 부분) — {type(e).__name__}: {e}", flush=True)


# ── 통신방식 자동판별 (헬퍼 awms-bridge-inject.js macToSuffix/inferMasterINST_S 이식) ──
def _mac_raw_suffix(mac: str) -> str:
    """모뎀맥 → 통신방식 마커: 'LTE'/'SKIP'/'10'/'20'/'90' 또는 ''(미상).
    suffix: 10=ks-plc 20=hpgp 70=lte_IV 90=k-dcu 92=smgw-c."""
    raw = re.sub(r'\D', '', str(mac or ''))
    m = re.sub(r'[^0-9A-F]', '', str(mac or '').upper())
    if re.match(r'^012\d{8}$', raw):
        return 'LTE'
    if m.startswith('847207'):
        c = m[6:7]
        if c == '0':
            c89 = m[7:9]
            return '10' if c89 in ('E3', 'E4', 'D9') else '90'   # E3/E4/D9=ks-plc, 그외 0=k-dcu
        if c == 'E':
            return '90'                                          # k-dcu
        if c in ('B', 'C', 'D'):
            return '10'                                          # ks-plc
    if m.startswith('E0AEED'):
        return '10'                                              # ks-plc
    if m.startswith('44B433') or m.startswith('0014B0'):
        return '20'                                              # hpgp
    if m.startswith('AC5E8C'):
        return 'SKIP'                                            # 혼재 → 자동 안 함, 직접선택
    return ''


def infer_inst_s(inst_m: str, mac: str) -> str:
    """INST_S = INST_M + suffix. 미상/SKIP이면 ''(프론트 직접선택 필요)."""
    if not inst_m:
        return ''
    suf = _mac_raw_suffix(mac)
    if suf in ('', 'SKIP'):
        return ''
    if suf == 'LTE':
        return inst_m + ('92' if inst_m == 'HW4050' else '70')  # 아미고=smgw-c, 그외=lte_IV
    return inst_m + suf                                          # PLC/k-dcu/hpgp = 맥으로 확정


# 통신방식 suffix 코드표 (헬퍼 awms-bridge-inject.js L1102 일치). 직접선택 UI 옵션 단일출처.
COMM_SUFFIX_LABELS = [
    ("10", "KS-PLC"), ("20", "HPGP"), ("40", "LTE"),
    ("70", "LTE_IV"), ("80", "IoT-PLC"), ("90", "K-DCU"), ("92", "SMGW-C(아미고)"),
]
_COMM_LABEL = dict(COMM_SUFFIX_LABELS)

# DCU_ID 접미의 통신방식 코드 — awms MOBCST1000 화면 watch 핸들러 switch 문 그대로 옮긴 것.
# 화면은 INST_S.slice(6,8)(=통신방식 suffix)로 분기한다. 여기 없는 코드면 화면은 DCU_ID를 비운다.
_DCU_COMM_CODE = {"10": "4", "20": "", "30": "5", "40": "6", "50": "7",
                  "60": "", "70": "", "80": "", "85": "", "90": "", "91": "", "92": ""}


def commtype_for(mac: str, meter_no: str = ""):
    """모뎀맥 → 통신방식 자동판별 결과 (프론트 표시/직접선택 판단용).
    return {suffix, label, auto, reason}. auto=False면 프론트 직접선택 필요(미상/혼재)."""
    raw = _mac_raw_suffix(mac)
    if raw == "SKIP":
        return {"suffix": "", "label": "", "auto": False, "reason": "혼재(AC5E8C) — 직접 선택"}
    if raw == "LTE":
        # 최종 suffix는 계기유형(아미고=92/그외=70)에 따라 saveAct에서 확정. 표시만 LTE 계열.
        return {"suffix": "LTE", "label": "LTE 계열(계기유형으로 확정)", "auto": True, "reason": ""}
    if raw in _COMM_LABEL:
        return {"suffix": raw, "label": _COMM_LABEL[raw], "auto": True, "reason": ""}
    return {"suffix": "", "label": "", "auto": False, "reason": "미판별 — 직접 선택"}


def mac_to_suffix(mac: str) -> str:
    """하위호환 래퍼."""
    s = _mac_raw_suffix(mac)
    return '70' if s == 'LTE' else ('' if s == 'SKIP' else s)


# 계기유형(INST_M) = 계기번호 타입코드 자동판별 (daily_cycle TYPE_MAP 이식)
_TYPE_MAP = {'17': 'E', '19': 'EA', '25': 'G', '26': 'G', '27': 'G',
             '45': 'G', '46': 'G', '47': 'G', '53': 'Amigo', '55': 'Amigo'}
_TYPE_TO_INSTM = {'E': 'HW4020', 'EA': 'HW4040', 'G': 'HW4030', 'Amigo': 'HW4050'}


def infer_inst_m(meter_no: str) -> str:
    """계기번호 → INST_M. mid[2:4](3~4번째)가 타입코드. 표준/미상=HW4010(표준)."""
    code = str(meter_no or '').zfill(11)[2:4]
    return _TYPE_TO_INSTM.get(_TYPE_MAP.get(code, ''), 'HW4010')


# ── saveAct 빌더 (정본 통신팀_saveact_정본.json 기반) ──
# 정본 마스터 80필드 / 슬레이브 52필드. 봉인 빈값은 그대로(정본도 빈문자열 전송, FormData).
_MASTER_BASE = {
    "ROW_TYPE": "2", "FILTER_ROW": "N", "WORK_DIV": "M1010", "FLAG": "M10",
    "WORK_STEP": "28", "MTR_WITH_YN": "Y", "FCLTY_DIV": "20",
    "GUBUN": "01", "DCU_SIGONG_CD": "N", "TDU_USE_YN": "N", "mbInsertCnt": "0",
    "ERR_LIST": "[]", "SEAL_UPD": "N", "DANGER_INFO_FLAG": "2",
    # BUILTIN_YN = 사전체결여부(awms 2026-07-27 신규필드, 영준님 확정 2026-07-27). 항상 N.
    # 빈문자열 금지 — 봉인 필드처럼 빈값이면 awms Java parseInt가 500 낼 전례([[awms_saveact_500_fix]]).
    "BUILTIN_YN": "N",
    # 봉인/기타 빈필드는 _empty_fields()로 채움
}
_EMPTY_FIELDS = ["REMV_MEMO", "IND_CBD_DIV_CD", "FAC1", "LINE_FAIR", "USE_CT", "USE_POWER",
    "AM_BAND", "FILM_BAND", "GRADEL", "G_WIRE", "DATA_NUM", "GN_NAME", "BUNGI",
    "LINE_TYPE", "VISIT_DIV", "WORKER3_SEQ", "EXT_FCTY_ID", "EXT_DCU_ID", "NEW_DCU_MAC",
    "EXT_DCU_MAC", "TGT_DIV_CD", "BONBU_CD", "CUST_NO", "METER_ID",
    "SEAL_BOX1", "SEAL_BOX2", "SEAL_METER1", "SEAL_METER2", "SEAL_OUTER1", "SEAL_OUTER2",
    "BIZ_DGR", "EXT_MLN_MAC_MODEM", "CUR_MLN_MAC_MODEM", "EXT_MAC_MODEM", "CUR_MAC_MODEM",
    "EXT_INSTR_NUM", "EXT_MTRL_NO", "EXT_MANU_CD", "EXT_MNFCT_YM", "CUR_INSTR_NUM",
    "CUR_MTRL_NO", "CUR_MANU_CD", "CUR_MNFCT_YM", "MB_REG_CNT", "DCU_ID",
    "SEAL_BOX", "SEAL_METER", "SEAL_OUTER"]


def _common(meter_no, mac, inst_m, mb_meter_id, mb_cnt, inst_s, bungi=""):
    # INST_S/BUNGI는 호출자가 결정(헬퍼 조건): 마스터=자동/직접선택, 슬레이브=마스터 suffix 상속.
    d = dict(_MASTER_BASE)
    for k in _EMPTY_FIELDS:
        d.setdefault(k, "")
    d["BUNGI"] = bungi
    d.update({
        "DEPT1": CONFIG["DEPT1"], "DEPT2": CONFIG["DEPT2"], "BUSI_NUM": CONFIG["BUSI_NUM"],
        "WORKER1_SEQ": CONFIG["WORKER1_SEQ"], "WORKER2_SEQ": CONFIG["WORKER2_SEQ"],
        "INSTR_NUM": meter_no, "INST_M": inst_m, "INST_S": inst_s,
        "MAC_MODEM": mac, "MODEM_MAC": mac, "MB_METER_ID": mb_meter_id, "MB_CNT": str(mb_cnt),
    })
    # 동행시공여부: 아미큐 설정(WITH_YN) 반영 — 동행 Y / 일반(혼자) N.
    #   _MASTER_BASE의 "Y" 하드코딩을 설정값으로 덮어씀(N 선택이 awms에 안 먹던 버그 수정).
    d["MTR_WITH_YN"] = "Y" if str(CONFIG.get("WITH_YN", "")).strip() == "Y" else "N"
    return d


def saveact_post(fields: dict, photos: dict):
    """awms saveAct FormData 전송. photos = {'ATCH_FILE_ID_3_SRC': filepath, ...} 또는
    {'ATCH_FILE_ID_3': fileId(공유)}. 사진 바이너리는 (path) → open.
    """
    data = {k: v for k, v in fields.items()}
    files = []
    for k, v in photos.items():
        if k.endswith("_SRC"):     # 바이너리 슬롯
            files.append((k, (os.path.basename(v), open(v, "rb"), "image/jpeg")))
        else:                       # 공유 파일ID (문자열)
            data[k] = v
    r = requests.post(f"{AWMS}/saveAct", headers=_headers(), data=data, files=files, timeout=60)
    try:
        return r.json()
    except Exception:
        return {"_status": r.status_code, "_text": r.text[:300]}


# ── FastAPI ─────────────────────────────────────────
app = FastAPI(title="통신팀 awms 맥 입력장치")
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])  # 폰 앱/터널에서 호출


# ── 헬스체크: 지금 돌고 있는 코드가 디스크와 같은가 (부작용 없는 읽기 전용) ──
# stale=true 면 app.py를 고친 뒤 재구동을 안 한 것이다. `cst-input/restart.sh` 로 재구동해야 반영된다.
@app.get("/api/health")
def api_health():
    mt, sha = _src_info()
    return {
        "ok": True,
        "boot_ts": BOOT_TS.isoformat(),
        "app_py_mtime": mt.isoformat() if mt else "",
        "app_py_sha256_12": sha,
        "git_head": _git_head(),
        "stale": _is_stale(),
        "hint": ("app.py를 고치고 재구동을 안 했다 — cst-input/restart.sh"
                 if _is_stale() else "기동이 소스보다 최신 — 정상"),
    }


# 기동 로그 — 돌고 있는 코드를 한 줄로 못박는다(로그만 봐도 어느 버전인지 안다).
_BOOT_MT, _BOOT_SHA = _src_info()
print(f"[boot] {BOOT_TS:%Y-%m-%d %H:%M:%S} app.py sha={_BOOT_SHA} "
      f"mtime={_BOOT_MT:%Y-%m-%d %H:%M:%S} git={_git_head() or '?'}", flush=True)

_load_session()   # 재기동 시 디스크 세션 복원 (무USB 자립)
_load_config()    # 폰이 지정한 설정값(지사/동행/계정) 복원 — 기본값 리셋 방지(설정값으로 등록)
if SESSION.get("jsessionid"):
    pull_workgroup()   # 재기동 시 세션 있으면 awms 저장 작업조(WORKER2_SEQ) 즉시 반영 — 20118 노출 구간 제거
_cleanup_old_temp(0)   # 기동 시 남은 임시 사진폴더 전부 정리(in-flight 없음)
# (전송 아카이브 30일 정리 = _archive_cleanup(), 함수 정의 직후에서 기동 1회 호출)


@app.get("/api/session")
def api_session():
    return {"hasSession": bool(SESSION["jsessionid"]), "alive": session_alive(),
            "account": SESSION["rememberedId"], "ts": SESSION["ts"]}


@app.post("/api/session/pull")
def api_session_pull():
    try:
        pull_session()
        # worker1: 라이브 전 273584 확인용 (rememberedId가 작업자SEQ와 다르면 여기서 드러남)
        return {"ok": True, "alive": session_alive(), "account": SESSION["rememberedId"],
                "worker1": CONFIG["WORKER1_SEQ"], "worker2": CONFIG["WORKER2_SEQ"]}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/api/session/push")
def api_session_push(body: dict = Body(...)):
    """무USB 원격 세션 전송: 폰 헬퍼(SessionBridge)가 CookieManager로 읽은 awms 쿠키를 POST.
    body = {secret, cookie:'JSESSIONID=..; rememberedId=..; XSRF-TOKEN=..', ua}.
    httpOnly JSESSIONID도 네이티브 CookieManager는 읽음 → adb 없이 세션 확보."""
    if body.get("secret") != PUSH_SECRET:
        raise HTTPException(403, "시크릿 불일치")
    c = _parse_cookie_header(body.get("cookie", ""))
    js = c.get("JSESSIONID")
    rid = c.get("rememberedId")
    xsrf = c.get("XSRF-TOKEN")
    if not js:
        raise HTTPException(400, "JSESSIONID 없음 — 폰 awms 로그인 확인")
    SESSION.update(jsessionid=js, rememberedId=rid, xsrf=xsrf,
                   ua=body.get("ua") or SESSION.get("ua") or "", ts=int(time.time()))
    if rid and str(rid).isdigit():
        CONFIG["WORKER1_SEQ"] = rid
    _save_session()
    pull_workgroup()   # 폰이 세션 push할 때마다 awms 저장 작업조(WORKER2_SEQ) 반영
    return {"ok": True, "alive": session_alive(), "account": rid,
            "worker1": CONFIG["WORKER1_SEQ"], "worker2": CONFIG["WORKER2_SEQ"]}


@app.get("/api/config")
def api_config():
    out = dict(CONFIG)
    out["WORKER1_NM"] = _worker_name(CONFIG.get("WORKER1_SEQ", ""))
    out["WORKER2_NM"] = _worker_name(CONFIG.get("WORKER2_SEQ", ""))
    out["WORKER3_NM"] = _worker_name(CONFIG.get("WORKER3_SEQ", ""))
    out["BUSI_NM"] = _busi_name(CONFIG.get("BUSI_NUM", ""))
    return out


@app.post("/api/config")
def api_config_set(body: dict = Body(...)):
    CONFIG.update({k: v for k, v in body.items() if k in CONFIG})
    _save_config()   # 폰 설정값(지사 등) persist — 재기동해도 유지
    return CONFIG


# ── 이름 해석 (설정탭 표시용, 영준님 지시 2026-07-27) ──
# WORKER*_SEQ/BUSI_NUM은 코드뿐이라 화면엔 이름이 필요. 실측(getUserList DEPT1=3970&FLAG=M10,
# BLON_CL_CD=='20'만 KDN 실직원, 나머지는 mdp계정/외주코드)으로 확인된 매핑 — 하드코딩 아님, 매 조회 API 실호출.
# getUserList가 13000+건이라 무겁다 → 캐시(1시간). awms 세션 없으면 조용히 빈 매핑(코드만 표시로 폴백).
_dir_cache = {"map": {}, "ts": 0.0}
_busi_cache = {"map": {}, "ts": 0.0}


def _worker_directory() -> dict:
    now = time.time()
    if _dir_cache["map"] and now - _dir_cache["ts"] < 3600:
        return _dir_cache["map"]
    try:
        r = requests.get(f"{AWMS}/getUserList?DEPT1=3970&FLAG=M10", headers=_headers(), timeout=20)
        body = r.json() if "json" in r.headers.get("content-type", "") else None
        arr = body if isinstance(body, list) else ((body or {}).get("data") or (body or {}).get("list") or [])
        m = {}
        for o in arr:
            if o.get("DEPT1") == "3970" and o.get("BLON_CL_CD") == "20":
                seq = str(o.get("USER_ID", "")).strip()
                nm = str(o.get("USER_NM", "")).strip()
                if seq and nm and seq not in m:
                    m[seq] = nm
        if m:
            _dir_cache["map"] = m
            _dir_cache["ts"] = now
    except Exception:
        pass
    return _dir_cache["map"]


def _worker_name(seq) -> str:
    return _worker_directory().get(str(seq or "").strip(), "")


def _busi_directory() -> dict:
    now = time.time()
    if _busi_cache["map"] and now - _busi_cache["ts"] < 3600:
        return _busi_cache["map"]
    try:
        r = requests.get(f"{AWMS}/getBusiList?DEPT1={CONFIG['DEPT1']}", headers=_headers(), timeout=15)
        body = r.json() if "json" in r.headers.get("content-type", "") else None
        arr = body if isinstance(body, list) else ((body or {}).get("data") or (body or {}).get("list") or [])
        m = {str(o.get("CONS_NO", "")).strip(): str(o.get("CONS_NM", "")).strip() for o in arr if o.get("CONS_NO")}
        if m:
            _busi_cache["map"] = m
            _busi_cache["ts"] = now
    except Exception:
        pass
    return _busi_cache["map"]


def _busi_name(busi_num) -> str:
    return _busi_directory().get(str(busi_num or "").strip(), "")


# ── 변대주번호 자동조회 (아미큐 자동채움, 영준님 2026-07-02) ──────────
# 동행(WITH_YN=Y): 계기번호==종로 workStatus new_meter_id(임시저장 포함) → 종로 site-data '변대주'(0000A000)
# 일반(그외):       계기번호==ami-work site-data 계기번호 → 'DCUID' 앞 8자(0000A000)
_JONGNO_SD = ROOT.parent / "jongno-combined" / "data" / "jongno-site-data.json"
_AMIWORK_SD = ROOT / "data" / "site-data.json"
_JONGNO_WS_URL = "https://ami-jongno-default-rtdb.asia-southeast1.firebasedatabase.app/workStatus/jongno.json"
_bdju_cache = {"jsd": None, "asd": None, "ws": None, "ws_ts": 0.0,
               "jsd_mtime": None, "asd_mtime": None}


def _decode_jongno_key(k: str) -> str:
    for a, b in (("__DOT__", "."), ("__HASH__", "#"), ("__DOLLAR__", "$"),
                 ("__SLASH__", "/"), ("__LBRACKET__", "["), ("__RBRACKET__", "]")):
        k = k.replace(a, b)
    return k


def _load_sd(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _sd_cached(key: str, path):
    """site-data 캐시 — 파일이 바뀌면 다시 읽는다(mtime 비교).

    ★2026-08-19 사고: 예전엔 최초 1회만 읽고 영구 보관했다. 8/11 기동 이후 site-data 를
      고쳐도 백엔드는 옛 내용을 계속 들고 있었고, 계기 08550162098 의 변대주가 옛 값
      38554464(LTE 회선번호)로 나갔다(맞는 값은 9625E421, 전산화번호·K-DCU 개소).
      재구동 전에는 스스로 회복할 방법이 없었다.

    ★TTL 이 아니라 mtime 을 쓰는 이유: site-data 는 8MB 다. 시간이 지났다고 다시 파싱하면
      바뀐 게 없어도 매번 비용을 낸다. mtime 은 stat 한 번(마이크로초)이고, 파일이 바뀔
      때만 재파싱한다. 종로 workStatus 는 원격 URL 이라 mtime 이 없어 기존 3분 TTL 유지.
    """
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        mtime = None
    if _bdju_cache[key] is None or _bdju_cache[key + "_mtime"] != mtime:
        _bdju_cache[key] = _load_sd(path)
        _bdju_cache[key + "_mtime"] = mtime
        print(f"[bdju] {key} 재적재: {len(_bdju_cache[key])}건 mtime={mtime}", flush=True)
    return _bdju_cache[key]


def _jongno_ws():
    now = time.time()
    if _bdju_cache["ws"] is None or now - _bdju_cache["ws_ts"] > 180:   # 3분 캐시
        try:
            with urllib.request.urlopen(_JONGNO_WS_URL, timeout=60) as r:
                _bdju_cache["ws"] = json.load(r); _bdju_cache["ws_ts"] = now
        except Exception:
            if _bdju_cache["ws"] is None:
                _bdju_cache["ws"] = {}
    return _bdju_cache["ws"]


def _bdju_donghang(mid: str) -> str:
    ws = _jongno_ws()
    jsd = _sd_cached("jsd", _JONGNO_SD)
    for k, v in ws.items():
        if not isinstance(v, dict):
            continue
        rl = v.get("replacement_list") or {}
        if not isinstance(rl, dict):
            continue
        for oldid, r in rl.items():
            if isinstance(r, dict) and str(r.get("new_meter_id", "")) == mid:
                addr = _decode_jongno_key(k).strip()
                for m in jsd:
                    if str(m.get("계기번호")) == str(oldid) or str(m.get("주소", "")).strip() == addr:
                        b = str(m.get("변대주") or "").strip()
                        if b:
                            return b
    return ""


def _bdju_ilban(mid: str) -> str:
    for m in _sd_cached("asd", _AMIWORK_SD):
        if str(m.get("계기번호")) == mid:
            d = str(m.get("DCUID") or "").strip()
            return d[:8] if len(d) >= 8 else ""
    return ""


@app.get("/api/bdju")
def api_bdju(meters: str = ""):
    """변대주번호(0000A000) 자동조회. meters=쉼표구분(마스터,슬레이브…), 마스터 우선 첫 매칭 반환.
    동행(WITH_YN=Y)=종로 우선 / 일반=ami-work 우선. 못 찾으면 반대 소스도 시도."""
    mids = [x.strip() for x in meters.split(",") if x.strip()]
    donghang = str(CONFIG.get("WITH_YN", "")).strip() == "Y"
    primary, secondary = (_bdju_donghang, _bdju_ilban) if donghang else (_bdju_ilban, _bdju_donghang)
    for mid in mids:
        if len(mid) < 10:
            continue
        b = primary(mid) or secondary(mid)
        if b:
            return {"bdju": b, "meter": mid, "donghang": donghang}
    return {"bdju": "", "donghang": donghang}


OCR_SWIFT = ROOT / "research" / "ocr_poc" / "visionocr_batch.swift"


# ── 계기번호 추출 = E5 처방 적용 (ocr-meter 실측 2026-07-14) ──
# 상단18%(LCD·MAC) 제외 + Amigo/하이픈/11자리 후보 + over-read 폴백(타입코드 유효 11자 윈도우)
# + 선택: Amigo 우선 → 하이픈 후보 우선 → 라인내 11자리, max(conf, y중앙근접).
# E5 변경 4가지:
#   1. 타입코드 필터 강제: 모든 11자리 후보에 digits[2:4] in _METER_TYPE_CODES 검증
#   2. 공백·하이픈 낀 11자리 정규화: 라인 digits가 정확히 11자리+타입유효면 채택
#   3. 하이픈 끝 4자리 요구 완화: -(\d{4}) 제거 → (\d{6,7}) 로 (부가번호 잘려도 통과)
#   4. 인접 1줄 결합 하이픈 앵커: y차≤0.05인 바로 아랫줄과 결합해서도 하이픈 탐색
# 유지: 상단18%컷·Amigo 패턴 A\d{10}·over-read 폴백. E6(2줄+ digits 윈도우) 금지.
_METER_11 = re.compile(r'\b(\d{11})\b')
# ★접두 문자를 특정하지 않는다 (2026-08-26, 영준님 지적 "LA 접두를 못 읽는다").
#   예전엔 'A + 숫자 10자리'(_AMIGO_PAT) 만 따로 잡아서, 'LA530122916' 처럼 접두가 두 글자면
#   Amigo 경로에서 빠지고 숫자 11자리 경로에서도 자릿수가 모자라 통째로 못 읽었다.
#   계기타입은 **3~4번째 자리**로 판정하므로 앞에 무엇이 붙든 상관없다. 그래서 접두 목록을
#   늘리는 대신 '영숫자 11자리' 를 후보로 잡고, 아래 타입코드 필터로 걸러 낸다.
#   ★넓혀도 오검출이 늘지 않는 이유 = 모든 후보에 digits[2:4] in _METER_TYPE_CODES 를
#     강제하기 때문이다(E5 처방 1). 'REPLACEMENT' 같은 영문 11자는 [2:4]='PL' 이라 걸러진다.
_ALNUM_11 = re.compile(r'\b([0-9A-Z]{11})\b', re.IGNORECASE)
# E5 처방 3: 끝 4자리(-\d{4}) 삭제 → (\d{6,7}) 로 완화. 부가번호(-1607 등) 없어도 통과.
_METER_HYPHEN = re.compile(r'(\d{2})\s*[-]\s*(\d{2})\s*[-]\s*(\d{6,7})')
_AMIGO_HYPHEN = re.compile(r'A0\s*[-]\s*55\s*[-]\s*(\d{7,8})', re.IGNORECASE)
_METER_TYPE_CODES = {'17', '19', '25', '26', '27', '45', '46', '47', '53', '55'}


def _hyphen_search(text: str):
    """하이픈 패턴 탐색 → 11자리 계기번호 목록 반환. 없으면 []."""
    results = []
    for m in _METER_HYPHEN.finditer(text):
        merged = m.group(1) + m.group(2) + m.group(3)
        mid = merged[:11]
        if len(mid) == 11 and mid[2:4] in _METER_TYPE_CODES:
            results.append(mid)
    return results


def _extract_meter_no(lines):
    """[(y,conf,text)] → 계기번호. E5 처방 적용(ocr-meter 실측 2026-07-14).

    채택 우선순위: Amigo → 하이픈 후보 → 라인내 11자리(타입코드 유효), max(conf, y중앙근접).
    """
    lines = [(y, c, t) for y, c, t in lines if y > 0.18]   # 상단 18%(LCD표시·MAC) 제외
    cand_hyphen, cand11, candA = [], [], []

    for idx, (y, conf, text) in enumerate(lines):
        # 문자 접두 계기 (A0530163039 · LA530122916 …) — 접두 종류를 세지 않는다.
        #   영숫자 11자리 중 **문자가 섞인 것**을 여기로 보낸다(순수 숫자는 아래 cand11).
        #   타입코드 필터를 통과한 것만 담으므로 잡문자열은 걸러진다.
        for m in _ALNUM_11.finditer(text):
            w = m.group(1).upper()
            if not w.isdigit() and w[2:4] in _METER_TYPE_CODES:
                candA.append((y, conf, w))
        for m in _AMIGO_HYPHEN.finditer(text):
            amigo = 'A055' + re.sub(r'[^0-9]', '', m.group(1))
            if len(amigo) == 11:
                candA.append((y, conf, amigo.upper()))

        # E5 처방 4: 인접 1줄(y차≤0.05) 결합 하이픈 탐색
        # 현재 라인 단독 + 현재+다음줄 결합 둘 다 탐색
        texts_to_search = [text]
        if idx + 1 < len(lines):
            ny, nc, nt = lines[idx + 1]
            if abs(ny - y) <= 0.05:
                texts_to_search.append(text + " " + nt)
        for t2 in texts_to_search:
            for mid in _hyphen_search(t2):
                cand_hyphen.append((y, conf, mid))

        # E5 처방 1+2: 라인내 11자리 — 타입코드 필터 강제
        # 처방 2: 공백·하이픈 제거 후 정확히 11자리이면 채택
        digits_only = re.sub(r'[\s\-]', '', text).upper()
        if re.match(r'^[0-9A-Z]{11}$', digits_only) and digits_only[2:4] in _METER_TYPE_CODES:
            # 문자가 섞였으면 위와 같은 이유로 문자접두 후보 쪽에 넣는다(우선순위 유지).
            (cand11 if digits_only.isdigit() else candA).append((y, conf, digits_only))
        else:
            # 처방 1: \b\d{11}\b 매치 후 타입코드 유효한 것만
            for m in _METER_11.finditer(text):
                w = m.group(1)
                if w[2:4] in _METER_TYPE_CODES:
                    cand11.append((y, conf, w))

    # 하이픈 후보가 이미 있으면 라인내 11자리와 분리해 우선 처리
    # (처방: 하이픈 후보 우선 → 없으면 라인내 11자리)
    effective11 = cand_hyphen if cand_hyphen else cand11

    # over-read 폴백: 깨끗한 11자 후보 없으면 긴 숫자열(12+)에서 타입코드 유효 11자 윈도우 수집
    if not effective11 and not candA:
        for y, conf, text in lines:
            for run in re.findall(r'\d{12,}', re.sub(r'[^0-9]', '', text)):
                for i in range(len(run) - 10):
                    w = run[i:i + 11]
                    if w[2:4] in _METER_TYPE_CODES:
                        effective11.append((y, conf, w))

    if candA:
        return max(candA, key=lambda x: x[1])[2]
    if effective11:
        # 신뢰도 우선, 동점이면 y중앙 근접 (명판=중앙, 스펙문구보다 우선)
        return max(effective11, key=lambda x: (x[1], -abs(x[0] - 0.5)))[2]
    return ''


# ── OCR 실패 표본 수집 헬퍼 (계약 스키마=ocr-meter 정본, 여기는 쓰기 구현만) ──
def _pixel_sha256(img_bytes: bytes) -> str:
    """JPEG 디코드 픽셀의 sha256 — EXIF 등 메타데이터 차이에 무관(실측 확인: stampExifTime은
    APP1 세그먼트만 덮어쓰고 픽셀은 불변). saveAct 시점 매칭 키로 그대로 재사용 가능."""
    try:
        with Image.open(io.BytesIO(img_bytes)) as im:
            im = im.convert("RGB")
            return hashlib.sha256(im.tobytes()).hexdigest(), im.size
    except Exception:
        return "", None


def _ocr_near_miss(lines):
    """표본메타 ocr_extracted 전용 — 타입코드 불일치 등으로 _extract_meter_no가 기각했을 11자리
    후보(타입코드 무관, 최고 신뢰도 1개). _extract_meter_no의 실제 판정에는 전혀 관여하지 않는
    진단용 부가정보일 뿐 — "완전실패"와 "후보는 있었지만 기각"을 표본에서 구분하기 위함."""
    best = None
    for y, conf, text in lines:
        digits_only = re.sub(r'[\s\-]', '', text)
        for m in re.finditer(r'\d{11}', digits_only):
            if best is None or conf > best[0]:
                best = (conf, m.group(0))
    return best[1] if best else ""


def _ocr_sample_save_pending(photo_bytes: bytes, lines, photo_slot: str):
    """OCR 실패(계기번호 미추출) 표본을 pending/에 저장. 전부 예외격리 — 실패해도 /api/ocr
    응답에 영향 0. 내부 해시색인(.hash_index.json)은 ocr-meter 스키마 밖(우리 쪽 매칭 최적화용)."""
    try:
        h, size = _pixel_sha256(photo_bytes)
        if not h:
            return
        AMIQ_OCR_PENDING.mkdir(parents=True, exist_ok=True)
        now = datetime.now(KST)
        base = f"{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        (AMIQ_OCR_PENDING / f"{base}.jpg").write_bytes(photo_bytes)
        meta = {
            "schema_version": 1,
            "source": "amiqueue",
            "sample_id": base,
            "captured_at_kst": now.isoformat(),
            "ocr_logic_version": _OCR_LOGIC_VER,
            "photo_slot": photo_slot,
            "worker_id": None,
            "ocr_engine": "apple_vision",
            "ocr_raw_lines": [[y, c, t] for y, c, t in lines],
            "ocr_extracted": _ocr_near_miss(lines),
            "resolution": list(size) if size else None,
            "crop_state": "raw",
            "label": {
                "status": "pending", "meter_no": None, "match_method": None,
                "match_confidence": None, "matched_at_kst": None, "matched_from": None,
            },
        }
        (AMIQ_OCR_PENDING / f"{base}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        idx_path = AMIQ_OCR_PENDING / ".hash_index.json"
        idx = {}
        try: idx = json.loads(idx_path.read_text(encoding="utf-8"))
        except Exception: pass
        idx.setdefault(h, []).append(base)
        idx_path.write_text(json.dumps(idx), encoding="utf-8")
    except Exception:
        pass


def _ocr_sample_try_match(photo_bytes: bytes, meter_no: str):
    """saveAct 제출 시점 — 같은 사진(픽셀해시)이 pending에 있으면 작업자 확정값을 정답으로
    붙여 labeled/로 이동. 매칭 실패/충돌/타입코드 불통과는 대기풀에서 정리(학습승격 안 함).
    전부 예외격리 — 실패해도 saveAct 등록에 영향 0."""
    try:
        if not meter_no:
            return
        h, _ = _pixel_sha256(photo_bytes)
        if not h:
            return
        idx_path = AMIQ_OCR_PENDING / ".hash_index.json"
        if not idx_path.exists():
            return
        idx = json.loads(idx_path.read_text(encoding="utf-8"))
        sample_ids = idx.get(h, [])
        if not sample_ids:
            return

        def _discard(sid):
            for ext in (".json", ".jpg"):
                try: (AMIQ_OCR_PENDING / f"{sid}{ext}").unlink()
                except Exception: pass

        del idx[h]
        idx_path.write_text(json.dumps(idx), encoding="utf-8")

        if len(sample_ids) > 1:   # 픽셀해시 동일 표본 2건 이상 — conflict, 학습 제외
            for sid in sample_ids: _discard(sid)
            return
        sid = sample_ids[0]
        jf = AMIQ_OCR_PENDING / f"{sid}.json"
        img_p = AMIQ_OCR_PENDING / f"{sid}.jpg"
        if not jf.exists() or not img_p.exists():
            return
        type_code = meter_no[2:4] if len(meter_no) >= 4 else ""
        if type_code not in _METER_TYPE_CODES:   # 타입코드 검증 게이트 — 실질 방어선(작업자 오입력 필터)
            _discard(sid)
            return
        meta = json.loads(jf.read_text(encoding="utf-8"))
        meta["label"] = {
            "status": "matched", "meter_no": meter_no,
            "match_method": "pixel_sha256", "match_confidence": 1.0,
            "matched_at_kst": datetime.now(KST).isoformat(),
            "matched_from": f"saveAct:{meter_no}",
        }
        AMIQ_OCR_LABELED.mkdir(parents=True, exist_ok=True)
        (AMIQ_OCR_LABELED / f"{sid}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
        img_p.rename(AMIQ_OCR_LABELED / f"{sid}.jpg")
        jf.unlink()
    except Exception:
        pass


def _ocr_sample_cleanup_pending():
    """pending 14일 미매칭 자동삭제(ocr-meter 정책). 기동 시 안전망 — _cleanup_old_temp와 동일 패턴."""
    try:
        if not AMIQ_OCR_PENDING.exists():
            return
        now = time.time()
        stale = set()
        for jf in AMIQ_OCR_PENDING.glob("*.json"):
            if jf.name == ".hash_index.json":
                continue
            try:
                if now - jf.stat().st_mtime > AMIQ_OCR_PENDING_TTL_SEC:
                    stale.add(jf.stem)
                    jf.unlink()
                    (AMIQ_OCR_PENDING / f"{jf.stem}.jpg").unlink(missing_ok=True)
            except Exception:
                pass
        if stale:
            idx_path = AMIQ_OCR_PENDING / ".hash_index.json"
            try:
                idx = json.loads(idx_path.read_text(encoding="utf-8"))
                idx = {h: [s for s in sids if s not in stale] for h, sids in idx.items()}
                idx = {h: sids for h, sids in idx.items() if sids}
                idx_path.write_text(json.dumps(idx), encoding="utf-8")
            except Exception:
                pass
    except Exception:
        pass


_ocr_sample_cleanup_pending()   # 기동 시 pending 14일 만료분 정리(무한적재 방지 안전망)


@app.post("/api/ocr")
def api_ocr(body: dict = Body(...)):
    """사진(base64) 리스트 → AppleVision 계기번호 추출.
    body = {"images":[{"id":..,"b64":"data:image/jpeg;base64,.."}]}
    return {"results":[{"id","meterNo","raw"}]}
    """
    images = body.get("images", [])
    if not images:
        return {"results": []}
    tmpd = Path(tempfile.mkdtemp(prefix="cstocr_"))
    paths = []
    for i, im in enumerate(images):
        b64 = (im.get("b64") or "").split(",")[-1]
        if not b64:
            continue
        p = tmpd / f"{i}.jpg"
        try:
            p.write_bytes(base64.b64decode(b64))
            paths.append((im.get("id", str(i)), p))
        except Exception:
            pass
    listfile = tmpd / "list.txt"
    listfile.write_text("\n".join(str(p) for _, p in paths))
    try:
        try:
            out = subprocess.run(["swift", str(OCR_SWIFT), str(listfile)],
                                 capture_output=True, text=True, timeout=180).stdout
        except Exception as e:
            raise HTTPException(500, f"OCR 실패: {e}")
        # ===FILE:path=== 블록별 (y, conf, text) 수집 (swift 출력: y\tconf\ttext)
        blocks, cur = {}, None
        for ln in out.splitlines():
            if ln.startswith("===FILE:"):
                cur = ln[len("===FILE:"):].rstrip("="); blocks[cur] = []
            elif cur and "\t" in ln:
                parts = ln.split("\t")
                if len(parts) >= 3:
                    try: blocks[cur].append((float(parts[0]), float(parts[1]), parts[2]))
                    except Exception: pass
        results = []
        for iid, p in paths:
            lines = blocks.get(str(p), [])
            meter_no = _extract_meter_no(lines)
            results.append({"id": iid, "meterNo": meter_no,
                            "raw": " | ".join(t for _, _, t in lines)[:240]})
            if not meter_no:   # 실패 표본 수집 — 응답 조립과 완전 분리, 실패해도 위 결과엔 영향 0
                try:
                    _ocr_sample_save_pending(p.read_bytes(), lines, str(iid))
                except Exception:
                    pass
        return {"results": results}
    finally:
        shutil.rmtree(tmpd, ignore_errors=True)   # 받은 사진 즉시 정리(맥 누적 방지)


def _photos_to_files(photos, tmpd):
    """{슬롯키: base64 dataURL} → {ATCH_FILE_ID_<k>_SRC: 임시파일경로}."""
    out = {}
    for k, v in (photos or {}).items():
        if not v:
            continue
        b64 = str(v).split(",")[-1]
        p = tmpd / f"a{k}.jpg"
        try:
            p.write_bytes(base64.b64decode(b64)); out[f"ATCH_FILE_ID_{k}_SRC"] = str(p)
        except Exception:
            pass
    return out


# ── 큐/전송 아카이브 (영준님 2026-07-29: "올리더라도 지우지 말고 1달 보관") ──────────
# 배경: saveAct 후 tmpd를 즉시 rmtree 해서, 큐에서 지운 건의 계기·모뎀맥·사진을 복원할 길이
#       전혀 없었다(2026-07-29 삭제큐 2건 복원 실패 사고). 전송 성공해도 30일간 남긴다.
# 위치는 레포 밖 홈 하위 — 사진이 쌓이므로 git에 절대 들어가면 안 됨.
ARCHIVE_DIR = Path.home() / ".ami-cst-archive"
ARCHIVE_KEEP_DAYS = 30


def _archive_cleanup(keep_days=ARCHIVE_KEEP_DAYS):
    """보관기간(기본 30일) 지난 일자폴더 삭제. 폴더명(YYYYMMDD) 기준, 파싱 실패 시 mtime.
    ★기동 시에도 호출되므로 무슨 일이 있어도 예외를 밖으로 던지지 않는다(백엔드 기동 실패 방지)."""
    try:
        if not ARCHIVE_DIR.exists():
            return
        limit = datetime.now(KST).date() - timedelta(days=keep_days)
        for d in ARCHIVE_DIR.iterdir():
            try:
                if not d.is_dir():
                    continue
                try:
                    day = datetime.strptime(d.name, "%Y%m%d").date()
                except ValueError:
                    day = datetime.fromtimestamp(d.stat().st_mtime, KST).date()
                if day < limit:
                    shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
    except Exception:
        pass


def _archive_begin(body):
    """전송 시작 시 잡 폴더 생성 + 요청 스냅샷 기록. 실패해도 None 반환(전송엔 영향 0)."""
    try:
        _archive_cleanup()
        now = datetime.now(KST)
        m = body.get("master") or {}
        mb = str(m.get("meterNo", "")).strip() or "unknown"
        jd = ARCHIVE_DIR / now.strftime("%Y%m%d") / f"{now.strftime('%H%M%S')}_{mb}"
        jd.mkdir(parents=True, exist_ok=True)
        _archive_write(jd, patch={
            "ts": now.isoformat(),
            "mode": body.get("mode", ""), "ham": body.get("ham", ""),
            "extMac": body.get("extMac", ""), "replaceReason": body.get("replaceReason", ""),
            "bdju": body.get("bdju", ""), "commSuffix": body.get("commSuffix", ""),
            "config": {k: CONFIG.get(k, "") for k in
                       ("DEPT1", "DEPT2", "BUSI_NUM", "WORKER1_SEQ", "WORKER2_SEQ", "WITH_YN")},
            "master": {"meterNo": m.get("meterNo", ""), "mac": m.get("mac", ""),
                       "photoSlots": sorted((m.get("photos") or {}).keys())},
            "slaves": [{"meterNo": s.get("meterNo", ""),
                        "photoSlots": sorted((s.get("photos") or {}).keys())}
                       for s in body.get("slaves", [])],
            "sent": [], "status": "sending",
        })
        return jd
    except Exception:
        return None


def _archive_write(jd, patch=None, sent=None, status=None):
    """job.json 갱신(읽기-병합-쓰기). 아카이브 실패는 전송을 막지 않는다(전부 삼킴)."""
    if not jd:
        return
    try:
        f = jd / "job.json"
        job = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
        if patch:
            job.update(patch)
        if sent:
            job.setdefault("sent", []).append(sent)
        if status:
            job["status"] = status
            job["finishedAt"] = datetime.now(KST).isoformat()
        f.write_text(json.dumps(job, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception:
        pass


def _archive_photos(jd, role, files: dict):
    """전송에 쓴 사진을 잡 폴더로 복사. base64 재적재 없이 copy2 (큐 OOM 전례 회피).
    files = {'ATCH_FILE_ID_5_SRC': 임시경로, ...} → 반환 {슬롯: 저장파일명}.
    ★전송(post) 전에 호출한다 — 전송이 터져도 사진은 남게."""
    saved = {}
    if not jd:
        return saved
    for k, v in (files or {}).items():
        if not k.endswith("_SRC"):
            continue
        slot = k[len("ATCH_FILE_ID_"):-len("_SRC")]
        name = f"{role}_{slot}.jpg"
        try:
            shutil.copy2(v, jd / name)
            saved[slot] = name
        except Exception:
            pass
    return saved


_archive_cleanup()   # 기동 시 보관기간(30일) 지난 전송 아카이브 정리


def _saveact_precheck():
    """전송 전 게이트(세션·공사설정). 두 엔드포인트(classic/stream) 공용. 실패 시 HTTPException."""
    if not session_alive():
        raise HTTPException(401, "awms 세션 만료 — 폰 재로그인 후 세션 다시 가져오기")
    # 631 NOT NULL 프리플라이트: 필수 식별필드 빈값이면 거부 (라이브 631 디버깅 비용 회피).
    miss = [k for k in ("WORKER1_SEQ", "WORKER2_SEQ", "BUSI_NUM", "DEPT1", "DEPT2") if not str(CONFIG.get(k, "")).strip()]
    if miss:
        raise HTTPException(400, f"공사설정 누락: {', '.join(miss)} — 설정페이지/세션 가져오기로 채우세요")


def _saveact_core(body):
    """마스터 1 + 슬레이브 N 결합 등록의 실제 로직. 진행 이벤트를 yield하는 제너레이터.
    yield: {"type":"start","total":n}
         / {"type":"item","role","meterNo","idx","total","ok"}  (건별 등록 직후)
         / {"type":"done","results":[...]}                       (마지막, 전체 결과)
    classic 엔드포인트는 이 제너레이터를 소비해 done의 results만 반환(출력 바이트 동일 유지).
    stream 엔드포인트는 각 이벤트를 NDJSON 한 줄로 흘려보냄.
    ★ fid3/fid4 마스터→슬레이브 공유·순차 로직은 종전과 동일 — 감싸기만."""
    # ★폰이 실제로 보낸 원본 키 — 2026-08-11 진단(체크박스가 반영 안 된다는 보고).
    #   "폰이 안 보냄"과 "백엔드가 무시함"을 가르는 유일한 증거. 사진 base64는 찍지 않는다.
    print(f"[saveact:raw] keys={sorted(body.keys())} "
          f"extConn={body.get('extConn')!r} addl={body.get('addl')!r} "
          f"ham={body.get('ham')!r} mode={body.get('mode')!r} "
          f"extMac={body.get('extMac')!r} replaceReason={body.get('replaceReason')!r} "
          f"master.meterNo={(body.get('master') or {}).get('meterNo')!r}", flush=True)
    tmpd = Path(tempfile.mkdtemp(prefix="cstsave_"))
    m = body["master"]; mb = m["meterNo"]; mac = m["mac"]
    slaves = body.get("slaves", [])
    n = 1 + len(slaves)
    arch = _archive_begin(body)   # ★큐/사진 30일 보관 — 전송 성공해도 지우지 않음
    yield {"type": "start", "total": n}
    # ── 마스터 통신방식(suffix) 확정: 직접선택(commSuffix) 우선 → 자동판별 → LTE는 계기유형으로 ──
    m_instM = infer_inst_m(mb)
    override = str(body.get("commSuffix", "")).strip()   # 프론트 직접선택 '10'/'20'/'40'/'70'/'80'/'90'/'92'
    if override:
        if override not in _COMM_LABEL:
            raise HTTPException(400, f"통신방식 코드 오류: {override}")
        master_suffix = override
        m_inst_s = m_instM + override
    else:
        auto = infer_inst_s(m_instM, mac)               # 자동(맥/계기유형). 미상이면 ''
        if not auto:
            raise HTTPException(400, "통신방식 미상(혼재/미판별) — 직접 선택 필요(commSuffix)")
        m_inst_s = auto
        master_suffix = auto[-2:]                        # 슬레이브 상속용 (LTE도 70/92로 확정된 끝2자리)
    # 작업구분(awms getCommonCode P_CODE=M10): 신설 M1010(기본) / 기설 M1030 / 교체 M1020.
    #   기설 = 리스트밖 계기를 마스터로 쓰는 경우(ami-queue-design.md).
    #   교체 = 기존 모뎀을 떼고 새 모뎀을 다는 경우. 장애(LP 미수신) 리스트가 이 유형이다(영준님 2026-09-02).
    _MODE_WORK_DIV = {"existing": "M1030", "replace": "M1020"}
    mode = str(body.get("mode", "")).strip()
    work_div = _MODE_WORK_DIV.get(mode, "M1010")
    is_replace = work_div == "M1020"
    # ── 교체(M1020) 전용 필드 (awms MOBCST1000 화면 실측 2026-09-02) ──
    #   기존 모뎀맥 = EXT_FCTY_ID. ★EXT_MAC_MODEM 이 아니다 — 그건 '기존 인입망 모뎀' 칸이다.
    #     화면은 M1020 일 때만 활성/필수. 마스터·슬레이브가 같은 값을 싣는다(실측: 7793 20260722 맥
    #     E0AEED916F68 그룹 마스터1+슬레이브3 전건 M1020 + 동일 EXT_FCTY_ID).
    #   구분상세 = REMV_MEMO (M1020 일 때만 활성/필수). M102010 신호미약 / M102020 모뎀불량 / M102030 마스터 변경.
    #     실측상 마스터에만 들어가고 슬레이브는 빈값이다.
    ext_mac = str(body.get("extMac", "")).strip().upper().replace("-", "").replace(":", "")
    replace_reason = str(body.get("replaceReason", "")).strip()
    if is_replace:
        if not ext_mac:
            raise HTTPException(400, "교체(M1020)는 기존 모뎀맥이 필수다")
        if replace_reason and replace_reason not in ("M102010", "M102020", "M102030"):
            raise HTTPException(400, f"교체 구분상세 코드 오류: {replace_reason}")
    # 변대주 → DCU_ID: [신설(M1010)] + [PLC계열: 10 ks-plc/20 hpgp/90 k-dcu] + [변대주있음] 에서만 (영준님 2026-07-15).
    #   DCU_ID = 변대주 전산화번호(DCUID 앞8자, 끝2 제외) 그대로. +00 아님. 기설(M1030)은 미입력. iot-plc(80)·IP-HPGP(85) 미사용. 마스터·슬레이브 동일.
    bdju = str(body.get("bdju", "")).strip()
    #   교체(M1020)도 채운다 — awms 화면의 DATA_NUM watch 는 작업구분을 보지 않고 변대주만 있으면 DCU_ID 를
    #   계산한다(MOBCST1000.html 'mainList.currentRow.DATA_NUM' 핸들러, 2026-09-02 실측). 교체는 기존 PLC
    #   선에 그대로 물리는 작업이라 변대주가 있다. 기설(M1030)은 종전대로 미입력.
    dcu_id = bdju if (work_div in ("M1010", "M1020") and bdju and master_suffix in ("10", "20", "90")) else ""
    # ★DCU_ID 는 우리가 직접 채운다 (2026-08-29). 2026-07-15 실측 당시엔 DATA_NUM만 보내면 awms가
    #   DCU_ID를 자동생성했으나, awms가 2026-07-27 개편(BUILTIN_YN 신규필드와 같은 시점)된 뒤로
    #   자동생성이 사라져 saveAct 직접호출 건만 DCU_ID가 빈 채 저장됐다 → LP 미수신·미개통 누적.
    # ★조회 API 가 아니라 awms '화면이 계산해서' 넣는 값이다. 아래는 그 계산식을 그대로 옮긴 것.
    #   원본 = MOBCST1000 화면 watch 핸들러 'mainList.currentRow.DATA_NUM'
    #   경로 https://awms.kdn.com/service/ami/html/sub/mob/cst/MOBCST1000.html?app=MOBCST
    #     dcu_id = DATA_NUM + (BIZ_DGR 없으면 '6' 아니면 BIZ_DGR) + 통신방식코드(_DCU_COMM_CODE)
    #   통신방식코드에 없는 코드면 화면은 DCU_ID 를 빈값으로 만든다(default: dcu_id = "").
    #   ★접미를 '64'/'6' 리터럴로 굳히지 마라 — 그건 BIZ_DGR 가 빈값(=6)일 때만 맞는 결과다.
    # ★한전 DCU 대장(간선망_해지_정지대상.xlsx)의 DCU ID를 넣지 마라 — awms 표기와 일치율 0이다.
    biz_dgr = str(CONFIG.get("BIZ_DGR", "") or "").strip()   # awms 작업조 설정값. 현재는 빈값 → '6'
    dcu_full = ""
    if dcu_id and master_suffix in _DCU_COMM_CODE:
        dcu_full = dcu_id + (biz_dgr or "6") + _DCU_COMM_CODE[master_suffix]
    # 함체유형(영준님 2026-07-02): 단독+슬0→단독형(10, 대표계기·함내수 빈칸) / 단독+슬有→집합형단독(40) / 집합→그대로(20)
    # 집합형(추가)(영준님 2026-08-11): 같은 함체에 이미 다른 마스터가 등록돼 있으면 폰에서 addl 체크 → 20 대신 30.
    #   아미큐는 마스터를 한 건씩 담아 awms의 order(몇 번째 마스터인지)를 모르므로 작업자가 직접 표시한다.
    #   단독형(10)·집합형단독(40) 경로는 건드리지 않는다 — 집합일 때만 의미가 있다.
    ham = str(body.get("ham", "")).strip()
    addl = str(body.get("addl", "")).strip().lower() in ("1", "true", "y", "yes")
    solo_blank = (ham == "단독" and len(slaves) == 0)   # 단독형: 대표계기·함내수 빈칸
    fclty = "10" if solo_blank else ("40" if ham == "단독" else ("30" if addl else "20"))
    # 외장형 연결장치(EXT_CONN_DEV) — 값은 'Y'/'N'.
    #   ★체크 안 하면 'N' 고정이다(영준님 2026-08-31). 키를 빼는 게 아니라 N 을 넣는다.
    #   awms 화면(MOBCST1000)도 같다: INST_M watch 가 매번 'N' 으로 리셋하고, select 는
    #   INST_M != 'HW4040' 이면 disabled 라 AE 가 아니면 N 에서 못 벗어난다. 실측도 헬퍼 등록건 100% 채움.
    #   따라서 AE(HW4040) + 작업자 체크 일 때만 'Y', 그 외는 전부 'N'.
    ext_conn = "Y" if (m_instM == "HW4040" and str(body.get("extConn", "")).strip().upper() == "Y") else "N"
    # 마스터
    mf = _common(mb, mac, m_instM, mb, n, m_inst_s, bungi="")
    mf["MODEM_DIV"] = "10"; mf["WORK_DIV"] = work_div; mf["FCLTY_DIV"] = fclty
    mf["EXT_CONN_DEV"] = ext_conn   # 항상 싣는다(미체크=N). 화면 기본값과 동일
    if is_replace:
        mf["EXT_FCTY_ID"] = ext_mac          # 기존 모뎀맥
        if replace_reason:
            mf["REMV_MEMO"] = replace_reason  # 구분상세 — 마스터만
    if solo_blank:
        # 빈값 ""은 awms Java parseInt 폭발(→500/실패). 빈칸=키 자체를 omit ([[awms_saveact_500_fix]] 패턴)
        mf.pop("MB_METER_ID", None); mf.pop("MB_CNT", None)
    if dcu_id:
        mf["DATA_NUM"] = dcu_id     # ★변대주 전산화번호 = awms 화면 '변대주' 칸(필드명 DATA_NUM)
        mf["DCU_ID"] = dcu_full     # 변대주+접미. awms 자동생성이 2026-07-27 개편으로 사라져 직접 채운다
    mp = _photos_to_files(m.get("photos", {}), tmpd)
    m_saved = _archive_photos(arch, "master", mp)   # 전송 전 보관(전송 실패해도 사진 남김)
    res_m = saveact_post(mf, mp)
    # 진단 로그. stale이면 경고를 같이 붙인다 — 전송 1건 만에 "옛 코드로 돌고 있다"가 드러난다.
    print(f"[saveact] master {mb} workDiv={work_div} ham={ham or '집합'} addl={addl} fclty={fclty} "
          f"instM={m_instM} extConn={ext_conn}"
          f"{f' extMac={ext_mac} reason={replace_reason or None}' if is_replace else ''}"
          f" → {res_m}{_stale_note()}", flush=True)
    _archive_write(arch, sent={"role": "master", "meterNo": mb, "fields": mf,
                               "photos": m_saved, "resp": res_m,
                               "ok": bool(res_m.get("result") == 1)})
    try:   # OCR 실패표본 매칭(슬롯5=계기판 사진) — saveAct 흐름과 완전분리
        p5 = m.get("photos", {}).get("5")
        if p5:
            _ocr_sample_try_match(base64.b64decode(str(p5).split(",")[-1]), mb)
    except Exception:
        pass
    fid3 = res_m.get("atchFileId3", ""); fid4 = res_m.get("atchFileId4", "")
    results = [{"role": "master", "meterNo": mb, "resp": res_m}]
    yield {"type": "item", "role": "master", "meterNo": mb, "idx": 1, "total": n,
           "ok": bool(res_m.get("result") == 1)}
    # 슬레이브 (헬퍼 조건: INST_S=슬레이브계기타입+마스터suffix 상속, BUNGI=마스터92&아미고?무선:0.5)
    for i, s in enumerate(slaves):
        s_instM = infer_inst_m(s["meterNo"])
        s_inst_s = s_instM + master_suffix
        s_bungi = "무선" if (master_suffix == "92" and s_instM == "HW4050") else "0.5"
        sf = _common(s["meterNo"], mac, s_instM, mb, n, s_inst_s, bungi=s_bungi)
        # 슬레이브 작업구분: 기설(M1030)은 마스터만 — 슬레이브는 신설로 둔다(종전 동작 유지).
        #   교체(M1020)는 다르다. 모뎀을 갈면 그 함체 계기가 통째로 새 모뎀에 붙으므로 슬레이브도 교체다
        #   (awms 실측: 7793 20260722 그룹 마스터1+슬레이브3 전건 M1020 + 동일 EXT_FCTY_ID).
        sf["MODEM_DIV"] = "20"; sf["WORK_DIV"] = "M1020" if is_replace else "M1010"
        sf["EXT_CONN_DEV"] = "N"                           # 슬레이브 체크는 안 받는다 → 미체크=N (헬퍼 실측도 전건 N)
        if is_replace:
            # 기존맥·새맥·구분상세 전부 마스터와 같은 값이 슬레이브에도 들어간다(영준님 2026-09-02).
            #   새맥(MAC_MODEM)은 _common() 이 이미 마스터와 같은 mac 으로 채운다.
            #   ★awms 실측 표본(7793 20260722)은 슬레이브 REMV_MEMO 가 빈값이었는데, 그 건은 마스터도
            #     빈값이라 '슬레이브는 안 넣는다'의 근거가 못 된다. 현장 기준을 따른다.
            sf["EXT_FCTY_ID"] = ext_mac
            if replace_reason:
                sf["REMV_MEMO"] = replace_reason
        sf["FCLTY_DIV"] = fclty                            # 슬레이브도 함체유형 동일(단독+슬有=40 / 집합=20)
        if dcu_id:
            sf["DATA_NUM"] = dcu_id                         # 변대주 = 마스터와 동일(그룹 공유)
            sf["DCU_ID"] = dcu_full                         # 접미도 마스터 통신방식으로 확정(같은 PLC선)
        photos = {"ATCH_FILE_ID_3": fid3, "ATCH_FILE_ID_4": fid4}
        sp = _photos_to_files(s.get("photos", {}), tmpd)
        s_saved = _archive_photos(arch, f"slave{i + 1}", sp)   # 전송 전 보관
        if sp.get("ATCH_FILE_ID_5_SRC"):
            photos["ATCH_FILE_ID_5_SRC"] = sp["ATCH_FILE_ID_5_SRC"]
        res_s = saveact_post(sf, photos)
        print(f"[saveact] slave {s['meterNo']} workDiv={sf['WORK_DIV']} fclty={fclty}"
              f"{f' extMac={ext_mac}' if is_replace else ''} → {res_s}", flush=True)  # 진단 로그
        _archive_write(arch, sent={"role": "slave", "meterNo": s["meterNo"], "fields": sf,
                                   "photos": s_saved, "resp": res_s,
                                   "sharedFileIds": {"ATCH_FILE_ID_3": fid3, "ATCH_FILE_ID_4": fid4},
                                   "ok": bool(res_s.get("result") == 1)})
        try:   # OCR 실패표본 매칭(슬롯5=계기판 사진) — saveAct 흐름과 완전분리
            sp5 = s.get("photos", {}).get("5")
            if sp5:
                _ocr_sample_try_match(base64.b64decode(str(sp5).split(",")[-1]), s["meterNo"])
        except Exception:
            pass
        results.append({"role": "slave", "meterNo": s["meterNo"], "resp": res_s})
        yield {"type": "item", "role": "slave", "meterNo": s["meterNo"], "idx": i + 2, "total": n,
               "ok": bool(res_s.get("result") == 1)}
    shutil.rmtree(tmpd, ignore_errors=True)   # 임시폴더만 정리(원본은 ARCHIVE_DIR에 30일 보관)
    _archive_write(arch, status="done")
    yield {"type": "done", "results": results}


@app.post("/api/saveact")
def api_saveact(body: dict = Body(...)):
    """마스터 1 + 슬레이브 N 결합 등록 (classic). 출력 = {"results":[...]} — 종전과 바이트 동일.
    ★진행표시가 필요한 프론트는 /api/saveact/stream을 먼저 시도하고, 실패 시 이 경로로 폴백."""
    _saveact_precheck()
    results = []
    for ev in _saveact_core(body):
        if ev.get("type") == "done":
            results = ev["results"]
    return {"results": results}


@app.post("/api/saveact/stream")
def api_saveact_stream(body: dict = Body(...)):
    """/api/saveact 진행표시판 — NDJSON 스트림. 건별 등록 직후 item 이벤트, 마지막에 done(전체 결과).
    프리체크(세션/설정)는 스트림 시작 전 정상 HTTPException(401/400)으로 반환. 스트림 시작 후엔
    상태코드 못 바꾸므로 done의 각 resp.result로 성공/실패 판정.
    ★터널(cloudflare) 버퍼링 대비: X-Accel-Buffering:no + content-length 없이 chunked."""
    _saveact_precheck()

    def _gen():
        try:
            for ev in _saveact_core(body):
                yield json.dumps(ev, ensure_ascii=False) + "\n"
        except HTTPException as he:
            yield json.dumps({"type": "error", "detail": he.detail}, ensure_ascii=False) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "detail": str(e)}, ensure_ascii=False) + "\n"

    from fastapi.responses import StreamingResponse
    return StreamingResponse(_gen(), media_type="application/x-ndjson",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"})


@app.get("/api/commtype")
def api_commtype(mac: str = "", meterNo: str = ""):
    """모뎀맥 통신방식 자동판별 + 직접선택 옵션 목록. 프론트 step-mac에서 호출."""
    r = commtype_for(mac, meterNo)
    r["options"] = [{"v": v, "t": t} for v, t in COMM_SUFFIX_LABELS]
    return r


# ── awms 등록 확인 (saveAct 직후 검증) ──────────────────────────────────
@app.post("/api/verify")
def api_verify(body: dict = Body(...)):
    """saveAct result:1 직후 awms getMainList 재조회로 실제 등록 여부 확인.
    body = {"meterNos": ["11자리",...], "mac": "...", "date": "YYYYMMDD"(옵션, 없으면 오늘 KST)}
    return {"verified": bool, "found": [...], "missing": [...], "rows_checked": N}
           또는 {"verified": false, "error": "..."}
    """
    import datetime
    from zoneinfo import ZoneInfo

    meter_nos = body.get("meterNos", [])
    if not meter_nos:
        raise HTTPException(400, "meterNos 필수")

    # 날짜 결정: 파라미터 없으면 KST 오늘
    date_str = str(body.get("date", "") or "").strip()
    if date_str:
        # 입력값 유효성 간단 검사
        if not re.match(r'^\d{8}$', date_str):
            raise HTTPException(400, "date 형식 오류 — YYYYMMDD(8자리)")
    else:
        date_str = datetime.datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y%m%d")

    # 계기번호 정규화: zfill(11) + strip
    def _norm(mid: str) -> str:
        return str(mid or "").strip().zfill(11)

    req_norms = [_norm(m) for m in meter_nos if str(m or "").strip()]
    if not req_norms:
        raise HTTPException(400, "유효한 계기번호 없음")

    # 조회 날짜창: date 명시 시 단일일 / 미지정(일상 큐올림) 시 최근 3일.
    #   getMainList strDate~endDate는 WORK_DATE(작업일) 기준인데 awms 서버 배정일이 등록일과
    #   다를 수 있어(날짜경계·예약), 오늘 하루만 보면 등록됐는데 누락되던 오판 방지.
    explicit_date = bool(str(body.get("date", "") or "").strip())
    if explicit_date:
        start_str = end_str = date_str
    else:
        _today = datetime.datetime.now(ZoneInfo("Asia/Seoul"))
        start_str = (_today - datetime.timedelta(days=2)).strftime("%Y%m%d")
        end_str = _today.strftime("%Y%m%d")

    # getMainList 조회 (기존 _headers() 세션 재사용)
    params = {
        "FLAG": "M10",
        "DEPT1": CONFIG["DEPT1"],
        "DEPT2": CONFIG["DEPT2"],
        "workStep": "25,28,29",
        "pPageNo": "1",
        "pRowCount": "5000",
        "strDate": start_str,
        "endDate": end_str,
    }

    # awms 반영지연(saveAct result:1 직후 DB 미반영) 대비 — 2초 간격 최대 3회 재조회,
    #   요청 계기가 전부 확인되면 조기 종료([[awms_queue_getdetail_cha_bug]] 대기+재시도 패턴).
    registered = set()
    rows_checked = 0
    for attempt in range(3):
        try:
            r = requests.get(f"{AWMS}/getMainList", params=params, headers=_headers(), timeout=30)
        except Exception as e:
            if attempt < 2:
                time.sleep(2); continue
            return JSONResponse({"verified": False, "error": f"getMainList 요청 실패: {e}"})
        if r.status_code != 200 or "json" not in r.headers.get("content-type", ""):
            if attempt < 2:
                time.sleep(2); continue
            return JSONResponse({"verified": False, "error": f"getMainList HTTP {r.status_code} — 세션 만료 또는 서버 오류"})
        try:
            data = r.json()
        except Exception as e:
            if attempt < 2:
                time.sleep(2); continue
            return JSONResponse({"verified": False, "error": f"응답 JSON 파싱 실패: {e}"})
        rows = data if isinstance(data, list) else data.get("rows", data.get("list", []))
        if not isinstance(rows, list):
            if attempt < 2:
                time.sleep(2); continue
            return JSONResponse({"verified": False, "error": f"getMainList 응답 구조 미상: {list(data.keys()) if isinstance(data, dict) else type(data).__name__}"})
        rows_checked = len(rows)
        registered |= {_norm(row.get("INSTR_NUM", "")) for row in rows if isinstance(row, dict)}
        if all(m in registered for m in req_norms):
            break
        if attempt < 2:
            time.sleep(2)

    found = [m for m in req_norms if m in registered]
    missing = [m for m in req_norms if m not in registered]

    return {
        "verified": len(missing) == 0,
        "found": found,
        "missing": missing,
        "rows_checked": rows_checked,
    }


# 정적 UI (마지막에 마운트)
app.mount("/", StaticFiles(directory=str(WWW), html=True), name="www")
