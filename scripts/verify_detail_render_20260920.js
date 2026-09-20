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

// ★비교 전에 태그를 턴다. 안 그러면 값 중간에 태그가 끼는 표기를 놓친다 —
//   DCU ID 는 '<span>0329H751</span><span class=seg-dup>44</span>' 로 그려져서
//   화면엔 0329H75144 로 보이는데 문자열 검사는 실패했다(2026-09-20 실측, 5,844건 오탐).
const strip = (h) => String(h).replace(/<[^>]+>/g, '');

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
    '계약종별', '검침방법', 'dcu_철거예정', 'DCU통신방식', '회선상태', '철거판정', 'DCU차수',
    'W_25대상', 'LP', '불가사유', '불가상세',
    // 불가 원장 추가분(PM 승인 2026-09-20)
    '앱넘버', '순번', '우선일자', '지도구분', '철거구분', '철거날짜',
    '함체봉인1', '함체봉인2', '계기봉인1', '계기봉인2', '외부봉인1', '외부봉인2',
    '변대주번호_원장', '변대주_원장',
];
// 계기목록 바깥(모달 헤더·상단 공통줄)에서 그려지는 값 — 이 스크립트가 보는 구간에 없다.
const ELSEWHERE = {
    주소: '모달 헤더(지번)', 도로명주소: '모달 헤더(도로명)',
    계기번호: '큰 글씨(4구간 색분리)', 계기타입: '큰 글씨(parseType)',
    dcu_철거예정: '상단 공통줄(DCU 철거예정 태그)',
    // ★일부러 안 그리는 것 — 대장에 없는 개소의 원장 DCUID(25미청구 125건).
    //   대장미등재 = 'DCU 없음' 이라는 판별이라, 원장 값을 DCU 자리에 그리면 거짓이 된다
    //   (영준님 2026-09-20). 데이터에는 남아 있다.
    DCUID: '차이분 = 대장미등재 개소의 원장 DCUID (의도적 비표시 — 대장에 없으면 빈칸)',
    // 상호와 같은 값이면 한 번만 그린다(기존 동작). 같은 글자를 두 번 찍지 않는다.
    공동주택명: '차이분 = 상호와 같은 값이라 중복 제거',
};

// 기본값이라 화면에서 숨기는 상태값(영준님 2026-09-20). 데이터에는 전부 남는다.
const HIDE_DEFAULT = { 회선상태: '개통', 철거판정: '미판정' };

function check(file, listName, intended) {
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
        // 일부러 안 그리는 필드 — **라벨**로 센다.
        //   값으로 세면 다른 줄에 같은 글자가 있을 때 걸려 올라온다(불가 통신방식 234건이
        //   그랬다 — 상단 DCU 통신방식 값과 겹친 것이지 이 줄이 그려진 게 아니다).
        if (intended && intended[f] && intended[f].label) {
            const { note, label } = intended[f];
            const drawn = have.filter(r => strip(render(r, r.주소, false).sub).includes(label)).length;
            out.push([f, have.length, drawn, drawn === 0 ? note : `★${drawn}건 그려졌다 — 의도 위반`]);
            continue;
        }
        // 기본값을 숨기는 필드 — 분모는 '기본값이 아닌 건' 이다.
        //   숨긴 건이 미스로 잡히면 없는 버그를 쫓게 된다(회선상태 '개통'·철거판정 '미판정').
        if (HIDE_DEFAULT[f]) {
            const hv = HIDE_DEFAULT[f];
            const vis = have.filter(r => String(r[f]).trim() !== hv);
            const shown = vis.filter(r => {
                const o = render(r, r.주소, false);
                return strip(o.detail + ' · ' + o.sub).includes(String(r[f]).trim());
            }).length;
            out.push([f, have.length, shown,
                `표시대상 ${vis.length.toLocaleString()} (기본값 '${hv}' ${(have.length - vis.length).toLocaleString()}건 숨김)`
                + (shown === vis.length ? '' : ` ★${vis.length - shown}건 안 나옴`)]);
            continue;
        }
        // 값이 있는 레코드 전부를 렌더해 화면 문자열에 값이 들어갔는지 센다
        let shown = 0;
        for (const r of have) {
            const { detail, sub } = render(r, r.주소, false);
            const html = strip(detail + ' · ' + sub);
            let needle;
            if (f === 'LP') needle = null;                     // 값이 변환되므로 라벨로 본다
            else if (f === '최종시공일') needle = null;         // 표시할 때 끊어 준다
            else needle = String(r[f]).trim();
            const ok = needle ? html.includes(needle)
                : (f === 'LP' ? /(^|·)\s*LP\s/.test(html) : html.includes('최종시공일'));
            if (ok) shown++;
        }
        const note = shown === have.length ? ''
            : ((intended && intended[f]) || ELSEWHERE[f] || `★${have.length - shown}건 안 나옴`);
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
check('data/michunggu-bulga-data.json', '25년 미청구불가', {
    // 모뎀을 못 단 개소라 '현재 통신방식'이라 부를 것이 없다(영준님 2026-09-20).
    //   계기가 원래 쓰던 방식이고, 상단 DCU 통신방식과 헷갈리기만 한다. 데이터에는 남아 있다.
    통신방식: {
        label: '현재 통신방식',
        note: '일부러 안 그림 — 모뎀 MAC 칸이 없는 리스트(모뎀 미시공). 라벨 0건 확인',
    },
});
