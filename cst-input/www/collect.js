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

// ── QR/바코드 파싱 (헬퍼 awms-parseValue.js 법칙 그대로) ──
// 계기번호: parseValue().value (13/11/15자리·계기ID·* 제거 규칙 재사용)
function parseMeterScan(raw) {
  try { if (window.parseValue) { var p = parseValue(String(raw).replace(/\*/g, '')); if (p && p.value) return String(p.value); } } catch (e) {}
  var m = String(raw || '').match(/\d{11}/); return m ? m[0] : String(raw || '').replace(/[^0-9A-Za-z]/g, '');
}
// 모뎀맥: parseValue → LTE(012+끝8) 변환, PLC hex는 원본 (inject macToSuffix 앞단과 동일)
function parseMacScan(raw) {
  var s = String(raw || '').replace(/\*/g, '').trim();
  try { if (window.parseValue) { var p = parseValue(s); if (p && p.value) s = String(p.value); } } catch (e) {}
  var d = s.replace(/\D/g, '');
  if (/^012\d{8}$/.test(d)) return d;
  if (/G1S3/i.test(raw) && d.length >= 8) return '012' + d.slice(-8);
  return s;
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
  $('submitResult').textContent = '';
}
$('btnSubmit').onclick = async () => {
  $('btnSubmit').disabled = true; $('submitResult').textContent = '전송 중…';
  const body = {
    commSuffix: CST.commSuffix || '',   // 직접선택 시만 값 (자동판별이면 빈값→백엔드 자동)
    master: { meterNo: CST.master.meterNo, mac: CST.master.mac, instM: CST.master.instM, photos: CST.master.photos },
    slaves: CST.slaves.map(s => ({ meterNo: s.meterNo, photos: { 5: s.photo5 } })),
  };
  try {
    const r = await (await apiFetch('/api/saveact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
    const ok = (r.results || []).length && r.results.every(x => x.resp && x.resp.result === 1);
    $('submitResult').textContent = ok ? '전송 완료 — result:1 (전부 등록)' : '결과 확인: ' + JSON.stringify(r.results || r);
  } catch (e) { $('submitResult').textContent = '전송 실패: ' + e.message; }
  $('btnSubmit').disabled = false;
};

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
