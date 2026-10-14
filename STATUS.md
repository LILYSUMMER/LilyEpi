# LOOK DOWN (Yuni WebAR) — 구현 상태 감사 리포트

기준: `main` 커밋 `3b8eea2` (2026-10-14). 대상은 `lookdown/` 폴더(0단계 「비춤」)이고, 레포의 다른 AR 데모(`rain-portal-ar.html`, `cherry-blossom-ar.html`, `virtual-ooh-ar.html`)는 lookdown이 가져다 쓰지 않는 한 "참고 가능한 코드"로만 적는다. 근거 없는 추측은 쓰지 않았고, 코드에 없으면 **없음**으로 표기했다.

---

## 1. 기술 스택

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 3D/AR 엔진 | **three.js r160** 단독. 레포에 벤더링된 ES 모듈 | `assets/vendor/three-0.160.0/three.module.js` (`REVISION = '160'`), `lookdown/index.html:19-24` importmap `"three": "../assets/vendor/three-0.160.0/three.module.js"` |
| AR 트래킹 라이브러리 | **없음.** MindAR 1.2.5가 레포에 있으나(`assets/vendor/mind-ar-1.2.5/`) lookdown은 import하지 않음. A-Frame·AR.js·8th Wall·WebXR Device API 호출 없음 | `lookdown/lookdown.js:1` (`import * as THREE from 'three'` 외 import 없음). `grep -n "navigator.xr" lookdown/` 결과 없음 |
| 카메라 | `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width 1280, height 720 } })` | `lookdown/lookdown.js:90-105` `startCamera()` |
| 자세 | `deviceorientation` 이벤트 (alpha/beta/gamma) → 쿼터니언. 아이폰은 `DeviceOrientationEvent.requestPermission()` | `lookdown.js:162-166` `deviceQuat()`, `:169-173`, `:190-194` `requestMotion()` |
| 번들러/프레임워크 | **없음.** 바닐라 ES 모듈 + 최상위 `await`(`lines.json` fetch). 빌드 커맨드 없음 | `lookdown.js:43`, `package.json` scripts: `start: node server.js`, `test: 없음` |
| 호스팅/배포 | GitHub Pages, `main` 브랜치 루트, 커스텀 도메인 `epispace.kr`. CI 워크플로 없음(`.github/` 없음) | `CNAME` = `epispace.kr`, `README.md` "배포 가이드" 절. 배포 = `git push origin main` |
| 로컬 개발 서버 | `server.js` (Node https, `ssl/private.key`·`ssl/certificate.crt` 필요) | `server.js:20-23` |
| 외부 런타임 의존 | ① Pretendard 웹폰트 CDN(jsDelivr) ② Google Analytics gtag `G-DXQEGVBYP8` | `lookdown/index.html:17`, `:50-55` |
| 외부 API / ML 모델 | **없음.** depth·segmentation·plane detection 모델 없음 | `lookdown/` 전체에 fetch 대상은 `lines.json`과 `audio/*.mp3`뿐 (`lookdown.js:43`, `:211-217`) |
| 서버/백엔드 | **없음.** 정적 파일만 | — |

---

## 2. 파이프라인 단계별 구현 상태

### A. 장소 캡처 — ❌ 없음

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| GPS/위치 읽기 | ❌ lookdown에 없음. (참고: `assets/virtual-ooh-ar/ooh-ar.js` `watchPlace()`·`metersFromSpot()`·`distanceToSpot()`에 geolocation 구현이 있으나 lookdown이 쓰지 않음) | `grep geolocation lookdown/` 없음 |
| 장소별 데이터 구조 | ❌ 없음. 장소 개념 자체가 없다. 웅덩이는 "지금 카메라 앞 바닥" 한 곳 | `lookdown.js:566-578` `placePuddle(p)` — 인자는 바닥 위 3D 점 하나 |
| 메타데이터(시간·조도) | 🟡 조도만. 카메라 프레임 평균 밝기를 0.6초마다 8×8 캔버스로 재서 `S.night`(0~1)로 씀. 시간·날씨·위치 메타데이터 없음 | `lookdown.js:586-603` `setInterval` 안의 `lum` 계산, 임계 0.18/0.63 |

