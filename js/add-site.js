// add-site.js — 지도에서 주소 추가 (2026-10-31 영준님)
//
// 흐름: 지도 왼쪽 아래 + -> 추가 모드(배너) -> 지도 누르기 -> 카카오 좌표->주소 -> 창(리스트 고르기·계기번호) -> 저장
//
// 저장(A안, PM 승인): workStatus/<상태키> 에 site 하위 + added_meters(첫 계기)를 update 한 번으로 쓴다.
//   rules 변경 없음. 델타(syncAt)로 다른 폰에 그대로 간다. 삭제 = site.deleted 표시만.
//   site = { list, jibunAddr, roadAddr, buildingName, lat, lng, jisa, gu, createdBy, createdByName, createdAt, deleted? }
//
// 규칙(영준님 2026-10-31):
//   - 지금 켜진 지사 구역 밖은 막는다("지금 켜진 지사 구역 밖입니다"). 서울 밖·미분류도 같은 이유로 막힌다.
//   - 어떤 리스트에 넣을지 고른다 — 이 계정에 보이고 지금 켜진 리스트 + '추가'(기본).
//     상태키는 그 리스트의 규칙을 따른다(js/status-key.js): 네임스페이스 리스트 = '지번주소|리스트',
//     실효(네임스페이스 아님) = 맨 지번주소(갈리지 않은 주소의 기본형).
//   - '이미 있는 주소' 판정이 먼저다. 맞는 개소가 있으면 리스트를 고르지 않고 그 개소에 계기를 붙인다.
//   - 계기번호는 ^[0-9A-Z]{2}[0-9]{9}$. 다른 곳에 이미 있는 계기면 알려 주되 막지 않는다(한 번 더 누르면 저장).
//   - 주소 없는 곳은 받지 않는다. 오프라인이면 모드에 들어가지 않는다. kmtest(보기 전용)는 버튼이 없다.
//
// ★지도 행 만들기: workStatus 를 훑어 site 가 있고 deleted 가 아닌 레코드마다 '자리 행'(_addedSite) 하나를
//   sampleData 에 넣는다. 자리 행은 계기가 아니다 — 계기 수·목록은 added_meters 로 센다(map.js·detail.js).
//   자리 행의 상태키는 저장된 키 그대로다(_statusKey) — 키 사다리(buildStatusKeyIndex)에 넣지 않는다.

let _addSiteMode = false;
let _addSiteBusy = false;
let _addSiteGeocoder = null;
let _addSiteTemp = null;       // 임시 마커(CustomOverlay)
let _addSitePick = null;       // 찍은 곳 { lat, lng, jibun, road, building, gu, jisa, dong }
let _addSiteMatches = [];      // 이미 있는 개소 후보
let _addSiteDupOk = '';        // 중복 안내를 본 계기번호 — 같은 번호로 한 번 더 누르면 저장
let _addedSiteSig = '';
let _addedSiteTimer = null;
let _meterListIndex = null;    // data/meter-list-index.json (중복 안내용, 처음 한 번만 받는다)

// ── 지도 행 ─────────────────────────────────────────────────────
function _addedSiteSigOf(rows) {
    return rows.map(r => `${r._statusKey}|${r.category}|${r.lat},${r.lng}`).sort().join('\n');
}

function addedSiteRowsFromStatus() {
    const rows = [];
    const visible = new Set((typeof DATASETS !== 'undefined' ? DATASETS : []).map(d => d.category));
    const ws = (typeof workStatus !== 'undefined' && workStatus) || {};
    for (const key in ws) {
        const r = ws[key];
        const s = r && r.site;
        if (!s || typeof s !== 'object' || s.deleted) continue;
        const cat = s.list || '추가';
        if (!visible.has(cat)) continue;          // 이 계정에 안 보이는 리스트(kmtest 등)
        const lat = Number(s.lat), lng = Number(s.lng);
        if (!isFinite(lat) || !isFinite(lng)) continue;
        const jibun = String(s.jibunAddr || addressOfStatusKey(key));
        rows.push({
            주소: jibun, 지번주소: jibun, 도로명주소: String(s.roadAddr || ''),
            지사: String(s.jisa || ''), lat, lng, 좌표정확도: 'exact', category: cat,
            _addedSite: true, _statusKey: key, _site: s,
        });
    }
    _addedSiteSig = _addedSiteSigOf(rows);
    return rows;
}

