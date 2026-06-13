// AMI Queue — 수집폼 ("맥이 키" 마스터그룹 모델). design.md §1.5 기준.
// 진입: __collectHandoff(아미맵 데이터푸쉬) / __collectByMeterNo(마스터 계기번호 입력) → 둘 다 _setColl로 합류.
// 모델: 한 주소 = 계기 pool. 맥 입력=마스터(그룹 생성), 맥 없음=슬래이브(마스터 배정). 아미고는 함체 자동.
// 출력: datapush_queue boxes[].masters[].slaves[] (스키마 계약 = design.md §1.5).

// ── 계기번호 → 계기유형 (utils.js parseType) ──
function _collParseType(meterNo) {
    const code = (meterNo || '').substring(2, 4);
    if (code === '17') return 'E';
    if (code === '19') return 'AE';
    if (['25', '26', '27', '45', '46', '47'].includes(code)) return 'G';
    if (code === '53' || code === '55') return 'AMIGO';
    return '';
}
function _collIsAmigo(type) { return type === 'AMIGO'; }
function _collInstM(type) { return ({ E: 'HW4020', AE: 'HW4040', G: 'HW4030', AMIGO: 'HW4050' })[type] || 'HW4010'; }

// ── 통신방식 helper (awms-bridge-inject.js L1106~1138 순수함수 이식) ──
// suffix: 10=ks-plc 20=hpgp 40=LTE 70=lte_IV 90=k-dcu 92=smgw-c
function _commToSuffix(c) {
    const s = String(c || '').toUpperCase().replace(/[\s_-]/g, '');
    if (/SMGWC|SMGW/.test(s)) return '92';
    if (/LTEIV/.test(s)) return '70';
    if (s === 'LTE') return '40';
    if (/HPGP/.test(s)) return '20';
    if (/KDCU|IOTPLC/.test(s)) return '90';
    if (/KSPLC|^PLC$/.test(s)) return '10';
    return '';
}
function _macToSuffix(mac) {
    const raw = String(mac || '');
    if (/^012\d{8}$/.test(raw.replace(/\D/g, ''))) return 'LTE';
    const m = raw.toUpperCase().replace(/[^0-9A-F]/g, '');
    if (/^847207/.test(m)) { const c = m.charAt(6); if (c === '0' || c === 'E') return '90'; if (c === 'B' || c === 'C' || c === 'D') return '10'; }
    if (/^E0AEED/.test(m)) return '10';
    if (/^44B433/.test(m) || /^0014B0/.test(m)) return '20';
    if (/^AC5E8C/.test(m)) return 'SKIP';   // 혼재 → 자동 안 함, 직접 선택
    return '';
}
// 마스터 통신 suffix 추론: 맥 우선, 미판별 시 site-data 통신방식 교차. 결과 '' = 작업자 직접선택.
function _inferSuffix(type, mac, siteComm) {
    const sm = _macToSuffix(mac);
    if (sm === 'SKIP') return '';
    if (sm === 'LTE') return _collIsAmigo(type) ? '92' : '70';
    if (sm) return sm;
    return _commToSuffix(siteComm);   // 맥 미판별 → site-data 통신방식 교차
}
const _SUFFIX_COMM = { '10': 'ks-plc', '20': 'hpgp', '40': 'lte', '70': 'lte_IV', '90': 'k-dcu', '92': 'smgw-c' };
function _bungi(masterSuffix, slaveType) { return (masterSuffix === '92' && _collIsAmigo(slaveType)) ? '무선' : '0.5'; }

const COMM_OPTS = [
    ['', '통신방식'], ['10', 'KS-PLC'], ['20', 'HPGP'], ['70', 'LTE직접'], ['90', 'K-DCU(IoT)'], ['92', '아미고'],
];

// 수집 세션 상태 — meters = pool(역할 동적)
let _coll = null;
// meters[i] = { meterNo, type, siteComm, suffix, bdju, role:'unassigned'|'master'|'slave', masterIdx, mac, ext,
//               photos:{pre,mac,post1,post2}(마스터), photo(슬래이브 slot5) }

// ── 진입 1: 아미맵 데이터푸쉬 handoff ──
window.__collectHandoff = async function (key) {
    if (!key) { alert('수집 key 없음'); return; }
    if (!_db) { try { initFb(); } catch (e) {} }
    try {
        log('수집 handoff 로드: ' + key, 'warn');
        const snap = await _db.ref('collect_handoff/' + key).once('value');
        const v = snap.val();
        if (!v || !v.meters) { alert('handoff 데이터 없음: ' + key); log('handoff 비어있음', 'err'); return; }
        _setColl(v.addr || '', v.jisa || '', v.meters, '일반', key);
    } catch (e) { alert('handoff 로드 실패: ' + e.message); log('handoff 실패: ' + e.message, 'err'); }
};

