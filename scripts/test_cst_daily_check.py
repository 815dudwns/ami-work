#!/usr/bin/env python3
"""작업검사 판정 규칙 시험 — 합성 awms 행으로 빨강·노랑·초록이 맞게 나오는지 (네트워크·사진 없음).

    python3 scripts/test_cst_daily_check.py

실측 사례(2026-11-12·11-13)를 줄여 만든 행에 한 가지씩 틀린 값을 넣고, 그 규칙만 걸리는지 본다.
"""
import io
import sys
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cst_daily_check as C  # noqa: E402

DAY = "20261113"


def row(no, mac, div="M1010", modem="10", mb="", inst_m=None, inst_s=None, dcu="9725Y05364", day=DAY,
        reg_cnt=None, dept="3600"):
    import cst_rules as R
    im = inst_m or R.infer_inst_m(no)
    return {"INSTR_NUM": no, "MAC_MODEM": mac, "WORK_DIV": div, "MODEM_DIV": modem, "MB_METER_ID": mb or (no if modem == "10" else ""),
            "INST_M": im, "INST_S": inst_s or (R.infer_inst_s(im, mac) or im + "10"), "DCU_ID": dcu,
            "WORK_DATE": day, "REG_DATE": 1, "MB_REG_CNT": reg_cnt, "DEPT2": dept, "_auto_s": inst_s is None}


def group(master, slaves):
    n = 1 + len(slaves)
    rs = [master] + slaves
    for r in rs:
        if r["MB_REG_CNT"] is None:
            r["MB_REG_CNT"] = str(n)
        auto = r.pop("_auto_s", False)
        if r["MODEM_DIV"] != "10":
            r["MB_METER_ID"] = r["MB_METER_ID"] or master["INSTR_NUM"]
            if auto:     # slave inherits the master's 통신방식 suffix
                r["INST_S"] = r["INST_M"] + master["INST_S"][-2:]
    return rs


SHIP = {"rows": {"E0AEED953741": {"owned": True}, "01254537242": {"owned": True},
                 "01264265356": {"owned": True}, "AC5E8CA8F80A": {"owned": True},
                 "E0AEED999999": {"owned": True}}}   # E0AEED999999 = unused stock (기설로 넣으면 빨강)
IDX = {}


def lst(no, addr, l="c", jisa="마포용산지사"):
    IDX.setdefault(no, []).append({"계기번호": no, "주소": addr, "l": l, "지사": jisa})


def run(rows, details=None, ws=None):
    rep = C.Report()
    sites = C.map_sites(DAY, ws or {}, IDX)
    done = {m for _, v, ms in sites if v.get("state") == "complete" for m in ms}
    with redirect_stdout(io.StringIO()):
        C.app_check(DAY, rows, SHIP, IDX, details or {}, [], rep, done)
        C.map_check(sites, rows, IDX, rep)
    return rep


def has(rep, level, *words):
    return any(x["level"] == level and all(w in x["msg"] for w in words) for x in rep.items)


CASES = []


def case(name):
    def deco(f):
        CASES.append((name, f))
        return f
    return deco


# base: clean groups -> nothing
def base():
    m = row("48190262997", "E0AEED953741")
    s1 = row("48190262687", "E0AEED953741", modem="20")
    lte = row("47452030837", "01254537242", dcu="")
    amigo = row("45520006380", "01264265356", dcu="")          # type code 52 = Amigo
    for n in ("48190262997", "48190262687"):
        lst(n, "서울특별시 마포구 구수동 1")
    lst("47452030837", "서울특별시 마포구 구수동 2", "l")
    lst("45520006380", "서울특별시 마포구 신수동 361", "l")
    return group(m, [s1]) + group(lte, []) + group(amigo, [])


BUNGI_OK = {"48190262687": {"BUNGI": "0.5"}}


@case("깨끗한 날 = 빨강·노랑 0 (코드 52 아미고 포함)")
def _():
    rep = run(base(), BUNGI_OK)
    return not rep.of("red") and not rep.of("yellow"), rep


@case("마스터 통신방식 틀림 = 빨강")
def _():
    rs = base()
    rs[0]["INST_S"] = "HW404090"
    return has(run(rs, BUNGI_OK), "red", "통신방식", "48190262997"), None


