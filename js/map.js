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
        { file: './data/site-data.json', category: '실효', label: null },
        { file: './data/skt-data.json',  category: 'skt',  label: 'SK' },
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
    if (saved && sorted.includes(saved)) select.value = saved;
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
    return new Set(['실효', 'skt']);
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

// 같은 좌표에 겹친 approximate 주소 그룹을 작은 원형으로 분산
function spreadOverlappingMarkers(grouped) {
    const SPREAD_RADIUS = 0.0003;   // ≈ 33m
    const coordToAddrs = {};
    Object.entries(grouped).forEach(([addr, data]) => {
        const isApprox = data.meters.some(m => m.좌표정확도 === 'approximate');
        if (!isApprox) return;
        const key = `${data.lat.toFixed(6)},${data.lng.toFixed(6)}`;
        if (!coordToAddrs[key]) coordToAddrs[key] = [];
        coordToAddrs[key].push(addr);
    });
    Object.values(coordToAddrs).forEach(addrs => {
        if (addrs.length <= 1) return;
        const n = addrs.length;
        addrs.forEach((addr, i) => {
            const angle = (2 * Math.PI * i) / n;
            grouped[addr].lat += SPREAD_RADIUS * Math.cos(angle);
            grouped[addr].lng += SPREAD_RADIUS * Math.sin(angle);
        });
    });
}

// 단일 마커 생성 및 지도에 추가
function createMarker(position, address, meters, category) {
    const status = workStatus[address] || { state: 'pending', checkedMeters: [], reason: '' };
    const meterCount = meters.length;
    const isSkt = category === 'skt';

    const isApproximate = meters.some(m => m.좌표정확도 === 'approximate');
    let color = isApproximate ? 'yellow' : 'green';
    if (isSkt) color = 'skt';
    if (status.state === 'complete') color = 'gray';
    else if (status.state === 'hold') color = 'blue';
    else if (status.state === 'fail') color = 'red';
    // SKT는 라벨 'SK', 일반은 개수 (approximate+pending이면 '?')
    let markerLabel;
    if (isSkt) markerLabel = 'SK';
    else markerLabel = (isApproximate && status.state === 'pending') ? '?' : meterCount;
    const isRework = status.rework === true;

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

    let color = isApproximate ? 'yellow' : 'green';
    if (isSkt) color = 'skt';
    if (status.state === 'complete') color = 'gray';
    else if (status.state === 'hold') color = 'blue';
    else if (status.state === 'fail') color = 'red';

    const el = marker.element.querySelector('.custom-marker');
    if (el) el.className = `custom-marker ${color}`;

    const labelEl = marker.element.querySelector('.marker-number');
    if (labelEl) {
        if (isSkt) labelEl.textContent = 'SK';
        else labelEl.textContent = (isApproximate && status.state === 'pending') ? '?' : marker.meters.length;
    }

    // 재작업 라벨 동기화
    const isRework = status.rework === true;
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

// 카카오맵 SDK 로드 완료 후 지도 초기화 실행
kakao.maps.load(() => {
    initMap();
});