// ── 진입 2: 마스터 계기번호 입력 → 그 주소 전체 (= 데이터푸쉬와 동일) ──
window.__collectByMeterNo = async function (meterNo, workMode) {
    workMode = workMode || '일반';
    meterNo = String(meterNo || '').trim();
    if (!meterNo) { alert('계기번호를 입력하세요'); return; }
    if (!_db) { try { initFb(); } catch (e) {} }
    log('계기번호 조회: ' + meterNo + ' (' + workMode + ')', 'warn');
    if (workMode === '동행') { return _collectJongnoByMeter(meterNo); }
    try {
        const s1 = await _db.ref('siteData/charger4eleccar').orderByChild('계기번호').equalTo(meterNo).once('value');
        const v1 = s1.val();
        if (!v1) { alert('site-data에 없는 계기번호: ' + meterNo); log('미존재 ' + meterNo, 'err'); return; }
        const hit = Object.values(v1)[0];
        const jibun = hit.주소 || '';
        // 지번주소(주소) 기준 그 주소 전체 — 아미맵 마커 그룹핑과 동일(도로명 오통합 방지). 정교화는 별도 세션.
        let meters = [];
        if (jibun) { const s2 = await _db.ref('siteData/charger4eleccar').orderByChild('주소').equalTo(jibun).once('value'); meters = Object.values(s2.val() || {}); }
        if (!meters.length) meters = [hit];
        _setColl(jibun || hit.도로명주소 || '', hit.지사 || '', meters, '일반', '');
    } catch (e) { alert('조회 실패: ' + e.message); log('조회 실패: ' + e.message, 'err'); }
};

// ── 동행시공 (ami-jongno) — 1차 stub. 별도 슬라이스에서 구현. ──
async function _collectJongnoByMeter(newMeterNo) {
    alert('동행시공(종로) 조회는 다음 단계에서 연결됩니다.');
    log('동행 조회 미구현 stub: ' + newMeterNo, 'warn');
}

// ── pool 구성 (handoff·계기번호·동행 공유). 역할은 전부 unassigned로 시작. ──
function _setColl(addr, jisa, rawMeters, workMode, key) {
    const meters = (rawMeters || []).map(m => {
        const meterNo = String(m.계기번호 || m.meterNo || m.new_meter_id || '');
        const type = _collParseType(meterNo) || '';
        return {
            meterNo, type,
            siteComm: m.통신방식 || m.comm || '',
            bdju: m.변대주 || '',          // 변대주(PLC; ≠DCUID). awms 필드매핑은 TODO(미확정)
            role: 'unassigned', masterIdx: -1,
            mac: '', suffix: '', ext: 'N',
            photos: { pre: '', mac: '', post1: '', post2: '' },  // 마스터 4
            photo: '',                                            // 슬래이브 1(slot5)
            _cntrClas: m.cntr_clas || '', _cntrPwr: m.cntr_pwr || '', _cha: m.cha || '',  // 동행 부가(2차)
        };
    }).filter(m => m.meterNo);
    _coll = { key: key || '', addr: addr || '', jisa: jisa || (meters[0] && meters[0].지사) || '', workMode: workMode || '일반', hamType: '단독', workDiv: 'M1010', meters };
    log('수집 ' + meters.length + '건 / ' + _coll.workMode + ' (' + (addr || '') + ')', 'ok');
    renderCollect();
}

