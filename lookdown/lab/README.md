# LOOK DOWN lab — 바닥 고정 추적 1차 실험

**목적:** 8th Wall·Zappar 같은 유료 서비스 없이 0단계 「비춤」의 웅덩이를 바닥에 고정할 수 있는지 재는 도구와 측정값. `lookdown/` 본체는 건드리지 않는다. 이 폴더의 산출물은 "되는 AR"이 아니라 **추적 품질을 재는 하네스 + 두 방식의 측정 결과**다.

## 구조

| 경로 | 역할 |
| --- | --- |
| `harness.html`, `harness.js` | 측정 하네스. 추적기를 꽂고 FPS·처리시간·상태·이동 거리를 띄우며, 가상 마커(시작 시 1 m 앞 바닥)의 화면 좌표와 밀림을 매 프레임 기록해 CSV·요약 JSON으로 저장 |
| `trackers/gyro.js` | 기준선. `lookdown.js`의 자이로 3DoF + EYE 1.4 m + floorPoint를 그대로 추출 |
| `trackers/alva.js` | AlvaAR 단안 SLAM 추적기 (+ `useFallback`: lost면 자이로로) |
| `trackers/hybrid.js` | **하이브리드 추적기.** 회전은 자이로, 이동은 바닥 광류(jsfeat FAST + 피라미드 LK) → 회전 보상 → 바닥 평면 역투영 → 2점 RANSAC으로 수평 이동·높이 동시 추정 → ZUPT·상보 필터. `?stage=1..4`로 단계별 측정 |
| `trackers/hybrid-plan.md` | 하이브리드 설계 문서 |
| `vendor/jsfeat/` | jsfeat 0.0.8 (`jsfeat-min.js` 66 KB, MIT, 순수 JS). 선택 근거는 `vendor/jsfeat/SOURCE.md` |
| `vendor/alvaar/` | AlvaAR 빌드 파일(`alva_ar.js` 4.3 MB, WASM 내장), `LICENSE`(GPLv3), `SOURCE.md`(커밋) |
| `tools/make-synthetic.py` | (a)(b)(c) 합성 바닥 영상 + IMU + 정답 경로 생성 |
| `tools/run-lab.mjs` | 헤드리스 크로미움으로 하네스를 돌려 `results/`에 CSV·JSON 저장 |
| `data/` | 합성 시나리오 `a|b|c.webm` + `.json` |
| `results/` | 측정 결과 (`<tracker>-<scenario>.csv/.json`) |
| `RESULTS.md` | 측정 결과 보고 |

## 추적기 인터페이스

```js
await tracker.init(width, height);
const r = tracker.update(imageData /* W×H RGBA 또는 null */, imuQuat /* THREE.Quaternion 또는 null */, t /* 초 */);
// r = { position: Vector3, quaternion: Quaternion, confidence: 0~1, lost: boolean }
```
`imuQuat`는 하네스가 `deviceorientation`을 뒤 카메라 기준 쿼터니언으로 바꾼 값이다(`lookdown.js:162-166 deviceQuat`와 같은 식). 재생 모드에서는 JSON의 `samples[{t,q}]`를 보간해 준다.

## 측정값 정의 (`harness.js`)

| 열 | 뜻 |
| --- | --- |
| `drift_px` | 마커 화면 좌표의 **시작 시점 대비** 이동(px). 카메라가 돌면 정상적으로도 커진다. 시작 자세로 돌아오는 시나리오의 **끝값**이 의미 있다 |
| `drift_m` | 추적기가 보고한 카메라 위치의 시작 대비 이동(m). 자이로 추적기는 항상 0 |
| `err_px`, `err_m` | 정답 경로(`gt`)가 있을 때만. 추적 포즈로 투영한 마커와 정답 포즈로 투영한 마커의 거리(px), 카메라 위치 오차(m, 첫 프레임 오프셋만 맞춤) |
| `path_m` | 추적 위치의 누적 이동 거리 |
| `scale_est` | 정답 경로 길이 / 추적 경로 길이 (단안 SLAM 스케일 참고값) |

