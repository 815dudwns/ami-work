#!/usr/bin/env python3
"""End-of-day check of my awms registrations — rule verdicts, no LLM (영준님 2026-10-16, rules 2026-11-14).

    python3 scripts/cst_daily_check.py             # today (KST)
    python3 scripts/cst_daily_check.py 20261113    # a given day
    python3 scripts/cst_daily_check.py --no-ocr    # skip photo OCR (meter slot 5 / MAC slot 4)
    python3 scripts/cst_daily_check.py --json-out /tmp/relay/cst_check/x.json

Needs a live awms session (아미큐 맥세션) unless the offline inputs are given (--rows-file,
--detail-file, --ws-file — tests only). Everything is fetched fresh on every run.

Result = traffic light. 초록 = numbers only, nothing to do. 노랑 = a person looks (photo attached).
빨강 = fix it (a 'todo' sentence). Console + JSON (default /tmp/relay/cst_check/<day>.json, outside
data/ — the next step shows it on the 아미큐 screen).

★Rules are single-source: MAC format / 통신방식 suffix / 계기유형 / slave BUNGI come from
  cst-input/backend/cst_rules.py (the same functions the backend uses to build saveAct). Material
  type comes from scripts/my_stock.py kind(). Do not copy either here.

Checks (영준님 checklist 2026-11-14)
 1. awms rows of the day, grouped by modem MAC. The base is awms (영준님 2026-10-21); the 아미큐
    archive only tags the source and supplies photos.
    - 신설 M1010: MAC in my 출고 ledger / off-book ledger and owned; master MB_REG_CNT = meters bound
      to it (all dates); every slave WORK_DIV M1010; slave MAC = its master's MAC; PLC/K-DCU DCU_ID.
      Not red: slaves added on another day to an existing master (sometimes the 대표계기 itself is
      entered as a slave so the master is not re-registered). Same MAC on two masters = 노랑.
    - 기설 M1030: MAC format (cst_rules.mac_format_error) and kind() known; a MAC still unused in my
      own stock = '신설인데 기설로' 빨강; MAC photo OCR for every 기설.
    - 교체 M1020: registered by 영준님 by hand — out of the new-install rules, counted only.
    - meter number: law ^[0-9A-Z]{2}[0-9]{9}$, type code (3-4th digits) in the cst_rules table,
      in a map list (노랑 if not, grouped per modem), 지사 = list 지사.
    - 계기유형 INST_M / 통신방식 INST_S / slave BUNGI vs what the backend would have sent = 빨강.
 2. Map: places I marked complete that day vs awms, same list only. 개별불가 memo number found in
    awms = resolved; memo one digit off an awms number = 노랑 '메모 오타 의심'; list count !=
    registered count = 노랑 with the out-of-list meters.
 3. Photo OCR with our engine (Apple Vision; Google Vision is not used): meter number on slot 5 for
    every master and slave, MAC on slot 4 for 기설 and MACs not in my 출고 ledger. Confusable
    letters are folded (B=8 O=0 S=5 D=0 I=1) and a miss is read again at 2x, then the barcode on the
    photo (zbarimg) — 노랑 only when the original read, the 2x read and the barcode all disagree.
 4. Material (today only): today's use by type (신설 masters, kind()) + stock, and
    previous check stock - used + received = now per type.
"""
import argparse
import base64
import datetime
import glob
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
MAIN = Path("/Users/woodelight/Projects/ami-work")
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "cst-input/backend"))
import awms_cst_detail as A  # noqa: E402
import cst_rules as R  # noqa: E402
import my_stock as MS  # noqa: E402
from my_stock import kind  # noqa: E402

KST = ZoneInfo("Asia/Seoul")
ARCHIVE = Path.home() / ".ami-cst-archive"
BACKEND = "http://127.0.0.1:8766"
WS_URL = ("https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app"
          "/workStatus/charger4eleccar.json")
ME = "우영준"
DEPT_NM = {"3600": "마포용산", "3500": "서대문은평", "7793": "서울본부직할", "3100": "광진성동",
           "3400": "노원도봉", "4080": "강북성북", "3000": "동대문중랑"}
DIV_NM = {"M1010": "신설", "M1020": "교체", "M1030": "기설"}
METER_LAW = re.compile(r"^[0-9A-Z]{2}[0-9]{9}$")
FOLD = str.maketrans({"B": "8", "O": "0", "S": "5", "D": "0", "I": "1"})
# workStatus key namespace -> stats-site-index list code ('' = 실효; old completions are 'a')
#   ★레지스트리에서 만든다(2026-11-10). 2026-11-12 부터 리스트마다 자기 키('미조치' -> c, '미조치lte' -> l).
#     plainKey(실효·완료아카이브)는 ''.
#   ★11/10~11/12 엔 미조치(lte) 도 '주소|미조치' 를 썼다 — 그 사이 날짜를 다시 검사하면 옛 키가 lte 개소일 수 있어
#     미조치에서 못 찾으면 lte 를 본다(PRE_SPLIT_FALLBACK).
from datasets import DATASETS as _REG, status_category as _scat  # noqa: E402
NS_LIST = {}
for _d in _REG:
    if _d.get("category") and _d.get("source") != "workStatus":
        NS_LIST.setdefault("" if _d.get("plainKey") else _scat(_d), []).append(_d["code"])
NS_LIST = {k: tuple(v) for k, v in NS_LIST.items()}
PRE_SPLIT_FALLBACK = {"미조치": ("l",)}


def local(rel):
    """gitignored local files live only in the main checkout — read them from there in a worktree."""
    p = ROOT / rel
    return p if p.exists() else MAIN / rel


def fold(s):
    return re.sub(r"[^0-9A-Z]", "", str(s or "").upper()).translate(FOLD)


def one_off(a, b):
    return len(a) == len(b) and sum(x != y for x, y in zip(a, b)) == 1


def comm_name(inst_s):
    return R._COMM_LABEL.get(str(inst_s or "")[-2:], str(inst_s or "")[-2:] or "없음")


