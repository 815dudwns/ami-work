// 통신팀 awms 맥 입력장치 — 설정 + 세션 (헬퍼 설정페이지 이식)
// 저장: localStorage(맥 웹) + 백엔드 /api/config 동기화. 헬퍼 Android 브릿지 대신 localStorage.
const $ = (id) => document.getElementById(id);
// 백엔드 베이스: 맥 로컬(localhost:8766) 또는 터널URL. 설정에서 override 가능.
// 백엔드 베이스: 저장된 터널URL(원격) > 같은포트(8766) > localhost. 매 호출 읽어 저장 즉시 반영.
function backendBase() {
  return localStorage.getItem('cst_backend') || (location.port === '8766' ? '' : 'http://127.0.0.1:8766');
}
const apiFetch = (p, o) => fetch(backendBase() + p, o);

// ── 저장소 (localStorage) ───────────────────────────
const Store = {
  saveDept(dept, withYn) { localStorage.setItem('dept_code', dept); localStorage.setItem('with_yn', withYn); },
  getDept() { return { dept: localStorage.getItem('dept_code') || '', with: localStorage.getItem('with_yn') || '' }; },
  saveCred(id, pw) { localStorage.setItem('cred_id', id); localStorage.setItem('cred_pw', pw); },
  getCred() { return { id: localStorage.getItem('cred_id') || '', pw: localStorage.getItem('cred_pw') || '' }; },
  saveCam(label, deviceId) { localStorage.setItem('cam_label', label); localStorage.setItem('cam_deviceId', deviceId); },
  getCam() { const l = localStorage.getItem('cam_label') || ''; return l ? { label: l, deviceId: localStorage.getItem('cam_deviceId') || '' } : null; },
  saveBusi(w2, busi) { localStorage.setItem('worker2_seq', w2); localStorage.setItem('busi_num', busi); },
  getBusi() { return { w2: localStorage.getItem('worker2_seq') || '20118', busi: localStorage.getItem('busi_num') || 'C11G250023' }; },
};

// 설정 → 백엔드 CONFIG 동기화 (saveAct가 DEPT2/WORKER/CRED 사용)
async function pushConfig() {
  const d = Store.getDept(), c = Store.getCred(), b = Store.getBusi();
  try {
    await apiFetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DEPT2: d.dept, WITH_YN: d.with, CRED_ID: c.id, CRED_PW: c.pw,
        WORKER2_SEQ: b.w2, BUSI_NUM: b.busi }) });
  } catch (e) { /* 백엔드 미연결 무시 */ }
}

// ── 토스트 ──────────────────────────────────────────
let _toastTimer = 0;
function showToast(msg) {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(_toastTimer); _toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
}
function setHval(id, text, isSet) {
  const el = $(id); if (!el) return;
  el.textContent = text; el.classList.toggle('unset', !isSet); el.classList.toggle('set', isSet);
}

// ── 아코디언 ────────────────────────────────────────
function toggleCard(key) {
  const card = $('card-' + key), body = $('bodywrap-' + key);
  if (!card || !body) return;
  const isOpen = card.classList.contains('open');
  ['dept', 'cam', 'acct', 'busi', 'backend'].forEach(k => {
    $('card-' + k).classList.remove('open');
    $('bodywrap-' + k).style.display = 'none';
  });
  if (isOpen) return;
  card.classList.add('open'); body.style.display = 'block';
  if (key === 'cam' && !$('cam-list').querySelector('.camopt')) listCameras();
}
window.toggleCard = toggleCard;

