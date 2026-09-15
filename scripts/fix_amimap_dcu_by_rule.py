#!/usr/bin/env python3
"""아미맵 site-data 의 DCUID·통신방식을 확정 매칭 원칙으로 재정렬.

원칙 (영준님 확정 2026-08-12, 재확인 2026-08-13):
    DCUID 는 DCUID 끼리, 변대주명은 변대주명끼리만 매칭한다.
    이름이 비슷하다고 붙이지 않는다 — 전주명은 연번이어도 전산화번호는 연번이 아니다
    (실측: 창신지 25/26/27 = 0026F481 / 0026F483 / 0026F591).

동작:
  1) 변대주(한글명)가 대장 변대주명과 '정확히' 일치하고 그 이름이 유일하면 -> 그 행이 진실.
     DCUID 와 통신방식을 그 행 값으로 맞춘다.
  2) 회선상태 해지·정지면 통신방식은 비운다 (아미맵 기존 규칙, commit 8a979d82).
  3) 이름이 대장에 없고 DCUID 도 대장에 없는 영숫자 값 -> 근거 없는 값이라 비운다.
  4) 숫자형 DCUID(=LTE 회선번호)와 동명이인 전주는 건드리지 않는다(판별 근거 없음).
"""
import json, re, shutil, sys, collections
from datetime import datetime
from zoneinfo import ZoneInfo
import openpyxl

KST = ZoneInfo('Asia/Seoul')
SHEET = '전체DCU 현황'


def cl(v):
    s = '' if v is None else str(v).strip()
    m = re.match(r'^="?(.*?)"?$', s)
    return (m.group(1) if m else s).strip()


def load_ledger(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=False)
    ws = wb[SHEET]
    rows = ws.iter_rows(min_row=2, values_only=True)
    hdr = [cl(x) for x in next(rows)]
    idx = {h: i for i, h in enumerate(hdr) if h}
    by_id, by_name, by_id_name = set(), collections.defaultdict(list), {}
    for r in rows:
        if not r:
            continue
        rec = {h: cl(r[idx[h]]) for h in
               ['DCU ID', '변대주번호', '변대주명', '인입망 통신방식', '회선상태']}
        if rec['DCU ID']:
            by_id.add(rec['DCU ID'])
            by_id_name[rec['DCU ID']] = rec['변대주명']
        if rec['변대주명']:
            by_name[rec['변대주명']].append(rec)
    return by_id, by_name, by_id_name


def main():
    site_path = sys.argv[1] if len(sys.argv) > 1 else 'data/site-data.json'
    xlsx = sys.argv[2] if len(sys.argv) > 2 else 'data/reference/간선망_해지_정지대상.xlsx'
    apply = '--apply' in sys.argv

    by_id, by_name, by_id_name = load_ledger(xlsx)
    site = json.load(open(site_path, encoding='utf-8'))
    c = collections.Counter()
    changes = []

    for it in site:
        pole = str(it.get('변대주') or '').strip()
        dcu = str(it.get('DCUID') or '').strip()
        comm = str(it.get('통신방식') or '').strip()
        before = (dcu, comm)

        if pole and not pole.isdigit() and pole in by_name:
            rows = by_name[pole]
            ids = {r['DCU ID'] for r in rows}
            if len(ids) > 1:
                c['동명이인_보류'] += 1
                continue
            truth = rows[0]
            new_dcu = truth['DCU ID']
            new_comm = '' if truth['회선상태'] in ('해지', '정지') else truth['인입망 통신방식']
            if (new_dcu, new_comm) != before:
                it['DCUID'] = new_dcu
                it['통신방식'] = new_comm
                c['이름기준_교정'] += 1
                if dcu and dcu != new_dcu:
                    c['  ㄴDCUID 바뀜'] += 1
                if comm != new_comm:
                    c['  ㄴ통신방식 바뀜'] += 1
                changes.append({'계기번호': it.get('계기번호'), '주소': it.get('주소'),
                                '변대주': pole, '전': {'DCUID': before[0], '통신방식': before[1]},
                                '후': {'DCUID': new_dcu, '통신방식': new_comm}})
            else:
                c['이미정상'] += 1
            continue

        # 이름이 대장에 없는데 DCUID 는 대장의 '다른 이름' 을 가리킨다 -> 이름 유사매칭 산물
        if (pole and not pole.isdigit() and pole not in by_name
                and dcu and not dcu.isdigit() and dcu in by_id
                and by_id_name.get(dcu) != pole):
            it['DCUID'] = ''
            it['통신방식'] = ''
            c['유사매칭산물_비움'] += 1
            changes.append({'계기번호': it.get('계기번호'), '주소': it.get('주소'),
                            '변대주': pole, '전': {'DCUID': before[0], '통신방식': before[1]},
                            '후': {'DCUID': '', '통신방식': ''},
                            '사유': f'변대주명 대장에 없음 / DCUID 는 대장의 "{by_id_name.get(dcu)}" 것'})
            continue

        if dcu and not dcu.isdigit() and dcu not in by_id:
            # 이름도 대장에 없고 DCUID 도 대장에 없다 -> 근거 없는 값
            it['DCUID'] = ''
            it['통신방식'] = ''
            c['근거없음_비움'] += 1
            changes.append({'계기번호': it.get('계기번호'), '주소': it.get('주소'),
                            '변대주': pole, '전': {'DCUID': before[0], '통신방식': before[1]},
                            '후': {'DCUID': '', '통신방식': ''}})
            continue

        c['손대지않음(숫자형LTE·이름없음)'] += 1

    print(f'총 {len(site)}건')
    for k, v in c.most_common():
        print(f'  {v:6}  {k}')
    print(f'\n변경 {len(changes)}건')
    for ch in changes[:8]:
        print(f"   {ch['계기번호']} {str(ch['주소'])[:24]:26} {ch['변대주']:14} "
              f"{ch['전']['DCUID']:12}/{ch['전']['통신방식']:7} -> {ch['후']['DCUID']:12}/{ch['후']['통신방식']}")

    if apply:
        stamp = datetime.now(KST).strftime('%Y%m%d-%H%M%S')
        bk = site_path.replace('.json', f'.backup-DCU규칙재정렬전-{stamp}.json')
        shutil.copy2(site_path, bk)
        print(f'\n백업 {bk}')
        with open(site_path, 'w', encoding='utf-8') as f:
            json.dump(site, f, ensure_ascii=False)
        with open(f'data/dcu규칙재정렬_변경내역_{stamp}.json', 'w', encoding='utf-8') as f:
            json.dump(changes, f, ensure_ascii=False, indent=1)
        print(f'변경내역 data/dcu규칙재정렬_변경내역_{stamp}.json')
    else:
        print('\n(예행 — 파일 안 바꿈. 적용하려면 --apply)')


if __name__ == '__main__':
    main()
