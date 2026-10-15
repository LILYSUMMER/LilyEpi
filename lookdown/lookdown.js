import * as THREE from 'three';
// 자리 고정: 회전은 자이로, 이동은 바닥 광류(lab/trackers/hybrid.js, jsfeat MIT). ?track=gyro 로 끌 수 있습니다.
import { HybridTracker } from './lab/trackers/hybrid.js';

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
const T = { pool: 2.0, light: 1.5, rise: 1.0, speak: 4.5, item: 5.0, sink: 2.5, stay: 9.0, video: 15 };  // 고임 → 물속 빛 → 수면을 깨고 올려다봄 → 한마디 → 분실물 → 반짝 한 번 하고 가라앉음. stay: 다시 불렀을 때 머무는 초, video: 영상 최대 초
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
// 점쾌: fortunes.json의 lines 중 하나를 무작위로(서버 없음). ?n=번호 로 고정, ?item=0 으로 실루엣만 끌 수 있습니다.
const fortuneData = await fetch(new URL('fortunes.json', import.meta.url)).then((r) => r.json()).catch(() => ({}));
const fortunes = (fortuneData.lines || []).filter((l) => l && l.ko);
const closingText = () => { const c = fortuneData.closing; return c ? (c[LANG] || c.en || c.ko || '') : ''; };
function pickFortune() {
  if (!fortunes.length) return { n: -1, text: text('line'), shape: null };
  const forced = parseInt(q.get('n'), 10);
  const n = Number.isInteger(forced) && forced >= 0 && forced < fortunes.length ? forced : Math.floor(Math.random() * fortunes.length);
  const l = fortunes[n];
  return { n, text: l[LANG] || l.en || l.ko, shape: q.get('item') === '0' ? null : (l.shape || null) };
}
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
  phase: 'idle',        // idle → pooling → light → rising → speaking → item → leaving → ended. ended에서 물을 탭하면 light → rising → stay → leaving → ended
  encore: false,        // 가라앉은 뒤 다시 불러낸 상태(한마디·분실물 없이 머물다 감)
  t0: 0,                // 단계가 바뀐 시각
  clickAt: 0,           // 버튼을 누른 시각(performance.now). 3초 안 Yuni 지표
  open: 0,              // 웅덩이 고인 정도 0~1
  light: 0,             // 물속 빛 0~1
  up: 0,                // Yuni 떠오른 정도 0~1
  clarity: 0,           // 물이 맑아진 정도
  pulse: -10,           // 반짝임 펄스 시작 시각
  ears: 0,              // 귀 각도: 0 쉼, 1 쫑긋
  startle: -10,         // 수면을 두드린 시각. 귀가 옆으로 누웠다 돌아옵니다
  lookUp: 0,            // 수면을 깨고 보는 사람을 올려다보는 정도
  item: 0,              // 점쾌의 물건이 떠오른 정도
  fortune: null,        // 이번에 말한 점쾌 {n, text, shape}
  wander: 0,            // Yuni가 물건 둘레를 돌아다니는 정도
  closed: false,        // 마무리 한마디(「내일 아침 주머니부터 보세요.」)를 했는지
  night: 1,             // 카메라 화면의 어두움 0~1. 어두울수록 Yuni가 또렷합니다
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