// ── 지사·동행 ───────────────────────────────────────
function saveDept() {
  const dept = $('dept-select').value, withVal = $('with-select').value;
  if (!dept || !withVal) { showToast('지사와 동행시공 여부를 모두 선택하세요'); return; }
  Store.saveDept(dept, withVal); pushConfig(); showSavedDept();
  $('bodywrap-dept').style.display = 'none'; $('card-dept').classList.remove('open');
  showToast('지사가 저장됐어요');
}
function showSavedDept() {
  const d = Store.getDept();
  if (d.dept) {
    const ds = $('dept-select'), ws = $('with-select');
    ds.value = d.dept; ws.value = d.with;
    setHval('dept-hval', ds.options[ds.selectedIndex].text + ' · ' + (ws.value || '-'), true);
  } else setHval('dept-hval', '미설정', false);
}
window.saveDept = saveDept;

// ── awms 계정 ───────────────────────────────────────
function saveCred() {
  const id = $('cred-id').value.trim(), pw = $('cred-pw').value;
  if (!id || !pw) { showToast('아이디와 비밀번호를 모두 입력하세요'); return; }
  Store.saveCred(id, pw); pushConfig(); $('cred-pw').value = ''; $('cred-pw').placeholder = '저장됨';
  showSavedCred();
  $('bodywrap-acct').style.display = 'none'; $('card-acct').classList.remove('open');
  showToast('계정이 저장됐어요');
}
function showSavedCred() {
  const c = Store.getCred();
  if (c.id) { $('cred-id').value = c.id; setHval('acct-hval', maskId(c.id), true); }
  else setHval('acct-hval', '미설정', false);
}
function maskId(id) { return id.length <= 2 ? id + '***' : id.slice(0, 2) + '*'.repeat(Math.max(3, Math.min(6, id.length - 2))); }
window.saveCred = saveCred;

// ── 공사설정 (작업조2·공사번호) ────────────────────
function saveBusi() {
  const w2 = $('busi-worker2').value.trim(), busi = $('busi-num').value.trim();
  if (!w2 || !busi) { showToast('작업조2와 공사번호를 모두 입력하세요'); return; }
  Store.saveBusi(w2, busi); pushConfig(); showSavedBusi();
  $('bodywrap-busi').style.display = 'none'; $('card-busi').classList.remove('open');
  showToast('공사설정이 저장됐어요');
}
function showSavedBusi() {
  const b = Store.getBusi();
  $('busi-worker2').value = b.w2; $('busi-num').value = b.busi;
  setHval('busi-hval', '작업조2 ' + b.w2 + ' · ' + b.busi, true);
}
window.saveBusi = saveBusi;

