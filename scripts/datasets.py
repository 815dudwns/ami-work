"""데이터셋 레지스트리 (파이썬 거울) — 정본은 js/datasets.js.

새 리스트는 **js/datasets.js 에 한 줄 추가하고 여기에도 같은 줄을 넣는다.**
둘이 어긋나면 scripts/test_datasets_parity.py 가 잡는다(CI 대신 손으로 돌린다).

필드 뜻은 js/datasets.js 주석 참고. 파이썬에서 쓰는 것만 담는다.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DATASETS = [
    {"code": "s", "file": "data/site-data.json", "category": "실효",
     "uiLabel": "실효계기", "statsLabel": "실효"},
    # 재방문 폐기(2026-09-09) — js/datasets.js 주석 참조
    # 고압철거 지도 내림(2026-09-09) — 남은 할 일 0건. "미착수 4건" 은 키 이스케이프 오판이었다.
    #   파일·workStatus 는 남기고 onMap=False 라 통계 분모에는 그대로 있다. js/datasets.js 주석 참조
    {"code": "g", "file": "data/gapap-data.json", "category": "고압", "uiLabel": "고압철거",
     "onMap": False},
    {"code": "h", "file": "data/hapdong-data.json", "category": "합동", "uiLabel": "합동시공",
     "dateField": "작업일", "archives": ["data/hapdong-data-archive.json"]},
    {"code": "k", "file": "data/skt-data.json", "category": "skt", "uiLabel": "SKT"},
    # 한 레코드가 계기 묶음이라 통계 인덱스에서 계기 단위로 펼친다.
    # 장애 지도 내림(2026-09-09) — 미착수 0건. 파일·workStatus 는 남긴다.
    #   onMap=False 라 통계 분모에는 그대로 있다. js/datasets.js 주석 참조
    {"code": "j", "file": "data/jangae-data.json", "category": "장애", "uiLabel": "장애",
     "metersKey": "계기목록", "onMap": False},
    # LP 무기록(확인용) — 계정 제한 임시 리스트(관리자 + 윤용운). js/datasets.js 주석 참조.
    #   ★allowGroup 이 걸린 리스트는 통계 분모에 넣지 않는다(실적이 아니다) — stats_sources() 가 건너뛴다.
    #   계정 목록은 js/auth.js AUTH_GROUPS 가 단일 출처다(여기엔 그룹 이름만 둔다).
    {"code": "n", "file": "data/lpnoapp-data.json", "category": "LP무기록",
     "uiLabel": "LP 무기록(확인용)", "allowGroup": "staff"},
    # 25년 미청구 — 주소 확보분 7,366만 지도에 올린다(결손 1,628 은 michunggu-pending.json).
    #   ★allowGroup 이 걸려 있어 stats_sources() 가 건너뛴다 = 통계 분모에 안 들어간다.
    #     작업 지시가 나가고 공개로 바꿀 때 그 점을 함께 판단해야 한다. js/datasets.js 주석 참조
    {"code": "m", "file": "data/michunggu-data.json", "category": "미청구",
     "uiLabel": "25년 미청구", "statsLabel": "25년 미청구", "allowGroup": "staff",
     "statsEvenIfGroup": True},
    # 지도에는 안 올라가고 통계 분모에만 들어간다.
    {"code": "a", "category": "완료아카이브", "onMap": False, "statsLabel": "완료 아카이브",
     "archivesGlob": "data/site-data-completed-archive-*.json"},
]

MAP_DATASETS = [d for d in DATASETS if d.get("onMap", True) and d.get("file")]
CATEGORY_BY_CODE = {d["code"]: d["category"] for d in DATASETS if d.get("category")}


def stats_sources():
    """통계 인덱스가 읽을 (코드, 파일경로, metersKey) 목록. 없는 파일은 건너뛴다."""
    import glob
    out = []
    for d in DATASETS:
        # 확인용 계정제한 리스트는 실적 분모가 아니다 — 인덱스에 넣지 않는다.
        #   ★예외: statsEvenIfGroup 이 True 면 넣는다. 지도는 아직 일부 계정에만 열어두고
        #     통계에는 실적으로 잡아야 하는 리스트가 있다(25년 미청구 — 영준님 2026-09-18).
        if d.get("allowGroup") and not d.get("statsEvenIfGroup"):
            continue
        paths = []
        if d.get("file"):
            paths.append(ROOT / d["file"])
        for a in d.get("archives", []):
            paths.append(ROOT / a)
        if d.get("archivesGlob"):
            paths += [Path(p) for p in sorted(glob.glob(str(ROOT / d["archivesGlob"])))]
        for p in paths:
            if p.exists():
                out.append((d["code"], p, d.get("metersKey")))
    return out
