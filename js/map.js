// map.js — 지도 및 마커 로직

let map;
let markers = [];
let sampleData = [];
// 마커키 -> workStatus 키 인덱스 (js/status-key.js). 데이터 로드 직후 1회 생성.
let statusKeyIndex = null;

// 지사 -> 구 매핑 (단일 소스 오브 트루스, 하드코딩 — 데이터의 지사필드는 '기타' 오염으로 신뢰 불가)
const JISA_TO_GU = {
    '강북성북지사': ['강북구', '성북구'],
    '광진성동지사': ['광진구', '성동구'],
    '노원도봉지사': ['노원구', '도봉구'],
    '동대문중랑지사': ['동대문구', '중랑구'],
    '마포용산지사': ['마포구', '용산구'],
    '서대문은평지사': ['서대문구', '은평구'],
    '서울본부직할': ['종로구', '중구'],
};
const GU_TO_JISA = {};
Object.entries(JISA_TO_GU).forEach(([j, gus]) => gus.forEach(g => { GU_TO_JISA[g] = j; }));

// 주소에서 구 추출 (scripts/stat_by_gu.py:gu_of()와 동일 패턴)
// 구 미표기 주소용 동->구 보정 (예외 케이스만, 전체 행정동 테이블 아님)
const DONG_TO_GU = { '면목동': '중랑구' };
function guOf(addr) {
    const a = addr || '';
    const m = a.match(/(\S+구)(\s|$)/);
    if (m) return m[1];
    // 구가 안 적힌 주소: 동명으로 보정
    const dm = a.match(/([가-힣]+[동읍면])/);
    if (dm && DONG_TO_GU[dm[1]]) return DONG_TO_GU[dm[1]];
    return null;
}
// 항목의 보정된 지사 (item.지사 대신 이걸로 분류 — 기타 흡수)
function jisaOf(item) {
    const j = GU_TO_JISA[guOf(item.주소)];
    return j || '미분류';
}

// 데이터셋 정의 — 새 batch 추가 시 이 배열에만 한 줄 추가
// (label: 마커에 표시할 글자, null이면 계기 개수 숫자 / uiLabel: 카테고리 패널 표시명)
const DATASETS = [
    { file: './data/site-data.json', category: '실효', label: null,  uiLabel: '실효계기' },
    { file: './data/rework-data.json', category: '재방문', label: '재', uiLabel: '재방문' },
    // 2026-08-02 영준님 지시로 skt·tou 내림 — 0730 리스트와 재방문만 남긴다.
    //   데이터 파일(data/skt-data.json·tou-data.json)은 지우지 않았다. 되살리려면 이 배열에
    //   아래 두 줄을 되돌리고 getSelectedCategories 의 ALL 에도 다시 넣어야 한다.
    // { file: './data/skt-data.json',  category: 'skt',  label: 'SK', uiLabel: 'SKT' },
    // { file: './data/tou-data.json',  category: 'tou',  label: 'TOU', uiLabel: 'TOU' },
];

// 위치 추적 관련 상태
let locationOverlay = null;
let locationWatchId = null;
let locationActive = false;

// 데이터셋 1개 로드 — 실효(16MB)는 캐시-우선(IndexedDB), skt/tou(작음)는 직접 fetch.
async function loadDataset(d) {
    try {
        let rows;
        if (d.category === '실효') {
            rows = await loadSiteDataCached(d.file);
        } else {
            const r = await fetch(d.file, { cache: 'no-cache' });
            rows = r.ok ? await r.json() : [];
        }
        return rows.map(r => ({ ...r, category: d.category }));
    } catch (e) {
        console.warn(`[load ${d.category}] 실패:`, e);
        return [];
    }
}

