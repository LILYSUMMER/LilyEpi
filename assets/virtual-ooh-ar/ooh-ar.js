import * as THREE from 'three';

// 광고판이 떠 있을 자리입니다. declination은 그 지역의 자편각(나침반의 북쪽이 진북에서 동쪽으로 틀어진 각도)이라,
// 자리를 다른 도시로 옮기면 함께 바꿔야 광고판이 엉뚱한 방향에 뜨지 않습니다.
// radius 안에 있으면 실제 자리에 띄우고, 더 멀면 보는 사람 앞쪽에 띄웁니다.
const SPOT = {
  lat: 49.2856,
  lng: -123.127619,
  declination: 15.4,
  radius: 500,
};

// 단위는 m입니다. lift는 땅에서 광고판 아래 끝까지의 높이입니다.
const BOARD = { width: 8, height: 3, lift: 7 };
const EYE = 1.5;
const AHEAD = 32;
// 휴대폰 기본 카메라가 긴 변 쪽으로 담는 각도입니다. 실제와 크게 다르면 휴대폰을 돌릴 때 광고판이 거리 위에서 미끄러집니다.
const CAMERA_FOV = 67;

// 예시 가게의 영업시간입니다. 보는 사람의 현지 시각에 맞춰 광고판의 '영업 중' 문구가 바뀝니다.
const HOURS = { open: 10, close: 20 };

const AD = {
  ko: {
    name: '귤빛 카페',
    tagline: '걷다가 잠깐, 귤차 한 잔',
    open: '지금 영업 중',
    closed: '오전 10시에 열어요',
    here: '바로 여기',
    offer: 'AR 광고를 보고 오셨다고 말씀하시면 귤차 사이즈를 올려 드려요',
    sample: '예시',
    card: {
      badge: '예시 가게',
      hours: '매일 오전 10시 ~ 오후 8시',
      offer: 'AR 광고를 보고 오셨다고 말씀하시면 귤차 사이즈를 올려 드립니다.',
      about: '에피스페이스가 만든 AR 가상 옥외광고 예시입니다. 실제 간판은 없고, 그 자리에서 휴대폰을 든 사람에게만 보입니다. 위치와 문구, 언어는 언제든 바꿀 수 있습니다.',
      cta: '우리 거리에도 띄우기',
      close: '닫기',
    },
  },
  en: {
    name: 'Gyulbit Café',
    tagline: 'Take a break with a tangerine tea',
    open: 'Open now',
    closed: 'Opens at 10 am',
    here: 'Right here',
    offer: 'Mention this AR sign and we’ll size up your tangerine tea',
    sample: 'SAMPLE',
    card: {
      badge: 'Sample shop',
      hours: 'Open daily, 10 am to 8 pm',
      offer: 'Mention the AR sign and we’ll size up your tangerine tea.',
      about: 'A sample of virtual out-of-home made by Epispace. There is no real sign. Only people holding up a phone on the spot can see it, and the place, the words and the language can change at any time.',
      cta: 'Put one on our street',
      close: 'Close',
    },
  },
  zh: {
    name: '橘光咖啡',
    tagline: '走累了吗？来杯橘子茶吧',
    open: '营业中',
    closed: '上午10点营业',
    here: '就在这里',
    offer: '出示这则AR广告，橘子茶免费升杯',
    sample: '示例',
    card: {
      badge: '示例店铺',
      hours: '每天上午10点至晚上8点营业',
      offer: '出示这则AR广告，橘子茶即可免费升杯。',
      about: '这是Epispace制作的AR虚拟户外广告示例。现场并没有真的广告牌，只有在那里举起手机的人才能看到。位置、文字和语言随时都可以更换。',
      cta: '咨询合作',
      close: '关闭',
    },
  },
  ja: {
    name: 'みかん色カフェ',
    tagline: '散歩の途中に、みかん茶を一杯',
    open: '営業中',
    closed: '10時から営業',
    here: 'すぐそこ',
    offer: 'このAR広告を見せると、みかん茶をサイズアップ',
    sample: 'サンプル',
    card: {
      badge: 'サンプル店舗',
      hours: '毎日10時〜20時営業',
      offer: 'このAR広告をお見せいただくと、みかん茶を無料でサイズアップします。',
      about: 'Epispaceが制作したARバーチャル屋外広告のサンプルです。実際の看板はなく、その場でスマートフォンをかざした人にだけ見えます。場所や文言、言語はいつでも変えられます。',
      cta: '導入のご相談',
      close: '閉じる',
    },
  },
};

const FONT = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "PingFang SC", "Hiragino Sans", "Noto Sans KR", "Noto Sans CJK SC", sans-serif';
const PAGE_LANG = document.documentElement.lang === 'en' ? 'en' : 'ko';
const $ = (id) => document.getElementById(id);
const track = (name, params) => window.gtag && window.gtag('event', name, params);
const sheet = $('sheet');

const mapLink = $('map-link');
if (mapLink) mapLink.href = `https://www.google.com/maps/search/?api=1&query=${SPOT.lat}%2C${SPOT.lng}`;

/* ---------- 광고 언어 ---------- */

let adLang = PAGE_LANG;
const liveAds = new Set();

function setAdLang(lang) {
  adLang = lang;
  document.querySelectorAll('[data-ad-lang]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.adLang === lang));
  });
  liveAds.forEach((ad) => ad.setLang(lang));
  fillCard(lang);
}

document.querySelectorAll('[data-ad-lang]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setAdLang(button.dataset.adLang);
  });
});
setAdLang(adLang);

/* ---------- 그리기 도구 ---------- */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const easeBack = (x) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
};

function canvasTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture(rgb) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${rgb},1)`);
  grd.addColorStop(0.4, `rgba(${rgb},0.45)`);
  grd.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return canvasTexture(c);
}

// 땅에서 광고판까지 이어지는 빛기둥입니다. 가운데가 밝고, 땅 쪽으로 갈수록 진해집니다.
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) {
    const fall = 0.3 + 0.7 * Math.pow(y / 255, 1.6);
    for (let x = 0; x < 64; x++) {
      const u = (x - 31.5) / 31.5;
      const i = (y * 64 + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 150;
      img.data[i + 2] = 60;
      img.data[i + 3] = Math.round(Math.exp(-u * u * 5) * fall * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c);
}

function pill(g, x, y, w, h) {
  const r = h / 2;
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function fitFont(g, text, maxWidth, size, weight) {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${FONT}`;
    if (g.measureText(text).width <= maxWidth) break;
    s -= 2;
  } while (s > 12);
  return s;
}

function isOpenNow() {
  const hour = new Date().getHours();
  return hour >= HOURS.open && hour < HOURS.close;
}

function formatDistance(d, lang) {
  if (d === null || d === undefined) return '';
  if (d < 15) return AD[lang].here;
  const km = d >= 1000;
  return new Intl.NumberFormat(lang, {
    style: 'unit',
    unit: km ? 'kilometer' : 'meter',
    maximumFractionDigits: km && d < 100000 ? 1 : 0,
  }).format(km ? d / 1000 : Math.round(d / 10) * 10);
}

function ledPattern(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  return c;
}

