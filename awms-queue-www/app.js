// 메인 앱 — 세션 모니터, 큐 등록 실행

// ─────────────────────────────────────────────
// 화면 처리상황 패널 (index.html에 #log 없음 → 동적 생성, 리모컨으로 추가)
// ─────────────────────────────────────────────
function _statusPanel() {
    let el = document.getElementById('qstatus');
    if (!el) {
        el = document.createElement('div');
        el.id = 'qstatus';
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:46vh;overflow-y:auto;'
            + 'background:rgba(17,24,39,.97);color:#d1d5db;font:12px/1.5 ui-monospace,monospace;'
            + 'padding:6px 10px 16px;z-index:99999;white-space:pre-wrap;border-top:3px solid #2563eb;display:none';
        const hd = document.createElement('div');
        hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;'
            + 'background:rgba(17,24,39,.99);padding:4px 0;margin-bottom:4px;border-bottom:1px solid #374151';
        hd.innerHTML = '<b style="color:#93c5fd">처리상황</b>';
        const x = document.createElement('button');
        x.textContent = '닫기';
        x.style.cssText = 'padding:4px 10px;font-size:11px;background:#374151;color:#fff;border:none;border-radius:6px';
        x.onclick = () => { el.style.display = 'none'; };
        hd.appendChild(x);
        el.appendChild(hd);
        const body = document.createElement('div');
        body.id = 'qstatus-body';
        el.appendChild(body);
        document.body.appendChild(el);
    }
    return el;
}

// ─────────────────────────────────────────────
// [로그] 토글 버튼 (우하단 고정, z-index 높게)
// ─────────────────────────────────────────────
function _ensureLogToggleBtn() {
    if (document.getElementById('qlog-toggle')) return;
    const btn = document.createElement('button');
    btn.id = 'qlog-toggle';
    btn.textContent = '[로그]';
    btn.style.cssText = 'position:fixed;right:10px;bottom:56px;z-index:100001;'
        + 'padding:6px 12px;font-size:12px;font-weight:700;'
        + 'background:#374151;color:#9ca3af;border:none;border-radius:8px;cursor:pointer;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.4);';
    btn.onclick = function () {
        const panel = _statusPanel();
        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'block';
            panel.scrollTop = panel.scrollHeight;
            // 에러 깜빡임 초기화
            btn.style.animation = '';
            btn.style.color = '#9ca3af';
            btn.style.background = '#374151';
        } else {
            panel.style.display = 'none';
        }
    };
    if (!document.body) { setTimeout(_ensureLogToggleBtn, 300); return; }
    document.body.appendChild(btn);
}

// 에러 시 [로그] 버튼을 빨갛게 표시
function _flashLogBtn() {
    const btn = document.getElementById('qlog-toggle');
    if (!btn) return;
    btn.style.background = '#dc2626';
    btn.style.color = '#fff';
    // CSS keyframe animation이 없으므로 JS interval로 깜빡임
    let on = true;
    if (btn._flashTimer) clearInterval(btn._flashTimer);
    btn._flashTimer = setInterval(function () {
        btn.style.background = on ? '#dc2626' : '#7f1d1d';
        on = !on;
    }, 500);
    // 8초 후 자동 중지 (패널 열면 onclick에서 초기화됨)
    setTimeout(function () {
        if (btn._flashTimer) { clearInterval(btn._flashTimer); btn._flashTimer = null; }
        // 패널이 아직 닫혀있으면 빨간 정지 상태 유지 (에러 인지 전까지)
    }, 8000);
}

