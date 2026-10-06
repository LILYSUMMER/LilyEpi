import * as THREE from 'three';

const asset = (path) => new URL(path, import.meta.url).href;
const TARGET_MIND = asset('./target.mind');
const TARGET_IMAGE = asset('./target.jpg');

// 건물 사진의 가로를 1로 둔 배치입니다. u는 사진 왼쪽에서, v는 사진 위에서 잰 비율입니다.
// 비출 건물을 바꾸면 target.jpg, target.mind와 함께 이 값을 새 사진에 맞춥니다.
const LAYOUT = {
  roof: { u: 0.5, v: 0.02 },
  board: { width: 0.78, height: 0.29, lift: 0.07 },
  entrance: { u: 0.5, v: 0.8 },
};

// 예시 가게의 영업시간(한국 시간)입니다. 광고판의 '영업 중' 문구가 이 시간에 맞춰 바뀝니다.
const HOURS = { open: 10, close: 20 };

const AD = {
  ko: {
    name: '귤빛 카페',
    tagline: '걷다가 잠깐, 귤차 한 잔',
    open: '지금 영업 중 · 이 건물 1층',
    closed: '오전 10시에 열어요 · 이 건물 1층',
    offer: 'AR 광고를 보고 오셨다고 말씀하시면 귤차 사이즈를 올려 드려요',
    sample: '예시',
    entrance: '귤빛 카페 입구',
  },
  en: {
    name: 'Gyulbit Café',
    tagline: 'Take a break with a tangerine tea',
    open: 'Open now · Ground floor',
    closed: 'Opens at 10 am · Ground floor',
    offer: 'Mention this AR sign and we’ll size up your tangerine tea',
    sample: 'SAMPLE',
    entrance: 'Gyulbit Café entrance',
  },
  zh: {
    name: '橘光咖啡',
    tagline: '走累了吗？来杯橘子茶吧',
    open: '营业中 · 本楼一层',
    closed: '上午10点营业 · 本楼一层',
    offer: '出示这则AR广告，橘子茶免费升杯',
    sample: '示例',
    entrance: '橘光咖啡 入口',
  },
  ja: {
    name: 'みかん色カフェ',
    tagline: '散歩の途中に、みかん茶を一杯',
    open: '営業中 · この建物の1階',
    closed: '10時から営業 · この建物の1階',
    offer: 'このAR広告を見せると、みかん茶をサイズアップ',
    sample: 'サンプル',
    entrance: 'みかん色カフェ 入口',
  },
};

const FONT = 'Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "PingFang SC", "Hiragino Sans", "Noto Sans KR", "Noto Sans CJK SC", sans-serif';
const PAGE_LANG = document.documentElement.lang === 'en' ? 'en' : 'ko';
const $ = (id) => document.getElementById(id);
const track = (name) => window.gtag && window.gtag('event', name);

/* ---------- 광고 언어 ---------- */

let adLang = PAGE_LANG;
const liveAds = new Set();

function setAdLang(lang) {
  adLang = lang;
  document.querySelectorAll('[data-ad-lang]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.adLang === lang));
  });
  liveAds.forEach((ad) => ad.setLang(lang));
}

document.querySelectorAll('[data-ad-lang]').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    setAdLang(button.dataset.adLang);
  });
});
setAdLang(adLang);

/* ---------- 건물 사진 비율 ---------- */

let aspectPromise;
function targetAspect() {
  aspectPromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalHeight / img.naturalWidth);
    img.onerror = reject;
    img.src = TARGET_IMAGE;
  });
  return aspectPromise;
}
targetAspect().then((h) => {
  document.documentElement.style.setProperty('--target-aspect', `1 / ${h}`);
});

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
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return hour >= HOURS.open && hour < HOURS.close;
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

function drawScreen(g, W, H, t, copy, open, led) {
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

  // 영업 상태
  const status = open ? copy.open : copy.closed;
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

function drawLabel(g, W, H, text) {
  g.clearRect(0, 0, W, H);
  const size = fitFont(g, text, W - 80, 56, 700);
  const w = Math.min(W - 8, g.measureText(text).width + 72);
  const h = size + 40;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  g.fillStyle = '#FF6B00';
  pill(g, x, y, w, h);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, W / 2, H / 2 + 2);
  g.textAlign = 'left';
}

/* ---------- 광고판 ---------- */