// workStatus 가 바뀐 뒤 '추가' 행을 다시 맞춘다. 바뀐 게 없으면 아무것도 안 한다.
function syncAddedSiteRows() {
    if (typeof sampleData === 'undefined') return false;
    const before = _addedSiteSig;
    const rows = addedSiteRowsFromStatus();
    // 개소 정보(이름·삭제 여부)만 바뀐 경우에도 자리 행의 _site 는 새것으로 갈아 끼운다
    sampleData = sampleData.filter(r => !r._addedSite).concat(rows);
    if (_addedSiteSig === before) return false;
    if (typeof map !== 'undefined' && map && typeof rebuildMarkers === 'function') rebuildMarkers();
    return true;
}

// 델타 수신 때마다 부르면 비싸다 — 묶어서 한 번(firebase.js mergeOneAddress 가 부른다)
function scheduleAddedSiteSync() {
    if (_addedSiteTimer) return;
    _addedSiteTimer = setTimeout(() => { _addedSiteTimer = null; syncAddedSiteRows(); }, 400);
}

// ── 주소 비교 ───────────────────────────────────────────────────
//   카카오 지번은 '서울 노원구 공릉동 653-10', 데이터는 '서울특별시 노원구 화랑로 473(공릉동 653-10)' 처럼 온다.
//   비교 키 = 시 이름·'번지'·공백을 뗀 '구+동+번지' 또는 '구+도로명+번호'. 괄호 안 지번도 후보로 넣는다.
function _addrKeys(s) {
    const out = new Set();
    let t = String(s || '').replace(/서울특별시|서울시|^\s*서울\s/g, ' ').replace(/번지/g, '');
    const gu = (t.match(/(\S+구)(\s|$)/) || [])[1] || '';
    const paren = t.match(/\(([^)]*)\)/);
    const main = t.replace(/\([^)]*\)/g, ' ').split(',')[0];
    const k1 = main.replace(/\s+/g, '');
    if (k1) out.add(k1);
    if (paren) {
        let p = paren[1].split(',')[0].trim();
        if (p && /\d/.test(p)) {
            if (gu && p.indexOf(gu) === -1) p = gu + p;
            out.add(p.replace(/\s+/g, ''));
        }
    }
    return out;
}

function _rowKeys(r) {
    const ks = new Set();
    [r.주소, r.지번주소, r.도로명주소].forEach(v => _addrKeys(v).forEach(k => ks.add(k)));
    return ks;
}

// 찍은 주소와 같은 개소 — 상태키 단위로 묶는다(같은 주소가 리스트 둘에 있으면 둘)
function findAddressMatches(jibun, road) {
    const want = new Set([..._addrKeys(jibun), ..._addrKeys(road)]);
    const byKey = new Map();
    (sampleData || []).forEach(r => {
        if (!r || r.lat == null || r.lng == null) return;
        const ks = _rowKeys(r);
        let hit = false;
        for (const k of ks) { if (want.has(k)) { hit = true; break; } }
        if (!hit) return;
        const sk = statusKeyOf(r, statusKeyIndex);
        if (!sk) return;
        if (!byKey.has(sk)) byKey.set(sk, { statusKey: sk, category: r.category, address: r.주소, rows: [] });
        byKey.get(sk).rows.push(r);
    });
    return [...byKey.values()];
}

function _listLabel(cat) {
    const d = (typeof DATASET_REGISTRY !== 'undefined') && DATASET_REGISTRY.find(x => x.category === cat);
    return (d && (d.uiLabel || d.category)) || cat;
}

// 상태키로 상세 열기 — 지도에 그 마커가 있으면 그것으로, 없으면(필터에 가림) 행으로 직접
function openDetailForStatusKey(key) {
    const m = (markers || []).find(x => (x.statusKeys || []).includes(key));
    if (m) { showDetail(m.address, m.meters, m.addresses, m.statusKeys); return true; }
    const rows = (sampleData || []).filter(r => statusKeyOf(r, statusKeyIndex) === key);
    if (!rows.length) return false;
    const addrs = [...new Set(rows.map(r => r.주소).filter(Boolean))];
    showDetail(rows[0].주소, rows, addrs, [key]);
    return true;
}

// ── 화면 ────────────────────────────────────────────────────────
function _currentJisa() {
    const el = document.getElementById('jisa-select');
    return (el && el.value) || '';
}

function showAddSiteToast(msg, ms) {
    const el = document.getElementById('add-site-toast');
    if (!el) { alert(msg); return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), ms || 2600);
}