// 실효 site-data 캐시-우선(stale-while-revalidate 단순화):
//   버전 fetch(작음) → IDB 캐시와 비교 → 같으면 IDB raw 재사용(16MB 재다운로드 0),
//   다르면(또는 캐시 없음/IDB 불가) 풀 fetch + IDB 갱신. 어떤 실패도 풀 fetch로 폴백(누락 금지).
//   ★버전은 IDB 안에 데이터와 함께 저장 — localStorage에 두면 휘발 시 desync.
async function loadSiteDataCached(file) {
    let ver = null;
    try {
        const vr = await fetch('./data/site-data.version.json', { cache: 'no-cache' });
        if (vr.ok) ver = (await vr.json()).version;
    } catch (e) { /* 버전 못 받으면 캐시 못 쓰고 풀 fetch */ }

    if (ver) {
        try {
            const cached = await idbGet('site-data');
            if (cached && cached.version === ver && typeof cached.text === 'string') {
                console.log('[siteData] 캐시 히트(IDB) — 재다운로드 0, ver', ver);
                return JSON.parse(cached.text);
            }
        } catch (e) { /* IDB 실패 → 풀 fetch */ }
    }

    const r = await fetch(file, { cache: 'no-cache' });
    const text = r.ok ? await r.text() : '[]';
    if (ver) {
        try {
            await idbSet('site-data', { version: ver, text });
            console.log('[siteData] 풀 fetch + IDB 캐시 갱신, ver', ver);
        } catch (e) { console.warn('[siteData] IDB 저장 실패(무시, 동작엔 영향 없음):', e); }
    }
    return JSON.parse(text);
}

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

    try {
        const loaded = await Promise.all(DATASETS.map(loadDataset));
        sampleData = loaded.flat();
    } catch (e) {
        console.error('[siteData] 로드 실패:', e);
        sampleData = [];
    }
    console.log('[siteData] 로드 완료:', sampleData.length, '개',
        DATASETS.map(d => `${d.category}=${sampleData.filter(r => r.category===d.category).length}`).join(', '));

    // ★반드시 sampleData 전체로 만든다. 지사·구·카테고리로 거른 부분집합을 쓰면
    //   화면 필터에 따라 키가 달라져 같은 마커가 다른 기록을 읽는다.
    statusKeyIndex = buildStatusKeyIndex(sampleData);
    console.log('[statusKey] 마커 여러 개로 갈린 주소:', statusKeyIndex.splitAddresses.length, '건');

    populateJisaOptions();
    populateCategoryFilter();
    loadMarkers();
    await initFirebase();
    markers.forEach(m => repaintMarker(m));
}

// 지사 드롭다운 옵션 채우기 (JISA_TO_GU 7개 키 기준 + localStorage 복원)
function populateJisaOptions() {
    const select = document.getElementById('jisa-select');
    if (!select) return;

    // 옵션은 JISA_TO_GU 키 7개 (데이터 raw 지사 아님 — 기타 오염 무시)
    const jisaList = Object.keys(JISA_TO_GU);

    // 실제 데이터에 미분류 항목이 있으면 옵션 끝에 추가 + 경고
    const hasMibunryu = sampleData.some(item => jisaOf(item) === '미분류');
    if (hasMibunryu) {
        console.warn('[populateJisaOptions] 미분류 항목 존재 — 주소에서 구 추출 실패 건 있음');
        jisaList.push('미분류');
    }

    jisaList.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j;
        opt.textContent = j;
        select.appendChild(opt);
    });

    const saved = localStorage.getItem('ami_selected_jisa') || '';
    if (saved && jisaList.includes(saved)) {
        // 저장된 지사가 유효한 옵션에 있으면 복원
        select.value = saved;
    } else {
        // 저장값 없거나 구버전 "기타" 등 — 첫 지사로 폴백
        select.value = jisaList[0];
        localStorage.setItem('ami_selected_jisa', jisaList[0]);
    }

    // 구 체크박스 초기 렌더
    renderGuCheckboxes(select.value);
}

// 구 체크박스 렌더 (지사 변경 시 + 초기 진입 시 호출)
function renderGuCheckboxes(jisa) {
    const container = document.getElementById('gu-checkboxes');
    if (!container) return;
    container.innerHTML = '';

    const gus = JISA_TO_GU[jisa] || (jisa === '미분류' ? ['미분류'] : []);
    if (gus.length === 0) return;

    // localStorage 복원: ami_selected_gu 없으면 전체 ON (마이그레이션 안전)
    let savedRaw = localStorage.getItem('ami_selected_gu');
    let savedSet = null;
    if (savedRaw) {
        try {
            const arr = JSON.parse(savedRaw);
            // 현재 지사 구들과 교집합이 0이면 전체 ON으로 리셋
            const inter = arr.filter(g => gus.includes(g));
            savedSet = inter.length > 0 ? new Set(arr) : null;
        } catch { savedSet = null; }
    }

    gus.forEach(g => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = g;
        cb.checked = savedSet ? savedSet.has(g) : true; // null이면 전체 ON
        cb.addEventListener('change', onGuChange);
        label.appendChild(cb);
        label.appendChild(document.createTextNode(g));
        container.appendChild(label);
    });
}