# ── result ────────────────────────────────────────────────────────────────────
class Report:
    def __init__(self):
        self.items = []

    def add(self, level, sec, msg, todo="", photos=(), **ctx):
        self.items.append({"level": level, "sec": sec, "msg": msg, "todo": todo,
                           "photos": [str(p) for p in photos if p], **ctx})

    def of(self, level):
        return [x for x in self.items if x["level"] == level]


# ── inputs ────────────────────────────────────────────────────────────────────
def fetch_rows(day):
    h = A.headers()
    return A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2=&searchKeyword=&sortKey=0&workStep=25,28,29"
                 f"&pPageNo=1&pRowCount=20000&strDate={day[:4]}0101&endDate={day}", h) or []


def fetch_ship(refresh):
    if refresh:
        try:  # refresh the 출고 ledger cache the badge uses
            urllib.request.urlopen(urllib.request.Request(f"{BACKEND}/api/shipped/refresh", method="POST"),
                                   timeout=120).read()
        except Exception as e:
            print(f"[주의] 출고목록 갱신 실패 — 옛 캐시로 본다: {e}")
    return json.loads(local("cst-input/backend/shipped_cache.json").read_text())


def offbook():
    """MAC -> batch label, from the off-book ledger (awms-unregistered stock, gitignored)."""
    try:
        out = {}
        for bt in json.loads(local("cst-input/backend/offbook_stock.json").read_text()).get("batches", []):
            for m in bt.get("macs", []):
                out[re.sub(r"[\s:\-*]", "", m).upper()] = bt.get("label", "")
        return out
    except Exception:
        return {}


def list_index():
    idx = defaultdict(list)
    for r in json.loads((ROOT / "data/stats-site-index.json").read_text()):
        idx[r["계기번호"]].append(r)
    return idx


def fetch_details(rows):
    """INSTR_NUM -> getDetail row (BUNGI, ATCH_FILE_ID_4/5). Read-only GET."""
    h = A.headers()

    def one(r):
        try:
            d = A.detail(r, h)
            return r["INSTR_NUM"], (d[0] if isinstance(d, list) and d else (d or {}))
        except Exception as e:
            return r["INSTR_NUM"], {"_err": str(e)[:120]}
    with ThreadPoolExecutor(6) as ex:
        return dict(ex.map(one, rows))


def archive_jobs(day):
    return [(Path(f).parent, json.load(open(f))) for f in sorted(glob.glob(str(ARCHIVE / day / "*/job.json")))]


def archive_photo_map(jobs):
    """(meter, slot) -> archive photo path, from the latest successful send."""
    out = {}
    for f, j in jobs:
        for s in j.get("sent", []):
            if not s.get("ok"):
                continue
            for slot, name in (s.get("photos") or {}).items():
                if (f / name).exists():
                    out[(s.get("meterNo"), str(slot))] = f / name
    return out