function _setBanner(text) {
    const t = document.getElementById('add-site-banner-text');
    if (t) t.textContent = text;
}

function enterAddSiteMode() {
    if (window.AMI_VIEW_ONLY) return;
    if (_addSiteMode) { exitAddSiteMode(); return; }
    if (!navigator.onLine || typeof statusRef === 'undefined' || !statusRef) {
        showAddSiteToast('인터넷 연결이 없어 주소를 추가할 수 없습니다');
        return;
    }
    if (!(kakao.maps.services && kakao.maps.services.Geocoder)) {
        showAddSiteToast('주소 변환을 불러오지 못했습니다. 새로고침 후 다시 해 주세요');
        return;
    }
    const jisa = _currentJisa();
    if (!jisa || !JISA_TO_GU[jisa]) {
        showAddSiteToast('메뉴에서 지사를 먼저 고르세요');
        return;
    }
    if (!_addSiteGeocoder) _addSiteGeocoder = new kakao.maps.services.Geocoder();
    _addSiteMode = true;
    document.body.classList.add('add-site-mode');
    _setBanner('주소를 추가할 위치를 지도에서 누르세요');
    document.getElementById('add-site-banner').classList.add('show');
    document.getElementById('add-site-btn').classList.add('active');
    if (typeof closeDetail === 'function') {
        const ov = document.getElementById('fullpage-overlay');
        if (ov && ov.classList.contains('active')) closeDetail();
    }
}

function exitAddSiteMode() {
    _addSiteMode = false;
    _addSiteBusy = false;
    _addSitePick = null;
    _addSiteMatches = [];
    document.body.classList.remove('add-site-mode');
    const b = document.getElementById('add-site-banner'); if (b) b.classList.remove('show');
    const btn = document.getElementById('add-site-btn'); if (btn) btn.classList.remove('active');
    const ov = document.getElementById('add-site-overlay'); if (ov) ov.style.display = 'none';
    _clearTemp();
}

function _clearTemp() {
    if (_addSiteTemp) { _addSiteTemp.setMap(null); _addSiteTemp = null; }
}

function _showTemp(lat, lng) {
    _clearTemp();
    const el = document.createElement('div');
    el.className = 'add-site-temp';
    el.innerHTML = '<svg viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg"><path d="M10 0C4.48 0 0 4.48 0 10c0 6.72 10 16 10 16s10-9.28 10-16C20 4.48 15.52 0 10 0z"/><circle cx="10" cy="10" r="4" fill="white"/></svg>';
    _addSiteTemp = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(lat, lng), content: el, yAnchor: 1, zIndex: 999,
    });
    _addSiteTemp.setMap(map);
}

function _strip서울(s) {
    return String(s || '').replace(/^\s*서울(특별시)?\s*/, '').trim();
}

function onMapClickForAddSite(mouseEvent) {
    if (!_addSiteMode || _addSiteBusy) return;
    const ov = document.getElementById('add-site-overlay');
    if (ov && ov.style.display === 'flex') return;     // 창이 떠 있는 동안은 무시
    const ll = mouseEvent.latLng;
    const lat = ll.getLat(), lng = ll.getLng();
    _addSiteBusy = true;
    _setBanner('주소 확인 중…');
    _addSiteGeocoder.coord2Address(lng, lat, (result, status) => {
        _addSiteBusy = false;
        _setBanner('주소를 추가할 위치를 지도에서 누르세요');
        if (!_addSiteMode) return;
        handleGeocodeResult(lat, lng, result, status);
    });
}