@case("마스터 계기유형 틀림 = 빨강")
def _():
    rs = base()
    rs[2]["INST_M"] = "HW4040"
    return has(run(rs, BUNGI_OK), "red", "계기유형", "47452030837"), None


@case("슬레이브 분기 무선(아미고 모뎀 아님) = 빨강")
def _():
    return has(run(base(), {"48190262687": {"BUNGI": "무선"}}), "red", "분기", "48190262687"), None


@case("아미고 모뎀 아미고 슬레이브 무선 = 정상")
def _():
    m = row("A0550070511", "01264263971", dcu="")
    s = row("25530026782", "01264263971", modem="20")
    lst("A0550070511", "서울특별시 마포구 신수동 9", "l")
    lst("25530026782", "서울특별시 마포구 신수동 9", "l")
    SHIP["rows"]["01264263971"] = {"owned": True}
    rep = run(group(m, [s]), {"25530026782": {"BUNGI": "무선"}})
    return not rep.of("red"), rep


@case("슬레이브 작업구분 기설 = 빨강")
def _():
    rs = base()
    rs[1]["WORK_DIV"] = "M1030"
    return has(run(rs, BUNGI_OK), "red", "작업구분", "48190262687"), None


@case("없는 타입코드 = 빨강")
def _():
    rs = base()
    rs[2]["INSTR_NUM"] = "47992030837"
    return has(run(rs, BUNGI_OK), "red", "타입코드 99"), None


@case("MB_REG_CNT 불일치 = 빨강")
def _():
    rs = base()
    rs[0]["MB_REG_CNT"] = "3"
    return has(run(rs, BUNGI_OK), "red", "MB_REG_CNT"), None


@case("PLC 신설 DCU_ID 빈값 = 빨강")
def _():
    rs = base()
    rs[0]["DCU_ID"] = ""
    return has(run(rs, BUNGI_OK), "red", "DCU_ID"), None


@case("신설 맥 출고장부 밖 = 빨강")
def _():
    rs = base()
    for r in rs[:2]:
        r["MAC_MODEM"] = "E0AEED953700"
    return has(run(rs, BUNGI_OK), "red", "출고장부"), None


@case("기설 맥이 내 미사용 재고 = 빨강(신설인데 기설로)")
def _():
    m = row("39190455017", "E0AEED999999", div="M1030", dcu="")
    s = row("35190342840", "E0AEED999999", modem="20")
    lst("35190342840", "서울특별시 마포구 구수동 74-2")
    return has(run(group(m, [s]), {"35190342840": {"BUNGI": "0.5"}}), "red", "신설인데 기설로"), None


@case("기설 맥 형식 오류 = 빨강")
def _():
    m = row("39190455017", "947207DF035F", div="M1030", dcu="", inst_s="HW404010")
    return has(run(group(m, [])), "red", "형식 오류"), None


@case("기설 마스터(리스트 밖) + 리스트 슬레이브 = 노랑 아님")
def _():
    m = row("06190038568", "E0AEED90044B", div="M1030", dcu="")
    s = row("47452015946", "E0AEED90044B", modem="20")
    lst("47452015946", "서울특별시 마포구 구수동 21-1")
    rep = run(group(m, [s]), {"47452015946": {"BUNGI": "0.5"}},
              {"서울특별시 마포구 구수동 21-1|미조치": {"state": "complete", "updatedAt": "2026-11-13T09:40:00+09:00",
                                                    "updatedByName": "우영준"}})
    return not rep.of("yellow") and not rep.of("red"), rep


@case("같은 맥 마스터 둘 = 노랑")
def _():
    rs = base()
    extra = row("48190262884", "E0AEED953741")
    rs.append(extra)
    rs[0]["MB_REG_CNT"] = "2"
    extra["MB_REG_CNT"] = "1"
    lst("48190262884", "서울특별시 마포구 구수동 1")
    rep = run(rs, BUNGI_OK)
    return has(rep, "yellow", "같은 맥 마스터 2개"), rep


