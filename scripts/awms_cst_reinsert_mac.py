#!/usr/bin/env python3
"""awms 통신팀(mob/cst) 모뎀MAC 오기 건을 올바른 MAC 으로 새로 저장한다(ROW_TYPE=2 신규).

전송(29)된 건은 saveAct ROW_TYPE=1 로 MAC 을 바꿀 수 없다(result 0, 2026-10-13 실측) —
MAC 이 행 키라 화면도 기존 행의 MAC 칸을 잠근다. KDN 방식: 새로 저장 → 확인 후 KDN 이 오기분 삭제.

사진은 기존 파일ID 를 공유하지 않고 내려받아 둔 파일을 새로 올린다(오기분 삭제 때 첨부가 같이
지워져도 새 건이 살아남게). 슬레이브의 시공전·모뎀맥은 마스터 응답의 파일ID 를 --shared 로 넘긴다.

  python3 scripts/awms_cst_reinsert_mac.py <계기> --mac <새MAC> --dir <사진폴더>            # 미리보기
  python3 scripts/awms_cst_reinsert_mac.py <계기> --mac <새MAC> --dir <사진폴더> --go
  python3 scripts/awms_cst_reinsert_mac.py <슬레이브> ... --shared '{"3":"F..","4":"F.."}' --go
"""
import argparse
import json
import os
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import awms_cst_detail as A  # noqa: E402

DROP = {"INST_M_NM", "INST_S_NM", "MODEM_DIV_NM", "REG_DATE", "WORK_REG_ID", "WORK_STEP_NM",
        "DATA_NUM", "WORK_DATE"}
SEALS = ("ENCL_SEAL_VAL", "METR_SEAL_VAL", "OTSD_SEAL_VAL")
SLOTS = {3: "1_시공전", 4: "2_모뎀맥", 5: "3_시공후1", 6: "4_시공후2"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("meter")
    ap.add_argument("--mac", required=True)
    ap.add_argument("--dir", required=True, help="<계기>_detail.json 과 사진이 있는 폴더")
    ap.add_argument("--shared", default="{}", help='마스터와 공유할 슬롯 파일ID {"3":"F..","4":"F.."}')
    ap.add_argument("--go", action="store_true")
    a = ap.parse_args()
    d = Path(a.dir)
    shared = json.loads(a.shared)
    det = json.loads((d / f"{a.meter}_detail.json").read_text())

    p = {k: ("" if v is None else str(v)) for k, v in det.items()
         if k not in DROP and not k.startswith("ATCH_FILE_ID")}
    for k in SEALS:
        if not p.get(k):
            p.pop(k, None)
    p.update({"ROW_TYPE": "2", "FILTER_ROW": "N", "FLAG": "M10", "WORK_STEP": "28", "DATA_NUM": "",
              "MAC_MODEM": a.mac, "MODEM_MAC": a.mac, "SEAL_UPD": "N", "ERR_LIST": "[]",
              "mbInsertCnt": "0", "DANGER_INFO_FLAG": "2", "BUILTIN_YN": p.get("BUILTIN_YN") or "N",
              "DCU_SIGONG_CD": "N", "TDU_USE_YN": "N"})
    ms = "마스터" if str(det.get("MODEM_DIV")) == "10" else "슬레이브"

    files = [(k, (None, v)) for k, v in p.items()]
    for k, n in SLOTS.items():
        if str(k) in shared:
            files.append((f"ATCH_FILE_ID_{k}", (None, shared[str(k)])))
            continue
        f = d / f"{a.meter}_{ms}_{n}.jpg"
        if f.exists():
            files.append((f"ATCH_FILE_ID_{k}_SRC", (f"{a.meter}_{k}.jpg", open(f, "rb"), "image/jpeg")))

    print(a.meter, ms, "MAC", p["MAC_MODEM"], "MB", p.get("MB_METER_ID"), "DEPT2", p["DEPT2"],
          "WITH", p["MTR_WITH_YN"], "BUSI", p.get("BUSI_NUM"),
          "사진", [x[0] for x in files if x[0].startswith("ATCH")])
    if not a.go:
        return
    h = A.headers()
    h["Referer"] = "https://awms.kdn.com/html/main/index.html?app=MOBCST&menu=01010000"
    r = requests.post(f"{A.AWMS}/saveAct", headers=h, files=files, timeout=90)
    print("→", r.status_code, r.text[:300])


if __name__ == "__main__":
    main()