요약 JSON: 기기(UA, platform, model, GPU `WEBGL_debug_renderer_info`, 화면·처리 해상도), 평균 FPS, 평균·최대 처리 ms, lost 프레임 수, 최대 밀림, 오차. `sendSummaryToGA()`가 이를 `gtag('event','lookdown_lab_summary', {...})`로 보낸다(`lookdown.js:28 track()`과 같은 형식, 「GA4로 요약 보내기」 버튼).

## 실기기에서 돌리기

1. 이 폴더가 `main`에 있으면 `https://epispace.kr/lookdown/lab/harness.html` 로 열린다(https 필수: 카메라·센서는 http에서 안 열린다).
2. 추적기를 고르고 **「시작」**을 누른다. 한 번의 터치 안에서 iOS 동작·방향 권한 → 카메라 권한을 순서대로 묻는다. 거부하면 센서 없이 드래그 모드가 된다.
3. 인스타그램·카카오 앱 안 브라우저에서는 카메라가 안 열린다. Safari/Chrome으로 열 것.
4. (a)(b)(c) 버튼을 누르면 10/12/8초 동안 기록하면서 카메라 영상(webm)과 IMU(json)를 함께 내려받는다. 그 파일을 「영상 파일」「IMU JSON」으로 다시 올리면 PC에서 다른 추적기로 **같은 영상**을 재생·비교할 수 있다.
5. 「CSV 저장」「요약 JSON 저장」으로 결과를 받고, 요약 JSON을 `results/`에 넣어 주면 `RESULTS.md`에 반영한다.
6. iOS Safari에서 녹화 포맷은 `MediaRecorder.isTypeSupported('video/webm;codecs=vp8')`가 false면 기본 포맷(mp4)으로 저장된다. 재생은 같은 기기/크로미움에서 가능.

URL 파라미터: `?tracker=gyro|alva|alva-fb|hybrid`, `?stage=1..4`(hybrid 단계), `?video=…&imu=…`(재생), `?step=1`(프레임 단위 전부 처리), `?auto=1`, `?w=640&h=480&fov=67`, `?scale=`(alva 이동량 배율).

## PC에서 돌리기 (합성 데이터)

```bash
# 레포 루트에서. playwright-core, PLAYWRIGHT_BROWSERS_PATH 또는 CHROME_PATH 필요
npm install --no-save playwright-core
python3 lookdown/lab/tools/make-synthetic.py all     # data/ 생성 (PIL, numpy, ffmpeg)
node lookdown/lab/tools/run-lab.mjs gyro,alva,alva-fb a,b,c
node lookdown/lab/tools/run-lab.mjs hybrid a,b,c,b2 'stage=4' s4     # 결과는 results/hybrid-<scn>-s4.*
```
`b2`는 b와 같은 경로에 상자 2개와 왼쪽 벽을 넣은 시나리오다(바닥이 아닌 특징점 = 이상치 검증용).
`run-lab.mjs`는 `?step=1`로 모든 프레임을 빠짐없이 처리한다. 그래서 **FPS는 의미가 없고** `update_ms`만 본다.

## AlvaAR 라이선스

`vendor/alvaar/`는 **GPLv3**(`vendor/alvaar/LICENSE`)다. GPL 코드를 묶어 배포하면 그 배포물 전체 소스를 GPL로 공개해야 하므로, 이 실험 코드와 AlvaAR는 `lookdown/` 본 서비스에 그대로 넣으면 안 된다(별도 라이선스 협의나 다른 구현이 필요). 이 lab 폴더는 측정 전용이다.

## 미측정

- 실기기(아이폰·안드로이드) 모든 수치 — 사용자가 돌린다.
- 실제 웹캠·실제 바닥 영상 — 이 세션에는 카메라가 없어 합성 영상만 썼다.
- 휴대폰에서의 AlvaAR 처리시간·발열 — 미측정.
