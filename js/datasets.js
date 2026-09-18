// 데이터셋 레지스트리 — 지도·통계·인덱스 생성기가 **모두 이 파일 하나**를 읽는다.
//
// ★새 리스트를 올릴 때 여기 한 줄만 추가하면 지도 마커·카테고리 패널·통계 리스트 선택·
//   통계 인덱스가 전부 따라온다. 예전에는 같은 정보를 네 군데(js/map.js DATASETS,
//   stats.html LIST_CATEGORY·LIST_OPTS, scripts/gen_stats_index.py, js/status-key.js)에
//   따로 적어야 했고, 한 군데를 빠뜨리면 그 리스트만 통계에서 0으로 잡혔다
//   (영준님 2026-09-03 "리스트 올리면 코드가 알아서 정상으로 읽어야지").
//
// 파이썬 쪽 거울 = scripts/datasets.py. 둘이 어긋나면 scripts/test_datasets_parity.py 가 잡는다.
//
// 필드
//   code       통계 인덱스의 리스트 코드(1글자). 인덱스 파일에 `l` 로 실린다.
//   file       지도가 읽는 데이터 파일
//   archives   통계 분모에만 더하는 파일들(지도에는 안 올라가지만 누적 실적이라 분모엔 있어야 한다)
//   category   상태키 네임스페이스 이름. js/status-key.js NAMESPACED_CATEGORIES 와 짝이다
//   label      마커에 찍을 글자. null 이면 계기 개수 숫자
//   uiLabel    지도 카테고리 패널 표시명
//   statsLabel 통계 리스트 선택 버튼 표시명(없으면 uiLabel)
//   dateField  있으면 카테고리 밑에 날짜 체크박스 트리를 자동 생성
//   metersKey  한 레코드가 계기 묶음인 데이터셋의 계기 배열 필드명.
//              지정하면 통계 인덱스가 계기 단위로 펼친다(안 펼치면 한 함체가 1계기로 잡힌다)
//   onMap      false 면 지도에 안 올린다(통계 분모 전용)
//   allowGroup 지정하면 그 계정 그룹에만 보인다(js/auth.js AUTH_GROUPS). 통계 분모에서도 빠진다
const DATASET_REGISTRY = [
    { code: 's', file: './data/site-data.json', category: '실효', label: null, uiLabel: '실효계기',
      statsLabel: '실효' },
    // 재방문은 2026-09-09 리스트업에서 폐기했다. 주소 단위 workStatus 로 '재' 를 붙이던 목록이라
    //   한 계기 완료가 그 주소 전체에 '재' 를 씌웠다(창천동 5-49 20계기 전건 오탐). 계기 단위로 다시
    //   세니 127건 중 재방문으로 남을 것이 하나도 없었다 — 82건은 애초에 미착수(실효), 43건은 이미 처리됨.
    //   진짜 재방문은 '시공했는데 30일 넘게 LP 없음' 이고, 그건 보강현황으로 매번 다시 계산한다.
    // { code: 'r', file: './data/rework-data.json', category: '재방문', label: '재', uiLabel: '재방문' },
    // 고압철거 — 2026-09-09 지도에서 내렸다(영준님 지시). Firebase `|고압` 215키가
    //   완료 177 · 불가 33 · 보류 1 · 기록없음 0 으로 **남은 할 일이 0건**이다.
    //   ★같은 날 "미착수 4건이 남았다"며 잠깐 되살렸다가 되돌렸다. 그 4건은 미착수가 아니라
    //     **키 이스케이프 때문에 대조에서만 안 맞은 것**이었다 — 주소에 `.` 나 `/` 가 들어 있으면
    //     앱은 encodeKey 로 바꿔 저장하는데(`.`->`_dot_`, `/`->`_sl_`) 맨 주소로 대조하면
    //     그 개소만 통째로 어긋나 '기록 없음 = 미착수' 로 잡힌다.
    //     (공덕역 지하철·한강철교 LTE RRU·염리동 WIBRO·소망교회 무인중계기 — 실제로는 완료 3·불가 1)
    //     집계할 때는 반드시 scripts/status_key.py 의 encode_key 를 통과시켜라.
    //   ★파일과 Firebase `|고압` workStatus 는 남긴다(누적 실적·재사용).
    //     주석 처리가 아니라 onMap:false 인 이유는 장애 항목 주석과 같다.
    { code: 'g', file: './data/gapap-data.json', category: '고압', label: '고', uiLabel: '고압철거',
      onMap: false },
    // 합동시공 — 다른 지역 계기팀이 계기만 갈고 간 개소(모뎀 미시공). 매일 그날치가 쌓이므로
    //   dateField 를 주면 카테고리 밑에 날짜 체크박스 트리가 자동 생성된다(populateCategoryFilter).
    //   ★지도에는 최근 며칠치만 남기고 오래된 작업일은 백업으로 뺀다(build_hapdong_data.py).
    //     통계는 누적 실적이라 그 백업까지 분모에 넣는다.
    { code: 'h', file: './data/hapdong-data.json', category: '합동', label: '합', uiLabel: '합동시공',
      dateField: '작업일', archives: ['./data/hapdong-data-archive.json'] },
    // SKT 중계기 — SKT 중계기가 붙은 개소에 AMI 모뎀을 설치해 달라는 요청(주덕기 반장 2026-08-21).
    //   ★올라간 것은 **미작업 41건뿐**이다. 완료 187·작업불요 53 을 함께 올리면 할 일이 묻힌다
    //   (영준님 지시). 원본 281건은 data/skt-full-20260814.json 에 따로 보관한다.
    { code: 'k', file: './data/skt-data.json', category: 'skt', label: 'SK', uiLabel: 'SKT' },
    // 장애 — 주덕기 과장 '모뎀작업리스트' 첫 시트(장애 대상). 다른 데이터셋과 단위가 다르다:
    //   한 레코드 = 모뎀 MAC 그룹 하나(계기가 아니라). `계기목록`에 그 그룹 계기가 전부 들어 있고,
    //   장애 시트에 있던 계기만 `장애:true` 다. 나머지는 시트2(모뎀작업리스트)에서 끌어온 정상 계기다.
    //   ★한 주소에 MAC 이 둘 이상인 곳이 20개 있다 — 모달에서 MAC 별로 트리를 따로 그린다.
    //   ★2026-09-09 저녁 지도에서 내렸다(영준님 지시). 한전 9/8 보강현황과 대조하니 2,804계기가
    //     LP 수신 해결 1,894 · 시공했고 LP 대기 324 · 보강현황에 없음 586 으로 **미착수 0** 이었다.
    //   ★재방문과 달리 파일은 지우지 않는다 — 재방문은 판정 자체가 틀린 목록이라 버렸고,
    //     장애는 판정이 맞았고 다 끝난 것이라 보관한다(통계 분모·재사용).
    //     Firebase 의 `|장애` workStatus 253개도 작업 이력이라 남긴다.
    //   ★주석 처리가 아니라 `onMap: false` 다 — 주석 처리하면 stats_sources() 가 이 파일을 못 읽어
    //     통계 분모에서도 함께 빠진다(지시는 '지도에서만 내린다' 였다).
    //     지도에 되살리려면 onMap 을 지우고 map.js 의 ALL 에 '장애' 를 다시 넣으면 된다.
    //   ※같은 날 고압철거도 함께 내렸다가 되살렸다 — 고압은 미착수 4건이 남아 있었다.
    //     장애는 미착수 0건이라 내린 채로 둔다.
    { code: 'j', file: './data/jangae-data.json', category: '장애', label: null, uiLabel: '장애',
      metersKey: '계기목록', onMap: false },
    // LP 무기록(확인용) — 보강현황 9/8판에서 **한전이 숨긴 행**(우리 대상에서 뺀 것) 중
    //   awms 26년시공앱·불가앱에 우리 기록이 전혀 없는데 LP 는 올라온 개소(2026-09-15 전 지사로 확대).
    //   누가 어떻게 붙였는지 확인하려고 띄우는 **임시 리스트**다(영준님 2026-09-15).
    //   ★allowGroup — 그 그룹 계정에만 보인다. 작업자 일반에게는 할 일이 아니다.
    //     2026-09-15: 우영준(admin) 단독 -> **윤용운 반장(user09) 추가**(영준님 지시).
    //     ★계정 목록은 여기 적지 않는다 — js/auth.js 의 AUTH_GROUPS 가 단일 출처이고
    //       판정도 authAllowsGroup() 한 곳이 한다. 계정을 더 열 때는 그 표만 고친다.
    //   ★통계 분모에 넣지 않는다(실적이 아니라 확인용). archives 도 없다.
    //   ★추가 필터 없다 — SMGW-C 도 포함한다(영준님 정정). 지도에 싣는 계기는 **신설계기**다.
    //   확인이 끝나면 통째로 내린다(onMap:false 가 아니라 이 줄을 지우고 파일도 지운다).
    //   ★label 은 null 이다 = 마커에 **계기 개수**를 찍는다(실효와 같다).
    //     이 리스트는 한 DCU·한 모뎀에 여러 계기가 물린 구조라(2,126건/1,038개소)
    //     개소당 몇 계기인지가 현장에서 곧 정보다.
    //     ※예전엔 'LP' 였는데 **화면에 쓰이지 않는 죽은 값**이었다 — createMarker 가
    //       카테고리로 분기하는데 LP무기록 분기가 없어 이미 개수가 찍히고 있었다.
    { code: 'n', file: './data/lpnoapp-data.json', category: 'LP무기록', label: null,
      uiLabel: 'LP 무기록(확인용)', allowGroup: 'staff' },
    // 25년 미청구 — 한전 원장(미청구2.xlsx)에서 상태='미청구' 인 계기 중 우리가 갈 곳.
    //   대상 정의: 미청구 13,182 − 고압 637 − modem_work(20260908) 945 − Sheet2 2,654 = 8,994
    //   ★계기교체 축은 제외 사유가 아니다(영준님 2026-09-18) — 25년 미청구는 **모뎀** 공사
    //     건이고, 그 개소 계기가 뒤에 교체·재사용됐어도 달려 있는 모뎀은 25년 자재 그대로다.
    //     같은 사업(모뎀)으로 26년에 다시 시공한 것만 뺀다. 그게 modem_work 다.
    //   ★여기 올라간 것은 **주소를 확보한 7,366계기**뿐이다. 주소가 없어 좌표를 못 만든
    //     1,628계기는 data/michunggu-pending.json 에 있고, 주덕기 과장 회신이 오면 승격한다.
    //   ★label: null = 마커에 **계기 개수**를 찍는다(실효와 같다). 한 모뎀에 여러 계기가
    //     물린 구조라 개소당 몇 계기인지가 현장에서 곧 작업량이다.
    //   ★allowGroup:'staff' — 작업 지시 전에 작업자 화면에 뜨면 혼선이 생긴다(영준님).
    //     공개 시점은 PM 판단이고, 계정 목록은 js/auth.js 의 AUTH_GROUPS 가 단일 출처다.
    //   생성 스크립트 scripts/build_michunggu_dataset_20260918.py
    { code: 'm', file: './data/michunggu-data.json', category: '미청구', label: null,
      uiLabel: '25년 미청구', statsLabel: '25년 미청구', allowGroup: 'staff' },
    // 완료 아카이브 — 실효에서 완료돼 빠진 건들. 지도에는 안 올라가고 통계 분모에만 들어간다.
    //   파일이 날짜별로 늘어나므로 glob 으로 잡는다(archivesGlob).
    { code: 'a', category: '완료아카이브', onMap: false, statsLabel: '완료 아카이브',
      archivesGlob: 'data/site-data-completed-archive-*.json' },
    // TOU 는 내려둔 상태다(2026-08-02). 되살리려면 아래 줄을 되돌리고
    //   getSelectedCategories 의 ALL 에도 다시 넣어야 한다.
    // { code: 't', file: './data/tou-data.json', category: 'tou', label: 'TOU', uiLabel: 'TOU' },
];