// ── 백엔드 연결 (원격 터널 URL) ─────────────────────
async function saveBackend() {
  let u = $('backend-url').value.trim().replace(/\/+$/, '');
  if (u) localStorage.setItem('cst_backend', u); else localStorage.removeItem('cst_backend');
  showSavedBackend();
  const ok = await refreshSession();
  showToast(ok ? '백엔드 연결 정상 (세션 OK)' : '연결됐지만 세션 없음/만료 — 세션 가져오기 필요');
  $('bodywrap-backend').style.display = 'none'; $('card-backend').classList.remove('open');
}
function showSavedBackend() {
  const u = localStorage.getItem('cst_backend') || '';
  $('backend-url').value = u;
  setHval('backend-hval', u ? u.replace(/^https?:\/\//, '').slice(0, 30) : 'USB(자동)', true);
}
window.saveBackend = saveBackend;

// ── 카메라 ──────────────────────────────────────────
let _stream = null, _pendingDev = null, _pendingLabel = null;
async function listCameras() {
  const el = $('cam-list'); if (!el) return;
  el.innerHTML = '<div style="color:var(--ink2);font-size:13px;padding:8px 0">카메라 권한 확인 중…</div>';
  try { (await navigator.mediaDevices.getUserMedia({ video: true })).getTracks().forEach(t => t.stop()); }
  catch (e) { el.innerHTML = '<div style="color:var(--ink2);font-size:13px;padding:8px 0">카메라 권한이 없습니다.</div>'; return; }
  const devs = await navigator.mediaDevices.enumerateDevices();
  let cams = devs.filter(d => d.kind === 'videoinput' && /back|후면|environment/i.test(d.label));
  if (!cams.length) cams = devs.filter(d => d.kind === 'videoinput');
  if (!cams.length) { el.innerHTML = '<div style="color:var(--ink2);font-size:13px;padding:8px 0">카메라를 찾을 수 없습니다.</div>'; return; }
  el.innerHTML = '';
  cams.forEach(cam => {
    const label = cam.label || ('카메라 ' + cam.deviceId.slice(0, 6));
    const wide = /wide|광각/i.test(label);
    const div = document.createElement('div');
    div.className = 'camopt';
    div.innerHTML = '<span class="dot"></span><div><div class="nm">' + label + '</div>' +
      (wide ? '<div class="hint">주의: 글자 인식 안 됨</div>' : '') + '</div>';
    div.onclick = () => previewSelect(cam.deviceId, label, div);
    el.appendChild(div);
  });
}
async function previewSelect(deviceId, label, optEl) {
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  document.querySelectorAll('#cam-list .camopt').forEach(e => e.classList.remove('sel'));
  if (optEl) optEl.classList.add('sel');
  _pendingDev = deviceId; _pendingLabel = label;
  try { _stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId } } }); $('confirm-btn').disabled = false; }
  catch (e) { $('confirm-btn').disabled = true; showToast('카메라를 열 수 없습니다'); }
}
function confirmCamera() {
  if (!_pendingDev) return;
  Store.saveCam(_pendingLabel, _pendingDev);
  if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
  document.querySelectorAll('#cam-list .camopt').forEach(e => e.classList.remove('sel'));
  $('confirm-btn').disabled = true; _pendingDev = null; _pendingLabel = null;
  showSavedCam();
  $('bodywrap-cam').style.display = 'none'; $('card-cam').classList.remove('open');
  showToast('카메라가 저장됐어요');
}
function showSavedCam() { const c = Store.getCam(); setHval('cam-hval', c ? c.label : '미설정', !!c); }
window.confirmCamera = confirmCamera;

// ── 세션 (핸드오프) ─────────────────────────────────
async function refreshSession() {
  try {
    const s = await (await apiFetch('/api/session')).json();
    const ok = s.hasSession && s.alive;
    $('dotSession').classList.toggle('on', ok);
    $('sessionTxt').textContent = ok ? `세션 정상 (${s.account || '계정'})`
      : s.hasSession ? '세션 만료 — 다시 가져오기' : '세션 없음';
    return ok;
  } catch (e) { $('sessionTxt').textContent = '백엔드 연결 실패'; return false; }
}
function showInput(account) { $('scSetup').classList.add('hidden'); $('scInput').classList.remove('hidden'); if (window.cstInitInput) window.cstInitInput(); }

$('btnLogin').onclick = async () => {
  $('btnLogin').textContent = '확인 중…'; $('btnLogin').disabled = true;
  try {
    // 1) 이미 백엔드에 세션 살아있으면(원격: adb pull 불가) 바로 진입
    const s = await (await apiFetch('/api/session')).json();
    if (s.hasSession && s.alive) {
      await pushConfig(); await refreshSession();
      showToast('세션 정상 (' + (s.account || '계정') + ')'); showInput(s.account);
    } else {
      // 2) 세션 없으면 USB 헬퍼에서 pull 시도 (원격이면 실패 → 폰 USB 필요)
      const r = await (await apiFetch('/api/session/pull', { method: 'POST' })).json();
      if (r.ok && r.alive) { await pushConfig(); await refreshSession(); showToast('세션 정상 · 작업자1 ' + (r.worker1 || '?')); showInput(r.account); }
      else showToast('세션 가져오기 실패 — 폰 awms 로그인/USB 확인');
    }
  } catch (e) { showToast('실패(백엔드 URL 확인): ' + e.message); }
  $('btnLogin').textContent = '세션 가져오기'; $('btnLogin').disabled = false;
};
$('btnBack').onclick = () => { $('scInput').classList.add('hidden'); $('scSetup').classList.remove('hidden'); refreshSession(); };

