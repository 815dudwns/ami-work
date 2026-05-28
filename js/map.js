// map.js — 지도 및 마커 로직

let map;
let markers = [];
let sampleData = [];

// 위치 추적 관련 상태
let locationOverlay = null;
let locationWatchId = null;
let locationActive = false;

// 지도 초기화 (카카오맵 생성 + 마커 로드)
async function initMap() {
    workStatus = loadStatusLocal();
    const container = document.getElementById('map');

    // 마지막 지도 위치/줌 레벨 복원
    const saved = (() => { try { return JSON.parse(localStorage.getItem('ami_map_view')); } catch { return null; } })();
    const options = {
        center: new kakao.maps.LatLng(saved ? saved.lat : 37.525, saved ? saved.lng : 126.960),
        level: saved ? saved.level : 4
    };
    map = new kakao.maps.Map(container, options);

    // 지도 이동/줌 변경 시 현재 뷰 저장
    kakao.maps.event.addListener(map, 'idle', () => {
        const c = map.getCenter();
        localStorage.setItem('ami_map_view', JSON.stringify({ lat: c.getLat(), lng: c.getLng(), level: map.getLevel() }));
    });

    // 데이터셋 정의 — 새 batch 추가 시 이 배열에만 한 줄 추가
    // (label: 마커에 표시할 글자, null이면 계기 개수 숫자)
    const DATASETS = [
        { file: './data/site-data.json?v=20260529a', category: '실효', label: null },
        { file: './data/skt-data.json?v=20260529a',  category: 'skt',  label: 'SK' },
        { file: './data/tou-data.json?v=20260529a',  category: 'tou',  label: 'TOU' },
    ];

    try {
        const loaded = await Promise.all(DATASETS.map(d =>
            fetch(d.file).then(r => r.ok ? r.json() : [])
                .then(rows => rows.map(r => ({ ...r, category: d.category })))
                .catch(e => { console.warn(`[load ${d.category}] 실패:`, e); return []; })
        ));
        sampleData = loaded.flat();
    } catch (e) {
        console.error('[siteData] 로드 실패:', e);
        sampleData = [];
    }
    console.log('[siteData] 로드 완료:', sampleData.length, '개',
        DATASETS.map(d => `${d.category}=${sampleData.filter(r => r.category===d.category).length}`).join(', '));

    populateJisaOptions();
    restoreCategoryCheckboxes();
    loadMarkers();
    await initFirebase();
    markers.forEach(m => updateMarkerColor(m.address));
}

// 지사 드롭다운 옵션 채우기 (데이터의 unique 지사 + localStorage 복원)
function populateJisaOptions() {
    const select = document.getElementById('jisa-select');
    if (!select) return;
    const jisaSet = new Set();
    sampleData.forEach(item => { if (item.지사) jisaSet.add(item.지사); });
    const sorted = [...jisaSet].sort((a, b) => a.localeCompare(b, 'ko'));
    sorted.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j;
        opt.textContent = j;
        select.appendChild(opt);
    });
    const saved = localStorage.getItem('ami_selected_jisa') || '';
    if (saved && sorted.includes(saved)) {
        select.value = saved;
    } else if (sorted.length) {
        // 저장값 없으면 첫 지사로 (전체 지사 옵션 제거됨 — 항상 단일 지사 표시)
        select.value = sorted[0];
        localStorage.setItem('ami_selected_jisa', sorted[0]);
    }
}

// 지사 선택 변경 시 마커 재생성
function onJisaChange() {
    const select = document.getElementById('jisa-select');
    const value = select ? select.value : '';
    localStorage.setItem('ami_selected_jisa', value);
    markers.forEach(m => m.overlay.setMap(null));
    markers = [];
    loadMarkers();
    refreshAllMarkers();
}

// 카테고리 체크박스 변경 시 마커 재생성
function onCategoryChange() {
    const set = new Set();
    document.querySelectorAll('.category-filter input[type="checkbox"]:checked').forEach(c => set.add(c.value));
    setSelectedCategories(set);
    markers.forEach(m => m.overlay.setMap(null));
    markers = [];
    loadMarkers();
    refreshAllMarkers();
}

// 카테고리 체크박스 초기 복원 (저장된 상태 → UI 반영)
function restoreCategoryCheckboxes() {
    const saved = getSelectedCategories();
    document.querySelectorAll('.category-filter input[type="checkbox"]').forEach(c => {
        c.checked = saved.has(c.value);
    });
}

// 카테고리 필터 — 체크된 카테고리만 표시 (localStorage 저장)
function getSelectedCategories() {
    const saved = localStorage.getItem('ami_selected_categories');
    if (saved) try { return new Set(JSON.parse(saved)); } catch {}
    // 기본값 = 전부 켬
    return new Set(['실효', 'skt', 'tou']);
}
function setSelectedCategories(setObj) {
    localStorage.setItem('ami_selected_categories', JSON.stringify([...setObj]));
}

