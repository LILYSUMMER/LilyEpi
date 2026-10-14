/* LOOK DOWN lab · 추적 품질 측정 하네스
   - 프레임 소스: 라이브 카메라 또는 녹화 영상(<video>)
   - IMU 소스: 라이브 deviceorientation 또는 JSON 재생
   - 추적기: trackers/gyro.js, trackers/alva.js (같은 인터페이스)
   - 기록: 매 프레임 가상 마커(시작 시 1m 앞 바닥)의 화면 좌표와 카메라 포즈 → CSV, 세션 요약 JSON
   - 정답 경로(gt)가 IMU JSON에 들어 있으면 추적 오차(err_px, err_m)도 계산한다(합성 데이터용).
*/
import * as THREE from 'three';
import { GyroTracker } from './trackers/gyro.js';
import { AlvaTracker } from './trackers/alva.js';

const q = new URLSearchParams(location.search);
const W = +q.get('w') || 640;
const H = +q.get('h') || 480;
const FOV = +q.get('fov') || 67;          // 세로 화각(deg). lookdown.js CAMERA_FOV와 같은 뜻
const EYE = +q.get('eye') || 1.4;
const MARKER_AHEAD = 1.0;                  // 시작 시 마커를 놓는 거리(m)
const STEP = q.get('step') === '1';
const AUTO = q.get('auto') === '1';
const SCENARIO_LEN = { a: 10, b: 12, c: 8 }; // 초

const $ = (id) => document.getElementById(id);
const log = (s) => { const el = $('log'); el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; };

/* ---------- 기기 정보 ---------- */
function deviceInfo() {
  let gpu = null;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl ? gl.getParameter(gl.RENDERER) : null);
  } catch { /* 없음 */ }
  return {
    ua: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || null,
    model: navigator.userAgentData?.model || null,      // Android Chrome만 줌. iOS는 UA에 모델이 없음
    gpu,
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    frame: `${W}x${H}`,
    fov: FOV,
  };
}

/* ---------- IMU: deviceorientation → 뒤 카메라 쿼터니언 (lookdown.js:153-166과 동일) ---------- */
const deg = THREE.MathUtils.degToRad;
const BACK_CAMERA = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const tmpEuler = new THREE.Euler(); const tmpQuat = new THREE.Quaternion();
function screenAngle() { const a = screen.orientation && screen.orientation.angle; return typeof a === 'number' ? a : window.orientation || 0; }
function deviceQuat(target, { alpha, beta, gamma }) {
  tmpEuler.set(deg(beta), deg(alpha), -deg(gamma), 'YXZ');
  target.setFromEuler(tmpEuler).multiply(BACK_CAMERA);
  return target.multiply(tmpQuat.setFromAxisAngle(Z_AXIS, -deg(screenAngle())));
}
const imu = { live: null, liveAt: 0, samples: null, gt: null, log: [] };
window.addEventListener('deviceorientation', (e) => {
  if (e.alpha === null && e.beta === null) return;
  imu.live = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 };
  imu.liveAt = performance.now();
});
async function requestMotion() {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  if (typeof DeviceOrientationEvent.requestPermission !== 'function') return true;
  try { return (await DeviceOrientationEvent.requestPermission()) === 'granted'; } catch { return false; }
}
// 재생 JSON의 samples: [{t, q:[x,y,z,w]}] (카메라 쿼터니언). t는 영상 시작부터 초.
function sampleQuat(samples, t, out) {
  if (!samples || !samples.length) return null;
  let lo = 0, hi = samples.length - 1;
  if (t <= samples[0].t) return out.fromArray(samples[0].q);
  if (t >= samples[hi].t) return out.fromArray(samples[hi].q);
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return out.fromArray(a.q).slerp(tmpQuat.fromArray(b.q), k);
}
function samplePose(samples, t) {   // gt: [{t, p:[x,y,z], q:[x,y,z,w]}]
  if (!samples || !samples.length) return null;
  let lo = 0, hi = samples.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi], k = THREE.MathUtils.clamp((t - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
  return { p: new THREE.Vector3().fromArray(a.p).lerp(new THREE.Vector3().fromArray(b.p), k), q: new THREE.Quaternion().fromArray(a.q).slerp(new THREE.Quaternion().fromArray(b.q), k) };
}

/* ---------- 프레임 소스 ---------- */
const video = $('video');
const grab = document.createElement('canvas'); grab.width = W; grab.height = H;
const gctx = grab.getContext('2d', { willReadFrequently: true });
let source = { kind: null, stream: null };
async function openCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream; await video.play();
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  source = { kind: 'camera', stream };
}
async function openVideo(src) {
  video.srcObject = null; video.src = src; video.loop = false;
  await new Promise((r, j) => { video.addEventListener('loadedmetadata', r, { once: true }); video.addEventListener('error', j, { once: true }); });
  source = { kind: 'video', stream: null };
}
function grabFrame() {
  // cover 크롭: 영상의 가운데를 W×H 비율로 잘라 넣는다.
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
  const s = Math.max(W / vw, H / vh); const dw = vw * s, dh = vh * s;
  gctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return gctx.getImageData(0, 0, W, H);
}

