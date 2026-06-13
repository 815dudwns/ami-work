// AMI Queue — 수집폼 (1차: 최빈케이스 단독형). 아미맵 handoff → 맥·사진 입력 → datapush_queue push.
// 진입: 네이티브 딥링크가 window.__collectHandoff(key) 호출 / 또는 수집버튼 수동.
// 출력: datapush_queue/{id} = { addr, boxes:[{hamType:'단독', masters:[{...단독 마스터}]}] }  (saveActOne 입력 구조)

// ── 계기번호 → 계기유형 (ami-work utils.js parseType 이식) ──
function _collParseType(meterNo) {
    const code = (meterNo || '').substring(2, 4);
    if (code === '17') return 'E';
    if (code === '19') return 'AE';
    if (['25', '26', '27', '45', '46', '47'].includes(code)) return 'G';
    if (code === '53' || code === '55') return 'AMIGO';
    return '';
}

// site-data 통신방식(거친 값) → comm 코드 추천 디폴트. 최종은 작업자 드롭다운/4번 QR 맥판별.
function _collCommGuess(raw) {
    const s = String(raw || '').toUpperCase();
    if (s.includes('HPGP')) return 'hpgp';
    if (s.includes('IOT') || s.includes('K-DCU') || s.includes('KDCU')) return 'k-dcu';
    if (s.includes('LTE')) return 'lte_IV';
    if (s.includes('PLC')) return 'ks-plc';   // PLC 기본 추천(ks-plc), 작업자 확인
    return '';
}
const COMM_OPTS = [
    ['', '통신방식 선택'],
    ['ks-plc', 'KS-PLC (1~4차 DCU)'],
    ['hpgp', 'HPGP'],
    ['lte_IV', 'LTE 직접(lte_IV)'],
    ['k-dcu', 'K-DCU (5/6차·IoT-PLC)'],
    ['smgw-c', '아미고(smgw-c)'],
];

// 수집 세션 상태
let _coll = null;   // { key, addr, jisa, meters:[{meterNo,type,comm,mac,photos}], }

// ── 진입점: 딥링크/수동에서 handoff key 받음 ──
window.__collectHandoff = async function (key) {
    if (!key) { alert('수집 key 없음'); return; }
    if (!_db) { try { initFb(); } catch (e) {} }
    try {
        log('수집 handoff 로드: ' + key, 'warn');
        const snap = await _db.ref('collect_handoff/' + key).once('value');
        const v = snap.val();
        if (!v || !v.meters) { alert('handoff 데이터 없음: ' + key); log('handoff 비어있음', 'err'); return; }
        _setColl(v.addr || '', v.jisa || '', v.meters, '일반', key);
    } catch (e) {
        alert('handoff 로드 실패: ' + e.message);
        log('handoff 로드 실패: ' + e.message, 'err');
    }
};

// ── _coll 구성 공통 (handoff·계기번호진입·동행 공유) ──
// rawMeters: site-data/handoff 필드(계기번호·통신방식·지사) 또는 ami-jongno(new_meter_id) 항목 배열
function _setColl(addr, jisa, rawMeters, workMode, key) {
    const meters = (rawMeters || []).map(m => {
        const meterNo = String(m.계기번호 || m.meterNo || m.new_meter_id || '');
        return {
            meterNo,
            type: _collParseType(meterNo) || '',
            comm: _collCommGuess(m.통신방식 || m.comm),
            jisa: m.지사 || jisa || '',
            mac: '',
            photos: { pre: '', mac: '', post1: '' },
            // 동행(ami-jongno) 부가정보 — saveAct 칸수/봉인 등에 활용(2차)
            _cntrClas: m.cntr_clas || '', _cntrPwr: m.cntr_pwr || '', _sealNo: m.seal_no || '', _cha: m.cha || '',
        };
    }).filter(m => m.meterNo);
    _coll = { key: key || '', addr: addr || '', jisa: (meters[0] && meters[0].jisa) || jisa || '', workMode: workMode || '일반', meters };
    log('수집 ' + meters.length + '건 / ' + (workMode || '일반') + ' (' + (addr || '') + ')', 'ok');
    renderCollect();
}

