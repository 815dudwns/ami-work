// utils.js — 유틸리티 함수

// KST ISO 문자열 생성 (예: "2026-05-27T14:30:00+09:00")
function isoKst(d = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    const p = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(d);
    const g = t => p.find(x => x.type === t).value;
    return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}+09:00`;
}

// KST 기준 "M월 D일" 문자열 반환 (예: "5월 27일")
function kstDayLabel(d) {
    const p = new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: 'numeric', day: 'numeric'
    }).formatToParts(d);
    const month = p.find(x => x.type === 'month').value;
    const day   = p.find(x => x.type === 'day').value;
    return `${month}월 ${day}일`;
}


// 계기번호 앞 2~4자리 코드로 타입 판별 (전부 대문자 표기: E / AE / G / AMIGO)
function parseType(meterNo) {
    const code = (meterNo || '').substring(2, 4);
    if (code === '17') return 'E';
    if (code === '19') return 'AE';
    if (['25','26','27','45','46','47'].includes(code)) return 'G';
    if (code === '53' || code === '55') return 'AMIGO';
    return null;
}

// 외부 표기(엑셀/한전 원본) → 우리 표기로 정규화. 계기번호 기반(parseType)이 1순위, 실패 시 사용
function normalizeType(raw) {
    if (!raw) return '?';
    const s = String(raw).trim().toUpperCase();
    if (s === 'EA' || s === 'AE') return 'AE';
    if (s === 'E') return 'E';
    if (s === 'G') return 'G';
    if (s === 'AMIGO' || s === '보안계기' || raw === '보안계기') return 'AMIGO';
    return s;
}

// 계기번호를 클립보드에 복사하고 토스트 표시
let toastTimer = null;
function copyMeterNo(no) {
    navigator.clipboard.writeText(no).then(() => {
        const t = document.getElementById('toast');
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
    });
}