/* ---------- 3D: 마커 투영 ---------- */
const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 50);
const overlay = $('overlay'); const octx = overlay.getContext('2d');
function fitOverlay() { overlay.width = innerWidth * devicePixelRatio; overlay.height = innerHeight * devicePixelRatio; }
addEventListener('resize', fitOverlay); fitOverlay();
function project(p, pos, quat) {   // 월드 점 → 처리 프레임(W×H) 픽셀. 카메라 뒤면 null
  camera.position.copy(pos); camera.quaternion.copy(quat); camera.updateMatrixWorld();
  const v = p.clone().project(camera);
  if (v.z > 1 || v.z < -1) return null;
  return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z };
}
function drawOverlay(px, lost) {
  const ow = overlay.width, oh = overlay.height; octx.clearRect(0, 0, ow, oh);
  if (!px) return;
  // 처리 프레임(W×H, cover) → 화면 좌표
  const s = Math.max(ow / W, oh / H); const x = (px.x - W / 2) * s + ow / 2, y = (px.y - H / 2) * s + oh / 2;
  octx.strokeStyle = lost ? '#ef4444' : '#F2B45A'; octx.lineWidth = 3 * devicePixelRatio;
  octx.beginPath(); octx.ellipse(x, y, 28 * devicePixelRatio, 12 * devicePixelRatio, 0, 0, Math.PI * 2); octx.stroke();
  octx.beginPath(); octx.moveTo(x - 10, y); octx.lineTo(x + 10, y); octx.moveTo(x, y - 10); octx.lineTo(x, y + 10); octx.stroke();
}

/* ---------- 추적기 ---------- */
let tracker = null; let trackerId = q.get('tracker') || 'gyro';
$('sel-tracker').value = trackerId;
async function makeTracker(id) {
  const t = id === 'gyro' ? new GyroTracker({ eye: EYE })
    : new AlvaTracker({ eye: EYE, fov: FOV, useFallback: id === 'alva-fb', scale: +q.get('scale') || 1 });
  await t.init(W, H);
  $('h-tracker').textContent = `tracker: ${id}`;
  return t;
}

/* ---------- 세션 기록 ---------- */
const S = { running: false, scenario: q.get('scenario') || '-', rows: [], t0: null, marker: null, startPx: null, startPos: null, lastPos: null, dist: 0, lost: 0, ms: [], frames: 0, fpsT: 0, fpsN: 0, recorder: null, chunks: [], gtAlign: null };
const CSV_HEAD = 't,frame,ms,lost,confidence,px,py,drift_px,drift_m,cam_x,cam_y,cam_z,qx,qy,qz,qw,err_px,err_m,gt_x,gt_y,gt_z';

function beginSession(label) {
  S.running = true; S.scenario = label; S.rows = []; S.t0 = null; S.marker = null; S.startPx = null; S.startPos = null; S.lastPos = null;
  S.dist = 0; S.lost = 0; S.ms = []; S.frames = 0; S.fpsT = performance.now(); S.fpsN = 0; imu.log = []; S.gtAlign = null;
  $('summary').classList.remove('show');
  log(`▶ 세션 시작 (${label}) tracker=${trackerId} ${source.kind}${STEP ? ' step' : ''}`);
}

const camQ = new THREE.Quaternion(); const fwd = new THREE.Vector3();
function placeMarker(pos, quat) {
  // 시작 자세에서 수평 앞 방향으로 MARKER_AHEAD m, 바닥(y=0)
  fwd.set(0, 0, -1).applyQuaternion(quat); fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
  S.marker = new THREE.Vector3(pos.x, 0, pos.z).addScaledVector(fwd, MARKER_AHEAD);
}