function drawScreen(g, W, H, t, lang, open, distance, led) {
  const copy = AD[lang];
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#241309');
  bg.addColorStop(1, '#3d1b05');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const band = Math.round(H * 0.17);
  const body = H - band;

  // 귤
  const r = body * 0.27;
  const cx = r + 70;
  const cy = body * 0.5 + Math.sin(t * 2.4) * 6;
  const fruit = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  fruit.addColorStop(0, '#FFC27D');
  fruit.addColorStop(0.55, '#FF7A12');
  fruit.addColorStop(1, '#E05400');
  g.fillStyle = fruit;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(cx + r * 0.28, cy - r * 0.92);
  g.rotate(-0.5 + Math.sin(t * 2.4) * 0.08);
  g.fillStyle = '#3FA34D';
  g.beginPath();
  g.ellipse(0, 0, r * 0.38, r * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  const left = cx + r + 50;
  const textWidth = W - left - 40;

  // 오른쪽 위 '예시'
  g.font = `700 24px ${FONT}`;
  const tagW = g.measureText(copy.sample).width + 32;
  g.fillStyle = 'rgba(255,255,255,0.16)';
  pill(g, W - tagW - 22, 20, tagW, 38);
  g.fill();
  g.fillStyle = '#FFE3CC';
  g.textBaseline = 'middle';
  g.fillText(copy.sample, W - tagW - 6, 40);

  g.textBaseline = 'alphabetic';
  g.fillStyle = '#FFFFFF';
  fitFont(g, copy.name, textWidth - tagW - 10, 88, 800);
  g.fillText(copy.name, left, body * 0.42);

  g.fillStyle = '#FFD2A8';
  fitFont(g, copy.tagline, textWidth, 40, 600);
  g.fillText(copy.tagline, left, body * 0.62);

  // 영업 상태와 남은 거리
  const status = [open ? copy.open : copy.closed, formatDistance(distance, lang)].filter(Boolean).join(' · ');
  const statusSize = fitFont(g, status, textWidth - 60, 28, 600);
  const statusW = g.measureText(status).width + 64;
  const statusY = body * 0.72;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  pill(g, left, statusY, statusW, statusSize + 22);
  g.fill();
  g.fillStyle = open ? '#34D399' : '#9CA3AF';
  g.beginPath();
  g.arc(left + 24, statusY + (statusSize + 22) / 2, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#F9FAFB';
  g.textBaseline = 'middle';
  g.fillText(status, left + 42, statusY + (statusSize + 22) / 2 + 1);

  // 지나가는 빛
  const sweep = ((t * 0.22) % 1.4 - 0.2) * W;
  const sg = g.createLinearGradient(sweep - 140, 0, sweep + 140, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.09)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sg;
  g.fillRect(0, 0, W, body);

  // 아래 흐르는 띠
  g.fillStyle = '#FF6B00';
  g.fillRect(0, body, W, band);
  g.fillStyle = '#1A0D04';
  g.font = `700 ${Math.round(band * 0.5)}px ${FONT}`;
  const message = `${copy.offer}     ·     `;
  const mw = g.measureText(message).width;
  for (let x = -((t * 110) % mw); x < W; x += mw) g.fillText(message, x, body + band / 2 + 1);

  g.drawImage(led, 0, 0);
}

/* ---------- 광고판 ---------- */

// grow를 켜면 멀리 있을수록 광고판을 키워서, 거리가 멀어도 글씨가 읽힐 만한 크기로 보이게 합니다.
// ghost를 켜면 건물이나 나무에 가려진 부분에 희미한 윤곽을 남깁니다.
function buildAd({ grow, ghost = false }) {
  const W = BOARD.width;
  const H = BOARD.height;
  const top = BOARD.lift + H / 2;
  const additive = (options) => new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, ...options,
  });

  const root = new THREE.Group();
  const face = new THREE.Group();
  root.add(face);

  const beamMat = additive({ map: beamTexture(), side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.6, BOARD.lift).translate(0, BOARD.lift / 2, 0), beamMat);
  face.add(beam);

  const poolMat = additive({ map: glowTexture('255,140,50') });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3, 48), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.02;
  root.add(pool);

  const ringMat = additive({ color: 0xff8a2a, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  root.add(ring);

  const board = new THREE.Group();
  face.add(board);

  const metal = new THREE.MeshStandardMaterial({ color: 0x30343b, metalness: 0.55, roughness: 0.5 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, H + 0.3, 0.35), metal);
  frame.position.z = -0.19;
  board.add(frame);

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024;
  screenCanvas.height = Math.round((1024 * H) / W);
  const screenCtx = screenCanvas.getContext('2d');
  const led = ledPattern(screenCanvas.width, screenCanvas.height);
  const screenTex = canvasTexture(screenCanvas);
  screenTex.anisotropy = 4;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 0, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), screenMat);
  screen.position.z = 0.01;
  board.add(screen);

  const glowMat = additive({ map: glowTexture('255,140,50') });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, H * 1.9), glowMat);
  glow.position.z = -0.45;
  board.add(glow);

  // 광고판보다 앞에 다른 물체의 깊이가 남아 있는 곳(GreaterDepth)에만 그려집니다. 광고판 앞면보다 살짝 앞에 두어야
  // 가리는 것이 없을 때 광고판 자신의 깊이에 막혀 그려지지 않습니다.
  const behind = { transparent: true, opacity: 0, depthWrite: false, depthFunc: THREE.GreaterDepth, toneMapped: false };
  const ghostFaceMat = new THREE.MeshBasicMaterial({ map: screenTex, ...behind });
  const ghostLineMat = new THREE.MeshBasicMaterial({ color: 0xff6b00, ...behind });
  if (ghost) {
    const ghostFace = new THREE.Mesh(new THREE.PlaneGeometry(W, H), ghostFaceMat);
    ghostFace.position.z = 0.05;
    const corners = (w, h) => [
      new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2),
      new THREE.Vector2(w / 2, h / 2), new THREE.Vector2(-w / 2, h / 2),
    ];
    const outline = new THREE.Shape(corners(W + 0.3, H + 0.3));
    outline.holes.push(new THREE.Path(corners(W - 0.06, H - 0.06)));
    const ghostLine = new THREE.Mesh(new THREE.ShapeGeometry(outline), ghostLineMat);
    ghostLine.position.z = 0.06;
    ghostFace.renderOrder = 10;
    ghostLine.renderOrder = 10;
    board.add(ghostFace, ghostLine);
  }

  const sparkTex = glowTexture('255,236,210');
  const sparks = [];
  for (let i = 0; i < 18; i++) {
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    spark.userData = {
      x: (Math.random() - 0.5) * (W + 1.2),
      y0: Math.random(),
      speed: 0.04 + Math.random() * 0.05,
      z: 0.2 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      size: 0.12 + Math.random() * 0.16,
    };
    face.add(spark);
    sparks.push(spark);
  }

  let lang = adLang;
  let open = isOpenNow();
  let distance = null;
  let openCheckedAt = 0;
  let drawnAt = -1;
  let startAt = null;
  const FLICKER = [0.15, 0.9, 0.2, 1, 0.5, 1];

  function update(t, eye) {
    root.visible = startAt !== null;
    if (startAt === null) return;

    const dx = eye.x - root.position.x;
    const dz = eye.z - root.position.z;
    face.rotation.y = Math.atan2(dx, dz);
    if (grow) root.scale.setScalar(THREE.MathUtils.clamp(Math.hypot(dx, dz) / 30, 1, 4));

    const k = t - startAt;
    const shoot = easeOut(clamp01(k / 0.6));
    beam.scale.y = Math.max(0.001, shoot);
    beamMat.opacity = 0.8 * shoot * (0.92 + 0.08 * Math.sin(t * 7));
    poolMat.opacity = 0.45 * shoot;
    const wave = (t * 0.7) % 1;
    ring.scale.setScalar(0.6 + 0.9 * wave);
    ringMat.opacity = 0.7 * shoot * (1 - wave);

    const rise = clamp01((k - 0.35) / 0.8);
    board.visible = rise > 0;
    board.position.y = BOARD.lift * 0.5 + (top - BOARD.lift * 0.5) * easeOut(rise);
    board.scale.setScalar(0.3 + 0.7 * easeBack(rise));

    const on = k - 1.15;
    screenMat.opacity = on < 0 ? 0 : on < 0.45 ? FLICKER[Math.floor(on / 0.075)] : 1;
    ghostFaceMat.opacity = 0.25 * screenMat.opacity;
    ghostLineMat.opacity = 0.7 * screenMat.opacity;
    const lit = easeOut(clamp01((k - 1.3) / 0.6));
    glowMat.opacity = 0.28 * lit * (0.9 + 0.1 * Math.sin(t * 3));

    const fade = clamp01((k - 1.5) / 0.8);
    const low = BOARD.lift * 0.3;
    const span = top + H / 2 + 1 - low;
    for (const spark of sparks) {
      const d = spark.userData;
      const f = (d.y0 + t * d.speed) % 1;
      spark.position.set(d.x + Math.sin(t + d.phase) * 0.1, low + f * span, d.z);
      spark.material.opacity = fade * Math.sin(Math.PI * f) * (0.55 + 0.45 * Math.sin(t * 4 + d.phase));
      spark.scale.setScalar(d.size);
    }

    if (t - openCheckedAt > 30) {
      openCheckedAt = t;
      open = isOpenNow();
    }
    if (screenMat.opacity > 0 && t - drawnAt > 1 / 30) {
      drawnAt = t;
      drawScreen(screenCtx, screenCanvas.width, screenCanvas.height, t, lang, open, distance, led);
      screenTex.needsUpdate = true;
    }
  }

  return {
    root,
    hit: [screen, frame],
    center: (target) => board.getWorldPosition(target),
    ready: () => screenMat.opacity >= 1,
    show(t) { if (startAt === null) startAt = t; },
    update,
    setLang(next) { lang = next; drawnAt = -1; },
    setDistance(d) { distance = d; },
  };
}

function addLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.4, 1, 0.8);
  scene.add(sun);
}

