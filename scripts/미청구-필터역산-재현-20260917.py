#!/usr/bin/env python3
"""주덕기 과장 '미청구 대상' 필터 역산 — 재현 스크립트 (2026-09-17, 통신팀 데스크)

입력: data/inbox_jdg_20260917/25년 AMI 보강공사_미청구2.xlsx  (155MB)
      data/inbox_jdg_20260917/25년 AMI 보강공사_v1.xlsx        (필터 안 걸린 기준선)

★155MB 를 pandas.read_excel 로 열지 마라. iterparse 로 한 번 훑어 parquet 로 떨구고
  그 다음은 parquet 으로만 본다(전체 4시트 44초). 시트를 반복해 다시 여는 것이 가장 비싸다.

시트 매핑(workbook.xml.rels 실측 — 이름 순서와 파일 번호가 어긋난다)
  미청구2: sheet1=원장 287,860 / sheet2=Sheet2 / sheet3=Sheet1 258,394 / sheet4=작업중 258,394
  v1     : sheet1=원장          / sheet2=Sheet1            / sheet3=작업중

확정된 결론
  원장 보임   = 상태(O열) == '미청구'                        반례 0
  작업중 보임 = 대상(X열) not startswith '제외'               반례 0
  작업중 진입 = 현장구분코드=='0' AND 구분 in {신규,신설}       반례 0 (258,394 완전재현)
  Sheet2      = 아래 rule_sheet2()                          오탐 0 · 누락 4 / 2,654
"""
import re
import time
import zipfile
from xml.etree.ElementTree import iterparse

import pandas as pd

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
_CR = re.compile(r'([A-Z]+)')


def load_sheet(xlsx, sheet_xml, cols, label=''):
    """시트 1개를 스트리밍으로 읽어 DataFrame(+_row,_hidden). cols={'A':'고유키',...}"""
    z = zipfile.ZipFile(xlsx)
    t = time.time()
    sst = []
    for _, el in iterparse(z.open('xl/sharedStrings.xml'), events=('end',)):
        if el.tag == NS + 'si':
            sst.append(''.join(x.text or '' for x in el.iter(NS + 't')))
            el.clear()
    want, rows, n = set(cols), [], 0
    for _, el in iterparse(z.open(sheet_xml), events=('end',)):
        if el.tag != NS + 'row':
            continue
        n += 1
        if n == 1:
            el.clear()
            continue
        rec = {'_row': int(el.get('r')), '_hidden': el.get('hidden') == '1'}
        for c in el.iterfind(NS + 'c'):
            letter = _CR.match(c.get('r')).group(1)
            if letter not in want:
                continue
            v = c.find(NS + 'v')
            if v is None or v.text is None:
                continue
            rec[cols[letter]] = sst[int(v.text)] if c.get('t') == 's' else v.text
        rows.append(rec)
        el.clear()
    df = pd.DataFrame(rows)
    print(f'{label or sheet_xml}: {len(df):,}행 {time.time()-t:.1f}s')
    return df


def rule_sheet2(ledger):
    """Sheet2 재현 — 원장만으로 판정한다(작업중 시트 없이도 된다).

    1) 상태 == '미청구'
    2) 그 **계기번호**에 '시공 실적행'이 원장에 하나도 없다
       시공 실적행 = 현장구분코드=='0' AND 구분 in {신규,신설}  (= '작업중' 시트의 정의)
    3) 공종 != '고압'
    4) 계기별 **첫 행**만 남긴다 (엑셀 '중복된 항목 제거' 와 같은 동작)
    """
    L = ledger
    meter = L['계기번호'].astype(str)
    sigong = (L['현장구분코드'] == '0') & (L['구분'].isin(['신규', '신설']))
    has_sigong = meter.isin(set(meter[sigong]))
    cand = (L['상태'] == '미청구') & (~has_sigong) & (L['공종'].fillna('') != '고압')
    first = cand & ~L[cand].assign(_m=meter[cand]).duplicated(subset=['_m']).reindex(L.index, fill_value=True)
    return first


if __name__ == '__main__':
    import sys
    XL = sys.argv[1] if len(sys.argv) > 1 else \
        '/Users/woodelight/Projects/ami-work/data/inbox_jdg_20260917/25년 AMI 보강공사_미청구2.xlsx'
    LED = {'D': '시공일', 'G': '현장구분코드', 'H': '구분', 'N': '계기번호', 'O': '상태', 'AM': '공종'}
    S2 = {'D': '시공일', 'N': '계기번호'}
    L = load_sheet(XL, 'xl/worksheets/sheet1.xml', LED, '원장')
    S = load_sheet(XL, 'xl/worksheets/sheet2.xml', S2, 'Sheet2')
    S = S[S['계기번호'].notna()]

    key = lambda d: d['계기번호'].astype(str) + '|' + d['시공일'].astype(str)
    L['k'] = key(L)
    got = set(L[rule_sheet2(L)]['k'])
    exp = set(key(S))
    print(f'\n재현 {len(got):,} / 정답 {len(exp):,}  오탐 {len(got-exp)}  누락 {len(exp-got)}')
    print('누락 계기:', sorted({x.split("|")[0] for x in exp - got}))