# ── 1. awms rows ──────────────────────────────────────────────────────────────
def app_check(day, rows, ship, idx, details, jobs, rep, done_site_meters):
    today = [r for r in rows if r.get("WORK_DATE") == day]
    ob = offbook()
    own_rows = ship.get("rows") or {}
    masters_by_mac = defaultdict(list)        # year masters (MODEM_DIV 10)
    by_meter_master = {}
    for r in rows:
        if r.get("MODEM_DIV") == "10" and r.get("MAC_MODEM"):
            masters_by_mac[r["MAC_MODEM"].upper()].append(r)
            by_meter_master.setdefault(r["INSTR_NUM"], r)
    bound = defaultdict(set)                  # master meter -> meters bound to it (all dates)
    for r in rows:
        mb = r.get("MB_METER_ID") or (r["INSTR_NUM"] if r.get("MODEM_DIV") == "10" else "")
        if mb:
            bound[(mb, (r.get("MAC_MODEM") or "").upper())].add(r["INSTR_NUM"])
    via = {}                                  # meter -> archive job dir (sent ok)
    for f, j in jobs:
        for s in j.get("sent", []):
            if s.get("ok"):
                via[s.get("meterNo")] = (f, s)
    groups = defaultdict(list)
    for r in sorted(today, key=lambda r: r.get("REG_DATE") or 0):
        groups[(r.get("MAC_MODEM") or "").upper()].append(r)
    cnt = Counter(r["INSTR_NUM"] for r in today)
    n_m = n_s = 0
    div_n = Counter()
    modems = []
    print(f"== 1. awms 등록 (오늘 awms {len(today)}행 · 모뎀 {len(groups)}개)")
    for mac, rs in sorted(groups.items(), key=lambda x: min(r.get("REG_DATE") or 0 for r in x[1])):
        ms = [r for r in rs if r.get("MODEM_DIV") == "10"]
        ss = [r for r in rs if r.get("MODEM_DIV") != "10"]
        n_m += len(ms)
        n_s += len(ss)
        head = ms[0] if ms else rs[0]
        div = head.get("WORK_DIV", "")
        if ms:
            div_n[div] += 1
        before = len(rep.items)
        notes = []
        ctx = {"mac": mac, "meter": head["INSTR_NUM"]}
        tm = datetime.datetime.fromtimestamp((head.get("REG_DATE") or 0) / 1000, KST)
        role = "마스터" if ms else "슬레이브"
        modems.append({"mac": mac, "master": head["INSTR_NUM"] if ms else "", "div": div,
                       "meters": [r["INSTR_NUM"] for r in rs], "time": f"{tm:%H:%M}"})
        if ms and div == "M1020":
            print(f"{tm:%H:%M} {head['INSTR_NUM']} 교체 {role} 슬{len(ss)} {mac} — 교체는 직접 등록, 숫자만 셈")
            continue

        # master of a slave-only group: an older master (another day) of the same modem
        master = head if ms else None
        if not ms:
            mbid = next((r.get("MB_METER_ID") for r in rs if r.get("MB_METER_ID")), "")
            cand = [m for m in masters_by_mac.get(mac, []) if m.get("WORK_DATE") != day]
            master = by_meter_master.get(mbid) or (cand[0] if cand else None)
            if master:
                notes.append(f"기존 모뎀 합류 — 마스터 {master['INSTR_NUM']} ({master.get('WORK_DATE')}) · 마스터 재등록 안 함, 정상")
                if any(r["INSTR_NUM"] == master["INSTR_NUM"] for r in rs):
                    notes.append("대표계기를 슬레이브로 넣음 — 마스터 재등록이 꼬여서 쓰는 방법, 정상")
            else:
                notes.append("기존 모뎀 합류 — 마스터가 올해 내 기록 밖(작년·남의 것)")
        mdiv = (master or {}).get("WORK_DIV", div)

        # meter numbers
        for r in rs:
            no = r["INSTR_NUM"]
            if not METER_LAW.fullmatch(no):
                rep.add("red", "awms", f"계기번호 형식 위반 {no}", "바른 계기번호로 새 행 등록(/awms-mac-fix)", **ctx)
            elif no[2:4] not in R._TYPE_MAP:
                rep.add("red", "awms", f"계기번호 {no} 타입코드 {no[2:4]} 는 awms 계기유형 표에 없다",
                        "사진으로 계기번호 확인 후 바른 번호로 새 행 등록", **ctx)
            if cnt[no] > 1:
                rep.add("red", "awms", f"오늘 같은 계기 {no} 가 {cnt[no]}행", "중복 행 정리(KDN 삭제 요청)", **ctx)

        if len(ms) > 1:
            rep.add("yellow", "awms", f"같은 맥 마스터 {len(ms)}개 {[r['INSTR_NUM'] for r in ms]}",
                    "같은 함체가 맞는지 사진 확인", **ctx)
        if ms:
            others = sorted({m["INSTR_NUM"] for m in masters_by_mac.get(mac, [])} - {r["INSTR_NUM"] for r in ms})
            if others:
                rep.add("yellow", "awms", f"같은 맥이 올해 다른 마스터에도 있다 {others}",
                        "맥 오독·재사용인지 사진 확인", **ctx)

        # MAC / material
        if ms and div == "M1010":
            sr = own_rows.get(mac)
            if not sr and mac not in ob:
                rep.add("red", "awms", f"신설 맥 {mac} 이 출고장부·따로장부 둘 다 없다 — 맥 오독 의심",
                        "모뎀맥 사진으로 맥 확인, 틀렸으면 바른 맥으로 새 행 등록", **ctx)
            elif sr and not sr.get("owned"):
                rep.add("red", "awms", f"신설 맥 {mac} 이 내 소유가 아니다", "자재 인계 확인", **ctx)
        if ms and div == "M1030":
            err = R.mac_format_error(mac)
            if err:
                rep.add("red", "awms", f"기설 맥 {mac} 형식 오류 — {err['reason']}"
                        + (f" (후보 {err['suggest']})" if err.get("suggest") else ""),
                        "모뎀맥 사진으로 맥 확인 후 바른 맥으로 새 행 등록", **ctx)
            elif kind(mac).startswith("미분류"):
                rep.add("red", "awms", f"기설 맥 {mac} 이 어떤 모뎀인지 모른다({kind(mac)})",
                        "모뎀맥 사진으로 맥 확인", **ctx)
            sr = own_rows.get(mac)
            mine_before = [m for m in masters_by_mac.get(mac, [])
                           if m.get("WORK_DIV") in ("M1010", "M1020") and m["INSTR_NUM"] != head["INSTR_NUM"]]
            if sr and sr.get("owned") and not mine_before:
                rep.add("red", "awms", f"기설 맥 {mac} 이 내 미사용 재고 모뎀이다 — 신설인데 기설로 넣은 것 같다",
                        "신설(M1010)로 다시 등록할지 확인", **ctx)

        # master: MB_REG_CNT, DCU_ID, 계기유형·통신방식
        exp_suffix = ""
        if master:
            m_no = master["INSTR_NUM"]
            if ms:
                n_bound = len(bound.get((m_no, mac), {m_no}) | {m_no})
                try:
                    reg = int(float(master.get("MB_REG_CNT") or 0))
                except ValueError:
                    reg = -1
                if reg != n_bound:
                    rep.add("red", "awms", f"마스터 {m_no} 등록수(MB_REG_CNT) {reg} 인데 묶인 계기 {n_bound}대",
                            "빠진 슬레이브 추가 또는 남는 행 정리", **ctx)
                if div == "M1010" and not mac.startswith("012") and not master.get("DCU_ID"):
                    rep.add("red", "awms", f"PLC 계열 신설 {m_no} DCU_ID 빈값", "변대주(DCU ID) 넣어 다시 저장", **ctx)
            exp_m = R.infer_inst_m(m_no)
            exp_s = R.infer_inst_s(exp_m, mac)
            exp_suffix = exp_s[-2:] if exp_s else str(master.get("INST_S") or "")[-2:]
            if ms:
                if (master.get("INST_M") or "") != exp_m:
                    rep.add("red", "awms", f"마스터 {m_no} 계기유형 awms {master.get('INST_M')} — 계기번호로는 {exp_m}",
                            "계기유형 고쳐 다시 저장", **ctx)
                if not exp_s:
                    rep.add("yellow", "awms", f"마스터 {m_no} 맥 {mac} 통신방식을 맥으로 못 정함 — awms {comm_name(master.get('INST_S'))}",
                            "모뎀 종류 확인", **ctx)
                elif (master.get("INST_S") or "") != exp_s:
                    rep.add("red", "awms", f"마스터 {m_no} 통신방식 awms {master.get('INST_S')}({comm_name(master.get('INST_S'))})"
                            f" — 맥·계기로는 {exp_s}({comm_name(exp_s)})", "통신방식 고쳐 다시 저장", **ctx)
                if mac.startswith("012"):
                    k, amigo_meter = kind(mac), exp_m == "HW4050"
                    if amigo_meter != ("AMIGO" in k):
                        rep.add("red", "awms", f"{'아미고' if amigo_meter else '아미고 아닌'} 계기 {m_no} 인데 모뎀은 {k}",
                                "모뎀·계기 짝 확인", **ctx)

        # slaves
        for r in ss:
            no = r["INSTR_NUM"]
            sctx = {"mac": mac, "meter": no}
            if mdiv in ("M1010", "M1030") and r.get("WORK_DIV") != "M1010":
                rep.add("red", "awms", f"슬레이브 {no} 작업구분 {DIV_NM.get(r.get('WORK_DIV'), r.get('WORK_DIV'))} — 신설(M1010)이어야 한다",
                        "작업구분 신설로 고쳐 다시 저장", **sctx)
            mb = r.get("MB_METER_ID") or ""
            mrow = by_meter_master.get(mb)
            if mb and mrow and (mrow.get("MAC_MODEM") or "").upper() != mac:
                rep.add("red", "awms", f"슬레이브 {no} 맥 {mac} 이 마스터 {mb} 맥 {mrow.get('MAC_MODEM')} 과 다르다",
                        "슬레이브 맥을 마스터 맥으로 고쳐 다시 저장", **sctx)
            if master and mb and mb != master["INSTR_NUM"] and not mrow:
                rep.add("red", "awms", f"슬레이브 {no} 대표계기 {mb} 가 이 모뎀 마스터 {master['INSTR_NUM']} 와 다르다",
                        "대표계기 확인", **sctx)
            exp_m = R.infer_inst_m(no)
            if (r.get("INST_M") or "") != exp_m:
                rep.add("red", "awms", f"슬레이브 {no} 계기유형 awms {r.get('INST_M')} — 계기번호로는 {exp_m}",
                        "계기유형 고쳐 다시 저장", **sctx)
            if exp_suffix and (r.get("INST_S") or "") != exp_m + exp_suffix:
                rep.add("red", "awms", f"슬레이브 {no} 통신방식 awms {r.get('INST_S')} — 마스터 따라 {exp_m + exp_suffix}",
                        "통신방식 고쳐 다시 저장", **sctx)
            d = details.get(no)
            if d is None or "_err" in (d or {}) or "BUNGI" not in (d or {}):
                notes.append(f"슬레이브 {no} 분기 확인 못함(상세 없음)")
            else:
                auto, can_pick = R.slave_bungi(exp_suffix, exp_m)
                b = str(d.get("BUNGI") or "")
                if (can_pick and b not in R.BUNGI_CHOICES) or (not can_pick and b != auto):
                    rep.add("red", "awms", f"슬레이브 {no} 분기 awms '{b}' — "
                            + ("아미고 모뎀 아미고 슬레이브라 무선 또는 0.5" if can_pick else "0.5 강제"),
                            "분기 고쳐 다시 저장", **sctx)

        # 지사 / list membership
        dept = head.get("DEPT2", "")
        lists, out_list, in_list = [], [], []
        for r in rs:
            xs = [x for x in idx.get(r["INSTR_NUM"], []) if x["l"] != "a"]
            if not xs and r.get("MODEM_DIV") == "10" and r.get("WORK_DIV") == "M1030":
                continue    # 기설 master = the existing modem's 대표계기, outside the list by nature
            (in_list if xs else out_list).append(r["INSTR_NUM"])
            for x in xs:
                lists.append(x["l"])
                if dept in DEPT_NM and not x["지사"].startswith(DEPT_NM[dept]):
                    rep.add("red", "awms", f"지사 불일치 {r['INSTR_NUM']}: awms {DEPT_NM[dept]} / 리스트 {x['지사']}",
                            "지사 고쳐 다시 저장", mac=mac, meter=r["INSTR_NUM"])
        handled = any(m in done_site_meters for m in in_list)
        if out_list and not handled:
            if in_list:
                msg = f"리스트 밖 계기 {len(out_list)}대 {out_list} (같은 모뎀 리스트 계기 {len(in_list)}대)"
            else:
                msg = f"리스트에 없는 계기 {out_list} — 계기교체로 새 번호일 수 있다"
            rep.add("yellow", "awms", msg, "계기 사진으로 번호 확인", meters=out_list, mac=mac, meter=out_list[0])

        # photos (아미큐 rows)
        src = sorted({"아미큐" if r["INSTR_NUM"] in via else "아미큐 외(헬퍼·화면)" for r in rs})
        if ms and head["INSTR_NUM"] in via and len(via[head["INSTR_NUM"]][1].get("photos") or {}) < 4:
            rep.add("red", "awms", f"마스터 {head['INSTR_NUM']} 사진 4장 미만", "사진 채워 다시 저장", **ctx)

        flag = len(rep.items) > before
        print(f"{tm:%H:%M} {head['INSTR_NUM']} {DIV_NM.get(div, div)} {role} 슬{len(ss) if ms else len(ss) - 1} "
              f"{mac} {DEPT_NM.get(dept, dept)} 리스트[{','.join(sorted(set(lists))) or '없음'}] "
              f"[{'/'.join(src)}]{'  *' if flag else ''}")
        for nt in notes:
            print(f"        ({nt})")
        for r in (ss if ms else ss[1:]):
            print(f"        └ 슬레이브 {r['INSTR_NUM']}")
    lost = []                      # in the 아미큐 archive but never reached awms
    aw = {r["INSTR_NUM"] for r in today}
    for f, j in jobs:
        for s in j.get("sent", []):
            if s.get("meterNo") not in aw:
                lost.append((f.name, s.get("meterNo"), "ok" if s.get("ok") else str(s.get("resp"))[:90]))
        for no in j.get("skippedSlaves") or []:
            if no not in aw:
                lost.append((f.name, no, "슬레이브 건너뜀"))
    for name, no, why in lost:
        rep.add("yellow", "awms", f"아미큐 전송 기록 {name[:2]}:{name[2:4]} {no} ({why}) 이 오늘 awms 에 없다",
                "이미 있던 건이거나 지운 건이면 정상 — 아니면 다시 전송", meter=no)
    summary = {"meters": len(today), "masters": n_m, "slaves": n_s,
               "div": {DIV_NM.get(k, k): v for k, v in sorted(div_n.items())}, "sends": len(jobs),
               "replace": div_n.get("M1020", 0)}
    dv = " · ".join(f"{k} {v}" for k, v in summary["div"].items())
    print(f"   awms 오늘 계기 {len(today)} = 마스터 {n_m} ({dv}) + 슬레이브 {n_s} · 아미큐 전송 {len(jobs)}회"
          + (f" · 교체 {summary['replace']}건(규칙 제외)" if summary["replace"] else "") + "\n")
    return summary, modems


