# 날짜 선택(Date Picker) 라이브러리 비교 조사

작성일: 2026-06-27
용도: 웹 관리자 페이지(데스크톱), 작업이 있는 날짜만 강조, clay 디자인 적용

---

## 비교표

| 항목 | flatpickr | Air Datepicker | vanilla-calendar-pro | Pikaday | Cally | Litepicker |
|---|---|---|---|---|---|---|
| **버전** | 4.6.13 | 3.5.3 | 3.1.0 | 1.8.2 | 0.9.2 | 2.2.3 |
| **JS 크기(min+gzip)** | ~14 KB | ~17 KB | ~20 KB 추정 | ~5 KB | ~9 KB | ~10 KB |
| **CSS 포함 시** | +16 KB CSS | +20 KB CSS | +CSS 별도 | +CSS 별도 | CSS Parts만(크기 無) | +CSS 별도 |
| **의존성** | 없음 | 없음 | 없음 | 없음(Moment 선택적) | 없음(lit-html 내장) | 없음 |
| **CDN 1줄** | O | O | O | O | O(ESM) | O |
| **날짜 마킹 방식** | onDayCreate 콜백 | onRenderCell 콜백 | enableDates/disableDates 배열 | onDraw 콜백 | CSS part + 속성 | plugin 또는 disableDates |
| **특정 날짜만 선택 허용** | enable 배열 | onRenderCell + disabled | enableDates 배열 | O(isDisabled) | O(isDateDisabled) | O(disableDates 역방향) |
| **날짜 점/색 표시** | onDayCreate로 DOM 직접 조작 | onRenderCell classes 배열 반환 | classNames 옵션 예정(현재 미지원) | onDraw DOM 조작 | CSS ::part(button) 타겟팅 | 제한적 |
| **CSS 커스터마이즈** | CSS 변수 일부, 테마 파일 제공 | CSS 변수 풍부, 테마 스위처 | CSS 변수, 테마 시스템 | CSS 매우 단순(직접 덮어쓰기) | CSS custom properties + parts | CSS 변수 기본 |
| **한국어 로케일** | 공식 ko.ts 제공 | 공식 ko.js 제공 | Intl.DateTimeFormat locale 사용('ko-KR') | i18n 수동 객체 | Intl.DateTimeFormat('ko-KR') | i18n 수동 객체 |
| **GitHub 별점** | 16,470 | 2,868 | 1,061 | 8,091 | 1,616 | 909 |
| **npm 주간 다운로드** | ~170만 | ~18만 | ~9만 | ~34만 | ~2.8만 | ~3.6만 |
| **최근 유지보수** | 마지막 커밋 2022-09 (사실상 유지보수 중단) | 최신 릴리스 2024-05 (활발) | 마지막 커밋 2026-02 (활발) | 마지막 릴리스 2020-10 (사실상 중단) | 마지막 커밋 2026-05 (활발) | 마지막 커밋 2021-10 (중단) |
| **라이선스** | MIT | MIT | MIT | MIT/BSD | MIT | MIT |

---

## 각 라이브러리 상세

### 1. flatpickr
- CDN: `https://cdn.jsdelivr.net/npm/flatpickr`
- JS 16 KB + CSS 17 KB (min)
- 날짜 마킹: `onDayCreate` 콜백으로 각 날짜 DOM 엘리먼트에 직접 클래스/점 추가
  ```js
  flatpickr("#cal", {
    enable: ["2026-06-10", "2026-06-15", "2026-06-20"],  // 이 날짜만 선택 허용
    onDayCreate(dObj, dStr, fp, dayElem) {
      if (workDates.includes(dayElem.dateObj.toISOString().slice(0,10))) {
        dayElem.innerHTML += '<span class="dot"></span>';
      }
    }
  });
  ```