// ── 역할 조작 ──
window.collSetMac = function (i, v) {
    const m = _coll && _coll.meters[i]; if (!m) return;
    m.mac = String(v || '').trim();
    if (m.mac) {
        m.role = 'master'; m.masterIdx = -1;
        m.suffix = _inferSuffix(m.type, m.mac, m.siteComm);  // 통신방식 자동
        renderCollect();
    } else {
        m.role = 'unassigned'; m.suffix = '';
        renderCollect();
    }
};
window.collSetSuffix = function (i, suf) { const m = _coll && _coll.meters[i]; if (m) { m.suffix = suf; renderCollect(); } };
window.collSetExt = function (i, v) { const m = _coll && _coll.meters[i]; if (m) m.ext = v ? 'Y' : 'N'; };
// 슬래이브 배정 (마스터 인덱스). masterIdx=-1 = 미할당으로
window.collAssignSlave = function (i, masterIdx) {
    const m = _coll && _coll.meters[i]; if (!m) return;
    masterIdx = parseInt(masterIdx, 10);
    if (isNaN(masterIdx) || masterIdx < 0) { m.role = 'unassigned'; m.masterIdx = -1; }
    else { m.role = 'slave'; m.masterIdx = masterIdx; }
    renderCollect();
};
// 아미고 마스터: 미할당 전부 이 마스터 슬래이브로 (무선, 함체 자동)
window.collAmigoAuto = function (mi) {
    if (!_coll) return;
    _coll.meters.forEach((m, i) => { if (i !== mi && m.role === 'unassigned') { m.role = 'slave'; m.masterIdx = mi; } });
    renderCollect();
};
window.collSetHam = function (v) { if (_coll) { _coll.hamType = v; renderCollect(); } };
window.collClose = function () { const el = document.getElementById('collect-overlay'); if (el) el.style.display = 'none'; };

// 사진: 마스터=photos[k], 슬래이브=photo(slot5)
window.collOnPhoto = function (i, k, input) {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const m = _coll && _coll.meters[i]; if (!m) return; if (k === 'slave') m.photo = r.result; else m.photos[k] = r.result; renderCollect(); };
    r.readAsDataURL(f);
};

// ── 시설유형 자동산출 ──
function _fcltyOf(masterCount, order, slaveCount, hamType) {
    if (masterCount <= 1) {
        if (hamType === '집합') return { div: '20', label: '집합기본' };
        return slaveCount > 0 ? { div: '40', label: '집합단독' } : { div: '10', label: '단독형' };
    }
    return order === 0 ? { div: '20', label: '집합기본' } : { div: '30', label: '집합추가' };
}

