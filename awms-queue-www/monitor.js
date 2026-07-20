// ─────────────────────────────────────────────────────────────────────────
// 계기큐 — 데이터관리자 모니터 대시보드 (P2)
//   무거운 처리(검증·OCR·봉인계산·awms조회)는 전부 맥 백엔드가 수행.
//   폰은 맥 백엔드(tailnet)를 폴링해 보여주고, 조작은 트리거만 한다.
//   ★ base는 tailnet 고정 상수 — Firebase 자동발견/공개터널 사용 금지.
// ─────────────────────────────────────────────────────────────────────────
(function () {
    if (window.__monitorLoaded) return;   // 로컬 검증용 index.html + app.js 원격로드 이중 방지
    window.__monitorLoaded = true;

    var MONITOR_BASE = 'https://woodelight-imac.tail01244c.ts.net:8765';
    var DATASET = 'jongno';   // dataset 고정

    // ─────────────────────────────────────────────
    // KST 날짜 (YYYYMMDD) — /monitor/summary, /report 용
    // ─────────────────────────────────────────────
    function todayKST() {
        var s = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }); // "2026-07-20 13:45:10"
        return s.slice(0, 10).replace(/-/g, '');
    }

    function _mlog(msg, cls) {
        // 기존 app.js log()가 있으면 같이 남김(화면 로그패널+firebase), 없으면 콘솔만
        try { if (typeof log === 'function') { log('[모니터] ' + msg, cls); return; } } catch (e) {}
        if (cls === 'err') console.error('[monitor]', msg); else console.log('[monitor]', msg);
    }

    function mget(path) {
        return fetch(MONITOR_BASE + path, { cache: 'no-store' }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); });
            return r.json();
        });
    }
    function mpost(path, body) {
        return fetch(MONITOR_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        }).then(function (r) {
            if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + ' ' + t.slice(0, 200)); });
            return r.json();
        });
    }

    // ─────────────────────────────────────────────
    // 스타일 (mon- 네임스페이스 — 기존 화면 클래스와 충돌 방지)
    // ─────────────────────────────────────────────
    function ensureStyle() {
        if (document.getElementById('mon-style')) return;
        var st = document.createElement('style');
        st.id = 'mon-style';
        st.textContent = [
            '#monitor-view{--bg:#0f1216;--card:#1a1f26;--card2:#222933;--ink:#e8edf3;--ink2:#aab4c0;',
            '  --ink3:#6b7684;--line:#2c333d;--accent:#4a9eff;--accent-d:#2b6fd6;--ok:#3ecf8e;--warn:#f5a623;--bad:#ff5c5c;--radius:16px;',
            '  position:fixed;inset:0;z-index:150000;background:#05070a;color:var(--ink);',
            '  font-family:-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;overflow-y:auto;display:none;',
            '  padding-top:calc(14px + env(safe-area-inset-top));',
            '  padding-bottom:calc(24px + env(safe-area-inset-bottom));',
            '  padding-left:calc(12px + env(safe-area-inset-left));',
            '  padding-right:calc(12px + env(safe-area-inset-right));}',
            '#monitor-view *{box-sizing:border-box}',
            '#monitor-view .mon-top{display:flex;align-items:center;justify-content:space-between;padding:6px 6px 14px;gap:8px}',
            '#monitor-view .mon-brand{font-size:17px;font-weight:800;letter-spacing:-.3px}',
            '#monitor-view .mon-brand small{font-size:11px;font-weight:600;color:var(--ink3);margin-left:6px}',
            '#monitor-view .mon-top-actions{display:flex;align-items:center;gap:8px}',
            '#monitor-view .mon-conn{font-size:11px;color:var(--ok);display:flex;align-items:center;gap:5px}',
            '#monitor-view .mon-dot{width:8px;height:8px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok);flex-shrink:0}',
            '#monitor-view .mon-dot.warn{background:var(--warn);box-shadow:0 0 8px var(--warn)}',
            '#monitor-view .mon-dot.bad{background:var(--bad);box-shadow:0 0 8px var(--bad)}',
            '#monitor-view .mon-card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);',
            '  padding:14px;margin-bottom:11px;box-shadow:0 2px 8px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.03)}',
            '#monitor-view .mon-lbl{font-size:11px;font-weight:700;color:var(--ink3);letter-spacing:.2px;',
            '  margin-bottom:9px;display:flex;align-items:center;justify-content:space-between;gap:8px}',
            '#monitor-view .mon-cnt{color:var(--accent);font-weight:800}',
            '#monitor-view .mon-sess{display:flex;align-items:center;justify-content:space-between;gap:8px}',
            '#monitor-view .mon-sess .mon-acc{font-size:16px;font-weight:800}',
            '#monitor-view .mon-sess .mon-st{font-size:12px;color:var(--ok);display:flex;align-items:center;gap:6px;margin-top:3px}',
            '#monitor-view .mon-sess .mon-st.bad{color:var(--bad)}',
            '#monitor-view .mon-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
            '#monitor-view .mon-field{flex:1;min-width:90px}',
            '#monitor-view .mon-field .mon-v{font-size:20px;font-weight:800;letter-spacing:.5px;word-break:break-all}',
            '#monitor-view .mon-field .mon-k{font-size:10px;color:var(--ink3);margin-bottom:2px}',
            '#monitor-view .mon-btn{border:1px solid var(--line);background:var(--card2);color:var(--ink2);',
            '  font-size:12px;font-weight:700;padding:8px 12px;border-radius:11px;cursor:pointer;white-space:nowrap}',
            '#monitor-view .mon-btn:active{transform:scale(.96)}',
            '#monitor-view .mon-btn:disabled{opacity:.4;cursor:not-allowed}',
            '#monitor-view .mon-btn.pri{background:linear-gradient(180deg,var(--accent),var(--accent-d));color:#fff;border-color:transparent}',
            '#monitor-view .mon-sel{background:var(--card2);border:1px solid var(--line);color:var(--ink);',
            '  font-size:12px;font-weight:700;padding:8px 10px;border-radius:11px;flex:1;min-width:0;',
            '  appearance:none;background-image:none}',
            '#monitor-view .mon-two{display:flex;gap:9px}',
            '#monitor-view .mon-two > div{flex:1;min-width:0}',
            '#monitor-view .mon-two .mon-k{font-size:10px;color:var(--ink3);margin-bottom:4px}',
            '#monitor-view .mon-sub{font-size:10px;color:var(--ink3);margin-top:6px}',
            '#monitor-view .mon-item{display:flex;align-items:center;gap:8px;padding:10px 4px;border-bottom:1px solid var(--line)}',
            '#monitor-view .mon-item:last-child{border-bottom:0}',
            '#monitor-view .mon-chk{width:19px;height:19px;border-radius:6px;border:1.5px solid var(--ink3);flex-shrink:0;position:relative;cursor:pointer}',
            '#monitor-view .mon-chk.on{background:var(--accent);border-color:var(--accent)}',
            '#monitor-view .mon-chk.on::after{content:"";position:absolute;left:6px;top:2px;width:5px;height:10px;',
            '  border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}',
            '#monitor-view .mon-item .mon-addr{font-size:13px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '#monitor-view .mon-item .mon-mid{font-size:11px;color:var(--ink2);font-variant-numeric:tabular-nums;flex-shrink:0}',
            '#monitor-view .mon-item .mon-cha{font-size:11px;color:var(--ink3);width:34px;text-align:right;flex-shrink:0}',
            '#monitor-view .mon-listhead{display:flex;gap:9px;margin-top:12px}',
            '#monitor-view .mon-listhead .mon-btn{flex:1;text-align:center}',
            '#monitor-view .mon-listmore{font-size:11px;color:var(--ink3);text-align:center;padding-top:8px}',
            '#monitor-view .mon-prog{height:9px;background:var(--card2);border-radius:6px;overflow:hidden;margin:6px 0 9px}',
            '#monitor-view .mon-prog i{display:block;height:100%;width:0%;background:linear-gradient(90deg,var(--accent),var(--ok));border-radius:6px;transition:width .3s}',
            '#monitor-view .mon-plast{font-size:12px;color:var(--ink2);margin-bottom:8px;word-break:break-all}',
            '#monitor-view .mon-plast b{color:var(--ok)}',
            '#monitor-view .mon-pstat{display:flex;gap:14px;font-size:12px;color:var(--ink2);flex-wrap:wrap}',
            '#monitor-view .mon-pstat b{color:var(--ink);font-weight:800}',
            '#monitor-view .mon-sum{display:flex;gap:9px}',
            '#monitor-view .mon-sum > div{flex:1;background:var(--card2);border-radius:12px;padding:11px 8px;text-align:center}',
            '#monitor-view .mon-sum .mon-n{font-size:22px;font-weight:800}',
            '#monitor-view .mon-sum .mon-n.h{color:var(--warn)}',
            '#monitor-view .mon-nh{display:flex;align-items:center;justify-content:space-between;padding:2px;cursor:pointer}',
            '#monitor-view .mon-nh .mon-n{font-size:15px;font-weight:800;color:var(--warn)}',
            '#monitor-view .mon-nh-list{margin-top:10px;max-height:220px;overflow-y:auto;display:none}',
            '#monitor-view .mon-nh-row{font-size:12px;color:var(--ink2);padding:6px 2px;border-bottom:1px solid var(--line)}',
            '#monitor-view .mon-nh-row:last-child{border-bottom:0}',
            '#monitor-view .mon-caption{text-align:center;font-size:10px;color:var(--ink3);margin-top:14px;line-height:1.5}',
            // 봉인 수정 다이얼로그(clay 커스텀 — alert/confirm 대체)
            '.mon-dlg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200500;display:flex;align-items:center;justify-content:center;padding:16px}',
            '.mon-dlg-box{background:#1a1f26;color:#e8edf3;border:1px solid #2c333d;border-radius:16px;padding:18px;',
            '  width:100%;max-width:400px;box-shadow:0 8px 32px rgba(0,0,0,.6);font-family:-apple-system,sans-serif}',
            '.mon-dlg-title{font-size:15px;font-weight:800;margin-bottom:12px;color:#4a9eff}',
            '.mon-dlg-field{margin-bottom:10px}',
            '.mon-dlg-field label{display:block;font-size:11px;color:#6b7684;margin-bottom:4px}',
            '.mon-dlg-field input{width:100%;background:#222933;border:1px solid #2c333d;color:#e8edf3;',
            '  border-radius:10px;padding:9px 10px;font-size:14px;font-weight:700}',
            '.mon-dlg-actions{display:flex;gap:8px;margin-top:14px}',
            '.mon-dlg-actions button{flex:1;padding:10px;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer}',
            '.mon-dlg-cancel{background:#222933;color:#aab4c0}',
            '.mon-dlg-ok{background:linear-gradient(180deg,#4a9eff,#2b6fd6);color:#fff}',
            // 토스트(비차단 알림 — alert 대체)
            '.mon-toast{position:fixed;left:50%;transform:translateX(-50%);',
            '  bottom:calc(24px + env(safe-area-inset-bottom));z-index:210000;',
            '  background:rgba(20,24,30,.96);color:#e8edf3;font-size:12px;font-weight:600;',
            '  padding:10px 16px;border-radius:12px;max-width:88vw;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.5);',
            '  border:1px solid #2c333d}',
            '.mon-toast.err{border-color:#ff5c5c;color:#ffb3b3}',
        ].join('\n');
        document.head.appendChild(st);
    }

    // ─────────────────────────────────────────────
    // 토스트 / 다이얼로그 (alert·confirm 금지 대체)
    // ─────────────────────────────────────────────
    function _monToast(msg, kind) {
        try {
            var old = document.getElementById('mon-toast');
            if (old) old.remove();
            var t = document.createElement('div');
            t.id = 'mon-toast';
            t.className = 'mon-toast' + (kind === 'err' ? ' err' : '');
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(function () { if (t && t.parentNode) t.remove(); }, 3200);
        } catch (e) {}
    }

    function _monDialog(opts) {
        // opts: {title, fields:[{key,label,value}], onSubmit(vals)}
        var old = document.getElementById('mon-dlg-overlay');
        if (old) old.remove();
        var overlay = document.createElement('div');
        overlay.id = 'mon-dlg-overlay';
        overlay.className = 'mon-dlg-overlay';
        overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
        var box = document.createElement('div');
        box.className = 'mon-dlg-box';
        var title = document.createElement('div');
        title.className = 'mon-dlg-title';
        title.textContent = opts.title || '';
        box.appendChild(title);
        var inputs = {};
        (opts.fields || []).forEach(function (f) {
            var wrap = document.createElement('div');
            wrap.className = 'mon-dlg-field';
            var lb = document.createElement('label');
            lb.textContent = f.label;
            var inp = document.createElement('input');
            inp.type = f.type || 'text';
            inp.value = f.value != null ? f.value : '';
            if (f.inputmode) inp.setAttribute('inputmode', f.inputmode);
            wrap.appendChild(lb);
            wrap.appendChild(inp);
            box.appendChild(wrap);
            inputs[f.key] = inp;
        });
        var actions = document.createElement('div');
        actions.className = 'mon-dlg-actions';
        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'mon-dlg-cancel';
        cancelBtn.textContent = '취소';
        cancelBtn.onclick = function () { overlay.remove(); };
        var okBtn = document.createElement('button');
        okBtn.className = 'mon-dlg-ok';
        okBtn.textContent = '저장';
        okBtn.onclick = function () {
            var vals = {};
            Object.keys(inputs).forEach(function (k) { vals[k] = inputs[k].value; });
            overlay.remove();
            if (typeof opts.onSubmit === 'function') opts.onSubmit(vals);
        };
        actions.appendChild(cancelBtn);
        actions.appendChild(okBtn);
        box.appendChild(actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    // ─────────────────────────────────────────────
    // 상태
    // ─────────────────────────────────────────────
    var _lastConfig = null;        // 마지막 GET /transmit/config 결과 (POST 시 필드 보존용)
    var _busiListLoaded = false;   // busilist는 무거움 — 드롭다운 첫 오픈 1회만 로드
    var _pendingItems = [];        // 전체 pending items (전체 올려 payload용)
    var _pendingSelected = {};     // mid -> true (선택 올려)
    var _pollTimer = null;
    var _isOpen = false;
    var PENDING_RENDER_CAP = 100;  // 폰 성능 보호 — 화면엔 상위 N건만(전체 건수·전체올려는 정확)

    // ─────────────────────────────────────────────
    // 컨테이너 DOM
    // ─────────────────────────────────────────────
    function ensureContainer() {
        ensureStyle();
        var el = document.getElementById('monitor-view');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'monitor-view';
        el.innerHTML =
            '<div class="mon-top">' +
            '  <div class="mon-brand">계기큐 <small>데이터관리자 모니터</small></div>' +
            '  <div class="mon-top-actions">' +
            '    <div class="mon-conn" id="mon-conn"><span class="mon-dot" id="mon-conn-dot"></span>연결 확인 중</div>' +
            '    <button class="mon-btn" id="mon-btn-refresh-all">새로고침</button>' +
            '    <button class="mon-btn" id="mon-btn-close">닫기</button>' +
            '  </div>' +
            '</div>' +

            '<div class="mon-card">' +
            '  <div class="mon-lbl">세션</div>' +
            '  <div class="mon-sess">' +
            '    <div>' +
            '      <div class="mon-acc" id="mon-acc">-</div>' +
            '      <div class="mon-st" id="mon-sess-st"><span class="mon-dot" id="mon-sess-dot"></span>확인 중</div>' +
            '    </div>' +
            '    <button class="mon-btn" id="mon-btn-relogin">재로그인</button>' +
            '  </div>' +
            '</div>' +

            '<div class="mon-card">' +
            '  <div class="mon-lbl">봉인 · 차수' +
            '    <button class="mon-btn" id="mon-btn-snapshot" style="font-size:10px;padding:5px 8px">로그인 스냅샷 새로고침</button>' +
            '  </div>' +
            '  <div class="mon-row" style="margin-bottom:12px">' +
            '    <div class="mon-field">' +
            '      <div class="mon-k">봉인값(seal_last)</div>' +
            '      <div class="mon-v" id="mon-seal-last">-</div>' +
            '    </div>' +
            '    <button class="mon-btn" id="mon-btn-seal-edit">수정</button>' +
            '    <button class="mon-btn" id="mon-btn-seal-sync">동기화</button>' +
            '  </div>' +
            '  <div class="mon-two">' +
            '    <div>' +
            '      <div class="mon-k">등록 차수(cons_no)</div>' +
            '      <select class="mon-sel" id="mon-sel-cons"><option value="">-</option></select>' +
            '    </div>' +
            '    <div>' +
            '      <div class="mon-k">봉인 차수(seal_cons_no)</div>' +
            '      <select class="mon-sel" id="mon-sel-seal-cons"><option value="">-</option></select>' +
            '    </div>' +
            '  </div>' +
            '  <div class="mon-sub" id="mon-seal-sub">봉인 자릿수 - / 봉인공사 -</div>' +
            '</div>' +

            '<div class="mon-card">' +
            '  <div class="mon-lbl">검증완료 전송대기 <span class="mon-cnt" id="mon-pending-cnt">-건</span></div>' +
            '  <div id="mon-pending-list"><div class="mon-sub">불러오는 중...</div></div>' +
            '  <div class="mon-listhead">' +
            '    <button class="mon-btn" id="mon-btn-run-selected">선택 올려 (0)</button>' +
            '    <button class="mon-btn pri" id="mon-btn-run-all">전체 올려 (0)</button>' +
            '  </div>' +
            '</div>' +

            '<div class="mon-card">' +
            '  <div class="mon-lbl">올리는 상태 <span id="mon-job-status" style="color:var(--ink3)">대기 중</span></div>' +
            '  <div class="mon-prog"><i id="mon-job-prog" style="width:0%"></i></div>' +
            '  <div class="mon-plast" id="mon-job-last">-</div>' +
            '  <div class="mon-pstat">' +
            '    <span>전체 <b id="mon-job-total">-</b></span>' +
            '    <span>완료 <b id="mon-job-done">-</b></span>' +
            '    <span>성공 <b style="color:var(--ok)" id="mon-job-ok">-</b></span>' +
            '    <span>실패 <b style="color:var(--bad)" id="mon-job-fail">-</b></span>' +
            '  </div>' +
            '</div>' +

            '<div class="mon-card">' +
            '  <div class="mon-lbl">오늘 요약 (' + todayKST() + ')</div>' +
            '  <div class="mon-sum">' +
            '    <div><div class="mon-n" id="mon-sum-verified">-</div><div class="mon-sub" style="margin-top:2px">검증완료</div></div>' +
            '    <div><div class="mon-n" style="color:var(--ok)" id="mon-sum-sent">-</div><div class="mon-sub" style="margin-top:2px">전송</div></div>' +
            '    <div><div class="mon-n h" id="mon-sum-needhuman">-</div><div class="mon-sub" style="margin-top:2px">need_human</div></div>' +
            '  </div>' +
            '</div>' +

            '<div class="mon-card">' +
            '  <div class="mon-nh" id="mon-nh-toggle">' +
            '    <div class="mon-lbl" style="margin:0">사람 확인 대기</div>' +
            '    <div class="mon-n" id="mon-nh-count">- 건</div>' +
            '  </div>' +
            '  <div class="mon-nh-list" id="mon-nh-list"></div>' +
            '</div>' +

            '<div class="mon-caption">tailnet 맥 백엔드 폴링 — 전송은 [올려] 트리거만, 실전송(live)은 별도 관문에서 활성화됩니다.</div>';
        document.body.appendChild(el);

        // 이벤트 바인딩(1회)
        document.getElementById('mon-btn-close').onclick = closeMonitor;
        document.getElementById('mon-btn-refresh-all').onclick = function () { loadAll(); };
        document.getElementById('mon-btn-relogin').onclick = function () {
            if (window.openAwms) { window.openAwms(); }
            else _monToast('awms 브릿지 없음 — 웹 미리보기 모드', 'err');
        };
        document.getElementById('mon-btn-snapshot').onclick = onSnapshotRefreshClick;
        document.getElementById('mon-btn-seal-edit').onclick = onSealEditClick;
        document.getElementById('mon-btn-seal-sync').onclick = onSealSyncClick;
        document.getElementById('mon-btn-run-selected').onclick = function () { onRunClick(false); };
        document.getElementById('mon-btn-run-all').onclick = function () { onRunClick(true); };
        document.getElementById('mon-nh-toggle').onclick = function () {
            var l = document.getElementById('mon-nh-list');
            l.style.display = (l.style.display === 'block') ? 'none' : 'block';
        };
        var selCons = document.getElementById('mon-sel-cons');
        var selSealCons = document.getElementById('mon-sel-seal-cons');
        selCons.addEventListener('mousedown', ensureBusiListLoaded, { once: false });
        selSealCons.addEventListener('mousedown', ensureBusiListLoaded, { once: false });
        selCons.addEventListener('change', function () { onBusiSelectChange('cons_no', selCons.value); });
        selSealCons.addEventListener('change', function () { onBusiSelectChange('seal_cons_no', selSealCons.value); });

        return el;
    }

    // ─────────────────────────────────────────────
    // 연결상태 표시(dot)
    // ─────────────────────────────────────────────
    function _setConn(ok, msg) {
        var dot = document.getElementById('mon-conn-dot');
        var wrap = document.getElementById('mon-conn');
        if (!dot || !wrap) return;
        dot.className = 'mon-dot' + (ok ? '' : ' bad');
        wrap.lastChild.textContent = msg || (ok ? '맥 연결됨' : '연결 실패');
    }

    // ─────────────────────────────────────────────
    // 렌더 — 세션
    // ─────────────────────────────────────────────
    function renderSession(d) {
        var acc = document.getElementById('mon-acc');
        var st = document.getElementById('mon-sess-st');
        var dot = document.getElementById('mon-sess-dot');
        acc.textContent = d.account || '(계정 미확인)';
        if (d.alive) {
            st.className = 'mon-st';
            dot.className = 'mon-dot';
            st.lastChild.textContent = '로그인 살아있음';
        } else {
            st.className = 'mon-st bad';
            dot.className = 'mon-dot bad';
            st.lastChild.textContent = '재로그인 필요';
        }
    }

    // ─────────────────────────────────────────────
    // 렌더 — 봉인/차수
    // ─────────────────────────────────────────────
    function renderConfig(cfg) {
        _lastConfig = cfg || {};
        document.getElementById('mon-seal-last').textContent = cfg.seal_last || '-';
        var sub = '봉인 자릿수 ' + (cfg.seal_width || '-') + ' / 봉인공사 ' + (cfg.seal_cons_no || '-');
        document.getElementById('mon-seal-sub').textContent = sub;
        // busilist가 이미 로드돼 있으면 선택값만 동기화
        _syncBusiSelectValue('mon-sel-cons', cfg.cons_no);
        _syncBusiSelectValue('mon-sel-seal-cons', cfg.seal_cons_no);
    }

    function _syncBusiSelectValue(selId, val) {
        var sel = document.getElementById(selId);
        if (!sel) return;
        val = val || '';
        var has = Array.prototype.some.call(sel.options, function (o) { return o.value === val; });
        if (!has && val) {
            var opt = document.createElement('option');
            opt.value = val;
            opt.textContent = val + ' (목록 미확인)';
            sel.appendChild(opt);
        }
        sel.value = val;
    }

    // ─────────────────────────────────────────────
    // 렌더 — 검증완료 전송대기
    // ─────────────────────────────────────────────
    function renderPending(d) {
        _pendingItems = d.items || [];
        _pendingSelected = {};
        document.getElementById('mon-pending-cnt').textContent = (d.count || 0) + '건';
        var listEl = document.getElementById('mon-pending-list');
        if (!_pendingItems.length) {
            listEl.innerHTML = '<div class="mon-sub">전송대기 없음</div>';
        } else {
            var shown = _pendingItems.slice(0, PENDING_RENDER_CAP);
            listEl.innerHTML = shown.map(function (it, idx) {
                return '<div class="mon-item" data-idx="' + idx + '">' +
                    '<div class="mon-chk" data-idx="' + idx + '"></div>' +
                    '<div class="mon-addr">' + _esc(it.addr || '') + '</div>' +
                    '<div class="mon-mid">' + _esc(it.new_meter_id || it.mid || '') + '</div>' +
                    '<div class="mon-cha">' + _esc(it.cha != null ? it.cha + '차' : '-') + '</div>' +
                    '</div>';
            }).join('');
            if (_pendingItems.length > PENDING_RENDER_CAP) {
                var more = document.createElement('div');
                more.className = 'mon-listmore';
                more.textContent = '상위 ' + PENDING_RENDER_CAP + '건 표시 (전체 ' + _pendingItems.length + '건 — 전체 올려는 전체 대상)';
                listEl.appendChild(more);
            }
            Array.prototype.forEach.call(listEl.querySelectorAll('.mon-chk'), function (chk) {
                chk.onclick = function () {
                    var idx = Number(chk.getAttribute('data-idx'));
                    var it = shown[idx];
                    if (!it) return;
                    if (_pendingSelected[it.mid]) { delete _pendingSelected[it.mid]; chk.classList.remove('on'); }
                    else { _pendingSelected[it.mid] = true; chk.classList.add('on'); }
                    _updateRunButtons();
                };
            });
        }
        _updateRunButtons();
    }

    function _updateRunButtons() {
        var selCount = Object.keys(_pendingSelected).length;
        var allCount = _pendingItems.length;
        var selBtn = document.getElementById('mon-btn-run-selected');
        var allBtn = document.getElementById('mon-btn-run-all');
        selBtn.textContent = '선택 올려 (' + selCount + ')';
        allBtn.textContent = '전체 올려 (' + allCount + ')';
        selBtn.disabled = selCount === 0;
        allBtn.disabled = allCount === 0;
    }

    function _esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ─────────────────────────────────────────────
    // 렌더 — 올리는 상태 (active-job, 폴링)
    // ─────────────────────────────────────────────
    function renderActiveJob(d) {
        var statusEl = document.getElementById('mon-job-status');
        var prog = document.getElementById('mon-job-prog');
        var last = document.getElementById('mon-job-last');
        if (!d || d.status === 'idle' || !d.job_id) {
            statusEl.textContent = '대기 중';
            statusEl.style.color = 'var(--ink3)';
            prog.style.width = '0%';
            last.textContent = '-';
            document.getElementById('mon-job-total').textContent = '-';
            document.getElementById('mon-job-done').textContent = '-';
            document.getElementById('mon-job-ok').textContent = '-';
            document.getElementById('mon-job-fail').textContent = '-';
            return;
        }
        var running = d.status === 'running';
        statusEl.textContent = running ? '전송중' : (d.status || '-');
        statusEl.style.color = running ? 'var(--accent)' : (d.status === 'done' ? 'var(--ok)' : 'var(--ink2)');
        prog.style.width = (d.progress || 0) + '%';
        document.getElementById('mon-job-total').textContent = d.total != null ? d.total : '-';
        document.getElementById('mon-job-done').textContent = d.done != null ? d.done : '-';
        document.getElementById('mon-job-ok').textContent = d.ok_count != null ? d.ok_count : '-';
        document.getElementById('mon-job-fail').textContent = d.fail_count != null ? d.fail_count : '-';
        var logMsg = '-';
        if (d.last_log) {
            logMsg = (typeof d.last_log === 'string') ? d.last_log : (d.last_log.msg || JSON.stringify(d.last_log));
        }
        last.innerHTML = '방금: <b>' + _esc(logMsg) + '</b>';
    }

    // ─────────────────────────────────────────────
    // 렌더 — 오늘 요약
    // ─────────────────────────────────────────────
    function renderSummary(d) {
        document.getElementById('mon-sum-verified').textContent = d.verified_count != null ? d.verified_count : '-';
        document.getElementById('mon-sum-sent').textContent = d.sent_count != null ? d.sent_count : '-';
        document.getElementById('mon-sum-needhuman').textContent = d.need_human_count != null ? d.need_human_count : '-';
    }

    // ─────────────────────────────────────────────
    // 렌더 — need_human (report.all_groups["확인필요"])
    // ─────────────────────────────────────────────
    function renderNeedHuman(report) {
        var grp = (report && report.all_groups && report.all_groups['확인필요']) || { count: 0, items: [] };
        document.getElementById('mon-nh-count').textContent = grp.count + '건 ›';
        var listEl = document.getElementById('mon-nh-list');
        if (!grp.items || !grp.items.length) {
            listEl.innerHTML = '<div class="mon-nh-row">해당 건 없음</div>';
            return;
        }
        listEl.innerHTML = grp.items.slice(0, 100).map(function (it) {
            var idField = it.new_meter_id || it.old_meter_id || it.fid || '';
            return '<div class="mon-nh-row">' + _esc(it.mid || '') + (idField ? ' · ' + _esc(idField) : '') +
                ' <span style="color:var(--ink3)">(' + _esc(it.status_label || it.status || '') + ')</span></div>';
        }).join('');
    }

    // ─────────────────────────────────────────────
    // 로더
    // ─────────────────────────────────────────────
    function loadSession() {
        return mget('/transmit/session-direct').then(function (d) {
            _setConn(true);
            renderSession(d);
        }).catch(function (e) { _setConn(false, '연결 실패'); _mlog('세션 조회 실패: ' + e.message, 'err'); });
    }
    function loadConfig() {
        return mget('/transmit/config?dataset=' + DATASET).then(renderConfig)
            .catch(function (e) { _mlog('봉인/차수 조회 실패: ' + e.message, 'err'); });
    }
    function loadPending() {
        return mget('/monitor/pending?dataset=' + DATASET).then(renderPending)
            .catch(function (e) { _mlog('전송대기 조회 실패: ' + e.message, 'err'); });
    }
    function loadSummary() {
        return mget('/monitor/summary?dataset=' + DATASET + '&date=' + todayKST()).then(renderSummary)
            .catch(function (e) { _mlog('오늘 요약 조회 실패: ' + e.message, 'err'); });
    }
    function loadNeedHuman() {
        return mget('/report?dataset=' + DATASET + '&date=' + todayKST()).then(renderNeedHuman)
            .catch(function (e) { _mlog('need_human 조회 실패: ' + e.message, 'err'); });
    }
    function loadActiveJob() {
        return mget('/monitor/active-job?dataset=' + DATASET).then(renderActiveJob)
            .catch(function (e) { /* 폴링 중 조용히 실패 — 매번 로그하면 스팸 */ });
    }

    function loadAll() {
        loadSession();
        loadConfig();
        loadPending();
        loadSummary();
        loadNeedHuman();
        loadActiveJob();
    }

    // ─────────────────────────────────────────────
    // busilist(무거움 — 드롭다운 첫 오픈 1회만) — 등록/봉인 차수 선택지
    // ─────────────────────────────────────────────
    function ensureBusiListLoaded() {
        if (_busiListLoaded) return;
        _busiListLoaded = true;   // 재조회 방지(요청 진행 중에도 재클릭 무시) — 실패 시 아래서 되돌림
        var selCons = document.getElementById('mon-sel-cons');
        var selSealCons = document.getElementById('mon-sel-seal-cons');
        [selCons, selSealCons].forEach(function (s) {
            s.innerHTML = '<option value="">불러오는 중...</option>';
        });
        mget('/transmit/busilist?dataset=' + DATASET).then(function (d) {
            var list = d.list || [];
            [selCons, selSealCons].forEach(function (s) {
                s.innerHTML = '<option value="">선택 안 함</option>' + list.map(function (it) {
                    return '<option value="' + _esc(it.cons_no) + '">' + _esc(it.cons_no) + (it.name ? ' (' + _esc(it.name) + ')' : '') + '</option>';
                }).join('');
            });
            _syncBusiSelectValue('mon-sel-cons', _lastConfig && _lastConfig.cons_no);
            _syncBusiSelectValue('mon-sel-seal-cons', _lastConfig && _lastConfig.seal_cons_no);
        }).catch(function (e) {
            _busiListLoaded = false;   // 실패 시 다음 오픈에서 재시도 허용
            [selCons, selSealCons].forEach(function (s) { s.innerHTML = '<option value="">불러오기 실패</option>'; });
            _monToast('차수 목록 조회 실패: ' + e.message, 'err');
        });
    }

    function onBusiSelectChange(field, value) {
        if (!_lastConfig) return;
        var body = _configBodyFrom(_lastConfig);
        body[field] = value;
        mpost('/transmit/config', body).then(function (r) {
            renderConfig(r.config || body);
            _monToast(field === 'cons_no' ? '등록 차수 저장됨' : '봉인 차수 저장됨');
        }).catch(function (e) { _monToast('차수 저장 실패: ' + e.message, 'err'); });
    }

    // 현재 config를 기준으로 POST 바디 구성(누락 필드가 서버에서 빈값으로 덮이는 것 방지)
    function _configBodyFrom(cfg) {
        return {
            dataset: DATASET,
            cons_no: cfg.cons_no || '',
            seal_cons_no: cfg.seal_cons_no || '',
            seal_last: cfg.seal_last || '',
            seal_width: cfg.seal_width || 0,
            accounts: cfg.accounts || [],
        };
    }

    // ─────────────────────────────────────────────
    // 봉인 [수정] — clay 다이얼로그
    // ─────────────────────────────────────────────
    function onSealEditClick() {
        var cur = _lastConfig || {};
        _monDialog({
            title: '봉인값 수정',
            fields: [
                { key: 'seal_last', label: '봉인값(seal_last)', value: cur.seal_last || '' },
                { key: 'seal_width', label: '자릿수(seal_width, 0=자동)', value: cur.seal_width || 0, inputmode: 'numeric' },
            ],
            onSubmit: function (vals) {
                var body = _configBodyFrom(cur);
                body.seal_last = vals.seal_last || '';
                body.seal_width = parseInt(vals.seal_width, 10) || 0;
                mpost('/transmit/config', body).then(function (r) {
                    renderConfig(r.config || body);
                    _monToast('봉인값 저장됨');
                }).catch(function (e) { _monToast('봉인 저장 실패: ' + e.message, 'err'); });
            },
        });
    }

    // ─────────────────────────────────────────────
    // 봉인 [동기화]
    // ─────────────────────────────────────────────
    function onSealSyncClick() {
        var btn = document.getElementById('mon-btn-seal-sync');
        btn.disabled = true;
        mpost('/transmit/seal-sync?dataset=' + DATASET, {}).then(function (r) {
            _monToast(r.ok ? ('봉인 동기화 완료: ' + r.saved_seal) : '봉인 동기화 실패');
            loadConfig();
        }).catch(function (e) {
            _monToast('봉인 동기화 실패: ' + e.message, 'err');
        }).then(function () { btn.disabled = false; });
    }

    // ─────────────────────────────────────────────
    // 로그인 스냅샷 새로고침(무거움 — 수동 버튼에서만)
    // ─────────────────────────────────────────────
    function onSnapshotRefreshClick() {
        var btn = document.getElementById('mon-btn-snapshot');
        btn.disabled = true;
        var account = (_lastConfig && _lastConfig.accounts && _lastConfig.accounts[0] && _lastConfig.accounts[0].id) || '';
        mpost('/transmit/login-snapshot?dataset=' + DATASET + '&account=' + encodeURIComponent(account), {}).then(function (r) {
            _monToast(r.seal_mismatch ? '봉인 불일치 감지 — [동기화] 확인' : '로그인 스냅샷 갱신됨');
            loadConfig();
        }).catch(function (e) {
            _monToast('스냅샷 조회 실패: ' + e.message, 'err');
        }).then(function () { btn.disabled = false; });
    }

    // ─────────────────────────────────────────────
    // [선택 올려] / [전체 올려] — ★배선검증 모드
    //   실제 awms 전송(POST /transmit/run)은 트리거하지 않는다.
    //   요청 바디 조립까지만 구현하고 콘솔/토스트로 확인만 시킨다.
    //   실 전송 활성화는 P4에서 live:true로 전환.
    // ─────────────────────────────────────────────
    function onRunClick(useAll) {
        var items = useAll ? _pendingItems : _pendingItems.filter(function (it) { return _pendingSelected[it.mid]; });
        if (!items.length) { _monToast('선택된 건이 없습니다', 'err'); return; }
        var account = (_lastConfig && _lastConfig.accounts && _lastConfig.accounts[0] && _lastConfig.accounts[0].id) || '';
        var payload = {
            dataset: DATASET,
            assignments: items.map(function (it) {
                return { mid: it.mid, addr: it.addr, account: account };
            }),
            live: false,          // ★ P4에서 live:true 활성화 — 지금은 절대 실전송 트리거 금지
            exec_mode: 'direct',
            verify: true,
        };
        console.log('[monitor] /transmit/run payload (배선검증 — 미전송):', payload);
        _mlog('배선검증: /transmit/run 바디 조립 완료 (' + items.length + '건, live:false — 미전송)');
        _monToast('배선검증 모드 — ' + items.length + '건 실제 전송 안 함', 'ok');

        // ── 실전송(P4)에서 아래 주석 해제 + live:true로 전환 ──────────────────────
        // mpost('/transmit/run', Object.assign({}, payload, { live: true })).then(function (r) {
        //     _monToast('전송 잡 시작: ' + r.job_id);
        //     loadActiveJob();
        // }).catch(function (e) { _monToast('전송 실패: ' + e.message, 'err'); });
    }

    // ─────────────────────────────────────────────
    // 폴링 — active-job만 2.5초 (화면 보일 때만)
    // ─────────────────────────────────────────────
    function startPolling() {
        stopPolling();
        _pollTimer = setInterval(function () {
            if (_isOpen && document.visibilityState !== 'hidden') loadActiveJob();
        }, 2500);
    }
    function stopPolling() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    }
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') stopPolling();
        else if (_isOpen) startPolling();
    });

    // ─────────────────────────────────────────────
    // 열기/닫기
    // ─────────────────────────────────────────────
    function openMonitor() {
        var el = ensureContainer();
        el.style.display = 'block';
        _isOpen = true;
        loadAll();
        startPolling();
    }
    function closeMonitor() {
        var el = document.getElementById('monitor-view');
        if (el) el.style.display = 'none';
        _isOpen = false;
        stopPolling();
    }
    window.openMonitor = openMonitor;
    window.closeMonitor = closeMonitor;

    // ─────────────────────────────────────────────
    // 진입 버튼 — 기존 액션 버튼 행(#btn-refresh 옆)에 추가.
    //   못 찾으면(마크업 변경 대비) 우하단 고정 버튼으로 폴백 — 기존 [로그]/[아이디 설정]과 겹치지 않게 스택.
    // ─────────────────────────────────────────────
    function ensureEntryButton() {
        if (document.getElementById('mon-entry-btn')) return;
        var refreshBtn = document.getElementById('btn-refresh');
        if (refreshBtn && refreshBtn.parentElement) {
            var btn = document.createElement('button');
            btn.id = 'mon-entry-btn';
            btn.className = 'btn-secondary';
            btn.style.cssText = 'flex:0 0 64px;width:64px';
            btn.textContent = '모니터';
            btn.onclick = openMonitor;
            refreshBtn.parentElement.appendChild(btn);
            return;
        }
        // 폴백 — 고정 버튼(기존 [로그]bottom:56/[아이디 설정]bottom:96 위에 스택)
        var fbtn = document.createElement('button');
        fbtn.id = 'mon-entry-btn';
        fbtn.textContent = '[모니터]';
        fbtn.style.cssText = 'position:fixed;right:10px;bottom:136px;z-index:100001;'
            + 'padding:5px 10px;font-size:11px;font-weight:700;'
            + 'background:#1e3a5f;color:#93c5fd;border:1px solid #2563eb;border-radius:8px;cursor:pointer;'
            + 'box-shadow:0 2px 8px rgba(0,0,0,.4);';
        fbtn.onclick = openMonitor;
        if (!document.body) { setTimeout(ensureEntryButton, 300); return; }
        document.body.appendChild(fbtn);
    }

    if (document.body) ensureEntryButton();
    else document.addEventListener('DOMContentLoaded', ensureEntryButton);
})();
