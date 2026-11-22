// hd-units.js — 넓게 보기 원(레벨 6 이상)의 묶음 단위 = 행정동 (영준님 2026-11-22 "지금으로 빌드해").
//
// 경계 = geo/hjd-seoul-ver20261001.json — 서울 행정동 427개(단순화 약 3m, 270KB · gzip 60KB, 공개 자료).
//   출처: 통계청 SGIS 행정동 경계(공공누리 제1유형), 가공 vuski/admdongkor ver20261001, CC BY 4.0 — geo/README.md.
//   ★고객 자료가 아니다(경계선뿐) — 그래서 enc/ 가 아니라 평문 공개 파일이다. 계기 -> 행정동 표는 만들지 않는다.
// 판정 = 마커 좌표가 든 행정동(점 포함 판정, 사각형 범위로 먼저 거름). 마커마다 한 번(m._hd), 같은 좌표는
//   세션 동안 다시 안 센다(_hdCache — 지사·구를 바꿔 마커를 새로 만들어도 그대로 쓴다).
//   ★IndexedDB 에 저장하지 않는 이유(2026-11-22 실측, 맥 4배 CPU 제한 = 폰 기준): 은평구 5,216 마커 전부 처음부터
//     판정 + 원 그리기 = 약 55ms, 지금 격자 = 약 45ms — 판정 자체가 10ms 안팎이다. 캐시를 읽는 비용이 그보다 크다.
// 경계 파일은 앱이 켜질 때(initMap) 리스트 파일과 나란히 한 번 받는다. 받는 동안은 원을 안 그리고(0.1초 안팎),
//   받기 실패하면 지금 격자로 그린다(빈 화면으로 남지 않음). 다음 그리기 때 다시 받아 본다.
const HD_GEO_VER = 'ver20261001';
const HD_GEO_URL = './geo/hjd-seoul-' + HD_GEO_VER + '.json?v=' + HD_GEO_VER;
const HD_ATTRIBUTION = '행정동 경계: 통계청 SGIS(공공누리 1유형), vuski/admdongkor ' + HD_GEO_VER + ' (CC BY 4.0)';
let _hdPolys = null;          // [{key, name, s, n, w, e, p}]
let _hdLoad = null;           // 받는 중인 약속
const _hdCache = new Map();   // 'lat,lng'(소수 6자리) -> {key, name}
const HD_OUTSIDE = { key: '(경계 밖)', name: '(경계 밖)' };

function hdReady() { return !!_hdPolys; }
/** 받는 중이면 true — 그동안 원을 그리지 않는다(격자로 한 번 그렸다 바뀌는 깜빡임 방지). 실패하면 false 가 되어 격자로 그린다. */
function hdLoading() { return !!_hdLoad; }

/** 경계 파일을 한 번 받는다. 다 받으면 onReady() (원 다시 그리기). 실패하면 격자 그대로 — 다음 그리기 때 다시 시도. */
function hdEnsure(onReady) {
    if (_hdPolys || _hdLoad) return;
    _hdLoad = fetch(HD_GEO_URL).then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }).then(d => {
        _hdPolys = (d.f || []).map(x => {
            let s = 90, n = -90, w = 180, e = -180;
            for (const poly of x.p) for (const pt of poly[0]) {
                if (pt[1] < s) s = pt[1]; if (pt[1] > n) n = pt[1];
                if (pt[0] < w) w = pt[0]; if (pt[0] > e) e = pt[0];
            }
            return { key: x.gu + ' ' + x.n, name: x.n, s, n, w, e, p: x.p };
        });
        if (typeof onReady === 'function') onReady();
    }).catch(err => {
        console.warn('[행정동] 경계 파일 실패 — 격자로 그림:', err);
    }).finally(() => { _hdLoad = null; });
}

function _hdInRing(lat, lng, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i][1], xi = ring[i][0], yj = ring[j][1], xj = ring[j][0];
        if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** 좌표 -> {key:'구 행정동', name:'행정동'}. 경계 밖이면 HD_OUTSIDE. 경계를 아직 못 받았으면 null. */