// ── 렌더 ──
function _collOverlay() {
    let el = document.getElementById('collect-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'collect-overlay';
        el.style.cssText = 'position:fixed;inset:0;z-index:90000;background:#f3f4f6;overflow-y:auto;display:none;-webkit-overflow-scrolling:touch';
        document.body.appendChild(el);
    }
    return el;
}
function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function _photoSlot(i, k, lbl, cur) {
    const has = !!cur;
    return `<label style="flex:1;aspect-ratio:1;border:2px dashed ${has ? '#059669' : '#cbd5e1'};border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;color:${has ? '#059669' : '#94a3b8'};background:${has ? '#ecfdf5' : '#fff'};overflow:hidden;position:relative">`
        + (has ? `<img src="${cur}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : '')
        + `<span style="position:relative;z-index:1;background:rgba(255,255,255,.7);padding:1px 3px;border-radius:3px">${_esc(lbl)}${has ? ' ✓' : ''}</span>`
        + `<input type="file" accept="image/*" capture="environment" style="display:none" onchange="collOnPhoto(${i},'${k}',this)"></label>`;
}

function renderCollect() {
    if (!_coll) return;
    const el = _collOverlay();
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[_coll.jisa]) || '';
    const masters = _coll.meters.map((m, i) => (m.role === 'master' ? i : -1)).filter(i => i >= 0);

    const cardOf = (m, i) => {
        const head = `<b style="font-size:15px">${_esc(m.meterNo)}</b> <span style="font-size:12px;color:#6b7280">${_esc(m.type || '?')}타입</span>`;
        // 마스터
        if (m.role === 'master') {
            const order = masters.indexOf(i);
            const slaveCnt = _coll.meters.filter(s => s.role === 'slave' && s.masterIdx === i).length;
            const fclty = _fcltyOf(masters.length, order, slaveCnt, _coll.hamType);
            const commSel = COMM_OPTS.map(([v, l]) => `<option value="${v}"${m.suffix === v ? ' selected' : ''}>${_esc(l)}</option>`).join('');
            const commName = _SUFFIX_COMM[m.suffix] || '';
            return `<div class="card" style="margin:0 0 10px;border-left:4px solid #2563eb">`
                + `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">`
                + `<div>${head} <span style="font-size:10px;background:#2563eb;color:#fff;padding:1px 6px;border-radius:4px">마스터</span></div>`
                + `<span style="font-size:11px;color:#9ca3af">${fclty.label}(${fclty.div})</span></div>`
                + `<div style="display:flex;gap:6px;margin-bottom:8px">`
                + `<input value="${_esc(m.mac)}" oninput="collSetMac(${i},this.value)" placeholder="모뎀맥" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">`
                + `<select onchange="collSetSuffix(${i},this.value)" style="flex:0 0 110px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px">${commSel}</select></div>`
                + (commName ? `<div style="font-size:10px;color:#059669;margin:-4px 0 6px">통신방식 자동: ${_esc(commName)}</div>` : `<div style="font-size:10px;color:#dc2626;margin:-4px 0 6px">통신방식 미판별 — 직접 선택</div>`)
                + (m.type === 'AE' ? `<label style="font-size:12px;display:flex;align-items:center;gap:6px;margin-bottom:8px"><input type="checkbox" ${m.ext === 'Y' ? 'checked' : ''} onchange="collSetExt(${i},this.checked)">연결장치(etype)</label>` : '')
                + (m.bdju ? `<div style="font-size:11px;color:#6b7280;margin-bottom:8px">변대주: ${_esc(m.bdju)}</div>` : '')
                + (_collIsAmigo(m.type) && masters.length >= 1 ? `<button onclick="collAmigoAuto(${i})" style="font-size:11px;padding:6px 10px;background:#e0e7ff;color:#3730a3;margin-bottom:8px;width:auto">미할당 전부 이 마스터 슬래이브로(무선)</button>` : '')
                + `<div style="display:flex;gap:5px">${_photoSlot(i, 'pre', '시공전', m.photos.pre)}${_photoSlot(i, 'mac', '맥', m.photos.mac)}${_photoSlot(i, 'post1', '계기', m.photos.post1)}${_photoSlot(i, 'post2', '전체', m.photos.post2)}</div>`
                + `</div>`;
        }
        // 슬래이브
        if (m.role === 'slave') {
            const mas = _coll.meters[m.masterIdx];
            const bungi = mas ? _bungi(mas.suffix, m.type) : '0.5';
            return `<div class="card" style="margin:0 0 8px 16px;border-left:4px solid #94a3b8">`
                + `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">`
                + `<div>${head} <span style="font-size:10px;background:#94a3b8;color:#fff;padding:1px 6px;border-radius:4px">슬래이브 ▸${_esc(mas ? mas.meterNo : '?')}</span></div>`
                + `<span style="font-size:10px;color:#9ca3af">분기 ${bungi}</span></div>`
                + `<div style="display:flex;gap:6px;align-items:center">`
                + `<div style="flex:0 0 70px">${_photoSlot(i, 'slave', '계기', m.photo)}</div>`
                + `<select onchange="collAssignSlave(${i},this.value)" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px">`
                + masters.map(mi => `<option value="${mi}"${mi === m.masterIdx ? ' selected' : ''}>마스터 ${_esc(_coll.meters[mi].meterNo)}</option>`).join('')
                + `<option value="-1">미할당으로</option></select></div></div>`;
        }
        // 미할당
        return `<div class="card" style="margin:0 0 8px;border-left:4px solid #fbbf24">`
            + `<div style="margin-bottom:6px">${head} <span style="font-size:10px;color:#92400e">미할당</span></div>`
            + `<div style="display:flex;gap:6px">`
            + `<input oninput="collSetMac(${i},this.value)" placeholder="모뎀맥 입력 → 마스터" style="flex:1;padding:9px;border:1px solid #d1d5db;border-radius:8px;font-size:13px">`
            + (masters.length ? `<select onchange="collAssignSlave(${i},this.value)" style="flex:0 0 130px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px"><option value="-1">슬래이브로…</option>` + masters.map(mi => `<option value="${mi}">▸ ${_esc(_coll.meters[mi].meterNo)}</option>`).join('') + `</select>` : '')
            + `</div></div>`;
    };

    const body = _coll.meters.map((m, i) => cardOf(m, i)).join('');
    const masterCnt = masters.length, slaveCnt = _coll.meters.filter(m => m.role === 'slave').length, unCnt = _coll.meters.filter(m => m.role === 'unassigned').length;

    el.innerHTML =
        `<div style="background:#1e3a8a;color:#fff;padding:12px 16px;position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center">`
        + `<div><div style="font-size:15px;font-weight:700">awms 수집</div>`
        + `<div style="font-size:11px;opacity:.85;margin-top:2px">${_esc(_coll.addr || '')} · ${_esc(_coll.jisa || '')}${dept2 ? ' (DEPT2 ' + dept2 + ')' : ' (지사미상)'}</div></div>`
        + `<button onclick="collClose()" style="background:#374151;color:#fff;padding:8px 12px;font-size:13px">닫기</button></div>`
        // 상단 공통 (사전세팅)
        + `<div style="background:#fff;padding:8px 16px;border-bottom:1px solid #e5e7eb;font-size:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap">`
        + `<span>작업방식 <b>${_esc(_coll.workMode)}</b></span>`
        + `<span>함체 <select onchange="collSetHam(this.value)" style="padding:4px;border:1px solid #d1d5db;border-radius:6px;font-size:12px"><option value="단독"${_coll.hamType === '단독' ? ' selected' : ''}>단독</option><option value="집합"${_coll.hamType === '집합' ? ' selected' : ''}>집합</option></select></span>`
        + `<span style="color:#2563eb">마스터 ${masterCnt}</span><span style="color:#6b7280">슬래이브 ${slaveCnt}</span>${unCnt ? `<span style="color:#92400e">미할당 ${unCnt}</span>` : ''}</div>`
        + `<div style="padding:12px">`
        + (body || '<div class="card" style="text-align:center;color:#9ca3af;padding:30px">계기 없음</div>')
        + `<button class="btn-green" style="width:100%;margin-top:6px;padding:14px" onclick="collSubmit()">큐에 담기</button>`
        + `<div style="height:40px"></div></div>`;
    el.style.display = 'block';
}

