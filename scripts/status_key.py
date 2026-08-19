#!/usr/bin/env python3
"""status_key.py — workStatus 상태 키 생성 (공용 규칙, js/status-key.js 와 동일)

배경: 마커 단위는 `category||lat||lng` 인데 상태(workStatus) 단위는 '주소' 단독이었다.
  두 단위가 안 맞아, 한 주소가 마커 여러 개로 갈리면 마커들이 상태 레코드 하나를 공유했고
  한쪽을 완료하면 다른 쪽도 완료로 보였다. 좌표가 갈렸다는 것은 실제로 다른 집일 확률이
  높으므로(영준님 결정 2026-08-02) 합치지 않고 마커마다 키를 준다.

키 규칙 (확정):
  1. 기본은 '주소' 그대로 — 하위호환. 갈리지 않는 주소는 키가 바뀌지 않는다.
  2. 한 주소가 마커 2개 이상으로 갈릴 때만 구분자를 붙인다: '주소|도로명주소'
  3. 도로명까지 같아 못 가르면 카테고리를 덧붙인다: '주소|도로명주소|category'
  4. 그래도 못 가르면 좌표를 덧붙인다: '주소|도로명주소|category|lat,lng'

  구분자는 도로명주소 기준이다. 좌표로 잡으면 재지오코딩 때 키가 바뀌어 작업기록이
  유실된다. 좌표는 최후 수단이다.

네임스페이스 규칙 (2026-08-18 추가 — 영준님 "고압은 리스트 따로 봐야 함. 아예 다른 성격임"):
  NAMESPACED_CATEGORIES 에 든 카테고리는 위 사다리를 타지 않고 자기 이름을 키에 박는다.
    0. '주소|고압'                          <- 기본형
    1. '주소|도로명주소|고압'                 <- 같은 주소에 고압 마커가 둘 이상일 때만
    2. '주소|도로명주소|고압|lat,lng'         <- 그래도 못 가를 때

  ★왜 필요한가: workStatus 는 정리되지 않는다. 실효에서 완료된 주소는 site-data 에서
    빠지지만(완료제거) workStatus 레코드는 '주소' 키로 영원히 남는다. 나중에 같은 주소가
    새 리스트로 들어오면 마커가 하나뿐이라 갈림 판정이 안 걸리고, 키가 맨주소 그대로라서
    몇 달 전 남의 완료 기록을 그대로 읽는다(2026-08-18 실증: 마포구 용강동 39-1 —
    6/26 실효 완료분을 8/13 투입된 고압이 완료로 물려받음). 마커 갈림 기반으로는 안 풀리고
    키에 리스트 이름을 박아야 풀린다.

  ★네임스페이스 카테고리는 일반 카테고리의 '갈림 판정'에서도 빠진다. 그래야 고압이 끼어든
    주소 때문에 실효·재방문 키가 흔들리지 않는다(실측: 비고압 마커 4,136개 키 변경 0건).

  ★형식이 '주소|고압'인 이유: 주소가 첫 칸이어야 address_of_status_key() 가 그대로 돈다.
    '고압|주소' 로 하면 주소 자리에 '고압'이 나와 디테일 모달의 키 선택이 깨진다.
    또 도로명을 기본형에 넣지 않아 재지오코딩에 영향받지 않는다.

  이 파일과 js/status-key.js 는 반드시 같은 키를 내야 한다.
  동일성 검사: scripts/test_status_key_parity.py
"""

import json
import os

STATUS_KEY_SEP = "|"

# 마커로 뜨는 데이터셋 — js/map.js 의 DATASETS 와 같아야 한다.
#   ※skt·tou 는 2026-08-02 영준님 지시로 map.js 에서 내렸다. 여기서도 주석처리해 둔다
#     (데이터 파일 자체가 없어 키에는 영향이 없었지만, 목록이 어긋나면 parity 검사가
#      매번 경고를 뿜어 진짜 어긋남을 가린다). 되살릴 땐 map.js 와 함께 되살려라.
DATASETS = [
    ("site-data.json", "실효"),
    ("rework-data.json", "재방문"),
    ("gapap-data.json", "고압"),
    # ("skt-data.json", "skt"),
    # ("tou-data.json", "tou"),
]