# ── 2. map ↔ awms ─────────────────────────────────────────────────────────────
def map_sites(day, ws, idx):
    """My places marked on the map that day -> [(key, record, list meters)]."""
    by_addr = defaultdict(list)
    for no, xs in idx.items():
        for x in xs:
            by_addr[(x["주소"], x["l"])].append(no)
    iso = f"{day[:4]}-{day[4:6]}-{day[6:]}"
    out = []
    for k, v in sorted(ws.items(), key=lambda x: x[1].get("updatedAt", "")):
        if not v.get("updatedAt", "").startswith(iso) or v.get("updatedByName") != ME:
            continue
        addr, _, ns = k.partition("|")
        ms = []
        if isinstance(v.get("site"), dict):
            # site added from the map (js/add-site.js): its meters live only in added_meters, not in the index
            ms = sorted((v.get("added_meters") or {}).keys())
        codes = () if ms else NS_LIST.get(ns, ("s",)) + PRE_SPLIT_FALLBACK.get(ns, ())
        for code in codes:      # 실효 -> 옛 완료 아카이브 순으로 먼저 찾은 쪽(미조치 -> 옛 공유 키면 lte)
            ms = by_addr.get((addr, code), [])
            if ms:
                break
        out.append((k, v, ms))
    return out


def map_check(sites, rows, idx, rep):
    aw = {r["INSTR_NUM"] for r in rows}

    def in_lists(n):
        return any(x["l"] != "a" for x in idx.get(n, []))
    mac_of = defaultdict(set)
    by_mac = defaultdict(set)
    for r in rows:
        m = (r.get("MAC_MODEM") or "").upper()
        mac_of[r["INSTR_NUM"]].add(m)
        by_mac[m].add(r["INSTR_NUM"])
    # 기설(M1030) master = the existing modem's 대표계기 — outside the list by nature, not counted
    giseol = {r["INSTR_NUM"] for r in rows if r.get("MODEM_DIV") == "10" and r.get("WORK_DIV") == "M1030"}
    states = Counter(v.get("state") or "없음" for _, v, _ in sites)
    print("== 2. 지도 완료 ↔ awms (같은 리스트 계기만)")
    for k, v, ms in sites:
        if v.get("state") != "complete":
            continue
        t = v.get("updatedAt", "")[11:16]
        if not ms:
            rep.add("red", "map", f"{t} {k} 완료인데 리스트 계기를 못 찾았다", "주소·리스트 확인", key=k)
            continue
        failed = v.get("failedMeters") or {}
        macs = set().union(*[mac_of[m] for m in ms if m in aw])
        reg = set().union(*[by_mac[m] for m in macs]) - (giseol - set(ms))
        # a modem can span two list places (신수동 281 / 281-0) — the other place's list meters are not
        # 'outside the list' and are not this place's count
        reg = {n for n in reg if n in ms or not in_lists(n)}
        missing = []        # list meter, no awms row, no 개별불가
        dropped = 0         # 개별불가 with no number in the memo — not expected in awms
        stands_in = set()   # awms numbers that stand in for a list meter (memo number / memo typo)
        for m in [m for m in ms if m not in aw]:
            if m not in failed:
                missing.append(m)
                continue
            nums = set(re.findall(r"[0-9A-Z]{11}", str(failed.get(m) or "").upper()))
            hit = sorted(nums & aw)
            near = sorted({(n, x) for n in nums - aw for x in (reg or aw) if one_off(n, x)})
            if hit:
                stands_in.add(hit[0])
                rep.add("green", "map", f"{k} 개별불가 {m} — 메모의 바른 번호 {hit[0]} 가 awms 에 있다(해결)", key=k)
            elif near:
                n, x = near[0]
                stands_in.add(x)
                rep.add("yellow", "map", f"{t} {k} 개별불가 {m} 메모 번호 {n} 와 awms {x} 가 한 자리 다르다 — 메모 오타 의심",
                        "계기 사진으로 어느 쪽이 맞는지 보고 메모(또는 awms)를 고친다", key=k, meter=x)
            elif nums:
                dropped += 1
                rep.add("yellow", "map", f"{t} {k} 개별불가 {m} 메모 번호 {sorted(nums)} 가 awms 에 없다",
                        "메모 번호 확인", key=k, meter=m)
            else:
                dropped += 1
        out_list = sorted(reg - set(ms) - stands_in)
        expect = len(ms) - dropped
        if missing and not out_list:
            rep.add("red", "map", f"{t} {k} 리스트 {len(ms)}대 중 {len(missing)}대 awms 없음 {missing}",
                    f"{', '.join(missing)} 추가 등록, 현장에 없으면 개별불가", key=k, meters=missing)
        elif missing or len(reg) != expect:
            msg = f"{t} {k} 리스트 {len(ms)}대 / 등록 {len(reg)}대"
            if missing:
                msg += f" — 리스트 {len(missing)}대 없음 {missing}"
            if out_list:
                msg += f" + 리스트 밖 {len(out_list)}대 {out_list}"
            rep.add("yellow", "map", msg,
                    "계기 사진으로 리스트 밖 계기가 리스트 계기를 대신한 건지, 빠뜨린 건지 확인"
                    + (f" — 현장에 없으면 {', '.join(missing)} 개별불가" if missing else ""),
                    key=k, meters=missing + out_list)
    done = states.get("complete", 0)
    print(f"   완료 {done}곳 · 불가 {states.get('fail', 0)}곳"
          + "".join(f" · {s} {n}곳" for s, n in states.items() if s not in ("complete", "fail")) + "\n")
    return {"complete": done, "fail": states.get("fail", 0), "other": {s: n for s, n in states.items()
                                                                      if s not in ("complete", "fail")}}


