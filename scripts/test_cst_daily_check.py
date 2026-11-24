#!/usr/bin/env python3
"""작업검사 판정 규칙 시험 — 합성 awms 행으로 빨강·노랑·초록이 맞게 나오는지 (네트워크·사진 없음).

    python3 scripts/test_cst_daily_check.py

실측 사례(2026-11-12·11-13)를 줄여 만든 행에 한 가지씩 틀린 값을 넣고, 그 규칙만 걸리는지 본다.
"""
import io
import json
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


@case("지도 없음 계기 섞인 모뎀 = 지도 없음 항목(묶어서)")
def _():
    rs = base()
    s2 = row("25530024655", "E0AEED953741", modem="20")
    rs.insert(2, s2)
    for r in rs[:3]:
        r["MB_REG_CNT"] = "3"
    rep = run(rs, {**BUNGI_OK, "25530024655": {"BUNGI": "0.5"}})
    return has(rep, "outlist", "지도 없음 계기 1대", "25530024655"), rep


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


@case("리스트 1대 없음 + 리스트 밖 = 빨강 누락, 리스트 밖은 노랑 표시만 (11/13 신수동 275-1)")
def _():
    m = row("47450039041", "01254535719", dcu="")
    ss = [row(n, "01254535719", modem="20") for n in ("25530026782", "25530024655")]
    for n in ("25530026782", "25530018556"):
        lst(n, "서울특별시 마포구 신수동 275-1", "l")
    SHIP["rows"]["01254535719"] = {"owned": True}
    ws = {"서울특별시 마포구 신수동 275-1|미조치lte": {"state": "complete", "updatedAt": "2026-11-13T15:13:07+09:00",
                                                    "updatedByName": "우영준"}}
    rep = run(group(m, ss), {n: {"BUNGI": "0.5"} for n in ("25530026782", "25530024655")}, ws)
    ok = has(rep, "red", "누락", "25530018556") and has(rep, "outlist", "지도 없음 2대")
    C.resolve_outlist(rep, {})
    ok = ok and has(rep, "yellow", "275-1", "지도 없음 2대") and has(rep, "red", "누락")
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


def outlist_rep():
    rs = base()
    s2 = row("25530024655", "E0AEED953741", modem="20")
    rs.insert(2, s2)
    for r in rs[:3]:
        r["MB_REG_CNT"] = "3"
    return run(rs, {**BUNGI_OK, "25530024655": {"BUNGI": "0.5"}})


@case("지도 없음 = 노랑 표시만, 사진 판독 없음 (영준님 2026-11-16)")
def _():
    rep = outlist_rep()
    C.resolve_outlist(rep, {})
    return (has(rep, "yellow", "지도 없음 계기 1대", "25530024655") and not has(rep, "yellow", "사진")
            and not rep.of("outlist")), rep


@case("지도 없음 + 판독 안 함(--no-ocr) = 같은 노랑")
def _():
    rep = outlist_rep()
    C.resolve_outlist(rep, None)
    return has(rep, "yellow", "지도 없음 계기 1대") and not rep.of("outlist"), rep


@case("지도 없음 오타 후보 + 판독 실패 = 노랑에 판독 못 함")
def _():
    rep = outlist_rep()
    C.resolve_outlist(rep, {"25530024655": "none"})
    return has(rep, "yellow", "사진 판독 못 함", "25530024655"), rep


@case("지도 없음 오타 후보 + 사진 번호 다름 = 이 항목 빼고 판독 항목에 맡김")
def _():
    rep = outlist_rep()
    C.resolve_outlist(rep, {"25530024655": "bad"})
    return not [x for x in rep.items if "지도 없음" in x["msg"]], rep


@case("지도: 리스트 밖만 더 있음(빠진 것 없음) = 노랑 표시만, 빨강 없음")
def _():
    m = row("A0550070511", "01264263971", dcu="")
    ss = [row(n, "01264263971", modem="20") for n in ("25190712322", "25190712868")]
    for n in ("25190712322", "25190712868"):
        lst(n, "서울특별시 마포구 신수동 421-12")
    SHIP["rows"]["01264263971"] = {"owned": True}
    ws = {"서울특별시 마포구 신수동 421-12|미조치": {"state": "complete", "updatedAt": "2026-11-13T11:08:06+09:00",
                                                  "updatedByName": "우영준"}}
    rep = run(group(m, ss), {n: {"BUNGI": "0.5"} for n in ("25190712322", "25190712868")}, ws)
    C.resolve_outlist(rep, {})
    return has(rep, "yellow", "421-12", "지도 없음 1대") and not rep.of("red"), rep