- CSS 커스터마이즈: 일부 CSS 변수 지원, 색상은 직접 `.flatpickr-day.selected` 등 덮어쓰기
- 한국어: CDN에서 `flatpickr/dist/l10n/ko.js` 별도 로드 후 `locale: "ko"` 설정
- 단점: 2022년 이후 사실상 유지보수 중단. CSS 변수 체계가 빈약해 clay 토큰 연결이 번거로움.

---

### 2. Air Datepicker
- CDN: `https://cdn.jsdelivr.net/npm/air-datepicker@latest/air-datepicker.min.js`
- JS 50 KB + CSS 20 KB (min), gzip 약 17 KB
- 날짜 마킹: `onRenderCell` 콜백에서 classes 배열을 반환하면 그 날짜 셀에 CSS 클래스 추가
  ```js
  new AirDatepicker('#cal', {
    locale: koLocale,                       // import koLocale from 'air-datepicker/locale/ko'
    onlyTimepicker: false,
    onRenderCell({ date, cellType }) {
      if (cellType === 'day') {
        const d = date.toISOString().slice(0,10);
        if (!workDates.includes(d)) return { disabled: true };
        return { classes: 'has-work', attrs: { 'data-work': true } };
      }
    }
  });
  ```
- CSS 커스터마이즈: CSS 변수(`--adp-color`, `--adp-background-color`, `--adp-border-radius` 등) 20여 개 제공. clay 토큰을 `--adp-*` 에 매핑하면 됨.
- 한국어: `air-datepicker/locale/ko` 공식 파일 제공, CDN으로도 사용 가능
- 단점: flatpickr보다 파일 크기 조금 큼. 2024년 5월 이후 릴리스 없음.

---

### 3. vanilla-calendar-pro
- CDN: `https://cdn.jsdelivr.net/npm/vanilla-calendar-pro/vanilla-calendar.min.js`
- 크기: 빌드 산출물 기준 약 20 KB gzip 추정
- 날짜 마킹: `enableDates`/`disableDates` 배열로 날짜 제어
  ```js
  new Calendar('#cal', {
    locale: 'ko-KR',               // Intl.DateTimeFormat 기반, 별도 로케일 파일 없음
    enableDates: ['2026-06-10', '2026-06-15'],  // 이 날짜만 선택 가능
    disableDates: [],
    disableAllDays: true,          // 전체 비활성 후 enableDates만 허용
  }).init();
  ```
  날짜별 점/색 추가는 `onCreateDateRangeDay` 등의 커스텀 콜백으로 가능하나 공식 API가 아직 정비 중.
- CSS 커스터마이즈: CSS 변수 시스템 제공, 다크/라이트 테마 내장
- 한국어: `locale: 'ko-KR'` 한 줄로 설정 (Intl 기반, 로케일 파일 불필요)
- 단점: 비교적 신생 라이브러리라 사용 사례 적음. 날짜 데코레이션(점 표시 등) API가 성숙하지 않음.

---

### 4. Pikaday
- CDN: `https://cdn.jsdelivr.net/npm/pikaday/pikaday.js`
- JS ~24 KB min (gzip ~5 KB), CSS 별도
- 날짜 마킹: `onDraw` 콜백에서 DOM 직접 조작 또는 커스텀 렌더러 사용
  ```js
  new Pikaday({
    disableDayFn: (date) => !workDates.includes(date.toISOString().slice(0,10)),
    i18n: { /* 한국어 수동 설정 */ }
  });
  ```
- CSS: 매우 단순, 직접 덮어쓰기 쉬움
- 단점: 2020년 이후 릴리스 없음. 공식 한국어 로케일 파일 없음(수동 설정 필요). 날짜 점 표시 기능 없음.

---