function hdOf(lat, lng) {
    if (!_hdPolys) return null;
    const ck = (+lat).toFixed(6) + ',' + (+lng).toFixed(6);
    const hit = _hdCache.get(ck);
    if (hit) return hit;
    let out = HD_OUTSIDE;
    for (const h of _hdPolys) {
        if (lat < h.s || lat > h.n || lng < h.w || lng > h.e) continue;
        let found = false;
        for (const poly of h.p) {
            if (!_hdInRing(lat, lng, poly[0])) continue;
            let inHole = false;
            for (let k = 1; k < poly.length; k++) if (_hdInRing(lat, lng, poly[k])) { inHole = true; break; }
            if (!inHole) { found = true; break; }
        }
        if (found) { out = { key: h.key, name: h.name }; break; }
    }
    _hdCache.set(ck, out);
    return out;
}

// ── 원 모양 = 부채꼴(A). 칠한 부분 = 남은 양(전체 - 완료 - 불가), 글자 '남음/전체'. 다 끝나면 빈 원, 안 했으면 꽉 찬 원.
//   색 = 초록 rgb(16,185,129) — 바탕 0.30 · 칠함 0.9 · 흰 테두리 1.5px. 크기 = 계기 수 로그(24~88px), 글자보다 작지 않게.
function hdBubbleSvg(left, n, textWidth) {
    const p = n ? left / n : 0, label = left + '/' + n;
    const d = Math.round(Math.max(textWidth(label) + 8, Math.min(88, 24 + 6 * Math.log2(n + 1)))), r = d / 2;
    const col = '16,185,129';
    let fg = '';
    if (p >= 0.999) fg = `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="rgba(${col},0.9)"/>`;
    else if (p > 0) {
        const a = p * 2 * Math.PI, x = r + (r - 1) * Math.sin(a), y = r - (r - 1) * Math.cos(a);
        fg = `<path d="M${r},${r} L${r},1 A${r - 1},${r - 1} 0 ${p > 0.5 ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)} Z" fill="rgba(${col},0.9)"/>`;
    }
    return {
        d,
        html: `<svg width="${d}" height="${d}" viewBox="0 0 ${d} ${d}" style="display:block">`
            + `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="rgba(${col},0.30)" stroke="rgba(255,255,255,.95)" stroke-width="1.5"/>${fg}`
            + `<text x="${r}" y="${r + 4}" text-anchor="middle" style="font-weight:700;font-size:11px;fill:#fff;paint-order:stroke;`
            + `stroke:rgba(0,0,0,.55);stroke-width:2.2px">${label}</text></svg>`,
    };
}

// ── 원 누르면 정보창: 이름 · 계기 · 완료 · 불가 · 남음 · 진행률 + [확대] [닫기] ──
function hdInfoHide() {
    const el = document.getElementById('hd-info');
    if (el) el.style.display = 'none';
}
function hdInfoShow(g, onZoom) {
    let el = document.getElementById('hd-info');
    if (!el) {
        el = document.createElement('div');
        el.id = 'hd-info';
        el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;background:#fff;'
            + 'border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.25);padding:10px 14px;font-size:14px;min-width:240px;white-space:nowrap;';
        document.body.appendChild(el);
    }
    const left = g.n - g.c - g.f;
    el.innerHTML = '';
    const add = (txt, css) => { const d = document.createElement('div'); d.textContent = txt; if (css) d.style.cssText = css; el.appendChild(d); return d; };
    add(g.name, 'font-weight:700;margin-bottom:4px');
    add(`계기 ${g.n} · 완료 ${g.c} · 불가 ${g.f} · 남음 ${left}`);
    add(`진행률 ${g.n ? Math.round((g.c + g.f) * 100 / g.n) : 0}%`, 'color:#666');
    const row = add('', 'margin-top:8px;display:flex;gap:6px;justify-content:flex-end');
    const btn = (t, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.style.cssText = 'padding:4px 10px'; b.onclick = fn; row.appendChild(b); };
    btn('확대', () => { hdInfoHide(); onZoom(); });
    btn('닫기', hdInfoHide);
    if (g.hd) add(HD_ATTRIBUTION, 'margin-top:6px;font-size:10px;color:#999;white-space:normal;max-width:260px');
    el.style.display = '';
}