### B. 장소 이해 — 🟡 부분 (고정 눈높이 + 자이로)

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| 바닥 평면 인식 방식 | 🟡 **hit-test 아님, 마커 아님, 고정 높이.** 카메라를 `(0, EYE=1.4, 0)`에 두고 기기 방향 쿼터니언으로 돌린 뒤, 앞 방향 벡터가 `y=0` 평면과 만나는 점을 바닥으로 본다. 거리는 0.7~2.6m로 클램프 | `lookdown.js:14` `EYE`, `:518-523` `updateCamera()`, `:526-530` `floorPoint()` |
| "바닥을 비추는 중" 판정 | 앞 방향 y < `LOOK_DOWN=-0.42`가 0.5초 지속 | `lookdown.js:19`, `:624-629` |
| 위치 추적(6DoF) | ❌ 없음. 회전(3DoF)만. 사용자가 걸으면 웅덩이가 따라 밀린다 | `updateCamera()`는 `camera.quaternion`만 갱신, `camera.position` 고정(`:264`) |
| 깊이 추정 | ❌ 없음 | — |
| 세그멘테이션 | ❌ 없음 | — |
| 조명 추정 | 🟡 평균 밝기 1값만(위 A 참조). 색온도·방향광 추정 없음 | `lookdown.js:586-603` |
| 센서 없는 환경 | ✅ 드래그로 시점 조작(PC) | `lookdown.js:176-188` `enableDragLook()` |
| 카메라 없는 환경 | ✅ 캔버스로 그린 밤 거리 텍스처를 영상 대신 사용 | `lookdown.js:108-130` `nightStreetTexture()`, `:480-488` |

### C. 장면·캐릭터 자산 — ✅ 구현됨 (프로시저럴, 외부 자산 0개)

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| Yuni 형태 | **코드로 만든 three.js 메시.** GLB·알파 비디오·스프라이트 아님. 구(`SphereGeometry(YUNI_R=0.055, 48, 32)`, y 스케일 1.06) + 귀 2개(`ConeGeometry`) + 눈 2개(`CircleGeometry`). 입·코 없음 | `lookdown.js:408-432` `makeYuni(below)`, `:400-406` `bodyMaterial()` |
| 수면 위/아래 분리 | 같은 메시를 2벌 만들어 위쪽은 `clippingPlanes=ABOVE`(y≥0), 아래쪽은 `BELOW`(y≤0)+스텐실 안에서만 그림 | `lookdown.js:398-399`, `:403`, `:433-436` |
| 재질 | `MeshStandardMaterial` color `0xd9a35c`, emissive `#F2B45A`, emissiveIntensity `GLOW=0.62`(아래쪽 ×0.8), roughness 1 | `lookdown.js:22-23`, `:401-404` |
| 애니메이션 종류 | 코드로 구동, 총 **7종**: ① 떠오름(`S.up`, easeOut 2.4초) ② 둘둘 흔들림(`bob`, `sway`) ③ 보는 사람 쪽으로 회전(`facing`) ④ 귀 쫑긋(`S.ears`) ⑤ 귀 놀람(`startle`, 1.4초 사인) ⑥ 귀 뒤로(`S.back`) ⑦ 반짝임 펄스(1.5초, ×1.27) | `lookdown.js:673-700`, `:705-709` |
| 눈 표정 3종(동그라미/반달/선) | ❌ 없음. 동그라미 1종만 | `lookdown.js:425` |
| 고개 돌림·듣기 자세(1·2단계) | ❌ 없음 | — |
| 3D 모델 로더 | ❌ 없음. GLTFLoader import 없음 | `lookdown.js:1` |
| 물속 연출 | 금빛 스프라이트(`underGlow`) + 알갱이 36개(`Points`) + 어두운 바닥판(`floor`, 8×PUDDLE) | `lookdown.js:365-396` |
| 소리 | 🟡 코드 있음, **파일 없음.** `lookdown/audio/` 비어 있음. `rain.mp3` 없으면 핑크 노이즈 합성, `mumble_1~3.mp3` 없으면 웅얼거림 생략 | `lookdown.js:200-252` `startAudio()`, `mumble()`; `ls lookdown/audio` = 빈 디렉터리 |
| 자막 | `lines.json`에서 기기 언어(ko/en/zh)별 8키 로드 | `lookdown/lines.json`, `lookdown.js:36-46` |

