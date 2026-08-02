#!/usr/bin/env python3
# 이번 보강 작업대상(17,864) 구별 + 완료/미완료(workStatus 현재 Firebase) 집계
import openpyxl, re, collections
import firebase_admin
from firebase_admin import credentials, db

BASE = '/Users/woodelight/Projects/ami-work'
cred = credentials.Certificate(f'{BASE}/ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json')
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {'databaseURL': 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app'})

def dec(k):
    return (k.replace('_dot_', '.').replace('_hash_', '#').replace('_dollar_', '$')
             .replace('_lb_', '[').replace('_rb_', ']').replace('_sl_', '/'))

# workStatus 키는 '주소' 또는 '주소|도로명주소'(마커 여러 개로 갈린 주소)다.
#   주소 단위로 접되, 마커 집계와 같은 보수적 원칙을 쓴다 — 전부 complete 일 때만 complete.
#   접지 않으면 갈린 주소가 조회에 안 잡혀 조용히 pending 으로 집계된다.
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
from status_key import address_of_status_key

cur = db.reference('workStatus/charger4eleccar').get() or {}
_states = {}
for k, v in cur.items():
    if isinstance(v, dict):
        addr = address_of_status_key(dec(k).strip())
        _states.setdefault(addr, []).append(v.get('state', 'pending'))
ws = {a: ('complete' if all(x == 'complete' for x in sts) else
          next((x for x in sts if x != 'complete'), 'pending'))
      for a, sts in _states.items()}

wb = openpyxl.load_workbook(f'{BASE}/data/계기교체_보강현황_20260528.xlsx', data_only=True)
sh = wb.worksheets[0]
hidden = set(r for r, d in sh.row_dimensions.items() if d.hidden)

def gu_of(addr):
    m = re.search(r'(\S+구)(\s|$)', addr or '')
    return m.group(1) if m else '기타'

# 구별 집계
meters = collections.Counter()       # 들어간 계기수
addrs = collections.defaultdict(set) # 들어간 호수(주소)
done_m = collections.Counter()       # 완료 계기
undone_m = collections.Counter()     # 미완료 계기
done_a = collections.defaultdict(set)
undone_a = collections.defaultdict(set)

for row in sh.iter_rows(min_row=2, values_only=False):
    if row[0].row in hidden:
        continue
    if row[22].value != '대상':
        continue
    addr = str(row[33].value).strip() if row[33].value else ''
    g = gu_of(addr)
    meters[g] += 1
    addrs[g].add(addr)
    st = ws.get(addr, 'pending')
    if st == 'complete':
        done_m[g] += 1; done_a[g].add(addr)
    else:
        undone_m[g] += 1; undone_a[g].add(addr)

gus = sorted(meters, key=lambda g: -meters[g])
print(f"{'구':<12}{'들어간계기':>9}{'들어간호수':>9}{'완료계기':>8}{'완료호수':>8}{'미완료계기':>9}{'미완료호수':>9}")
print('-' * 70)
tot = collections.Counter()
for g in gus:
    print(f"{g:<12}{meters[g]:>9}{len(addrs[g]):>9}{done_m[g]:>8}{len(done_a[g]):>8}{undone_m[g]:>9}{len(undone_a[g]):>9}")
print('-' * 70)
TM = sum(meters.values()); TA = len(set().union(*addrs.values()))
TDM = sum(done_m.values()); TUM = sum(undone_m.values())
TDA = len(set().union(*done_a.values())) if any(done_a.values()) else 0
TUA = len(set().union(*undone_a.values())) if any(undone_a.values()) else 0
print(f"{'합계':<12}{TM:>9}{TA:>9}{TDM:>8}{TDA:>8}{TUM:>9}{TUA:>9}")
