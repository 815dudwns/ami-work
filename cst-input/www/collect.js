// collect.js — 통신팀 입력 플로우 (사진수집 → OCR → 맥수집 → 계기번호 확인 → saveAct)
// API_BASE/apiFetch/$/showToast 는 settings.js 전역 재사용.
const CST = {
  master: { photos: {}, meterNo: '', mac: '', instM: 'HW4050' }, // photos:{3,4,5,6} base64
  slaves: [],          // [{photo5, meterNo}]
  confirmQueue: [], confirmIdx: 0,
  commAuto: null, commSuffix: '',   // 통신방식 자동판별결과 / 직접선택값(미상시)
};
const MASTER_SLOTS = [
  { k: '3', lbl: '작업전' }, { k: '4', lbl: '모뎀맥' },
  { k: '5', lbl: '시공후 계기' }, { k: '6', lbl: '시공후 집합' },
];

// 통신방식 코드표(백엔드 COMM_SUFFIX_LABELS 동일) + 계기유형 판별(백엔드 _TYPE_MAP 동일)
const COMM_LABELS = { '10': 'KS-PLC', '20': 'HPGP', '40': 'LTE', '70': 'LTE_IV', '80': 'IoT-PLC', '90': 'K-DCU', '92': 'SMGW-C(아미고)' };
const TYPE_MAP = { '17': 'E', '19': 'EA', '25': 'G', '26': 'G', '27': 'G', '45': 'G', '46': 'G', '47': 'G', '53': 'Amigo', '55': 'Amigo' };
function isAmigo(meterNo) { return TYPE_MAP[String(meterNo || '').padStart(11, '0').slice(2, 4)] === 'Amigo'; }
// 마스터 통신방식 suffix: 직접선택 우선 → 자동판별(LTE는 마스터 계기유형으로 92/70 확정)
function masterSuffix() {
  if (CST.commSuffix) return CST.commSuffix;
  const a = CST.commAuto;
  if (!a || !a.suffix) return '';
  if (a.suffix === 'LTE') return isAmigo(CST.master.meterNo) ? '92' : '70';
  return a.suffix;
}
function commLabelOf(suf) { return suf ? (COMM_LABELS[suf] || suf) : ((CST.commAuto && CST.commAuto.label) || '미상'); }
// 슬레이브 분기(백엔드 동일): 마스터 SMGW-C(92) & 슬레이브 아미고 → 무선, 그외 0.5
function slaveBungi(sufMaster, slaveMeterNo) { return (sufMaster === '92' && isAmigo(slaveMeterNo)) ? '무선' : '0.5'; }

// ── QR/바코드 파싱 (헬퍼 awms-bridge-inject.js convertForField·modemTo012 그대로 이식) ──
// modemTo012: LTE 자재ID → 012+끝8, 이미 012형이면 그대로, PLC hex 등 = 원본 (헬퍼 L78-85)
function modemTo012(v) {
  var s = String(v || '').trim();
  if (/^012\d{8}$/.test(s)) return s;                              // 이미 LTE 스캔값
  var d = s.replace(/\D/g, '');
  if (/^012\d{8}$/.test(d)) return d;
  if (/G1S3/i.test(s) && d.length >= 8) return '012' + d.slice(-8); // LTE 자재ID(G1S3) → 012+끝8
  return s;                                                         // PLC hex MAC 등 = 원본 그대로
}
// 계기번호: raw 그대로(전처리 없이) parseValue → value, 빈값이면 raw 폴백 (헬퍼 convertForField 계기 경로)
function parseMeterScan(raw) {
  var r = String(raw || '');
  var p = (typeof parseValue === 'function') ? (parseValue(r) || {}) : {};
  var value = (p.value != null && p.value !== '') ? p.value : r;
  // 계기 QR("계기 ID" 포함) = value 그대로, 그외도 value(parseValue 결과 또는 raw 폴백)
  return String(value);
}
// 모뎀맥: raw 그대로 parseValue → value, 빈값이면 raw 폴백 → modemTo012 (헬퍼 convertForField 모뎀 경로)
function parseMacScan(raw) {
  var r = String(raw || '');
  var p = (typeof parseValue === 'function') ? (parseValue(r) || {}) : {};
  var value = (p.value != null && p.value !== '') ? p.value : r;
  return modemTo012(value);
}