/** 계정 제한이 걸린 데이터셋이 이 사용자에게 보이는가 (2026-09-15 신설).
 *
 * ★왜 여기서 거르나: 지도는 DATASETS 를 **다섯 군데**에서 쓴다(로드·카테고리 패널·
 *   선택 카테고리·마커·날짜 트리). 화면마다 계정을 검사하면 한 군데만 빠뜨려도 새어 나간다.
 *   목록 자체를 걸러 두면 아래 모든 곳이 자동으로 따라온다.
 * ★실제 판정은 js/auth.js 의 authAllows() 가 한다 — '관리자 + 윤용운' 조합이
 *   map.html·stats.html 에도 있어서, 판정을 한 함수로 모아 두지 않으면 또 어긋난다.
 * ★평가 시점이 안전한 이유: map.html 은 이 파일보다 **먼저** authRequire() 를 부른다
 *   (미로그인이면 로그인 화면으로 보내므로, 여기 도달했다는 건 세션이 있다는 뜻이다).
 *   stats.html 도 auth.js 를 먼저 싣는다.
 * ★세션을 못 읽으면 **숨기는 쪽**으로 넘어진다 — 새는 것보다 안 보이는 편이 낫다.
 */
function datasetVisibleToUser(d) {
    if (!d.allowGroup) return true;
    // ★인증 계층이 아예 없는 곳(node 도구·검사 드라이버)은 '화면'이 아니다 — 전체를 본다.
    //   여기서 숨기면 scripts/test_status_key_parity.py 가 파이썬 거울과 어긋났다고 잡는다.
    //   브라우저 화면에는 auth.js 가 항상 먼저 실려 있으므로 이 갈래로 빠지지 않는다.
    if (typeof authAllowsGroup !== 'function') return true;
    try {
        return authAllowsGroup(d.allowGroup);
    } catch (e) {
        return false;
    }
}