// ─────────────────────────────────────────────
// 아이디 설정 버튼 + 모달 (동적 DOM)
// ─────────────────────────────────────────────
function _ensureIdSettingBtn() {
    if (document.getElementById('qid-setting-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'qid-setting-btn';
    btn.textContent = '[아이디 설정]';
    btn.style.cssText = 'position:fixed;right:10px;bottom:96px;z-index:100001;'
        + 'padding:5px 10px;font-size:11px;font-weight:700;'
        + 'background:#1e3a5f;color:#93c5fd;border:1px solid #2563eb;border-radius:8px;cursor:pointer;'
        + 'box-shadow:0 2px 8px rgba(0,0,0,.4);';
    btn.onclick = _openIdModal;
    if (!document.body) { setTimeout(_ensureIdSettingBtn, 300); return; }
    document.body.appendChild(btn);
}

function _openIdModal() {
    // 기존 모달 제거
    var old = document.getElementById('qid-modal-overlay');
    if (old) old.remove();

    var profiles = (typeof loadProfiles === 'function') ? loadProfiles() : [];
    // count 내림차순 정렬
    var sorted = profiles.slice().sort(function (a, b) { return (b.count || 0) - (a.count || 0); });
    var activeId = localStorage.getItem('helper_cred_id') || '';

    // 오버레이
    var overlay = document.createElement('div');
    overlay.id = 'qid-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200000;display:flex;align-items:center;justify-content:center;';
    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };

    // 모달 박스
    var modal = document.createElement('div');
    modal.style.cssText = 'background:#1f2937;color:#f3f4f6;border-radius:12px;padding:20px;width:92vw;max-width:440px;'
        + 'max-height:85vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:-apple-system,sans-serif;';

    // 헤더
    var hd = document.createElement('div');
    hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
    var title = document.createElement('span');
    title.style.cssText = 'font-size:15px;font-weight:700;color:#93c5fd;';
    title.textContent = 'awms 아이디 설정';
    var closeBtn = document.createElement('button');
    closeBtn.textContent = '닫기';
    closeBtn.style.cssText = 'padding:4px 12px;font-size:12px;background:#374151;color:#d1d5db;border:none;border-radius:6px;cursor:pointer;';
    closeBtn.onclick = function () { overlay.remove(); };
    hd.appendChild(title);
    hd.appendChild(closeBtn);
    modal.appendChild(hd);

    // 안내
    var guide = document.createElement('div');
    guide.style.cssText = 'font-size:11px;color:#9ca3af;margin-bottom:12px;line-height:1.5;';
    guide.textContent = '많이 올린 순으로 표시됩니다. 처음 수동로그인하면 비번이 자동 저장됩니다.';
    modal.appendChild(guide);

    // 프로필 목록
    var listDiv = document.createElement('div');
    listDiv.id = 'qid-profile-list';
    _renderProfileList(listDiv, sorted, activeId, overlay);
    modal.appendChild(listDiv);

    // 구분선
    var hr = document.createElement('div');
    hr.style.cssText = 'border-top:1px solid #374151;margin:14px 0;';
    modal.appendChild(hr);

    // 아이디 추가 폼
    var addTitle = document.createElement('div');
    addTitle.style.cssText = 'font-size:13px;font-weight:700;color:#d1d5db;margin-bottom:8px;';
    addTitle.textContent = '+ 아이디 추가';
    modal.appendChild(addTitle);

    var addForm = _buildAddForm(overlay);
    modal.appendChild(addForm);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

function _renderProfileList(container, sorted, activeId, overlay) {
    container.innerHTML = '';
    if (!sorted.length) {
        var empty = document.createElement('div');
        empty.style.cssText = 'color:#9ca3af;font-size:12px;text-align:center;padding:10px;';
        empty.textContent = '저장된 아이디가 없습니다.';
        container.appendChild(empty);
        return;
    }
    sorted.forEach(function (profile, idx) {
        var row = document.createElement('div');
        var isActive = profile.id === activeId;
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;margin-bottom:8px;border-radius:8px;'
            + 'background:' + (isActive ? '#1e3a5f' : '#111827') + ';'
            + 'border:1px solid ' + (isActive ? '#2563eb' : '#374151') + ';';

        // 정보 영역
        var info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        var labelLine = document.createElement('div');
        labelLine.style.cssText = 'font-size:13px;font-weight:700;color:' + (isActive ? '#93c5fd' : '#f3f4f6') + ';';
        labelLine.textContent = profile.label + (isActive ? ' [현재]' : '');
        var idLine = document.createElement('div');
        idLine.style.cssText = 'font-size:11px;color:#9ca3af;margin-top:2px;';
        idLine.textContent = profile.id + '  (등록 ' + (profile.count || 0) + '건)';
        info.appendChild(labelLine);
        info.appendChild(idLine);
        row.appendChild(info);

        // [이 아이디로 로그인] 버튼
        var loginBtn = document.createElement('button');
        loginBtn.textContent = isActive ? '사용중' : '이 아이디로 로그인';
        loginBtn.style.cssText = 'padding:5px 10px;font-size:11px;font-weight:700;border:none;border-radius:6px;cursor:pointer;white-space:nowrap;'
            + (isActive ? 'background:#374151;color:#9ca3af;cursor:default;' : 'background:#2563eb;color:#fff;');
        if (!isActive) {
            loginBtn.onclick = (function (p) {
                return function () {
                    if (!confirm(p.label + '(' + p.id + ') 아이디로 전환할까요?')) return;
                    localStorage.setItem('helper_cred_id', p.id);
                    if (p.pw) localStorage.setItem('helper_cred_pw', p.pw);
                    alert(p.label + ' 아이디로 전환했습니다.\n[awms 열기]에서 기존 계정 로그아웃 후 재로그인하세요.\n\nID는 자동입력, 비번은 ' + (p.pw ? '자동입력' : '수동 입력') + ', 인증번호(OTP)는 수동.\n로그인 후 [새로고침].');
                    overlay.remove();
                    if (typeof updateSessionBar === 'function') updateSessionBar();
                };
            })(profile);
        }
        row.appendChild(loginBtn);

        // [편집] 버튼
        var editBtn = document.createElement('button');
        editBtn.textContent = '편집';
        editBtn.style.cssText = 'padding:5px 8px;font-size:11px;background:#374151;color:#d1d5db;border:none;border-radius:6px;cursor:pointer;';
        editBtn.onclick = (function (p, r) {
            return function () { _showEditRow(r, p, activeId, overlay); };
        })(profile, row);
        row.appendChild(editBtn);

        // [삭제] 버튼
        var delBtn = document.createElement('button');
        delBtn.textContent = '삭제';
        delBtn.style.cssText = 'padding:5px 8px;font-size:11px;background:#7f1d1d;color:#fca5a5;border:none;border-radius:6px;cursor:pointer;';
        delBtn.onclick = (function (p) {
            return function () {
                if (!confirm(p.label + '(' + p.id + ') 삭제할까요?')) return;
                var profiles = (typeof loadProfiles === 'function') ? loadProfiles() : [];
                profiles = profiles.filter(function (x) { return x.id !== p.id; });
                if (typeof saveProfiles === 'function') saveProfiles(profiles);
                _openIdModal(); // 모달 재오픈으로 갱신
            };
        })(profile);
        row.appendChild(delBtn);

        container.appendChild(row);
    });
}

function _showEditRow(row, profile, activeId, overlay) {
    row.innerHTML = '';
    row.style.background = '#111827';
    row.style.border = '1px solid #2563eb';
    row.style.flexDirection = 'column';
    row.style.alignItems = 'stretch';
    row.style.gap = '6px';

    var labelInp = document.createElement('input');
    labelInp.type = 'text';
    labelInp.value = profile.label;
    labelInp.placeholder = '라벨';
    labelInp.style.cssText = 'width:100%;padding:6px 8px;font-size:12px;background:#374151;color:#f3f4f6;border:1px solid #4b5563;border-radius:6px;box-sizing:border-box;';

    var pwInp = document.createElement('input');
    pwInp.type = 'password';
    pwInp.value = profile.pw || '';
    pwInp.placeholder = '비번 (빈칸=미변경)';
    pwInp.style.cssText = labelInp.style.cssText;

    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;';

    var saveBtn = document.createElement('button');
    saveBtn.textContent = '저장';
    saveBtn.style.cssText = 'padding:5px 14px;font-size:12px;font-weight:700;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;';
    saveBtn.onclick = function () {
        var profiles = (typeof loadProfiles === 'function') ? loadProfiles() : [];
        for (var i = 0; i < profiles.length; i++) {
            if (profiles[i].id === profile.id) {
                profiles[i].label = labelInp.value.trim() || profile.label;
                if (pwInp.value) profiles[i].pw = pwInp.value;
                break;
            }
        }
        if (typeof saveProfiles === 'function') saveProfiles(profiles);
        _openIdModal();
    };

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = '취소';
    cancelBtn.style.cssText = 'padding:5px 10px;font-size:12px;background:#374151;color:#d1d5db;border:none;border-radius:6px;cursor:pointer;';
    cancelBtn.onclick = function () { _openIdModal(); };

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);
    row.appendChild(labelInp);
    row.appendChild(pwInp);
    row.appendChild(btnRow);
}

function _buildAddForm(overlay) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    var inp = function (ph, type) {
        var el = document.createElement('input');
        el.type = type || 'text';
        el.placeholder = ph;
        el.style.cssText = 'width:100%;padding:8px 10px;font-size:13px;background:#111827;color:#f3f4f6;'
            + 'border:1px solid #374151;border-radius:6px;box-sizing:border-box;';
        return el;
    };

    var idInp = inp('아이디 (예: mdp250xxxx)');
    var pwInp = inp('비번 (나중에 수동로그인으로도 저장됨)', 'password');
    var lblInp = inp('라벨 (예: 종로팀 서브)');

    var addBtn = document.createElement('button');
    addBtn.textContent = '추가';
    addBtn.style.cssText = 'padding:8px;font-size:13px;font-weight:700;background:#2563eb;color:#fff;'
        + 'border:none;border-radius:6px;cursor:pointer;width:100%;';
    addBtn.onclick = function () {
        var idVal = idInp.value.trim();
        if (!idVal) { alert('아이디를 입력하세요.'); return; }
        var profiles = (typeof loadProfiles === 'function') ? loadProfiles() : [];
        for (var i = 0; i < profiles.length; i++) {
            if (profiles[i].id === idVal) { alert('이미 등록된 아이디입니다.'); return; }
        }
        profiles.push({
            id: idVal,
            label: lblInp.value.trim() || idVal,
            pw: pwInp.value || '',
            count: 0,
        });
        if (typeof saveProfiles === 'function') saveProfiles(profiles);
        _openIdModal();
    };

    wrap.appendChild(idInp);
    wrap.appendChild(pwInp);
    wrap.appendChild(lblInp);
    wrap.appendChild(addBtn);
    return wrap;
}

