#!/usr/bin/env python3
"""awms 통신팀(mob/cst) 완료건 지사·동행 정정 — saveAct ROW_TYPE=1(UPDATE).

2026-10-07 아미큐가 재로그인 뒤 설정이 서울본부직할(7793)·동행 Y 로 덮여 26건이 잘못 등록됐다.
한전 전송 전(WORK_STEP 28)이면 ROW_TYPE=1 로 그 행을 덮어써 고칠 수 있다([[awms_saveact_completed_no_edit]]).

★페이로드는 반드시 **그 계기의 실제 행(getDetail)** 에서 뽑는다. 다른 계기 템플릿을 쓰면 조용히 깨진다.
★사진은 다시 올리지 않는다 — ATCH_FILE_ID_* 기존 파일ID 문자열을 그대로 넘긴다.
★빈 봉인값은 보내지 않는다(빈문자열이면 500).

  python3 scripts/awms_cst_fix_dept.py --date 20261007 --from 7793 --to 3600 --with N           # 미리보기
  python3 scripts/awms_cst_fix_dept.py --date 20261007 --from 7793 --to 3600 --with N --meter X --go
  python3 scripts/awms_cst_fix_dept.py --date 20261007 --from 7793 --to 3600 --with N --all --go
"""
import argparse
import json
import sys
import time
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import awms_cst_detail as A  # noqa: E402

DROP = {"INST_M_NM", "INST_S_NM", "MODEM_DIV_NM", "REG_DATE", "WORK_REG_ID", "WORK_STEP_NM"}
SEALS = ("ENCL_SEAL_VAL", "METR_SEAL_VAL", "OTSD_SEAL_VAL")
BACKUP = Path("/tmp/relay/awms_fix_dept_backup")


def rows_of(day, dept, h):
    d = A.get(f"getMainList?FLAG=M10&DEPT1=3970&DEPT2={dept}&searchKeyword=&sortKey=0"
              f"&workStep=25,28,29&pPageNo=1&pRowCount=5000&strDate={day}&endDate={day}", h) or []
    return {str(r["INSTR_NUM"]): r for r in d}


def build(detail, to_dept, with_yn):
    p = {k: ("" if v is None else str(v)) for k, v in detail.items() if k not in DROP}
    for k in SEALS:
        if not p.get(k):
            p.pop(k, None)
    p.update({"DEPT2": to_dept, "MTR_WITH_YN": with_yn, "ROW_TYPE": "1", "FLAG": "M10",
              "FILTER_ROW": "N", "MODEM_MAC": p.get("MAC_MODEM", ""), "SEAL_UPD": "N",
              "ERR_LIST": "[]", "mbInsertCnt": "0", "DANGER_INFO_FLAG": "2"})
    return p


def post(payload, h):
    hh = dict(h)
    hh["Referer"] = "https://awms.kdn.com/html/main/index.html?app=MOBCST&menu=01010000"
    files = [(k, (None, v)) for k, v in payload.items()]   # FormData(multipart) — 아미큐와 같은 형태
    r = requests.post(f"{A.AWMS}/saveAct", headers=hh, files=files, timeout=60)
    try:
        return r.json()
    except Exception:
        return {"_status": r.status_code, "_text": r.text[:300]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--from", dest="src", required=True)
    ap.add_argument("--to", dest="dst", required=True)
    ap.add_argument("--with", dest="with_yn", choices=["Y", "N"], required=True)
    ap.add_argument("--meter")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--go", action="store_true", help="없으면 미리보기만")
    a = ap.parse_args()
    h = A.headers()

    src = rows_of(a.date, a.src, h)
    dst = rows_of(a.date, a.dst, h)
    print(f"[전] {a.src}={len(src)} {a.dst}={len(dst)}")
    if a.meter:
        targets = [a.meter]
    elif a.all:
        # 마스터(MODEM_DIV 10) 먼저, 슬레이브 나중
        targets = sorted(src, key=lambda m: (str(src[m].get("MODEM_DIV")) != "10", m))
    else:
        sys.exit("--meter 또는 --all")

    BACKUP.mkdir(parents=True, exist_ok=True)
    for m in targets:
        row = src.get(m)
        if not row:
            print(f"  {m}: {a.src} 목록에 없음 — 건너뜀")
            continue
        det = A.detail(row, h)
        if not det:
            sys.exit(f"  {m}: getDetail 빈 응답 — 중단")
        (BACKUP / f"{m}.json").write_text(json.dumps(det, ensure_ascii=False, indent=1))
        p = build(det, a.dst, a.with_yn)
        diff = {k: (det.get(k), p.get(k)) for k in ("DEPT2", "MTR_WITH_YN", "WORK_STEP")}
        print(f"  {m} MD={row.get('MODEM_DIV')} {diff}")
        if not a.go:
            continue
        res = post(p, h)
        print(f"    → {res}")
        if str(res.get("result")) != "1":
            sys.exit("  ★result!=1 — 중단")
        time.sleep(0.5)
        after = A.detail(row | {"DEPT2": a.dst}, h) or A.detail(row, h) or {}
        bad = [k for k in ("ATCH_FILE_ID_3", "ATCH_FILE_ID_4", "ATCH_FILE_ID_5", "ATCH_FILE_ID_6",
                           "WORK_STEP", "ETC1", "MB_REG_CNT") if str(after.get(k) or "") != str(det.get(k) or "")]
        print(f"    되읽기 DEPT2={after.get('DEPT2')} WITH={after.get('MTR_WITH_YN')} 변동={bad or '없음'}")
        if bad:
            sys.exit("  ★유지돼야 할 필드가 바뀌었다 — 중단")

    src2 = rows_of(a.date, a.src, h)
    dst2 = rows_of(a.date, a.dst, h)
    print(f"[후] {a.src}={len(src2)} {a.dst}={len(dst2)}")


if __name__ == "__main__":
    main()