// ── 인앱 자동업데이트 (jongno-snap 보조앱 방식 그대로: cmpVer + 모달) ──
// 보조앱은 www 번들이라 APP_VER 상수가 설치버전. cst는 www 원격로드라 설치버전을
// localStorage(cst_installed_ver)로 추적(지금설치 클릭 시 기록). 비교/모달 로직은 보조앱과 동일.
const VER_JSON_URL = 'https://raw.githubusercontent.com/815dudwns/ami-work/main/cst-input/cst-version.json';
// 버전 라벨 사전식 숫자 비교. a>b면 +1. (보조앱 cmpVer 동일)
function cmpVer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
async function checkAppUpdate(manual) {
  try { if (typeof AndroidUpdate === 'undefined' || !AndroidUpdate.available()) { if (manual) showToast('이 환경에선 자동설치 미지원(폰 앱에서만)'); return; } }
  catch (e) { if (manual) showToast('자동설치 미지원'); return; }
  let info;
  try {
    const res = await fetch(VER_JSON_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    info = await res.json();
  } catch (e) { if (manual) showToast('업데이트 확인 실패: ' + e.message); return; }
  const latest = info && info.versionName, apkUrl = info && info.apkUrl;
  if (!latest || !apkUrl) return;
  const installed = localStorage.getItem('cst_installed_ver') || '0';
  if (cmpVer(latest, installed) <= 0) { if (manual) showToast('최신 버전입니다 (' + installed + ')'); return; }
  showUpdateModal(latest, apkUrl, info.notes || '');
}
function showUpdateModal(latest, apkUrl, notes) {
  if (document.getElementById('upd-modal')) return;
  const ov = document.createElement('div');
  ov.id = 'upd-modal';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:24px;';
  ov.innerHTML =
    '<div style="background:var(--surface,#1a2330);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.5);max-width:360px;width:100%;padding:28px 24px;text-align:center;">' +
      '<div style="font-size:20px;font-weight:800;color:var(--ink,#eaf2fb);margin-bottom:8px;">새 버전이 있습니다</div>' +
      '<div style="font-size:15px;color:var(--ink-2,#9fb2c6);margin-bottom:4px;">v' + latest + ' 으로 업데이트</div>' +
      (notes ? '<div style="font-size:13px;color:var(--ink-3,#7d8fa0);margin-bottom:18px;">' + notes + '</div>' : '<div style="margin-bottom:18px;"></div>') +
      '<button id="upd-go" style="width:100%;padding:18px;border:none;border-radius:999px;background:linear-gradient(145deg,var(--mint,#3ddc97),#2bb89a);color:#04261f;font-size:18px;font-weight:800;box-shadow:0 8px 20px rgba(43,184,154,.35);margin-bottom:10px;">지금 설치</button>' +
      '<button id="upd-later" style="width:100%;padding:14px;border:none;border-radius:999px;background:transparent;color:var(--ink-2,#9fb2c6);font-size:15px;font-weight:700;">나중에</button>' +
    '</div>';
  document.body.appendChild(ov);
  document.getElementById('upd-later').onclick = () => ov.remove();
  document.getElementById('upd-go').onclick = () => {
    try { AndroidUpdate.downloadAndInstall(apkUrl, latest); localStorage.setItem('cst_installed_ver', latest); } catch (e) {}
    ov.remove();
  };
}
window.checkAppUpdate = checkAppUpdate;

// ── 초기화 ──────────────────────────────────────────
['dept', 'cam', 'acct', 'busi'].forEach(k => { $('bodywrap-' + k).style.display = 'none'; });
showSavedDept(); showSavedCred(); showSavedCam(); showSavedBusi(); showSavedBackend(); refreshSession();
checkAppUpdate(false);   // 앱 시작 시 자동업데이트 체크(폰 AndroidUpdate 있을 때만)
pushConfig();   // 초기 진입 시 저장된 공사설정을 백엔드에 반영 (정본 기본값 포함)