# ── 3. photo OCR (our engine) ─────────────────────────────────────────────────
def upscale(src, dst):
    from PIL import Image
    im = Image.open(src)
    im = im.convert("RGB").resize((im.width * 2, im.height * 2), Image.LANCZOS)
    im.save(dst, "JPEG", quality=92)
    return dst


def ocr_meters(paths):
    """[path] -> [meterNo] via the 아미큐 backend /api/ocr (Apple Vision — same path as
    complete_mine.ocr_meter). Batched; never prints the token."""
    tok = local("cst-input/backend/api_token.txt").read_text().strip()
    out = []
    for i in range(0, len(paths), 12):
        chunk = paths[i:i + 12]
        body = json.dumps({"images": [{"id": str(n), "b64": "data:image/jpeg;base64,"
                                       + base64.b64encode(Path(p).read_bytes()).decode()}
                                      for n, p in enumerate(chunk)]}).encode()
        req = urllib.request.Request(f"{BACKEND}/api/ocr", data=body,
                                     headers={"Content-Type": "application/json", "X-Amiq-Token": tok})
        try:
            with urllib.request.urlopen(req, timeout=400) as r:
                res = {x["id"]: x.get("meterNo") or "" for x in json.loads(r.read()).get("results") or []}
        except Exception:
            res = {}
        out += [res.get(str(n), "") for n in range(len(chunk))]
    return out