function onFrame(t) {          // t: 세션 기준 초
  const img = tracker instanceof GyroTracker ? null : grabFrame();
  let imuQ = null;
  if (source.kind === 'video' && imu.samples) imuQ = sampleQuat(imu.samples, t, camQ);
  else if (imu.live && performance.now() - imu.liveAt < 1000) imuQ = deviceQuat(camQ, imu.live);
  if (source.kind === 'camera' && imu.live) imu.log.push({ t: +t.toFixed(3), q: deviceQuat(new THREE.Quaternion(), imu.live).toArray() });

  const a = performance.now();
  const r = tracker.update(img, imuQ, t);
  const ms = performance.now() - a;
  S.ms.push(ms); S.frames++; S.fpsN++;
  if (r.lost) S.lost++;

  if (!S.marker && !r.lost) { placeMarker(r.position, r.quaternion); S.startPos = r.position.clone(); S.lastPos = r.position.clone(); }
  const px = S.marker ? project(S.marker, r.position, r.quaternion) : null;
  if (px && !S.startPx) S.startPx = { ...px };
  if (S.lastPos) { S.dist += r.position.distanceTo(S.lastPos); S.lastPos.copy(r.position); }
  const driftPx = px && S.startPx ? Math.hypot(px.x - S.startPx.x, px.y - S.startPx.y) : null;
  const driftM = S.startPos ? r.position.distanceTo(S.startPos) : null;

  // 정답이 있으면 오차. 추적기 좌표를 정답 좌표에 맞추는 변환은 첫 유효 프레임에서 한 번 잡는다(위치 오프셋만).
  let errPx = null, errM = null, gt = null;
  if (imu.gt) {
    gt = samplePose(imu.gt, t);
    if (gt && !S.gtAlign && !r.lost) S.gtAlign = { dp: gt.p.clone().sub(r.position) };
    if (gt && S.gtAlign && S.marker) {
      const gtPx = project(S.marker, gt.p, gt.q);
      if (gtPx && px) errPx = Math.hypot(px.x - gtPx.x, px.y - gtPx.y);
      errM = r.position.clone().add(S.gtAlign.dp).distanceTo(gt.p);
    }
  }
  S.rows.push([t.toFixed(3), S.frames, ms.toFixed(2), r.lost ? 1 : 0, (r.confidence ?? 0).toFixed(2), px ? px.x.toFixed(1) : '', px ? px.y.toFixed(1) : '',
    driftPx === null ? '' : driftPx.toFixed(1), driftM === null ? '' : driftM.toFixed(3),
    r.position.x.toFixed(3), r.position.y.toFixed(3), r.position.z.toFixed(3), r.quaternion.x.toFixed(4), r.quaternion.y.toFixed(4), r.quaternion.z.toFixed(4), r.quaternion.w.toFixed(4),
    errPx === null ? '' : errPx.toFixed(1), errM === null ? '' : errM.toFixed(3), gt ? gt.p.x.toFixed(3) : '', gt ? gt.p.y.toFixed(3) : '', gt ? gt.p.z.toFixed(3) : '']);

  drawOverlay(px, r.lost);
  const st = $('h-state'); st.className = r.lost ? (r.fallback ? 'init' : 'lost') : 'ok';
  st.textContent = r.lost ? (r.fallback ? 'lost→gyro' : 'lost') : `tracking${r.points !== undefined ? ' ' + r.points + 'pt' : ''}`;
  $('h-ms').textContent = `update ${ms.toFixed(1)} ms`;
  $('h-dist').textContent = `이동 ${S.dist.toFixed(2)} m`;
  $('h-drift').textContent = `밀림 ${driftPx === null ? '-' : driftPx.toFixed(0)} px / ${driftM === null ? '-' : driftM.toFixed(2)} m`;
  const now = performance.now(); if (now - S.fpsT > 1000) { $('h-fps').textContent = `FPS ${(S.fpsN * 1000 / (now - S.fpsT)).toFixed(1)}`; S.fpsT = now; S.fpsN = 0; }
}

