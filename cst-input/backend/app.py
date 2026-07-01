#!/usr/bin/env python3
"""통신팀 awms 맥 입력장치 — 백엔드 (FastAPI).

설계: research/awms-poc/통신팀_맥입력장치_설계.md
정본 페이로드: research/awms-poc/통신팀_saveact_정본.json (PoC 검증)

흐름: 로그인(세션 핸드오프) → 사진수집 → OCR(계기번호) → 맥수집(QR/바코드)
      → 계기번호 확인 → saveAct(마스터+슬레이브 결합) 전송.
PoC 검증 완료(2026-07-01): 맥 직접 saveAct result:1, 마스터+슬레이브 MB_REG_CNT=2.
"""
import json, subprocess, urllib.request, time, os, re, base64, tempfile
from pathlib import Path
import requests
from fastapi import FastAPI, Body, HTTPException
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parents[2]          # ami-work/
WWW = Path(__file__).resolve().parents[1] / "www"   # cst-input/www
CDP_DIR = ROOT / "research" / "awms-poc"             # cdp_cookies.py 등

AWMS = "https://awms.kdn.com/ami/mob/cst/mobCst1000"
CDP_PORT = 9222

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
CONFIG = {"BUSI_NUM": "C11G250023", "WORKER1_SEQ": "273584", "WORKER2_SEQ": "20118",
          "DEPT1": "3970", "DEPT2": "7793",
          "WITH_YN": "", "CRED_ID": "", "CRED_PW": ""}   # WITH_YN=동행시공, CRED=awms계정(자동입력용)
# WORKER1_SEQ=정본 기본값(=로그인 rememberedId, pull시 자동덮어씀), WORKER2_SEQ=정본 작업조2(설정페이지/공사설정 override).
# 631 NOT NULL 재발 방지: 빈값이면 saveAct가 거부(_assert_config). awms 공사설정(menu=01040000) 조회 반영은 본구현 TODO.


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
    "WORK_STEP": "28", "MTR_WITH_YN": "Y", "FCLTY_DIV": "20", "EXT_CONN_DEV": "N",
    "GUBUN": "01", "DCU_SIGONG_CD": "N", "TDU_USE_YN": "N", "mbInsertCnt": "0",
    "ERR_LIST": "[]", "SEAL_UPD": "N", "DANGER_INFO_FLAG": "2",
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
_load_session()   # 재기동 시 디스크 세션 복원 (무USB 자립)


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
    return {"ok": True, "alive": session_alive(), "account": rid,
            "worker1": CONFIG["WORKER1_SEQ"], "worker2": CONFIG["WORKER2_SEQ"]}


@app.get("/api/config")
def api_config():
    return CONFIG


@app.post("/api/config")
def api_config_set(body: dict = Body(...)):
    CONFIG.update({k: v for k, v in body.items() if k in CONFIG})
    return CONFIG


OCR_SWIFT = ROOT / "research" / "ocr_poc" / "visionocr_batch.swift"


# ── 계기번호 추출 = 데이터 검증 포털 방식 이식 (run_vision_batch.extract_meter) ──
# 상단18%(LCD·MAC) 제외 + Amigo/11자리/하이픈 후보 + over-read 폴백(타입코드 유효 11자 윈도우)
# + 선택: Amigo 우선 → 신뢰도 높은 것 → 동점이면 y중앙(0.5) 근접. 스펙문구 숫자 오인 방지.
_METER_11 = re.compile(r'\b(\d{11})\b')
_AMIGO_PAT = re.compile(r'\b(A\d{10})\b', re.IGNORECASE)
_METER_HYPHEN = re.compile(r'(\d{2})\s*[-]\s*(\d{2})\s*[-]\s*(\d{7})\s*[-]\s*(\d{4})')
_AMIGO_HYPHEN = re.compile(r'A0\s*[-]\s*55\s*[-]\s*(\d{7,8})', re.IGNORECASE)
_METER_TYPE_CODES = {'17', '19', '25', '26', '27', '45', '46', '47', '53', '55'}


def _extract_meter_no(lines):
    """[(y,conf,text)] → 계기번호. 검증 포털 extract_meter 이식."""
    lines = [(y, c, t) for y, c, t in lines if y > 0.18]   # 상단 18%(LCD표시·MAC) 제외
    cand11, candA = [], []
    for y, conf, text in lines:
        for m in _METER_11.finditer(text):
            cand11.append((y, conf, m.group(1)))
        for m in _AMIGO_PAT.finditer(text):
            candA.append((y, conf, m.group(1).upper()))
        for m in _METER_HYPHEN.finditer(text):
            merged = m.group(1) + m.group(2) + m.group(3) + m.group(4)
            if len(merged) >= 11:
                cand11.append((y, conf, merged[:11]))
        for m in _AMIGO_HYPHEN.finditer(text):
            amigo = 'A055' + re.sub(r'[^0-9]', '', m.group(1))
            if len(amigo) == 11:
                candA.append((y, conf, amigo.upper()))
    # over-read 폴백: 깨끗한 11자 후보 없으면 긴 숫자열(12+)에서 타입코드 유효 11자 윈도우 수집
    if not cand11 and not candA:
        for y, conf, text in lines:
            for run in re.findall(r'\d{12,}', re.sub(r'[^0-9]', '', text)):
                for i in range(len(run) - 10):
                    w = run[i:i + 11]
                    if w[2:4] in _METER_TYPE_CODES:
                        cand11.append((y, conf, w))
    if candA:
        return max(candA, key=lambda x: x[1])[2]
    if cand11:
        # 신뢰도 우선, 동점이면 y중앙 근접 (명판=중앙, 스펙문구보다 우선)
        return max(cand11, key=lambda x: (x[1], -abs(x[0] - 0.5)))[2]
    return ''


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
        results.append({"id": iid, "meterNo": _extract_meter_no(lines),
                        "raw": " | ".join(t for _, _, t in lines)[:240]})
    return {"results": results}


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
    tmpd = Path(tempfile.mkdtemp(prefix="cstsave_"))
    m = body["master"]; mb = m["meterNo"]; mac = m["mac"]
    slaves = body.get("slaves", [])
    n = 1 + len(slaves)
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
    # 마스터
    mf = _common(mb, mac, m_instM, mb, n, m_inst_s, bungi="")
    mf["MODEM_DIV"] = "10"
    res_m = saveact_post(mf, _photos_to_files(m.get("photos", {}), tmpd))
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
        sf["MODEM_DIV"] = "20"
        photos = {"ATCH_FILE_ID_3": fid3, "ATCH_FILE_ID_4": fid4}
        sp = _photos_to_files(s.get("photos", {}), tmpd)
        if sp.get("ATCH_FILE_ID_5_SRC"):
            photos["ATCH_FILE_ID_5_SRC"] = sp["ATCH_FILE_ID_5_SRC"]
        res_s = saveact_post(sf, photos)
        results.append({"role": "slave", "meterNo": s["meterNo"], "resp": res_s})
        yield {"type": "item", "role": "slave", "meterNo": s["meterNo"], "idx": i + 2, "total": n,
               "ok": bool(res_s.get("result") == 1)}
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


# 정적 UI (마지막에 마운트)
app.mount("/", StaticFiles(directory=str(WWW), html=True), name="www")