def ocr_lines(paths):
    """[path] -> [full text] via visionocr_batch.swift (the engine behind /api/ocr) — the MAC needs
    every line, /api/ocr only returns the meter number."""
    swift = local("research/ocr_poc/visionocr_batch.swift")
    if not paths:
        return []
    with tempfile.TemporaryDirectory() as td:
        lf = Path(td) / "list.txt"
        lf.write_text("\n".join(str(p) for p in paths))
        try:
            out = subprocess.run(["swift", str(swift), str(lf)], capture_output=True, text=True, timeout=600).stdout
        except Exception:
            out = ""
    blocks, cur = defaultdict(list), None
    for ln in out.splitlines():
        if ln.startswith("===FILE:"):
            cur = ln[len("===FILE:"):].rstrip("=")
        elif cur and "\t" in ln:
            parts = ln.split("\t")
            if len(parts) >= 3:
                blocks[cur].append(parts[2])
    return [" ".join(blocks.get(str(p), [])) for p in paths]


def barcodes(path):
    """Every barcode/QR printed on the photo (zbarimg, local). The modem label carries the MAC as a
    barcode — bold label fonts make OCR read 5 as 6 (11/12 012-5435-3616), a barcode cannot."""
    exe = shutil.which("zbarimg") or "/opt/homebrew/bin/zbarimg"
    try:
        out = subprocess.run([exe, "-q", "--raw", str(path)], capture_output=True, text=True, timeout=60).stdout
    except Exception:
        return ""
    return " ".join(out.split())


def get_photo(meter, slot, photo_map, details, outdir):
    p = photo_map.get((meter, slot))
    if p:
        return p
    fid = (details.get(meter) or {}).get(f"ATCH_FILE_ID_{slot}") or ""
    if not fid:
        return None
    dst = outdir / f"{meter}_{slot}.jpg"
    if dst.exists():
        return dst
    try:
        h = A.headers()
        with urllib.request.urlopen(urllib.request.Request(
                f"https://awms.kdn.com/singleFile.innorix?atchFileId={fid}", headers=h), timeout=60) as r:
            b = r.read()
        if b[:2] == b"\xff\xd8":
            dst.write_bytes(b)
            return dst
    except Exception:
        pass
    return None


def two_pass(targets, read, match, outdir):
    """targets [(key, want, path)] -> {key: (verdict, read1, read2)}. verdict ok / bad / none."""
    res = {}
    first = read([p for _, _, p in targets])
    retry = []
    for (k, want, p), got in zip(targets, first):
        if match(want, got):
            res[k] = ("ok", got, "")
        else:
            retry.append((k, want, p, got))
    if retry:
        big = [upscale(p, outdir / f"x2_{Path(p).parent.name}_{Path(p).name}") for _, _, p, _ in retry]
        second = read(big)
        for (k, want, p, g1), g2 in zip(retry, second):
            if match(want, g2):
                res[k] = ("ok", g1, g2)
            elif fold(want) in fold(barcodes(p)):
                res[k] = ("ok", g1, g2 + " (바코드 일치)")
            else:
                res[k] = ("none" if not fold(g1) and not fold(g2) else "bad", g1, g2)
    return res