function summarize() {
  const ms = S.ms; const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const col = (i) => S.rows.map((r) => r[i]).filter((v) => v !== '').map(Number);
  const dur = S.rows.length ? +S.rows[S.rows.length - 1][0] : 0;
  const errPx = col(16), errM = col(17);
  const sum = {
    at: new Date().toISOString(), tracker: trackerId, scenario: S.scenario, source: source.kind, step: STEP,
    device: deviceInfo(),
    duration_s: +dur.toFixed(2), frames: S.frames, fps_avg: dur > 0 ? +(S.frames / dur).toFixed(1) : null,
    update_ms_avg: +avg(ms).toFixed(2), update_ms_max: +Math.max(...ms).toFixed(2),
    lost_frames: S.lost, lost_ratio: +(S.lost / Math.max(1, S.frames)).toFixed(3),
    drift_px_max: Math.max(0, ...col(7)), drift_px_end: col(7).length ? col(7)[col(7).length - 1] : null,
    drift_m_max: Math.max(0, ...col(8)), drift_m_end: col(8).length ? col(8)[col(8).length - 1] : null,
    path_m: +S.dist.toFixed(3),
    err_px_avg: errPx.length ? +avg(errPx).toFixed(1) : null, err_px_max: errPx.length ? +Math.max(...errPx).toFixed(1) : null,
    err_m_avg: errM.length ? +avg(errM).toFixed(3) : null, err_m_max: errM.length ? +Math.max(...errM).toFixed(3) : null,
    gt: !!imu.gt,
  };
  // 단안 SLAM 스케일 추정: 추적 경로 길이 / 정답 경로 길이 (정답이 있을 때만)
  if (imu.gt && imu.gt.length > 1) {
    let gtLen = 0; for (let i = 1; i < imu.gt.length; i++) gtLen += new THREE.Vector3().fromArray(imu.gt[i].p).distanceTo(new THREE.Vector3().fromArray(imu.gt[i - 1].p));
    sum.gt_path_m = +gtLen.toFixed(3);
    sum.scale_est = gtLen > 0.05 && S.dist > 0 ? +(gtLen / S.dist).toFixed(3) : null;
  }
  return sum;
}

function endSession() {
  S.running = false;
  const sum = summarize();
  $('summary').textContent = JSON.stringify(sum, null, 2); $('summary').classList.add('show');
  log(`■ 세션 끝: ${S.frames}프레임, 평균 ${sum.update_ms_avg}ms, lost ${S.lost}, 밀림 최대 ${sum.drift_px_max}px / ${sum.drift_m_max}m`);
  ['btn-csv', 'btn-json', 'btn-ga'].forEach((id) => { $(id).disabled = false; });
  window.__LAB_RESULT = { summary: sum, csv: [CSV_HEAD, ...S.rows.map((r) => r.join(','))].join('\n'), imu: imu.log };
  window.dispatchEvent(new CustomEvent('lab:done'));
  return sum;
}

/* ---------- GA4 (lookdown.js:28 track()와 같은 형식) ---------- */
const track = (name, params) => window.gtag && window.gtag('event', name, params);
export function sendSummaryToGA(sum) {
  // GA4 이벤트 파라미터는 25개 이하, 값은 100자 이하. 기기 문자열은 잘라 보낸다.
  const p = {
    tracker: sum.tracker, scenario: sum.scenario, source: sum.source,
    fps_avg: sum.fps_avg, update_ms_avg: sum.update_ms_avg, lost_frames: sum.lost_frames, lost_ratio: sum.lost_ratio,
    drift_px_max: sum.drift_px_max, drift_m_max: +(+sum.drift_m_max).toFixed(3), path_m: sum.path_m, frames: sum.frames, duration_s: sum.duration_s,
    gpu: String(sum.device.gpu || '').slice(0, 100), platform: String(sum.device.platform || '').slice(0, 100), screen: sum.device.screen, frame: sum.device.frame,
  };
  track('lookdown_lab_summary', p);
  return p;
}

