# Epispace - 제주 Web-AR 관광 솔루션

앱 설치 없이 브라우저에서 바로 즐기는 Jeju AR 여행, Epispace의 랜딩 페이지입니다.

## 🚀 프로젝트 개요

- **목적**: 제주 관광지를 인터랙티브 AR/NFC 트레일로 변환하는 Web-AR 솔루션 소개
- **키 메시지**: "앱 설치 없이 브라우저에서 바로 즐기는 Jeju AR 여행"
- **톤**: Warm, Futuristic, Clean
- **타겟**: 관광지 운영자, 지자체, 관광객

## 🛠 기술 스택

- **Frontend**: HTML5, Tailwind CSS 3.x, Vanilla JavaScript
- **폰트**: Noto Sans KR, Inter
- **이미지**: WebP 포맷, Lazy Loading
- **애니메이션**: CSS Transitions, Lottie (placeholder)
- **AR**: A-Frame (placeholder)
- **성능**: Lighthouse 최적화

## 🎨 디자인 시스템

### 색상 팔레트
- **Primary**: #FF6B00 (Orange)
- **Secondary**: #00B894 (Green)
- **Dark**: #222222
- **Light**: #F5F5F5

### 타이포그래피
- **Primary Font**: Noto Sans KR
- **Secondary Font**: Inter
- **Weights**: 400, 700

## 📁 프로젝트 구조

```
LilyEpi/
├── index.html               # 메인 랜딩 페이지
├── cherry-blossom-ar.html   # 🌸 벚꽃 터널 AR 포토존
├── design-tokens.json       # 디자인 토큰
├── assets/                  # 정적 자원
│   ├── images/             # 이미지 파일들
│   ├── jeju-hero-bg.webp   # 히어로 배경 (WebP)
│   ├── cherry-blossom-ar/  # 🌸 벚꽃 AR 리소스
│   │   ├── target.mind     # MindAR 이미지 타겟
│   │   ├── relief.glb      # 3D 모델
│   │   ├── petal.png       # 꽃잎 이미지
│   │   └── guide.png       # 가이드 이미지
│   └── epispace-business-proposal.pdf
├── README.md               # 프로젝트 문서
└── package.json            # 의존성 관리
```

## 🚀 설치 및 실행

### 1. 저장소 클론
```bash
git clone https://github.com/your-username/LilyEpi.git
cd LilyEpi
```

### 2. 로컬 서버 실행
```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```

### 3. 브라우저에서 확인
```
http://localhost:8000/sample.html
```

## 🎯 주요 기능

### 1. 🌸 벚꽃 터널 AR 포토존 (NEW!)
- **MindAR.js + A-Frame** 기반 이미지 트래킹 AR
- 직접 색칠한 도안이 3D 모델로 살아나는 인터랙티브 체험
- 고화질 스크린샷 (2048px+) 및 SNS 공유 기능
- 5초 카운트다운 + 셔터 효과로 포토존 경험 제공
- 떨어지는 벚꽃잎 파티클 효과

### 2. 반응형 디자인
- Desktop (1440px), Mobile (360px) 최적화
- Tailwind CSS Breakpoints 활용
- 모바일 퍼스트 접근법

### 3. 성능 최적화
- **Lighthouse Scores**: Performance ≥ 90, Accessibility ≥ 95
- WebP 이미지 포맷 사용
- Lazy Loading 구현
- 폰트 preconnect 최적화

### 4. 사용자 경험
- Sticky Navigation (투명→흰색 전환)
- Smooth Scrolling
- Hover Effects
- Testimonial Carousel

## 📱 섹션 구성

1. **Sticky Nav**: 투명 배경에서 스크롤 시 흰색으로 전환
2. **Hero**: 풀뷰 이미지 + 그라디언트 + Lottie 애니메이션
3. **3-Feature Cards**: NFC, AR 스토리, 데이터 대시보드
4. **How-it-Works**: 3단계 작동 방식 일러스트
5. **Testimonial Carousel**: 고객 후기 슬라이드
6. **Secondary CTA**: 협업 문의 및 제안서 다운로드
7. **Dark Footer**: 회사 정보 및 링크

## 🚀 배포 가이드

### 1. GitHub Pages (권장 - AR 기능 지원)

> ⚠️ **중요**: AR 기능(카메라 접근)을 위해서는 반드시 **HTTPS**가 필요합니다. GitHub Pages는 자동으로 HTTPS를 제공합니다.

```bash
# 1. GitHub 저장소 설정에서 Pages 활성화
# Repository → Settings → Pages → Source: main branch

# 2. 또는 gh-pages 브랜치 사용
git checkout -b gh-pages
git push origin gh-pages
```

**배포 URL**: `https://<username>.github.io/LilyEpi/`

### 2. Vercel 배포 (권장)
```bash
# Vercel CLI 설치
npm i -g vercel

# 배포 (HTTPS 자동 제공)
vercel --prod
```

### 3. 정적 호스팅 (Netlify)
```bash
# Netlify CLI 설치
npm install -g netlify-cli

# 배포
netlify deploy --prod
```

### 🔐 AR 기능을 위한 HTTPS 설정

벚꽃 AR 기능은 카메라 접근을 위해 HTTPS가 필수입니다:

| 환경 | HTTPS | AR 지원 |
|------|-------|---------|
| GitHub Pages | ✅ 자동 | ✅ |
| Vercel | ✅ 자동 | ✅ |
| Netlify | ✅ 자동 | ✅ |
| localhost | ✅ 예외 허용 | ✅ |
| HTTP 서버 | ❌ | ❌ |

### 📱 로컬 모바일 테스트 (ngrok)

```bash
# 로컬 서버 실행
python -m http.server 3000

# 다른 터미널에서 ngrok 실행
ngrok http 3000

# ngrok이 제공하는 HTTPS URL로 모바일 접속
# https://xxxx-xxx-xxx.ngrok.io
```

## 🔧 개발 팁

### 1. 이미지 최적화
```bash
# WebP 변환
cwebp input.jpg -o output.webp -q 80

# 여러 크기 생성
cwebp input.jpg -o output-800.webp -size 80000
cwebp input.jpg -o output-1200.webp -size 120000
```

### 2. 성능 모니터링
```bash
# Lighthouse CLI
npm install -g lighthouse
lighthouse https://your-site.com --output html
```

### 3. 폰트 최적화
```html
<!-- 폰트 preload -->
<link rel="preload" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=swap" as="style">
```

## 📊 성능 목표

- **Performance**: ≥ 90
- **Accessibility**: ≥ 95
- **Best Practices**: ≥ 90
- **SEO**: ≥ 90

## 🔮 향후 계획

- [x] A-Frame AR 씬 구현 (🌸 벚꽃 터널 AR 완료!)
- [ ] Lottie 애니메이션 추가
- [ ] 다국어 지원 (영어, 중국어)
- [ ] PWA 기능 추가
- [ ] 실시간 방문자 통계 대시보드
- [ ] 추가 AR 포토존 템플릿 개발

## 📞 문의

- **Email**: contact@epispace.kr
- **Instagram**: [@epispace.official](https://www.instagram.com/epispace.official/)
- **Blog**: [브런치](https://brunch.co.kr/@sooryeonyoun)

## 📄 라이선스

© 2026 Epispace. All rights reserved.