### D. 자산 변환 — ❌ 없음

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| 포맷 변환 스크립트 | ❌ 없음. `tools/`에는 `build-occluders.mjs`(virtual-ooh용)만 | `ls tools/` |
| 압축/최적화 단계 | ❌ 없음. three.module.js 1,272,972 B를 비압축 원본 그대로 서빙(GitHub Pages의 gzip 여부는 코드로 확인 불가) | `wc -c assets/vendor/three-0.160.0/three.module.js` |
| 오디오 변환 | ❌ 없음. `docs/lookdown-stage0.md`에 "wav→mp3, 1.5초 크로스페이드"라고 사람 작업으로 적혀 있음 | `docs/lookdown-stage0.md` "소리 파일 넣기" |
| 모델 변환 | ❌ 해당 없음(모델 없음) | — |

### E. 배치·정합 — 🟡 부분

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| 포털 마스크 방식 | ✅ **WebGL 스텐실.** ① `maskMat`(ShaderMaterial, colorWrite=false)이 blob 모양 안에 stencil=1을 씀(`AlwaysStencilFunc`/`ReplaceStencilOp`) ② 물속 재질은 `stencilIn()`으로 `EqualStencilFunc`(=1)일 때만 그림 ③ `surfMat`(수면)은 스텐실 없이 위에 덮음. 렌더 순서 mask 1 → floor 2 → 물속 3 → 수면 4 | `lookdown.js:255`(`stencil: true`), `:300-309`, `:355-358`, `:365-369`, `:435` |
| 웅덩이 모양 | 셰이더 `blob()`: 반지름 `0.76 + 0.09·sin(3θ+1.7) + 0.05·sin(5θ−0.6) + 0.03·sin(8θ+3.1)` | `lookdown.js:268-274` |
| 물결 셰이더 파라미터 | `rippleNormal()`: 최대 `MAX_RIPPLES=8`개 (0번은 Yuni 둘레 전용, 2.2초마다 강도 0.45), 파형 `sin(dist·30 − age·6)·e^(−dist·3.5)·e^(−age·1.1)·strength`. 배경 잔물결 진폭 0.010. 굴절 세기 `n·0.8` | `lookdown.js:275-286`, `:326-331`, `:441-446`, `:726-727` |
| 수면 색 | 영상 ×0.85를 중심으로 갈수록 `deepCol`(DEEP↔DEEP_LIT 사인 혼합 × (0.6+uTint·0.8))로 `df·(0.92 − clarity·0.3)` 혼합. 금빛 `exp(−9·d²)·uLight·0.55`. 알파 `mix(0.94, 0.5, df·clarity)·edge` | `lookdown.js:332-347` |
| 스케일 결정 | 전부 상수. `PUDDLE=0.82`m, `YUNI_R=0.055`m, `YUNI_UP=0.045`m. 거리에 따른 자동 스케일 없음 | `lookdown.js:15-17` |
| 위치 결정 | `floorPoint()` 결과(0.7~2.6m 클램프)를 `puddle.position`에 복사. Yuni는 `puddle.position + (sway.x, yLocal, −sway.y)` | `lookdown.js:526-530`, `:566-568`, `:675-679` |
| 카메라 화각 정합 | `CAMERA_FOV=67`을 영상 cover 크롭 비율로 보정(`visibleFov()`). 기기별 실제 화각 읽기 없음 | `lookdown.js:18`, `:142-150` |
| 가림(occlusion) | ❌ 없음. 실물이 웅덩이 앞에 있어도 가리지 못함. (참고: `assets/virtual-ooh-ar/ooh-ar.js`에 OSM 건물 기반 오클루더가 있으나 lookdown 미사용) | — |
| 조명/색온도 매칭 | 🟡 `uTint`는 고정값 `(0.55, 0.62, 0.7)`. 평균 밝기(`S.night`)로 Yuni 발광·불투명도만 바꿈. 색온도 추정 없음 | `lookdown.js:291`, `:703-709` |
| 조명 | `HemisphereLight(0x9fb8d0, 0x1a2430, 0.5)` + Yuni 위치 `PointLight(GOLD, 0~0.35, 1.2, 2)` | `lookdown.js:266`, `:438`, `:710-711` |

