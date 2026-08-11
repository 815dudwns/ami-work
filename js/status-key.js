// status-key.js — workStatus 상태 키 생성 (공용 규칙)
//
// 배경: 마커 단위는 `category||lat||lng` 인데 상태(workStatus) 단위는 '주소' 단독이었다.
//   두 단위가 안 맞아, 한 주소가 마커 여러 개로 갈리면 마커들이 상태 레코드 하나를 공유했고
//   한쪽을 완료하면 다른 쪽도 완료로 보였다. 좌표가 갈렸다는 것은 실제로 다른 집일 확률이
//   높으므로(영준님 결정 2026-08-02) 합치지 않고 마커마다 키를 준다.
//
// 키 규칙 (확정):
//   1. 기본은 '주소' 그대로 — 하위호환. 갈리지 않는 주소는 키가 바뀌지 않는다.
//   2. 한 주소가 마커 2개 이상으로 갈릴 때만 구분자를 붙인다: '주소|도로명주소'
//   3. 도로명까지 같아 못 가르면 카테고리를 덧붙인다: '주소|도로명주소|category'
//   4. 그래도 못 가르면 좌표를 덧붙인다: '주소|도로명주소|category|lat,lng'
//
//   ★구분자는 도로명주소 기준이다. 좌표로 잡으면 재지오코딩 때 키가 바뀌어 작업기록이
//     유실된다. 3단계의 category도 재지오코딩에 영향받지 않는다. 좌표는 최후 수단이다.
//
//   ※ 이 규칙은 scripts/status_key.py 와 반드시 같아야 한다. 한쪽만 고치면 배치가 돌 때
//     옛 키가 되살아난다. 동일성은 scripts/test_status_key_parity.py 가 검사한다.

const STATUS_KEY_SEP = '|';

// 마커 식별자 — map.js loadMarkers()의 그룹핑 키와 같은 형식이어야 한다.
function markerKeyOf(item) {
    return `${item.category}||${item.lat}||${item.lng}`;
}

// 인덱스 조회용 내부 키. ★마커키만으로는 부족하다 — 합친 마커(같은 좌표·같은 카테고리에
//   지번 여럿)는 한 마커키에 주소가 여러 개라, 마커키만 쓰면 마지막 주소로 덮어써진다.
function _lookupKey(markerKey, addr) {
    return `${markerKey}\u0000${addr}`;
}

function _coordText(lat, lng) {
    return `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
}

// 데이터 전체를 훑어 '마커키 -> 상태키' 인덱스를 만든다.
//   ★rows는 반드시 데이터셋 전체여야 한다. 지사·구·카테고리로 필터링한 부분집합을 넘기면
//     화면 필터에 따라 키가 달라져 같은 마커가 다른 기록을 읽게 된다.
function buildStatusKeyIndex(rows) {
    // 주소 -> 마커키 -> 그 마커의 대표 속성
    const byAddr = new Map();
    (rows || []).forEach(item => {
        const addr = item && item.주소;
        if (!addr || item.lat == null || item.lng == null) return;
        if (!byAddr.has(addr)) byAddr.set(addr, new Map());
        const mk = markerKeyOf(item);
        const slot = byAddr.get(addr);
        if (!slot.has(mk)) {
            slot.set(mk, { roads: new Set(), category: item.category, lat: item.lat, lng: item.lng });
        }
        if (item.도로명주소) slot.get(mk).roads.add(item.도로명주소);
    });

    const byMarker = new Map();   // 마커키 -> 상태키
    const splitAddresses = [];    // 갈린 주소 목록(보고·마이그레이션용)

    byAddr.forEach((slot, addr) => {
        if (slot.size <= 1) {
            // 갈리지 않음 — 주소 그대로
            slot.forEach((_, mk) => byMarker.set(_lookupKey(mk, addr), addr));
            return;
        }
        splitAddresses.push(addr);

        // 마커 순서는 마커키 정렬로 고정 — 데이터 순서가 바뀌어도 키가 흔들리지 않게.
        const mks = [...slot.keys()].sort();
        // 대표 도로명: 한 마커에 도로명이 여럿이면 정렬 첫번째로 결정론적 선택
        const roadOf = mk => {
            const rs = [...slot.get(mk).roads].sort();
            return rs.length ? rs[0] : '';
        };

        const level = (mk, lv) => {
            const s = slot.get(mk);
            let k = `${addr}${STATUS_KEY_SEP}${roadOf(mk)}`;
            if (lv >= 2) k += `${STATUS_KEY_SEP}${s.category}`;
            if (lv >= 3) k += `${STATUS_KEY_SEP}${_coordText(s.lat, s.lng)}`;
            return k;
        };

        // 2 -> 3 -> 4단계로 올리며 전부 유일해지는 최소 단계를 고른다.
        let chosen = null;
        for (let lv = 1; lv <= 3; lv++) {
            const keys = mks.map(mk => level(mk, lv));
            if (new Set(keys).size === mks.length) { chosen = keys; break; }
        }
        if (!chosen) {
            // 좌표까지 같아 이론상 갈릴 수 없는 경우 — 순번으로 강제 분리(데이터 이상 신호)
            console.warn('[statusKey] 좌표까지 동일해 구분 불가, 순번 부여:', addr);
            chosen = mks.map((mk, i) => `${level(mk, 3)}${STATUS_KEY_SEP}#${i + 1}`);
        }
        mks.forEach((mk, i) => byMarker.set(_lookupKey(mk, addr), chosen[i]));
    });

    return { byMarker, splitAddresses: splitAddresses.sort() };
}

// 개별 항목의 상태 키. 인덱스에 없으면 주소 그대로(하위호환).
function statusKeyOf(item, index) {
    if (!index) return item.주소;
    return index.byMarker.get(_lookupKey(markerKeyOf(item), item.주소)) || item.주소;
}

// 상태 키에서 표시용 주소만 되돌린다(구분자 앞부분).
function addressOfStatusKey(key) {
    const i = String(key).indexOf(STATUS_KEY_SEP);
    return i === -1 ? key : String(key).slice(0, i);
}