def ocr_check(day, rows, ship, idx, details, photo_map, rep, outdir, groups_div):
    today = [r for r in rows if r.get("WORK_DATE") == day and groups_div.get((r.get("MAC_MODEM") or "").upper()) != "M1020"]
    print("== 3. 사진 판독 (우리 엔진 · 원본 + 2배 확대)")
    # meter numbers, slot 5, masters and slaves
    tg, nophoto = [], []
    for r in today:
        p = get_photo(r["INSTR_NUM"], "5", photo_map, details, outdir)
        (tg.append((r["INSTR_NUM"], r["INSTR_NUM"], p)) if p else nophoto.append(r["INSTR_NUM"]))
    res = two_pass(tg, ocr_meters, lambda w, g: bool(g) and fold(w) == fold(g), outdir)
    bad = {k: v for k, v in res.items() if v[0] == "bad"}
    none = sorted(k for k, v in res.items() if v[0] == "none")
    path_of = {k: p for k, _, p in tg}
    def listed(n):
        return [x for x in idx.get(n, []) if x["l"] != "a"]
    typo = {}
    aw = {r["INSTR_NUM"] for r in rows}
    for no, (_, g1, g2) in bad.items():
        g = next((x for x in (g2, g1) if x and listed(x) and x not in aw), "")
        if g:
            # the photo reads a list meter that awms does not have = typo on registration (11/12 구수동 63:
            # awms 48190186029, photo and list 48190186039 — the typo itself happened to be another place's list meter)
            typo[g] = no
            rep.add("red", "ocr", f"awms 계기번호 {no} 오타 — 사진은 {g}, 리스트({listed(g)[0]['주소']})도 {g}",
                    f"바른 번호 {g} 로 새 행 등록(/awms-mac-fix)", photos=[path_of[no]], meter=no, meters=[no, g])
        else:
            rep.add("yellow", "ocr", f"계기 사진 판독 {g1 or '-'} / 확대 {g2 or '-'} — awms {no}",
                    "사진 보고 계기번호 확인", photos=[path_of[no]], meter=no)
    # the map side reported the list meter as 'not in awms' — it is the same meter, keep one item
    for x in list(rep.items):
        if x["sec"] == "map" and x["level"] != "green" and x.get("meters") and set(x["meters"]) <= set(typo):
            rep.items.remove(x)
    print(f"   계기 사진 {len(tg)}장: 일치 {sum(v[0] == 'ok' for v in res.values())} · 다름 {len(bad)} · 판독 못함 {len(none)}"
          + (f" {none}" if none else "") + (f" · 사진 없음 {len(nophoto)} {nophoto}" if nophoto else ""))
    # MAC, slot 4, 기설 + not in my 출고 ledger
    own = ship.get("rows") or {}
    tg = []
    seen = set()
    for r in today:
        mac = (r.get("MAC_MODEM") or "").upper()
        if r.get("MODEM_DIV") != "10" or mac in seen:
            continue
        if r.get("WORK_DIV") == "M1030" or mac not in own:
            seen.add(mac)
            p = get_photo(r["INSTR_NUM"], "4", photo_map, details, outdir)
            if p:
                tg.append((r["INSTR_NUM"], mac, p))
            else:
                rep.add("yellow", "ocr", f"{DIV_NM.get(r.get('WORK_DIV'), '')} {r['INSTR_NUM']} 맥 {mac} 모뎀맥 사진 없음",
                        "사진 확인", mac=mac, meter=r["INSTR_NUM"])
    res = two_pass(tg, ocr_lines, lambda w, g: fold(w) in fold(g), outdir)
    for (no, mac, p) in tg:
        v = res[no]
        if v[0] != "ok":
            rep.add("yellow", "ocr", f"모뎀맥 사진에서 {mac} 를 못 찾음(원본·확대 둘 다) — 계기 {no}",
                    "사진 보고 맥 확인", photos=[p], mac=mac, meter=no)
    print(f"   모뎀맥 사진 {len(tg)}장(기설 + 출고장부 밖): 일치 {sum(res[n][0] == 'ok' for n, _, _ in tg)}"
          f" · 못 찾음 {sum(res[n][0] != 'ok' for n, _, _ in tg)}\n")


# ── 4. material ───────────────────────────────────────────────────────────────
def stock_check(day, rows, rep, save):
    today_new = [r for r in rows if r.get("WORK_DATE") == day and r.get("MODEM_DIV") == "10"
                 and r.get("WORK_DIV") == "M1010"]
    use = Counter(MS.bucket(kind((r.get("MAC_MODEM") or "").upper())) for r in today_new)
    print("== 4. 자재 (오늘 사용 = 신설 마스터 · 재고는 오늘치 반영)")
    res = MS.from_baseline(argparse.Namespace(save=save))
    stock = res["stock"]
    types = [t for t in MS.FORMAT_B if t != "LTE 모뎀(E타입)"]
    types += sorted((set(stock) | set(use)) - set(types))
    table = [{"type": t, "used": use.get(t, 0), "stock": stock.get(t, 0)} for t in types]
    print(f"   {'타입':18} 오늘사용 보유")
    for x in table:
        print(f"   {x['type']:18} {x['used']:6} {x['stock']:4}")
    print(f"   {'합계':18} {sum(use.values()):6} {sum(stock.values()):4}")
    # reconcile: previous check stock - used since then + received since then = now, per type
    ts = res["start_ts"] * 1000
    used_since = Counter(MS.bucket(kind(m)) for m, _, _ in res["used"])
    mine_since = Counter(MS.bucket(kind((r.get("MAC_MODEM") or "").upper())) for r in rows
                         if r.get("MODEM_DIV") == "10" and r.get("WORK_DIV") in ("M1010", "M1020")
                         and (r.get("REG_DATE") or 0) > ts)
    diff = []
    for t in sorted(set(res["start"]) | set(stock) | set(used_since) | set(res["recv"]) | set(mine_since)):
        calc = res["start"].get(t, 0) - mine_since.get(t, 0) + res["recv"].get(t, 0)
        if calc != stock.get(t, 0):
            diff.append(f"{t} 지난 {res['start'].get(t, 0)} - 사용 {mine_since.get(t, 0)} + 수령 {res['recv'].get(t, 0)}"
                        f" = {calc} 인데 지금 {stock.get(t, 0)}")
    if diff:
        rep.add("red", "stock", "자재 대조 안 맞음 — " + " / ".join(diff), "재등록·정정 저장·장부 밖 시공 확인")
    else:
        rep.add("green", "stock", f"자재 대조 맞음 — 지난 검사 {sum(res['start'].values())} - 사용 {sum(mine_since.values())}"
                f" + 수령 {sum(res['recv'].values())} = {sum(stock.values())}")
    other = Counter(r.get("WORK_DIV") for r in rows if r.get("WORK_DATE") == day and r.get("MODEM_DIV") == "10"
                    and r.get("WORK_DIV") != "M1010")
    n_sl = sum(1 for r in rows if r.get("WORK_DATE") == day and r.get("MODEM_DIV") != "10")
    print(f"   기설 {other.get('M1030', 0)}곳 · 교체 {other.get('M1020', 0)}곳 · 슬레이브 {n_sl}대는 사용에서 뺌\n")
    return {"table": table, "start_src": res["start_src"], "start": res["start"], "recv": res["recv"],
            "used_since": dict(mine_since), "stock": stock, "reconcile": diff}