### F. 배포·진입 — 🟡 부분

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| URL 구조 | 단일 URL `https://epispace.kr/lookdown/`. 쿼리: `?lang=ko|en|zh`(언어 강제), `?view=phone|desk`(입력 모드), `?debug`(`window.__LD` 노출) | `lookdown.js:37`, `:53`, `:450` |
| QR | ❌ 없음 (virtual-ooh에는 `assets/virtual-ooh-ar/qr.svg` 있음) | — |
| 장소별 콘텐츠 선택 | ❌ 없음. 장소 매개변수·라우팅 없음 | — |
| 검색/링크 노출 | `noindex`. `sitemap.xml`·`site.webmanifest`·`index.html`에 링크 없음 | `lookdown/index.html:6`, `grep lookdown sitemap.xml site.webmanifest index.html` = 없음 |
| 장소 추가 시 수정 파일 | 현재 구조에서는 "장소"가 없으므로 해당 없음. 맨 아래 "장소 추가 절차" 참조 | — |

### G. 계측 — ✅ 구현됨 (GA4)

| 이벤트 | 파라미터 | 근거 |
| --- | --- | --- |
| `lookdown_open` | lang, phone, in_app | `lookdown.js:460` |
| `lookdown_started` | camera, sensor, ms(버튼→시작) | `:512` |
| `lookdown_no_camera` | in_app, ios | `:487` |
| `lookdown_pool` | ms | `:577` |
| `lookdown_yuni_seen` | ms(버튼→Yuni 35% 떠오름) | `:637` |
| `lookdown_line` | ms | `:643` |
| `lookdown_done` / `lookdown_bye` | — | `:647`, `:655` |
| `lookdown_tap_water` | — | `:556` |
| `lookdown_dwell` | s, phase (pagehide / visibilitychange hidden) | `:735-737` |

기기 정보 수집: 🟡 UA 기반 불리언만(`IOS`, `IN_APP`, `PHONE`). 기기 모델·GPU·해상도·FPS 수집 **없음**. `track()`은 `window.gtag`가 없으면 조용히 무시 (`lookdown.js:28`).

### H. 검증 — ❌ 거의 없음

| 세부 | 상태 | 근거 |
| --- | --- | --- |
| 테스트 코드 | ❌ 레포에 없음. `package.json` `test` 스크립트는 에러 출력. (이 세션에서 쓴 Playwright 스크립트는 레포 밖 스크래치에만 있음) | `package.json:8` |
| 성능 측정 코드 | ❌ 없음. FPS·프레임 시간 계측 없음 | — |
| 지원 기기 목록 | ❌ 없음. 확인된 실기기: 아이폰 Safari 1대(2026-10-13, 대화 기록) | `docs/lookdown-stage0.md` "확인한 것" |
| 수동 테스트 기록 | 🟡 `docs/lookdown-stage0.md`에 헤드리스 크로미움 확인 기록 | — |

---

## 3. 하드코딩·수동 작업 목록 (자동화 후보)

