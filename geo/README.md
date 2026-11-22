# geo/ — public map reference data (no customer data)

## hjd-seoul-ver20261001.json
Seoul administrative-dong (행정동) boundaries, used by the 아미맵 zoomed-out progress circles (js/hd-units.js).
- Source: vuski/admdongkor `ver20261001/HangJeongDong_ver20261001.geojson` (https://github.com/vuski/admdongkor), Seoul features only.
- Processing here: shapely `simplify(0.00003)` (about 3 m), coordinates rounded to 6 decimals,
  stored as `{src, f: [{gu, n, p: [polygon rings ...]}]}` (gu = 구 name, n = 행정동 name).
- Licence / required attribution (CC BY 4.0, LICENSE-DATA §3 of the source repository):

  "본 데이터는 통계청 통계지리정보서비스(SGIS, https://sgis.kostat.go.kr)에서
   공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor,
   https://github.com/vuski/admdongkor), CC BY 4.0으로 배포됩니다."

  "This data is derived from administrative-dong boundaries released by Statistics
   Korea SGIS (https://sgis.kostat.go.kr) under KOGL Type 1, modified by
   vuski/admdongkor (https://github.com/vuski/admdongkor), distributed under CC BY 4.0."

- Rebuild: download the source geojson, keep `sidonm == '서울특별시'`, simplify and round as above.
  A new version needs a new file name (the app fetches it with `?v=` = the version).