# ── output ────────────────────────────────────────────────────────────────────
def print_report(day, rep, summary, mp):
    red, yel = rep.of("red"), rep.of("yellow")
    print(f"==== [{day}] 작업검사 신호등 — 빨강 {len(red)} · 노랑 {len(yel)}"
          + (" · 문제 없음" if not red and not yel else ""))
    dv = " · ".join(f"{k} {v}" for k, v in summary["div"].items())
    print(f"초록  awms 계기 {summary['meters']} = 마스터 {summary['masters']} ({dv}) + 슬레이브 {summary['slaves']}"
          f" · 지도 완료 {mp['complete']}곳 · 불가 {mp['fail']}곳")
    for x in rep.of("green"):
        print(f"      {x['msg']}")
    if red:
        print("빨강 — 고칠 것")
        for i, x in enumerate(red, 1):
            print(f"  {i}. {x['msg']}\n     할 일: {x['todo']}")
    if yel:
        print("노랑 — 사람이 볼 것")
        for i, x in enumerate(yel, 1):
            print(f"  {i}. {x['msg']}" + (f"\n     볼 것: {x['todo']}" if x["todo"] else "")
                  + "".join(f"\n     사진: {p}" for p in x["photos"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day", nargs="?", default=datetime.datetime.now(KST).strftime("%Y%m%d"))
    ap.add_argument("--no-ocr", action="store_true")
    ap.add_argument("--json-out", help="default /tmp/relay/cst_check/<day>.json")
    ap.add_argument("--rows-file", help="(test) awms getMainList rows json instead of fetching")
    ap.add_argument("--detail-file", help="(test) {meter: getDetail row} json instead of fetching")
    ap.add_argument("--ws-file", help="(test) workStatus json instead of fetching")
    ap.add_argument("--no-stock", action="store_true")
    a = ap.parse_args()
    today = datetime.datetime.now(KST).strftime("%Y%m%d")
    outdir = Path(a.json_out).parent if a.json_out else Path("/tmp/relay/cst_check")
    photodir = outdir / f"{a.day}_photos"
    photodir.mkdir(parents=True, exist_ok=True)
    offline = bool(a.rows_file)
    jobs = archive_jobs(a.day)
    rows = json.loads(Path(a.rows_file).read_text()) if a.rows_file else fetch_rows(a.day)
    ship = fetch_ship(refresh=not offline)
    ws = json.loads(Path(a.ws_file).read_text()) if a.ws_file else json.loads(
        urllib.request.urlopen(WS_URL, timeout=120).read())
    idx = list_index()
    day_rows = [r for r in rows if r.get("WORK_DATE") == a.day]
    if a.detail_file:
        details = json.loads(Path(a.detail_file).read_text())
    elif offline:
        details = {}
    else:
        details = fetch_details(day_rows)
    print(f"[{a.day}] awms 올해 {len(rows)}행 · 출고장부 {len(ship.get('rows') or {})} · 지도 {len(ws)}키"
          + (" — 시험 입력" if offline else " — 방금 받음") + "\n")
    rep = Report()
    sites = map_sites(a.day, ws, idx)
    done_site_meters = {m for _, v, ms in sites if v.get("state") == "complete" for m in ms}
    summary, modems = app_check(a.day, rows, ship, idx, details, jobs, rep, done_site_meters)
    mp = map_check(sites, rows, idx, rep)
    groups_div = {}
    for r in day_rows:
        if r.get("MODEM_DIV") == "10":
            groups_div[(r.get("MAC_MODEM") or "").upper()] = r.get("WORK_DIV")
    photo_map = archive_photo_map(jobs)
    if not a.no_ocr:
        ocr_check(a.day, rows, ship, idx, details, photo_map, rep, photodir, groups_div)
    # every 노랑/빨강 about a meter carries its nameplate photo (slot 5) so a person can look at once
    for x in rep.items:
        if x["level"] != "green" and not x["photos"]:
            for no in (x.get("meters") or [x.get("meter")])[:6]:
                ph = get_photo(no, "5", photo_map, details, photodir) if no else None
                if ph:
                    x["photos"].append(str(ph))
    stock = None
    if a.day == today and not a.no_stock and not offline:
        # roll the modem stock forward with today's receipts/installs (영준님 2026-11-10)
        stock = stock_check(a.day, rows, rep, save=True)
    print_report(a.day, rep, summary, mp)
    if stock:
        print("\n타입 | 오늘 사용 | 보유")
        for x in stock["table"]:
            print(f"{x['type']} | {x['used']} | {x['stock']}")
    jp = Path(a.json_out) if a.json_out else outdir / f"{a.day}.json"
    jp.write_text(json.dumps({
        "day": a.day, "generatedAt": datetime.datetime.now(KST).isoformat(timespec="seconds"),
        "offline": offline, "summary": summary, "map": mp,
        "level": "red" if rep.of("red") else ("yellow" if rep.of("yellow") else "green"),
        "red": rep.of("red"), "yellow": rep.of("yellow"), "green": rep.of("green"),
        "stock": stock, "modems": modems}, ensure_ascii=False, indent=1))
    print(f"\nJSON {jp}")


if __name__ == "__main__":
    main()