function buildAd(H) {
  const B = LAYOUT.board;
  const at = ({ u, v }) => new THREE.Vector3(u - 0.5, (0.5 - v) * H, 0);
  const roof = at(LAYOUT.roof);

  const root = new THREE.Group();
  const rig = new THREE.Group();
  rig.position.copy(roof).setZ(0.02);
  root.add(rig);

  const metal = new THREE.MeshStandardMaterial({ color: 0x30343b, metalness: 0.55, roughness: 0.5 });

  const legs = new THREE.Group();
  const legH = B.lift + 0.03;
  for (const x of [-B.width * 0.3, B.width * 0.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.016, legH, 0.016).translate(0, legH / 2, 0), metal);
    leg.position.set(x, 0, -0.012);
    legs.add(leg);
  }
  const brace = new THREE.Mesh(new THREE.BoxGeometry(B.width * 0.64, 0.012, 0.012), metal);
  brace.position.set(0, legH * 0.5, -0.012);
  legs.add(brace);
  rig.add(legs);

  const board = new THREE.Group();
  const boardY = B.lift + B.height / 2;
  rig.add(board);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(B.width + 0.03, B.height + 0.03, 0.032), metal);
  frame.position.z = -0.017;
  board.add(frame);

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 1024;
  screenCanvas.height = Math.round((1024 * B.height) / B.width);
  const screenCtx = screenCanvas.getContext('2d');
  const led = ledPattern(screenCanvas.width, screenCanvas.height);
  const screenTex = canvasTexture(screenCanvas);
  screenTex.anisotropy = 4;
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, transparent: true, opacity: 0, toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(B.width, B.height), screenMat);
  screen.position.z = 0.001;
  board.add(screen);

  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTexture('255,140,50'), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(B.width * 1.35, B.height * 1.9), glowMat);
  glow.position.z = -0.04;
  board.add(glow);

  // 광고판 불빛이 건물 벽에 번지는 효과
  const spillMat = glowMat.clone();
  spillMat.map = glowTexture('255,170,90');
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(B.width * 1.3, B.height * 1.2), spillMat);
  spill.position.copy(roof).setZ(0.002);
  root.add(spill);

  const marker = new THREE.Group();
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 768;
  labelCanvas.height = 160;
  const labelCtx = labelCanvas.getContext('2d');
  const labelTex = canvasTexture(labelCanvas);
  let cone = null;
  if (LAYOUT.entrance) {
    marker.position.copy(at(LAYOUT.entrance)).setZ(0.06);
    const orange = new THREE.MeshStandardMaterial({ color: 0xff6b00, emissive: 0xff5a00, emissiveIntensity: 0.55, roughness: 0.4 });
    cone = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.055, 32), orange);
    cone.rotation.x = Math.PI;
    marker.add(cone);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false, toneMapped: false }));
    label.scale.set(0.24, 0.05, 1);
    label.position.y = 0.072;
    marker.add(label);
    marker.scale.setScalar(0.001);
    root.add(marker);
  }

  const sparkTex = glowTexture('255,236,210');
  const sparks = [];
  for (let i = 0; i < 18; i++) {
    const spark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkTex, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    spark.userData = {
      x: (Math.random() - 0.5) * (B.width + 0.12),
      y0: Math.random(),
      speed: 0.04 + Math.random() * 0.05,
      z: 0.02 + Math.random() * 0.1,
      phase: Math.random() * Math.PI * 2,
      size: 0.012 + Math.random() * 0.016,
    };
    rig.add(spark);
    sparks.push(spark);
  }

  let lang = adLang;
  let copy = AD[lang];
  let open = isOpenNow();
  let openCheckedAt = 0;
  let drawnAt = -1;
  let startAt = null;
  const FLICKER = [0.15, 0.9, 0.2, 1, 0.5, 1];

  function setLang(next) {
    lang = next;
    copy = AD[lang];
    drawLabel(labelCtx, labelCanvas.width, labelCanvas.height, copy.entrance);
    labelTex.needsUpdate = true;
    drawnAt = -1;
  }
  setLang(lang);
  // 입구 표시는 한 번만 그리므로, 글꼴이 늦게 도착하면 다시 그립니다.
  document.fonts?.load(`700 56px Pretendard`).then(() => setLang(lang)).catch(() => {});

  function update(t) {
    root.visible = startAt !== null;
    if (startAt === null) return;
    const k = t - startAt;

    legs.scale.y = Math.max(0.001, easeOut(clamp01(k / 0.6)));
    const rise = clamp01((k - 0.35) / 0.8);
    board.visible = rise > 0;
    board.position.y = boardY * easeOut(rise);
    board.scale.setScalar(0.3 + 0.7 * easeBack(rise));

    const on = k - 1.15;
    screenMat.opacity = on < 0 ? 0 : on < 0.45 ? FLICKER[Math.floor(on / 0.075)] : 1;
    const lit = easeOut(clamp01((k - 1.3) / 0.6));
    glowMat.opacity = 0.28 * lit * (0.9 + 0.1 * Math.sin(t * 3));
    spillMat.opacity = 0.3 * lit;

    if (cone) {
      marker.scale.setScalar(Math.max(0.001, easeBack(clamp01((k - 1.8) / 0.5))));
      cone.position.y = Math.sin(t * 3.2) * 0.012;
    }

    const fade = clamp01((k - 1.5) / 0.8);
    const span = B.lift + B.height + 0.1;
    for (const spark of sparks) {
      const d = spark.userData;
      const f = (d.y0 + t * d.speed) % 1;
      spark.position.set(d.x + Math.sin(t + d.phase) * 0.01, f * span, d.z);
      spark.material.opacity = fade * Math.sin(Math.PI * f) * (0.55 + 0.45 * Math.sin(t * 4 + d.phase));
      spark.scale.setScalar(d.size);
    }

    if (t - openCheckedAt > 30) {
      openCheckedAt = t;
      open = isOpenNow();
    }
    if (screenMat.opacity > 0 && t - drawnAt > 1 / 30) {
      drawnAt = t;
      drawScreen(screenCtx, screenCanvas.width, screenCanvas.height, t, copy, open, led);
      screenTex.needsUpdate = true;
    }
  }

  return {
    root,
    hit: [screen, frame],
    ready: () => screenMat.opacity >= 1,
    found(t) { if (startAt === null) startAt = t; },
    update,
    setLang,
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

const sheet = $('sheet');
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

/* ---------- 휴대폰: AR ---------- */

async function startAR() {
  let MindARThree;
  try {
    ({ MindARThree } = await import('mindar-image-three'));
  } catch (error) {
    showError('load', error);
    return false;
  }

  const H = await targetAspect();
  const mindar = new MindARThree({
    container: $('ar'),
    imageTargetSrc: TARGET_MIND,
    filterMinCF: 0.001,
    filterBeta: 0.01,
    warmupTolerance: 5,
    missTolerance: 5,
    uiLoading: 'no',
    uiScanning: 'no',
    uiError: 'no',
  });
  const { renderer, scene, camera } = mindar;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  addLights(scene);

  const ad = buildAd(H);
  liveAds.add(ad);
  const anchor = mindar.addAnchor(0);
  anchor.group.add(ad.root);

  const clock = new THREE.Clock();
  let seen = false;
  anchor.onTargetFound = () => {
    ad.found(clock.getElapsedTime());
    $('scan').classList.add('is-off');
    $('ad-langs').classList.add('is-on');
    if (!seen) {
      seen = true;
      track('ooh_ar_found');
      setTimeout(() => { if (sheet.hidden) $('hint').classList.add('is-on'); }, 2400);
    }
  };
  anchor.onTargetLost = () => {
    $('scan').classList.remove('is-off');
    $('hint').classList.remove('is-on');
  };

  $('ar').addEventListener('click', (event) => {
    if (anchor.group.visible && hitAd(event, renderer.domElement, camera, ad)) openSheet();
  });

  try {
    await mindar.start();
  } catch (error) {
    showError('camera', error);
    return false;
  }

  document.documentElement.classList.add('is-running');
  renderer.setAnimationLoop(() => {
    ad.update(clock.getElapsedTime());
    renderer.render(scene, camera);
  });
  return true;
}

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
  const ok = await startAR();
  if (!ok) {
    document.documentElement.classList.remove('is-booting');
    startButton.disabled = false;
    startButton.textContent = label;
  }
});