function showStep(s) { ['master', 'slave', 'mac', 'confirm', 'done'].forEach(x => $('step-' + x).classList.toggle('hidden', x !== s)); }

// 앨범 사진 선택 (촬영 capture 금지 — photo_upload_policy)
function pickPhoto(cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(f); };
  inp.click();
}
// 여러 장 한번에 선택 → base64 배열 콜백 (헬퍼식 일괄). 선택 순서 유지.
function pickPhotos(cb) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = () => {
    const fs = Array.from(inp.files); if (!fs.length) return;
    Promise.all(fs.map(f => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); }))).then(cb);
  };
  inp.click();
}
const SLAVE_MAX = 30;

// QR/바코드 스캔 (폰앱 ScannerBridge). scan()은 void(비동기) — 결과는 네이티브가
// window.__onNativeScan(v) 콜백으로 전달(emitScan). 빈 문자열=취소/실패.
function scan(cb) {
  if (window.AndroidScanner && AndroidScanner.scan) {
    window.__cstScanCb = cb;
    try { AndroidScanner.scan(); }
    catch (e) { showToast('스캔 실패: ' + e.message); }
  } else showToast('QR/바코드 스캔은 폰 앱에서만');
}
// 네이티브 emitScan 진입점 (헬퍼/awms 공용 함수명과 동일). 값 있을 때만 콜백.
window.__onNativeScan = (v) => {
  const cb = window.__cstScanCb; window.__cstScanCb = null;
  if (v && cb) cb(v);
};

// ── 사진 수집 ──
function renderMaster() {
  const el = $('masterPhotos'); el.innerHTML = '';
  MASTER_SLOTS.forEach(s => {
    const d = document.createElement('div');
    d.className = 'pslot' + (CST.master.photos[s.k] ? ' filled' : '');
    d.innerHTML = CST.master.photos[s.k]
      ? `<span class="tag">${s.lbl}</span><img src="${CST.master.photos[s.k]}">`
      : `<span class="lbl">+ ${s.lbl}</span>`;
    d.onclick = () => pickPhoto(b64 => { CST.master.photos[s.k] = b64; renderMaster(); });
    el.appendChild(d);
  });
}
function renderSlaves() {
  const el = $('slaveList'); el.innerHTML = '';
  CST.slaves.forEach((sl, i) => {
    const d = document.createElement('div'); d.className = 'slavecard';
    d.innerHTML = `<img class="th" src="${sl.photo5 || ''}"><span class="nm">슬레이브 ${i + 1}</span><button class="del">삭제</button>`;
    d.querySelector('.th').onclick = () => pickPhoto(b64 => { sl.photo5 = b64; renderSlaves(); });
    d.querySelector('.del').onclick = () => { CST.slaves.splice(i, 1); renderSlaves(); };
    el.appendChild(d);
  });
}
// 마스터 일괄: 선택 순서대로 3·4·5·6 채움(최대 4, 초과 무시). 개별은 슬롯 탭 유지.
$('btnMasterBulk') && ($('btnMasterBulk').onclick = () => pickPhotos(b64s => {
  MASTER_SLOTS.forEach((s, i) => { if (b64s[i]) CST.master.photos[s.k] = b64s[i]; });
  if (b64s.length > 4) showToast('마스터는 최대 4장(3·4·5·6) — 4장만 적용');
  renderMaster();
}));
// 슬레이브 일괄: 여러 장 한번에 추가(최대 30). 개별 추가도 같은 버튼.
$('btnAddSlave').onclick = () => pickPhotos(b64s => {
  let added = 0;
  for (const b of b64s) {
    if (CST.slaves.length >= SLAVE_MAX) { showToast('슬레이브 최대 ' + SLAVE_MAX + '개'); break; }
    CST.slaves.push({ photo5: b, meterNo: '' }); added++;
  }
  renderSlaves();
});