def targets(rs, rep=None, ship=None):
    rep = rep or C.Report()
    gd = {(r.get("MAC_MODEM") or "").upper(): r.get("WORK_DIV") for r in rs if r.get("WORK_DATE") == DAY and r.get("MODEM_DIV") == "10"}
    ms, macs = C.ocr_targets(DAY, rs, ship or SHIP, IDX, rep, gd)
    return sorted(r["INSTR_NUM"] for r in ms), sorted((r.get("MAC_MODEM") or "").upper() for r in macs)


@case("사진 판독 대상 — 지도 없음은 같은 주소 1자리 차이 지도 계기(awms 에 없음)가 있을 때만")
def _():
    rep = outlist_rep()
    rs = base()
    s2 = row("25530024655", "E0AEED953741", modem="20")
    rs.insert(2, s2)
    none_near = targets(rs, rep)[0] == []
    lst("25530024656", "서울특별시 마포구 구수동 9")            # one off but another address -> not read
    far = targets(rs, rep)[0] == []
    addr = IDX["48190262997"][0]["주소"]
    lst("25530024657", addr)                                     # same address as the modem's list meters -> read
    near = targets(rs, rep)[0] == ["25530024655"]
    other = row("25530024657", "E0AEED900000", modem="20", day="20261101")
    serial = targets(rs + [other], rep)[0] == []                 # the near one is in awms = next serial number
    return none_near and far and near and serial, None


@case("사진 판독 대상 — 계기번호 형식·타입코드 이상은 늘 판독")
def _():
    m = row("4819026299A", "E0AEED953741")
    m2 = row("48990262997", "E0AEED953742")
    return targets([m, m2])[0] == ["4819026299A", "48990262997"], None


@case("사진 판독 대상 — 기설 맥은 형식 오류이거나 출고장부·앞선 awms 둘 다 없을 때만")
def _():
    ok_ship = row("48190262997", "E0AEED953741", div="M1030")                 # 출고장부에 있음
    seen = row("48190262998", "E0AEED111111", div="M1030")                    # 앞선 날 awms 에 있음
    old = row("48190262000", "E0AEED111111", day="20261101")
    unknown = row("48190262999", "E0AEED222222", div="M1030")                 # 둘 다 없음 -> 판독
    bad = row("48190262996", "E0AEEX953741", div="M1030")                     # 형식 오류 -> 판독
    new_out = row("48190262995", "E0AEED333333")                              # 신설, 장부 둘 다 없음 -> 판독
    new_in = row("48190262994", "E0AEED999999")                               # 신설, 출고장부 있음
    got = targets([ok_ship, seen, old, unknown, bad, new_out, new_in])[1]
    return got == sorted(["E0AEED222222", "E0AEEX953741", "E0AEED333333"]), got


@case("사진 판독은 판독 대상만 읽는다")
def _():
    rs = base()
    s2 = row("25530024655", "E0AEED953741", modem="20")
    rs.insert(2, s2)
    seen = []
    old_tp, old_gp = C.two_pass, C.get_photo
    C.get_photo = lambda meter, slot, *a, **k: f"/x/{meter}_{slot}.jpg"

    def fake(targets, read, match, outdir):
        seen.append([k for k, _, _ in targets])
        return {k: ("ok", w, "") for k, w, _ in targets}
    C.two_pass = fake
    try:
        with redirect_stdout(io.StringIO()):
            v = C.ocr_check(rs, IDX, {}, {}, C.Report(), Path("/tmp"), [s2], [])
    finally:
        C.two_pass, C.get_photo = old_tp, old_gp
    return seen and seen[0] == ["25530024655"] and set(v) == {"25530024655"}, None