async function handleGeocodeResult(lat, lng, result, status) {
    const OK = kakao.maps.services.Status.OK;
    const r0 = (status === OK && result && result[0]) || null;
    if (!r0 || !r0.address || !r0.address.address_name) {
        showAddSiteToast('이 위치엔 주소가 없습니다. 건물 위를 다시 누르세요');
        return;
    }
    const a = r0.address;
    const gu = a.region_2depth_name || '';
    const isSeoul = /^서울/.test(a.region_1depth_name || '');
    const jisa = isSeoul ? (GU_TO_JISA[gu] || '') : '';
    // ★켜진 지사 구역 밖은 막는다(영준님 2026-10-31). 서울 밖·지사표에 없는 구도 여기서 걸린다.
    if (!jisa || jisa !== _currentJisa()) {
        showAddSiteToast('지금 켜진 지사 구역 밖입니다');
        return;
    }
    const jibun = '서울특별시 ' + _strip서울(a.address_name);
    const road = r0.road_address && r0.road_address.address_name
        ? '서울특별시 ' + _strip서울(r0.road_address.address_name) : '';
    const building = (r0.road_address && r0.road_address.building_name) || '';
    _addSitePick = { lat, lng, jibun, road, building, gu, jisa, dong: a.region_3depth_name || '' };
    _showTemp(lat, lng);
    // 큰 리스트(25미청구·불가)를 받는 중이면 끝날 때까지 기다린다 — 안 기다리면 '이미 있는 주소'를 놓친다
    if (typeof _deferredLoading !== 'undefined' && _deferredLoading) {
        _setBanner('리스트 불러오는 중…');
        try { await _deferredLoading; } catch (e) {}
        _setBanner('주소를 추가할 위치를 지도에서 누르세요');
        if (!_addSiteMode || !_addSitePick) return;
    }
    _addSiteMatches = findAddressMatches(jibun, road);
    openAddSiteModal();
}

// 고를 수 있는 리스트 = 이 계정에 보이고 지금 켜진 리스트 + '추가'(항상, 맨 앞·기본)
function addSiteListOptions() {
    const sel = getSelectedCategories();
    const opts = DATASETS.filter(d => d.category !== '추가' && sel.has(d.category))
        .map(d => ({ category: d.category, label: d.uiLabel || d.category }));
    return [{ category: '추가', label: '추가' }].concat(opts);
}

function openAddSiteModal() {
    const p = _addSitePick;
    if (!p) return;
    const esc = s => escHtml(s);
    document.getElementById('add-site-addr').innerHTML =
        `<div><span class="addr-tag">지번</span>${esc(p.jibun)}</div>`
        + (p.road ? `<div><span class="addr-tag">도로명</span>${esc(p.road)}${p.building ? ' (' + esc(p.building) + ')' : ''}</div>` : '')
        + `<div class="add-site-sub">${esc(p.jisa)} · ${esc(p.gu)}</div>`;

    const listBox = document.getElementById('add-site-lists');
    const matchBox = document.getElementById('add-site-matches');
    if (_addSiteMatches.length) {
        // 이미 있는 주소 — 리스트를 고르지 않고 그 개소에 붙인다
        listBox.style.display = 'none';
        matchBox.style.display = '';
        const many = _addSiteMatches.length > 1;
        matchBox.innerHTML = `<div class="add-site-label">이미 지도에 있는 주소입니다. 계기를 그 개소에 붙입니다.</div>`
            + _addSiteMatches.map((m, i) => {
                const n = m.rows.filter(r => !r._addedSite).length
                    + Object.keys(((workStatus[m.statusKey] || {}).added_meters) || {}).length;
                return `<label class="add-site-opt"><input type="radio" name="add-site-match" value="${i}"${i === 0 ? ' checked' : ''}${many ? '' : ' style="display:none"'}>`
                    + `<span class="add-site-opt-main">${esc(_listLabel(m.category))}</span>`
                    + `<span class="add-site-opt-sub">${esc(m.address)} · 계기 ${n}</span></label>`;
            }).join('')
            + `<button type="button" class="add-site-link" onclick="openMatchedSiteDetail()">그 개소 열기</button>`;
    } else {
        matchBox.style.display = 'none';
        matchBox.innerHTML = '';
        listBox.style.display = '';
        listBox.innerHTML = `<div class="add-site-label">어느 리스트에 넣을까요</div><div class="add-site-chips">`
            + addSiteListOptions().map((o, i) =>
                `<label class="add-site-chip"><input type="radio" name="add-site-list" value="${esc(o.category)}"${i === 0 ? ' checked' : ''}><span>${esc(o.label)}</span></label>`
            ).join('') + `</div>`;
    }
    const inp = document.getElementById('add-site-meter');
    inp.value = '';
    _addSiteDupOk = '';
    document.getElementById('add-site-warn').style.display = 'none';
    document.getElementById('add-site-err').style.display = 'none';
    document.querySelectorAll('.add-site-alpha-btn').forEach(btn => {
        btn.onclick = () => {
            const ch = btn.dataset.ch;
            if (ch === 'BS') inp.value = inp.value.slice(0, -1);
            else if (inp.value.length < 11) inp.value += ch;
            inp.focus();
        };
    });
    document.getElementById('add-site-overlay').style.display = 'flex';
    // 창이 떠 있는 동안 배너는 숨긴다. 찍은 곳이 창(아래쪽)에 가리지 않게 지도를 위로 올린다.
    document.getElementById('add-site-banner').classList.remove('show');
    try {
        const pt = map.getProjection().containerPointFromCoords(new kakao.maps.LatLng(p.lat, p.lng));
        const box = document.getElementById('map').getBoundingClientRect();
        map.panBy(pt.x - box.width / 2, pt.y - box.height * 0.22);
    } catch (e) { /* 못 옮겨도 저장에는 지장 없다 */ }
}