const ray = new THREE.Raycaster();
function hitAd(event, canvas, camera, ad) {
  if (!ad.ready()) return false;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((event.clientX - r.left) / r.width) * 2 - 1, -((event.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.intersectObjects(ad.hit, false).length > 0;
}

/* ---------- 가게 안내 ---------- */

function fillCard(lang) {
  const copy = { name: AD[lang].name, ...AD[lang].card };
  sheet.lang = lang;
  sheet.querySelectorAll('[data-card]').forEach((el) => {
    el.textContent = copy[el.dataset.card];
  });
  // 중국어·일본어 홈페이지는 없어서, 한국어가 아니면 영어 홈페이지의 문의로 보냅니다.
  sheet.querySelector('[data-card="cta"]').href = lang === 'ko' ? '/index.html#contact' : '/en/index.html#contact';
}

function openSheet() {
  sheet.hidden = false;
  $('hint')?.classList.remove('is-on');
  $('btn-sheet-close').focus();
  track('ooh_ar_sheet');
}
function closeSheet() {
  sheet.hidden = true;
}
$('btn-sheet-close').addEventListener('click', closeSheet);
sheet.addEventListener('click', (event) => { if (event.target === sheet) closeSheet(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSheet(); });

function showError(kind, error) {
  if (error) console.error(error);
  const box = $('err');
  box.querySelector('p').innerHTML = box.dataset[kind];
  box.querySelector('small').textContent = error && error.message ? error.message : '';
  box.hidden = false;
}

/* ---------- 위치 접근이 막혔을 때 ---------- */

const UA = navigator.userAgent;
const IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|BAND\//i.test(UA);
const IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);

const locHelp = $('loc-help');
locHelp.querySelector('[data-action="restart"]').addEventListener('click', () => location.reload());
locHelp.querySelector('[data-action="close"]').addEventListener('click', () => { locHelp.hidden = true; });

// 웹페이지는 브라우저 설정을 바꿀 수 없습니다. Chrome은 페이지 안의 <geolocation> 버튼을 누르면 막아 둔 위치도
// 다시 허용할 수 있고, 아이폰에는 그런 방법이 없어 설정 경로를 안내합니다.
function showLocationHelp(onFix) {
  let how = 'other';
  if (IN_APP) how = 'inapp';
  else if ('HTMLGeolocationElement' in window) how = 'chrome';
  else if (IOS) how = 'ios';
  locHelp.querySelectorAll('[data-how]').forEach((el) => {
    el.hidden = !el.dataset.how.split(' ').includes(how);
  });
  const app = /CriOS/.test(UA) ? 'Chrome' : /FxiOS/.test(UA) ? 'Firefox' : /EdgiOS/.test(UA) ? 'Edge' : '';
  if (how === 'ios' && app) {
    locHelp.querySelector('[data-ios-app]').textContent = app;
    locHelp.querySelector('[data-safari-only]').hidden = true;
  }
  if (how === 'chrome') {
    const button = document.createElement('geolocation');
    button.setAttribute('watch', '');
    button.setAttribute('accuracymode', 'precise');
    // 버튼으로 허용받은 뒤에는 보통의 위치 추적으로 넘깁니다. 숨긴 버튼이 계속 위치를 보내 준다는 보장이 없습니다.
    button.addEventListener('location', () => {
      if (!button.position) return;
      const { coords } = button.position;
      locHelp.hidden = true;
      button.remove();
      onFix(coords);
      watchPlace(onFix, () => {});
    });
    locHelp.querySelector('[data-slot="geolocation"]').replaceWith(button);
  }
  locHelp.hidden = false;
  track('ooh_ar_location_help', { how });
}

/* ---------- 휴대폰: 방향과 위치 ---------- */

const deg = THREE.MathUtils.degToRad;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const BACK_CAMERA = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
const tmpForward = new THREE.Vector3();
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function screenAngle() {
  const angle = screen.orientation && screen.orientation.angle;
  return typeof angle === 'number' ? angle : window.orientation || 0;
}

// 기기 방향(alpha·beta·gamma)을 뒤쪽 카메라가 바라보는 방향으로 바꿉니다. 세계 좌표는 -z가 북쪽, +x가 동쪽입니다.
function deviceQuat(target, { alpha, beta, gamma }) {
  tmpEuler.set(deg(beta), deg(alpha), -deg(gamma), 'YXZ');
  target.setFromEuler(tmpEuler).multiply(BACK_CAMERA);
  return target.multiply(tmpQuat.setFromAxisAngle(Z_AXIS, -deg(screenAngle())));
}

const forwardOf = (q) => tmpForward.set(0, 0, -1).applyQuaternion(q);

// 자이로로 읽은 방향은 부드럽지만 북쪽을 모르고, 나침반은 북쪽을 알지만 흔들립니다.
// 그래서 화면은 자이로로 돌리고, 둘 사이의 어긋남(offset)만 나침반으로 천천히 맞춥니다.
function watchMotion() {
  const state = { rel: null, offset: 0, compass: false, frozen: false };
  const q = new THREE.Quaternion();
  let relSeen = false;
  let absSeen = false;
  let lastYaw = null;
  let lastAt = 0;

  function headingOf(orientation) {
    const f = forwardOf(deviceQuat(q, orientation));
    return Math.abs(f.y) > 0.85 ? null : THREE.MathUtils.radToDeg(Math.atan2(f.x, -f.z));
  }

  function sample(heading) {
    if (!state.rel || state.frozen || heading === null) return;
    const f = forwardOf(deviceQuat(q, state.rel));
    // 카메라가 거의 땅이나 하늘을 향하면 방위가 흔들리므로 건너뜁니다.
    if (Math.abs(f.y) > 0.85) return;
    const yaw = Math.atan2(-f.x, -f.z);
    const now = performance.now();
    const turning = lastYaw !== null && Math.abs(wrapAngle(yaw - lastYaw)) / Math.max(0.016, (now - lastAt) / 1000) > 1.2;
    lastYaw = yaw;
    lastAt = now;
    if (turning) return;
    const target = wrapAngle(-deg(heading + SPOT.declination) - yaw);
    state.offset = state.compass ? wrapAngle(state.offset + wrapAngle(target - state.offset) * 0.03) : target;
    state.compass = true;
  }

  window.addEventListener('deviceorientation', (e) => {
    if (e.alpha === null && e.beta === null) return;
    relSeen = true;
    state.rel = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 };
    // 아이폰은 alpha가 시작할 때 방향을 0으로 잡고, 나침반 값은 webkitCompassHeading(자북 기준)으로 따로 줍니다.
    if (typeof e.webkitCompassHeading === 'number' && e.webkitCompassAccuracy >= 0) sample(e.webkitCompassHeading);
    else if (e.absolute === true && !absSeen) sample(headingOf(state.rel));
  });
  window.addEventListener('deviceorientationabsolute', (e) => {
    if (e.alpha === null) return;
    absSeen = true;
    const orientation = { alpha: e.alpha, beta: e.beta || 0, gamma: e.gamma || 0 };
    if (!relSeen) state.rel = orientation;
    sample(headingOf(orientation));
  });

  return state;
}

function watchPlace(onFix, onFail) {
  if (!('geolocation' in navigator)) {
    onFail();
    return;
  }
  navigator.geolocation.watchPosition((position) => onFix(position.coords), onFail, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 20000,
  });
}