@case("상세 캐시 — 보낸 행(29)만, 작은 칸만, 계정마다 파일 따로, 두 번째는 awms 안 부름")
def _():
    import tempfile
    calls = []
    old_d, old_h = C.A.detail, C.A.headers
    C.A.headers = lambda: {}

    def fake(r, h):
        calls.append(r["INSTR_NUM"])
        return [{"BUNGI": "0.5", "ATCH_FILE_ID_5": "F5", "WORK_STEP": r["WORK_STEP"], "CUST_NO": "x", "ETC1": "x"}]
    C.A.detail = fake
    try:
        with tempfile.TemporaryDirectory() as td:
            rs = [dict(row("48190262687", "E0AEED953741", modem="20"), WORK_STEP="29", BUSI_NUM="B"),
                  dict(row("48190262688", "E0AEED953741", modem="20"), WORK_STEP="25", BUSI_NUM="B")]
            c1 = C.DetailCache("111", Path(td))
            d1 = C.fetch_details(rs, c1)
            stored = json.loads((Path(td) / "111.json").read_text())
            c2 = C.DetailCache("111", Path(td))
            d2 = C.fetch_details(rs, c2)
            c3 = C.DetailCache("222", Path(td))
            C.fetch_details(rs[:1], c3)
    finally:
        C.A.detail, C.A.headers = old_d, old_h
    ok = (calls == ["48190262687", "48190262688", "48190262688", "48190262687"]
          and list(stored.values()) == [{"BUNGI": "0.5", "ATCH_FILE_ID_5": "F5", "WORK_STEP": "29"}]
          and c2.hits == 1 and c2.fetched == 1 and d2["48190262687"]["BUNGI"] == "0.5"
          and d1["48190262688"].get("CUST_NO") == "x" and c3.fetched == 1)
    return ok, (calls, stored)


@case("다른 날 마스터에 슬레이브 대표계기 = 자기 번호 = 초록 메모(빨강 아님)")
def _():
    m = row("47450039041", "01254535719", day="20261112", dcu="")
    m["MB_REG_CNT"] = "2"
    s0 = row("25530026727", "01254535719", modem="20", mb="47450039041", day="20261112", inst_s="HW405070")
    s = row("25530018556", "01254535719", modem="20", mb="25530018556", inst_s="HW405070")
    for n in ("47450039041", "25530026727", "25530018556"):
        lst(n, "서울특별시 마포구 신수동 275-1", "l")
    for r in (m, s0, s):
        r.pop("_auto_s", None)
    rep = run([m, s0, s], {"25530018556": {"BUNGI": "0.5"}})
    return not rep.of("red") and has(rep, "green", "자기 번호", "25530018556"), rep


@case("같은 날 마스터인데 슬레이브 대표계기 = 자기 번호 = 빨강 그대로")
def _():
    rs = base()
    rs[1]["MB_METER_ID"] = rs[1]["INSTR_NUM"]
    return has(run(rs, BUNGI_OK), "red", "대표계기", "48190262687"), None


@case("뒷자리 2자리 — 마스터와 0.5 슬레이브가 같아도 정상(마스터는 분기 없음)")
def _():
    m = row("48190262997", "E0AEED953741")
    s1 = row("48190262697", "E0AEED953741", modem="20")
    for n in ("48190262997", "48190262697"):
        lst(n, "서울특별시 마포구 구수동 1")
    rep = run(group(m, [s1]), {"48190262697": {"BUNGI": "0.5"}})
    return not has(rep, "red", "뒷자리"), rep


@case("뒷자리 2자리 중복 — 0.5 슬레이브 둘 = 빨강(마스터는 안 낌)")
def _():
    m = row("48190262997", "E0AEED953741")
    s1 = row("48190262697", "E0AEED953741", modem="20")
    s2 = row("48190262597", "E0AEED953741", modem="20")
    for n in ("48190262997", "48190262697", "48190262597"):
        lst(n, "서울특별시 마포구 구수동 1")
    rep = run(group(m, [s1, s2]), {"48190262697": {"BUNGI": "0.5"}, "48190262597": {"BUNGI": "0.5"}})
    return any(x["level"] == "red" and x.get("kind") == "뒷자리 중복" and x.get("meters") == ["48190262597", "48190262697"]
               for x in rep.items), rep


@case("뒷자리 2자리 중복 — 앞선 날 슬레이브와 오늘 슬레이브 = 빨강")
def _():
    m = row("47450039041", "01254535719", day="20261112", dcu="")
    m["MB_REG_CNT"] = "2"
    s0 = row("25530026727", "01254535719", modem="20", mb="47450039041", day="20261112", inst_s="HW405070")
    s = row("25530018527", "01254535719", modem="20", mb="47450039041", inst_s="HW405070")
    for r in (m, s0, s):
        r.pop("_auto_s", None)
    for n in ("47450039041", "25530026727", "25530018527"):
        lst(n, "서울특별시 마포구 신수동 275-1", "l")
    rep = run([m, s0, s], {"25530018527": {"BUNGI": "0.5"}, "25530026727": {"BUNGI": "0.5"}})
    return has(rep, "red", "뒷자리 27 중복"), rep


