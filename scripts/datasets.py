"""데이터셋 레지스트리 (파이썬 거울) — 정본은 js/datasets.js.

새 리스트는 **js/datasets.js 에 한 줄 추가하고 여기에도 같은 줄을 넣는다.**
둘이 어긋나면 scripts/test_datasets_parity.py 가 잡는다(CI 대신 손으로 돌린다).

필드 뜻은 js/datasets.js 주석 참고. 파이썬에서 쓰는 것만 담는다.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

DATASETS = [
    {"code": "s", "file": "data/site-data.json", "category": "실효",
     "uiLabel": "실효계기", "statsLabel": "실효",
     # 완료·불가 개소 아카이브(2026-11-07) — 자기 리스트에 붙인다. 'a'(완료아카이브) 글롭과 이름이 겹치지 않게 silhyo-
     "archivesGlob": "data/silhyo-completed-archive-*.json"},
    # 선조치 — KDN 보강공사 추가분(2026-10-30). 상태키 '주소|선조치'.
    #   2026-11-02 통계에 자기 리스트로 넣음(noStats 뺌, 영준님 "통계도 선조치 안 해 놨네").
    {"code": "p", "file": "data/seonjochi-data.json", "category": "선조치", "uiLabel": "선조치",
     "statsLabel": "선조치", "archivesGlob": "data/seonjochi-completed-archive-*.json"},
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
    # LP 무기록(확인용) — 관리자 혼자(allowGroup owner). js/datasets.js 주석 참조. 2026-10-30 복원.
    #   ★allowGroup 이 걸린 리스트는 통계 분모에 넣지 않는다(실적이 아니다) — stats_sources() 가 건너뛴다.
    {"code": "n", "file": "data/lpnoapp-data.json", "category": "LP무기록",
     "uiLabel": "LP 무기록(확인용)", "allowGroup": "owner"},
    # 25년 미청구 — 주소 확보분 7,366만 지도에 올린다(결손 1,628 은 michunggu-pending.json).
    #   ★allowGroup 이 걸려 있어 stats_sources() 가 건너뛴다 = 통계 분모에 안 들어간다.
    #     작업 지시가 나가고 공개로 바꿀 때 그 점을 함께 판단해야 한다. js/datasets.js 주석 참조
    {"code": "m", "file": "data/michunggu-data.json", "category": "미청구",
     "uiLabel": "25미청구", "statsLabel": "25미청구",
     "archivesGlob": "data/michunggu-completed-archive-*.json"},
    # 25년 미청구불가 — js/datasets.js 주석 참조. 전 작업자 공개.
    {"code": "u", "file": "data/michunggu-bulga-data.json", "category": "미청구불가",
     "uiLabel": "25년 미청구불가", "statsLabel": "25년 미청구불가",
     "archivesGlob": "data/michunggu-bulga-completed-archive-*.json"},
    # 지도에는 안 올라가고 통계 분모에만 들어간다.
    {"code": "a", "category": "완료아카이브", "onMap": False, "statsLabel": "완료 아카이브",
     "archivesGlob": "data/site-data-completed-archive-*.json"},
    # 광명지사 — 다른 회사 작업분, kmtest 전용(js/datasets.js 주석 참조).
    #   allowGroup 이고 statsEvenIfGroup 이 없어 stats_sources() 가 건너뛴다 = 통계 분모 제외.
    {"code": "w", "file": "data/gwangmyeong-data.json", "category": "광명", "uiLabel": "광명지사",
     "allowGroup": "kmtest", "dateField": "묶음"},
    # 추가 — 지도에서 직접 찍어 넣은 개소(2026-10-31). 파일 없음(workStatus site 기록). noStats = 통계 분모 제외.
    {"code": "x", "category": "추가", "uiLabel": "추가", "source": "workStatus", "noStats": True},
]

MAP_DATASETS = [d for d in DATASETS if d.get("onMap", True) and d.get("file")]
CATEGORY_BY_CODE = {d["code"]: d["category"] for d in DATASETS if d.get("category")}


def archive_paths(code):
    """그 리스트의 아카이브 파일들(archives + archivesGlob, 있는 것만). 지도 파일은 빼고."""
    import glob
    d = next(x for x in DATASETS if x["code"] == code)
    paths = [ROOT / a for a in d.get("archives", [])]
    if d.get("archivesGlob"):
        paths += [Path(p) for p in sorted(glob.glob(str(ROOT / d["archivesGlob"])))]
    return [p for p in paths if p.exists()]


def archived_meters(code, norm=lambda v: str(v or "").strip()):
    """그 리스트 아카이브에 이미 들어간 계기번호 집합(norm 적용).

    ★빌더가 다시 돌 때 끝나서 아카이브로 옮긴 계기를 지도에 되살리지 않게 쓴다(2026-11-07).
    """
    import json
    out = set()
    for p in archive_paths(code):
        for r in json.loads(p.read_text(encoding="utf-8")):
            v = norm(r.get("계기번호"))
            if v:
                out.add(v)
    return out


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
        if d.get("noStats"):
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