// 지도에 올리는 데이터셋만. ★이름이 `DATASETS` 인 이유: js/map.js 가 이 이름을 쓴다.
//   ★map.js 에서 다시 선언하면 안 된다 — 클래식 스크립트는 전역을 공유해서 const 중복선언이
//     SyntaxError 를 내고 map.js 가 통째로 안 돈다(2026-09-03 지도 먹통 사고).
const DATASETS = DATASET_REGISTRY.filter(
    d => d.onMap !== false && d.file && datasetVisibleToUser(d));
const MAP_DATASETS = DATASETS;

/** 통계 인덱스 코드 -> 상태키 카테고리. 네임스페이스 판정에 쓴다. */
const DATASET_CATEGORY_BY_CODE = Object.fromEntries(
    DATASET_REGISTRY.filter(d => d.category).map(d => [d.code, d.category])
);

/** 통계 리스트 선택 버튼 목록. '전체 누적'은 코드가 아니라 모드라 따로 붙인다.
 *
 * done: 지도에서 내린 리스트 = 남은 할 일이 없는 '끝난 실적'이다. 통계는 누적이라 분모에는
 *   그대로 두되, 화면에서 '지금 할 일'과 섞이면 진척을 오해한다(영준님 2026-09-09).
 *   ★onMap 에서 파생한다 — 따로 표를 두면 리스트를 내릴 때 한쪽을 빠뜨린다.
 */
//   ★계정 제한이 걸린 리스트는 통계 선택지에서도 뺀다(확인용이라 실적 분모가 아니다).
const DATASET_STATS_OPTS = DATASET_REGISTRY
    .filter(d => datasetVisibleToUser(d) && !d.allowGroup)
    .map(d => ({
        key: d.code, label: d.statsLabel || d.uiLabel || d.category,
        done: d.onMap === false,
    }));

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DATASET_REGISTRY, DATASETS, MAP_DATASETS,
                       DATASET_CATEGORY_BY_CODE, DATASET_STATS_OPTS };
}