// ─────────────────────────────────────────────
// 진행 비주얼 — 등록 진행 카드 (#qprogress)
// ─────────────────────────────────────────────
// 6단계 라벨
var STAGE_LABELS = ['조회', '사진', '철거', '상세', '신설', '완료'];
var _progressState = null;  // null = 카드 숨김
var _progressTimer = null;

function _ensureProgressCard() {
    let card = document.getElementById('qprogress');
    if (!card) {
        card = document.createElement('div');
        card.id = 'qprogress';
        card.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:100000;'
            + 'background:#1e3a5f;color:#fff;padding:10px 14px 12px;'
            + 'font:13px/1.5 -apple-system,sans-serif;display:none;'
            + 'border-bottom:3px solid #2563eb;';
        card.innerHTML =
            '<div id="qp-count" style="font-size:11px;color:#93c5fd;text-align:center;margin-bottom:3px"></div>'
            + '<div id="qp-seq" style="font-size:14px;font-weight:700;text-align:center;margin-bottom:4px"></div>'
            + '<div id="qp-meters" style="font-size:12px;text-align:center;color:#d1fae5;margin-bottom:6px"></div>'
            + '<div id="qp-steps" style="display:flex;gap:4px;justify-content:center;margin-bottom:4px"></div>'
            + '<div id="qp-elapsed" style="font-size:11px;text-align:center;color:#9ca3af"></div>';
        document.body.appendChild(card);
    }
    return card;
}

