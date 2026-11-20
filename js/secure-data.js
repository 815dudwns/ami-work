// secure-data.js — 로그인한 사람만 데이터 파일을 읽게 한다 (2026-11-20 보안 전환).
//
// 방식: 데이터 파일은 GitHub Pages 에 **암호문으로만** 올린다(enc/data/...).
//   푸는 열쇠(AES-256-GCM)는 RTDB mapSecret/dataKey 에 있고, rules 가 auth != null 일 때만 내준다.
//   그래서 로그인 없이 파일 주소를 직접 받아도 의미 없는 바이트이고, 열쇠 요청은 거절된다.
// ★왜 Firebase Storage 가 아닌가: 이 프로젝트엔 Storage 버킷이 없고(2026-11-20 실측 404, API 미사용),
//   새 버킷은 Blaze(유료) 요금제가 있어야 만들 수 있다. 이 방식은 무료 요금제(Spark) 그대로이고
//   지금 캐시 흐름(?v=·HEAD ETag·IndexedDB)을 하나도 바꾸지 않는다.
// 파일 형식(scripts/publish_enc_data.py 와 짝): 'AMIENC1\n'(8바이트) + IV 12바이트 + AES-GCM(gzip(원문)).
// ★암호문이 아니면(평문 파일) 그대로 읽는다 — 전환 중·되돌리기에도 화면이 깨지지 않는다.

// true = 데이터를 enc/ 암호문에서 받는다. 되돌리기 = false(평문 data/ 가 다시 올라가 있어야 한다).
const AMI_DATA_ENC = true;
const _AMI_ENC_MAGIC = 'AMIENC1\n';

/** 데이터 파일 주소 -> 실제로 받을 주소. './data/x.json' · 'data/x.json' -> './enc/data/x.json' */
function amiDataUrl(u) {
    if (!AMI_DATA_ENC) return u;
    const m = String(u).match(/^(?:\.\/)?(data\/.+)$/);
    return m ? './enc/' + m[1] : u;
}

let _amiKeyP = null;
/** 데이터 열쇠(CryptoKey). 로그인 토큰으로 RTDB 에서 한 번 받아 둔다. */
function amiDataKey() {
    if (_amiKeyP) return _amiKeyP;
    _amiKeyP = (async () => {
        const tok = (typeof authIdToken === 'function') ? await authIdToken() : null;
        if (!tok) throw new Error('로그인이 필요합니다(데이터 열쇠)');
        const q = [typeof amiRtdbRestQuery === 'function' ? amiRtdbRestQuery() : '', 'auth=' + encodeURIComponent(tok)]
            .filter(Boolean).join('&');
        const r = await fetch(amiRtdbRestBase() + '/mapSecret/dataKey.json?' + q, { cache: 'no-store' });
        if (!r.ok) throw new Error('데이터 열쇠 거절 ' + r.status);
        const b64 = await r.json();
        if (typeof b64 !== 'string') throw new Error('데이터 열쇠 없음');
        const raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
    })();
    _amiKeyP.catch(() => { _amiKeyP = null; });   // 실패하면 다음에 다시 받는다
    return _amiKeyP;
}

async function _amiGunzip(buf) {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다');
    const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(s).text();
}

/** fetch 응답 -> 원문 텍스트. 암호문이면 풀고, 평문이면 그대로. (r.text() 자리에 쓴다) */
async function amiResponseText(r) {
    const buf = new Uint8Array(await r.arrayBuffer());
    const head = new TextDecoder().decode(buf.subarray(0, _AMI_ENC_MAGIC.length));
    if (head !== _AMI_ENC_MAGIC) return new TextDecoder().decode(buf);
    const iv = buf.subarray(8, 20);
    const key = await amiDataKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf.subarray(20));
    return _amiGunzip(plain);
}

/** fetch 응답 -> JSON. (r.json() 자리에 쓴다) */
async function amiResponseJson(r) {
    return JSON.parse(await amiResponseText(r));
}