// [마스터 다음] 마스터 사진 넘김 → 마스터 OCR 백그라운드 시작 → 슬레이브 사진 화면
// (슬레이브 사진 고르는 동안 첫 마스터 OCR이 끝나 시간 확보 — 영준님 설계)
$('btnMasterNext').onclick = () => {
  if (!CST.master.photos['5']) { showToast('마스터 시공후 계기사진(5번)이 필요합니다'); return; }
  CST._masterOcrDone = false;
  apiFetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: [{ id: 'master', b64: CST.master.photos['5'] }] }) })
    .then(r => r.json()).then(j => {
      (j.results || []).forEach(res => { if (res.id === 'master') CST.master.meterNo = res.meterNo; });
      CST._masterOcrDone = true;
      if (!$('step-confirm').classList.contains('hidden')) renderConfirm();  // 확인화면이면 즉시 갱신
    }).catch(e => { CST._ocrErr = e.message; });
  showStep('slave'); renderSlaves();
};

// [슬레이브 다음] 슬레이브 사진 넘김 → 슬레이브 OCR 시작 → 맥수집
$('btnSlaveNext').onclick = () => {
  const imgs = [];
  CST.slaves.forEach((s, i) => { if (s.photo5) imgs.push({ id: 'slave' + i, b64: s.photo5 }); });
  CST._ocrDone = CST._masterOcrDone;   // 확인화면 라벨용
  if (imgs.length) {
    apiFetch('/api/ocr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: imgs }) })
      .then(r => r.json()).then(j => {
        (j.results || []).forEach(res => { const i = +res.id.slice(5); if (CST.slaves[i]) CST.slaves[i].meterNo = res.meterNo; });
        CST._ocrDone = true;
        if (!$('step-confirm').classList.contains('hidden')) renderConfirm();  // 확인화면이면 즉시 갱신
      }).catch(e => { CST._ocrErr = e.message; });
  } else { CST._ocrDone = true; }
  showStep('mac');
};

// ── 모뎀맥 + 통신방식 자동판별/직접선택 ──
$('btnScanMac').onclick = () => scan(v => { $('macInput').value = parseMacScan(v); checkCommType(); });
$('macInput').addEventListener('change', checkCommType);

async function checkCommType() {
  const mac = $('macInput').value.trim();
  CST.commAuto = null; CST.commSuffix = '';
  $('commAuto').textContent = ''; $('commSelectWrap').style.display = 'none';
  if (!mac) return;
  try {
    const r = await (await apiFetch('/api/commtype?mac=' + encodeURIComponent(mac))).json();
    CST.commAuto = r;
    if (r.auto) {
      $('commAuto').textContent = '통신방식 자동판별: ' + r.label;
      $('commAuto').style.color = 'var(--mint)';
    } else {
      $('commAuto').textContent = (r.reason || '통신방식 자동판별 안 됨') + ' — 아래에서 선택';
      $('commAuto').style.color = '#e0b14a';
      const sel = $('commSelect');
      sel.innerHTML = '<option value="">선택하세요</option>' +
        (r.options || []).map(o => `<option value="${o.v}">${o.t}</option>`).join('');
      $('commSelectWrap').style.display = 'block';
    }
  } catch (e) { $('commAuto').textContent = '통신방식 조회 실패(백엔드 확인)'; }
}
$('commSelect') && ($('commSelect').onchange = () => { CST.commSuffix = $('commSelect').value; });

$('btnMacNext').onclick = () => {
  const mac = $('macInput').value.trim();
  if (!mac) { showToast('모뎀맥을 입력하세요'); return; }
  // 자동판별 안 된 경우 직접선택 강제 (헬퍼 조건: SKIP/미상)
  if (CST.commAuto && !CST.commAuto.auto && !CST.commSuffix) {
    showToast('통신방식을 선택하세요'); return;
  }
  CST.master.mac = mac;
  CST.confirmQueue = [{ role: '마스터', photoB64: CST.master.photos['5'], target: CST.master }];
  CST.slaves.forEach((s, i) => CST.confirmQueue.push({ role: '슬레이브 ' + (i + 1), photoB64: s.photo5, target: s }));
  CST.confirmIdx = 0;
  showStep('confirm'); renderConfirm();
};

// ── 계기번호 확인 (OCR값 / QR / 수기) ──
function renderConfirm() {
  const q = CST.confirmQueue[CST.confirmIdx];
  $('confirmProgress').textContent = `(${CST.confirmIdx + 1}/${CST.confirmQueue.length})`;
  $('confirmRole').textContent = q.role + (CST._ocrDone ? '' : ' · 인식 중…');
  $('confirmPhoto').src = q.photoB64 || '';
  $('confirmInput').value = q.target.meterNo || '';
}
$('btnScanMeter').onclick = () => scan(v => $('confirmInput').value = parseMeterScan(v));
$('btnConfirmNext').onclick = () => {
  const v = $('confirmInput').value.trim();
  if (!v) { showToast('계기번호를 입력하세요'); return; }
  CST.confirmQueue[CST.confirmIdx].target.meterNo = v;
  CST.confirmIdx++;
  if (CST.confirmIdx < CST.confirmQueue.length) renderConfirm();
  else showDone();
};

// ── 전송 ──
function showDone() {
  showStep('done');
  const suf = masterSuffix();
  const cnt = 1 + CST.slaves.length;
  let html = `대표계기 <b>${CST.master.meterNo || '-'}</b><br>`;
  html += `통신방식 <b>${commLabelOf(suf)}</b><br>`;
  html += `함내 계기수 <b>${cnt}</b> (마스터 1 + 슬레이브 ${CST.slaves.length})<br>`;
  html += `모뎀맥 ${CST.master.mac || '-'}`;
  if (CST.slaves.length) {
    html += '<br><br>슬레이브:<br>' + CST.slaves.map((s, i) =>
      `${i + 1}. ${s.meterNo || '-'} · 분기 <b>${slaveBungi(suf, s.meterNo)}</b>`).join('<br>');
  } else {
    html += '<br><br>슬레이브 없음';
  }
  $('doneSummary').innerHTML = html;
  $('submitResult').innerHTML = '';
}

// 전송 진행 라벨: 마스터/슬레이브 idx 기반 한글표기
function roleLabel(ev) { return ev.role === 'master' ? '마스터' : ('슬레이브 ' + (ev.idx - 1)); }
// 진행 UI: n건 중 몇 건 완료(성공/실패 색). ev.type item마다 호출.
function renderProgress(cur, total, ev) {
  const pct = total ? Math.round((cur / total) * 100) : 0;
  let line = ev ? (roleLabel(ev) + (ev.ok ? ' 등록 완료' : ' 등록 실패')) : '전송 준비 중…';
  $('submitResult').innerHTML =
    `<div style="font-weight:800;color:var(--ink,#eaf2fb);margin-bottom:6px;">전송 중… ${cur}/${total}</div>` +
    `<div style="height:8px;border-radius:999px;background:var(--surface-2,#243244);overflow:hidden;margin-bottom:6px;">` +
    `<div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--mint,#3ddc97),#2bb89a);transition:width .25s;"></div></div>` +
    `<div style="font-size:13px;color:${ev && !ev.ok ? '#e06a5a' : 'var(--ink-2,#9fb2c6)'};">${line}</div>`;
}
// 세션만료(401) 시 재로그인 버튼까지 표시
function showSubmitError(msg, sessionExpired) {
  let html = `<div style="color:#e06a5a;font-weight:700;">${msg}</div>`;
  if (sessionExpired) html += `<button id="btnReLogin" style="margin-top:10px;width:100%;padding:14px;border:none;border-radius:999px;` +
    `background:linear-gradient(145deg,var(--mint,#3ddc97),#2bb89a);color:#04261f;font-size:16px;font-weight:800;">awms 다시 로그인</button>`;
  $('submitResult').innerHTML = html;
  if (sessionExpired) { const b = $('btnReLogin'); if (b) b.onclick = () => { if (window.awmsLogin) awmsLogin(); }; }
}

// 전송 결과 판정 + 표시 (스트림 done / classic 폴백 공용)
function finishSubmit(results) {
  const ok = (results || []).length && results.every(x => x.resp && x.resp.result === 1);
  if (ok) {
    $('submitResult').innerHTML = `<div style="color:var(--mint,#3ddc97);font-weight:800;font-size:16px;">전송 완료 — 전부 등록됨 (${results.length}건)</div>`;
  } else {
    const bad = (results || []).filter(x => !(x.resp && x.resp.result === 1))
      .map(x => (x.role === 'master' ? '마스터' : '슬레이브') + ' ' + (x.meterNo || '') + ': ' + JSON.stringify(x.resp)).join('<br>');
    $('submitResult').innerHTML = `<div style="color:#e06a5a;font-weight:700;">일부 실패 — 확인 필요</div>` +
      `<div style="font-size:12px;color:var(--ink-2,#9fb2c6);margin-top:6px;">${bad || JSON.stringify(results)}</div>`;
  }
}

$('btnSubmit').onclick = async () => {
  $('btnSubmit').disabled = true;
  const total = 1 + CST.slaves.length;
  renderProgress(0, total, null);
  const body = {
    commSuffix: CST.commSuffix || '',   // 직접선택 시만 값 (자동판별이면 빈값→백엔드 자동)
    master: { meterNo: CST.master.meterNo, mac: CST.master.mac, instM: CST.master.instM, photos: CST.master.photos },
    slaves: CST.slaves.map(s => ({ meterNo: s.meterNo, photos: { 5: s.photo5 } })),
  };
  const jsonBody = JSON.stringify(body);
  try {
    // 1) 진행표시판(NDJSON 스트림) 우선. 구백엔드(재시작 전)엔 404 → classic 폴백.
    const r = await apiFetch('/api/saveact/stream', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' }, body: jsonBody });
    if (r.status === 404) { await submitClassic(jsonBody, total); return; }
    if (!r.ok) { await handleSubmitHttpError(r); return; }
    // 스트림 파싱 (건별 진행)
    const reader = r.body.getReader(); const dec = new TextDecoder();
    let buf = '', done = null, cur = 0, streamErr = null;
    for (;;) {
      const { value, done: d } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.type === 'item') { cur = ev.idx; renderProgress(cur, ev.total, ev); }
        else if (ev.type === 'done') done = ev.results;
        else if (ev.type === 'error') streamErr = ev.detail;
      }
      if (d) break;
    }
    // 마지막 개행 없는 잔여 줄 flush (advisor 지적 — awms엔 등록됐는데 화면만 멈추는 것 방지)
    const tail = buf.trim();
    if (tail) { try { const ev = JSON.parse(tail); if (ev.type === 'done') done = ev.results; else if (ev.type === 'error') streamErr = ev.detail; } catch (e) {} }
    if (streamErr) { showSubmitError('전송 오류: ' + streamErr, /세션/.test(streamErr)); }
    else if (done) finishSubmit(done);
    else showSubmitError('전송 결과를 받지 못했어요 — awms에서 등록 여부 확인 필요', false);
  } catch (e) {
    // 스트림 자체 실패(구버전/네트워크) → classic 폴백 시도
    try { await submitClassic(jsonBody, total); }
    catch (e2) { showSubmitError('전송 실패: ' + (e2.message || e.message), false); }
  }
  $('btnSubmit').disabled = false;
};