// ── 큐에 담기: pool → boxes (마스터그룹). 시설유형 자동산출. ──
window.collSubmit = async function () {
    if (!_coll || !_coll.meters.length) return;
    const masters = _coll.meters.map((m, i) => (m.role === 'master' ? i : -1)).filter(i => i >= 0);
    if (!masters.length) { alert('마스터가 없습니다.\n모뎀 꽂은 계기에 맥을 입력하면 마스터가 됩니다.'); return; }
    const un = _coll.meters.filter(m => m.role === 'unassigned');
    if (un.length && !confirm('미할당 계기 ' + un.length + '건이 있습니다(큐에서 제외됨). 계속할까요?')) return;
    const noSuffix = masters.filter(mi => !_coll.meters[mi].suffix);
    if (noSuffix.length && !confirm('통신방식 미선택 마스터 ' + noSuffix.length + '건. saveAct 오류 가능.\n계속할까요?')) return;

    const boxMasters = masters.map((mi, order) => {
        const m = _coll.meters[mi];
        const slaves = _coll.meters.filter(s => s.role === 'slave' && s.masterIdx === mi);
        const fclty = _fcltyOf(masters.length, order, slaves.length, _coll.hamType);
        const cnt = 1 + slaves.length;
        return {
            meterNo: m.meterNo, meterType: m.type, mac: m.mac,
            comm: _SUFFIX_COMM[m.suffix] || '', commSuffix: m.suffix,
            fcltyDiv: fclty.div, fcltyLabel: fclty.label,
            mbMeterId: fclty.div === '10' ? '' : m.meterNo,
            mbCnt: fclty.div === '10' ? '' : String(cnt),
            ext: m.ext || 'N', bdju: m.bdju || '',
            photos: m.photos,
            slaves: slaves.map(s => ({ meterNo: s.meterNo, meterType: s.type, bungi: _bungi(m.suffix, s.type), photo: s.photo || '' })),
        };
    });
    const rec = {
        workMode: _coll.workMode, addr: _coll.addr || '', jisa: _coll.jisa || '',
        workDiv: _coll.workDiv || 'M1010',
        createdAt: new Date().toISOString(), createdBy: 'amiqueue', createdByName: '아미큐수집',
        status: 'pending', boxes: [{ hamType: _coll.hamType, masters: boxMasters }],
    };
    if (!confirm(_coll.addr + '\n마스터 ' + masters.length + ' · 슬래이브 ' + _coll.meters.filter(m => m.role === 'slave').length + '건을 큐에 담습니다.')) return;
    try {
        const ref = await _db.ref('datapush_queue').push(rec);
        log('큐 담기 완료 → ' + ref.key, 'ok');
        if (_coll.key) { try { await _db.ref('collect_handoff/' + _coll.key).remove(); } catch (e) {} }
        _coll = null; collClose();
        if (typeof refreshQueue === 'function') refreshQueue();
        alert('큐에 담았습니다. [큐] 화면에서 확인하세요.');
    } catch (e) { alert('큐 담기 실패: ' + e.message); log('큐 담기 실패: ' + e.message, 'err'); }
};