// 진행 단계 렌더링 (DOM-only, log() 호출 금지)
function _setStage(stageIdx) {
    if (!_progressState) return;
    _progressState.stage = stageIdx;
    _renderProgressCard();
}

function _renderProgressCard() {
    const state = _progressState;
    if (!state) return;
    const card = _ensureProgressCard();
    const count = document.getElementById('qp-count');
    const seq = document.getElementById('qp-seq');
    const meters = document.getElementById('qp-meters');
    const steps = document.getElementById('qp-steps');
    const elapsed = document.getElementById('qp-elapsed');
    if (!count || !seq || !meters || !steps || !elapsed) return;

    // 카운트 표시
    if (state.total > 1) {
        count.textContent = '등록 중  [' + state.current + ' / ' + state.total + ']';
    } else {
        count.textContent = '등록 중';
    }

    // 시퀀스 / 계기
    if (state.failed) {
        seq.style.color = '#fca5a5';
        seq.textContent = (state.seq != null ? '#' + state.seq + '  ' : '') + '등록 실패';
        card.style.background = '#7f1d1d';
        card.style.borderBottomColor = '#dc2626';
        // 실패 원인 표시 — errLabel/errHint가 있으면 meters 영역에 표시
        if (state.errLabel) {
            meters.innerHTML = '<span style="color:#fca5a5;font-weight:700">' + state.errLabel + '</span>'
                + (state.errHint ? '  <span style="color:#9ca3af;font-size:11px">' + state.errHint + '</span>' : '');
            return;  // meters 덮어쓰기 후 아래 meters.textContent 건너뜀
        }
    } else if (state.done) {
        seq.style.color = '#6ee7b7';
        seq.textContent = (state.seq != null ? '#' + state.seq + '  ' : '') + '완료';
        card.style.background = '#064e3b';
        card.style.borderBottomColor = '#059669';
    } else {
        seq.style.color = '#fff';
        seq.textContent = state.seq != null ? '#' + state.seq : '';
        card.style.background = '#1e3a5f';
        card.style.borderBottomColor = '#2563eb';
    }

    // 철거 → 신설
    meters.textContent = (state.meter || '?') + '  →  ' + (state.newMeter || '?');

    // 6단계 진행 바
    steps.innerHTML = STAGE_LABELS.map(function (lbl, i) {
        const filled = state.stage != null && i <= state.stage;
        const isCurrent = state.stage === i && !state.done && !state.failed;
        const bg = filled
            ? (state.failed ? '#dc2626' : (state.done ? '#059669' : '#2563eb'))
            : '#374151';
        const bdr = isCurrent ? '2px solid #93c5fd' : '2px solid transparent';
        return '<div style="flex:1;text-align:center;padding:3px 0;border-radius:4px;'
            + 'background:' + bg + ';border:' + bdr + ';font-size:11px;font-weight:700">' + lbl + '</div>';
    }).join('');

    // 경과시간
    if (!state.startTs) {
        elapsed.textContent = '';
    } else {
        const sec = Math.round((Date.now() - state.startTs) / 1000);
        const stageLabel = (state.stage != null && !state.done && !state.failed)
            ? STAGE_LABELS[state.stage] + ' 중' : '';
        elapsed.textContent = stageLabel + (stageLabel ? ' · ' : '') + sec + '초 경과  (1건 평균 약 37초)';
    }
}

function _showProgress(meter, newMeter, seq, current, total) {
    _progressState = {
        meter: meter, newMeter: newMeter, seq: seq,
        current: current || 1, total: total || 1,
        stage: null, done: false, failed: false,
        startTs: Date.now(),
    };
    const card = _ensureProgressCard();
    card.style.display = 'block';
    _renderProgressCard();
    // 경과초 타이머 (중복 방지: clear-before-set)
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
    _progressTimer = setInterval(function () {
        if (_progressState) _renderProgressCard();
    }, 1000);
}

