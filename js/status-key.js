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
// 네임스페이스 규칙 (2026-08-18 추가 — 영준님 "고압은 리스트 따로 봐야 함. 아예 다른 성격임"):
//   NAMESPACED_CATEGORIES 에 든 카테고리는 위 사다리를 타지 않고 자기 이름을 키에 박는다.
//     0. '주소|고압'                      <- 기본형
//     1. '주소|도로명주소|고압'             <- 같은 주소에 고압 마커가 둘 이상일 때만
//     2. '주소|도로명주소|고압|lat,lng'     <- 그래도 못 가를 때
//
//   ★왜 필요한가: workStatus 는 정리되지 않는다. 실효에서 완료된 주소는 site-data 에서
//     빠지지만(완료제거) workStatus 레코드는 '주소' 키로 영원히 남는다. 나중에 같은 주소가
//     새 리스트로 들어오면 마커가 하나뿐이라 갈림 판정이 안 걸리고, 키가 맨주소 그대로라서
//     몇 달 전 남의 완료 기록을 그대로 읽는다(2026-08-18 실증: 마포구 용강동 39-1 —
//     6/26 실효 완료분을 8/13 투입된 고압이 완료로 물려받음).
//
//   ★네임스페이스 카테고리는 일반 카테고리의 '갈림 판정'에서도 빠진다. 그래야 고압이 끼어든
//     주소 때문에 실효·재방문 키가 흔들리지 않는다(실측: 비고압 마커 4,136개 키 변경 0건).
//
//   ★형식이 '주소|고압'인 이유: 주소가 첫 칸이어야 addressOfStatusKey() 가 그대로 돈다.
//     '고압|주소' 로 하면 주소 자리에 '고압'이 나와 디테일 모달의 키 선택이 깨진다.
//     또 도로명을 기본형에 넣지 않아 재지오코딩에 영향받지 않는다.
//
//   ※ 이 규칙은 scripts/status_key.py 와 반드시 같아야 한다. 한쪽만 고치면 배치가 돌 때
//     옛 키가 되살아난다. 동일성은 scripts/test_status_key_parity.py 가 검사한다.

const STATUS_KEY_SEP = '|';

// 자기 이름을 상태키에 박는 카테고리 — 다른 리스트와 상태를 절대 공유하지 않는다.
//   성격이 다른 리스트가 또 들어오면 여기에 한 줄 추가하면 된다.
//   ★scripts/status_key.py 의 NAMESPACED_CATEGORIES 와 같아야 한다.
//   ★합동(2026-08-19 추가): 노원·성북·종로가 실효 리스트와 주소가 대량으로 겹친다.
//     처음부터 '주소|합동' 으로 넣는다 — 나중에 고치면 이미 쌓인 작업분이 고아가 된다.
const NAMESPACED_CATEGORIES = ['고압', '합동'];

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
// 주소 -> 마커키 -> 그 마커의 대표 속성
function _collectByAddress(rows) {
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
    return byAddr;
}

// 대표 도로명: 한 마커에 도로명이 여럿이면 정렬 첫번째로 결정론적 선택
function _roadOf(slot, mk) {
    const rs = [...slot.get(mk).roads].sort();
    return rs.length ? rs[0] : '';
}

function buildStatusKeyIndex(rows) {
    const byMarker = new Map();   // 마커키 -> 상태키
    const splitAddresses = [];    // 갈린 주소 목록(보고·마이그레이션용)

    // ── 1) 일반 카테고리 — 기존 사다리 ──────────────────────────
    //   ★네임스페이스 카테고리는 여기서 빠진다. 고압이 끼어든 주소 때문에
    //     실효·재방문 키가 갈려 옛 기록과 끊기는 일을 막는다.
    const plain = (rows || []).filter(r => r && !NAMESPACED_CATEGORIES.includes(r.category));

    _collectByAddress(plain).forEach((slot, addr) => {
        if (slot.size <= 1) {
            // 갈리지 않음 — 주소 그대로
            slot.forEach((_, mk) => byMarker.set(_lookupKey(mk, addr), addr));
            return;
        }
        splitAddresses.push(addr);

        // 마커 순서는 마커키 정렬로 고정 — 데이터 순서가 바뀌어도 키가 흔들리지 않게.
        const mks = [...slot.keys()].sort();

        const level = (mk, lv) => {
            const s = slot.get(mk);
            let k = `${addr}${STATUS_KEY_SEP}${_roadOf(slot, mk)}`;
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

    // ── 2) 네임스페이스 카테고리 — 자기 이름을 박은 자체 사다리 ────
    //   기본형 '주소|고압' 만으로 끝난다. 같은 주소에 그 카테고리 마커가
    //   둘 이상일 때만 도로명 -> 좌표 순으로 올린다.
    NAMESPACED_CATEGORIES.forEach(cat => {
        const rowsCat = (rows || []).filter(r => r && r.category === cat);
        _collectByAddress(rowsCat).forEach((slot, addr) => {
            const mks = [...slot.keys()].sort();
            if (mks.length > 1) splitAddresses.push(addr);

            const nsLevel = (mk, lv) => {
                if (lv === 0) return `${addr}${STATUS_KEY_SEP}${cat}`;
                let k = `${addr}${STATUS_KEY_SEP}${_roadOf(slot, mk)}${STATUS_KEY_SEP}${cat}`;
                if (lv >= 2) {
                    const s = slot.get(mk);
                    k += `${STATUS_KEY_SEP}${_coordText(s.lat, s.lng)}`;
                }
                return k;
            };

            let chosen = null;
            for (let lv = 0; lv <= 2; lv++) {
                const keys = mks.map(mk => nsLevel(mk, lv));
                if (new Set(keys).size === mks.length) { chosen = keys; break; }
            }
            if (!chosen) {
                // 좌표까지 같아 이론상 갈릴 수 없는 경우 — 순번으로 강제 분리(데이터 이상 신호)
                console.warn('[statusKey] 좌표까지 동일해 구분 불가, 순번 부여:', addr);
                chosen = mks.map((mk, i) => `${nsLevel(mk, 2)}${STATUS_KEY_SEP}#${i + 1}`);
            }
            mks.forEach((mk, i) => byMarker.set(_lookupKey(mk, addr), chosen[i]));
        });
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