// 공유 시트·다른 앱에 갔다 돌아오면 iOS가 카메라를 멈춰 둡니다. 다시 재생하고, 트랙이 끝났으면 카메라를 새로 엽니다.
async function resumeCamera(onNewTexture) {
  if (!video) return;
  const track = video.srcObject && video.srcObject.getVideoTracks()[0];
  if (track && track.readyState === 'ended') {
    try {
      const old = video;
      await startCamera();
      old.remove();
      onNewTexture(videoTex);
    } catch (e) { console.warn('camera restart failed', e); }
  } else {
    video.play().catch(() => {});
  }
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

const audio = { ctx: null, rain: null, mumbles: [], capture: null };
async function startAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  audio.ctx = ctx;
  await ctx.resume().catch(() => {});
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  // 영상 녹화에 소리를 섞기 위한 출력
  try { audio.capture = ctx.createMediaStreamDestination(); master.connect(audio.capture); } catch { audio.capture = null; }
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

  // 비침: 실제 하늘엔 없는 불빛이 물속에 비칩니다. 가로등 주황, 간판 파랑, 창문 흰빛이 천천히 흐릅니다.
  const glints = [[255, 170, 90, 0.4], [120, 170, 255, 0.3], [255, 232, 205, 0.28], [90, 200, 180, 0.22]].map(([r, g, b, a], i) => {
    const sp = new THREE.Sprite(stencilIn(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(r / 255, g / 255, b / 255), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })));
    sp.userData = { a, r: 0.14 + i * 0.06, phase: i * 1.7, speed: 0.11 + i * 0.03, z: -0.12 - i * 0.05, size: 0.16 + i * 0.03 };
    sp.renderOrder = 3; deep.add(sp); return sp;
  });

  /* Yuni: 불투명한 따뜻한 빛의 둥근 몸 + 작은 고양이 귀 + 검은 점 눈 두 개. 입·코·윤곽선 없음. 눈을 감지 않음. */
  const ABOVE = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const BELOW = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
  function bodyMaterial(below) {
    const m = new THREE.MeshStandardMaterial({
      color: 0xd9a35c, emissive: GOLD, emissiveIntensity: below ? GLOW * 0.8 : GLOW, roughness: 1, metalness: 0,
      clippingPlanes: below ? BELOW : ABOVE, transparent: true, opacity: below ? 0.9 : 1,
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

  /* 점쾌의 물건: 공통 실루엣 5종 + 호박 사탕통. 위아래 두 벌로 만들어 수면에서 자릅니다(Yuni와 같은 방식). */
  function itemMaterial(below, color, emissive, extra = {}) {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: below ? 0.25 : 0.55, roughness: 0.85, metalness: 0, side: THREE.DoubleSide, clippingPlanes: below ? BELOW : ABOVE, transparent: true, opacity: below ? 0.9 : 1, ...extra });
    if (below) stencilIn(m);
    return m;
  }
  const SHAPES = {
    bucket(below) {   // 호박 사탕통: 주황 통 + 검은 얼굴 + 손잡이
      const g = new THREE.Group();
      const prof = [[0.001, 0], [0.062, 0], [0.07, 0.01], [0.08, 0.06], [0.086, 0.11], [0.082, 0.13]].map(([x, y]) => new THREE.Vector2(x * 0.9, y * 0.9));
      g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 32), itemMaterial(below, 0xe8731c, 0xff7a1a)));
      if (!below) {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
        x.fillStyle = '#1a0d05';
        const tri = (cx, cy, r) => { x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy + r * 0.8); x.lineTo(cx - r, cy + r * 0.8); x.closePath(); x.fill(); };
        tri(78, 42, 26); tri(178, 42, 26);
        x.beginPath(); x.moveTo(52, 84); for (let i = 0; i < 7; i++) x.lineTo(52 + (i + 1) * 152 / 7, i % 2 ? 84 : 108); x.lineTo(204, 96); x.lineTo(52, 96); x.closePath(); x.fill();
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, clippingPlanes: ABOVE }));
        face.position.set(0, 0.066, 0.076); g.add(face);
      }
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.005, 8, 28, Math.PI), itemMaterial(below, 0x1a1410, 0x000000));
      handle.position.y = 0.114; g.add(handle);
      return g;
    },
    glove(below) {    // 장갑 한 짝: 납작한 손바닥 + 손가락 다섯
      const g = new THREE.Group(); const m = itemMaterial(below, 0x3b4a5c, 0x1b2634);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), m); palm.scale.set(1, 0.3, 1.15); palm.position.y = 0.015; g.add(palm);
      [[-0.035, 0.085, 0.95], [-0.012, 0.1, 1], [0.012, 0.1, 1], [0.035, 0.085, 0.95]].forEach(([x, len, sc]) => {
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.011 * sc, len - 0.022, 4, 10), m); f.rotation.x = Math.PI / 2; f.position.set(x, 0.015, -0.03 - len / 2); g.add(f);
      });
      const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.04, 4, 10), m); th.rotation.z = Math.PI / 2; th.rotation.y = -0.5; th.position.set(0.06, 0.015, 0.02); g.add(th);
      return g;
    },
    tooth(below) {    // 송곳니 한 짝: 작고 하얀 것
      const g = new THREE.Group(); const m = itemMaterial(below, 0xf4efe6, 0xd9d2c4);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), m); crown.scale.set(1, 0.8, 1); crown.position.y = 0.03; g.add(crown);
      const root = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.045, 14), m); root.position.y = 0.0; root.rotation.x = Math.PI; g.add(root);
      return g;
    },
    string(below) {   // 후드 끈 한쪽: 구불구불한 긴 것 + 끝의 금속 팁
      const g = new THREE.Group(); const m = itemMaterial(below, 0x2b2f36, 0x101418);
      const pts = []; for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push(new THREE.Vector3(Math.sin(u * Math.PI * 2.2) * 0.045, 0.012 + Math.sin(u * 7) * 0.004, (u - 0.5) * 0.24)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.006, 8, false), m));
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, 10), itemMaterial(below, 0xb8b2a4, 0x6a665e, { roughness: 0.4, metalness: 0.6 }));
      tip.rotation.x = Math.PI / 2; tip.position.copy(pts[10]).add(new THREE.Vector3(0, 0, 0.012)); g.add(tip);
      return g;
    },
    person(below) {   // 친구 한 명: 어두운 사람 실루엣(머리 + 몸)
      const g = new THREE.Group(); const m = itemMaterial(below, 0x1c2230, 0x0a0e16);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.07, 6, 14), m); body.position.y = 0.065; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.022, 18, 14), m); head.position.y = 0.14; g.add(head);
      return g;
    },
    card(below) {     // 납작한 것: 카드·사진
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.004, 0.054), itemMaterial(below, 0xe9e4d8, 0x8a857a)); c.position.y = 0.01; c.rotation.y = 0.3; g.add(c);
      return g;
    },
    hat(below) {      // 마녀 모자: 챙 + 뾰족한 고깔
      const g = new THREE.Group(); const m = itemMaterial(below, 0x22202c, 0x0c0b12);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.006, 32), m); brim.position.y = 0.01; g.add(brim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 24), m); cone.position.y = 0.075; cone.rotation.z = 0.18; g.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.014, 24), itemMaterial(below, 0x6a2a7a, 0x3a1444)); band.position.y = 0.02; g.add(band);
      return g;
    },
    key(below) {      // 열쇠: 고리 + 대 + 이
      const g = new THREE.Group(); const m = itemMaterial(below, 0xc9a24e, 0x6b531f, { roughness: 0.45, metalness: 0.6 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 10, 24), m); ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.012, 0.04); g.add(ring);
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.006, 0.07), m); shaft.position.set(0, 0.012, -0.013); g.add(shaft);
      [-0.044, -0.034].forEach((z, i) => { const t = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.006, 0.007), m); t.position.set(0.008, 0.012, z); g.add(t); });
      return g;
    },
    candy(below) {    // 사탕 세 개: 포장지 끝이 비죽한 알
      const g = new THREE.Group();
      [[0xe8553f, -0.035, 0.0, 0.4], [0xf2b45a, 0.01, -0.03, -0.3], [0x6fb3a8, 0.03, 0.03, 0.9]].forEach(([col, x, z, rot]) => {
        const m = itemMaterial(below, col, (col >> 1) & 0x7f7f7f);
        const c = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), m); body.scale.set(1.3, 0.85, 1); c.add(body);
        [-1, 1].forEach((side) => { const w = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.018, 8), m); w.rotation.z = side * Math.PI / 2; w.position.x = side * 0.028; c.add(w); });
        c.position.set(x, 0.014, z); c.rotation.y = rot; g.add(c);
      });
      return g;
    },
    beanie(below) {   // 털모자: 반구 + 접은 단 + 방울
      const g = new THREE.Group(); const m = itemMaterial(below, 0x8a3b3b, 0x401818);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.052, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.y = 0.012; g.add(dome);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.052, 0.024, 24), m); cuff.position.y = 0.014; g.add(cuff);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 10), itemMaterial(below, 0xf1ece2, 0x8a857a)); pom.position.y = 0.072; g.add(pom);
      return g;
    },
    lipbalm(below) {  // 립밤: 작은 원통 + 뚜껑
      const g = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 14), itemMaterial(below, 0xf0d9c8, 0x7a6558)); tube.rotation.z = Math.PI / 2; tube.rotation.y = 0.4; tube.position.y = 0.01; g.add(tube);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.022, 14), itemMaterial(below, 0xc94a5a, 0x5c1f29)); cap.rotation.z = Math.PI / 2; cap.rotation.y = 0.4; cap.position.set(Math.cos(0.4) * 0.016, 0.01, -Math.sin(0.4) * 0.016); g.add(cap);
      return g;
    },
    earbud(below) {   // 이어폰 한 짝: 알 + 줄기
      const g = new THREE.Group(); const m = itemMaterial(below, 0xf4f2ee, 0x8f8d88);
      const bud = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), m); bud.position.y = 0.014; g.add(bud);
      const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.005, 0.03, 4, 10), m); stem.rotation.x = 0.5; stem.position.set(0.004, 0.012, 0.02); g.add(stem);
      return g;
    },
    sock(below) {     // 양말 한 짝: 꺾인 관
      const g = new THREE.Group(); const m = itemMaterial(below, 0x5a6b8a, 0x27304a);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.07, 6, 14), m); leg.rotation.x = Math.PI / 2; leg.position.set(0, 0.018, 0.02); g.add(leg);
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.045, 6, 14), m); foot.rotation.z = Math.PI / 2; foot.position.set(0.028, 0.018, -0.02); g.add(foot);
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), m); heel.position.set(0, 0.018, -0.02); g.add(heel);
      return g;
    },
    mask(below) {     // 가면: 납작한 타원 + 눈구멍 자리
      const g = new THREE.Group(); const m = itemMaterial(below, 0xe9e4d8, 0x8a857a);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), m); face.scale.set(0.8, 0.35, 1.05); face.position.y = 0.014; g.add(face);
      [-0.017, 0.017].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), itemMaterial(below, 0x101418, 0x000000)); e.scale.set(1, 0.4, 0.7); e.position.set(x, 0.03, 0.01); g.add(e); });
      return g;
    },
    hairtie(below) {  // 머리끈: 작은 고리
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0045, 10, 28), itemMaterial(below, 0x2a2a30, 0x111114)); t.rotation.x = Math.PI / 2; t.position.y = 0.008; g.add(t);
      return g;
    },
    handle(below) {   // 호박 바구니 손잡이만: 바구니는 남아요
      const g = new THREE.Group();
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 8, 28, Math.PI), itemMaterial(below, 0x1a1410, 0x000000)); h.position.y = 0.012; h.rotation.y = 0.3; g.add(h);
      return g;
    },
  };
  const items = {};   // kind → { above, below }
  const SMALL = { tooth: 1.4, key: 1.5, earbud: 1.6, hairtie: 1.5, lipbalm: 1.5, candy: 1.3 };   // 작은 것은 1.3 m 앞에서도 보이게 조금 키웁니다
  for (const kind of Object.keys(SHAPES)) {
    const above = SHAPES[kind](false); above.visible = false; scene.add(above);
    const below = SHAPES[kind](true); below.visible = false; below.traverse((o) => { if (o.isMesh) o.renderOrder = 3; }); deep.add(below);
    if (SMALL[kind]) { above.scale.setScalar(SMALL[kind]); below.scale.setScalar(SMALL[kind]); }
    items[kind] = { above, below };
  }
  const itemHeight = { bucket: 0.12, glove: 0.03, tooth: 0.05, string: 0.02, person: 0.16, card: 0.012, hat: 0.14, key: 0.02, candy: 0.03, beanie: 0.08, lipbalm: 0.02, earbud: 0.03, sock: 0.04, mask: 0.03, hairtie: 0.012, handle: 0.08 };   // 떠올랐을 때 바닥이 수면 아래 얼마나 잠기는지(물건 높이에 맞춤)

  // 수면 위 동심원 물결: Yuni 둘레로 천천히 번집니다(uRipples 0번은 Yuni 전용).
  let rippleIdx = 1;
  function ripple(local, strength, t) {
    const rp = U.uRipples.value[rippleIdx++ % (MAX_RIPPLES - 1) + 1];
    rp.set(local.x, local.y, t, strength);
  }

  const parts = { renderer, scene, camera, puddle, maskMesh, surfMesh, floor, U, underGlow, motes, glints, pGeo, pSeed, yuniAbove, yuniBelow, yuniLight, items, itemHeight, ripple };
  if (q.has('debug')) window.__LD = Object.assign(parts, { S });   // ?debug: 콘솔에서 부품과 상태를 만질 수 있게
  return parts;
}