function _updateProgressCount(current, total, meter, newMeter, seq) {
    // 배치 루프 첫 건: _showProgress가 아직 호출 안 된 경우 여기서 초기화
    if (!_progressState) { _showProgress(meter, newMeter, seq, current, total); return; }
    _progressState.current = current;
    _progressState.total = total;
    _progressState.meter = meter;
    _progressState.newMeter = newMeter;
    _progressState.seq = seq;
    _progressState.stage = null;
    _progressState.done = false;
    _progressState.failed = false;
    _progressState.startTs = Date.now();
    _renderProgressCard();
}

function _doneProgress(ok, rawErrMsg) {
    if (!_progressState) return;
    if (ok) {
        _progressState.done = true;
        _progressState.stage = 5;
        _progressState.errLabel = null;
        _progressState.errHint = null;
    } else {
        _progressState.failed = true;
        if (rawErrMsg && typeof _friendlyError === 'function') {
            const fe = _friendlyError(rawErrMsg);
            _progressState.errLabel = fe.label;
            _progressState.errHint = fe.hint;
        }
    }
    _renderProgressCard();
}

function _hideProgress() {
    if (_progressTimer) { clearInterval(_progressTimer); _progressTimer = null; }
    _progressState = null;
    const card = document.getElementById('qprogress');
    if (card) card.style.display = 'none';
}

function _showProgressSummary(okCount, errCount) {
    if (!_progressState) {
        // 상태 없으면 임시 생성
        _progressState = { stage: null, done: true, failed: false, startTs: null };
    }
    const card = _ensureProgressCard();
    const count = document.getElementById('qp-count');
    const seq = document.getElementById('qp-seq');
    const meters = document.getElementById('qp-meters');
    const steps = document.getElementById('qp-steps');
    const elapsed = document.getElementById('qp-elapsed');
    if (count) count.textContent = '일괄 등록 완료';
    if (seq) { seq.textContent = '성공 ' + okCount + '건 / 실패 ' + errCount + '건'; seq.style.color = errCount > 0 ? '#fca5a5' : '#6ee7b7'; }
    if (meters) meters.textContent = errCount > 0 ? '실패 ' + errCount + '건 (상세는 각 카드/로그)' : '';
    if (steps) steps.innerHTML = '';
    if (elapsed) elapsed.textContent = '';
    card.style.display = 'block';
    card.style.background = errCount > 0 ? '#7c2d12' : '#064e3b';
    card.style.borderBottomColor = errCount > 0 ? '#dc2626' : '#059669';
}

// ─────────────────────────────────────────────
// log() 키워드 → _setStage 매핑 테이블
//   awms-saverow.js의 실제 log() 문자열 기반 (수정 없이 후킹)
// ─────────────────────────────────────────────
function _detectStageFromMsg(msg) {
    if (!msg) return -1;
    if (msg.indexOf('봉인조회') >= 0 || msg.indexOf('고객조회') >= 0 || msg.indexOf('작업목록') >= 0) return 0;
    if (msg.indexOf('사진 로드') >= 0) return 1;
    if (msg.indexOf('철거5000 POST') >= 0) return 2;
    if (msg.indexOf('getDetail') >= 0 || msg.indexOf('자재 MTRL_NO') >= 0) return 3;
    if (msg.indexOf('신설4000 POST') >= 0) return 4;
    if (msg.indexOf('완료28') >= 0) return 5;
    return -1;
}

// ─────────────────────────────────────────────
// 로그 헬퍼 (null-safe) — 화면 패널 + firebase 동시
// ─────────────────────────────────────────────
function log(msg, cls) {
    // 화면 패널에 출력 (처리상황 실시간 표시)
    try {
        const panel = _statusPanel();
        const body = document.getElementById('qstatus-body');
        if (body) {
            const d = document.createElement('div');
            const color = cls === 'err' ? '#f87171' : cls === 'ok' ? '#34d399' : cls === 'warn' ? '#fbbf24' : '#d1d5db';
            d.style.color = color;
            d.textContent = `${new Date().toLocaleTimeString('ko-KR', { hour12: false })} ${msg}`;
            body.appendChild(d);
            // 최근 40줄만 유지
            while (body.childNodes.length > 40) body.removeChild(body.firstChild);
            // [구현 1] 자동표출 제거 — 패널이 열려있을 때만 scrollTop 갱신
            if (panel.style.display === 'block') {
                panel.scrollTop = panel.scrollHeight;
            }
            // 에러 시 [로그] 버튼 빨갛게 깜빡임
            if (cls === 'err') {
                _flashLogBtn();
            }
        }
    } catch (e) {}

    // [구현 2] 진행 단계 감지 (DOM-only, 재귀 호출 없음)
    try {
        if (_progressState && !_progressState.done && !_progressState.failed) {
            const stageIdx = _detectStageFromMsg(msg);
            if (stageIdx >= 0) {
                // 단조 증가 보장: stage가 null이거나 감지한 단계가 현재보다 클 때만 갱신
                // (getDetail 재시도 로그가 상세(3)로 역행하는 것 방지 — 신설(4) 이후 getDetail 키워드 재등장)
                if (_progressState.stage == null || stageIdx > _progressState.stage) {
                    _setStage(stageIdx);
                }
            }
        }
    } catch (e) {}

    const el = document.getElementById('log');
    if (el) {
        const d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        el.appendChild(d);
        el.scrollTop = el.scrollHeight;
    }
    if (cls === 'err') console.error('[awms-queue]', msg);
    else console.log('[awms-queue]', msg);
    // firebase 통합 로그 — awms 페이지 아닌 곳(큐 웹뷰)의 로그도 남겨 saveRow 전 과정을 한곳에서 추적
    try {
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            firebase.database().ref('awmslog/queue').push({
                msg: String(msg), cls: cls || '', ts: Date.now(), iso: new Date().toISOString(),
            });
        }
    } catch (e) {}
}

