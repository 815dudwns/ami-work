"""
구로금천 엑셀 -> guro-site-data.json (종로 jongno-site-data 스키마 100% 동일)

변환 규칙:
- 변대주: [43]변대주전산화번호(코드) 우선, 없으면 [44]. 라벨=[44]
  (엑셀 [43]=코드 e.g.'9521A953', [44]=텍스트라벨 e.g.'구로간' - 실측 확인됨)
- DCUID: 변대주코드 + 계기번호 뒤2자리
- 공급방식: '322 단상2선(220V)' -> 322 (앞 숫자만)
- 동그룹: guro-grouped.csv 고객번호 키로 조인
- 좌표: guro-coord-cache.json에 저장/로드 (카카오 API 호출)
  guro-addr-cache.json은 행정동 캐시라 좌표 없음 -> 별도 파일 사용

[어드바이저 확인] 변대주 컬럼 우선순위 수정:
  task spec "변대주번호[44] 우선" 은 반대 기술로 판단 (실측: [43]=코드, [44]=라벨)
  종로맵 스키마에서 변대주=코드값 패턴 일치 확인
"""

import openpyxl
import json
import re
import requests
import threading
import time
import os
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import Counter

EXCEL = '/Users/woodelight/.claude/uploads/46113083-8d23-4581-8d55-c7ab8cc2b64a/4f5256db-__________2026___.xlsx'
GROUPED_CSV = '/Users/woodelight/Projects/ami-work/data/guro-grouped.csv'
COORD_CACHE_FILE = '/Users/woodelight/Projects/ami-work/data/guro-coord-cache.json'
OUT = '/Users/woodelight/Projects/ami-work/data/guro-site-data.json'

from _env import require_env

API_KEY = require_env('KAKAO_REST_API_KEY')
WORKERS = 10

# 법정동 중심 좌표 폴백 (완전 실패 시)
DONG_CENTER = {
    ('구로구', '개봉동'):   (37.4946, 126.8533),
    ('구로구', '가리봉동'): (37.4847, 126.8860),
    ('구로구', '천왕동'):   (37.4887, 126.8417),
    ('구로구', '구로동'):   (37.4991, 126.8873),
    ('금천구', '독산동'):   (37.4688, 126.8960),
    ('금천구', '가산동'):   (37.4777, 126.8829),
    ('금천구', '시흥동'):   (37.4583, 126.8997),
    # 기타(경기도 등)
    ('기타', '철산동'):     (37.4782, 126.8611),
    ('기타', '역곡동'):     (37.4965, 126.8213),
}
DEFAULT_CENTER = (37.4785, 126.8965)  # 구로금천 대략 중심


def fix_meter(val):
    if val is None:
        return ''.zfill(11)
    s = re.sub(r'[가-힣\s]', '', str(val))
    try:
        return str(int(float(s))).zfill(11)
    except (ValueError, TypeError):
        return s.zfill(11)


def parse_type(meter_no):
    code = str(meter_no)[2:4]
    if code == '17':
        return 'E'
    if code == '19':
        return 'EA'
    if code in ('25', '26', '27', '45', '46', '47'):
        return 'G'
    if code in ('53', '55'):
        return 'Amigo'
    return ''


def phase(meter_no, mtype):
    code = str(meter_no)[2:4]
    if mtype in ('E', 'EA'):
        return '단상'
    if code in ('25', '26', '27'):
        return '단상'
    if code in ('45', '46', '47'):
        return '삼상'
    if code == '53':
        return '단상'
    if code == '55':
        return '삼상'
    return ''


def day_group(day):
    if day in (1, 2, 3, 4, 5):
        return 'G1'
    if day in (8, 9, 10, 11, 12):
        return 'G2'
    if day in (15, 16, 17, 18, 19):
        return 'G3'
    if day in (22, 23, 24, 25, 26):
        return 'G4'
    return ''


def zero_blank(v):
    s = str(v).strip() if v is not None else ''
    return '' if s in ('0', '') else s


def parse_supply(v):
    """'322 단상2선(220V)' -> 322 (앞 숫자), 없으면 0"""
    if v is None:
        return 0
    s = str(v).strip()
    m = re.match(r'^(\d+)', s)
    return int(m.group(1)) if m else 0


