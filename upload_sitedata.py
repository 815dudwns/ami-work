import firebase_admin
from firebase_admin import credentials, db
import json

# 초기화
cred = credentials.Certificate('./ami-work-1c49a-firebase-adminsdk-fbsvc-8ce17a057a.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://ami-work-1c49a-default-rtdb.asia-southeast1.firebasedatabase.app'
})

# JSON 파일 읽기 — ★ 원본 = data/site-data.json (최신 작업대상 누적, 단일 원본)
# (옛 소스 ami_data_coords.json은 5/7 좌표배치라 갱신 안 됨 → site-data.json으로 고정. 2026-06-14)
with open('./data/site-data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# Firebase에 업로드
ref = db.reference('siteData/charger4eleccar')
ref.set(data)

print(f'✅ 완료! {len(data)}개 업로드됨')