function closeAddSiteModal() {
    exitAddSiteMode();
}

// '위치 다시 고르기' — 창만 닫고 모드는 그대로
function repickAddSite() {
    document.getElementById('add-site-overlay').style.display = 'none';
    document.getElementById('add-site-banner').classList.add('show');
    _clearTemp();
    _addSitePick = null;
    _setBanner('주소를 추가할 위치를 지도에서 누르세요');
}

function _selectedMatch() {
    const r = document.querySelector('input[name="add-site-match"]:checked');
    return _addSiteMatches[r ? Number(r.value) : 0] || null;
}

function openMatchedSiteDetail() {
    const m = _selectedMatch();
    if (!m) return;
    exitAddSiteMode();
    openDetailForStatusKey(m.statusKey);
}

function _addSiteErr(msg) {
    const el = document.getElementById('add-site-err');
    el.textContent = msg;
    el.style.display = 'block';
}

function openAddSiteQr() {
    if (typeof QrScanner === 'undefined') return _addSiteErr('QR 스캐너 로드 실패');
    QrScanner.show((text) => {
        const raw = String(text || '');
        const mid = raw.match(/MID\s*[:：]?\s*([A-Za-z0-9]+)/i);
        let id = mid ? String(mid[1]).toUpperCase() : raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (id.length > 11) id = id.slice(0, 11);
        document.getElementById('add-site-meter').value = id;
    });
}

// 다른 곳에 이미 있는 계기 — 지도에 올라온 리스트 · 추가 계기 · 리스트 계기 색인 순으로 본다
async function findMeterElsewhere(id) {
    const hit = (sampleData || []).find(r => r && r.계기번호 === id);
    if (hit) return { text: `${_listLabel(hit.category)} · ${hit.주소}`, key: statusKeyOf(hit, statusKeyIndex) };
    for (const k in workStatus) {
        const am = workStatus[k] && workStatus[k].added_meters;
        if (am && am[id]) return { text: `추가 계기 · ${addressOfStatusKey(k)}`, key: k };
    }
    try {
        if (!_meterListIndex) {
            const r = await fetch('./data/meter-list-index.json', { cache: 'no-cache' });
            _meterListIndex = r.ok ? await r.json() : {};
        }
        const code = _meterListIndex[id];
        if (code) {
            const d = DATASET_REGISTRY.find(x => x.code === code);
            return { text: `${(d && (d.uiLabel || d.statsLabel || d.category)) || code} 리스트`, key: '' };
        }
    } catch (e) { /* 색인을 못 받으면 안내만 못 한다 — 저장은 막지 않는다 */ }
    return null;
}

function _hasHistory(rec) {
    if (!rec) return false;
    return (rec.state && rec.state !== 'pending')
        || Object.keys(rec.added_meters || {}).length > 0
        || Object.keys(rec.failedMeters || {}).length > 0
        || (rec.checkedMeters || []).length > 0;
}

