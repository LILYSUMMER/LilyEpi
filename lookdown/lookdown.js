import * as THREE from 'three';

/* =========================================================================
   LOOK DOWN · 0단계 「비춤」
   바닥을 비추면 웅덩이가 고이고, 물속에서 빛이 먼저 비친 뒤 Yuni가 떠올라 한마디 합니다.
   앱 없이 링크 하나. 서버 없음. 입력은 탭뿐.

   바닥 인식: iOS Safari 웹에는 바닥 평면 인식이 없어서, 자이로(기기 방향)와 눈높이로 바닥을 셈합니다.
   휴대폰이 바닥 쪽을 향하면 그 자리에 웅덩이가 고이고, 바닥을 탭하면 그곳으로 옮겨 고입니다.
   센서가 없으면(PC) 화면을 끌어서 봅니다. 카메라가 없으면(앱 안 브라우저) 밤 거리 그림 위에 띄웁니다.
   ========================================================================= */

// ---- 수치. 단위는 m, 초 ----
const EYE = 1.4;              // 휴대폰을 든 눈높이. 바닥까지의 거리 계산에 씁니다.
const PUDDLE = 0.82;          // 웅덩이 지름
const YUNI_R = 0.055;         // Yuni 머리 반지름 → 지름 11cm (브리프 제안 8~12cm)
const YUNI_UP = 0.045;        // 다 떠올랐을 때 머리 중심이 수면 위로 올라온 높이
const CAMERA_FOV = 67;        // 휴대폰 기본 카메라 세로 화각
const LOOK_DOWN = -0.42;      // 카메라 앞 방향의 y가 이보다 낮으면 '바닥을 비추는 중'
const T = { pool: 1.6, light: 0.9, rise: 2.4, speak: 0.8, hold: 6.0 };  // 고임 → 빛 → 떠오름 → 한마디 → 자막 유지
const MAX_RIPPLES = 8;
const GOLD = new THREE.Color('#F2B45A');
const GLOW = 0.62;             // Yuni 몸의 기본 발광. 반짝임 펄스는 여기의 1.27배까지만 (과노출 금지)
const DEEP = new THREE.Color('#061423');
const DEEP_LIT = new THREE.Color('#0d2a44');

const $ = (id) => document.getElementById(id);
const track = (name, params) => window.gtag && window.gtag('event', name, params);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const q = new URLSearchParams(location.search);

/* ---------- 글: 기기 언어로 한 줄 ---------- */

const LANG = (() => {
  const want = q.get('lang') || navigator.language || 'ko';
  if (/^zh/i.test(want)) return 'zh';
  if (/^en/i.test(want)) return 'en';
  return 'ko';
})();
document.documentElement.lang = LANG;
const lines = await fetch(new URL('lines.json', import.meta.url)).then((r) => r.json());
const text = (key) => lines[LANG][key];
document.querySelectorAll('[data-text]').forEach((el) => { el.textContent = text(el.dataset.text); });
document.title = 'LOOK DOWN';

/* ---------- 환경 ---------- */

const UA = navigator.userAgent;
const IOS = /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const IN_APP = /Instagram|FBAN|FBAV|KAKAOTALK|NAVER\(inapp|Line\/|Threads/i.test(UA);
const PHONE = q.get('view') ? q.get('view') === 'phone' : matchMedia('(pointer: coarse)').matches;

const hint = (t) => { const h = $('hint'); if (!t) { h.classList.remove('is-on'); return; } h.textContent = t; h.classList.add('is-on'); };
const caption = (t) => { const c = $('caption'); if (!t) { c.classList.remove('is-on'); return; } c.textContent = t; c.classList.add('is-on'); };
function fail(message, error) {
  if (error) console.error(error);
  const box = $('err');
  box.querySelector('p').innerHTML = message;
  box.hidden = false;
}
if (location.protocol === 'file:') fail('이 페이지는 파일로 직접 열면 동작하지 않아요.<br>https 주소나 localhost에서 열어 주세요.');

/* ---------- 상태 ---------- */

const S = {
  phase: 'idle',        // idle → pooling → rising → speaking → done
  t0: 0,                // 단계가 바뀐 시각
  clickAt: 0,           // 버튼을 누른 시각(performance.now). 3초 안 Yuni 지표
  open: 0,              // 웅덩이 고인 정도 0~1
  light: 0,             // 물속 빛 0~1
  up: 0,                // Yuni 떠오른 정도 0~1
  clarity: 0,           // 물이 맑아진 정도
  pulse: -10,           // 반짝임 펄스 시작 시각
  ears: 0,              // 귀 각도: 0 쉼, 1 쫑긋
  placed: false,
};

/* ---------- 카메라(영상) ---------- */

const sceneEl = $('scene');
let video = null;
let videoTex = null;
const coverScale = new THREE.Vector2(1, 1);

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia unavailable');
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.srcObject = stream;
  sceneEl.prepend(video);
  await video.play();
  await new Promise((resolve) => { if (video.videoWidth) resolve(); else video.addEventListener('loadedmetadata', resolve, { once: true }); });
  videoTex = new THREE.VideoTexture(video);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  return stream;
}