### 5. Cally (Web Component)
- CDN: `<script type="module" src="https://unpkg.com/cally"></script>`
- JS ~9 KB gzip (의존성 포함)
- 날짜 마킹: CSS `::part()` 로 날짜 버튼을 타겟팅, `isDateDisabled` 속성 또는 콜백으로 비활성화
  ```html
  <calendar-date>
    <calendar-month></calendar-month>
  </calendar-date>
  <script>
    document.querySelector('calendar-date').isDateDisabled =
      (date) => !workDates.includes(date.toISOString().slice(0,10));
  </script>
  <style>
    calendar-month::part(button) { border-radius: var(--radius-pill); }
    calendar-month::part(button):not([data-disabled]) { color: var(--mint); }
  </style>
  ```
- CSS 커스터마이즈: CSS `::part()` + CSS custom properties. Shadow DOM이라 일반 CSS 클래스 선택자로 내부 스타일 직접 접근 불가 - `::part()`로만 가능.
- 한국어: `<calendar-date lang="ko">` 속성 또는 `Intl.DateTimeFormat` 자동
- 단점: Shadow DOM 특성상 날짜별 점/색 추가가 까다로움. `::part()`로 특정 날짜만 타겟팅하려면 JS로 attribute를 동적으로 설정해야 함. 아직 초기 생태계.

---

### 6. Litepicker
- CDN: `https://cdn.jsdelivr.net/npm/litepicker/dist/litepicker.js`
- JS ~10 KB gzip
- 날짜 마킹: `disableDates` 배열 (특정 날짜 비활성) 또는 plugin 사용
- 단점: 2021년 이후 유지보수 중단. 날짜 점/색 표시 기능 미약. 제외 권장.

---

## 추천

### 1순위: Air Datepicker

이 용도에 가장 적합.

- `onRenderCell` 콜백 한 곳에서 비활성화와 CSS 클래스 추가를 동시에 처리 - "작업일만 선택 가능하고 점으로 구분"이 코드 5줄로 구현됨.
- CSS 변수 20여 개(`--adp-border-radius`, `--adp-color-*`)가 clay 토큰(`--radius-pill`, `--mint` 등)과 1:1 매핑 가능.
- 공식 `ko.js` 로케일 제공.
- 최근(2024-05) 릴리스, 활발한 유지보수.

```html
<!-- CDN 2줄 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/air-datepicker@latest/air-datepicker.css">
<script src="https://cdn.jsdelivr.net/npm/air-datepicker@latest/air-datepicker.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/air-datepicker@latest/locale/ko.js"></script>
```

```css
/* clay 토큰 연결 예시 */
.air-datepicker {
  --adp-border-radius: var(--radius-sm);
  --adp-color: var(--ink);
  --adp-background-color: var(--surface);
  --adp-color-current-date: var(--mint);
  --adp-color-selected: var(--surface);
  --adp-background-color-selected: var(--mint);
  --adp-color-disabled: var(--ink-3);
  box-shadow: var(--clay);
}
```

### 2순위: flatpickr (단, 유지보수 중단 감안)

생태계가 가장 크고(주간 170만 다운로드) 레퍼런스가 풍부하다. `onDayCreate` 콜백으로 날짜 DOM을 자유롭게 조작할 수 있어 점 표시 구현이 쉽다. CSS 변수 체계가 약해 clay 연결 시 셀렉터 직접 덮어쓰기가 필요하지만 어렵지 않다. 2022년 이후 새 릴리스가 없어 장기적으로는 Air Datepicker 쪽이 낫다.

---

## 출처

- flatpickr 공식: https://flatpickr.js.org/events/
- air-datepicker 공식: https://air-datepicker.com/docs
- vanilla-calendar-pro 공식: https://vanilla-calendar.pro/
- cally 공식: https://wicky.nillia.ms/cally/
- bundlephobia (flatpickr): https://bundlephobia.com/package/flatpickr
- bundlephobia (cally): https://bundlephobia.com/package/cally
- npm 주간 다운로드: https://api.npmjs.org/downloads/point/last-week/{package}
- GitHub API: https://api.github.com/repos/{owner}/{repo}
