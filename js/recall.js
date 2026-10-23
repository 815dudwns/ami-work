// Recall-suspect meters (KDN notice 2026-10-21): some AE meters must not be opened (개통 금지).
// The ban depends on the manufacture year-month = last 4 digits of the nameplate
// (e.g. 47-19-9038956-2604). Our lists do not carry that value, so the map only flags
// SUSPECT meters by the first 4 digits of 계기번호; the field worker checks the nameplate.
// Display only — never touches workStatus / Firebase / data files.
// To release the recall later, empty this table (RECALL_SUSPECT = {}).
const RECALL_SUSPECT = {
    '9419': ['2603', '2604'],          // 누리보이스 AE
    '4719': ['2603', '2604', '2408'],  // 누리플렉스 AE
    '9319': ['2405'],                  // 이엔티코리아 AE
};

// Returns the band HTML for a meter number, or '' when not suspect.
function recallBandHtml(meterNo) {
    const no = String(meterNo || '').replace(/[\s-]/g, '').toUpperCase();
    const sufs = RECALL_SUSPECT[no.slice(0, 4)];
    if (!sufs || !sufs.length) return '';
    return `<div class="recall-band">리콜 의심 — 명판 끝 4자리 ${sufs.join('·')}면 개통금지</div>`;
}