// ─────────────────────────────────────────────
// awms 열기 — 네이티브 멀티웹뷰
// ─────────────────────────────────────────────
function openAwms() {
    if (window.AwmsQ && AwmsQ.openAwms) {
        AwmsQ.openAwms();
    } else {
        log('AwmsQ 브릿지 없음 — 웹 미리보기 모드', 'warn');
    }
}

// ─────────────────────────────────────────────
// 등록 실행 — registerReplacement 인터페이스에만 의존
//   (실제 구현은 awms-saverow.js 담당 — 준비 전엔 "saverow 모듈 준비중")
// ─────────────────────────────────────────────
async function runOne(addr, meter) {
    const item = _queue.find(i => i.addr === addr && i.meter === meter);
    if (!item) { log(`항목 못 찾음: ${addr} / ${meter}`, 'err'); return; }
    if (!isSessionOK()) {
        alert('awms 세션이 없습니다. [awms 열기]에서 로그인 후 시도하세요.');
        return;
    }
    log(`등록 시도: ${addr} / ${meter} → ${item.rep.new_meter_id}`);
    // 진행 카드 표시 (기존 _setBanner 대체)
    _showProgress(meter, item.rep.new_meter_id, item.rep.daily_seq, 1, 1);
    try {
        if (typeof registerReplacement !== 'function') {
            throw new Error('saverow 모듈 준비중 (awms-saverow.js 미로드)');
        }
        const resp = await registerReplacement({ addr, meter, rep: item.rep });
        log(`등록 성공: ${meter} (등록번호 ${resp.consTgtSeqno || '?'})`, 'ok');
        _doneProgress(true);
        if (typeof incrementProfileCount === 'function') incrementProfileCount();
        await markSynced(addr, meter, resp);
        markDoneLocal(meter, item.rep.new_meter_id);  // 즉시 완료 반영 (다음 수동 새로고침 전까지)
        // ★ 그 1건만 로컬 반영 — 전체 재조회(refreshQueue: awms 전차수+workStatus 3MB) 안 함.
        //   item.err=null 필수: 재등록 성공 시 옛 실패 메시지 잔존하면 '완료' 배지+빨간 에러 동시표시 버그.
        item.status = 'done';
        item.err = null;
        item.rep.awms_error = null;
        setTimeout(() => _hideProgress(), 5000);  // 성공 카드 5초 후 자동 숨김
    } catch (e) {
        log(`등록 실패 ${meter}: ${e.message}`, 'err');
        _doneProgress(false, e.message);
        setTimeout(() => _hideProgress(), 8000);  // 실패 카드 8초 후 자동 숨김
        await markError(addr, meter, e.message);
        item.status = 'err';
        item.err = e.message;
    }
    renderQueue();   // 그 1건만 갱신 반영 (전체 재조회는 수동 새로고침 버튼만)
}

async function runAll() {
    // 현재 선택한 날짜 필터의 대기+실패건 일괄 등록 (전체 선택 시 전부)
    const inView = (typeof _dateFilter !== 'undefined' && _dateFilter !== 'all' && typeof _dateKey === 'function')
        ? _queue.filter(i => _dateKey(i.rep.replaced_at) === _dateFilter)
        : _queue;
    const pending = inView.filter(i => (i.status === 'pending' || i.status === 'err') && !i.quarantine && !i.awmsDraft);
    const dateLabel = (typeof _dateFilter !== 'undefined' && _dateFilter !== 'all') ? _dateFilter : '전체';
    await _runBatch(pending, dateLabel);
}

// 선택 등록 — 체크박스로 고른 항목 전송 (상태 무관, done 제외)
async function runSelected() {
    const checks = Array.from(document.querySelectorAll('.q-check:checked'));
    if (!checks.length) { alert('선택된 항목이 없습니다. (시퀀스 앞 체크박스로 선택)'); return; }
    const keySet = new Set(checks.map(c => `${c.dataset.addr}${c.dataset.meter}`));
    const pending = _queue.filter(i => i.status !== 'done' && !i.quarantine && !i.awmsDraft && keySet.has(`${i.addr}${i.meter}`));
    await _runBatch(pending, '선택');
}
window.runSelected = runSelected;

