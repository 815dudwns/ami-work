#!/usr/bin/env python3
"""
구로금천 14,449건 전 행에 행정동 + 동그룹 라벨 부착
입력: 엑셀 Sheet1 (헤더 포함 14,450행)
출력: data/guro-grouped.csv, data/guro-group-summary.txt
"""
import csv, json, time, requests, openpyxl
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

XLSX = '/Users/woodelight/.claude/uploads/46113083-8d23-4581-8d55-c7ab8cc2b64a/4f5256db-__________2026___.xlsx'
OUT_DIR = Path('/Users/woodelight/Projects/ami-work/data')
CSV_OUT = OUT_DIR / 'guro-grouped.csv'
TXT_OUT = OUT_DIR / 'guro-group-summary.txt'
CACHE_FILE = OUT_DIR / 'guro-addr-cache.json'

from _env import require_env

API_KEY = require_env('KAKAO_REST_API_KEY')

# ── 동그룹 매핑 ──────────────────────────────────────────────
GROUP_MAP = {
    '개봉1동': '개봉1동',
    '개봉2동': '개봉남부·가리봉',
    '개봉3동': '개봉남부·가리봉',
    '가리봉동': '개봉남부·가리봉',
    '독산1동': '독산북부',
    '독산2동': '독산북부',
    '독산3동': '독산남부',
    '독산4동': '독산남부',
    '가산동':  '가산동',
    '시흥1동': '시흥동',
    '시흥2동': '시흥동',
    '시흥3동': '시흥동',
    '시흥4동': '시흥동',
    '시흥5동': '시흥동',
}

# 법정동→행정동이 1:1인 경우 (API 불필요)
JIBUN_DIRECT = {
    '가산동':  '가산동',
    '가리봉동': '가리봉동',
    '시흥동':  None,  # 시흥1~5동 구분 필요 → API
    '개봉동':  None,  # 개봉1~3동 구분 필요 → API
    '독산동':  None,  # 독산1~4동 구분 필요 → API
}

# 기타 처리 법정동 목록
JIBUN_GITA = {'철산동', '천왕동', '역곡동', '구로동'}

# ── 카카오 API ────────────────────────────────────────────────
_session = requests.Session()
_session.headers.update({'Authorization': f'KakaoAK {API_KEY}'})

def kakao_haengjeongdong(addr: str) -> str | None:
    """도로명주소 → 행정동명 (없으면 None)"""
    for attempt in range(4):
        try:
            r = _session.get(
                'https://dapi.kakao.com/v2/local/search/address.json',
                params={'query': addr}, timeout=15
            )
            if r.status_code == 429:
                time.sleep(0.5 * (attempt + 1))
                continue
            if r.status_code == 200:
                docs = r.json().get('documents', [])
                if docs:
                    a = docs[0].get('address') or {}
                    return a.get('region_3depth_h_name') or None
                return None
        except Exception:
            time.sleep(0.3)
    return None

# ── 메인 ─────────────────────────────────────────────────────
def main():
    # 캐시 로드
    cache: dict[str, str | None] = {}
    if CACHE_FILE.exists():
        cache = json.loads(CACHE_FILE.read_text())
        print(f'캐시 로드: {len(cache)}건')

    # 엑셀 읽기
    print('엑셀 로드 중...')
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb['Sheet1']
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    data = rows[1:]
    print(f'데이터 행수: {len(data)}')

    # 헤더 인덱스
    h = {v: i for i, v in enumerate(header) if v}
    idx_custno   = h.get('고객번호', 3)
    idx_jibundong= h.get('법정동명', 8)
    idx_jubn     = h.get('주번', 9)
    idx_bubn     = h.get('부번', 10)
    idx_road     = h.get('도로명주소', 12)

    # API 필요한 주소 수집 (법정동이 None인 케이스)
    need_api: set[str] = set()
    for r in data:
        jdong = (r[idx_jibundong] or '').strip()
        addr  = (r[idx_road] or '').strip()
        if jdong in ('개봉동', '독산동', '시흥동') and addr and addr not in cache:
            need_api.add(addr)

    print(f'API 조회 필요: {len(need_api)}건 (캐시 제외)')

    # 병렬 API 호출
    if need_api:
        todo = list(need_api)
        done = 0
        with ThreadPoolExecutor(max_workers=5) as ex:
            futures = {ex.submit(kakao_haengjeongdong, a): a for a in todo}
            for fut in as_completed(futures):
                addr = futures[fut]
                try:
                    result = fut.result()
                except Exception:
                    result = None
                cache[addr] = result
                done += 1
                if done % 100 == 0:
                    print(f'  API 진행: {done}/{len(todo)}')
                    # 중간 캐시 저장
                    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False))
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False))
        print(f'API 완료, 캐시 저장: {len(cache)}건')

    # 결과 생성
    out_rows = []
    unmatched = 0
    for r in data:
        jdong  = (r[idx_jibundong] or '').strip()
        addr   = (r[idx_road] or '').strip()
        custno = r[idx_custno]
        jubn   = r[idx_jubn]
        bubn   = r[idx_bubn]

        # 행정동 결정
        if jdong in JIBUN_GITA:
            haengjeong = jdong  # 그대로 (기타)
            group = '기타'
        elif jdong == '가산동':
            haengjeong = '가산동'
            group = GROUP_MAP.get('가산동', '기타')
        elif jdong == '가리봉동':
            haengjeong = '가리봉동'
            group = GROUP_MAP.get('가리봉동', '기타')
        elif jdong in ('개봉동', '독산동', '시흥동'):
            haengjeong = cache.get(addr) if addr else None
            if haengjeong:
                group = GROUP_MAP.get(haengjeong, '기타')
            else:
                haengjeong = ''
                group = '기타'
                unmatched += 1
        else:
            haengjeong = jdong
            group = GROUP_MAP.get(jdong, '기타')

        out_rows.append({
            '고객번호': custno,
            '법정동명': jdong,
            '주번': jubn,
            '부번': bubn,
            '도로명주소': addr,
            '행정동': haengjeong,
            '동그룹': group,
        })

    # CSV 저장
    with open(CSV_OUT, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['고객번호','법정동명','주번','부번','도로명주소','행정동','동그룹'])
        writer.writeheader()
        writer.writerows(out_rows)
    print(f'CSV 저장: {CSV_OUT}')

    # 집계
    from collections import defaultdict, Counter
    group_count: Counter[str] = Counter()
    group_dong_count: dict[str, Counter[str]] = defaultdict(Counter)
    for r in out_rows:
        g = r['동그룹']
        h = r['행정동'] or '미매핑'
        group_count[g] += 1
        group_dong_count[g][h] += 1

    group_order = ['개봉1동','개봉남부·가리봉','독산북부','독산남부','가산동','시흥동','기타']

    lines = ['구로금천 동그룹별 집계', '=' * 40]
    total = len(out_rows)
    lines.append(f'전체: {total:,}건\n')
    for g in group_order:
        cnt = group_count[g]
        lines.append(f'[{g}] {cnt:,}건')
        for dong, c in sorted(group_dong_count[g].items(), key=lambda x: -x[1]):
            lines.append(f'  {dong}: {c:,}')
        lines.append('')
    lines.append(f'미매핑(행정동 조회 실패): {unmatched}건')

    TXT_OUT.write_text('\n'.join(lines), encoding='utf-8')
    print(f'요약 저장: {TXT_OUT}')
    print('\n--- 동그룹별 건수 ---')
    for g in group_order:
        print(f'  {g}: {group_count[g]:,}')
    print(f'  미매핑: {unmatched}')

if __name__ == '__main__':
    main()