// 구백엔드 폴백: 진행표시 없이 한 번에 (결과만)
async function submitClassic(jsonBody, total) {
  renderProgress(0, total, null);
  const r = await apiFetch('/api/saveact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: jsonBody });
  if (!r.ok) { await handleSubmitHttpError(r); $('btnSubmit').disabled = false; return; }
  const j = await r.json();
  finishSubmit(j.results || []);
  $('btnSubmit').disabled = false;
}

// 401/400 등 HTTP 오류 → 사용자 문구 + (세션만료면) 재로그인 버튼
async function handleSubmitHttpError(r) {
  let detail = '';
  try { const j = await r.json(); detail = j.detail || ''; } catch (e) {}
  if (r.status === 401) showSubmitError('awms 세션이 만료됐어요 — 다시 로그인이 필요합니다.', true);
  else showSubmitError('전송 실패 (' + r.status + ')' + (detail ? ' — ' + detail : ''), false);
  $('btnSubmit').disabled = false;
}

// 키보드가 입력칸 가리는 문제: 포커스 시 해당 input을 화면 중앙으로 스크롤(키보드 애니메이션 후).
['macInput', 'confirmInput'].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener('focus', () => setTimeout(() => {
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
  }, 300));
});

// 입력 진입 초기화 (settings.js showInput에서 호출)
window.cstInitInput = () => {
  CST.master = { photos: {}, meterNo: '', mac: '', instM: 'HW4050' };
  CST.slaves = []; CST.confirmQueue = []; CST.confirmIdx = 0;
  CST.commAuto = null; CST.commSuffix = '';
  if ($('commAuto')) $('commAuto').textContent = '';
  if ($('commSelectWrap')) $('commSelectWrap').style.display = 'none';
  renderMaster(); renderSlaves(); showStep('master');
};