// 전체 마커 생성 (카테고리||주소 기준 그룹핑) — 지사·카테고리 필터링
function loadMarkers() {
    const selectedJisa = localStorage.getItem('ami_selected_jisa') || '';
    const selectedCats = getSelectedCategories();

    const grouped = {};
    sampleData.forEach(item => {
        if (selectedJisa && item.지사 !== selectedJisa) return;
        if (item.lat == null || item.lng == null) return;
        if (!selectedCats.has(item.category)) return;
        // 같은 주소라도 카테고리 다르면 별도 마커
        const key = `${item.category}||${item.주소}`;
        if (!grouped[key]) {
            grouped[key] = {
                meters: [],
                lat: item.lat,
                lng: item.lng,
                roadAddress: item.도로명주소,
                category: item.category,
                address: item.주소,
            };
        }
        grouped[key].meters.push(item);
    });

    // 같은 좌표에 겹친 approximate 마커들 — 작은 원형으로 분산
    spreadOverlappingMarkers(grouped);

    Object.values(grouped).forEach(data => {
        const coords = new kakao.maps.LatLng(data.lat, data.lng);
        createMarker(coords, data.address, data.meters, data.category);
    });
}

// 같은 좌표에 겹친 마커 그룹을 좌표 중심으로 소용돌이(Sunflower spiral) 분산
// 첫 마커는 정중앙, 이후 황금각(137.5°)으로 빡빡하게 나선형 확장
function spreadOverlappingMarkers(grouped) {
    const SPIRAL_EXACT  = 0.000025; // ≈ 2.8m 기본 간격 (exact)
    const SPIRAL_APPROX = 0.00008;  // ≈ 9m (approximate)
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));   // ≈ 137.508°
    const coordToKeys = {};
    Object.entries(grouped).forEach(([key, data]) => {
        const k = `${data.lat.toFixed(6)},${data.lng.toFixed(6)}`;
        if (!coordToKeys[k]) coordToKeys[k] = [];
        coordToKeys[k].push(key);
    });
    Object.values(coordToKeys).forEach(keys => {
        const n = keys.length;
        if (n <= 1) return;
        const hasApprox = keys.some(k => grouped[k].meters.some(m => m.좌표정확도 === 'approximate'));
        const c = hasApprox ? SPIRAL_APPROX : SPIRAL_EXACT;
        // Sunflower seed pattern: r = c·√i, θ = i·golden_angle
        // i=0이 중심, i 증가하면서 빡빡한 나선형
        keys.forEach((key, i) => {
            const r = c * Math.sqrt(i);
            const angle = i * GOLDEN_ANGLE;
            grouped[key].lat += r * Math.cos(angle);
            grouped[key].lng += r * Math.sin(angle);
        });
    });
}

// 단일 마커 생성 및 지도에 추가
function createMarker(position, address, meters, category) {
    const status = workStatus[address] || { state: 'pending', checkedMeters: [], reason: '' };
    const addedCount = status.added_meters ? Object.keys(status.added_meters).length : 0;
    const meterCount = meters.length + addedCount;
    const isSkt = category === 'skt';
    const isTou = category === 'tou';

    const isApproximate = meters.some(m => m.좌표정확도 === 'approximate');
    let color = isApproximate ? 'yellow' : 'green';
    if (isSkt) color = 'skt';
    if (isTou) color = 'tou';
    if (status.state === 'complete') color = 'gray';
    else if (status.state === 'hold') color = 'blue';
    else if (status.state === 'fail') color = 'red';
    // SKT는 라벨 'SK', TOU는 'TOU', 일반은 개수 (approximate+pending이면 '?')
    let markerLabel;
    if (isSkt) markerLabel = 'SK';
    else if (isTou) markerLabel = 'TOU';
    else markerLabel = (isApproximate && status.state === 'pending') ? '?' : meterCount;
    // TOU는 항목 단위 rework (해당 주소에 rework가 1건 이상이면 '재' 표시)
    const touHasRework = isTou && meters.some(m => m.tou_type === 'rework');
    const isRework = status.rework === true || touHasRework;

    const markerContent = `
        <div class="custom-marker ${color}">
            <svg viewBox="0 0 20 26" xmlns="http://www.w3.org/2000/svg">
                <path class="pin-body" d="M10 0C4.48 0 0 4.48 0 10c0 6.72 10 16 10 16s10-9.28 10-16C20 4.48 15.52 0 10 0z"/>
                <circle class="pin-circle" cx="10" cy="10" r="5.5" fill="white"/>
            </svg>
            <div class="marker-number">${markerLabel}</div>
            ${isRework ? '<div class="marker-fraction">재</div>' : ''}
        </div>
    `;

    // DOM 엘리먼트로 직접 생성 (문자열 대신 — DOM 재구성 시 이벤트 유실 방지)
    const markerEl = document.createElement('div');
    markerEl.innerHTML = markerContent;

    // 클릭 이벤트를 직접 생성한 DOM에 붙임
    markerEl.addEventListener('click', () => {
        showDetail(address, meters);
    });

    const customOverlay = new kakao.maps.CustomOverlay({
        position: position,
        content: markerEl,  // DOM 엘리먼트로 전달
        yAnchor: 1
    });

    customOverlay.setMap(map);

    markers.push({ overlay: customOverlay, address, meters, element: markerEl, category });
}