@case("뒷자리 2자리 중복 — 무선 슬레이브끼리·무선과 0.5 = 정상")
def _():
    m = row("A0550070511", "01264263971", dcu="")
    s1 = row("25530026782", "01264263971", modem="20")
    s2 = row("25530016782", "01264263971", modem="20")
    s3 = row("25530017382", "01264263971", modem="20")
    for n in ("A0550070511", "25530026782", "25530016782", "25530017382"):
        lst(n, "서울특별시 마포구 신수동 9", "l")
    SHIP["rows"]["01264263971"] = {"owned": True}
    rep = run(group(m, [s1, s2, s3]), {"25530026782": {"BUNGI": "무선"}, "25530016782": {"BUNGI": "무선"},
                                        "25530017382": {"BUNGI": "0.5"}})
    return not has(rep, "red", "뒷자리"), rep


@case("뒷자리 2자리 — 아미고 마스터와 0.5 슬레이브가 같아도 정상(마스터는 분기 없음)")
def _():
    m = row("A0550070582", "01264263971", dcu="")
    s1 = row("25530026782", "01264263971", modem="20")
    for n in ("A0550070582", "25530026782"):
        lst(n, "서울특별시 마포구 신수동 9", "l")
    SHIP["rows"]["01264263971"] = {"owned": True}
    rep = run(group(m, [s1]), {"25530026782": {"BUNGI": "0.5"}})
    return not has(rep, "red", "뒷자리"), rep


@case("뒷자리 2자리 중복 — 아미고 모뎀 아미고 슬레이브도 실제 분기 0.5 끼리면 빨강")
def _():
    m = row("A0550070511", "01264263971", dcu="")
    s1 = row("25530026782", "01264263971", modem="20")
    s2 = row("25530016782", "01264263971", modem="20")
    for n in ("A0550070511", "25530026782", "25530016782"):
        lst(n, "서울특별시 마포구 신수동 9", "l")
    SHIP["rows"]["01264263971"] = {"owned": True}
    rep = run(group(m, [s1, s2]), {"25530026782": {"BUNGI": "0.5"}, "25530016782": {"BUNGI": "0.5"}})
    return has(rep, "red", "뒷자리 82 중복"), rep


@case("뒷자리 2자리 중복 — 분기를 못 읽은 슬레이브는 추정하지 않고 뺀다")
def _():
    m = row("48190262997", "E0AEED953741")
    s1 = row("48190262697", "E0AEED953741", modem="20")
    for n in ("48190262997", "48190262697"):
        lst(n, "서울특별시 마포구 구수동 1")
    rep = run(group(m, [s1]), {})
    return not has(rep, "red", "뒷자리"), rep


@case("지도 상태 — 완료 아님 = 노랑, 불가·개별불가인데 awms 설치 = 빨강, 완료 = 없음")
def _():
    rs = base()
    ws = {"서울특별시 마포구 구수동 1|미조치": {"state": "complete", "failedMeters": {"48190262687": "출입불가"},
                                         "updatedAt": "2026-11-12T10:00:00+09:00", "updatedByName": "장진교"},
          "서울특별시 마포구 구수동 2|미조치lte": {"state": "fail", "updatedAt": "2026-11-13T10:00:00+09:00",
                                            "updatedByName": "우영준"}}
    run(rs, BUNGI_OK, ws)          # the helper parity test runs the same rows + ws through the phone
    rep = C.Report()
    C.map_state_check(DAY, rs, IDX, ws, rep)
    ok = (has(rep, "red", "지도 불가인데 awms 설치", "48190262687") and has(rep, "red", "지도 불가인데 awms 설치", "47452030837")
          and has(rep, "yellow", "지도 완료 안 함", "45520006380") and not has(rep, "yellow", "48190262997"))
    return ok, rep


@case("지도 상태 — 옛 공유 키(주소|미조치)에 완료 = lte 계기도 완료로 본다")
def _():
    rs = base()
    ws = {"서울특별시 마포구 구수동 1|미조치": {"state": "complete"}, "서울특별시 마포구 구수동 2|미조치": {"state": "complete"},
          "서울특별시 마포구 신수동 361|미조치lte": {"state": "complete"}}
    run(rs, BUNGI_OK, ws)
    rep = C.Report()
    C.map_state_check(DAY, rs, IDX, ws, rep)
    return not rep.items, rep


# ── 2c. 지도 불가 ↔ awms 설치불가 (영준님 2026-11-24, 11/24 실측을 줄인 것) ──
def unable_row(no, day=DAY):
    import datetime
    ms = int(datetime.datetime.strptime(day + " 12", "%Y%m%d %H").replace(tzinfo=C.KST).timestamp() * 1000)
    return {"INSTR_NUM": no, "WORK_DATE": ms, "UNABLE_DETAIL": "M20206030", "WORK_STEP": "29"}


