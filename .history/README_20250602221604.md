# Epispace - 제주 문화 AR 체험

제주도의 문화와 역사를 웹AR로 체험하는 인터랙티브 데모 프로젝트입니다.

## 주요 기능

- 이중섭 거리의 예술 작품 AR 체험
- 제주 돌하르방 3D 모델 인터랙션
- 강정마을 설화 스토리텔링

## 기술 스택

- A-Frame (WebXR 프레임워크)
- HTML5/CSS3
- JavaScript (ES6+)

## 시작하기

1. 프로젝트 클론
```bash
git clone [repository-url]
```

2. 필요한 assets 파일 추가
- assets/bull.jpg (이중섭 황소 작품 이미지)
- assets/dolhareubang.glb (돌하르방 3D 모델)
- assets/gangjeong.jpg (강정마을 이미지)

3. 웹 서버 실행
로컬 웹 서버를 사용하여 프로젝트를 실행하세요.
```bash
python -m http.server 8000
```

4. 브라우저에서 접속
```
http://localhost:8000
```

## 사용 방법

1. 웹 브라우저에서 페이지를 엽니다.
2. 마우스 커서를 움직여 숨겨진 AR 콘텐츠를 찾습니다.
3. AR 요소에 커서를 가까이 가져가면 콘텐츠가 나타납니다.

## 주의사항

- WebXR 지원 브라우저가 필요합니다.
- 모바일 기기에서는 AR 기능이 제한될 수 있습니다.
- 3D 모델과 이미지 파일은 별도로 준비해야 합니다.