| 분류 | 값 | 위치 | 의미 / 사람이 맞추는 이유 |
| --- | --- | --- | --- |
| 공간 | `EYE = 1.4` | `lookdown.js:14` | 눈높이(m). 틀리면 웅덩이 거리·크기가 어긋남 |
| 공간 | `PUDDLE = 0.82` | `:15` | 웅덩이 지름(m) |
| 공간 | `YUNI_R = 0.055`, `YUNI_UP = 0.045` | `:16-17` | Yuni 머리 반지름, 수면 위 높이 |
| 공간 | `CAMERA_FOV = 67` | `:18` | 기기 카메라 세로 화각. 기기마다 다름 |
| 공간 | `LOOK_DOWN = -0.42` | `:19` | 바닥 판정 임계 |
| 공간 | 거리 클램프 `0.7 ~ 2.6` | `:528` | 웅덩이 최소·최대 거리 |
| 공간 | 0.5초 (바닥 응시 시간) | `:626` | 자동 고임 지연 |
| 공간 | 바닥판 `PUDDLE*8`, 깊이 `-0.45` | `:367-368` | 물속 바닥 크기·깊이 |
| 공간 | Yuni 시작 깊이 `-0.16` | `:676` | 떠오르기 전 위치 |
| 타이밍 | `T = {pool 1.6, light 0.9, rise 2.4, speak 0.8, hold 6.0, linger 10, bye 3.2, sink 3.0}` | `:20` | 연출 길이(초) |
| 타이밍 | 펄스 1.5초·×1.27, 놀람 1.4초, 귀 쫑긋 0.6초, 웅얼거림 간격 3초·연타 창 2.5초 | `:699`, `:674`, `:634`, `:549` | 애니/반응 시간 |
| 타이밍 | 밝기 샘플 0.6초, 센서 대기 0.8초 | `:602`, `:508` | 폴링 주기 |
| 색 | `GOLD #F2B45A`, `DEEP #061423`, `DEEP_LIT #0d2a44`, Yuni color `0xd9a35c`, 눈 `0x120c08`, `GLOW 0.62`, `uTint (0.55,0.62,0.7)`, Hemisphere `0x9fb8d0/0x1a2430 ×0.5` | `:22-25`, `:401`, `:425`, `:291`, `:266` | 0화 첫 프레임에서 뽑아 고정해야 함(브리프 10/16). 현재는 임의값 |
| 색 | CSS `--deep #0b1420`, `--ink #F6F3EC`, `--ink-soft #C8C4BA`, `--gold #F2B45A` | `lookdown.css:3-7` | UI 색 |
| 조도 | 밤/낮 임계 `0.18 / 0.63`, 보간 `0.35`, 선명도 `0.45+0.55·night` | `lookdown.js:598-599`, `:703` | 어두움 판정 |
| 셰이더 | blob 계수 `0.76/0.09/0.05/0.03`, 물결 `30/6/3.5/1.1`, 잔물결 `0.010`, 굴절 `0.8`, 금빛 `9.0/0.55`, 스펙 `22/3/0.45`, 림 `0.92/0.6`, 알파 `0.94/0.5`, df `0.15` | `:270-272`, `:283`, `:327-345` | 물 느낌 전체 |
| 셰이더 | 알갱이 36개, 크기 0.012, 상승 0.00045/프레임 | `:384`, `:393`, `:717` | 물속 입자 |
| 글 | ko/en/zh 각 8키 (`start, button, look, line, again, nocam, nosensor, bye`) | `lookdown/lines.json` | 대사·버튼. 번역은 손으로 |
| 경로 | `../assets/vendor/three-0.160.0/three.module.js`, `lines.json`, `audio/rain.mp3`, `audio/mumble_1~3.mp3` | `index.html:22`, `lookdown.js:43`, `:221`, `:242` | 파일명 고정 |
| 경로 | Pretendard CDN URL, GA ID `G-DXQEGVBYP8`, `og:url https://epispace.kr/lookdown/` | `index.html:17`, `:50-55`, `:12` | 외부 리소스 |
| 기기 | UA 정규식 `IOS`, `IN_APP`(Instagram·FBAN·FBAV·KAKAOTALK·NAVER·Line·Threads) | `lookdown.js:51-52` | 브라우저 분기 |
| 기기 | `getUserMedia` 요청 해상도 `1280×720`, `pixelRatio ≤ 2` | `:93`, `:256` | 성능/화질 |
| 배포 | `CNAME = epispace.kr`, `main` 푸시 = 배포 | `CNAME` | 수동 머지 |
| 소리 | wav→mp3 변환, 1.5초 크로스페이드 루프 제작 | `docs/lookdown-stage0.md` | 사람이 만들어 넣음 |

---

## 4. 알려진 문제

### 4-1. TODO/FIXME
**없음.** `grep -rn "TODO|FIXME|XXX|HACK" lookdown/` 결과 0건.

### 4-2. try/catch·`.catch()`로 삼키는 실패

| 위치 | 무엇을 삼키나 | 영향 |
| --- | --- | --- |
| `lookdown.js:193` `requestMotion()` | `DeviceOrientationEvent.requestPermission()` 거부/예외 → `false` | 드래그 모드로 조용히 전환. 사용자에게 "센서 거부됨" 안내 없음(힌트만 `nosensor`로 바뀜) |
| `:205` `ctx.resume().catch(() => {})` | AudioContext 재개 실패 | 무음으로 진행, 로그 없음 |
| `:213-217` `load(name)` | 오디오 fetch 실패·404·디코드 실패 → `null` | 빗소리는 노이즈 합성, 웅얼거림 생략. 현재 파일이 없어 **항상 이 경로** |
| `:475-479` `run()` 카메라 | `getUserMedia` 거부/미지원 | `console.warn` 후 밤 거리 텍스처로 진행. `lookdown_no_camera` 이벤트는 남김 |
| `:489` `startAudio().catch(() => {})` | 오디오 전체 실패 | 무시 |
| `:592-600` 밝기 샘플 | 캔버스 taint·미준비 | 그 샘플만 건너뜀 |
| `:461-466` 버튼 클릭 | `run()` 전체 예외 | 전체화면 에러 `#err`에 메시지 표시(이건 삼키지 않음) |