// ── 계기번호 1개 → 그 주소 전체 계기 (일반시공: ami-work siteData 인덱스 조회) ──
window.__collectByMeterNo = async function (meterNo, workMode) {
    workMode = workMode || '일반';
    meterNo = String(meterNo || '').trim();
    if (!meterNo) { alert('계기번호를 입력하세요'); return; }
    if (!_db) { try { initFb(); } catch (e) {} }
    log('계기번호 조회: ' + meterNo + ' (' + workMode + ')', 'warn');
    if (workMode === '동행') { return _collectJongnoByMeter(meterNo); }
    try {
        // 1. 계기번호 → 그 계기 1건(.indexOn 계기번호)
        const s1 = await _db.ref('siteData/charger4eleccar').orderByChild('계기번호').equalTo(meterNo).once('value');
        const v1 = s1.val();
        if (!v1) { alert('site-data에 없는 계기번호: ' + meterNo); log('미존재 ' + meterNo, 'err'); return; }
        const hit = Object.values(v1)[0];
        const jibun = hit.주소 || '';
        // 2. 지번주소(주소) 기준으로 그 주소 전체(.indexOn 주소). 아미맵 마커 그룹핑과 동일 기준.
        //    ※ 도로명주소 통합은 다른 필지를 잘못 묶는 케이스(85건)가 있어 지번 우선. 정교화는 별도 세션.
        let meters = [];
        if (jibun) {
            const s2 = await _db.ref('siteData/charger4eleccar').orderByChild('주소').equalTo(jibun).once('value');
            meters = Object.values(s2.val() || {});
        }
        if (!meters.length) meters = [hit];
        _setColl(jibun || hit.도로명주소 || '', hit.지사 || '', meters, '일반', '');
    } catch (e) {
        alert('조회 실패: ' + e.message + '\n(인덱스 미설정 시 rules 확인)');
        log('조회 실패: ' + e.message, 'err');
    }
};

// ── 수집 화면 (전체화면 오버레이) ──
function _collOverlay() {
    let el = document.getElementById('collect-overlay');
    if (!el) {
        el = document.createElement('div');
        el.id = 'collect-overlay';
        el.style.cssText = 'position:fixed;inset:0;z-index:90000;background:#f3f4f6;overflow-y:auto;display:none;'
            + '-webkit-overflow-scrolling:touch';
        document.body.appendChild(el);
    }
    return el;
}