// 현재 필터(지사/구) 적용된 마커 전체가 보이도록 지도 맞춤.
//   ★사용자가 지사/구를 바꿀 때만 호출 — init/loadMarkers 경로에서 부르면
//   앱 켤 때마다 fit돼서 '마지막 위치 유지'가 깨진다. 지리 필터에만 적용(카테고리 제외).
function fitToFilteredMarkers() {
    if (!markers.length) return;
    const bounds = new kakao.maps.LatLngBounds();
    markers.forEach(m => bounds.extend(m.overlay.getPosition()));
    if (bounds.isEmpty()) return;
    map.setBounds(bounds, 60);   // 60px 여백
    // 단일/소수 좌표면 최대줌으로 튐 — 적당 레벨로 보정 (setBounds는 동기 반영)
    if (map.getLevel() < 4) map.setLevel(4);
}

// 지사 선택 변경 시 마커 재생성
function onJisaChange() {
    const select = document.getElementById('jisa-select');
    const value = select ? select.value : '';
    localStorage.setItem('ami_selected_jisa', value);
    // 지사 바뀌면 구 선택 초기화 (해당 지사 전체 구 ON) + 체크박스 재렌더
    localStorage.removeItem('ami_selected_gu');
    renderGuCheckboxes(value);
    markers.forEach(m => m.overlay.setMap(null));
    markers = [];
    loadMarkers();
    refreshAllMarkers();
    fitToFilteredMarkers();   // 선택 지사 영역으로 지도 이동
}

// 구 체크박스 변경 시 마커 재생성
function onGuChange() {
    const checked = [];
    document.querySelectorAll('#gu-checkboxes input[type="checkbox"]:checked').forEach(cb => checked.push(cb.value));
    localStorage.setItem('ami_selected_gu', JSON.stringify(checked));
    markers.forEach(m => m.overlay.setMap(null));
    markers = [];
    loadMarkers();
    refreshAllMarkers();
    fitToFilteredMarkers();   // 선택 구 영역으로 지도 이동
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

// 카테고리 토글 패널 — DATASETS 기반 동적 생성 + 토글/외부클릭/ESC 처리
function populateCategoryFilter() {
    const panel = document.getElementById('category-panel');
    const toggleBtn = document.getElementById('category-toggle');
    if (!panel || !toggleBtn) return;

    const saved = getSelectedCategories();

    DATASETS.forEach(d => {
        const lbl = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = 'cat-' + d.category;
        cb.value = d.category;
        cb.checked = saved.has(d.category);
        cb.addEventListener('change', onCategoryChange);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(d.uiLabel));
        panel.appendChild(lbl);
    });

    toggleBtn.addEventListener('click', () => {
        panel.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
        const filter = document.getElementById('category-filter');
        if (filter && !filter.contains(e.target)) {
            panel.classList.remove('open');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') panel.classList.remove('open');
    });
}

// 카테고리 필터 — 체크된 카테고리만 표시 (localStorage 저장)
function getSelectedCategories() {
    const ALL = ['실효', '재방문'];   // skt·tou 내림(2026-08-02) — DATASETS 주석 참조
    const saved = localStorage.getItem('ami_selected_categories');
    if (saved) try {
        const set = new Set(JSON.parse(saved));
        // 새 카테고리가 추가된 경우 default로 켬 (한 번만)
        const seenKey = 'ami_seen_categories';
        const seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]'));
        let changed = false;
        ALL.forEach(c => { if (!seen.has(c)) { set.add(c); seen.add(c); changed = true; } });
        if (changed) {
            localStorage.setItem(seenKey, JSON.stringify([...seen]));
            localStorage.setItem('ami_selected_categories', JSON.stringify([...set]));
        }
        return set;
    } catch {}
    // 첫 진입 — 전부 켬
    localStorage.setItem('ami_seen_categories', JSON.stringify(ALL));
    return new Set(ALL);
}
function setSelectedCategories(setObj) {
    localStorage.setItem('ami_selected_categories', JSON.stringify([...setObj]));
}

