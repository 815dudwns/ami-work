// datapush.js — ami-work DataPush 수집 모달 (1단계: 수집 → Firebase datapush_queue)
// 설계: research/datapush-design.md
// 함체 단위 수집. 시설유형(단독10/집합단독40/집합기본20/집합추가30) 자동 산출.
// 전송(saveAct)·예약·EXIF는 2단계(큐앱). 여기선 수집만.

(function () {
  'use strict';

  // ── 상태 ──────────────────────────────────────────────
  // dp.meters: [{no, type}]  그 주소 전체 계기
  // dp.boxes: [{ hamType:'단독'|'집합', masters:[{meterNo, mac, comm, slaves:[no], photos:{pre,mac,post1,post2}}] }]
  let dp = { addr: '', meters: [], boxes: [] };

  const COMM_OPTS = [
    ['', '통신방식 선택'],
    ['ks-plc', 'KS-PLC'],
    ['hpgp', 'HPGP'],
    ['lte_IV', 'LTE'],
    ['k-dcu', 'K-DCU (IoT-PLC)'],
    ['smgw-c', 'SMGW-C (아미고)'],
  ];

  // ── 진입 ──────────────────────────────────────────────
  function openDataPush() {
    if (typeof currentAddress === 'undefined' || !currentAddress) { alert('주소가 없습니다.'); return; }
    const raw = (typeof getMetersWithAdded === 'function') ? getMetersWithAdded() : (currentMeters || []);
    dp.addr = currentAddress;
    dp.meters = raw.map(m => ({
      no: m.계기번호,
      type: (typeof parseType === 'function' ? parseType(m.계기번호) : null) || m.계기타입 || '?',
      commHint: m.통신방식 || '',
    }));
    // 기본: 함체 1개(단독형), 마스터 0개 — 작업자가 계기 배치
    dp.boxes = [{ hamType: '단독', masters: [] }];
    render();
    document.getElementById('datapush-overlay').style.display = 'flex';
  }
  window.openDataPush = openDataPush;

  function closeDataPush() {
    document.getElementById('datapush-overlay').style.display = 'none';
  }
  window.closeDataPush = closeDataPush;

  // ── 배치 상태 헬퍼 ────────────────────────────────────
  function placedSet() {
    const s = new Set();
    dp.boxes.forEach(b => b.masters.forEach(m => {
      s.add(m.meterNo);
      m.slaves.forEach(sl => s.add(sl));
    }));
    return s;
  }
  function unplaced() {
    const ps = placedSet();
    return dp.meters.filter(m => !ps.has(m.no));
  }
  function typeOf(no) {
    const m = dp.meters.find(x => x.no === no);
    return m ? m.type : '?';
  }
  function commHintOf(no) {
    const m = dp.meters.find(x => x.no === no);
    return m ? m.commHint : '';
  }

  // ── 시설유형 산출 ─────────────────────────────────────
  // 단독함체: 슬래이브0=단독형(10) / 슬래이브1+=집합형단독(40)
  // 집합함체: 첫마스터=집합형기본(20) / 추가마스터=집합형추가(30)
  function fcltyOf(box, mIdx) {
    const m = box.masters[mIdx];
    if (box.hamType === '단독') return m.slaves.length ? ['40', '집합형단독'] : ['10', '단독형'];
    return mIdx === 0 ? ['20', '집합형기본'] : ['30', '집합형추가'];
  }
  function mbCntOf(box, mIdx) {
    // 함내계기수 = 그 마스터그룹(마스터+슬래이브) 수. 단독형(10)은 비움.
    const [code] = fcltyOf(box, mIdx);
    if (code === '10') return '';
    return String(1 + box.masters[mIdx].slaves.length);
  }

  // ── 렌더 ──────────────────────────────────────────────
  function render() {
    const root = document.getElementById('datapush-body');
    if (!root) return;
    const up = unplaced();

    let html = `<div style="font-size:13px;color:#6b7280;margin-bottom:6px;">${esc(dp.addr)}</div>`;

    // 미배치 계기 풀
    html += `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-bottom:10px;">
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">미배치 계기 ${up.length}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">`;
    if (!up.length) html += `<span style="font-size:12px;color:#9ca3af;">전부 배치됨</span>`;
    up.forEach(m => {
      html += `<span style="font-size:12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:3px 7px;">
        ${esc(m.no)} <b style="color:#2563eb;">${esc(m.type)}</b></span>`;
    });
    html += `</div></div>`;

    // 함체들
    dp.boxes.forEach((box, bi) => {
      html += renderBox(box, bi, up);
    });

    html += `<button onclick="__dp.addBox()" style="width:100%;padding:10px;margin-top:4px;background:#eef2ff;color:#4338ca;border:1px dashed #a5b4fc;border-radius:8px;font-weight:700;">+ 함체 추가</button>`;

    root.innerHTML = html;
  }

  function renderBox(box, bi, up) {
    let h = `<div style="border:2px solid #c7d2fe;border-radius:10px;padding:10px;margin-bottom:10px;">`;
    // 함체 헤더: 단독/집합 토글 + 삭제
    h += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-weight:700;color:#3730a3;">함체 ${bi + 1}</div>
      <div style="display:flex;gap:4px;align-items:center;">
        ${segBtn(box.hamType === '단독', `__dp.setHam(${bi},'단독')`, '단독형')}
        ${segBtn(box.hamType === '집합', `__dp.setHam(${bi},'집합')`, '집합형')}
        ${dp.boxes.length > 1 ? `<button onclick="__dp.delBox(${bi})" style="margin-left:6px;background:#fee2e2;color:#b91c1c;border:none;border-radius:6px;padding:4px 8px;font-size:12px;">함체삭제</button>` : ''}
      </div>
    </div>`;

    // 마스터들
    box.masters.forEach((m, mi) => {
      h += renderMaster(box, bi, mi, up);
    });

    // 마스터 추가 (미배치 계기에서)
    h += `<div style="margin-top:6px;">${addMasterSelect(bi, up)}</div>`;
    h += `</div>`;
    return h;
  }

  function renderMaster(box, bi, mi, up) {
    const m = box.masters[mi];
    const [code, label] = fcltyOf(box, mi);
    const mbc = mbCntOf(box, mi);
    let h = `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:6px;">`;
    h += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
      <div><b>마스터</b> ${esc(m.meterNo)} <span style="color:#2563eb;">${esc(typeOf(m.meterNo))}</span></div>
      <button onclick="__dp.unMaster(${bi},${mi})" style="background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;padding:3px 7px;font-size:11px;">해제</button>
    </div>`;
    // 시설유형/함내계기수 자동
    h += `<div style="font-size:12px;color:#475569;margin-bottom:6px;">
      시설유형 <b>${label}(${code})</b>${mbc ? ` · 함내계기수 <b>${mbc}</b>` : ' · 대표계기·함내계기수 없음'}</div>`;
    // 모뎀맥 + QR + 통신방식
    h += `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input value="${esc(m.mac || '')}" oninput="__dp.setMac(${bi},${mi},this.value)" placeholder="모뎀맥"
        style="flex:1;min-width:0;padding:7px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
      <button onclick="__dp.scanMac(${bi},${mi})" style="background:#0ea5e9;color:#fff;border:none;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">QR</button>
    </div>`;
    h += `<select onchange="__dp.setComm(${bi},${mi},this.value)" style="width:100%;padding:7px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;margin-bottom:6px;">`;
    COMM_OPTS.forEach(([v, t]) => {
      h += `<option value="${v}" ${m.comm === v ? 'selected' : ''}>${t}</option>`;
    });
    h += `</select>`;
    const hint = commHintOf(m.meterNo);
    if (hint && !m.comm) h += `<div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">참고(site-data): ${esc(hint)}</div>`;

    // 슬래이브 묶기 (미배치 계기 체크)
    const cand = up.filter(x => x.no !== m.meterNo);
    if (cand.length || m.slaves.length) {
      h += `<div style="font-size:12px;font-weight:700;color:#374151;margin:6px 0 4px;">슬래이브 묶기</div><div style="display:flex;flex-wrap:wrap;gap:4px;">`;
      // 이미 묶인 슬래이브
      m.slaves.forEach(sl => {
        h += `<span onclick="__dp.toggleSlave(${bi},${mi},'${sl}')" style="cursor:pointer;font-size:12px;background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:3px 7px;">
          ${esc(sl)} <b style="color:#16a34a;">${esc(typeOf(sl))}</b> ×</span>`;
      });
      // 후보(미배치)
      cand.forEach(c => {
        h += `<span onclick="__dp.toggleSlave(${bi},${mi},'${c.no}')" style="cursor:pointer;font-size:12px;background:#fff;border:1px dashed #cbd5e1;border-radius:6px;padding:3px 7px;">
          + ${esc(c.no)} ${esc(c.type)}</span>`;
      });
      h += `</div>`;
    }

    // 사진 4종
    h += `<div style="font-size:12px;font-weight:700;color:#374151;margin:8px 0 4px;">사진</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
        ${photoSlot(bi, mi, 'pre', '시공전', m.photos.pre)}
        ${photoSlot(bi, mi, 'mac', '모뎀맥', m.photos.mac)}
        ${photoSlot(bi, mi, 'post1', '시공후1', m.photos.post1)}
        ${photoSlot(bi, mi, 'post2', '시공후2', m.photos.post2)}
      </div>`;
    h += `</div>`;
    return h;
  }

  function photoSlot(bi, mi, key, label, val) {
    const inputId = `dpph_${bi}_${mi}_${key}`;
    const bg = val
      ? `background-image:url('${val}');background-size:cover;background-position:center;`
      : 'background:#f3f4f6;';
    return `<div style="text-align:center;">
      <label for="${inputId}" style="display:block;aspect-ratio:1;border-radius:8px;border:1px solid #e5e7eb;${bg}cursor:pointer;position:relative;">
        ${val ? '' : '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#9ca3af;font-size:20px;">+</span>'}
      </label>
      <input id="${inputId}" type="file" accept="image/*" style="display:none;" onchange="__dp.pickPhoto(${bi},${mi},'${key}',this)">
      <div style="font-size:10px;color:#6b7280;margin-top:2px;">${label}</div>
    </div>`;
  }

  function addMasterSelect(bi, up) {
    if (!up.length) return `<span style="font-size:12px;color:#9ca3af;">미배치 계기 없음</span>`;
    let h = `<select id="dp_addm_${bi}" style="padding:7px;border:1px solid #c7d2fe;border-radius:6px;font-size:13px;">
      <option value="">계기 선택</option>`;
    up.forEach(m => { h += `<option value="${m.no}">${esc(m.no)} ${esc(m.type)}</option>`; });
    h += `</select> <button onclick="__dp.addMaster(${bi})" style="background:#4f46e5;color:#fff;border:none;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:700;">+ 마스터로</button>`;
    return h;
  }

  function segBtn(active, onclick, label) {
    return `<button onclick="${onclick}" style="padding:5px 10px;font-size:12px;border-radius:6px;border:1px solid ${active ? '#4f46e5' : '#cbd5e1'};background:${active ? '#4f46e5' : '#fff'};color:${active ? '#fff' : '#475569'};font-weight:${active ? '700' : '400'};">${label}</button>`;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── 액션 ──────────────────────────────────────────────
  const actions = {
    addBox() { dp.boxes.push({ hamType: '단독', masters: [] }); render(); },
    delBox(bi) { dp.boxes.splice(bi, 1); if (!dp.boxes.length) dp.boxes.push({ hamType: '단독', masters: [] }); render(); },
    setHam(bi, t) { dp.boxes[bi].hamType = t; render(); },
    addMaster(bi) {
      const sel = document.getElementById('dp_addm_' + bi);
      const no = sel && sel.value;
      if (!no) return;
      dp.boxes[bi].masters.push({ meterNo: no, mac: '', comm: '', slaves: [], photos: {} });
      render();
    },
    unMaster(bi, mi) { dp.boxes[bi].masters.splice(mi, 1); render(); },
    setMac(bi, mi, v) { dp.boxes[bi].masters[mi].mac = v.trim(); },
    setComm(bi, mi, v) { dp.boxes[bi].masters[mi].comm = v; },
    toggleSlave(bi, mi, no) {
      const sl = dp.boxes[bi].masters[mi].slaves;
      const i = sl.indexOf(no);
      if (i >= 0) sl.splice(i, 1); else sl.push(no);
      render();
    },
    scanMac(bi, mi) {
      if (typeof QrScanner === 'undefined') { alert('QR 스캐너 로드 실패'); return; }
      QrScanner.show((text) => {
        const raw = String(text || '').replace(/\*/g, '');
        const parsed = (typeof parseValue === 'function') ? parseValue(raw) : { value: raw };
        dp.boxes[bi].masters[mi].mac = String(parsed.value || raw);
        render();
      });
    },
    async pickPhoto(bi, mi, key, input) {
      const f = input.files && input.files[0];
      if (!f) return;
      try {
        const url = await compressImage(f, 1280, 0.8);
        dp.boxes[bi].masters[mi].photos[key] = url;
        render();
      } catch (e) { alert('사진 처리 실패: ' + e.message); }
    },
    save: saveDP,
    close: closeDataPush,
  };
  window.__dp = actions;

  // ── 사진 압축 (앨범 선택 — capture 안 씀) ───────────────
  function compressImage(file, maxW, q) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width: w, height: h } = img;
          if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          res(c.toDataURL('image/jpeg', q));
        };
        img.onerror = () => rej(new Error('이미지 로드 실패'));
        img.src = r.result;
      };
      r.onerror = () => rej(new Error('파일 읽기 실패'));
      r.readAsDataURL(file);
    });
  }

  // ── 저장 → Firebase datapush_queue ────────────────────
  async function saveDP() {
    // 검증
    let masterCnt = 0;
    for (const box of dp.boxes) masterCnt += box.masters.length;
    if (!masterCnt) { alert('마스터를 1개 이상 지정하세요.'); return; }
    for (const box of dp.boxes) {
      for (const m of box.masters) {
        if (!m.mac) { alert(`마스터 ${m.meterNo}의 모뎀맥을 입력하세요.`); return; }
      }
    }

    const session = (typeof authGetSession === 'function') ? authGetSession() : null;
    const payload = {
      addr: dp.addr,
      createdAt: (typeof isoKst === 'function') ? isoKst() : new Date().toISOString(),
      createdBy: session ? session.id : '',
      createdByName: session ? session.name : '',
      status: 'pending',           // 큐앱이 전송하면 sent
      boxes: dp.boxes.map(box => ({
        hamType: box.hamType,
        masters: box.masters.map((m, mi) => {
          const [code, label] = fcltyOf(box, mi);
          return {
            meterNo: m.meterNo,
            meterType: typeOf(m.meterNo),
            mac: m.mac,
            comm: m.comm || '',
            fcltyDiv: code,          // 시설유형 코드
            fcltyLabel: label,
            mbCnt: mbCntOf(box, mi), // 함내계기수(단독형은 '')
            mbMeterId: code === '10' ? '' : m.meterNo,  // 대표계기(단독형 비움)
            slaves: m.slaves.map(no => ({ meterNo: no, meterType: typeOf(no) })),
            photos: m.photos || {},
          };
        }),
      })),
    };

    const btn = document.getElementById('dp-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    try {
      const ref = firebase.database().ref('datapush_queue').push();
      await ref.set(payload);
      alert('큐에 저장됐습니다.');
      closeDataPush();
    } catch (e) {
      alert('저장 실패: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '큐에 담기'; }
    }
  }
})();