// 카메라가 없을 때 쓰는 밤 거리: 젖은 아스팔트의 청회색과 가로등 보케.
function nightStreetTexture() {
  const c = document.createElement('canvas');
  c.width = 720; c.height = 1280;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 1280);
  sky.addColorStop(0, '#0d1826'); sky.addColorStop(0.45, '#182a3a'); sky.addColorStop(1, '#2a3844');
  g.fillStyle = sky; g.fillRect(0, 0, 720, 1280);
  const lamps = [[120, 300, 60, '#f0b45a'], [560, 240, 46, '#e8a64a'], [380, 420, 30, '#c9b08a'], [660, 520, 26, '#9fb4c4']];
  for (const [x, y, r, col] of lamps) {
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.55; g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.18; g.fillStyle = col; g.fillRect(x - 3, y, 6, 1280 - y);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 720, 500 + Math.random() * 780, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function updateCover(renderer) {
  const vw = video ? video.videoWidth : 720;
  const vh = video ? video.videoHeight : 1280;
  const va = vw / vh;
  const sa = window.innerWidth / window.innerHeight;
  if (sa >= va) coverScale.set(1, va / sa); else coverScale.set(sa / va, 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// 영상은 cover로 화면을 채우므로 잘린 만큼 줄어든 세로 화각을 3D 카메라에 맞춥니다. (ooh-ar.js와 같은 계산)
function visibleFov() {
  const vw = video ? video.videoWidth : 720;
  const vh = video ? video.videoHeight : 1280;
  const t = Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
  const tanV = vh >= vw ? t : t * (vh / vw);
  const shown = window.innerHeight / (vh * Math.max(window.innerWidth / vw, window.innerHeight / vh));
  return THREE.MathUtils.radToDeg(2 * Math.atan(tanV * shown));
}

/* ---------- 기기 방향 → 카메라 ---------- */

const deg = THREE.MathUtils.degToRad;
const BACK_CAMERA = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpEuler = new THREE.Euler();
const tmpQuat = new THREE.Quaternion();
function screenAngle() {
  const angle = screen.orientation && screen.orientation.angle;
  return typeof angle === 'number' ? angle : window.orientation || 0;
}
function deviceQuat(target, { alpha, beta, gamma }) {
  tmpEuler.set(deg(beta), deg(alpha), -deg(gamma), 'YXZ');
  target.setFromEuler(tmpEuler).multiply(BACK_CAMERA);
  return target.multiply(tmpQuat.setFromAxisAngle(Z_AXIS, -deg(screenAngle())));
}

const look = { sensor: false, orientation: null, yaw: 0, pitch: -0.95, dragging: false };
window.addEventListener('deviceorientation', (e) => {
  if (e.alpha === null && e.beta === null) return;
  look.sensor = true;
  look.orientation = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 };
});

// 센서가 없을 때: 화면을 끌어서 봅니다. 처음부터 바닥을 보고 있어 바로 고입니다.
function enableDragLook() {
  let last = null;
  sceneEl.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY, moved: false }; });
  window.addEventListener('pointermove', (e) => {
    if (!last) return;
    const dx = e.clientX - last.x, dy = e.clientY - last.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) last.moved = true;
    look.yaw -= dx * 0.004;
    look.pitch = THREE.MathUtils.clamp(look.pitch + dy * 0.004, -1.5, 0.6);
    last.x = e.clientX; last.y = e.clientY;
  });
  window.addEventListener('pointerup', () => { look.dragging = !!(last && last.moved); last = null; });
}