def get_gu(orig_addr):
    """고객주소(원본)에서 구 이름 추출"""
    addr = str(orig_addr or '').strip()
    if '구로구' in addr:
        return '구로구'
    if '금천구' in addr:
        return '금천구'
    return '기타'


# ─── 카카오 지오코딩 ───────────────────────────────────────────────

_session = requests.Session()
_session.headers.update({'Authorization': f'KakaoAK {API_KEY}'})


def search_address(query):
    if not query:
        return None
    for attempt in range(4):
        try:
            r = _session.get('https://dapi.kakao.com/v2/local/search/address.json',
                             params={'query': query}, timeout=15)
            if r.status_code == 429:
                time.sleep(0.5 * (attempt + 1))
                continue
            if r.status_code == 200:
                docs = r.json().get('documents', [])
                if docs:
                    d = docs[0]
                    road = (d.get('road_address') or {}).get('address_name', '')
                    return (road or query, float(d['y']), float(d['x']))
                return None
            time.sleep(0.3)
        except Exception:
            time.sleep(0.3)
    return None


def search_keyword(query):
    if not query:
        return None
    try:
        r = _session.get('https://dapi.kakao.com/v2/local/search/keyword.json',
                         params={'query': query, 'size': 1}, timeout=15)
        if r.status_code == 200:
            docs = r.json().get('documents', [])
            if docs:
                d = docs[0]
                return (d.get('road_address_name') or d.get('address_name') or query,
                        float(d['y']), float(d['x']))
    except Exception:
        pass
    return None


def resolve(road_addr, gu, dong):
    """(도로명주소, 구, 법정동) -> (도로명, lat, lng, 정확도)"""
    # 1차: 도로명주소 직접
    if road_addr:
        found = search_address(road_addr)
        if found:
            return found[0], found[1], found[2], 'exact'
        found = search_keyword(road_addr)
        if found:
            return found[0], found[1], found[2], 'exact'

    # 2차: 동 중심
    key = (gu, dong)
    center = DONG_CENTER.get(key)
    if center:
        return '', center[0], center[1], 'approximate'

    # 3차: 서울 gu dong 검색
    if gu != '기타':
        found = search_address(f'서울특별시 {gu} {dong}')
        if found:
            return found[0], found[1], found[2], 'approximate'

    return '', DEFAULT_CENTER[0], DEFAULT_CENTER[1], 'approximate'


def load_grouped_csv(path):
    """고객번호 -> {행정동, 동그룹} 딕셔너리"""
    result = {}
    with open(path, encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cust = str(row['고객번호']).strip()
            result[cust] = {
                '행정동': row.get('행정동', '').strip(),
                '동그룹': row.get('동그룹', '').strip(),
            }
    return result


def load_coord_cache(path):
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_coord_cache(path, cache, lock):
    with lock:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False)