async function saveAddSite() {
    const p = _addSitePick;
    if (!p) return;
    const inp = document.getElementById('add-site-meter');
    const id = String(inp.value || '').trim().toUpperCase();
    document.getElementById('add-site-err').style.display = 'none';
    if (!METER_NO_RE.test(id)) return _addSiteErr('계기번호 확인 — 11자리, 앞 2자리만 영문');

    const match = _addSiteMatches.length ? _selectedMatch() : null;
    if (match) {
        const rec = workStatus[match.statusKey] || {};
        if (match.rows.some(r => r.계기번호 === id) || (rec.added_meters && rec.added_meters[id])) {
            return _addSiteErr('이미 그 개소에 있는 계기번호입니다');
        }
    }

    // 다른 곳에 있는 계기 — 안내만 하고 막지 않는다(같은 번호로 저장을 한 번 더 누르면 저장)
    if (_addSiteDupOk !== id) {
        const dup = await findMeterElsewhere(id);
        if (dup) {
            _addSiteDupOk = id;
            const w = document.getElementById('add-site-warn');
            w.innerHTML = `이 계기는 이미 있습니다: ${escHtml(dup.text)}<br>그래도 넣으려면 저장을 한 번 더 누르세요.`
                + (dup.key ? ` <button type="button" class="add-site-link" data-key="${escHtml(dup.key)}">그 개소 열기</button>` : '');
            const b = w.querySelector('button');
            if (b) b.onclick = () => { const k = b.dataset.key; exitAddSiteMode(); openDetailForStatusKey(k); };
            w.style.display = 'block';
            return;
        }
    }

    const saveBtn = document.getElementById('add-site-save');
    saveBtn.disabled = true;
    try {
        if (match) {
            await saveAddedMeter(match.statusKey, id, { source: 'add_site' });
            exitAddSiteMode();
            if (typeof updateMarkerColor === 'function') updateMarkerColor(match.statusKey);
            openDetailForStatusKey(match.statusKey);
            showAddSiteToast('계기를 붙였습니다');
            return;
        }
        const r = document.querySelector('input[name="add-site-list"]:checked');
        const cat = (r && r.value) || '추가';
        // 상태키 = 그 리스트의 규칙(js/status-key.js) — 네임스페이스면 '주소|리스트', 아니면(실효) 맨 주소
        const key = NAMESPACED_CATEGORIES.includes(cat) ? `${p.jibun}${STATUS_KEY_SEP}${cat}` : p.jibun;
        const rec = workStatus[key];
        if (rec && rec.site && !rec.site.deleted) {
            // 같은 키의 추가 개소가 이미 있다(그 리스트가 꺼져 있어 판정에 안 걸린 경우) — 그 개소에 붙인다
            await saveAddedMeter(key, id, { source: 'add_site' });
        } else {
            // ★옛 작업 기록이 있는 키는 막는다 — 완료돼 리스트에서 빠진 주소면 그 완료를 물려받는다.
            if (rec && !rec.site && _hasHistory(rec)) {
                saveBtn.disabled = false;
                return _addSiteErr(`이 주소는 ${_listLabel(cat)}에 예전 작업 기록이 있어 그 리스트로는 넣을 수 없습니다. '추가'로 넣으세요.`);
            }
            const s = (typeof authGetSession === 'function') ? (authGetSession() || {}) : {};
            const site = {
                list: cat, jibunAddr: p.jibun, roadAddr: p.road, buildingName: p.building,
                lat: +p.lat.toFixed(7), lng: +p.lng.toFixed(7), jisa: p.jisa, gu: p.gu,
                createdBy: s.id || '', createdByName: s.name || '', createdAt: Date.now(),
            };
            await saveAddedSite(key, site, id);
        }
        // 고른 리스트가 꺼져 있으면 켠다('추가' 를 끈 사람) — 방금 만든 마커가 안 보이면 안 된다
        const selCats = getSelectedCategories();
        if (!selCats.has(cat)) {
            selCats.add(cat);
            setSelectedCategories(selCats);
            const cb = document.getElementById('cat-' + cat);
            if (cb) cb.checked = true;
        }
        exitAddSiteMode();
        if (!syncAddedSiteRows()) rebuildMarkers();   // 행이 그대로여도 리스트를 켰을 수 있다
        openDetailForStatusKey(key);
        // 구 필터에 가려지면 알려 준다(지사는 위에서 막았다)
        const guRaw = localStorage.getItem(lsKey('ami_selected_gu'));
        let guHidden = false;
        try { guHidden = !!guRaw && !JSON.parse(guRaw).includes(p.gu); } catch (e) {}
        showAddSiteToast(guHidden ? `저장했습니다. 구 선택에서 ${p.gu}이 꺼져 있어 지도에는 안 보입니다` : '저장했습니다');
    } catch (e) {
        _addSiteErr('저장 실패: ' + e.message);
    } finally {
        saveBtn.disabled = false;
    }
}

// map.js initMap 이 지도를 만든 직후 부른다
function initAddSite() {
    const btn = document.getElementById('add-site-btn');
    if (window.AMI_VIEW_ONLY) { if (btn) btn.style.display = 'none'; return; }
    if (btn) btn.style.display = '';
    kakao.maps.event.addListener(map, 'click', onMapClickForAddSite);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _addSiteMode) exitAddSiteMode(); });
}
