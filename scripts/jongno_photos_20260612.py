#!/usr/bin/env python3
# 종로 오늘(6/12) 작업 사진 정리 → 20260612{daily_seq:03d}-{n} 리네임 + zip
# 철거: removal_photos 칸순(whme_day,whme_mngt,dm_mt_day,var_day) -1..  / 신계기: new_meter_photo 마지막
import json, os, sys, urllib.request, zipfile
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
ORDER = ['whme_day', 'whme_mngt', 'dm_mt_day', 'var_day']
OUT = '/tmp/jongno_photos_20260612'
os.makedirs(OUT, exist_ok=True)

d = json.load(open('/tmp/jongno_ws.json'))
rows = []
for addr, v in d.items():
    if not isinstance(v, dict):
        continue
    for mid, r in (v.get('replacement_list') or {}).items():
        if not isinstance(r, dict):
            continue
        ra = r.get('replaced_at')
        if not ra:
            continue
        if datetime.fromtimestamp(ra / 1000, KST).strftime('%Y-%m-%d') != '2026-06-12':
            continue
        rows.append((r.get('daily_seq'), addr, mid, r))

rows.sort(key=lambda x: (x[0] if x[0] is not None else 9999))

# daily_seq 중복 체크
seqs = [s for s, *_ in rows]
dups = {s for s in seqs if seqs.count(s) > 1}
if dups:
    print(f'[경고] daily_seq 중복: {sorted(dups)}', flush=True)

ok, fail, total_photos = 0, 0, 0
manifest = []
for seq, addr, mid, r in rows:
    if seq is None:
        print(f'[skip] daily_seq 없음: {addr} {mid}', flush=True)
        continue
    base = f'20260612{int(seq):03d}'
    rp = r.get('removal_photos') or {}
    photos = []
    if rp:
        for k in ORDER:
            if rp.get(k):
                photos.append((k, rp[k]))
        for k in rp:  # ORDER 밖 칸도 뒤에
            if k not in ORDER and rp[k]:
                photos.append((k, rp[k]))
    elif r.get('old_meter_photo'):
        photos.append(('old', r['old_meter_photo']))
    if r.get('new_meter_photo'):
        photos.append(('new', r['new_meter_photo']))

    for i, (kind, url) in enumerate(photos, 1):
        fn = f'{OUT}/{base}-{i}.jpg'
        try:
            urllib.request.urlretrieve(url, fn)
            ok += 1
            total_photos += 1
        except Exception as e:
            fail += 1
            print(f'[실패] {base}-{i} ({kind}): {e}', flush=True)
    manifest.append(f'{base}  seq={seq}  철거{len([p for p in photos if p[0]!="new"])}장+신{1 if r.get("new_meter_photo") else 0}  {addr} {mid}')

open(f'{OUT}/_manifest.txt', 'w').write('\n'.join(manifest))
print(f'작업 {len(rows)}건 / 사진 성공 {ok} 실패 {fail}', flush=True)

# zip
zpath = '/tmp/jongno_사진_20260612.zip'
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(os.listdir(OUT)):
        z.write(f'{OUT}/{f}', f)
print(f'압축 완료: {zpath} ({os.path.getsize(zpath)//1024}KB)', flush=True)