// 전체 마커 생성 (카테고리||주소 기준 그룹핑) — 지사·구·카테고리 필터링
function loadMarkers() {
    const selectedJisa = localStorage.getItem('ami_selected_jisa') || '';
    const selectedGuRaw = localStorage.getItem('ami_selected_gu');
    // ami_selected_gu 없으면(null) 선택 지사 전체 구 표시, 있으면 배열로 파싱
    const selectedGu = selectedGuRaw ? new Set(JSON.parse(selectedGuRaw)) : null;
    const selectedCats = getSelectedCategories();

    const grouped = {};
    sampleData.forEach(item => {
        const g = guOf(item.주소);
        if (selectedJisa && jisaOf(item) !== selectedJisa) return;
        // selectedGu가 null이면(미설정) 전체 구 표시, Set이면 체크된 구만 (빈 Set=전부 해제=아무것도 안 보임)
        if (selectedGu && !selectedGu.has(g === null ? '미분류' : g)) return;
        if (item.lat == null || item.lng == null) return;
        if (!selectedCats.has(item.category)) return;
        // 좌표 기준 그룹핑 — 같은 좌표(=같은 지점)면 한 마커로 합침.
        //   도로명으로 좌표 뽑아 인접 다른 지번이 같은 좌표에 박힌 케이스(재건축 한 건물 등) 통합.
        //   카테고리(실효/skt/tou) 다르면 다른 사업이라 별도 마커 유지.
        const key = `${item.category}||${item.lat}||${item.lng}`;
        if (!grouped[key]) {
            grouped[key] = {
                meters: [],
                lat: item.lat,
                lng: item.lng,
                roadAddress: item.도로명주소,
                category: item.category,
                address: item.주소,   // 대표 지번(첫 레코드) — 표시용
                addresses: [],        // 합쳐진 구성 지번 전체(중복 좌표) — 표시용
                statusKeys: [],       // 이 마커가 읽고 쓰는 workStatus 키
            };
        }
        grouped[key].meters.push(item);
        if (item.주소 && !grouped[key].addresses.includes(item.주소)) {
            grouped[key].addresses.push(item.주소);
        }
        const sk = statusKeyOf(item, statusKeyIndex);
        if (sk && !grouped[key].statusKeys.includes(sk)) {
            grouped[key].statusKeys.push(sk);
        }
    });

    // 같은 좌표에 겹친 approximate 마커들 — 작은 원형으로 분산
    spreadOverlappingMarkers(grouped);

    Object.values(grouped).forEach(data => {
        const coords = new kakao.maps.LatLng(data.lat, data.lng);
        createMarker(coords, data.address, data.meters, data.category, data.addresses, data.statusKeys);
    });
}

