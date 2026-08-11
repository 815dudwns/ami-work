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

  이 파일과 js/status-key.js 는 반드시 같은 키를 내야 한다.
  동일성 검사: scripts/test_status_key_parity.py
"""

import json
import os

STATUS_KEY_SEP = "|"

# 마커로 뜨는 데이터셋 — js/map.js 의 DATASETS 와 같아야 한다.
DATASETS = [
    ("site-data.json", "실효"),
    ("skt-data.json", "skt"),
    ("tou-data.json", "tou"),
    ("rework-data.json", "재방문"),
]


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


def build_status_key_index(rows):
    """'마커키 -> 상태키' 인덱스를 만든다.

    rows 는 반드시 데이터셋 전체여야 한다. 부분집합을 넘기면 키가 달라진다.
    반환: (by_marker: dict, split_addresses: list)
    """
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

    by_marker = {}
    split_addresses = []

    for addr, slot in by_addr.items():
        if len(slot) <= 1:
            for mk in slot:
                by_marker[_lookup_key(mk, addr)] = addr
            continue
        split_addresses.append(addr)

        # 마커 순서는 마커키 정렬로 고정 — 데이터 순서가 바뀌어도 키가 흔들리지 않게.
        mks = sorted(slot)

        def road_of(mk):
            rs = sorted(slot[mk]["roads"])
            return rs[0] if rs else ""

        def level(mk, lv):
            s = slot[mk]
            k = "{}{}{}".format(addr, STATUS_KEY_SEP, road_of(mk))
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
