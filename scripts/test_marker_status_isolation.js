// test_marker_status_isolation.js
// 마커 완료 전파 회귀 테스트 — 한 주소가 마커 여러 개로 갈릴 때
// 한쪽 마커를 완료해도 다른 마커가 완료로 물들지 않아야 한다.
//
// 실행: node scripts/test_marker_status_isolation.js [--data-dir <경로>]
//   --data-dir 미지정 시 이 저장소의 data/ 를 쓴다.
//
// 대조: 같은 시나리오를 '옛 방식'(주소를 그대로 상태 키로 사용)으로도 돌려
//   수정 전에는 반드시 FAIL 이 나오는지 확인한다. 옛 방식이 통과해 버리면
//   테스트가 증상을 못 잡고 있다는 뜻이다.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const argIdx = process.argv.indexOf('--data-dir');
const DATA_DIR = argIdx !== -1 ? path.resolve(process.argv[argIdx + 1]) : path.join(ROOT, 'data');

const DATASETS = [
    ['site-data.json', '실효'],
    ['skt-data.json', 'skt'],
    ['tou-data.json', 'tou'],
    ['rework-data.json', '재방문'],
];

function loadRows() {
    const rows = [];
    for (const [f, cat] of DATASETS) {
        const p = path.join(DATA_DIR, f);
        if (!fs.existsSync(p)) { console.warn('  (없음, 건너뜀)', f); continue; }
        for (const r of JSON.parse(fs.readFileSync(p, 'utf8'))) {
            rows.push(Object.assign({}, r, { category: cat }));
        }
    }
    return rows;
}