# 자기 이름을 상태키에 박는 카테고리 — 다른 리스트와 상태를 절대 공유하지 않는다.
#   성격이 다른 리스트가 또 들어오면 여기에 한 줄 추가하면 된다.
NAMESPACED_CATEGORIES = ("고압",)


def marker_key_of(item):
    """마커 식별자 — js/map.js loadMarkers()의 그룹핑 키와 같은 형식."""
    return "{}||{}||{}".format(item.get("category"), item.get("lat"), item.get("lng"))


def _lookup_key(marker_key, addr):
    """인덱스 조회용 내부 키.

    마커키만으로는 부족하다 — 합친 마커(같은 좌표·같은 카테고리에 지번 여럿)는
    한 마커키에 주소가 여러 개라, 마커키만 쓰면 마지막 주소로 덮어써진다.
    """
    return "{}\x00{}".format(marker_key, addr)


def _coord_text(lat, lng):
    return "{:.6f},{:.6f}".format(float(lat), float(lng))


def load_rows(data_dir):
    """DATASETS 를 읽어 category 를 붙인 레코드 목록을 반환."""
    rows = []
    for fname, cat in DATASETS:
        path = os.path.join(data_dir, fname)
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            arr = json.load(f)
        if not isinstance(arr, list):
            arr = next((v for v in arr.values() if isinstance(v, list)), [])
        for r in arr:
            if isinstance(r, dict):
                r = dict(r)
                r["category"] = cat
                rows.append(r)
    return rows


def _collect_by_address(rows):
    """주소 -> 마커키 -> 그 마커의 대표 속성."""
    by_addr = {}
    for item in rows:
        addr = item.get("주소")
        if not addr or item.get("lat") is None or item.get("lng") is None:
            continue
        mk = marker_key_of(item)
        slot = by_addr.setdefault(addr, {})
        if mk not in slot:
            slot[mk] = {
                "roads": set(),
                "category": item.get("category"),
                "lat": item["lat"],
                "lng": item["lng"],
            }
        if item.get("도로명주소"):
            slot[mk]["roads"].add(item["도로명주소"])
    return by_addr


def _road_of(slot, mk):
    """대표 도로명: 한 마커에 도로명이 여럿이면 정렬 첫번째로 결정론적 선택."""
    rs = sorted(slot[mk]["roads"])
    return rs[0] if rs else ""