// 공통 일괄 등록 루프 (runAll/runSelected 공유)
async function _runBatch(pending, label) {
    if (!pending.length) { alert(`[${label}] 등록할 대기/실패 건이 없습니다.`); return; }
    if (!isSessionOK()) { alert('awms 세션 없음. 로그인 먼저'); return; }
    if (typeof registerReplacement !== 'function') {
        alert('saverow 모듈 준비중 (awms-saverow.js 미로드). 일괄 등록 불가.');
        return;
    }
    if (!confirm(
        `[${label}] ${pending.length}건 일괄 등록할까요?\n` +
        `건당 ${Math.round(POST_DELAY_MIN / 1000)}~${Math.round(POST_DELAY_MAX / 1000)}초 텀, ` +
        `약 ${Math.round(pending.length * (POST_DELAY_MIN + POST_DELAY_MAX) / 2 / 60000)}분 소요`
    )) return;

    const btnAll = document.getElementById('btn-run-all');
    const btnSel = document.getElementById('btn-run-selected');
    const btnRefresh = document.getElementById('btn-refresh');
    if (btnAll) btnAll.disabled = true;
    if (btnSel) btnSel.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;

    // 백그라운드 서비스 시작 — 화면 꺼져도 루프 유지
    if (window.AwmsQ && AwmsQ.startBgTask) { try { AwmsQ.startBgTask(); } catch(e){} }

    // ★ 업로드 중 화면 슬립 방지 — 화면 꺼지면 awms webview가 freeze돼 등록이 멈추는 문제 회피.
    //   wakeLock은 화면 꺼짐/탭 숨김 시 자동 해제되므로 visibilitychange로 화면 복귀 시 재획득.
    let _wl = null;
    const _acquireWL = async () => {
        if (_wl && !_wl.released) return;
        try {
            if (navigator.wakeLock && navigator.wakeLock.request) {
                _wl = await navigator.wakeLock.request('screen');
                _wl.addEventListener && _wl.addEventListener('release', () => { _wl = null; });
            }
        } catch (e) { log('화면유지(wakeLock) 미지원/실패: ' + e.message, 'warn'); }
    };
    const _wlVis = () => { if (document.visibilityState === 'visible') _acquireWL(); };
    await _acquireWL();
    document.addEventListener('visibilitychange', _wlVis);

    let ok = 0, err = 0;
    try {
        for (const item of pending) {
            // 건별 진행 카드 갱신 (단계 초기화 포함)
            _updateProgressCount(ok + err + 1, pending.length, item.meter, item.rep.new_meter_id, item.rep.daily_seq);
            // 네이티브 알림 진행률 — 화면 꺼도 알림창에서 진행 확인 (영준님 요청)
            if (window.AwmsQ && AwmsQ.updateProgress) {
                try { AwmsQ.updateProgress(ok + err + 1, pending.length,
                    '#' + (item.rep.daily_seq || '') + ' ' + item.meter + '→' + item.rep.new_meter_id); } catch (e) {}
            }
            try {
                log(`[${ok + err + 1}/${pending.length}] ${item.meter} 등록 중...`);
                const resp = await registerReplacement({ addr: item.addr, meter: item.meter, rep: item.rep });
                await markSynced(item.addr, item.meter, resp);
                markDoneLocal(item.meter, item.rep.new_meter_id);  // 즉시 완료 반영
                item.status = 'done'; item.err = null; item.rep.awms_error = null;  // 그 1건만 로컬 반영
                if (typeof incrementProfileCount === 'function') incrementProfileCount();
                ok++;
                log(`  성공`, 'ok');
                _doneProgress(true);
            } catch (e) {
                err++;
                log(`  ${e.message}`, 'err');
                _doneProgress(false, e.message);
                await markError(item.addr, item.meter, e.message);
                item.status = 'err'; item.err = e.message;
            }
            renderQueue();   // ★ 매 건 직후 리스트 즉시 갱신 (영준님: 등록됐는데 리스트 변화 없음 — 끝까지 기다리지 말고 건별 반영)
            if ((ok + err) < pending.length) {
                log(`  ... 다음까지 대기`);
                await randomDelay();
                if ((ok + err) % 5 === 0) await checkSession();
            }
        }
        log(`일괄 완료: 성공 ${ok} / 실패 ${err}`, 'warn');
        _showProgressSummary(ok, err);
        setTimeout(() => _hideProgress(), 6000);
        renderQueue();   // 전체 재조회 대신 로컬 갱신 반영 (전체 새로고침은 수동 버튼만)
    } finally {
        // 정상 완료 / 에러 / 중단 어느 경우에도 화면유지 해제 + 서비스 종료 + 버튼 복구
        document.removeEventListener('visibilitychange', _wlVis);
        try { if (_wl && !_wl.released) await _wl.release(); } catch (e) {} _wl = null;
        if (window.AwmsQ && AwmsQ.stopBgTask) { try { AwmsQ.stopBgTask(); } catch(e){} }
        if (btnAll) btnAll.disabled = false;
        if (btnSel) btnSel.disabled = false;
        if (btnRefresh) btnRefresh.disabled = false;
    }
}