// map.js / status-key.js 를 DOM·카카오맵 스텁 위에서 로드
function makeCtx() {
    const ctx = {
        console: { log() {}, warn() {}, error() {} },
        localStorage: { getItem: () => null, setItem() {} },
        document: { createElement: () => ({}), querySelector: () => null },
        kakao: { maps: { load() {} } },
        window: {},
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/status-key.js'), 'utf8'), ctx, { filename: 'status-key.js' });
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/map.js'), 'utf8'), ctx, { filename: 'map.js' });
    return ctx;
}

// 색만 확인하면 되므로 마커 엘리먼트는 최소 스텁
function fakeMarkerEl() {
    const c = { v: 'custom-marker green' };
    return {
        _c: c,
        addEventListener() {},
        appendChild() {},
        querySelector: s => s === '.custom-marker'
            ? { get className() { return c.v; }, set className(x) { c.v = x; }, appendChild() {} }
            : (s === '.marker-number' ? { textContent: '' } : null),
    };
}

const rows = loadRows();
console.log(`데이터: ${DATA_DIR}`);
console.log(`레코드 ${rows.length}건`);

const ctx = makeCtx();
const index = ctx.buildStatusKeyIndex(rows);
const split = index.splitAddresses;
console.log(`마커 2개 이상으로 갈린 주소: ${split.length}건\n`);

// 주소 -> 마커목록(대표 레코드)
const byAddr = new Map();
for (const r of rows) {
    if (!r.주소 || r.lat == null || r.lng == null) continue;
    if (!byAddr.has(r.주소)) byAddr.set(r.주소, new Map());
    const mk = ctx.markerKeyOf(r);
    if (!byAddr.get(r.주소).has(mk)) byAddr.get(r.주소).set(mk, r);
}

// 한 시나리오 실행: 첫 마커를 complete 로 만들고 나머지 마커 색을 본다.
//   mode 'new'  — 마커별 상태 키(수정 후)
//   mode 'old'  — 주소를 그대로 상태 키로(수정 전)
function runCase(addr, mode) {
    const slot = byAddr.get(addr);
    const reps = [...slot.values()];
    const keys = reps.map(r => mode === 'new' ? ctx.statusKeyOf(r, index) : r.주소);

    ctx.workStatus = {};
    ctx.workStatus[keys[0]] = { state: 'complete' };

    const markers = reps.map((r, i) => ({
        address: r.주소,
        addresses: [r.주소],
        statusKeys: [keys[i]],
        meters: [r],
        category: r.category,
        element: fakeMarkerEl(),
    }));
    ctx.markers = markers;
    markers.forEach(m => ctx.repaintMarker(m));

    const colors = markers.map(m => m.element._c.v);
    const first = colors[0];
    const rest = colors.slice(1);
    return {
        keys,
        uniqueKeys: new Set(keys).size === keys.length,
        firstGray: first.includes('gray'),
        bledRest: rest.filter(c => c.includes('gray')).length,   // 물든 다른 마커 수
        total: colors.length,
    };
}

let passNew = 0, failNew = 0, failOld = 0, dupKey = 0;
const failures = [];

for (const addr of split) {
    const nu = runCase(addr, 'new');
    const ol = runCase(addr, 'old');

    if (!nu.uniqueKeys) { dupKey++; failures.push(`${addr} — 상태 키가 유일하지 않음: ${nu.keys.join(' / ')}`); }
    const okNew = nu.uniqueKeys && nu.firstGray && nu.bledRest === 0;
    if (okNew) passNew++;
    else { failNew++; if (nu.uniqueKeys) failures.push(`${addr} — 마커 ${nu.total}개 중 ${nu.bledRest}개가 물듦`); }

    // 옛 방식은 반드시 물들어야(FAIL) 테스트가 유효하다
    if (ol.bledRest > 0) failOld++;
}

console.log('=== 수정 후(마커별 상태 키) ===');
console.log(`  PASS ${passNew} / FAIL ${failNew}  (키 중복 ${dupKey})`);
console.log('=== 수정 전(주소를 그대로 키로) ===');
console.log(`  전파 발생 ${failOld} / ${split.length}  <- 이 값이 크지 않으면 테스트가 증상을 못 잡는 것`);

if (failures.length) {
    console.log('\n실패 상세:');
    failures.forEach(f => console.log('  ' + f));
}

// ── 2단계: 실제 loadMarkers() 배선 확인 ─────────────────────────────
// 위 테스트는 repaintMarker 만 직접 불렀다. createMarker 에 statusKeys 를 안 넘기는 식의
// 배선 누락은 잡히지 않으므로, loadMarkers() 를 실제로 돌려 마커에 키가 실렸는지 본다.
function runLoadMarkers() {
    // ★ map.js 의 markers/sampleData 는 let 바인딩이라 컨텍스트에 프로퍼티로 붙지 않는다.
    //   같은 스코프에서 실행해야 값이 닿는다.
    const ctx2 = makeCtx();
    ctx2.__rows = rows;
    ctx2.__probe = null;
    ctx2.kakao.maps.LatLng = function (lat, lng) { this.lat = lat; this.lng = lng; };
    ctx2.kakao.maps.CustomOverlay = function () { this.setMap = () => {}; this.getPosition = () => ({}); };
    ctx2.document.createElement = () => fakeMarkerEl();
    vm.runInContext(`
        workStatus = {};
        sampleData = __rows;
        statusKeyIndex = buildStatusKeyIndex(__rows);
        markers = [];
        getSelectedCategories = () => new Set(['실효','skt','tou','재방문']);
        loadMarkers();
        __probe = markers.map(m => ({ addresses: m.addresses, statusKeys: m.statusKeys }));
    `, ctx2);
    return ctx2.__probe || [];
}

let wiringOk = true;
let wiringMsg = '';
try {
    const built = runLoadMarkers();
    const withKeys = built.filter(m => m.statusKeys && m.statusKeys.length);
    const splitSet = new Set(split);
    // 갈린 주소를 담은 마커는 키가 주소와 달라야 한다
    const bad = built.filter(m =>
        (m.addresses || []).some(a => splitSet.has(a)) &&
        (m.statusKeys || []).some(k => splitSet.has(k)));
    wiringOk = built.length > 0 && withKeys.length === built.length && bad.length === 0;
    wiringMsg = `마커 ${built.length}개 생성 / statusKeys 실린 마커 ${withKeys.length}개 / 주소를 키로 쓴 마커 ${bad.length}개`;
} catch (e) {
    wiringOk = false;
    wiringMsg = 'loadMarkers 실행 실패: ' + e.message;
}
console.log('\n=== loadMarkers 배선 ===');
console.log('  ' + wiringMsg);

const ok = failNew === 0 && failOld === split.length && split.length > 0 && wiringOk;
console.log('\n' + (ok
    ? `PASS — 갈린 주소 ${split.length}건 전부 마커 간 전파 없음 (수정 전에는 ${failOld}건 전부 전파됨), 배선 정상`
    : 'FAIL'));
process.exit(ok ? 0 : 1);