def main():
    print('[1/5] 엑셀 로드 중...', flush=True)
    wb = openpyxl.load_workbook(EXCEL, read_only=True, data_only=True)
    ws = wb['Sheet1']
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    print(f'  총 행: {len(rows)}', flush=True)

    print('[2/5] 동그룹 CSV 조인...', flush=True)
    grouped = load_grouped_csv(GROUPED_CSV)
    print(f'  CSV 항목수: {len(grouped)}', flush=True)

    print('[3/5] 좌표 캐시 로드 + 미캐시 도로명 지오코딩...', flush=True)
    coord_cache = load_coord_cache(COORD_CACHE_FILE)
    cache_lock = threading.Lock()
    print(f'  기존 캐시: {len(coord_cache)}건', flush=True)

    # 고유 (도로명주소, gu, dong) 조합 수집
    uniq_addrs = {}
    for r in rows:
        road = str(r[12] or '').strip()
        gu = get_gu(r[5])
        dong = str(r[8] or '').strip()
        key = (road, gu, dong)
        uniq_addrs[key] = True

    # 캐시 미적중분만 API 호출
    to_resolve = [k for k in uniq_addrs if k not in coord_cache]
    print(f'  고유 주소 조합: {len(uniq_addrs)}, 캐시 미적중: {len(to_resolve)}', flush=True)

    cnt = {'done': 0, 'exact': 0, 'approx': 0}

    def resolve_and_cache(key):
        road, gu, dong = key
        result = resolve(road, gu, dong)
        with cache_lock:
            coord_cache[key] = result
            cnt['done'] += 1
            if result[3] == 'exact':
                cnt['exact'] += 1
            else:
                cnt['approx'] += 1
            if cnt['done'] % 200 == 0 or cnt['done'] == len(to_resolve):
                print(f"  [{cnt['done']}/{len(to_resolve)}] exact={cnt['exact']} approx={cnt['approx']}", flush=True)
                # 체크포인트 저장 (캐시 키를 문자열로)
                save_cache = {f'{k[0]}|||{k[1]}|||{k[2]}': list(v) for k, v in coord_cache.items()}
                with open(COORD_CACHE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(save_cache, f, ensure_ascii=False)
        return key, result

    if to_resolve:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(resolve_and_cache, k): k for k in to_resolve}
            for fut in as_completed(futs):
                pass  # resolve_and_cache 내부에서 처리

        # 최종 저장
        save_cache = {f'{k[0]}|||{k[1]}|||{k[2]}': list(v) for k, v in coord_cache.items()}
        with open(COORD_CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(save_cache, f, ensure_ascii=False)
        print(f'  좌표 캐시 저장: {COORD_CACHE_FILE}', flush=True)
    else:
        print('  모든 주소 캐시 적중, API 호출 없음', flush=True)

    print('[4/5] 레코드 변환...', flush=True)
    out = []
    stats = {
        'no_meter': 0,
        'no_cust': 0,
        'no_group_join': 0,
        'day_out_of_group': 0,
        'exact': 0,
        'approximate': 0,
        'mtype': Counter(),
        'phase': Counter(),
        'donggroup': Counter(),
    }

    for r in rows:
        cust_no = str(r[3] or '').strip()
        if not cust_no:
            stats['no_cust'] += 1
            continue

        meter_raw = fix_meter(r[20])
        mtype = parse_type(meter_raw)
        ph = phase(meter_raw, mtype)

        road = str(r[12] or '').strip()
        gu = get_gu(r[5])
        dong = str(r[8] or '').strip()
        cache_key = (road, gu, dong)
        coord_result = coord_cache.get(cache_key, ('', DEFAULT_CENTER[0], DEFAULT_CENTER[1], 'approximate'))
        _, lat, lng, acc = coord_result

        # 번지
        jibun_main = str(r[9] or '').strip()
        jibun_sub = str(r[10] or '').strip()
        try:
            sub_int = int(float(jibun_sub)) if jibun_sub else 0
        except ValueError:
            sub_int = 0
        try:
            main_int = int(float(jibun_main)) if jibun_main else 0
            main_str = str(main_int)
        except ValueError:
            main_str = jibun_main
        beonji = f'{main_str}-{sub_int}' if sub_int > 0 else main_str

        # 주소 조합
        if gu == '기타':
            # 경기도 등: 원본 도로명주소 그대로
            addr_str = road if road else str(r[5] or '').strip()
        else:
            addr_str = f'서울특별시 {gu} {dong} {beonji}'.strip()

        # 변대주 (어드바이저 확인: [43]=코드, [44]=라벨)
        bdj_code = zero_blank(r[43])
        bdj_label = zero_blank(r[44])
        # task spec "변대주번호[44] 우선" 은 실측과 반대 -> [43]코드를 변대주로 사용
        # 이 판단 이유: 종로 스키마에서 변대주='9927Z251'(코드), 변대주라벨='별궁로 12'(텍스트)
        bdj_for_id = bdj_code if bdj_code else bdj_label
        bdj_label_out = bdj_label

        # DCUID
        if bdj_for_id:
            dcuid = bdj_for_id + meter_raw[-2:]
        else:
            dcuid = ''

        # 검침일
        day_val = r[15]
        try:
            day_i = int(day_val) if day_val is not None else 0
        except (ValueError, TypeError):
            day_i = 0
        dg = day_group(day_i)
        if not dg:
            stats['day_out_of_group'] += 1

        # 동그룹 조인
        grp_info = grouped.get(cust_no, {})
        dong_group = grp_info.get('동그룹', '기타') or '기타'
        if not grp_info:
            stats['no_group_join'] += 1

        if not meter_raw or meter_raw == '00000000000':
            stats['no_meter'] += 1

        if acc == 'exact':
            stats['exact'] += 1
        else:
            stats['approximate'] += 1
        stats['mtype'][mtype] += 1
        stats['phase'][ph] += 1
        stats['donggroup'][dong_group] += 1

        # 공급방식: 앞 숫자만
        supply_int = parse_supply(r[39])

        # 계약전력
        try:
            power_int = int(r[38]) if r[38] is not None else 0
        except (ValueError, TypeError):
            power_int = 0

        # 순위
        rank = ''

        out.append({
            '주소': addr_str,
            '도로명주소': road,
            '계기번호': meter_raw,
            '계기타입': mtype,
            '변대주': bdj_for_id,
            '상호': zero_blank(r[14]),
            'lat': lat,
            'lng': lng,
            '좌표정확도': acc,
            '고객번호': cust_no,
            'DCUID': dcuid,
            '법정동': dong,
            '번지': beonji,
            '동그룹': dong_group,
            '검침일': day_i,
            '검침일그룹': dg,
            '순위': rank,
            '단상삼상': ph,
            '공급방식': supply_int,
            '계약전력': power_int,
            '공동주택명': zero_blank(r[13]),
            'new_meter_no': None,
            '자동완료': False,
            '고객명': str(r[4] or '').strip(),
            '휴대폰': str(r[19] or '').strip(),
            '계기위치': str(r[35] or '').strip(),
            '변대주라벨': bdj_label_out,
            '인입주전산화': zero_blank(r[45]),
            '인입주번호': zero_blank(r[46]),
            '검침방법': str(r[47] or '').strip(),
            '검침원': str(r[48] or '').strip(),
            '검침원연락처': str(r[49] or '').strip(),
            '계약종별': str(r[37] or '').strip(),
            '인입선상태': '',
        })

    print(f'  변환 완료: {len(out)}건', flush=True)

    print('[5/5] 파일 저장...', flush=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'  저장: {OUT}', flush=True)

    # 스키마 키 검증 (종로 첫 항목 기준)
    expected_keys = ['주소', '도로명주소', '계기번호', '계기타입', '변대주', '상호', 'lat', 'lng',
                     '좌표정확도', '고객번호', 'DCUID', '법정동', '번지', '동그룹', '검침일', '검침일그룹',
                     '순위', '단상삼상', '공급방식', '계약전력', '공동주택명', 'new_meter_no', '자동완료',
                     '고객명', '휴대폰', '계기위치', '변대주라벨', '인입주전산화', '인입주번호',
                     '검침방법', '검침원', '검침원연락처', '계약종별', '인입선상태']
    if out:
        actual_keys = list(out[0].keys())
        missing = set(expected_keys) - set(actual_keys)
        extra = set(actual_keys) - set(expected_keys)
        print(f'  키 검증 - 누락: {missing}, 추가: {extra}', flush=True)
        if not missing and not extra:
            print('  [OK] 종로 스키마 키 100% 일치', flush=True)

    # 통계 보고
    print()
    print('=== 변환 통계 ===')
    print(f'총 행수: {len(out)}')
    print(f'좌표 exact: {stats["exact"]} ({stats["exact"]/max(len(out),1)*100:.1f}%)')
    print(f'좌표 approximate: {stats["approximate"]} ({stats["approximate"]/max(len(out),1)*100:.1f}%)')
    print(f'계기타입 분포: {dict(stats["mtype"])}')
    print(f'단상삼상 분포: {dict(stats["phase"])}')
    print(f'동그룹별 건수:')
    for k, v in stats['donggroup'].most_common():
        print(f'  {k}: {v}')
    print(f'이상치/누락:')
    print(f'  고객번호 없음: {stats["no_cust"]}')
    print(f'  계기번호 00000: {stats["no_meter"]}')
    print(f'  동그룹 CSV 미조인: {stats["no_group_join"]}')
    print(f'  검침일그룹 미분류(G1~G4 외): {stats["day_out_of_group"]}')
    print()
    print('[주의] 변대주 컬럼 매핑 수정 적용:')
    print('  task spec "변대주번호[44] 우선" 은 실측 데이터와 반대')
    print('  [43]=전산화번호(코드, e.g.9521A953), [44]=번호(라벨, e.g.구로간)')
    print('  -> 변대주=[43]코드, 변대주라벨=[44]라벨로 적용')
    print('  -> 종로 스키마(변대주=9927Z251 코드) 패턴과 일치')


if __name__ == '__main__':
    main()