### 4-3. 브라우저/기기 분기

| 분기 | 조건 | 동작 | 위치 |
| --- | --- | --- | --- |
| 휴대폰 vs PC | `?view` 또는 `matchMedia('(pointer: coarse)')` | 휴대폰만 `requestMotion()` 호출 | `lookdown.js:53`, `:470` |
| iOS | UA `iP(hone|ad|od)` 또는 Mac+터치 | 분석 파라미터에만 사용. 동작 분기는 `requestPermission` 함수 존재 여부로 판단 | `:51`, `:192` |
| 앱 안 브라우저 | UA 정규식 | 분석 파라미터에만 사용. 카메라 실패 시 공통 fallback | `:52` |
| 센서 응답 없음 | 0.8초 안에 `deviceorientation` 미수신 | 드래그 모드 | `:505-511` |
| 탭 처리 | 센서 모드는 `pointerdown`, 드래그 모드는 `pointerup`(드래그와 구분) | `:534-541` |
| 화면 회전 | `screen.orientation.angle` 또는 `window.orientation` | 쿼터니언 보정 | `:158-161` |
| `file://` | 프로토콜 검사 | 에러 화면 | `:63` |

### 4-4. 코드로 확인되는 설계 한계
- 3DoF만 추적하므로 사용자가 이동하면 웅덩이가 같이 밀린다 (`camera.position` 고정, `:264`).
- `alpha`가 상대값인 iOS에서 세션 시작 방향을 0으로 잡으므로 세션 간 방향 일관성 없음(문제는 아니나 "같은 자리에 다시"는 불가).
- 수면 셰이더가 `gl_FragCoord` 기준 화면 공간 굴절이라 웅덩이 너머 실물의 원근은 고려하지 않음 (`:329-331`).
- `yuniBelow`는 `transparent: true`에 `depthWrite` 기본값(true)이라 알갱이·스프라이트와의 깊이 상호작용이 정확하지 않을 수 있음 (`:403`) — 시각 검증에서는 문제 없었음.
- `caption('')`은 클래스만 제거하고 `textContent`를 남긴다 (`:56`). 화면엔 안 보이지만 DOM에는 마지막 대사가 남음.

---

## 5. 성능 관련

### 초기 로딩 자산 (lookdown 페이지 기준)

| 파일 | 바이트 | 비고 |
| --- | --- | --- |
| `assets/vendor/three-0.160.0/three.module.js` | 1,272,972 | 전체의 97%. 트리셰이킹·압축 없음 |
| `lookdown/lookdown.js` | 35,405 | |
| `lookdown/lookdown.css` | 4,151 | |
| `lookdown/index.html` | 2,461 | |
| `lookdown/lines.json` | 1,591 | |
| **합계(레포 내)** | **1,316,580 (≈1.26 MB)** | 서버 gzip 적용 여부는 코드로 알 수 없음 |
| 외부 | Pretendard CSS + 폰트(용량 미측정), gtag.js | `index.html:17`, `:50` |
| 오디오 | 0 (파일 없음) | 넣으면 그만큼 증가 |

**레포 전체에서 가장 큰 파일 5개** (lookdown과 무관, 다른 데모 자산):

| 파일 | 바이트 |
| --- | --- |
| `assets/model.glb` | 32,518,884 |
| `assets/lee.mp4` | 19,568,268 |
| `assets/cherry-blossom-ar/relief_flat.png` | 9,576,922 |
| `assets/cherry-blossom-ar/guide.png` | 9,176,187 |
| `assets/nfc-scan.jpg` | 8,562,685 |