const EARTH = 6371008.8;
function metersFromSpot(lat, lng) {
  return {
    x: deg(lng - SPOT.lng) * EARTH * Math.cos(deg(SPOT.lat)),
    z: -deg(lat - SPOT.lat) * EARTH,
  };
}
function distanceToSpot(lat, lng) {
  const dLat = deg(lat - SPOT.lat);
  const dLng = deg(lng - SPOT.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg(lat)) * Math.cos(deg(SPOT.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(a));
}

// 영상은 object-fit: cover로 화면을 채우므로, 잘려 나간 만큼 줄어든 세로 화각을 3D 카메라에 맞춥니다.
function visibleFov(video, w, h) {
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 1280;
  const t = Math.tan(deg(CAMERA_FOV / 2));
  const tanV = vh >= vw ? t : t * (vh / vw);
  const shown = h / (vh * Math.max(w / vw, h / vh));
  return THREE.MathUtils.radToDeg(2 * Math.atan(tanV * shown));
}

/* ---------- 휴대폰: 광고판을 가리는 건물과 나무 ---------- */

// 실제 건물과 나무 자리에 보이지 않는 모형을 세워 깊이만 남기면, 모형 뒤에 있는 광고판 부분이 지워집니다.
// 데이터는 tools/build-occluders.mjs로 만듭니다. ?occluders=show로 열면 모형이 보입니다.
const OCCLUDERS_URL = new URL('occluders.json', import.meta.url);
const SHOW_OCCLUDERS = new URLSearchParams(location.search).get('occluders') === 'show';

const OCCLUDER_VERTEX = /* glsl */ `
varying vec3 vWorld;
#ifdef LEAFY
varying vec3 vNormal;
#endif
void main() {
  vec4 local = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    local = instanceMatrix * local;
  #endif
  vec4 world = modelMatrix * local;
  vWorld = world.xyz;
  #ifdef LEAFY
    // 나무는 구를 늘려 만든 타원체라서, 법선은 늘린 비율로 나눠야 맞습니다.
    vec3 stretch = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vNormal = normalize(mat3(modelMatrix) * (normal / stretch));
  #endif
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const OCCLUDER_FRAGMENT = /* glsl */ `
uniform float uNear;
varying vec3 vWorld;
#ifdef LEAFY
varying vec3 vNormal;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
#endif
void main() {
  if (distance(vWorld.xz, cameraPosition.xz) < uNear) discard;
  #ifdef LEAFY
    // 잎 사이로 뒤가 비치도록, 정면에서는 거의 막고 가장자리로 갈수록 성기게 뚫습니다.
    float facing = abs(dot(normalize(vNormal), normalize(cameraPosition - vWorld)));
    if (noise(vWorld * 1.3) > 0.2 + 0.7 * smoothstep(0.0, 0.8, facing)) discard;
  #endif
  gl_FragColor = TINT;
}`;

function occluderMaterial(near, leafy) {
  const tint = leafy ? 'vec4(0.3, 0.9, 0.4, 0.45)' : 'vec4(0.2, 0.7, 1.0, 0.4)';
  return new THREE.ShaderMaterial({
    vertexShader: OCCLUDER_VERTEX,
    fragmentShader: OCCLUDER_FRAGMENT,
    defines: leafy ? { LEAFY: '', TINT: tint } : { TINT: tint },
    uniforms: { uNear: near },
    side: THREE.DoubleSide,
    colorWrite: SHOW_OCCLUDERS,
    // 보여 줄 때도 불투명 차례에 그려야 광고판보다 먼저 깊이가 남습니다.
    blending: SHOW_OCCLUDERS ? THREE.CustomBlending : THREE.NormalBlending,
  });
}

// buildings: [높이, 바닥 높이, x0, z0, x1, z1, ...] 벽과 지붕만 세웁니다.
function footprintGeometry(buildings) {
  const positions = [];
  for (const b of buildings) {
    const [top, base] = b;
    const ring = [];
    for (let i = 2; i < b.length; i += 2) ring.push(new THREE.Vector2(b[i], b[i + 1]));
    ring.forEach((a, i) => {
      const c = ring[(i + 1) % ring.length];
      positions.push(a.x, base, a.y, c.x, base, c.y, c.x, top, c.y, a.x, base, a.y, c.x, top, c.y, a.x, top, a.y);
    });
    for (const tri of THREE.ShapeUtils.triangulateShape(ring, [])) {
      for (const i of tri) positions.push(ring[i].x, top, ring[i].y);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

// trees: 나무마다 [x, z, 꼭대기, 수관 아래 끝, 수관 반지름]
function treeMesh(trees, material) {
  const count = trees.length / 5;
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), material, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const [x, z, top, bottom, r] = trees.slice(i * 5, i * 5 + 5);
    mesh.setMatrixAt(i, m.makeScale(r, (top - bottom) / 2, r).setPosition(x, (top + bottom) / 2, z));
  }
  mesh.computeBoundingSphere();
  return mesh;
}

function insideRing(x, z, b) {
  let hit = false;
  for (let i = 2, j = b.length - 2; i < b.length; j = i, i += 2) {
    const xi = b[i];
    const zi = b[i + 1];
    const xj = b[j];
    const zj = b[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

async function loadOccluders() {
  const response = await fetch(OCCLUDERS_URL);
  if (!response.ok) throw new Error(`occluders.json ${response.status}`);
  const data = await response.json();
  // 광고판 자리를 옮기고 데이터를 다시 만들지 않았다면, 엉뚱한 건물이 광고판을 가리게 되므로 쓰지 않습니다.
  if (data.spot.lat !== SPOT.lat || data.spot.lng !== SPOT.lng) return null;

  const near = { value: 12 };
  const group = new THREE.Group();
  const buildings = new THREE.Mesh(footprintGeometry(data.buildings), occluderMaterial(near, false));
  const trees = treeMesh(data.trees, occluderMaterial(near, true));
  buildings.renderOrder = -1;
  trees.renderOrder = -1;
  group.add(buildings, trees);
  group.visible = false;

  const ground = data.buildings.filter((b) => b[1] < 1).map((b) => {
    const xs = b.filter((_, i) => i >= 2 && i % 2 === 0);
    const zs = b.filter((_, i) => i >= 2 && i % 2 === 1);
    return { b, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });

  return {
    group,
    // 위치 오차만큼 모형도 실제보다 밀려 있는데, 가까운 모형일수록 그 오차가 화면에서 크게 벌어집니다.
    // 그래서 오차에 비례한 거리 안쪽의 모형은 무시합니다.
    setAccuracy(accuracy) { near.value = THREE.MathUtils.clamp(accuracy * 1.2, 8, 30); },
    // 위치가 건물 안으로 잡히면 사방이 벽이라 광고판이 통째로 가려지므로, 그동안은 가리지 않습니다.
    indoors(x, z) {
      return ground.some((g) => x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ && insideRing(x, z, g.b));
    },
  };
}

/* ---------- 휴대폰: AR ---------- */

async function startAR() {
  // 아이폰은 방향 센서 권한을 버튼을 누른 그 순간에 물어야 해서, 다른 기다림보다 먼저 묻습니다.
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    let answer = 'denied';
    try {
      answer = await DeviceOrientationEvent.requestPermission();
    } catch (error) {
      console.error(error);
    }
    if (answer !== 'granted') {
      showError('motion');
      return false;
    }
  }
  const motion = watchMotion();

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  } catch (error) {
    showError('camera', error);
    return false;
  }

  const ar = $('ar');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  ar.appendChild(video);
  try {
    await video.play();
  } catch (error) {
    console.error(error);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ar.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  camera.position.set(0, EYE, 0);
  const ad = buildAd({ grow: true, ghost: true });
  liveAds.add(ad);
  scene.add(ad.root);

  let occluders = null;
  let indoors = false;
  loadOccluders().then((found) => {
    if (!found) return;
    occluders = found;
    scene.add(found.group);
  }).catch((error) => console.error(error));

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = visibleFov(video, w, h);
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  video.addEventListener('loadedmetadata', resize);
  video.addEventListener('resize', resize);
  resize();

  const status = $('status');
  let statusTimer = 0;
  function say(key, values = {}, sticky = false) {
    clearTimeout(statusTimer);
    if (!key) {
      status.classList.add('is-off');
      return;
    }
    status.textContent = status.dataset[key].replace(/\{(\w)\}/g, (_, name) => values[name] ?? '');
    status.classList.remove('is-off');
    if (!sticky) statusTimer = setTimeout(() => status.classList.add('is-off'), 6000);
  }

  // locating: 위치를 기다리는 중, onsite: 실제 자리에 띄움, ahead: 보는 사람 앞쪽에 띄움
  let mode = 'locating';
  let wanted = null;
  let nearSince = 0;
  let accuracy = 0;
  let quietUntil = 0;
  let aheadWhy = null;
  const eyeTarget = new THREE.Vector3(0, EYE, 0);
  const clock = new THREE.Clock();
  say('locating', {}, true);

  const request = (next, why, values) => {
    if (mode === 'locating' && !wanted) wanted = { next, why, values };
  };
  // 위치가 늦게 잡혀도 앞쪽에 띄운 채로 계속 기다렸다가, 반경 안으로 잡히면 제자리로 옮깁니다.
  const giveUp = setTimeout(() => { if (!nearSince) request('ahead', 'searching'); }, 12000);

  const onFix = (coords) => {
    const away = distanceToSpot(coords.latitude, coords.longitude);
    if (!nearSince) {
      if (away > SPOT.radius) {
        // 오차 범위가 반경 안쪽까지 걸치면 멀다고 단정하지 않고 더 정확한 위치를 기다립니다.
        if (away - coords.accuracy > SPOT.radius) {
          const values = { d: formatDistance(away, PAGE_LANG) };
          if (mode === 'locating') request('ahead', 'far', values);
          else if (mode === 'ahead' && aheadWhy !== 'far') {
            aheadWhy = 'far';
            say('far', values);
          }
        }
        return;
      }
      if (mode === 'ahead' && coords.accuracy > 60) return;
      nearSince = performance.now();
      motion.frozen = false;
    }
    // 오차가 너무 큰 위치는 광고판을 크게 흔들기만 하므로 버립니다.
    if (coords.accuracy > 60 && mode === 'onsite') return;
    accuracy = coords.accuracy;
    const p = metersFromSpot(coords.latitude, coords.longitude);
    eyeTarget.set(p.x, EYE, p.z);
    if (occluders) indoors = occluders.indoors(p.x, p.z);
    if (mode === 'onsite' && performance.now() > quietUntil) say(accuracy > 25 ? 'weak' : null, { a: Math.round(accuracy) }, true);
  };
  watchPlace(onFix, (error) => {
    if (!nearSince && (!error || error.code === error.PERMISSION_DENIED)) request('ahead', 'denied');
  });

  function place(next, why, values) {
    mode = next;
    clearTimeout(giveUp);
    if (next === 'onsite') {
      camera.position.copy(eyeTarget);
      ad.root.position.set(0, 0, 0);
      if (why) quietUntil = performance.now() + 6000;
      say(why || (accuracy > 25 ? 'weak' : null), { a: Math.round(accuracy) }, !why);
    } else {
      motion.frozen = true;
      camera.position.set(0, EYE, 0);
      const ahead = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0);
      // 휴대폰을 땅으로 향하고 있으면 휴대폰 윗변이 가리키는 쪽에 세웁니다.
      if (ahead.lengthSq() < 0.09) ahead.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);
      if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
      ahead.normalize().multiplyScalar(AHEAD);
      ad.root.position.set(ahead.x, 0, ahead.z);
      aheadWhy = why;
      if (why === 'denied') {
        say(null);
        showLocationHelp(onFix);
      } else say(why, values);
    }
    ad.show(clock.getElapsedTime());
    $('ad-langs').classList.add('is-on');
    track('ooh_ar_shown', { mode: next, reason: why });
  }

  const pointer = $('pointer');
  const arrow = pointer.querySelector('.arrow');
  const pointerLabel = $('pointer-label');
  const center = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  // 광고판이 화면 밖에 있으면 화면 가장자리에 그쪽을 가리키는 화살표를 둡니다.
  function updatePointer(distance) {
    const p = ad.center(center).applyMatrix4(camera.matrixWorldInverse);
    if (p.z < 0) {
      ndc.copy(p).applyMatrix4(camera.projectionMatrix);
      if (Math.abs(ndc.x) < 0.85 && Math.abs(ndc.y) < 0.85) {
        pointer.hidden = true;
        return true;
      }
    }
    let dx = p.z > 0 ? (p.x >= 0 ? 1 : -1) : p.x;
    let dy = p.z > 0 ? 0 : p.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const reach = Math.min((halfW - 56) / Math.max(Math.abs(dx), 1e-3), (halfH - 130) / Math.max(Math.abs(dy), 1e-3));
    pointer.style.left = `${halfW + dx * reach}px`;
    pointer.style.top = `${halfH - dy * reach}px`;
    arrow.style.transform = `rotate(${Math.atan2(-dy, dx)}rad)`;
    pointerLabel.textContent = [pointer.dataset.label, formatDistance(distance, PAGE_LANG)].filter(Boolean).join(' · ');
    pointer.hidden = !sheet.hidden;
    return false;
  }

  ar.addEventListener('click', (event) => {
    if (mode !== 'locating' && hitAd(event, renderer.domElement, camera, ad)) openSheet();
  });

  const deviceQ = new THREE.Quaternion();
  let hinted = false;
  let last = 0;
  setTimeout(() => { if (!motion.rel) showError('sensor'); }, 2500);

  document.documentElement.classList.add('is-running');
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.1, t - last);
    last = t;

    if (motion.rel) camera.quaternion.setFromAxisAngle(Y_AXIS, motion.offset).multiply(deviceQuat(deviceQ, motion.rel));

    if (mode === 'locating' && motion.rel) {
      if (wanted) place(wanted.next, wanted.why, wanted.values);
      else if (nearSince && motion.compass) place('onsite');
      else if (nearSince && performance.now() - nearSince > 3000) place('ahead', 'nocompass');
    } else if (mode === 'ahead' && nearSince && motion.compass) {
      place('onsite', 'found');
    }

    let distance = null;
    if (mode === 'onsite') {
      camera.position.lerp(eyeTarget, 1 - Math.exp(-dt / 1.5));
      distance = Math.hypot(camera.position.x - ad.root.position.x, camera.position.z - ad.root.position.z);
    }
    ad.setDistance(distance);
    ad.update(t, camera.position);
    // 다른 곳에서 앞쪽에 띄울 때는 주변에 무엇이 있는지 모르므로 가리지 않습니다.
    if (occluders) {
      occluders.group.visible = mode === 'onsite' && !indoors;
      occluders.setAccuracy(accuracy);
    }
    renderer.render(scene, camera);

    if (mode !== 'locating') {
      const onScreen = updatePointer(distance);
      if (onScreen && !hinted && ad.ready()) {
        hinted = true;
        setTimeout(() => { if (sheet.hidden) $('hint').classList.add('is-on'); }, 1200);
        setTimeout(() => $('hint').classList.remove('is-on'), 7000);
      }
    }
  });
  return true;
}

/* ---------- 거리 미리 보기 (PC와 휴대폰 시작 화면) ---------- */

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#a7b6c6';
  g.fillRect(14, 12, 36, 34);
  g.fillStyle = '#c3cfdb';
  g.fillRect(14, 12, 36, 8);
  const texture = canvasTexture(c);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// 창문 무늬가 건물 크기와 상관없이 한 칸에 가로 4m, 세로 3.4m가 되도록 면마다 UV를 늘립니다.
function buildingGeometry(x, y, z) {
  const geometry = new THREE.BoxGeometry(x, y, z);
  const uv = geometry.attributes.uv;
  const faces = [[z, y], [z, y], [x, z], [x, z], [x, y], [x, y]];
  for (let i = 0; i < uv.count; i++) {
    const [fw, fh] = faces[Math.floor(i / 4)];
    uv.setXY(i, (uv.getX(i) * fw) / 4, (uv.getY(i) * fh) / 3.4);
  }
  return geometry.translate(0, y / 2, 0);
}

function buildStreet() {
  const street = new THREE.Group();
  const rand = seeded(7);
  const flat = (geometry, material, x, z, y = 0.01) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    street.add(mesh);
  };

  flat(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0xd8d3ca }), 0, 0, 0);
  flat(new THREE.PlaneGeometry(13, 700), new THREE.MeshLambertMaterial({ color: 0x62676f }), 0, 0);
  const paint = new THREE.MeshLambertMaterial({ color: 0xf3f4f6 });
  const dash = new THREE.PlaneGeometry(0.16, 3);
  for (let z = 100; z > -260; z -= 9) if (Math.abs(z) > 6) flat(dash, paint, 0, z, 0.02);
  const stripe = new THREE.PlaneGeometry(0.55, 3.2);
  for (let x = -5.5; x <= 5.5; x += 1.1) flat(stripe, paint, x, 16, 0.02);

  const windows = windowTexture();
  const roof = new THREE.MeshLambertMaterial({ color: 0xa3a7ab });
  const palette = [0xefe6d8, 0xe3d6c3, 0xd9cfc1, 0xf4efe7, 0xd2d9df, 0xe8d9cc, 0xd8c7b0, 0xc9d3c8];
  for (const side of [-1, 1]) {
    for (let z = 90; z > -280;) {
      const front = 8 + rand() * 9;
      const height = rand() < 0.18 ? 22 + rand() * 18 : 6 + rand() * 9;
      const facade = new THREE.MeshLambertMaterial({ color: palette[Math.floor(rand() * palette.length)], map: windows });
      const building = new THREE.Mesh(buildingGeometry(14, height, front), [facade, facade, roof, roof, facade, facade]);
      building.position.set(side * 17, 0, z - front / 2);
      street.add(building);
      z -= front + (rand() < 0.2 ? 3 + rand() * 4 : 0.2);
    }
  }

  const trunk = new THREE.CylinderGeometry(0.12, 0.16, 2.4, 8).translate(0, 1.2, 0);
  const crown = new THREE.IcosahedronGeometry(1.4, 0).translate(0, 3.3, 0);
  const bark = new THREE.MeshLambertMaterial({ color: 0x7b5e48 });
  const leaves = new THREE.MeshLambertMaterial({ color: 0x8db374, flatShading: true });
  for (const side of [-1, 1]) {
    for (let z = 80; z > -220; z -= 12 + rand() * 4) {
      if (Math.abs(z - 16) < 4) continue;
      const tree = new THREE.Group();
      tree.add(new THREE.Mesh(trunk, bark), new THREE.Mesh(crown, leaves));
      tree.position.set(side * 8.4, 0, z);
      tree.rotation.y = rand() * Math.PI;
      street.add(tree);
    }
  }
  return street;
}

function startPreview(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xdce9f5, 70, 260);
  addLights(scene);
  scene.add(buildStreet());
  const ad = buildAd({ grow: false });
  liveAds.add(ad);
  scene.add(ad.root);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);
  const look = new THREE.Vector3(0, BOARD.lift + BOARD.height / 2 - 1.5, 0);
  const resize = () => {
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();

  const onClick = (event) => { if (hitAd(event, renderer.domElement, camera, ad)) openSheet(); };
  stage.addEventListener('click', onClick);

  const clock = new THREE.Clock();
  ad.show(0.4);
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    // 광고판 쪽으로 천천히 걸어갔다가 물러나기를 되풀이합니다.
    const walk = (1 - Math.cos(t * 0.2 + 2)) / 2;
    camera.position.set(-1.8 + Math.sin(t * 0.37) * 0.8, 1.7 + Math.abs(Math.sin(t * 2.6)) * 0.03, 44 - 22 * walk);
    camera.lookAt(look);
    ad.setDistance(Math.hypot(camera.position.x, camera.position.z));
    ad.update(t, camera.position);
    renderer.render(scene, camera);
  });

  return () => {
    renderer.setAnimationLoop(null);
    observer.disconnect();
    stage.removeEventListener('click', onClick);
    liveAds.delete(ad);
    renderer.dispose();
    renderer.domElement.remove();
  };
}

const previewStage = document.documentElement.classList.contains('is-desk') ? $('stage') : $('start-stage');
let stopPreview = previewStage ? startPreview(previewStage) : null;

/* ---------- 시작과 닫기 ---------- */

const startButton = $('btn-start');
startButton.addEventListener('click', async () => {
  if (location.protocol === 'file:') {
    showError('file');
    return;
  }
  const label = startButton.textContent;
  startButton.disabled = true;
  startButton.textContent = startButton.dataset.loading;
  document.documentElement.classList.add('is-booting');
  track('ooh_ar_start');
  const started = startAR();
  if (stopPreview) {
    stopPreview();
    stopPreview = null;
  }
  const ok = await started;
  if (!ok) {
    document.documentElement.classList.remove('is-booting');
    startButton.disabled = false;
    startButton.textContent = label;
  }
});

$('btn-close').addEventListener('click', () => location.reload());
