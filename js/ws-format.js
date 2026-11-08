// ws-format.js — workStatus 미러의 형식·보관 키를 한 곳에 (2026-11-08, 지도·통계가 같이 쓴다)
//   지도(js/firebase.js)가 IndexedDB 에 두는 workStatus 미러를 통계(stats.html)도 그대로 읽고 이어 쓴다.
//   형식(키 디코딩·레코드 변환)과 보관 키가 두 벌이면 언젠가 어긋나 미러가 깨진다 — 그래서 여기 하나만 둔다.
//   ★js/config.js(WS_KEY_SUFFIX·WS_DATASET) 다음, js/firebase.js·stats 본문 앞에 실어야 한다.

// ── 보관 키(IndexedDB, 소속별 접미 — js/config.js) ─────────────────────────────
const WS_IDB_KEY = 'ami_work_status_v2' + WS_KEY_SUFFIX;           // 미러 본체 { 디코딩된 상태키: 레코드 }
const WS_SYNCAT_KEY = 'ami_work_status_syncAt' + WS_KEY_SUFFIX;    // 마지막으로 받은 syncAt
const WS_SCHEMA_VERSION = 2;                                       // 구조가 바뀌면 올린다 -> 전량 재수신
const WS_SCHEMA_KEY = 'ami_work_status_schema' + WS_KEY_SUFFIX;

// ── 키 인코딩/디코딩 ─────────────────────────────────────────
// Firebase 키 금지 문자: . # $ [ ] /
function encodeKey(str) {
    return str
        .replace(/\./g,  '_dot_')
        .replace(/#/g,   '_hash_')
        .replace(/\$/g,  '_dollar_')
        .replace(/\[/g,  '_lb_')
        .replace(/\]/g,  '_rb_')
        .replace(/\//g,  '_sl_');
}

function decodeKey(str) {
    return str
        .replace(/_dot_/g,    '.')
        .replace(/_hash_/g,   '#')
        .replace(/_dollar_/g, '$')
        .replace(/_lb_/g,     '[')
        .replace(/_rb_/g,     ']')
        .replace(/_sl_/g,     '/');
}

function buildOneFromFirebase(val) {
    const meterChecks = val.meterChecks || {};
    let checkedMeters;

    // 기존 배열 형태도 지원 (하위호환)
    if (Array.isArray(val.checkedMeters)) {
        checkedMeters = val.checkedMeters;
    } else {
        checkedMeters = Object.entries(meterChecks)
            .filter(([, v]) => v.checked)
            .map(([encodedMeter]) => decodeKey(encodedMeter));
    }

    // failedMeters: Firebase 키(인코딩됨) → 계기번호(디코딩) 로 변환
    const failedMeters = {};
    if (val.failedMeters && typeof val.failedMeters === 'object') {
        for (const [encodedMeter, reason] of Object.entries(val.failedMeters)) {
            failedMeters[decodeKey(encodedMeter)] = reason;
        }
    }

    return {
        state:         val.state         || 'pending',
        reason:        val.reason        || '',
        updatedAt:     val.updatedAt     || '',
        updatedBy:     val.updatedBy     || '',
        updatedByName: val.updatedByName || '',
        rework:        val.rework === true,
        previousCompleteAt: val.previousCompleteAt || '',
        previousCompleteBy: val.previousCompleteBy || '',
        // 델타 동기화용 서버 시각. 3단계(델타 쿼리)에서 lastSyncAt 계산에 쓴다.
        //   ★숫자다. 없으면 0 — 1단계 배포 전에 쓰인 레코드가 여기 해당한다.
        syncAt:        (typeof val.syncAt === 'number') ? val.syncAt : 0,
        checkedMeters,
        meterChecks,  // 원본 보관 (ts 비교용)
        added_meters: val.added_meters || {},   // 사용자 추가 계기 (admin 등)
        failedMeters,  // 계기 개별 불가: { 계기번호: 사유 }
        // 지도에서 직접 추가한 개소 정보(js/add-site.js). 없는 레코드에는 칸을 안 만든다(미러 크기).
        ...((val.site && typeof val.site === 'object') ? { site: val.site } : {}),
    };
}

function buildWorkStatusFromFirebase(data) {
    const result = {};
    Object.entries(data).forEach(([encodedAddr, val]) => {
        result[decodeKey(encodedAddr)] = buildOneFromFirebase(val);
    });
    return result;
}


// ── 통계용: 미러 + 바뀐 것만(syncAt 델타) ─────────────────────────────────────
//   전엔 통계를 열 때마다 workStatus 전체(약 9MB)를 once('value') 로 받았다(stats.html 2026-11-08 이전).
//   이제 지도가 둔 미러를 읽고, 마지막 syncAt 이후 바뀐 레코드만 받아 합친다. 미러가 없으면(처음) 한 번 전량.
//   persist=true 면 합친 결과를 지도와 같은 키·형식으로 다시 저장한다 — 지도가 다음에 열 때도 이어 쓴다.
//   ★미전송 큐(EVENTS_KEY, js/config.js)가 있으면 저장하지 않는다 — 지도의 로컬 미전송 수정을 서버값으로 덮지 않게.
//   반환: { ws, mode: 'delta'|'full', records, from }
async function loadWorkStatusMirrorDelta(db, persist) {
    const ref = db.ref('workStatus/' + WS_DATASET);
    let mirror = null, from = 0, schema = 0;
    try {
        if (typeof idbGet === 'function') {
            mirror = await idbGet(WS_IDB_KEY);
            from = (await idbGet(WS_SYNCAT_KEY)) || 0;
            schema = (await idbGet(WS_SCHEMA_KEY)) || 0;
        }
    } catch (e) { mirror = null; }
    let ws, mode, records = 0;
    if (mirror && typeof mirror === 'object' && Object.keys(mirror).length && from > 0 && schema === WS_SCHEMA_VERSION) {
        const snap = await ref.orderByChild('syncAt').startAt(from + 1).once('value');
        const data = snap.val() || {};
        ws = mirror;
        for (const [enc, val] of Object.entries(data)) {
            if (!val || typeof val !== 'object') continue;
            ws[decodeKey(enc)] = buildOneFromFirebase(val);
            records++;
        }
        mode = 'delta';
    } else {
        const snap = await ref.once('value');
        const data = snap.val() || {};
        ws = buildWorkStatusFromFirebase(data);
        records = Object.keys(ws).length;
        mode = 'full';
    }
    let maxSync = from;
    for (const k in ws) { const v = ws[k] && ws[k].syncAt; if (typeof v === 'number' && v > maxSync) maxSync = v; }
    if (persist && typeof idbSet === 'function') {
        let queued = 0;
        try { queued = (JSON.parse(localStorage.getItem(typeof EVENTS_KEY !== 'undefined' ? EVENTS_KEY : 'ami_event_queue') || '[]') || []).length; } catch (e) { queued = 1; }
        if (!queued && (mode === 'full' || records > 0)) {
            try {
                await idbSet(WS_IDB_KEY, ws);
                await idbSet(WS_SYNCAT_KEY, maxSync);
                await idbSet(WS_SCHEMA_KEY, WS_SCHEMA_VERSION);
            } catch (e) { console.warn('[ws-format] 미러 저장 실패(무시):', e && e.message); }
        }
    }
    return { ws, mode, records, from };
}