### 프레임마다 도는 연산 (`renderer.setAnimationLoop`, `lookdown.js:612-733`)
1. `updateCamera()` — 오일러→쿼터니언 1회, 앞 방향 벡터 1회 (`:518-523`)
2. `videoTex.needsUpdate = true` — 카메라 프레임 GPU 업로드 (1280×720)
3. 상태 머신 분기 (`pooling/rising/speaking/done/leaving/gone`) (`:631-662`)
4. Yuni 자세: 삼각함수 약 10회, `atan2` 1회, 두 그룹 position/rotation 갱신 (`:673-690`)
5. 귀 4개 rotation, 재질 emissive/opacity 갱신 6개 (`:693-709`)
6. 알갱이 36개 position 갱신 + `needsUpdate` (`:714-722`)
7. 물결 uniform 갱신 (`:726-727`)
8. `renderer.render()` — 드로우콜: 마스크 1, 바닥 1, 스프라이트 1, 포인트 1, Yuni 아래(구+귀2) 3, Yuni 위(구+귀2+눈2) 5, 수면 1 ≈ **14 드로우콜**. 수면 프래그먼트는 픽셀당 물결 루프 8회 + 영상 샘플 1회

프레임 밖: 0.6초마다 8×8 `drawImage`+`getImageData` (`:590-602`).

---

## 장소를 하나 더 추가하려면 — 현재 코드 기준 작업량

**전제: 현재 코드에는 "장소"가 없다.** 웅덩이는 사용자가 지금 서 있는 곳의 바닥이고, 장소별 분기·데이터·라우팅이 전혀 없다. 따라서 "장소 추가"는 콘텐츠를 하나 더 넣는 일이 아니라 **장소 개념을 처음 만드는 일**이다. 브리프 1단계(11/19 반환, "가게 근처 위치 확인")가 이 작업에 해당한다.

### 지금 당장 "두 번째 장소"를 열려면 필요한 작업 (총 7개, 신규 파일 1개 + 수정 파일 2개 + 수동 1개)

1. **장소 데이터 파일 신설 (신규 1)** — `lookdown/places.json` 같은 파일에 `id, name, lat, lng, radius, line{ko,en,zh}, bye{ko,en,zh}` 구조를 정한다. 지금은 `lines.json`이 장소와 무관한 전역 1벌이라(`lines.json:ko/en/zh`) 장소별 대사를 담을 자리가 없다.
2. **진입 라우팅 (수정: `lookdown.js`)** — `?place=<id>` 쿼리를 읽어 `places.json`에서 고르는 코드. 현재 쿼리 처리는 `lang/view/debug` 3개뿐(`lookdown.js:32-53`).
3. **위치 읽기 (수정: `lookdown.js`)** — `navigator.geolocation.watchPosition`으로 반경 안인지 판정. lookdown에 없음. `assets/virtual-ooh-ar/ooh-ar.js`의 `watchPlace()`·`distanceToSpot()`·`showLocationHelp()`를 옮겨 오면 된다(위치 거부 시 iOS 설정 안내까지 포함).
4. **대사 선택 (수정: `lookdown.js`)** — `text('line')`·`text('bye')`(`:641`, `:652`)가 전역 `lines`가 아니라 선택된 장소의 대사를 보게 바꾼다.
5. **계측 (수정: `lookdown.js`)** — `track()` 호출 9곳에 `place` 파라미터를 추가한다(`:460, :487, :512, :556, :577, :637, :643, :647, :655`).
6. **진입 링크 (수동)** — 장소별 URL(`/lookdown/?place=waterfront`)을 QR 또는 영상 링크로 만든다. QR 생성 코드는 lookdown에 없다.
7. **좌표 측정 (수동)** — 현장에서 lat/lng와 반경을 재서 1번 파일에 적는다. 자동화 불가.

### 위 7개가 끝난 뒤, 세 번째 장소부터 드는 작업 (총 2개)
1. `lookdown/places.json`에 항목 1개 추가 (좌표·반경·대사 3개 언어)
2. 그 장소의 QR/링크 1개 생성

### 장소가 "같은 웅덩이, 다른 사연"이 아니라 "다른 비침(그림자·물건)"까지 가지려면 추가로
- 비침 자산(그림자 스프라이트 또는 메시)을 장소별로 로드하는 코드 — 현재 로더 없음 (`lookdown.js:1` import는 three뿐)
- 자산 변환·압축 단계 — 현재 없음 (2-D 참조)