function renderCollect() {
    if (!_coll) return;
    const el = _collOverlay();
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const dept2 = (typeof JISA_DEPT2 !== 'undefined' && JISA_DEPT2[_coll.jisa]) || '';

    const cards = _coll.meters.map((m, i) => {
        const commSel = COMM_OPTS.map(([v, lbl]) =>
            `<option value="${v}"${m.comm === v ? ' selected' : ''}>${esc(lbl)}</option>`).join('');
        const slot = (k, lbl) => {
            const has = !!m.photos[k];
            return `<label style="flex:1;aspect-ratio:1;border:2px dashed ${has ? '#059669' : '#cbd5e1'};border-radius:8px;`
                + `display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:11px;`
                + `color:${has ? '#059669' : '#94a3b8'};background:${has ? '#ecfdf5' : '#fff'};overflow:hidden;position:relative">`
                + (has ? `<img src="${m.photos[k]}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : '')
                + `<span style="position:relative;z-index:1;background:rgba(255,255,255,.7);padding:1px 4px;border-radius:3px">${esc(lbl)}${has ? ' ✓' : ''}</span>`
                + `<input type="file" accept="image/*" capture="environment" style="display:none" onchange="collOnPhoto(${i},'${k}',this)"></label>`;
        };
        return `<div class="card" data-i="${i}" style="margin:0 0 10px">`
            + `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">`
            + `<div><b style="font-size:15px">${esc(m.meterNo)}</b> <span style="font-size:12px;color:#6b7280">${esc(m.type || '?')}타입</span></div>`
            + `<span style="font-size:11px;color:#9ca3af">단독형</span></div>`
            + `<div style="display:flex;gap:6px;margin-bottom:8px">`
            + `<input id="coll-mac-${i}" placeholder="모뎀맥 입력" value="${esc(m.mac)}" oninput="collSetMac(${i},this.value)" `
            + `style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px">`
            + `<select onchange="collSetComm(${i},this.value)" style="flex:0 0 130px;padding:8px;border:1px solid #d1d5db;border-radius:8px;font-size:12px">${commSel}</select>`
            + `</div>`
            + `<div style="display:flex;gap:6px">${slot('pre', '시공전')}${slot('mac', '모뎀맥')}${slot('post1', '시공후')}</div>`
            + `</div>`;
    }).join('');

    el.innerHTML =
        `<div style="background:#1e3a8a;color:#fff;padding:14px 16px;position:sticky;top:0;z-index:10;display:flex;justify-content:space-between;align-items:center">`
        + `<div><div style="font-size:15px;font-weight:700">awms 수집</div>`
        + `<div style="font-size:11px;opacity:.85;margin-top:2px">${esc(_coll.addr || '')} · ${esc(_coll.jisa || '')}${dept2 ? ' (DEPT2 ' + dept2 + ')' : ' (지사미상)'}</div></div>`
        + `<button onclick="collClose()" style="background:#374151;color:#fff;padding:8px 12px;font-size:13px">닫기</button></div>`
        + `<div style="padding:12px">`
        + (cards || '<div class="card" style="text-align:center;color:#9ca3af;padding:30px">계기 없음</div>')
        + `<button class="btn-green" style="width:100%;margin-top:6px;padding:14px" onclick="collSubmit()">큐에 담기 (${_coll.meters.length}건)</button>`
        + `<div style="height:40px"></div></div>`;
    el.style.display = 'block';
}

window.collSetMac = (i, v) => { if (_coll && _coll.meters[i]) _coll.meters[i].mac = v.trim(); };
window.collSetComm = (i, v) => { if (_coll && _coll.meters[i]) _coll.meters[i].comm = v; };
window.collClose = () => { const el = document.getElementById('collect-overlay'); if (el) el.style.display = 'none'; };

// 사진: input file → dataURL (네이티브 onShowFileChooser 필요 — C 빌드 후 동작)
window.collOnPhoto = function (i, k, input) {
    const f = input.files && input.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { if (_coll && _coll.meters[i]) { _coll.meters[i].photos[k] = r.result; renderCollect(); } };
    r.readAsDataURL(f);
};

// ── 큐에 담기: _coll → datapush_queue (계기별 단독 마스터) ──
window.collSubmit = async function () {
    if (!_coll || !_coll.meters.length) return;
    const noMac = _coll.meters.filter(m => !m.mac);
    if (noMac.length && !confirm('모뎀맥 없는 계기 ' + noMac.length + '건이 있습니다. 그래도 담을까요?')) return;
    const noComm = _coll.meters.filter(m => !m.comm);
    if (noComm.length && !confirm('통신방식 미선택 계기 ' + noComm.length + '건이 있습니다.\n(미선택 시 INST_S suffix 누락 → saveAct 오류 가능)\n그래도 담을까요?')) return;
    if (!confirm(_coll.addr + '\n' + _coll.meters.length + '건을 큐에 담습니다.')) return;

    // 최빈: 각 계기 = 단독형(FCLTY_DIV 10) 마스터 1, 슬래이브 0. 한 주소 = 한 큐 항목.
    const masters = _coll.meters.map(m => ({
        meterNo: m.meterNo,
        meterType: m.type || '',
        comm: m.comm || '',
        mac: m.mac || '',
        fcltyDiv: '10',
        fcltyLabel: '단독형',
        mbMeterId: '',   // 단독형은 비움
        mbCnt: '',       // 단독형은 비움
        slaves: [],
        photos: m.photos,
    }));
    const rec = {
        addr: _coll.addr || '',
        jisa: _coll.jisa || '',
        createdAt: new Date().toISOString(),
        createdBy: 'amiqueue',
        createdByName: '아미큐수집',
        status: 'pending',
        boxes: [{ hamType: '단독', masters }],
    };
    try {
        const ref = await _db.ref('datapush_queue').push(rec);
        log('큐 담기 완료: ' + _coll.meters.length + '건 → ' + ref.key, 'ok');
        // handoff 정리(single-use)
        if (_coll.key) { try { await _db.ref('collect_handoff/' + _coll.key).remove(); } catch (e) {} }
        _coll = null;
        collClose();
        if (typeof refreshQueue === 'function') refreshQueue();
        alert('큐에 담았습니다. [큐] 화면에서 확인하세요.');
    } catch (e) {
        alert('큐 담기 실패: ' + e.message);
        log('큐 담기 실패: ' + e.message, 'err');
    }
};