// 등록 사이 랜덤 대기 (봇 감지 회피)
function randomDelay() {
    const min = (typeof POST_DELAY_MIN === 'number') ? POST_DELAY_MIN : 8000;
    const max = (typeof POST_DELAY_MAX === 'number') ? POST_DELAY_MAX : 18000;
    const ms = min + Math.random() * (max - min);
    // 네이티브 구동 대기 — 앱 백그라운드(화면 꺼짐)에서도 진행되게(setTimeout은 throttle로 죽음)
    return (typeof nativeDelay === 'function') ? nativeDelay(ms) : new Promise(res => setTimeout(res, ms));
}

// ─────────────────────────────────────────────
// refreshQueue — 외부(버튼/네이티브) 노출
// ─────────────────────────────────────────────
window.refreshQueue = refreshQueue;

// ─────────────────────────────────────────────
// 초기화
// ─────────────────────────────────────────────
(async () => {
    // 비활성 버튼 비주얼 — disabled 시 흐리게(회색/반투명) 보이게 (영준님: 아이콘 비주얼적으로 비활성화).
    //   CSS에 :disabled 스타일이 없어 disabled여도 똑같이 보이던 것 보강.
    try {
        const _ds = document.createElement('style');
        _ds.textContent = 'button:disabled{opacity:.4;filter:grayscale(.85);cursor:not-allowed!important}';
        document.head.appendChild(_ds);
    } catch (e) {}
    log('AWMS Queue 시작 [JS:remote-r10 아이디선택]', 'ok');
    _ensureLogToggleBtn();
    _ensureIdSettingBtn();
    initFb();
    if (typeof loadSiteMap === 'function') await loadSiteMap();  // 도로명/계약정보 캐시(1회)

    // ── 캐시 즉시 렌더 — checkSession/refreshQueue 호출 전에 지난번 받은 화면을 먼저 그린다 ──
    // ★ 표시 전용: 등록(runOne/_runBatch/registerReplacement)은 항상 라이브(isSessionOK 가드 유지)
    try {
        const cachedCompleted = localStorage.getItem('awmsq_cache_completed');
        const cachedWs = localStorage.getItem('awmsq_cache_workstatus');
        if (cachedCompleted && cachedWs) {
            const completedArr = JSON.parse(cachedCompleted);
            const ws = JSON.parse(cachedWs);
            // 캐시 completed로 Set 채우기
            if (typeof _completedNewMeters !== 'undefined') {
                _completedNewMeters = new Set(completedArr);
            }
            // 캐시 draft25(awms 임시저장)로 Set 채우기 — 즉시렌더도 25를 실패로 표시
            const cachedDraft25 = localStorage.getItem('awmsq_cache_draft25');
            if (cachedDraft25 && typeof _awmsDraftMeters !== 'undefined') {
                _awmsDraftMeters = new Set(JSON.parse(cachedDraft25));
            }
            // 캐시 ws로 즉시 화면 그리기
            if (typeof _buildQueueFrom === 'function') {
                _buildQueueFrom(ws);
                log('캐시로 즉시 표시 — awms 갱신 중...', 'ok');
            }
        }
    } catch (e) {
        // 캐시 파싱 실패(손상/구버전) — 조용히 스킵하고 라이브로만
        log('캐시 즉시 렌더 스킵(파싱 오류): ' + e.message, 'warn');
    }

    await refreshQueue();   // refreshQueue 내부에서 checkSession 먼저 호출 (초기 자동입력은 여기서 — 세션없으면 checkSession이 ensureLoginAutofill 호출)
    // 5분마다 세션 체크 (큐 자동 새로고침은 안 함 — 수동/등록이벤트 후에만 갱신)
    setInterval(checkSession, 5 * 60 * 1000);
    // ★ 자동입력 주기 폴링 제거(영준님: 주기 필요없어, 초기나 새로고침때 확인).
    //   자동입력은 checkSession(초기 refreshQueue + 새로고침 버튼)이 세션없을 때 ensureLoginAutofill을 호출하는 경로로만.
    //   awms-bridge-inject도 awms webview page load 시 자체 자동입력하므로 충분.
})();

// 우상단 버전 표시 (새 배포 반영 확인용) — push마다 갱신
(function () {
    var APP_VER = 'v0626b-아이디선택';
    function show() {
        if (!document.body) { setTimeout(show, 300); return; }
        if (document.getElementById('app-ver')) return;
        var v = document.createElement('div');
        v.id = 'app-ver';
        v.textContent = APP_VER;
        v.style.cssText = 'position:fixed;top:6px;right:10px;z-index:99999;font-size:11px;font-weight:800;color:#9ca3af;background:rgba(0,0,0,0.35);padding:2px 8px;border-radius:6px;pointer-events:none;';
        document.body.appendChild(v);
    }
    show();
})();