// 마커 색상 갱신 (상태 변경 시 호출)
function updateMarkerColor(address) {
    const marker = markers.find(m => m.address === address);
    if (!marker) return;

    const status = workStatus[address] || { state: 'pending' };
    const isApproximate = marker.meters.some(m => m.좌표정확도 === 'approximate');
    const isSkt = marker.category === 'skt';
    const isTou = marker.category === 'tou';

    let color = isApproximate ? 'yellow' : 'green';
    if (isSkt) color = 'skt';
    if (isTou) color = 'tou';
    if (status.state === 'complete') color = 'gray';
    else if (status.state === 'hold') color = 'blue';
    else if (status.state === 'fail') color = 'red';

    const el = marker.element.querySelector('.custom-marker');
    if (el) el.className = `custom-marker ${color}`;

    const addedCount = status.added_meters ? Object.keys(status.added_meters).length : 0;
    const totalCount = marker.meters.length + addedCount;
    const labelEl = marker.element.querySelector('.marker-number');
    if (labelEl) {
        if (isSkt) labelEl.textContent = 'SK';
        else if (isTou) labelEl.textContent = 'TOU';
        else labelEl.textContent = (isApproximate && status.state === 'pending') ? '?' : totalCount;
    }

    // 재작업 라벨 동기화 (TOU는 항목 단위 rework 체크)
    const touHasRework = isTou && marker.meters.some(m => m.tou_type === 'rework');
    const isRework = status.rework === true || touHasRework;
    let fracEl = marker.element.querySelector('.marker-fraction');
    if (isRework) {
        if (!fracEl) {
            fracEl = document.createElement('div');
            fracEl.className = 'marker-fraction';
            fracEl.textContent = '재';
            el.appendChild(fracEl);
        }
    } else if (fracEl) {
        fracEl.remove();
    }
}

// 전체 마커 색상 일괄 갱신 (Firebase 동기화 후 호출)
function refreshAllMarkers() {
    markers.forEach(m => updateMarkerColor(m.address));
}

// 현재 위치 추적 토글
function toggleLocation() {
    const btn = document.getElementById('loc-btn');
    if (!locationActive) {
        if (!navigator.geolocation) { alert('위치 서비스를 지원하지 않는 브라우저입니다.'); return; }
        locationWatchId = navigator.geolocation.watchPosition(pos => {
            const latlng = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
            if (!locationOverlay) {
                const dot = document.createElement('div');
                dot.style.cssText = 'width:14px;height:14px;background:#3b82f6;border:2px solid white;border-radius:50%;box-shadow:0 0 0 4px rgba(59,130,246,0.25);';
                locationOverlay = new kakao.maps.CustomOverlay({ position: latlng, content: dot, zIndex: 10 });
                locationOverlay.setMap(map);
            } else {
                locationOverlay.setPosition(latlng);
            }
            map.setCenter(latlng);
        }, () => alert('위치를 가져올 수 없습니다.'), { enableHighAccuracy: true });
        locationActive = true;
        btn.classList.add('active');
    } else {
        if (locationWatchId !== null) navigator.geolocation.clearWatch(locationWatchId);
        if (locationOverlay) { locationOverlay.setMap(null); locationOverlay = null; }
        locationWatchId = null;
        locationActive = false;
        btn.classList.remove('active');
    }
}

// ── 검색 기능 ─────────────────────────────────────────
function openSearch() {
    const overlay = document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    const input = document.getElementById('search-input');
    if (input) { input.value = ''; setTimeout(() => input.focus(), 50); }
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-hint').textContent = '4자 이상 입력하세요';
}

function closeSearch() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) overlay.classList.remove('active');
}

