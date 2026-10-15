#!/usr/bin/env python3
"""Which modem type each MAC prefix is — measured from everyone's master installs.

    python3 scripts/modem_type_map.py            # prints LTE + PLC prefix tables
    python3 scripts/modem_type_map.py --len 7    # finer prefix

Modem type rules (영준님 2026-10-15):
  - The modem type follows the MASTER meter it serves (slaves inherit the group modem).
  - 외장형연결장치=Y means an E modem attached to an AE(EA) meter through the adapter -> E modem.
  - Older apps (플러스 etc.) could not record the adapter and wrote the comm method as Zigbee
    instead -> Zigbee also means E modem.
  - PLC by DCU generation: KS-PLC = DCU 1-4차, IoT-PLC = DCU 5-6차 (K-DCU is IoT-PLC).

Sources: data/ami.db
  modem_work_all  awms 모뎀작업리스트 (master rows: 계기유형, 외장형연결장치, 기술타입, DCUID)
  boranggi        보강현황 (MAC + meter number + 통신방식; Zigbee flag)
  dcu_master      DCU ID -> 차수
"""
import argparse
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data/ami.db"


def meter_kind(no):
    t = (no or "")[2:4]
    return {"17": "E", "19": "AE", "53": "AMIGO", "55": "AMIGO"}.get(
        t, "G" if t in ("25", "26", "27", "45", "46", "47") else None)


def mac_restore(m):
    # 보강현황 MAC formats: 12-hex (colons optional) or LTE line-encoded 15/16 digits, two
    # encodings ([[boranggi_mac_restore_and_amigo_wireless]])
    m = str(m or "").strip().replace(":", "").upper()
    if len(m) == 11 and m.startswith("012"):
        return m
    if len(m) == 12 and re.fullmatch(r"[0-9A-F]{12}", m) and not m.isdigit():
        return m
    if len(m) in (15, 16) and m.isdigit() or len(m) == 16 and re.fullmatch(r"3[0-9]{15}", m or ""):
        s = m.zfill(16)
        pairs = [s[i:i + 2] for i in range(0, 16, 2)]
        if all(int(p) <= 9 for p in pairs):
            return "012" + "".join(str(int(p)) for p in pairs)
        if all(0x30 <= int(p, 16) <= 0x39 for p in pairs):
            return "012" + "".join(chr(int(p, 16)) for p in pairs)
    return m if len(m) == 12 else ""


def gen_group(cha):
    if not cha:
        return None
    if cha[0] in "1234":
        return "DCU1-4"
    if cha[0] in "56":
        return "DCU5-6"
    return cha


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--len", type=int, default=6)
    ap.add_argument("--min", type=int, default=20)
    a = ap.parse_args()
    c = sqlite3.connect(DB)
    # DCU ID last 2 chars vary per install — join on the first 8 (= 전산화번호), a computation
    # with 0 exceptions over the 19,007-row 대장 (CLAUDE.md)
    cha = {r[0][:8]: r[1] for r in c.execute("SELECT DCU_ID, 차수 FROM dcu_master WHERE DCU_ID<>''")}

    # one vote per MAC: latest master row wins
    mac = {}
    for m, mt, conn, tech, dcu, no in c.execute(
            "SELECT mac_norm, 계기유형, 외장형연결장치, 기술타입, DCUID, 계기번호_norm FROM modem_work_all "
            "WHERE 모뎀유형='마스터' AND mac_norm<>'' ORDER BY 작업일자"):
        k = {"AMIGO": "AMIGO", "G-type": "G", "E-type": "E"}.get(mt)
        if mt == "Adv-E":
            k = "E(연결장치)" if conn == "Y" else ("AE" if conn == "N" else "AE?")
        k = k or meter_kind(no)
        mac[m] = (k, (tech or "").upper().replace("IOT", "IoT"), gen_group(cha.get((dcu or "")[:8])))

    # boranggi: Zigbee = E modem (old apps); meter kind from the number, removed+new pairs
    zig = defaultdict(Counter)
    for m, no, com in c.execute(
            'SELECT mac_norm, 계기번호_norm, 통신방식 FROM boranggi WHERE mac_norm<>"" '
            'UNION SELECT "모뎀 MAC_2", 계기번호_2, 통신방식_2 FROM boranggi WHERE "모뎀 MAC_2"<>""'):
        m = mac_restore(m)
        if m.startswith("012"):
            zig[m[:a.len]]["Zigbee" if com == "Zigbee" else (meter_kind(str(no or "").zfill(11)) or "?")] += 1

    # 25년 보강현황: PLC MAC -> DCU 차수 (both removed and new column pairs)
    bplc = defaultdict(Counter)
    for m, dcu, com in c.execute(
            'SELECT mac_norm, "DCU ID", 통신방식 FROM boranggi WHERE mac_norm<>"" '
            'UNION SELECT "모뎀 MAC_2", "DCU ID_2", 통신방식_2 FROM boranggi WHERE "모뎀 MAC_2"<>""'):
        m = mac_restore(m)
        if m and not m.startswith("012"):
            p = m[:7] if m.startswith("847207") else m[:a.len]
            bplc[p][f"{com}|{gen_group(cha.get(str(dcu or '')[:8]))}"] += 1

    lte = defaultdict(Counter)
    plc = defaultdict(Counter)
    for m, (k, tech, g) in mac.items():
        if m.startswith("012"):
            lte[m[:a.len]][k] += 1
        else:
            p = m[:a.len] if not m.startswith("847207") else m[:7]
            plc[p][f"{k}|{tech}|{g}"] += 1

    print(f"== LTE masters by prefix ({a.len}) — modem type (one vote per MAC)")
    for p, cnt in sorted(lte.items(), key=lambda x: -sum(x[1].values())):
        n = sum(cnt.values())
        if n < a.min:
            continue
        top, tn = cnt.most_common(1)[0]
        print(f"{p}  n={n:5}  {top:12} {tn / n:5.0%}  {dict(cnt.most_common())}")
    print("\n== PLC masters by prefix — modemtype|기술타입|DCU차수")
    for p, cnt in sorted(plc.items(), key=lambda x: -sum(x[1].values())):
        n = sum(cnt.values())
        if n < a.min:
            continue
        print(f"{p}  n={n:5}  {dict(cnt.most_common(6))}")
    print("\n== PLC in 25년 보강현황 (MAC rows) — 통신방식|DCU차수")
    for p, cnt in sorted(bplc.items(), key=lambda x: -sum(x[1].values())):
        n = sum(cnt.values())
        if n >= a.min:
            print(f"{p}  n={n:6}  {dict(cnt.most_common(6))}")
    print("\n== LTE in 25년 보강현황 — meter kind / Zigbee(=E modem)")
    for p, cnt in sorted(zig.items(), key=lambda x: -sum(x[1].values()))[:40]:
        n = sum(cnt.values())
        print(f"{p}  n={n:6}  {dict(cnt.most_common(5))}")


if __name__ == "__main__":
    main()