@case("다른 날 마스터에 슬레이브만 = 정상(대표계기를 슬레이브로 넣어도)")
def _():
    m = row("81190066856", "AC5E8CA8F80A", day="20261112", dcu="9725Y3516")
    m["MB_REG_CNT"] = "3"
    s1 = row("81190066859", "AC5E8CA8F80A", modem="20", mb="81190066856", inst_s="HW404090")
    s2 = row("81190066856", "AC5E8CA8F80A", modem="20", mb="81190066856", inst_s="HW404090")
    for n in ("81190066856", "81190066859"):
        lst(n, "서울특별시 마포구 신수동 50")
    for r in (m, s1, s2):
        r.pop("_auto_s", None)
    rep = run([m, s1, s2], {"81190066859": {"BUNGI": "0.5"}, "81190066856": {"BUNGI": "0.5"}})
    return not rep.of("red"), rep


@case("리스트 밖 계기 섞인 모뎀 = 노랑(묶어서)")
def _():
    rs = base()
    s2 = row("25530024655", "E0AEED953741", modem="20")
    rs.insert(2, s2)
    for r in rs[:3]:
        r["MB_REG_CNT"] = "3"
    rep = run(rs, {**BUNGI_OK, "25530024655": {"BUNGI": "0.5"}})
    return has(rep, "yellow", "리스트 밖 계기 1대", "25530024655"), rep


WS = "서울특별시 마포구 신수동 257-1|미조치"


def site257(memo):
    m = row("91190222801", "AC5E8CA8ADD3", dcu="9725Y3516", inst_s="HW404090")
    s = row("05195517042", "AC5E8CA8ADD3", modem="20", inst_s="HW405290")
    s["INST_M"] = "HW4040"
    s["INST_S"] = "HW404090"
    lst("91190222801", "서울특별시 마포구 신수동 257-1")
    lst("67195517042", "서울특별시 마포구 신수동 257-1")
    SHIP["rows"]["AC5E8CA8ADD3"] = {"owned": True}
    ws = {WS: {"state": "complete", "updatedAt": "2026-11-13T10:19:31+09:00", "updatedByName": "우영준",
               "failedMeters": {"67195517042": memo}}}
    return run(group(m, [s]), {"05195517042": {"BUNGI": "0.5"}}, ws)


@case("개별불가 메모 한 자리 다름 = 노랑 메모 오타 의심 (11/13 신수동 257-1)")
def _():
    rep = site257("05295517042")
    return has(rep, "yellow", "메모 오타 의심", "05195517042") and not rep.of("red"), rep


@case("개별불가 메모 번호가 awms 에 있음 = 해결(초록)")
def _():
    rep = site257("05195517042")
    return has(rep, "green", "해결") and not rep.of("yellow") and not rep.of("red"), rep


@case("리스트 1대 없음 + 리스트 밖 = 노랑 묶음 (11/13 신수동 275-1)")
def _():
    m = row("47450039041", "01254535719", dcu="")
    ss = [row(n, "01254535719", modem="20") for n in ("25530026782", "25530024655")]
    for n in ("25530026782", "25530018556"):
        lst(n, "서울특별시 마포구 신수동 275-1", "l")
    SHIP["rows"]["01254535719"] = {"owned": True}
    ws = {"서울특별시 마포구 신수동 275-1|미조치lte": {"state": "complete", "updatedAt": "2026-11-13T15:13:07+09:00",
                                                    "updatedByName": "우영준"}}
    rep = run(group(m, ss), {n: {"BUNGI": "0.5"} for n in ("25530026782", "25530024655")}, ws)
    ok = has(rep, "yellow", "리스트 2대 / 등록 3대", "25530018556", "리스트 밖 2대") and not rep.of("red")
    return ok, rep


@case("리스트 계기 없음 + 리스트 밖 없음 = 빨강(추가 등록)")
def _():
    m = row("47452030837", "01254537242", dcu="")
    lst("47452030837", "서울특별시 마포구 구수동 5", "l")
    lst("47452030000", "서울특별시 마포구 구수동 5", "l")
    ws = {"서울특별시 마포구 구수동 5|미조치lte": {"state": "complete", "updatedAt": "2026-11-13T11:00:00+09:00",
                                                "updatedByName": "우영준"}}
    rep = run(group(m, []), {}, ws)
    return has(rep, "red", "47452030000"), rep


def main():
    bad = 0
    for name, f in CASES:
        IDX.clear()
        ok, rep = f()
        print(("PASS " if ok else "FAIL ") + name)
        if not ok:
            bad += 1
            for x in (rep.items if rep else []):
                print("      ", x["level"], x["msg"])
    print("FAIL" if bad else "PASS", f"({len(CASES) - bad}/{len(CASES)})")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