function runSearch() {
    const q = (document.getElementById('search-input').value || '').trim();
    const hintEl = document.getElementById('search-hint');
    const resultsEl = document.getElementById('search-results');
    if (q.length < 4) {
        hintEl.textContent = '4자 이상 입력하세요';
        resultsEl.innerHTML = '';
        return;
    }

    const results = [];
    const addrSeen = new Set();
    for (const item of sampleData) {
        const meterNo = String(item.계기번호 || '');
        const road = String(item.도로명주소 || '');
        const addr = String(item.주소 || '');
        if (meterNo.includes(q)) {
            // 계기번호 매치: primary=계기번호, secondary=지번주소+도로명
            results.push({
                type: 'meter',
                primary: meterNo,
                secondary: addr,
                tertiary: road && road !== addr ? road : '',
                item,
            });
        } else if (addr.includes(q) || road.includes(q)) {
            const key = item.category + '||' + addr;
            if (addrSeen.has(key)) continue;
            addrSeen.add(key);
            // 매치된 쪽을 primary로 (지번이 검색어 포함하면 지번 위, 아니면 도로명 위)
            const addrMatched = addr.includes(q);
            results.push({
                type: 'address',
                primary: addrMatched ? addr : (road || addr),
                secondary: addrMatched ? (road && road !== addr ? road : '') : (addr && addr !== road ? addr : ''),
                tertiary: '',
                item,
            });
        }
    }

    hintEl.textContent = `${results.length}건 검색됨`;
    if (results.length === 0) {
        resultsEl.innerHTML = '<div class="search-empty">결과 없음</div>';
        return;
    }

    const MAX = 200;
    const shown = results.slice(0, MAX);
    const rows = shown.map((r, i) => {
        const it = r.item;
        const jisa = it.지사 || '';
        const cat = it.category === 'skt' ? 'SKT' : '실효';
        const catClass = it.category === 'skt' ? 'cat-skt' : 'cat-real';
        const sec = r.secondary ? `<div class="sr-secondary">${escapeSearchHtml(r.secondary)}</div>` : '';
        const ter = r.tertiary ? `<div class="sr-secondary">${escapeSearchHtml(r.tertiary)}</div>` : '';
        return `<div class="search-result-row" data-idx="${i}">
            <div class="sr-main">
                <div class="sr-primary">${escapeSearchHtml(r.primary)}</div>
                ${sec}${ter}
            </div>
            <div class="sr-meta">
                <span class="sr-cond">${escapeSearchHtml(jisa)}</span>
                <span class="sr-cond ${catClass}">${cat}</span>
            </div>
        </div>`;
    }).join('');

    resultsEl.innerHTML = rows + (results.length > MAX ? `<div class="search-empty">+ ${results.length - MAX}건 더 — 검색어를 좁혀주세요</div>` : '');
    resultsEl.querySelectorAll('.search-result-row').forEach((el, i) => {
        el.addEventListener('click', () => gotoSearchResult(shown[i]));
    });
}

function gotoSearchResult(r) {
    const it = r.item;
    if (it.lat == null || it.lng == null) {
        alert('좌표가 없는 항목입니다');
        return;
    }
    closeSearch();
    const latlng = new kakao.maps.LatLng(it.lat, it.lng);
    map.setLevel(1);
    map.setCenter(latlng);

    // 어떤 매치든 펄스 마커 10초 (계기 매치는 detail 창에 가려져도 창 닫으면 보임)
    showSearchPulse(latlng);

    if (r.type === 'meter') {
        // 계기번호 매치: detail 패널도 함께 열기
        setTimeout(() => {
            const groupMeters = sampleData.filter(s => s.category === it.category && s.주소 === it.주소);
            if (typeof showDetail === 'function') showDetail(it.주소, groupMeters);
        }, 200);
    }
}

// 임시 펄스 마커 — 10초 후 자동 사라짐
let _searchPulseOverlay = null;
let _searchPulseTimer = null;
function showSearchPulse(latlng) {
    if (_searchPulseTimer) { clearTimeout(_searchPulseTimer); _searchPulseTimer = null; }
    if (_searchPulseOverlay) { _searchPulseOverlay.setMap(null); _searchPulseOverlay = null; }
    const el = document.createElement('div');
    el.className = 'search-pulse';
    _searchPulseOverlay = new kakao.maps.CustomOverlay({
        position: latlng,
        content: el,
        yAnchor: 0.5,
        xAnchor: 0.5,
        zIndex: 999,
    });
    _searchPulseOverlay.setMap(map);
    _searchPulseTimer = setTimeout(() => {
        if (_searchPulseOverlay) { _searchPulseOverlay.setMap(null); _searchPulseOverlay = null; }
        _searchPulseTimer = null;
    }, 10000);
}

function escapeSearchHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 카카오맵 SDK 로드 완료 후 지도 초기화 실행
kakao.maps.load(() => {
    initMap();
});
