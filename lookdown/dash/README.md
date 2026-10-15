# LOOK DOWN 대시보드 (`/lookdown/dash/`)

서버 없이 브라우저에서 GA4 Data API를 바로 부르는 한 장짜리 페이지입니다. `noindex`. 사장님 Google 계정으로 로그인해야 보이고, 아무것도 저장하지 않습니다(속성 ID·클라이언트 ID만 그 브라우저에 기억).

## 처음 한 번 설정

1. **GA4 속성 ID**: GA4 관리 → 속성 설정 → 속성 ID(숫자). 측정 ID `G-DXQEGVBYP8`가 아닙니다.
2. **OAuth 클라이언트 ID**: [Google Cloud Console → API 및 서비스 → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials) → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션. 승인된 JavaScript 원본에 `https://epispace.kr` (로컬 테스트면 `http://localhost:8765`도). 같은 프로젝트에서 **Google Analytics Data API** 사용 설정. OAuth 동의 화면은 "외부 · 테스트" 상태로 두고 사장님 계정을 테스트 사용자로 넣으면 됩니다.
3. **맞춤 측정기준**: GA4 관리 → 맞춤 정의 → 맞춤 측정기준 만들기(이벤트 범위)로 `ms`, `s`, `n`, `kind`, `method`, `phase`를 등록. 등록 전 데이터는 소급되지 않으니 먼저 해 두는 게 좋습니다. 등록 전에는 깔때기·날마다·기기만 나옵니다.
4. `https://epispace.kr/lookdown/dash/` 를 열고 두 ID를 넣고 로그인. 또는 `?property=123456789&client=....apps.googleusercontent.com` 으로 열면 저장됩니다.

`?demo=1` 은 예시 데이터로 화면만 보여 줍니다.

## 무엇이 보이나

| 카드 | 이벤트 | 뜻 |
| --- | --- | --- |
| 지금 | 실시간 30분 | 브리프의 지표 넷 |
| 깔때기 | open → started → pool → yuni_seen → line → end → share | 링크 클릭 대비 비율 |
| 날마다 | open, share | 하루 단위 |
| Yuni가 보이기까지 | yuni_seen의 `ms` | 3초 안에 보인 비율 (브리프 목표) |
| 체류 시간 | dwell의 `s` | 중앙값·분포. 숨겨질 때마다 보내므로 한 사람이 여러 번 |
| 점쾌 번호별 | line의 `n` | 20줄이 고르게 나오는지 |
| 공유 | share의 `kind`·`method` | 사진/영상 × 시트/내려받기/취소 |
| 기기·언어 | open의 deviceCategory·operatingSystem·language | |