def run_unable(rows, ws, unable):
    rep = C.Report()
    with redirect_stdout(io.StringIO()):
        C.unable_check(DAY, C.map_sites(DAY, ws, IDX), rows, unable, IDX, ws, rep)
    return rep


def me(state, **kw):
    return {"state": state, "updatedAt": "2026-11-13T11:00:00+09:00", "updatedByName": "우영준", **kw}


@case("설치불가 — 지도 불가(개소·개별) 가 awms 설치불가에 있으면 맞음, 없으면 빨강 누락")
def _():
    lst("47450038409", "서울특별시 마포구 새창로 23", "u")
    lst("05465037301", "서울특별시 마포구 마포대로 92", "u")
    for n in ("25190127792", "25190132451"):
        lst(n, "서울특별시 마포구 도화동 181-9", "l")
    lst("58190015588", "서울특별시 마포구 도화동 183-15", "l")
    lst("58190015500", "서울특별시 마포구 도화동 183-15", "l")
    ws = {"서울특별시 마포구 새창로 23|미청구불가": me("fail", reason="문잠김"),
          "서울특별시 마포구 마포대로 92|미청구불가": me("fail"),
          "서울특별시 마포구 도화동 181-9|미조치lte": me("fail"),
          "서울특별시 마포구 도화동 183-15|미조치lte": me("complete", failedMeters={"58190015588": "문잠김 옥상"})}
    rows = [row("58190015500", "E0AEED953741")]
    # 마포대로 92 는 다른 날(11/10) 설치불가로 등록 = 있음
    unable = [unable_row("25190127792"), unable_row("25190132451"), unable_row("58190015588"),
              unable_row("05465037301", "20261110")]
    rep = run_unable(rows, ws, unable)
    ok = (has(rep, "red", "설치불가 등록 누락", "47450038409", "문잠김") and not has(rep, "red", "05465037301")
          and not has(rep, "red", "181-9") and not has(rep, "red", "58190015588") and not rep.of("yellow")
          and has(rep, "green", "맞음 4계기", "누락 1"))
    return ok, rep


@case("설치불가 — 오늘 awms 설치불가인데 지도 불가 아님 = 노랑(완료·표시 없음·지도 없음), 다른 사람 불가는 맞음")
def _():
    lst("25190127953", "서울특별시 마포구 도화동 184-6", "c")
    lst("06190421892", "서울특별시 마포구 도화동 25-14", "l")
    lst("25190132223", "서울특별시 마포구 도화동 30-1", "c")
    ws = {"서울특별시 마포구 도화동 184-6|미조치": me("complete"),
          "서울특별시 마포구 도화동 30-1|미조치": {"state": "fail", "updatedAt": "2026-11-01T10:00:00+09:00",
                                            "updatedByName": "장진교"}}
    unable = [unable_row("25190127953"), unable_row("06190421892"), unable_row("25190132223"),
              unable_row("99190000001"), unable_row("25190127000", "20261110")]
    rep = run_unable([], ws, unable)
    ok = (has(rep, "yellow", "지도 불가 아님(완료)", "25190127953") and has(rep, "yellow", "지도 불가 아님(표시 없음)", "06190421892")
          and has(rep, "yellow", "지도 불가 아님(지도 없음)", "99190000001") and not has(rep, "yellow", "25190132223")
          and not has(rep, "yellow", "25190127000") and not rep.of("red"))
    return ok, rep


@case("설치불가 — 지도 불가인데 다른 날 awms 설치 = 빨강, 오늘 설치는 2b 가 내므로 중복 없음, 아카이브 리스트도 읽음")
def _():
    lst("35450219918", "서울특별시 마포구 도화길 45-1", "u")
    lst("35450219900", "서울특별시 마포구 도화길 45-1", "u")
    ws = {"서울특별시 마포구 도화길 45-1|미청구불가": me("fail")}
    rows = [row("35450219918", "01254537242", day="20261110"), row("35450219900", "01264265356")]
    rep = run_unable(rows, ws, [])
    ok = (has(rep, "red", "다른 날 등록", "35450219918") and not has(rep, "red", "35450219900")
          and not has(rep, "red", "등록 누락"))
    rep2 = C.Report()
    C.map_state_check(DAY, rows, IDX, ws, rep2)
    ok = ok and has(rep2, "red", "지도 불가인데 awms 설치", "35450219900")
    rep.items += rep2.items
    return ok, rep


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