async function requestMotion() {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return true;
  try { return (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch { return false; }
}

/* ---------- 소리: 빗소리 루프 + 웅얼거림 ---------- */
// 파일이 있으면 씁니다(lookdown/audio/rain.mp3, mumble_1.mp3, mumble_2.mp3). 없으면 빗소리는 노이즈로 대신하고 웅얼거림은 건너뜁니다.

const audio = { ctx: null, rain: null, mumbles: [] };
async function startAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  audio.ctx = ctx;
  await ctx.resume().catch(() => {});
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
  audio.master = master;

  const load = async (name) => {
    try {
      const res = await fetch(new URL(`audio/${name}`, import.meta.url));
      if (!res.ok) return null;
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch { return null; }
  };
  const rain = await load('rain.mp3');
  if (rain) {
    const src = ctx.createBufferSource();
    src.buffer = rain; src.loop = true;
    src.connect(master); src.start();
  } else {
    // 1.5초짜리 분홍빛 노이즈를 저역 필터로 눌러 빗소리처럼 돌립니다.
    const len = ctx.sampleRate * 1.5;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.08;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    src.connect(lp).connect(master); src.start();
  }
  audio.mumbles = (await Promise.all([load('mumble_1.mp3'), load('mumble_2.mp3'), load('mumble_3.mp3')])).filter(Boolean);
}
function mumble() {
  if (!audio.ctx || !audio.mumbles.length) return;
  const src = audio.ctx.createBufferSource();
  src.buffer = audio.mumbles[Math.floor(Math.random() * audio.mumbles.length)];
  const g = audio.ctx.createGain(); g.gain.value = 0.9;
  src.connect(g).connect(audio.master); src.start();
}

/* ---------- 3D ---------- */

function build() {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, stencil: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  sceneEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 50);
  camera.position.set(0, EYE, 0);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0x9fb8d0, 0x1a2430, 0.5));

  /* 물 셰이더 (rain-portal-ar.html에서 가져와 바닥용으로 손봄) */
  const blobFn = /* glsl */ `
    float blob(vec2 p, out float rr, out float ww){
      float ang = atan(p.y, p.x); float r = length(p);
      float w = 0.76 + 0.09*sin(ang*3.0+1.7) + 0.05*sin(ang*5.0-0.6) + 0.03*sin(ang*8.0+3.1);
      rr = r; ww = w; return w;
    }`;
  const rippleFn = /* glsl */ `
    uniform vec4 uRipples[${MAX_RIPPLES}];
    vec2 rippleNormal(vec2 p, float t){
      vec2 n = vec2(0.0);
      for(int i=0;i<${MAX_RIPPLES};i++){
        vec4 rp = uRipples[i]; if(rp.w < 0.001) continue;
        vec2 d = p - rp.xy; float dist = length(d) + 1e-4;
        float age = t - rp.z;
        float wave = sin(dist*30.0 - age*6.0) * exp(-dist*3.5) * exp(-age*1.1) * rp.w;
        n += normalize(d) * wave;
      }
      return n;
    }`;
  const U = {
    uTime: { value: 0 }, uOpen: { value: 0 }, uClarity: { value: 0 }, uLight: { value: 0 },
    uVideo: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) }, uCover: { value: coverScale },
    uTint: { value: new THREE.Color(0.55, 0.62, 0.7) }, uGold: { value: GOLD }, uDeep: { value: DEEP }, uDeepLit: { value: DEEP_LIT },
    uYuni: { value: new THREE.Vector2(0, 0) },
    uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
  const vert = /* glsl */ `
    varying vec2 vLocal;
    void main(){ vLocal = uv*2.0-1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

  // 1) 포털 마스크: 웅덩이 모양만큼 스텐실에 1을 씁니다.
  const maskMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: vert,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec2 vLocal; uniform float uOpen;
      ${blobFn}
      void main(){ float r,w; blob(vLocal,r,w); if(r > w*uOpen) discard; gl_FragColor = vec4(0.0); }`,
    colorWrite: false, depthWrite: false, transparent: true,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
  });
  const stencilIn = (m) => { m.stencilWrite = true; m.stencilRef = 1; m.stencilFunc = THREE.EqualStencilFunc; m.stencilZPass = THREE.KeepStencilOp; return m; };

  // 3) 수면: 거리 영상이 물결에 굴절되고, 가운데로 갈수록 깊은 파랑. 금빛은 Yuni 쪽에서 비칩니다.
  const surfMat = new THREE.ShaderMaterial({
    uniforms: U, vertexShader: vert,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vLocal;
      uniform float uTime, uOpen, uClarity, uLight;
      uniform sampler2D uVideo; uniform vec2 uResolution, uCover, uYuni;
      uniform vec3 uTint, uGold, uDeep, uDeepLit;
      ${blobFn}
      ${rippleFn}
      void main(){
        float r,w; blob(vLocal,r,w);
        float inR = w*uOpen;
        if(r > inR) discard;
        vec2 n = rippleNormal(vLocal, uTime);
        n += 0.010*vec2( sin(vLocal.y*9.0+uTime*0.9)+sin((vLocal.x+vLocal.y)*13.0-uTime*0.6),
                         sin(vLocal.x*8.0-uTime*0.8)+cos((vLocal.x-vLocal.y)*11.0+uTime*0.5) );
        vec2 suv = gl_FragCoord.xy / uResolution;
        vec2 vuv = (suv - 0.5)*uCover + 0.5 + n*0.8;
        vec3 street = texture2D(uVideo, vuv).rgb;
        // smoothstep의 경계는 오름차순이어야 합니다(거꾸로 넣으면 GPU마다 결과가 다릅니다).
        float df = 1.0 - smoothstep(inR*0.15, inR, r);
        vec3 deepCol = mix(uDeep, uDeepLit, 0.5+0.5*sin(uTime*0.3)) * (0.6 + uTint*0.8);
        vec3 col = mix(street*0.85, deepCol, df*(0.92 - uClarity*0.3));
        // 물속 빛: Yuni 자리에서 금빛이 번져 올라옵니다.
        float dy = length(vLocal - uYuni);
        col += uGold * uLight * exp(-dy*dy*9.0) * 0.55;
        float spec = pow(clamp(length(n)*22.0, 0.0, 1.0), 3.0);
        col += spec * mix(uTint, uGold, 0.5) * 0.45;
        float rim = 1.0 - smoothstep(inR*0.92, inR, r);
        col *= mix(1.0, 0.6, rim*(1.0-df));
        float edge = 1.0 - smoothstep(inR*0.97, inR, r);
        float alpha = mix(0.94, 0.5, df*uClarity) * edge;
        gl_FragColor = vec4(col, alpha);
      }`,
    transparent: true, depthWrite: false,
  });

  // 웅덩이. 바닥(y=0)에 눕힌 평면. 로컬 z가 위, -z가 물속입니다.
  const puddle = new THREE.Group();
  puddle.rotation.x = -Math.PI / 2;
  puddle.visible = false;
  scene.add(puddle);
  const maskMesh = new THREE.Mesh(new THREE.PlaneGeometry(PUDDLE, PUDDLE), maskMat);
  maskMesh.renderOrder = 1;
  const surfMesh = new THREE.Mesh(new THREE.PlaneGeometry(PUDDLE, PUDDLE), surfMat);
  surfMesh.renderOrder = 4;
  puddle.add(maskMesh, surfMesh);

  // 2) 물속(포털 안): 어두운 바닥, 떠다니는 금빛 알갱이, Yuni의 잠긴 아랫몸.
  // 주의: Group에 renderOrder를 주면 three.js가 그 아래 전부를 groupOrder로 묶어 먼저/나중에 그려 버립니다. 메시에만 줍니다.
  const deep = new THREE.Group();
  puddle.add(deep);
  const floorMat = stencilIn(new THREE.MeshBasicMaterial({ color: DEEP, transparent: true, opacity: 1, depthWrite: false }));
  // 물속 바닥은 넉넉히 넓게 둡니다. 작으면 비스듬히 볼 때 시차로 가장자리가 웅덩이 안에 드러납니다.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(PUDDLE * 8, PUDDLE * 8), floorMat);
  floor.position.z = -0.45;
  floor.renderOrder = 2;
  deep.add(floor);

  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.25, 'rgba(242,180,90,0.85)'); grd.addColorStop(1, 'rgba(242,180,90,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const underGlow = new THREE.Sprite(stencilIn(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
  underGlow.scale.setScalar(0.5);
  underGlow.renderOrder = 3;
  deep.add(underGlow);

  const N = 36;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(N * 3);
  const pSeed = [];
  for (let i = 0; i < N; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * PUDDLE * 0.7; pPos[i * 3 + 1] = (Math.random() - 0.5) * PUDDLE * 0.7; pPos[i * 3 + 2] = -Math.random() * 0.5 - 0.03;
    pSeed.push(Math.random() * Math.PI * 2);
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const motes = new THREE.Points(pGeo, stencilIn(new THREE.PointsMaterial({ size: 0.012, color: GOLD, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
  motes.renderOrder = 3;
  deep.add(motes);

  /* Yuni: 불투명한 따뜻한 빛의 둥근 몸 + 작은 고양이 귀 + 검은 점 눈 두 개. 입·코·윤곽선 없음. 눈을 감지 않음. */
  const ABOVE = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const BELOW = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
  function bodyMaterial(below) {
    const m = new THREE.MeshStandardMaterial({
      color: 0xd9a35c, emissive: GOLD, emissiveIntensity: below ? GLOW * 0.8 : GLOW, roughness: 1, metalness: 0,
      clippingPlanes: below ? BELOW : ABOVE, transparent: below, opacity: below ? 0.9 : 1,
    });
    if (below) stencilIn(m);
    return m;
  }
  function makeYuni(below) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(YUNI_R, 48, 32), bodyMaterial(below));
    body.scale.set(1, 1.06, 1);
    g.add(body);
    const earGeo = new THREE.ConeGeometry(YUNI_R * 0.34, YUNI_R * 0.62, 16);
    const ears = [-1, 1].map((side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * YUNI_R * 0.55, YUNI_R * 0.78, 0);
      const ear = new THREE.Mesh(earGeo, bodyMaterial(below));
      ear.position.y = YUNI_R * 0.3;
      pivot.add(ear);
      pivot.userData.side = side;
      g.add(pivot);
      return pivot;
    });
    const eyes = !below ? [-1, 1].map((side) => {
      const eye = new THREE.Mesh(new THREE.CircleGeometry(YUNI_R * 0.085, 20), new THREE.MeshBasicMaterial({ color: 0x120c08, clippingPlanes: ABOVE }));
      eye.position.set(side * YUNI_R * 0.34, YUNI_R * 0.12, YUNI_R * 0.985);
      eye.lookAt(side * YUNI_R * 0.34 * 2.2, YUNI_R * 0.12 * 2.2, YUNI_R * 3);
      g.add(eye);
      return eye;
    }) : [];
    return { group: g, body, ears, eyes };
  }
  const yuniAbove = makeYuni(false);
  const yuniBelow = makeYuni(true);
  yuniBelow.group.traverse((o) => { if (o.isMesh) o.renderOrder = 3; });
  scene.add(yuniAbove.group);
  deep.add(yuniBelow.group);          // deep은 puddle 안(z-up)이라 아래서 자세를 맞춥니다.
  const yuniLight = new THREE.PointLight(GOLD, 0, 1.2, 2);
  scene.add(yuniLight);

  // 수면 위 동심원 물결: Yuni 둘레로 천천히 번집니다(uRipples 0번은 Yuni 전용).
  let rippleIdx = 1;
  function ripple(local, strength, t) {
    const rp = U.uRipples.value[rippleIdx++ % (MAX_RIPPLES - 1) + 1];
    rp.set(local.x, local.y, t, strength);
  }

  const parts = { renderer, scene, camera, puddle, maskMesh, surfMesh, floor, U, underGlow, motes, pGeo, pSeed, yuniAbove, yuniBelow, yuniLight, ripple };
  if (q.has('debug')) window.__LD = parts;   // ?debug: 콘솔에서 부품을 만질 수 있게
  return parts;
}

/* ---------- 시작 ---------- */

const startEl = $('start');
const btn = $('btn-start');
btn.addEventListener('click', async () => {
  btn.disabled = true;
  S.clickAt = performance.now();
  track('lookdown_open', { lang: LANG, phone: PHONE, in_app: IN_APP });
  try {
    await run();
  } catch (e) {
    fail('열지 못했어요.<br>페이지를 새로고침해 주세요.<br><br><span style="font-size:11px;color:#4d6478">' + (e && e.message ? e.message : e) + '</span>', e);
  }
});

async function run() {
  // 권한은 버튼 누른 동작 안에서 한꺼번에: 방향(아이폰) → 카메라 → 소리.
  const motionOk = PHONE ? await requestMotion() : false;
  const camera3 = build();
  const { renderer, scene, camera, puddle, surfMesh, U, underGlow, motes, pGeo, pSeed, yuniAbove, yuniBelow, yuniLight, ripple } = camera3;

  let hasCamera = false;
  try {
    await startCamera();
    hasCamera = true;
  } catch (e) {
    console.warn('camera unavailable', e);
  }
  U.uVideo.value = hasCamera ? videoTex : nightStreetTexture();
  if (!hasCamera) {
    sceneEl.style.background = `url("${U.uVideo.value.image.toDataURL ? U.uVideo.value.image.toDataURL('image/jpeg', 0.8) : ''}") center / cover`;
    const notice = $('notice');
    notice.textContent = text('nocam');
    notice.hidden = false;
    track('lookdown_no_camera', { in_app: IN_APP, ios: IOS });
  }
  startAudio().catch(() => {});

  updateCover(renderer);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = hasCamera ? visibleFov() : CAMERA_FOV;
  camera.updateProjectionMatrix();
  window.addEventListener('resize', () => {
    updateCover(renderer);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = hasCamera ? visibleFov() : CAMERA_FOV;
    camera.updateProjectionMatrix();
  });

  // 센서가 있으면 자이로가, 없으면 손가락이 카메라를 돌립니다. 센서 응답을 0.8초 기다려 봅니다.
  const sensorReady = await new Promise((resolve) => {
    if (!motionOk) return resolve(false);
    const at = performance.now();
    const tick = () => { if (look.sensor) resolve(true); else if (performance.now() - at > 800) resolve(false); else requestAnimationFrame(tick); };
    tick();
  });
  if (!sensorReady) { enableDragLook(); look.pitch = -0.95; }
  startEl.classList.add('is-off');
  hint(sensorReady ? text('look') : text('nosensor'));
  track('lookdown_started', { camera: hasCamera, sensor: sensorReady, ms: Math.round(performance.now() - S.clickAt) });

  /* 바닥 자리 셈하기 */
  const camQuat = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const floorHit = new THREE.Vector3();
  function updateCamera() {
    if (sensorReady && look.orientation) deviceQuat(camQuat, look.orientation);
    else camQuat.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
    camera.quaternion.copy(camQuat);
    forward.set(0, 0, -1).applyQuaternion(camQuat);
  }
  function lookingDown() { return forward.y < LOOK_DOWN; }
  // 카메라 앞 방향이 바닥(y=0)과 만나는 점. 너무 가깝거나 멀면 0.7~2.6m로 당깁니다.
  function floorPoint(dir, out) {
    if (dir.y > -0.08) return null;
    const d = THREE.MathUtils.clamp(EYE / -dir.y, 0.7, 2.6);
    return out.copy(camera.position).addScaledVector(dir, d);
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  sceneEl.addEventListener('pointerdown', (ev) => {
    if (!sensorReady) return;      // 끌어 보는 중엔 pointerup에서 처리
    onTap(ev.clientX, ev.clientY);
  });
  sceneEl.addEventListener('pointerup', (ev) => {
    if (sensorReady || look.dragging) return;
    onTap(ev.clientX, ev.clientY);
  });
  function onTap(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const t = clock.getElapsedTime();
    if (S.placed) {
      const hit = ray.intersectObject(surfMesh, false)[0];
      if (hit && hit.uv) { ripple(new THREE.Vector2(hit.uv.x * 2 - 1, hit.uv.y * 2 - 1), 0.9, t); track('lookdown_tap_water'); return; }
    }
    // 웅덩이 밖 바닥을 탭하면 그 자리에(다시) 고입니다.
    const p = floorPoint(ray.ray.direction, new THREE.Vector3());
    if (p && (S.phase === 'idle' || S.phase === 'done')) placePuddle(p);
  }

  function placePuddle(p) {
    puddle.position.copy(p);
    puddle.visible = true;
    S.placed = true;
    S.open = 0; S.light = 0; S.up = 0; S.clarity = 0; S.ears = 0;
    S.phase = 'pooling';
    S.t0 = clock.getElapsedTime();
    U.uRipples.value.forEach((r) => r.set(0, 0, 0, 0));
    hint('');
    caption('');
    $('btn-again').hidden = true;
    track('lookdown_pool', { ms: Math.round(performance.now() - S.clickAt) });
  }

  $('btn-again').addEventListener('click', () => {
    if (!floorPoint(forward, floorHit)) look.pitch = -0.95;
    const p = floorPoint(forward, floorHit) || puddle.position;
    placePuddle(p);
  });

  /* 매 프레임 */
  const clock = new THREE.Clock();
  let seenAt = null;
  let downSince = null;
  const yuniLocal = new THREE.Vector3();
  const yuniWorld = new THREE.Vector3();
  const toCam = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, clock.getDelta() || 0.016);
    updateCamera();
    U.uTime.value = t;
    U.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    if (videoTex) videoTex.needsUpdate = true;

    // 바닥을 0.5초쯤 비추고 있으면 그 자리에 고입니다.
    if (S.phase === 'idle') {
      if (lookingDown()) {
        if (downSince === null) downSince = t;
        if (t - downSince > 0.5) { const p = floorPoint(forward, floorHit); if (p) placePuddle(p); }
      } else downSince = null;
    }

    const k = t - S.t0;
    if (S.phase === 'pooling') {
      S.open = smooth(k / T.pool);
      if (k > T.pool * 0.55) S.light = smooth((k - T.pool * 0.55) / T.light);
      if (k > T.pool) { S.phase = 'rising'; S.t0 = t; S.ears = 0; }
    } else if (S.phase === 'rising') {
      S.open = 1; S.light = 1;
      S.up = easeOut(k / T.rise);
      S.ears = smooth((k - T.rise * 0.6) / 0.6);         // 머리가 올라온 뒤 귀가 쫑긋
      if (seenAt === null && S.up > 0.35) { seenAt = performance.now(); track('lookdown_yuni_seen', { ms: Math.round(seenAt - S.clickAt) }); }
      if (k > T.rise + T.speak) {
        S.phase = 'speaking'; S.t0 = t; S.pulse = t;
        caption(text('line'));
        mumble();
        ripple(new THREE.Vector2(0, 0.05), 0.7, t);
        track('lookdown_line', { ms: Math.round(performance.now() - S.clickAt) });
      }
    } else if (S.phase === 'speaking') {
      S.up = 1;
      if (k > T.hold) { S.phase = 'done'; S.t0 = t; caption(''); $('btn-again').hidden = false; track('lookdown_done'); }
    } else if (S.phase === 'done') {
      S.up = 1;
    }
    S.clarity += ((S.up > 0.2 ? 1 : 0) - S.clarity) * dt * 1.5;
    U.uOpen.value = S.open;
    U.uClarity.value = S.clarity;
    U.uLight.value = S.light * (0.6 + 0.4 * Math.sin(t * 1.3) * 0.5 + 0.2);

    // Yuni 자세: 수면 아래 -0.16m에서 YUNI_UP까지 떠오르고, 둘둘 흔들리며, 보는 사람 쪽을 향합니다.
    const bob = Math.sin(t * 1.1) * 0.004 + Math.sin(t * 0.63) * 0.003;
    const yLocal = -0.16 + (YUNI_UP + 0.16) * S.up + bob * S.up;
    const sway = new THREE.Vector2(Math.sin(t * 0.37) * 0.012, Math.cos(t * 0.29) * 0.012).multiplyScalar(S.up);
    yuniLocal.set(sway.x, yLocal, -sway.y);
    yuniWorld.copy(puddle.position).add(yuniLocal);
    yuniAbove.group.position.copy(yuniWorld);
    yuniAbove.group.visible = S.placed && S.up > 0.01;
    toCam.copy(camera.position).sub(yuniWorld); toCam.y = 0;
    const facing = Math.atan2(toCam.x, toCam.z);
    yuniAbove.group.rotation.set(Math.sin(t * 0.5) * 0.03, facing, Math.cos(t * 0.41) * 0.03);
    // 아랫몸은 puddle 그룹(z가 위) 안에 있으므로 같은 자세를 그 좌표로 옮깁니다.
    yuniBelow.group.position.set(yuniLocal.x, -yuniLocal.z, yuniLocal.y);
    yuniBelow.group.rotation.set(Math.PI / 2, 0, 0);
    yuniBelow.group.rotateOnAxis(new THREE.Vector3(0, 1, 0), facing);
    yuniBelow.group.visible = S.placed && S.light > 0.05;
    U.uYuni.value.set(yuniLocal.x / (PUDDLE / 2), -yuniLocal.z / (PUDDLE / 2));

    // 귀: 쉴 땐 살짝 벌어지고, 관심이 생기면 쫑긋 섭니다.
    const earAngle = THREE.MathUtils.lerp(0.55, 0.12, S.ears) + Math.sin(t * 0.9) * 0.03;
    for (const y of [yuniAbove, yuniBelow]) for (const ear of y.ears) ear.rotation.z = -ear.userData.side * earAngle;

    // 반짝임: 밝기 펄스 1회. 0.75초 올라가 1.27배, 0.75초 내려옴. 과노출 금지.
    const pk = t - S.pulse;
    const pulse = pk >= 0 && pk < 1.5 ? 1 + 0.27 * Math.sin(Math.PI * pk / 1.5) : 1;
    yuniAbove.body.material.emissiveIntensity = GLOW * pulse;
    yuniAbove.ears.forEach((e) => { e.children[0].material.emissiveIntensity = GLOW * pulse; });
    yuniLight.position.copy(yuniWorld).y += 0.08;
    yuniLight.intensity = 0.35 * S.up * pulse;

    // 물속 빛과 알갱이
    underGlow.position.set(yuniLocal.x, -yuniLocal.z, Math.min(-0.02, yuniLocal.y - 0.03));
    underGlow.material.opacity = 0.85 * S.light * (0.9 + 0.1 * Math.sin(t * 2.2)) * pulse;
    underGlow.scale.setScalar(0.32 + 0.22 * S.light);
    motes.material.opacity = 0.6 * S.light;
    const pos = pGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let z = pos.getZ(i) + 0.00045;
      if (z > -0.02) z = -0.5;
      pos.setZ(i, z);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.6 + pSeed[i]) * 0.0003);
    }
    pos.needsUpdate = true;

    // Yuni 둘레의 동심원 물결: 떠오르는 동안과 말할 때 잔잔히 번집니다.
    const ring = U.uRipples.value[0];
    if (S.up > 0.05 && (t - ring.z > 2.2 || ring.w < 0.001)) ring.set(U.uYuni.value.x, U.uYuni.value.y, t, 0.45);

    renderer.render(scene, camera);
  });

  // Yuni는 웅덩이 자리에만 있으므로 카메라가 웅덩이를 벗어나면 화면 밖으로 나갑니다. 끌어내는 조작은 없습니다.

  // 체류 시간
  const leave = () => track('lookdown_dwell', { s: Math.round((performance.now() - S.clickAt) / 1000), phase: S.phase });
  window.addEventListener('pagehide', leave, { once: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); }, { once: true });
}