/* ---------- 시작 ---------- */

const startEl = $('start');
let started = false;
startEl.addEventListener('click', async () => {
  if (started) return;
  started = true; startEl.disabled = true;
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
  const { renderer, scene, camera, puddle, surfMesh, U, underGlow, motes, glints, pGeo, pSeed, yuniAbove, yuniBelow, yuniLight, items, itemHeight, ripple } = camera3;

  let hasCamera = false;
  try {
    await startCamera();
    hasCamera = true;
  } catch (e) {
    console.warn('camera unavailable', e);
  }
  U.uVideo.value = hasCamera ? videoTex : nightStreetTexture();
  const bgImage = hasCamera ? null : U.uVideo.value.image;
  // 돌아왔을 때 멈춘 화면 풀기: 카메라 재생, 소리 재개.
  const resumeAll = () => {
    if (hasCamera) resumeCamera((tex) => { U.uVideo.value = tex; });
    if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resumeAll(); });
  window.addEventListener('pageshow', resumeAll);
  window.addEventListener('focus', resumeAll);
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
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
  hint(sensorReady ? text('tapfloor') : text('nosensor'));

  /* 자리 고정(하이브리드 추적): 카메라 프레임을 320px 폭으로 줄여 바닥 광류로 이동을 재고, 자이로로 회전을 잽니다.
     조건: 카메라·센서가 있고, 영상 방향이 화면 방향과 같을 때(iOS Safari 세로). 아니면 자이로만(이동 없음). */
  let tracker = null, trackCanvas = null, trackCtx = null, lastTrack = -1, trackDbg = null;
  const sameOrientation = () => video && (video.videoWidth < video.videoHeight) === (window.innerWidth < window.innerHeight);
  if (hasCamera && sensorReady && q.get('track') !== 'gyro' && sameOrientation()) {
    try {
      const k = 320 / Math.max(video.videoWidth, video.videoHeight);
      trackCanvas = document.createElement('canvas');
      trackCanvas.width = Math.round(video.videoWidth * k); trackCanvas.height = Math.round(video.videoHeight * k);
      trackCtx = trackCanvas.getContext('2d', { willReadFrequently: true });
      tracker = new HybridTracker({ fov: CAMERA_FOV, eye: EYE });
      await tracker.init(trackCanvas.width, trackCanvas.height);
    } catch (e) { console.warn('tracker off', e); tracker = null; }
  }
  track('lookdown_started', { camera: hasCamera, sensor: sensorReady, track: tracker ? 'hybrid' : 'gyro', ms: Math.round(performance.now() - S.clickAt) });

  /* 바닥 자리 셈하기 */
  const camQuat = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  function updateCamera(t) {
    if (sensorReady && look.orientation) deviceQuat(camQuat, look.orientation);
    else camQuat.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
    camera.quaternion.copy(camQuat);
    forward.set(0, 0, -1).applyQuaternion(camQuat);
    // 이동: 최대 30Hz로 프레임을 읽어 추적기에 넣고, 그 위치를 카메라에 씁니다. 추적이 끊기면 마지막 자리를 유지합니다.
    if (tracker && video && video.videoWidth && t - lastTrack >= 1 / 30) {
      lastTrack = t;
      try {
        trackCtx.drawImage(video, 0, 0, trackCanvas.width, trackCanvas.height);
        const r = tracker.update(trackCtx.getImageData(0, 0, trackCanvas.width, trackCanvas.height), camQuat, t);
        camera.position.copy(r.position);
        trackDbg = r.debug;
      } catch (e) { console.warn('tracker stopped', e); tracker = null; }
    }
  }
  // 카메라 앞 방향이 바닥(y=0)과 만나는 점. 너무 가깝거나 멀면 0.7~2.6m로 당깁니다.
  function floorPoint(dir, out) {
    if (dir.y > -0.08) return null;
    const d = THREE.MathUtils.clamp(camera.position.y / -dir.y, 0.7, 2.6);
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
  // 바닥 탭이 기본 경로입니다. 바닥 인식에 기대지 않고, 탭한 자리(바닥을 못 셈하면 앞쪽 1.3 m)에 바로 고입니다.
  function aheadPoint() {
    const f = forward.clone(); f.y = 0; if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    return new THREE.Vector3(f.x * 1.3, 0, f.z * 1.3);
  }
  function onTap(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const t = clock.getElapsedTime();
    if (S.phase === 'idle') { placePuddle(floorPoint(ray.ray.direction, new THREE.Vector3()) || aheadPoint()); return; }
    // 고인 뒤의 탭은 물결뿐입니다. (Yuni가 떠 있으면 귀가 옆으로 누웠다 돌아옵니다. 분실물을 탭해도 물결만.)
    const hit = ray.intersectObject(surfMesh, false)[0];
    const local = hit && hit.uv ? new THREE.Vector2(hit.uv.x * 2 - 1, hit.uv.y * 2 - 1) : new THREE.Vector2(0, 0);
    ripple(local, 0.9, t);
    if (S.up > 0.5 && (S.phase === 'speaking' || S.phase === 'item' || S.phase === 'rising' || S.phase === 'stay')) {
      if (t - S.startle < 2.5 && t - lastMumble > 3) { mumble(); lastMumble = t; }
      S.startle = t;
      if (S.phase === 'stay') S.t0 = t;   // 두드리면 그만큼 더 머뭅니다
    }
    // 가라앉은 뒤 물을 탭하면 다시 올라옵니다(한마디·분실물 없이 머물다 감).
    if (S.phase === 'ended' && hit) { S.encore = true; S.phase = 'light'; S.t0 = t; S.light = 0; S.ears = 0; track('lookdown_return'); }
    track('lookdown_tap_water');
  }
  let lastMumble = -10;

  function placePuddle(p) {
    puddle.position.copy(p);
    puddle.visible = true;
    S.placed = true;
    S.open = 0; S.light = 0; S.up = 0; S.clarity = 0; S.ears = 0; S.lookUp = 0; S.item = 0; S.wander = 0; S.fortune = null; S.closed = false; S.startle = -10; S.encore = false;
    S.phase = 'pooling';
    S.t0 = clock.getElapsedTime();
    U.uRipples.value.forEach((r) => r.set(0, 0, 0, 0));
    hint('');
    caption('');
    track('lookdown_pool', { ms: Math.round(performance.now() - S.clickAt) });
  }

  /* 나가기 화면과 공유 */
  const endEl = $('end');
  const wordmark = $('wordmark');
  wordmark.addEventListener('load', () => { wordmark.hidden = false; endEl.querySelectorAll('.mark-text, .mark-reflect').forEach((el) => { el.hidden = true; }); });
  // 공유 버튼은 Yuni가 올라올 때부터 보입니다(Yuni가 있을 때 찍어야 하니까). 가라앉은 뒤엔 워드마크와 한 줄이 더해집니다.
  function showShare() { if (endEl.hidden) { endEl.hidden = false; endEl.classList.add('is-early'); requestAnimationFrame(() => endEl.classList.add('is-on')); } }
  // 나가기 화면에도 점쾌 문장을 남깁니다(화면 캡처가 곧 결과 카드).
  function showEnd() { showShare(); caption(''); $('end-fortune').textContent = S.fortune ? S.fortune.text : ''; endEl.classList.remove('is-early'); }
  // 합성: 카메라 프레임 + 3D 화면 + 아래쪽 워드마크·한 줄·#lookdown. 사진과 영상이 같은 그림을 씁니다.
  let captureFrame = null;
  function makeComposer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas'); c.width = Math.round(window.innerWidth * dpr); c.height = Math.round(window.innerHeight * dpr);
    const g = c.getContext('2d');
    const cover = (img, iw, ih) => { const sc = Math.max(c.width / iw, c.height / ih); const dw = iw * sc, dh = ih * sc; g.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh); };
    const spaced = (str, x, y, size, alpha) => {   // 자간 .42em 워드마크를 글자 단위로
      g.font = `600 ${size}px Pretendard, -apple-system, sans-serif`; g.textAlign = 'left'; g.globalAlpha = alpha;
      const gap = size * 0.42; const widths = [...str].map((ch) => g.measureText(ch).width); const total = widths.reduce((a, w) => a + w + gap, -gap);
      let cx = x - total / 2; [...str].forEach((ch, i) => { g.fillText(ch, cx, y); cx += widths[i] + gap; }); g.globalAlpha = 1;
    };
    const draw = () => {
      if (video && video.videoWidth) cover(video, video.videoWidth, video.videoHeight);
      else { g.fillStyle = '#0b1420'; g.fillRect(0, 0, c.width, c.height); if (bgImage) cover(bgImage, bgImage.width, bgImage.height); }
      g.drawImage(renderer.domElement, 0, 0, c.width, c.height);
      // 아래쪽: 나가기 화면과 같은 워드마크(반사) + 한 줄 + 해시태그
      const H = c.height, W = c.width, base = H - 36 * dpr;
      const grd = g.createLinearGradient(0, H - 230 * dpr, 0, H); grd.addColorStop(0, 'rgba(11,20,32,0)'); grd.addColorStop(1, 'rgba(11,20,32,.85)');
      g.fillStyle = grd; g.fillRect(0, H - 230 * dpr, W, 230 * dpr);
      g.fillStyle = '#F6F3EC'; g.textBaseline = 'alphabetic';
      const markY = base - 92 * dpr;
      if (!wordmark.hidden && wordmark.naturalWidth) {
        const mw = Math.min(200 * dpr, wordmark.naturalWidth), mh = mw * wordmark.naturalHeight / wordmark.naturalWidth;
        g.drawImage(wordmark, W / 2 - mw / 2, markY - mh, mw, mh);
        g.save(); g.globalAlpha = 0.3; g.translate(0, markY * 2 + 4 * dpr); g.scale(1, -1); g.drawImage(wordmark, W / 2 - mw / 2, markY - mh, mw, mh); g.restore();
      } else {
        g.fillStyle = '#C8C4BA'; spaced('LOOK DOWN', W / 2, markY, 20 * dpr, 1);
        g.save(); g.translate(0, markY * 2 + 6 * dpr); g.scale(1, -1); spaced('LOOK DOWN', W / 2, markY, 20 * dpr, 0.28); g.restore();
      }
      g.fillStyle = '#F6F3EC'; g.textAlign = 'center';
      g.font = `400 ${Math.round(16 * dpr)}px Pretendard, -apple-system, sans-serif`; g.fillText(text('end'), W / 2, base - 36 * dpr);
      g.font = `600 ${Math.round(14 * dpr)}px Pretendard, -apple-system, sans-serif`; g.fillText(text('shareText'), W / 2, base);
      // 결과 카드의 핵심: 점쾌 문장. 워드마크 위에 크게, 두 줄까지 접어서.
      if (S.fortune && S.fortune.text) {
        g.font = `500 ${Math.round(22 * dpr)}px Pretendard, -apple-system, sans-serif`; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 10 * dpr;
        const maxW = W - 56 * dpr; const words = S.fortune.text.split(' '); const rows = []; let cur = '';
        for (const w of words) { const tryS = cur ? cur + ' ' + w : w; if (g.measureText(tryS).width > maxW && cur) { rows.push(cur); cur = w; } else cur = tryS; }
        if (cur) rows.push(cur);
        const lh = 32 * dpr; let y = markY - 70 * dpr - (rows.length - 1) * lh;
        for (const r of rows) { g.fillText(r, W / 2, y); y += lh; }
        g.shadowBlur = 0;
      }
    };
    return { canvas: c, draw };
  }
  async function deliver(blob, name, type) {
    const file = new File([blob], name, { type });
    const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); };
    let method = 'download';
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text: text('shareText'), title: 'LOOK DOWN' }); method = 'share'; }
      else download();
    } catch (e) { method = e && e.name === 'AbortError' ? 'cancel' : 'download'; if (method === 'download') download(); }
    track('lookdown_share', { method, kind: type.startsWith('video') ? 'video' : 'photo' });
    resumeAll();
  }
  async function sharePhoto() {
    const { canvas, draw } = makeComposer();
    renderer.render(scene, camera);
    draw();
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    await deliver(blob, 'lookdown.jpg', 'image/jpeg');
  }
  // 영상: 버튼을 길게 누르는 동안(최대 T.video초) 매 프레임 합성해 녹화합니다. 빗소리·웅얼거림도 섞습니다.
  let rec = null;
  function startVideo() {
    if (rec || typeof MediaRecorder === 'undefined') return false;
    const { canvas, draw } = makeComposer();
    const stream = canvas.captureStream(30);
    if (audio.capture) audio.capture.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    let mr;
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined); } catch (e) { console.warn('recorder', e); return false; }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { mr.onstop = () => resolve(new Blob(chunks, { type: mr.mimeType || mime || 'video/webm' })); });
    mr.start(250);
    captureFrame = draw;
    const timer = setTimeout(stopVideo, T.video * 1000);
    rec = { mr, done, timer, stream, at: performance.now() };
    endEl.classList.add('is-rec'); shareBtn.classList.add('is-rec'); shareBtn.textContent = text('recording');
    return true;
  }
  async function stopVideo() {
    if (!rec) return;
    const r = rec; rec = null;
    clearTimeout(r.timer); captureFrame = null;
    endEl.classList.remove('is-rec'); shareBtn.classList.remove('is-rec'); shareBtn.textContent = text('share');
    if (r.mr.state !== 'inactive') r.mr.stop();
    const blob = await r.done;
    r.stream.getTracks().forEach((tr) => { if (tr.kind === 'video') tr.stop(); });
    const type = blob.type || 'video/webm';
    if (performance.now() - r.at < 600 || !blob.size) { track('lookdown_share', { method: 'too_short', kind: 'video' }); return; }
    await deliver(blob, type.includes('mp4') ? 'lookdown.mp4' : 'lookdown.webm', type);
  }
  // 버튼 하나: 탭하면 사진, 길게 누르면(0.4초) 영상. 손을 떼면 녹화가 끝나고 공유 시트로 갑니다.
  const shareBtn = $('btn-share');
  let holdTimer = null, held = false;
  const release = () => {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (held) { held = false; stopVideo().catch((e) => console.warn('video failed', e)); }
    else if (release.armed) { release.armed = false; sharePhoto().catch((e) => console.warn('share failed', e)); }
  };
  shareBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); release.armed = true; held = false;
    holdTimer = setTimeout(() => { holdTimer = null; if (startVideo()) { held = true; release.armed = false; } }, 400);
  });
  shareBtn.addEventListener('pointerup', release);
  shareBtn.addEventListener('pointercancel', release);
  shareBtn.addEventListener('pointerleave', () => { if (held) release(); });
  shareBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  shareBtn.addEventListener('click', (e) => e.preventDefault());

  // C. 카메라 화면의 평균 밝기를 0.6초마다 재서 S.night(어두움)로 씁니다. 카메라가 없으면 밤으로 둡니다.
  if (hasCamera) {
    const lc = document.createElement('canvas'); lc.width = lc.height = 8;
    const lg = lc.getContext('2d', { willReadFrequently: true });
    setInterval(() => {
      if (!video || !video.videoWidth) return;
      try {
        lg.drawImage(video, 0, 0, 8, 8);
        const d = lg.getImageData(0, 0, 8, 8).data;
        let lum = 0;
        for (let i = 0; i < d.length; i += 4) lum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        lum /= 64 * 255;
        const night = 1 - smooth((lum - 0.18) / 0.45);   // 0.18 이하 = 밤, 0.63 이상 = 낮
        S.night += (night - S.night) * 0.35;
      } catch { /* 아직 준비 안 됨 */ }
    }, 600);
  }

  /* 매 프레임 */
  const clock = new THREE.Clock();
  let seenAt = null;
  const yuniLocal = new THREE.Vector3();
  const yuniWorld = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const DEBUG = q.has('debug'); let frameNo = 0;

  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    const dt = Math.min(0.05, clock.getDelta() || 0.016);
    updateCamera(t);
    U.uTime.value = t;
    U.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    if (videoTex) videoTex.needsUpdate = true;

    // 웅덩이는 탭으로만 고입니다(바닥을 비추기만 해서는 생기지 않습니다. 현실 물체 위에 멋대로 생기는 걸 막기 위해).

    const k = t - S.t0;
    if (S.phase === 'pooling') {
      // 가장자리가 번지며 고입니다. 끝 무렵부터 물속 빛이 비치기 시작합니다.
      S.open = smooth(k / T.pool);
      S.light = smooth((k - T.pool * 0.6) / T.light) * 0.5;
      if (k > T.pool) { S.phase = 'light'; S.t0 = t; }
    } else if (S.phase === 'light') {
      // 물속에서 빛이 다가옵니다(영상과 같은 문법). 1.5초.
      S.open = 1; S.light = S.encore ? smooth(k / T.light) : 0.5 + 0.5 * smooth(k / T.light);
      if (k > T.light) { S.phase = 'rising'; S.t0 = t; S.ears = 0; showShare(); }
    } else if (S.phase === 'rising') {
      // 수면을 깨고 올려다봅니다. 물 밖으로는 안 나옵니다.
      S.light = 1; S.up = easeOut(k / T.rise);
      S.ears = smooth((k - 0.4) / 0.5);
      S.lookUp = smooth((k - 0.5) / 0.6);
      if (seenAt === null && S.up > 0.35) { seenAt = performance.now(); track('lookdown_yuni_seen', { ms: Math.round(seenAt - S.clickAt) }); }
      if (k > T.rise) {
        S.t0 = t;
        ripple(new THREE.Vector2(0, 0.05), 0.7, t);
        if (S.encore) { S.phase = 'stay'; mumble(); }
        else {
          S.phase = 'speaking';
          S.fortune = pickFortune();
          caption(S.fortune.text);
          mumble();
          track('lookdown_line', { ms: Math.round(performance.now() - S.clickAt), n: S.fortune.n });
        }
      }
    } else if (S.phase === 'stay') {
      // 다시 불려 나온 Yuni: 말 없이 머뭅니다. 두드리면 더 머물고, 가만두면 가라앉습니다.
      S.up = 1; S.wander = smooth(k / 2);
      if (k > T.stay) { S.phase = 'leaving'; S.t0 = t; S.pulse = t; }
    } else if (S.phase === 'speaking') {
      S.up = 1;
      if (k > T.speak) {
        // 점쾌 문장은 결과를 캡처할 수 있게 가라앉을 때까지 남겨 둡니다.
        S.t0 = t;
        // 물건이 없는 문장도 같은 길이로 머물며 마무리 한마디를 합니다.
        S.phase = 'item';
        if (S.fortune && S.fortune.shape && items[S.fortune.shape]) ripple(new THREE.Vector2(-0.17 / (PUDDLE / 2), -0.07 / (PUDDLE / 2)), 0.6, t);
      }
    } else if (S.phase === 'item') {
      // 점쾌의 물건이 옆에 떠오르고, Yuni는 그 둘레를 천천히 돌아다닙니다. 탭하면 물결만. 돌려주기는 1단계.
      S.up = 1; S.item = easeOut(k / 1.2); S.wander = smooth((k - 0.8) / 2);
      if (!S.closed && k > 2.5 && closingText()) { S.closed = true; caption(closingText()); mumble(); }
      if (k > T.item) { S.phase = 'leaving'; S.t0 = t; S.pulse = t; }
    } else if (S.phase === 'leaving') {
      // 반짝 한 번(1.1초) 하고 가라앉습니다.
      if (k > 1.1) {
        const sk2 = smooth((k - 1.1) / T.sink);
        S.up = 1 - sk2; S.item = Math.max(0, 1 - sk2 * 1.3); S.lookUp = 1 - sk2; S.wander = 1 - sk2;
        S.light = 1 - smooth((k - 1.1) / (T.sink + 1.2));
      }
      if (k > 1.1 + T.sink + 0.3) { S.phase = 'ended'; S.t0 = t; S.up = 0; S.item = 0; S.wander = 0; S.light = 0; if (!S.encore) { showEnd(); track('lookdown_end'); } }
    } else if (S.phase === 'ended') {
      S.up = 0; S.item = 0; S.wander = 0; S.light = 0;
    }
    S.clarity += ((S.up > 0.2 ? 1 : 0) - S.clarity) * dt * 1.5;
    U.uOpen.value = S.open;
    U.uClarity.value = S.clarity;
    U.uLight.value = S.light * (0.6 + 0.4 * Math.sin(t * 1.3) * 0.5 + 0.2);

    const sk = t - S.startle;
    const startle = sk >= 0 && sk < 1.4 ? Math.sin(Math.PI * Math.min(1, sk / 1.4)) : 0;

    // Yuni 자세: 수면 아래 -0.16m에서 YUNI_UP까지 떠오르고, 둘둘 흔들리며, 보는 사람 쪽을 향합니다.
    const bob = Math.sin(t * 1.1) * 0.004 + Math.sin(t * 0.63) * 0.003 - 0.012 * startle;
    const yLocal = -0.16 + (YUNI_UP + 0.16) * S.up + bob * S.up;
    // 돌아다니기: 물건이 떠 있을 땐 그 반대편을 중심으로 천천히 한 바퀴씩. 물건 자리(-0.17, 0.09)와는 겹치지 않는 궤도.
    const sway = new THREE.Vector2(Math.sin(t * 0.37) * 0.012 + (0.07 + Math.sin(t * 0.33) * 0.12) * S.wander, Math.cos(t * 0.29) * 0.012 + Math.cos(t * 0.26) * 0.09 * S.wander).multiplyScalar(S.up);
    yuniLocal.set(sway.x, yLocal, -sway.y);
    yuniWorld.copy(puddle.position).add(yuniLocal);
    yuniAbove.group.position.copy(yuniWorld);
    yuniAbove.group.visible = S.placed && S.up > 0.01;
    toCam.copy(camera.position).sub(yuniWorld); toCam.y = 0;
    const facing = Math.atan2(toCam.x, toCam.z);
    // 올려다보기: 떠오른 뒤 머리를 살짝 젖혀 보는 사람을 봅니다.
    yuniAbove.group.rotation.set(Math.sin(t * 0.5) * 0.03 - 0.28 * S.lookUp, facing, Math.cos(t * 0.41) * 0.03);
    // 아랫몸은 puddle 그룹(z가 위) 안에 있으므로 같은 자세를 그 좌표로 옮깁니다.
    yuniBelow.group.position.set(yuniLocal.x, -yuniLocal.z, yuniLocal.y);
    yuniBelow.group.rotation.set(Math.PI / 2, 0, 0);
    yuniBelow.group.rotateOnAxis(new THREE.Vector3(0, 1, 0), facing);
    yuniBelow.group.visible = S.placed && S.light > 0.05;
    U.uYuni.value.set(yuniLocal.x / (PUDDLE / 2), -yuniLocal.z / (PUDDLE / 2));

    // 귀: 쉴 땐 살짝 벌어지고, 관심이 생기면 쫑긋 섭니다. 두드리면 옆으로 누웠다(놀람) 돌아오고, 돌아갈 땐 뒤로 젖힙니다(안심).
    const earAngle = THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.55, 0.12, S.ears), 1.15, startle) + Math.sin(t * 0.9) * 0.03;
    for (const y of [yuniAbove, yuniBelow]) for (const ear of y.ears) { ear.rotation.z = -ear.userData.side * earAngle; }

    // 점쾌의 물건: 웅덩이 왼쪽 앞에서 떠올라 바닥만 잠긴 채 둥둥. 보는 사람 쪽을 향하고 살짝 기울어 위에서도 보입니다.
    const kind = S.fortune && S.fortune.shape && items[S.fortune.shape] ? S.fortune.shape : null;
    if (!kind) S.wander = 0;
    for (const k2 of Object.keys(items)) { if (k2 !== kind) { items[k2].above.visible = false; items[k2].below.visible = false; } }
    if (kind) {
      const { above, below } = items[kind];
      const sink = itemHeight[kind] || 0.03;
      const itemY = -0.14 + (0.14 - sink * 0.18) * S.item + Math.sin(t * 0.9 + 1) * 0.004 * S.item;
      const itemLocal = new THREE.Vector3(-0.17, itemY, 0.09);
      const itemTilt = -0.5 * S.item;
      above.position.copy(puddle.position).add(itemLocal);
      above.rotation.set(0, facing, Math.sin(t * 0.7) * 0.05 * S.item); above.rotateX(itemTilt);
      above.visible = S.placed && S.item > 0.01;
      below.position.set(itemLocal.x, -itemLocal.z, itemLocal.y);
      below.rotation.set(Math.PI / 2, 0, 0); below.rotateOnAxis(new THREE.Vector3(0, 1, 0), facing); below.rotateX(itemTilt);
      below.visible = S.placed && S.item > 0.01;
    }

    // 반짝임: 밝기 펄스 1회. 0.75초 올라가 1.27배, 0.75초 내려옴. 과노출 금지.
    const pk = t - S.pulse;
    const pulse = pk >= 0 && pk < 1.5 ? 1 + 0.27 * Math.sin(Math.PI * pk / 1.5) : 1;
    // C. 밤에 더 또렷: 카메라 화면이 어두울수록 또렷하고, 밝으면 희미합니다.
    const vivid = 0.45 + 0.55 * S.night;
    yuniAbove.body.material.emissiveIntensity = GLOW * pulse * vivid;
    yuniAbove.body.material.opacity = 0.7 + 0.3 * S.night;
    yuniAbove.ears.forEach((e) => { e.children[0].material.emissiveIntensity = GLOW * pulse * vivid; e.children[0].material.opacity = 0.7 + 0.3 * S.night; });
    yuniAbove.eyes.forEach((e) => { e.material.transparent = true; e.material.opacity = 0.75 + 0.25 * S.night; });
    yuniLight.position.copy(yuniWorld).y += 0.08;
    yuniLight.intensity = 0.35 * S.up * pulse * vivid;

    // 물속 빛과 알갱이
    underGlow.position.set(yuniLocal.x, -yuniLocal.z, Math.min(-0.02, yuniLocal.y - 0.03));
    underGlow.material.opacity = 0.85 * S.light * (0.9 + 0.1 * Math.sin(t * 2.2)) * pulse * vivid;
    underGlow.scale.setScalar(0.32 + 0.22 * S.light);
    motes.material.opacity = 0.6 * S.light;
    for (const sp of glints) {
      const d = sp.userData; const a = t * d.speed + d.phase;
      sp.position.set(Math.cos(a) * d.r, Math.sin(a * 0.8) * d.r * 0.7, d.z + Math.sin(t * 0.5 + d.phase) * 0.02);
      sp.scale.setScalar(d.size * (0.9 + 0.1 * Math.sin(t * 1.7 + d.phase)));
      sp.material.opacity = d.a * S.open * (0.7 + 0.3 * S.night);
    }
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
    if (captureFrame) captureFrame();
    if (DEBUG && trackDbg && (frameNo++ % 10 === 0)) $('tag').textContent = `trk ${trackDbg.ms_total.toFixed(1)}ms in ${trackDbg.inliers}/${trackDbg.tracked} h ${trackDbg.h.toFixed(2)} xz ${camera.position.x.toFixed(2)},${camera.position.z.toFixed(2)}${tracker.lostCount ? ' lost' + tracker.lostCount : ''}`;
  });

  // Yuni는 웅덩이 자리에만 있으므로 카메라가 웅덩이를 벗어나면 화면 밖으로 나갑니다. 끌어내는 조작은 없습니다.

  // 체류 시간
  // 공유 시트에 다녀와도 세션은 이어지므로 숨겨질 때마다 보냅니다. GA에서는 세션당 마지막 값(가장 큰 s)을 보면 됩니다.
  const leave = () => track('lookdown_dwell', { s: Math.round((performance.now() - S.clickAt) / 1000), phase: S.phase });
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
}

