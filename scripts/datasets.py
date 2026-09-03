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
    {"code": "r", "file": "data/rework-data.json", "category": "재방문", "uiLabel": "재방문"},
    {"code": "g", "file": "data/gapap-data.json", "category": "고압", "uiLabel": "고압철거"},
    {"code": "h", "file": "data/hapdong-data.json", "category": "합동", "uiLabel": "합동시공",
     "dateField": "작업일", "archives": ["data/hapdong-data-archive.json"]},
    {"code": "k", "file": "data/skt-data.json", "category": "skt", "uiLabel": "SKT"},
    # 한 레코드가 계기 묶음이라 통계 인덱스에서 계기 단위로 펼친다.
    {"code": "j", "file": "data/jangae-data.json", "category": "장애", "uiLabel": "장애",
     "metersKey": "계기목록"},
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
