# jsfeat (vendored, unmodified)

- 출처: https://github.com/inspirit/jsfeat (npm `jsfeat`), 파일 `build/jsfeat-min.js` 66,093 B, 순수 JS, WASM 없음
- 라이선스: **MIT** (`LICENSE`). 본 서비스에 넣어도 된다.
- 쓰는 기능: `imgproc.grayscale`, `imgproc.pyrdown`, `pyramid_t`, `fast_corners`, `optical_flow_lk`
- 선택 이유: 필요한 건 코너 검출 + 피라미드 LK 광류뿐이고, OpenCV.js 기본 빌드(8~10 MB WASM)는 lookdown 본체(1.3 MB)의 7배라 탈락. 커스텀 OpenCV 빌드(2~3 MB)는 jsfeat 처리시간이 목표(8 ms)를 넘을 때 다음 후보.
- 2017년 이후 미유지. 전역 `window.jsfeat`에 붙는 고전 스크립트라 `trackers/hybrid.js`가 `import`로 실행만 시킨다.