$('btn-close').addEventListener('click', () => location.reload());

/* ---------- PC: 3D 미리 보기 ---------- */

async function startPreview(stage) {
  const H = await targetAspect();
  const photoTex = await new THREE.TextureLoader().loadAsync(TARGET_IMAGE);
  photoTex.colorSpace = THREE.SRGBColorSpace;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  addLights(scene);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, H), new THREE.MeshBasicMaterial({ map: photoTex, toneMapped: false })));
  const ad = buildAd(H);
  liveAds.add(ad);
  scene.add(ad.root);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  const top = (0.5 - LAYOUT.roof.v) * H + LAYOUT.board.lift + LAYOUT.board.height + 0.04;
  const bottom = -H / 2;
  const center = new THREE.Vector3(0, (top + bottom) / 2, 0);
  const halfH = (top - bottom) / 2;
  const halfW = 0.56;

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
  ad.found(0.2);
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(halfH / tanY, halfW / (tanY * camera.aspect)) * 1.12;
    camera.position.set(center.x + Math.sin(t * 0.35) * dist * 0.22, center.y + 0.02 + Math.sin(t * 0.23) * dist * 0.04, dist);
    camera.lookAt(center);
    ad.update(t);
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

const previewButton = $('btn-preview');
let stopPreview = null;
previewButton.addEventListener('click', async () => {
  const stage = $('stage');
  if (stopPreview) {
    stopPreview();
    stopPreview = null;
    stage.classList.remove('is-preview');
    $('stage-langs').hidden = true;
    previewButton.textContent = previewButton.dataset.on;
    return;
  }
  previewButton.disabled = true;
  stage.classList.add('is-preview');
  try {
    stopPreview = await startPreview(stage);
    $('stage-langs').hidden = false;
    previewButton.textContent = previewButton.dataset.off;
    track('ooh_ar_preview');
  } catch (error) {
    console.error(error);
    stage.classList.remove('is-preview');
  } finally {
    previewButton.disabled = false;
  }
});