// 합친 마커의 구성 상태 집계 — 보수적(하나라도 미완이면 미완색).
//   우선순위: fail > hold > (전부 complete면) complete > pending
//   ※ 인자는 표시용 주소가 아니라 workStatus 키 목록이다(js/status-key.js).
function aggregateState(addresses) {
    if (!addresses || !addresses.length) return 'pending';
    const states = addresses.map(a => (workStatus[a] && workStatus[a].state) || 'pending');
    if (states.some(s => s === 'fail')) return 'fail';
    if (states.some(s => s === 'hold')) return 'hold';
    if (states.every(s => s === 'complete')) return 'complete';
    return 'pending';
}
// 합친 마커의 added_meters 총합(구성 지번 전부)
function aggregateAddedCount(addresses) {
    if (!addresses || !addresses.length) return 0;
    return addresses.reduce((sum, a) => {
        const am = workStatus[a] && workStatus[a].added_meters;
        return sum + (am ? Object.keys(am).length : 0);
    }, 0);
}
// 합친 마커 재작업 여부(구성 지번 중 하나라도)
function aggregateRework(addresses) {
    return (addresses || []).some(a => workStatus[a] && workStatus[a].rework === true);
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
function createMarker(position, address, meters, category, addresses, statusKeys) {
    // 표시용 지번 목록(패널 제목 등). 단일이면 [address].
    const addrList = (addresses && addresses.length) ? addresses : [address];
    // 상태를 읽고 쓰는 키. 한 주소가 마커 여러 개로 갈리면 주소와 달라진다(js/status-key.js).
    const keyList = (statusKeys && statusKeys.length) ? statusKeys : addrList;
    const state = aggregateState(keyList);
    const addedCount = aggregateAddedCount(keyList);
    const meterCount = meters.length + addedCount;
    const isSkt = category === 'skt';
    const isTou = category === 'tou';

    const isApproximate = meters.some(m => m.좌표정확도 === 'approximate');
    let color = isApproximate ? 'yellow' : 'green';
    if (isSkt) color = 'skt';
    if (isTou) color = 'tou';
    // TOU/SKT/실효 모두 workStatus(완료/불가/보류)에 따라 마커 변형
    if (state === 'complete') color = 'gray';
    else if (state === 'hold') color = 'blue';
    else if (state === 'fail') color = 'red';
    // SKT는 라벨 'SK', TOU는 'TOU', 일반은 개수 (approximate+pending이면 '?')
    let markerLabel;
    if (isSkt) markerLabel = 'SK';
    else if (isTou) markerLabel = 'TOU';
    else markerLabel = (isApproximate && state === 'pending') ? '?' : meterCount;
    // rework(재)면 숫자 위에 '재' 뱃지. 재방문 데이터셋은 rework=true라 개수+'재'로 표시.
    const touHasRework = isTou && meters.some(m => m.tou_type === 'rework');
    const isRework = aggregateRework(keyList) || touHasRework;

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

    // 클릭 이벤트를 직접 생성한 DOM에 붙임 — 합친 마커는 구성 지번 전체 전달
    markerEl.addEventListener('click', () => {
        showDetail(address, meters, addrList, keyList);
    });

    const customOverlay = new kakao.maps.CustomOverlay({
        position: position,
        content: markerEl,  // DOM 엘리먼트로 전달
        yAnchor: 1
    });

    customOverlay.setMap(map);

    markers.push({ overlay: customOverlay, address, addresses: addrList, statusKeys: keyList, meters, element: markerEl, category });
}

// 마커 색상 갱신 (상태 변경 시 호출) — address는 변경된 단일 지번이지만,
//   합친 마커는 여러 지번 대표하므로 addresses에 포함하는 마커를 찾아 집계로 다시 칠한다.
//   ※ workStatus 키가 '주소' 단독이라 같은 지번이 category가 다른 마커(실효/재방문/tou/skt)에
//     동시에 존재할 수 있다. find로 첫 마커만 칠하면 나머지는 새로고침 전까지 옛 색으로 남아
//     화면과 데이터가 어긋난다. 해당 지번을 가진 마커를 전부 갱신한다.
function updateMarkerColor(statusKey) {
    markers.filter(m => (m.statusKeys || m.addresses || [m.address]).includes(statusKey))
           .forEach(marker => repaintMarker(marker));
}

// 마커 하나를 현재 workStatus 기준으로 다시 칠한다.
function repaintMarker(marker) {
    const addrList = marker.statusKeys || marker.addresses || [marker.address];
    const state = aggregateState(addrList);
    const isApproximate = marker.meters.some(m => m.좌표정확도 === 'approximate');
    const isSkt = marker.category === 'skt';
    const isTou = marker.category === 'tou';

    let color = isApproximate ? 'yellow' : 'green';
    if (isSkt) color = 'skt';
    if (isTou) color = 'tou';
    // TOU/SKT/실효 모두 workStatus(완료/불가/보류)에 따라 마커 변형
    if (state === 'complete') color = 'gray';
    else if (state === 'hold') color = 'blue';
    else if (state === 'fail') color = 'red';

    const el = marker.element.querySelector('.custom-marker');
    if (el) el.className = `custom-marker ${color}`;

    const addedCount = aggregateAddedCount(addrList);
    const totalCount = marker.meters.length + addedCount;
    const labelEl = marker.element.querySelector('.marker-number');
    if (labelEl) {
        if (isSkt) labelEl.textContent = 'SK';
        else if (isTou) labelEl.textContent = 'TOU';
        else labelEl.textContent = (isApproximate && state === 'pending') ? '?' : totalCount;
    }

    // 재작업 라벨 동기화 (TOU는 항목 단위 rework 체크). 재방문은 rework=true라 숫자+'재'.
    const touHasRework = isTou && marker.meters.some(m => m.tou_type === 'rework');
    const isRework = aggregateRework(addrList) || touHasRework;
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
    markers.forEach(m => repaintMarker(m));
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
                map.setCenter(latlng);  // 최초 1회만 — 이후엔 마커만 갱신(지도 자유 이동)
            } else {
                locationOverlay.setPosition(latlng);
            }
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
        const jisa = jisaOf(it);
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
            // 좌표 기준 합친 마커와 일치 — 같은 좌표·카테고리 전체(여러 지번 포함)
            const groupMeters = sampleData.filter(s => s.category === it.category && s.lat === it.lat && s.lng === it.lng);
            const groupAddresses = [...new Set(groupMeters.map(m => m.주소).filter(Boolean))];
            const groupKeys = [...new Set(groupMeters.map(m => statusKeyOf(m, statusKeyIndex)).filter(Boolean))];
            if (typeof showDetail === 'function') showDetail(it.주소, groupMeters, groupAddresses, groupKeys);
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
