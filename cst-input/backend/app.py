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

# ── 세션 보관 (메모리) ─────────────────────────────────
# 폰 헬퍼 awms 세션(JSESSIONID httpOnly + XSRF) + UA를 넘겨받아 보관.
SESSION = {"jsessionid": None, "rememberedId": None, "xsrf": None, "ua": None, "ts": 0}

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


def _common(meter_no, mac, inst_m, mb_meter_id, mb_cnt):
    d = dict(_MASTER_BASE)
    for k in _EMPTY_FIELDS:
        d.setdefault(k, "")
    d.update({
        "DEPT1": CONFIG["DEPT1"], "DEPT2": CONFIG["DEPT2"], "BUSI_NUM": CONFIG["BUSI_NUM"],
        "WORKER1_SEQ": CONFIG["WORKER1_SEQ"], "WORKER2_SEQ": CONFIG["WORKER2_SEQ"],
        "INSTR_NUM": meter_no, "INST_M": inst_m, "INST_S": infer_inst_s(inst_m, mac) or (inst_m + "10"),
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


@app.get("/api/config")
def api_config():
    return CONFIG


@app.post("/api/config")
def api_config_set(body: dict = Body(...)):
    CONFIG.update({k: v for k, v in body.items() if k in CONFIG})
    return CONFIG


OCR_SWIFT = ROOT / "research" / "ocr_poc" / "visionocr_batch.swift"


def _extract_meter_no(lines):
    """visionocr 줄들[(conf,text)] → 계기번호. A+10~11자리 또는 11자리 숫자, 최고 conf."""
    best = ("", -1.0)
    for conf, text in lines:
        t = text.upper().replace(" ", "")
        for m in re.finditer(r'[A-Z]{1,2}\d{9,10}', t):
            if conf > best[1]:
                best = (m.group(), conf)
        d = re.sub(r'\D', '', text)
        if len(d) == 11 and conf > best[1]:
            best = (d, conf)
    return best[0]


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
    # ===FILE:path=== 블록별 (conf, text) 수집
    blocks, cur = {}, None
    for ln in out.splitlines():
        if ln.startswith("===FILE:"):
            cur = ln[len("===FILE:"):].rstrip("="); blocks[cur] = []
        elif cur and "\t" in ln:
            parts = ln.split("\t")
            if len(parts) >= 3:
                try: blocks[cur].append((float(parts[1]), parts[2]))
                except Exception: pass
    results = []
    for iid, p in paths:
        lines = blocks.get(str(p), [])
        results.append({"id": iid, "meterNo": _extract_meter_no(lines),
                        "raw": " | ".join(t for _, t in lines)[:240]})
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


@app.post("/api/saveact")
def api_saveact(body: dict = Body(...)):
    """마스터 1 + 슬레이브 N 결합 등록.
    body = {master:{meterNo,mac,instM,photos:{3,4,5,6 base64}}, slaves:[{meterNo,photos:{5}}]}
    슬레이브 사진 3/4 = 마스터 응답 파일ID 공유, 고유는 5만.
    """
    if not session_alive():
        raise HTTPException(401, "awms 세션 만료 — 폰 재로그인 후 /api/session/pull")
    # 631 NOT NULL 프리플라이트: 필수 식별필드 빈값이면 거부 (라이브 631 디버깅 비용 회피).
    miss = [k for k in ("WORKER1_SEQ", "WORKER2_SEQ", "BUSI_NUM", "DEPT1", "DEPT2") if not str(CONFIG.get(k, "")).strip()]
    if miss:
        raise HTTPException(400, f"공사설정 누락: {', '.join(miss)} — 설정페이지/세션 가져오기로 채우세요")
    tmpd = Path(tempfile.mkdtemp(prefix="cstsave_"))
    m = body["master"]; mb = m["meterNo"]
    n = 1 + len(body.get("slaves", []))
    # 마스터 (INST_M 계기번호 자동판별)
    mf = _common(mb, m["mac"], infer_inst_m(mb), mb, n)
    mf["MODEM_DIV"] = "10"
    res_m = saveact_post(mf, _photos_to_files(m.get("photos", {}), tmpd))
    fid3 = res_m.get("atchFileId3", ""); fid4 = res_m.get("atchFileId4", "")
    results = [{"role": "master", "meterNo": mb, "resp": res_m}]
    # 슬레이브 (사진 3/4 = 마스터 파일ID 공유 문자열, 5만 고유 바이너리)
    for s in body.get("slaves", []):
        sf = _common(s["meterNo"], m["mac"], infer_inst_m(s["meterNo"]), mb, n)
        sf["MODEM_DIV"] = "20"; sf["BUNGI"] = s.get("bungi", "무선")
        photos = {"ATCH_FILE_ID_3": fid3, "ATCH_FILE_ID_4": fid4}
        sp = _photos_to_files(s.get("photos", {}), tmpd)
        if sp.get("ATCH_FILE_ID_5_SRC"):
            photos["ATCH_FILE_ID_5_SRC"] = sp["ATCH_FILE_ID_5_SRC"]
        res_s = saveact_post(sf, photos)
        results.append({"role": "slave", "meterNo": s["meterNo"], "resp": res_s})
    return {"results": results}


# 정적 UI (마지막에 마운트)
app.mount("/", StaticFiles(directory=str(WWW), html=True), name="www")
