// AMI Queue — datapush_queue 읽기 + 목록 렌더 (Phase A: 표시·삭제만)
let _db = null;
let _queue = [];

function initFb() {
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    _db = firebase.database(app);
    log('Firebase 연결: ' + firebaseConfig.projectId, 'ok');
}

// 큐 탭 진입/새로고침 시
async function refreshQueue() {
    if (!_db) { log('Firebase 미초기화', 'err'); return; }
    try {
        const snap = await _db.ref('datapush_queue').once('value');
        const val = snap.val() || {};
        _queue = Object.entries(val).map(([id, v]) => Object.assign({ id }, v));
        _queue.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        renderQueue();
        updateSummary();
        log('큐 ' + _queue.length + '건 로드', 'ok');
    } catch (e) {
        log('큐 로드 실패: ' + e.message, 'err');
    }
}
window.refreshQueue = refreshQueue;

function _boxSummary(boxes) {
    let m = 0, s = 0; const types = [];
    (boxes || []).forEach(b => (b.masters || []).forEach(mm => {
        m++; s += (mm.slaves || []).length;
        if (mm.fcltyLabel) types.push(mm.fcltyLabel);
    }));
    return { ham: (boxes || []).length, m, s, types };
}
function _photoCnt(boxes) {
    return (boxes || []).reduce((n, b) => n + (b.masters || []).reduce(
        (k, m) => k + Object.values(m.photos || {}).filter(Boolean).length, 0), 0);
}

function renderQueue() {
    const el = document.getElementById('queue-list');
    if (!el) return;
    if (!_queue.length) {
        el.innerHTML = '<div class="card" style="text-align:center;color:#9ca3af;padding:30px">수집된 항목 없음<br><span style="font-size:11px">ami-work DataPush로 수집하세요</span></div>';
        return;
    }
    el.innerHTML = _queue.map(item => {
        const s = _boxSummary(item.boxes);
        const st = item.status || 'pending';
        const badge = st === 'sent' ? '<span class="badge done-cnt" style="background:#d1fae5;color:#065f46">전송완료(29)</span>'
            : st === 'saved' ? '<span class="badge badge-pending">저장됨(28)</span>'
                : st === 'error' ? '<span class="badge badge-err">실패</span>'
                    : '<span class="badge badge-pending">대기</span>';
        return '<div class="queue-item">'
            + '<div class="addr">' + esc(item.addr) + ' ' + badge + '</div>'
            + '<div class="meta">함체 ' + s.ham + ' · 마스터 ' + s.m + ' · 슬래이브 ' + s.s + ' · 사진 ' + _photoCnt(item.boxes) + '장<br>'
            + esc(s.types.join(', ') || '-') + '<br>'
            + '수집 ' + esc(item.createdByName || item.createdBy || '') + ' ' + esc((item.createdAt || '').slice(0, 16).replace('T', ' ')) + '</div>'
            + '<div class="actions">'
            + '<button class="btn-secondary" onclick="viewItem(\'' + item.id + '\')">내용</button>'
            + '<button class="btn-secondary" style="background:#1d4ed8;color:#fff" onclick="saveActOne(\'' + item.id + '\')">저장(28)</button>'
            + '<button class="btn-secondary" style="background:#fee2e2;color:#b91c1c" onclick="deleteItem(\'' + item.id + '\')">삭제</button>'
            + '</div></div>';
    }).join('');
}

function updateSummary() {
    const p = _queue.filter(i => (i.status || 'pending') === 'pending').length;
    const e = _queue.filter(i => i.status === 'error').length;
    const d = _queue.filter(i => i.status === 'sent' || i.status === 'saved').length;
    const set = (id, v) => { const x = document.getElementById(id); if (x) x.textContent = v; };
    set('stat-pending', p); set('stat-err', e); set('stat-done', d);
}

function viewItem(id) {
    const it = _queue.find(i => i.id === id);
    if (!it) return;
    const copy = JSON.parse(JSON.stringify(it));
    // 사진 dataURL은 길어서 요약
    (copy.boxes || []).forEach(b => (b.masters || []).forEach(m => {
        if (m.photos) Object.keys(m.photos).forEach(k => { if (m.photos[k]) m.photos[k] = '[사진]'; });
    }));
    alert(JSON.stringify(copy, null, 1).slice(0, 2000));
}

async function deleteItem(id) {
    if (!confirm('이 수집 항목을 삭제할까요?\n(awms 전송 전이면 안전하게 지워집니다)')) return;
    try {
        await _db.ref('datapush_queue/' + id).remove();
        log('삭제: ' + id, 'warn');
        await refreshQueue();
    } catch (e) { log('삭제 실패: ' + e.message, 'err'); }
}

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
