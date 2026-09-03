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
const DATASET_REGISTRY = [
    { code: 's', file: './data/site-data.json', category: '실효', label: null, uiLabel: '실효계기',
      statsLabel: '실효' },
    { code: 'r', file: './data/rework-data.json', category: '재방문', label: '재', uiLabel: '재방문' },
    { code: 'g', file: './data/gapap-data.json', category: '고압', label: '고', uiLabel: '고압철거' },
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
    { code: 'j', file: './data/jangae-data.json', category: '장애', label: null, uiLabel: '장애',
      metersKey: '계기목록' },
    // 완료 아카이브 — 실효에서 완료돼 빠진 건들. 지도에는 안 올라가고 통계 분모에만 들어간다.
    //   파일이 날짜별로 늘어나므로 glob 으로 잡는다(archivesGlob).
    { code: 'a', category: '완료아카이브', onMap: false, statsLabel: '완료 아카이브',
      archivesGlob: 'data/site-data-completed-archive-*.json' },
    // TOU 는 내려둔 상태다(2026-08-02). 되살리려면 아래 줄을 되돌리고
    //   getSelectedCategories 의 ALL 에도 다시 넣어야 한다.
    // { code: 't', file: './data/tou-data.json', category: 'tou', label: 'TOU', uiLabel: 'TOU' },
];

// 지도에 올리는 데이터셋만. ★이름이 `DATASETS` 인 이유: js/map.js 가 이 이름을 쓴다.
//   ★map.js 에서 다시 선언하면 안 된다 — 클래식 스크립트는 전역을 공유해서 const 중복선언이
//     SyntaxError 를 내고 map.js 가 통째로 안 돈다(2026-09-03 지도 먹통 사고).
const DATASETS = DATASET_REGISTRY.filter(d => d.onMap !== false && d.file);
const MAP_DATASETS = DATASETS;

/** 통계 인덱스 코드 -> 상태키 카테고리. 네임스페이스 판정에 쓴다. */
const DATASET_CATEGORY_BY_CODE = Object.fromEntries(
    DATASET_REGISTRY.filter(d => d.category).map(d => [d.code, d.category])
);

/** 통계 리스트 선택 버튼 목록. '전체 누적'은 코드가 아니라 모드라 따로 붙인다. */
const DATASET_STATS_OPTS = DATASET_REGISTRY.map(d => ({
    key: d.code, label: d.statsLabel || d.uiLabel || d.category,
}));

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DATASET_REGISTRY, DATASETS, MAP_DATASETS,
                       DATASET_CATEGORY_BY_CODE, DATASET_STATS_OPTS };
}