/* ---------- 다운로드 ---------- */
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => `${trackerId}-${S.scenario}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
$('btn-csv').addEventListener('click', () => download(`lab-${stamp()}.csv`, window.__LAB_RESULT.csv, 'text/csv'));
$('btn-json').addEventListener('click', () => download(`lab-${stamp()}.json`, JSON.stringify(window.__LAB_RESULT.summary, null, 2), 'application/json'));
$('btn-ga').addEventListener('click', () => { const p = sendSummaryToGA(window.__LAB_RESULT.summary); log('GA4 → lookdown_lab_summary ' + JSON.stringify(p)); });

/* ---------- 루프 ---------- */
let raf = 0, liveT0 = 0;
function liveLoop() {
  if (!S.running) return;
  onFrame((performance.now() - liveT0) / 1000);
  raf = requestAnimationFrame(liveLoop);
}
async function replay() {
  beginSession(S.scenario);
  video.pause(); video.currentTime = 0;
  await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
  if (STEP) {
    const dt = 1 / (+q.get('fps') || 30);
    while (video.currentTime + dt <= video.duration - 1e-3) {
      onFrame(video.currentTime);
      video.currentTime = Math.min(video.duration, video.currentTime + dt);
      await new Promise((r) => video.addEventListener('seeked', r, { once: true }));
    }
    onFrame(video.currentTime);
  } else {
    await video.play();
    await new Promise((resolve) => {
      const tick = () => { if (video.ended || video.paused) return resolve(); onFrame(video.currentTime); raf = requestAnimationFrame(tick); };
      tick();
    });
  }
  return endSession();
}

/* ---------- 시나리오 기록 (라이브 카메라) ---------- */
let stopTimer = 0;
function startScenario(label) {
  if (source.kind !== 'camera') return;
  beginSession(label);
  S.chunks = [];
  try {
    S.recorder = new MediaRecorder(source.stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : '' });
    S.recorder.ondataavailable = (e) => { if (e.data.size) S.chunks.push(e.data); };
    S.recorder.start(500);
  } catch (e) { log('MediaRecorder 불가: ' + e.message + ' (영상 없이 측정만 기록)'); S.recorder = null; }
  liveT0 = performance.now(); liveLoop();
  ['btn-a', 'btn-b', 'btn-c'].forEach((id) => { $(id).disabled = true; }); $('btn-stop').disabled = false;
  const len = SCENARIO_LEN[label] || 10; let left = len;
  $('h-rec').textContent = `● REC ${left}s`;
  stopTimer = setInterval(() => { left--; $('h-rec').textContent = `● REC ${left}s`; if (left <= 0) stopScenario(); }, 1000);
}
function stopScenario() {
  clearInterval(stopTimer); cancelAnimationFrame(raf); $('h-rec').textContent = '';
  ['btn-a', 'btn-b', 'btn-c'].forEach((id) => { $(id).disabled = false; }); $('btn-stop').disabled = true;
  const sum = endSession();
  if (S.recorder && S.recorder.state !== 'inactive') {
    S.recorder.onstop = () => {
      download(`scenario-${sum.scenario}-${stamp()}.webm`, new Blob(S.chunks, { type: 'video/webm' }), 'video/webm');
      download(`scenario-${sum.scenario}-${stamp()}.json`, JSON.stringify({ scenario: sum.scenario, fov: FOV, eye: EYE, frame: [W, H], device: sum.device, samples: imu.log }, null, 0), 'application/json');
    };
    S.recorder.stop();
  }
}
['a', 'b', 'c'].forEach((k) => $('btn-' + k).addEventListener('click', () => startScenario(k)));
$('btn-stop').addEventListener('click', stopScenario);

/* ---------- 시작 ---------- */
let pendingVideo = null, pendingImu = null;
$('file-video').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) { pendingVideo = URL.createObjectURL(f); log('영상: ' + f.name); $('btn-play').disabled = false; } });
$('file-imu').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { await loadImu(JSON.parse(await f.text())); log('IMU: ' + f.name); } });
async function loadImu(json) { imu.samples = json.samples || null; imu.gt = json.gt || null; if (json.scenario) S.scenario = json.scenario; }

$('btn-start').addEventListener('click', async () => {
  $('btn-start').disabled = true;
  trackerId = $('sel-tracker').value;
  try {
    const motion = await requestMotion();
    log('센서 권한: ' + motion);
    tracker = await makeTracker(trackerId);
    if (q.get('video')) { await openVideo(q.get('video')); if (q.get('imu')) await loadImu(await (await fetch(q.get('imu'))).json()); $('btn-play').disabled = false; }
    else if (pendingVideo) { await openVideo(pendingVideo); $('btn-play').disabled = false; }
    else { await openCamera(); ['btn-a', 'btn-b', 'btn-c'].forEach((id) => { $(id).disabled = false; }); }
    $('btn-reset').disabled = false;
    log(`준비됨: ${source.kind} ${video.videoWidth}x${video.videoHeight} → 처리 ${W}x${H}, fov ${FOV}`);
    log('기기: ' + JSON.stringify(deviceInfo()));
    if (AUTO && source.kind === 'video') await replay();
  } catch (e) { log('오류: ' + (e.message || e)); console.error(e); $('btn-start').disabled = false; }
});
$('btn-play').addEventListener('click', async () => { if (pendingVideo && source.kind !== 'video') await openVideo(pendingVideo); await replay(); });
$('btn-reset').addEventListener('click', () => { tracker.reset(); S.marker = null; S.startPx = null; log('추적 리셋'); });

if (AUTO) $('btn-start').click();
