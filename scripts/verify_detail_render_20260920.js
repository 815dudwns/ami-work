// 디테일 렌더 대조표 — **데이터 보유 vs 화면 출현**을 실제 detail.js 코드로 확인한다.
//   왜: 2026-09-20 에 '데이터엔 있는데 화면에 없는' 누락이 두 번 연속 나왔다
//   (불가사유 5,694건 · DCU통신방식 9,121건). 눈으로 훑는 검사로는 또 놓친다.
//   그래서 detail.js 의 렌더 구간을 **그대로 떼어다 돌려** 출력 문자열에 값이 있는지 센다.
//
//   실행: node scripts/verify_detail_render_20260920.js
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/detail.js'), 'utf8');

// 1) 헬퍼 함수들 — 이름으로 잘라 온다(본문을 베끼면 원본과 어긋난다)
function grab(name) {
    const i = src.indexOf(`function ${name}(`);
    if (i < 0) throw new Error(`함수 못 찾음: ${name}`);
    let d = 0, started = false;
    for (let j = i; j < src.length; j++) {
        if (src[j] === '{') { d++; started = true; }
        else if (src[j] === '}') { d--; if (started && d === 0) return src.slice(i, j + 1); }
    }
    throw new Error(`끝 못 찾음: ${name}`);
}
const helpers = ['poleNoOf', 'poleIdOf', 'isPoleCommon', 'poleDisplay',
                 'dcuLedgerLine', 'poleMeterForDisplay', 'michungguLp',
                 'lpSummary'].map(grab).join('\n');

// 2) 계기 한 줄의 렌더 구간 — detailParts 선언부터 subDetails 직전까지
const a = src.indexOf('const detailParts = [];');
const b = src.indexOf('const subDetails = subParts.length');
if (a < 0 || b < 0) throw new Error('렌더 구간을 못 찾았다 — detail.js 구조가 바뀌었다');
const body = src.slice(a, b);

const render = new Function('meter', 'currentAddress', 'commonDcuShown', `
${helpers}
${body}
return { detail: detailParts.join(', '), sub: subParts.join(' · ') };
`);

// 3) PM 이 디테일에 넣으라고 한 필드 전체
//    label = 화면에서 그 값이 나왔는지 확인할 때 쓰는 비교값 계산(기본은 값 그대로 포함되는지)
const FIELDS = [
    '지사', '주소', '도로명주소', '계기번호', '계기타입', '고객번호', '통신방식',
    '변대주', '변대주번호', 'DCUID', '모뎀MAC', '최종시공일', '구분', '공종',
    'M/S', '집단', '485타입', '케이블', '커넥터', '시설형태', '신호레벨',
    '추가계기', '비고1', '비고2', '앱변대주', '인입주', '공동주택명', '상호',
    '계약종별', '검침방법', 'dcu_철거예정', 'DCU통신방식', '회선상태', '철거판정',
    'W_25대상', 'LP', '불가사유', '불가상세',
];
// 계기목록 바깥(모달 헤더·상단 공통줄)에서 그려지는 값 — 이 스크립트가 보는 구간에 없다.
const ELSEWHERE = {
    주소: '모달 헤더(지번)', 도로명주소: '모달 헤더(도로명)',
    계기번호: '큰 글씨(4구간 색분리)', 계기타입: '큰 글씨(parseType)',
    dcu_철거예정: '상단 공통줄(DCU 철거예정 태그)',
    // ★일부러 안 그리는 것 — 대장에 없는 개소의 원장 DCUID(25미청구 125건).
    //   대장미등재 = 'DCU 없음' 이라는 판별이라, 원장 값을 DCU 자리에 그리면 거짓이 된다
    //   (영준님 2026-09-20). 데이터에는 남아 있다.
    DCUID: '차이분 = 대장미등재 개소의 원장 DCUID (의도적 비표시, DCU 없음)',
};

function check(file, listName) {
    const rows = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    const out = [];
    for (const f of FIELDS) {
        const have = rows.filter(r => {
            const v = r[f];
            if (v == null) return false;
            if (typeof v === 'object') return Object.keys(v).length > 0;
            return String(v).trim() !== '';
        });
        if (!have.length) { out.push([f, 0, 0, '데이터 없음']); continue; }
        // 값이 있는 레코드 전부를 렌더해 화면 문자열에 값이 들어갔는지 센다
        let shown = 0;
        for (const r of have) {
            const { detail, sub } = render(r, r.주소, false);
            const html = detail + ' · ' + sub;
            let needle;
            if (f === 'LP') needle = null;                     // 값이 변환되므로 라벨로 본다
            else if (f === '최종시공일') needle = null;         // 표시할 때 끊어 준다
            else needle = String(r[f]).trim();
            const ok = needle ? html.includes(needle)
                : (f === 'LP' ? /(^|·)\s*LP\s/.test(html) : html.includes('최종시공일'));
            if (ok) shown++;
        }
        const note = shown === have.length ? ''
            : (ELSEWHERE[f] ? ELSEWHERE[f] : `★${have.length - shown}건 안 나옴`);
        out.push([f, have.length, shown, note]);
    }
    console.log(`\n=== ${listName} (${file}) · ${rows.length.toLocaleString()}건 ===`);
    console.log('필드'.padEnd(14) + '데이터'.padStart(8) + '화면'.padStart(8) + '  비고');
    for (const [f, h, s, n] of out) {
        console.log(f.padEnd(14) + (h ? h.toLocaleString() : '-').padStart(8)
            + (h ? s.toLocaleString() : '-').padStart(8) + '  ' + n);
    }
    return out;
}

check('data/michunggu-data.json', '25미청구');
check('data/michunggu-bulga-data.json', '25년 미청구불가');
