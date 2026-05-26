// qr-scanner.js — html5-qrcode 래퍼
// ami-work 옛 admin.html(커밋 a74dac7) 코드를 모듈화

const QrScanner = (() => {
  let _scanner = null;
  let _cameras = [];
  let _camIndex = 0;
  let _onSuccess = null; // (text, photoDataUrl) => void
  let _detected = false; // 한 번 인식되면 후속 콜백 차단

  const LS_CAM = 'qr_camera_id';
  const LS_ZOOM = 'qr_zoom';

  function saveCameraId(id) { try { if (id) localStorage.setItem(LS_CAM, id); } catch {} }
  function loadCameraId() { try { return localStorage.getItem(LS_CAM) || ''; } catch { return ''; } }
  function clearCameraId() { try { localStorage.removeItem(LS_CAM); } catch {} }
  function saveZoom(z) { try { if (z > 0) localStorage.setItem(LS_ZOOM, String(z)); } catch {} }
  function loadZoom() {
    try { const v = parseFloat(localStorage.getItem(LS_ZOOM)); return isNaN(v) ? null : v; }
    catch { return null; }
  }
  function currentDeviceId() {
    try {
      const v = document.querySelector('#qr-reader video');
      const t = v?.srcObject?.getVideoTracks?.()[0];
      return t?.getSettings?.()?.deviceId || '';
    } catch { return ''; }
  }

  // 카메라 라벨 다듬기 — 광각/일반 등 추정 힌트 표시
  function prettyCamLabel(cam, idx) {
    const raw = (cam.label || '').trim();
    const lower = raw.toLowerCase();
    let hint = '';
    if (/(ultra.?wide|wide.?angle|광각|초광각)/i.test(raw)) hint = ' [광각]';
    else if (/(tele|망원|줌)/i.test(raw)) hint = ' [망원]';
    else if (/(front|전면)/i.test(raw)) hint = ' [전면]';
    else if (/(back|rear|environment|후면)/i.test(raw)) hint = ' [후면]';
    const name = raw || `카메라 ${idx + 1}`;
    return name + hint;
  }

  function populateCamSelect() {
    const sel = document.getElementById('qr-cam-select');
    if (!sel) return;
    const did = currentDeviceId();
    sel.innerHTML = '';
    if (!_cameras || _cameras.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '카메라 1개 (전환 불가)';
      opt.disabled = true;
      sel.appendChild(opt);
      return;
    }
    _cameras.forEach((cam, i) => {
      const opt = document.createElement('option');
      opt.value = cam.id;
      opt.textContent = prettyCamLabel(cam, i);
      if (cam.id === did) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function show(onSuccess) {
    _onSuccess = onSuccess;
    _detected = false;
    document.getElementById('qr-scan-overlay').style.display = 'flex';
    document.getElementById('qr-error-msg').style.display = 'none';
    // 권한 부여 전이라도 카메라 목록 미리 시도 (라벨은 빈값일 수 있음)
    if (typeof Html5Qrcode !== 'undefined') {
      Html5Qrcode.getCameras().then(cs => {
        _cameras = cs || [];
        populateCamSelect();
      }).catch(() => {});
    }
    start();
  }

  function buildConfig() {
    return {
      fps: 20,
      aspectRatio: 1.0,
      qrbox: (w, h) => {
        const size = Math.floor(Math.min(w, h) * 0.7);
        return { width: size, height: size };
      },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.CODE_93,
        Html5QrcodeSupportedFormats.CODABAR,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.PDF_417,
        Html5QrcodeSupportedFormats.AZTEC,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ]
    };
  }

  async function start() {
    console.log('[QR] start, Html5Qrcode:', typeof Html5Qrcode);
    if (typeof Html5Qrcode === 'undefined') {
      return showError('html5-qrcode 라이브러리 로드 실패 — CDN 차단 의심');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      return showError('이 브라우저는 카메라 미지원 (HTTPS 필요)');
    }

    // 0차: 저장된 카메라 ID 우선 (사용자가 마지막에 쓴 것)
    // 1차: facingMode exact environment (후면 강제)
    // 2차: facingMode ideal environment (후면 선호)
    // 3차: getCameras() + 라벨 매칭 폴백
    const savedId = loadCameraId();
    if (savedId && await startWithSavedId(savedId)) return;
    if (await startWithFacing({ exact: 'environment' }, '후면(강제)')) return;
    if (await startWithFacing('environment', '후면(선호)'))         return;
    await startWithCameraList();
  }

  function setStatusLabel(text) {
    const lbl = document.getElementById('qr-cam-label');
    if (lbl) lbl.textContent = text;
  }

  async function startWithSavedId(id) {
    if (_scanner) {
      try { await _scanner.stop(); } catch {}
      try { await _scanner.clear(); } catch {}
      _scanner = null;
    }
    await new Promise(r => setTimeout(r, 200));
    _scanner = new Html5Qrcode('qr-reader');
    // Android 대응: string 대신 명시적 constraints 객체
    const shortId = String(id).slice(-6);
    setStatusLabel(`저장ID(객체)…${shortId}`);
    const constraints = { deviceId: { exact: id } };
    try {
      await _scanner.start(constraints, buildConfig(),
        (text) => onDetected(text),
        () => {});
      // 라벨·전환버튼·드롭다운은 카메라 목록 비동기 로드
      Html5Qrcode.getCameras().then(cs => {
        _cameras = cs || [];
        const idx = _cameras.findIndex(c => c.id === id);
        _camIndex = idx >= 0 ? idx : 0;
        document.getElementById('qr-switch-btn').style.display = _cameras.length > 1 ? '' : 'none';
        populateCamSelect();
      }).catch(() => {});
      const actualId = currentDeviceId();
      const actualShort = String(actualId || '').slice(-6);
      if (actualId && actualId !== id) {
        setStatusLabel(`저장ID mismatch! 요청:${shortId} 실제:${actualShort}`);
        saveCameraId(actualId);
      } else {
        setStatusLabel(`[저장] ${shortId} ok`);
      }
      await applyZoom(loadZoom() ?? 2.0);
      return true;
    } catch (e) {
      setStatusLabel(`저장ID(객체) 실패: ${(e?.message||e).toString().slice(0,40)}`);
      // 폴백 1: string 방식 재시도
      try {
        try { await _scanner.stop(); } catch {}
        _scanner = new Html5Qrcode('qr-reader');
        await _scanner.start(id, buildConfig(),
          (text) => onDetected(text),
          () => {});
        Html5Qrcode.getCameras().then(cs => {
          _cameras = cs || [];
          const idx = _cameras.findIndex(c => c.id === id);
          _camIndex = idx >= 0 ? idx : 0;
          populateCamSelect();
        }).catch(() => {});
        setStatusLabel(`[저장-string] ${shortId} ok`);
        await applyZoom(loadZoom() ?? 2.0);
        return true;
      } catch (e2) {
        setStatusLabel(`저장ID 폴백도 실패: ${(e2?.message||e2).toString().slice(0,40)}`);
        clearCameraId();
        try { await _scanner.stop(); } catch {}
        _scanner = null;
        await new Promise(r => setTimeout(r, 400)); // 화면 메시지 잠시 노출
        return false;
      }
    }
  }

  async function startWithFacing(facingMode, labelHint) {
    if (_scanner) { try { await _scanner.stop(); } catch {} _scanner = null; }
    _scanner = new Html5Qrcode('qr-reader');
    try {
      await _scanner.start({ facingMode }, buildConfig(),
        (text) => onDetected(text),
        () => {});
      _cameras = []; _camIndex = 0;
      setStatusLabel(`[자동] ${labelHint}`);
      document.getElementById('qr-switch-btn').style.display = 'none';
      // 권한 부여된 뒤 카메라 목록 로드 (전환 버튼/드롭다운용 — 비동기, 실패 무시)
      Html5Qrcode.getCameras().then(cs => {
        _cameras = cs || [];
        const did = currentDeviceId();
        const idx = _cameras.findIndex(c => c.id === did);
        if (idx >= 0) _camIndex = idx;
        document.getElementById('qr-switch-btn').style.display = _cameras.length > 1 ? '' : 'none';
        populateCamSelect();
      }).catch(() => {});
      saveCameraId(currentDeviceId());
      await applyZoom(loadZoom() ?? 2.0);
      return true;
    } catch (e) {
      console.warn(`[QR] facingMode ${JSON.stringify(facingMode)} 실패:`, e?.message || e);
      try { await _scanner.stop(); } catch {}
      _scanner = null;
      return false;
    }
  }

  async function startWithCameraList() {
    try {
      _cameras = await Html5Qrcode.getCameras();
      console.log('[QR] cameras:', _cameras);
    } catch (e) {
      console.error('[QR] getCameras 실패:', e);
      return showError(camErrorMsg(e));
    }
    if (!_cameras || _cameras.length === 0) {
      return showError('카메라를 찾을 수 없습니다 (권한 거부 또는 미지원)');
    }
    const rearIdx = _cameras.findIndex(c =>
      /back|rear|environment|후면/i.test(c.label || '')
    );
    _camIndex = rearIdx >= 0 ? rearIdx : (_cameras.length > 1 ? _cameras.length - 1 : 0);
    document.getElementById('qr-switch-btn').style.display = _cameras.length > 1 ? '' : 'none';
    await startCamera(_cameras[_camIndex].id);
  }

  async function startCamera(cameraId) {
    // Android Chrome 대응: stop → clear → 짧은 delay → 새 인스턴스
    if (_scanner) {
      try { await _scanner.stop(); } catch {}
      try { await _scanner.clear(); } catch {}
      _scanner = null;
    }
    await new Promise(r => setTimeout(r, 300));  // race condition 회피
    _scanner = new Html5Qrcode('qr-reader');

    // string deviceId 대신 명시적 constraints 객체 (Android에서 적용 안 되는 경우 대응)
    const constraints = { deviceId: { exact: cameraId } };

    try {
      await _scanner.start(constraints, buildConfig(),
        (text) => onDetected(text),
        () => {});
      // _camIndex 동기화 + 실제 잡힌 deviceId 확인
      // Android에서 currentDeviceId가 빈값일 수 있으니 빈값이면 요청 ID 저장
      const actualId = currentDeviceId() || cameraId;
      const idx = _cameras.findIndex(c => c.id === actualId);
      if (idx >= 0) _camIndex = idx;
      saveCameraId(actualId || cameraId);  // 빈값 방어
      populateCamSelect();
      await applyZoom(loadZoom() ?? 2.0);

      // 디버그: 의도와 실제가 다르면 콘솔에 경고
      if (actualId !== cameraId) {
        console.warn('[QR] 카메라 전환 mismatch — 요청:', cameraId, '실제:', actualId);
      }
    } catch (e) {
      console.warn('[QR] startCamera 실패, string id 폴백 시도:', e?.message || e);
      // 폴백: 명시 constraints가 실패하면 string 방식 시도
      try {
        try { await _scanner.stop(); } catch {}
        _scanner = new Html5Qrcode('qr-reader');
        await _scanner.start(cameraId, buildConfig(),
          (text) => onDetected(text),
          () => {});
        const idx = _cameras.findIndex(c => c.id === cameraId);
        if (idx >= 0) _camIndex = idx;
        saveCameraId(cameraId);
        populateCamSelect();
        await applyZoom(loadZoom() ?? 2.0);
      } catch (e2) {
        showError(camErrorMsg(e2));
      }
    }
  }

  async function applyZoom(z) {
    try {
      const v = document.querySelector('#qr-reader video');
      if (!v?.srcObject) return;
      const t = v.srcObject.getVideoTracks()[0];
      const cap = t?.getCapabilities?.() || {};
      if (cap.zoom) {
        const zoom = Math.min(Math.max(z, cap.zoom.min), cap.zoom.max);
        await t.applyConstraints({ advanced: [{ zoom }] });
        saveZoom(zoom);
      }
    } catch {}
  }

  async function adjustZoom(delta) {
    try {
      const v = document.querySelector('#qr-reader video');
      if (!v?.srcObject) return;
      const t = v.srcObject.getVideoTracks()[0];
      const cap = t?.getCapabilities?.();
      if (!cap?.zoom) return;
      const cur = t.getSettings().zoom || 1;
      const next = Math.max(cap.zoom.min, Math.min(cap.zoom.max, cur + delta));
      await t.applyConstraints({ advanced: [{ zoom: next }] });
      saveZoom(next);
    } catch {}
  }

  async function switchCamera() {
    if (!_cameras.length) return;
    _camIndex = (_camIndex + 1) % _cameras.length;
    await startCamera(_cameras[_camIndex].id);
  }

  function onDetected(text) {
    // 매 프레임 detect 콜백이 여러 번 올 수 있어 첫 번째만 처리
    if (_detected) return;
    _detected = true;

    const finish = (blob) => {
      stop();
      _onSuccess && _onSuccess(text, blob);
    };

    const v = document.querySelector('#qr-reader video');
    if (!v || !v.videoWidth || !v.videoHeight) {
      console.warn('[QR] 비디오 준비 안 됨 — 사진 캡처 스킵');
      return finish(null);
    }

    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);

      // 1차: toBlob
      if (c.toBlob) {
        c.toBlob((b) => {
          if (b && b.size > 0) return finish(b);
          // 폴백: toDataURL → fetch → blob
          captureViaDataUrl(c, finish);
        }, 'image/jpeg', 0.9);
      } else {
        captureViaDataUrl(c, finish);
      }
    } catch (e) {
      console.warn('[QR] 프레임 캡처 실패', e);
      finish(null);
    }
  }

  function captureViaDataUrl(c, done) {
    try {
      const url = c.toDataURL('image/jpeg', 0.9);
      fetch(url).then(r => r.blob()).then(b => done(b || null))
        .catch((e) => { console.warn('[QR] dataURL→blob 실패', e); done(null); });
    } catch (e) {
      console.warn('[QR] toDataURL 실패', e);
      done(null);
    }
  }

  async function stop() {
    if (_scanner) {
      try { await _scanner.stop(); } catch {}
      _scanner = null;
    }
    document.getElementById('qr-scan-overlay').style.display = 'none';
  }

  function showError(msg) {
    const el = document.getElementById('qr-error-msg');
    el.textContent = msg;
    el.style.display = '';
  }

  function camErrorMsg(e) {
    const m = String(e?.message || e || '');
    if (m.includes('Permission') || m.includes('NotAllowed')) return '카메라 권한 거부됨 — 브라우저 설정 확인';
    if (m.includes('NotFound')) return '카메라 없음';
    if (m.includes('NotReadable')) return '다른 앱이 카메라 사용 중';
    return `스캔 시작 실패: ${m}`;
  }

  function init() {
    document.getElementById('qr-close-btn').onclick = stop;
    const sw = document.getElementById('qr-switch-btn');
    if (sw) sw.onclick = switchCamera;
    document.getElementById('qr-zoom-in').onclick = () => adjustZoom(+0.5);
    document.getElementById('qr-zoom-out').onclick = () => adjustZoom(-0.5);
    const sel = document.getElementById('qr-cam-select');
    if (sel) {
      sel.onchange = async () => {
        const id = sel.value;
        if (!id) return;
        const lbl = document.getElementById('qr-cam-label');
        const prev = lbl ? lbl.textContent : '';
        if (lbl) lbl.textContent = '카메라 전환 중...';
        sel.disabled = true;
        try {
          await startCamera(id);
        } finally {
          sel.disabled = false;
          if (lbl && lbl.textContent === '카메라 전환 중...') lbl.textContent = prev || 'QR / 바코드';
        }
      };
    }
  }

  return { show, stop, init };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', QrScanner.init);
} else {
  QrScanner.init();
}