def build_status_key_index(rows):
    """'마커키 -> 상태키' 인덱스를 만든다.

    rows 는 반드시 데이터셋 전체여야 한다. 부분집합을 넘기면 키가 달라진다.
    반환: (by_marker: dict, split_addresses: list)
    """
    by_marker = {}
    split_addresses = []

    # ── 1) 일반 카테고리 — 기존 사다리 ──────────────────────────
    #   ★네임스페이스 카테고리는 여기서 빠진다. 고압이 끼어든 주소 때문에
    #     실효·재방문 키가 갈려 옛 기록과 끊기는 일을 막는다.
    plain = [r for r in rows if r.get("category") not in NAMESPACED_CATEGORIES]

    for addr, slot in _collect_by_address(plain).items():
        if len(slot) <= 1:
            for mk in slot:
                by_marker[_lookup_key(mk, addr)] = addr
            continue
        split_addresses.append(addr)

        # 마커 순서는 마커키 정렬로 고정 — 데이터 순서가 바뀌어도 키가 흔들리지 않게.
        mks = sorted(slot)

        def level(mk, lv, slot=slot, addr=addr):
            s = slot[mk]
            k = "{}{}{}".format(addr, STATUS_KEY_SEP, _road_of(slot, mk))
            if lv >= 2:
                k += "{}{}".format(STATUS_KEY_SEP, s["category"])
            if lv >= 3:
                k += "{}{}".format(STATUS_KEY_SEP, _coord_text(s["lat"], s["lng"]))
            return k

        chosen = None
        for lv in (1, 2, 3):
            keys = [level(mk, lv) for mk in mks]
            if len(set(keys)) == len(mks):
                chosen = keys
                break
        if chosen is None:
            # 좌표까지 같아 이론상 갈릴 수 없는 경우 — 순번으로 강제 분리(데이터 이상 신호)
            print("[statusKey] 좌표까지 동일해 구분 불가, 순번 부여: {}".format(addr))
            chosen = ["{}{}#{}".format(level(mk, 3), STATUS_KEY_SEP, i + 1)
                      for i, mk in enumerate(mks)]
        for mk, key in zip(mks, chosen):
            by_marker[_lookup_key(mk, addr)] = key

    # ── 2) 네임스페이스 카테고리 — 자기 이름을 박은 자체 사다리 ────
    #   기본형 '주소|고압' 만으로 끝난다. 같은 주소에 그 카테고리 마커가
    #   둘 이상일 때만 도로명 -> 좌표 순으로 올린다.
    for cat in NAMESPACED_CATEGORIES:
        rows_cat = [r for r in rows if r.get("category") == cat]
        for addr, slot in _collect_by_address(rows_cat).items():
            mks = sorted(slot)
            if len(mks) > 1:
                split_addresses.append(addr)

            def ns_level(mk, lv, slot=slot, addr=addr, cat=cat):
                if lv == 0:
                    return "{}{}{}".format(addr, STATUS_KEY_SEP, cat)
                k = "{}{}{}{}{}".format(addr, STATUS_KEY_SEP, _road_of(slot, mk),
                                        STATUS_KEY_SEP, cat)
                if lv >= 2:
                    s = slot[mk]
                    k += "{}{}".format(STATUS_KEY_SEP, _coord_text(s["lat"], s["lng"]))
                return k

            chosen = None
            for lv in (0, 1, 2):
                keys = [ns_level(mk, lv) for mk in mks]
                if len(set(keys)) == len(mks):
                    chosen = keys
                    break
            if chosen is None:
                # 좌표까지 같아 이론상 갈릴 수 없는 경우 — 순번으로 강제 분리(데이터 이상 신호)
                print("[statusKey] 좌표까지 동일해 구분 불가, 순번 부여: {}".format(addr))
                chosen = ["{}{}#{}".format(ns_level(mk, 2), STATUS_KEY_SEP, i + 1)
                          for i, mk in enumerate(mks)]
            for mk, key in zip(mks, chosen):
                by_marker[_lookup_key(mk, addr)] = key

    return by_marker, sorted(split_addresses)


def status_key_of(item, by_marker):
    """개별 항목의 상태 키. 인덱스에 없으면 주소 그대로(하위호환)."""
    return by_marker.get(_lookup_key(marker_key_of(item), item.get("주소")), item.get("주소"))


def address_of_status_key(key):
    """상태 키에서 표시용 주소만 되돌린다(구분자 앞부분)."""
    return str(key).split(STATUS_KEY_SEP, 1)[0]


def build_address_to_keys(by_marker):
    """주소 -> 그 주소에서 파생된 상태 키 목록(정렬).

    갈리지 않은 주소는 [주소] 하나뿐이다. 파이프라인이 주소 단위로 레코드를 만들 때
    이걸로 펼쳐야 갈린 주소의 마커가 전부 기록을 갖는다.
    """
    out = {}
    for key in by_marker.values():
        out.setdefault(address_of_status_key(key), set()).add(key)
    return {a: sorted(v) for a, v in out.items()}


def keys_for_address(addr, addr_to_keys):
    """한 주소에서 파생된 상태 키 전부(모르는 주소면 [addr] — 하위호환)."""
    return addr_to_keys.get(addr, [addr])
