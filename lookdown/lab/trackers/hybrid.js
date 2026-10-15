// 하이브리드 추적기: 회전은 전부 자이로, 이동은 바닥 광류에서만. (설계: trackers/hybrid-plan.md)
//
//   입력 프레임을 320×240 그레이로 줄이고, 자이로 pitch로 잡은 바닥 ROI(0.5~3 m 행) 안에서 FAST 코너를 최대 60개 뽑아
//   피라미드 LK로 프레임 간 추적한다(jsfeat, MIT, vendor/jsfeat/).
//   1) 회전 보상: 두 프레임의 자이로 차이 ΔR로 "회전만으로 생겼을 자리" p_rot = K·ΔR·K⁻¹·p 를 계산해 뺀다.
//   2) 바닥 역투영: 이전 점은 (R_prev, h_prev)로, 현재 점은 (R_cur, h_cur)로 y=0 평면에 올린다.
//      바닥 점은 고정이므로  P_prev_i = ΔC + h_cur·s_i  (s_i = 현재 점의 방향을 바닥에 내린 단위 높이당 좌표).
//      미지수 ΔC(수평 이동 2개)와 h_cur(높이 1개)를 2점 RANSAC + 인라이어 최소제곱으로 푼다.
//      벽·상자 위의 점은 이 식을 만족하지 않아 이상치로 떨어진다. 쪼그리기는 h_cur 변화로 나온다.
//   3) 안정화: 점프 거부, ZUPT(정지 감지), 속도 상보 필터, lost 3프레임이면 자이로 전용 폴백.
//
// 인터페이스: init(width, height) / update(imageData, imuQuat, t) → { position, quaternion, confidence, lost, debug }
// stage 옵션(1~4)으로 단계별 동작만 켜서 측정할 수 있다. 1 특징점·추적, 2 +회전 보상, 3 +이동·높이 추정(필터 없음), 4 전부.
import * as THREE from 'three';
import '../vendor/jsfeat/jsfeat-min.js';

// 임계값 전부. 값·의미는 lab/RESULTS.md '하이브리드' 절의 표와 같아야 한다.
export const HYBRID_PARAMS = {
  procW: 320, procH: 240,     // 처리 해상도
  fov: 67,                    // 세로 화각(deg). lookdown.js CAMERA_FOV
  eye: 1.4,                   // 시작 카메라 높이 h (m)
  maxFeatures: 60, minFeatures: 30, fastThreshold: 20, gridCols: 8, gridRows: 5, border: 8,
  roiNear: 0.5, roiFar: 3.0,  // 바닥 ROI: 카메라에서 이 거리 범위에 해당하는 행만
  lkWin: 15, lkIter: 20, lkEps: 0.01, lkMinEigen: 0.001, maxFlowPx: 40,   // LK 창·반복·허용 흐름
  ransacIters: 40, inlierThr: 0.03, minInliers: 8,   // 바닥 좌표(m) 기준 인라이어 임계
  maxStepM: 0.15, maxDhStep: 0.15, hMin: 0.3, hMax: 2.5,   // 프레임당 점프 거부, 높이 범위
  zuptFlowPx: 0.3, zuptRateDeg: 3, zuptHold: 0.3,    // 정지 감지: 잔여 흐름 중앙값·각속도·지속 시간
  alphaV: 0.5, alphaH: 0.3,   // 속도·높이 상보 필터 (이전 값 비중)
  lostFallback: 3,            // 연속 lost가 이 수 이상이면 자이로 전용 폴백
};

const J = window.jsfeat;

export class HybridTracker {
  static id = 'hybrid';
  constructor(opts = {}) {
    this.p = { ...HYBRID_PARAMS, ...opts };
    this.stage = opts.stage || 4;
    this.position = new THREE.Vector3(0, this.p.eye, 0);
    this.quaternion = new THREE.Quaternion();
    this.vel = new THREE.Vector2(0, 0);
    this.h = this.p.eye;
    this.prev = null;           // { pyr, xy(Float32Array), n, q, h, t }
    this.lostCount = 0;
    this.stillSince = null;
    this.frames = 0;
  }
  async init(width, height) {
    this.inW = width; this.inH = height;
    const { procW, procH, fov } = this.p;
    // 입력 → 처리 해상도 축소 단계 수(2배씩)
    this.levels = 0; let w = width; while (w > procW) { w = Math.round(w / 2); this.levels++; }
    this.W = Math.round(width / 2 ** this.levels); this.H = Math.round(height / 2 ** this.levels);
    this.fy = (this.H / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)); this.fx = this.fy;
    this.cx = this.W / 2; this.cy = this.H / 2;
    this.grayIn = new J.matrix_t(width, height, J.U8C1_t);
    this.scratch = [];
    for (let i = 1; i <= this.levels; i++) this.scratch.push(new J.matrix_t(Math.round(width / 2 ** i), Math.round(height / 2 ** i), J.U8C1_t));
    this.pyrA = new J.pyramid_t(3); this.pyrA.allocate(this.W, this.H, J.U8C1_t);
    this.pyrB = new J.pyramid_t(3); this.pyrB.allocate(this.W, this.H, J.U8C1_t);
    this.corners = []; for (let i = 0; i < this.W * this.H / 4; i++) this.corners.push(new J.keypoint_t(0, 0, 0, 0));
    J.fast_corners.set_threshold(this.p.fastThreshold);
    this.curXY = new Float32Array(this.p.maxFeatures * 2);
    this.status = new Uint8Array(this.p.maxFeatures);
    return this;
  }

  // ---- 기하 ----
  rayCam(u, v, out) { return out.set((u - this.cx) / this.fx, -(v - this.cy) / this.fy, -1); }
  projCam(d) { const iz = -1 / d.z; return { u: this.cx + this.fx * d.x * iz, v: this.cy - this.fy * d.y * iz }; }
  // 자이로 pitch에서 바닥 ROI 행 범위. 가운데 열 기준으로, 바닥까지의 수평 거리가 [roiNear, roiFar]인 행.
  floorRows(q, h) {
    let vmin = -1, vmax = -1; const d = new THREE.Vector3();
    for (let v = 0; v < this.H; v++) {
      this.rayCam(this.cx, v + 0.5, d).applyQuaternion(q);
      if (d.y >= -1e-3) continue;
      const dist = h * Math.hypot(d.x, d.z) / -d.y;
      if (dist >= this.p.roiNear && dist <= this.p.roiFar) { if (vmin < 0) vmin = v; vmax = v; }
    }
    return vmin < 0 ? null : [vmin, vmax];
  }
  // 픽셀 → (방향을 바닥에 내린 단위 높이당 좌표 s). 바닥 점 = h·s (카메라 발밑 기준 월드 xz). d.y ≥ -0.05면 null.
  floorDir(u, v, q, out) {
    const d = this.rayCam(u, v, new THREE.Vector3()).applyQuaternion(q);
    if (d.y > -0.05) return null;
    return out.set(d.x / -d.y, d.z / -d.y);
  }

  // ---- 특징점 ----
  detect(img, q, h) {
    const rows = this.floorRows(q, h);
    if (!rows) return 0;
    const n = J.fast_corners.detect(img, this.corners, this.p.border);
    const { gridCols, gridRows, maxFeatures } = this.p;
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      const c = this.corners[i];
      if (c.y < rows[0] || c.y > rows[1]) continue;
      const key = Math.floor(c.x / this.W * gridCols) + ',' + Math.floor((c.y - rows[0]) / (rows[1] - rows[0] + 1) * gridRows);
      const b = cells.get(key); if (!b) cells.set(key, []); (b || cells.get(key)).push(c);
    }
    // 칸마다 점수 순으로 돌아가며 뽑아 고르게 퍼뜨린다
    const buckets = [...cells.values()].map((b) => b.sort((a, c) => c.score - a.score));
    const out = []; let k = 0;
    while (out.length < maxFeatures && buckets.some((b) => b.length > k)) { for (const b of buckets) if (b.length > k && out.length < maxFeatures) out.push(b[k]); k++; }
    const xy = new Float32Array(maxFeatures * 2);
    out.forEach((c, i) => { xy[i * 2] = c.x; xy[i * 2 + 1] = c.y; });
    return { xy, n: out.length, rows };
  }

  // ---- 메인 ----
  update(imageData, imuQuat, t) {
    const T0 = performance.now();
    if (!imuQuat || !imageData) return this._out(true, { tracked: 0, inliers: 0 });
    this.quaternion.copy(imuQuat);
    const q = imuQuat.clone();

    // 그레이 + 축소
    J.imgproc.grayscale(imageData.data, this.inW, this.inH, this.grayIn, J.COLOR_RGBA2GRAY);
    let img = this.grayIn;
    for (let i = 0; i < this.levels; i++) { J.imgproc.pyrdown(img, this.scratch[i]); img = this.scratch[i]; }
    const pyr = this.frames % 2 === 0 ? this.pyrA : this.pyrB;
    pyr.data[0].data.set(img.data); pyr.build(pyr.data[0], true);
    this.frames++;
    const tPre = performance.now() - T0;

    const dbg = { tracked: 0, inliers: 0, resid_px: 0, raw_px: 0, h: this.h, dc_m: 0, zupt: 0, redetect: 0, ms_pre: tPre, ms_lk: 0, ms_solve: 0 };
    let lost = false;
    if (this.prev && this.prev.n >= 3) {
      const pr = this.prev, n = pr.n;
      const tLk = performance.now();
      J.optical_flow_lk.track(pr.pyr, pyr, pr.xy, this.curXY, n, this.p.lkWin, this.p.lkIter, this.status, this.p.lkEps, this.p.lkMinEigen);
      dbg.ms_lk = performance.now() - tLk;
      const tS = performance.now();
      const dt = Math.max(1e-3, t - pr.t);
      // 회전 보상용 ΔR: 이전 카메라 방향 → 현재 카메라 방향
      const qPrevInv = pr.q.clone().invert();
      const dR = q.clone().invert().multiply(pr.q);   // d_cur = R_curᵀ·R_prev·d_prev
      const obs = [];        // { P: 이전 바닥 점(h_prev 기준, 월드 xz), s: 현재 방향의 단위 높이 좌표 }
      const resid = [], raw = [];
      const d = new THREE.Vector3(), P = new THREE.Vector2(), s = new THREE.Vector2();
      let tracked = 0;
      const keepXY = new Float32Array(this.p.maxFeatures * 2); let keep = 0;
      for (let i = 0; i < n; i++) {
        if (!this.status[i]) continue;
        const u0 = pr.xy[i * 2], v0 = pr.xy[i * 2 + 1], u1 = this.curXY[i * 2], v1 = this.curXY[i * 2 + 1];
        if (u1 < this.p.border || v1 < this.p.border || u1 >= this.W - this.p.border || v1 >= this.H - this.p.border) continue;
        const flow = Math.hypot(u1 - u0, v1 - v0);
        if (flow > this.p.maxFlowPx) continue;
        tracked++;
        raw.push(flow);
        keepXY[keep * 2] = u1; keepXY[keep * 2 + 1] = v1; keep++;
        if (this.stage >= 2) {
          // 회전만으로 생겼을 자리
          this.rayCam(u0, v0, d).applyQuaternion(dR);
          if (d.z < -1e-3) { const pr2 = this.projCam(d); resid.push(Math.hypot(u1 - pr2.u, v1 - pr2.v)); }
        }
        if (this.stage >= 3) {
          const sp = this.floorDir(u0, v0, pr.q, P); const sc = this.floorDir(u1, v1, q, s);
          if (sp && sc) obs.push({ P: sp.clone().multiplyScalar(pr.h), s: sc.clone() });
        }
      }
      dbg.tracked = tracked;
      dbg.raw_px = median(raw);
      dbg.resid_px = this.stage >= 2 ? median(resid) : median(raw);

      let dc = null, hNew = this.h, inl = 0;
      if (this.stage >= 3) {
        const sol = this.solve(obs);
        if (sol) { dc = sol.dc; hNew = sol.h; inl = sol.inliers; }
        else lost = true;
      }
      dbg.inliers = inl;

      // 각속도 (deg/s)
      const rate = THREE.MathUtils.radToDeg(pr.q.angleTo(q)) / dt;

      if (this.stage >= 4 && dc) {
        // 점프 거부
        if (dc.length() > this.p.maxStepM) { dc = null; lost = true; }
        else {
          // 높이: 범위·점프 검사, 상보 필터
          if (Math.abs(hNew - this.h) > this.p.maxDhStep || hNew < this.p.hMin || hNew > this.p.hMax) hNew = this.h;
          this.h = this.p.alphaH * this.h + (1 - this.p.alphaH) * hNew;
          // ZUPT: 잔여 흐름도 작고 각속도도 작으면 정지
          const still = dbg.resid_px < this.p.zuptFlowPx && rate < this.p.zuptRateDeg;
          if (still) { if (this.stillSince === null) this.stillSince = t; } else this.stillSince = null;
          const zupt = this.stillSince !== null && t - this.stillSince >= this.p.zuptHold;
          dbg.zupt = zupt ? 1 : 0;
          if (zupt) { this.vel.set(0, 0); }
          else {
            const v = dc.clone().divideScalar(dt);
            this.vel.multiplyScalar(this.p.alphaV).addScaledVector(v, 1 - this.p.alphaV);
          }
          this.position.x += this.vel.x * dt; this.position.z += this.vel.y * dt;
          this.position.y = this.h;
          dbg.dc_m = dc.length();
        }
      } else if (this.stage === 3 && dc) {
        // 필터 없이 그대로 적분 (단계 검증용)
        this.h = THREE.MathUtils.clamp(hNew, this.p.hMin, this.p.hMax);
        this.position.x += dc.x; this.position.z += dc.y; this.position.y = this.h;
        dbg.dc_m = dc.length();
      }
      dbg.h = this.h;
      dbg.ms_solve = performance.now() - tS;

      // 다음 프레임용 점: 추적 성공한 점을 이어 쓰고, 모자라면 다시 뽑는다
      if (keep >= this.p.minFeatures) this.prev = { pyr, xy: keepXY, n: keep, q, h: this.h, t };
      else { const det = this.detect(img, q, this.h); this.prev = det ? { pyr, xy: det.xy, n: det.n, q, h: this.h, t } : null; dbg.redetect = 1; }
    } else {
      const det = this.detect(img, q, this.h);
      this.prev = det ? { pyr, xy: det.xy, n: det.n, q, h: this.h, t } : null;
      dbg.redetect = 1;
      lost = this.stage >= 3;   // 첫 프레임은 이동을 알 수 없다
    }
    this.lostCount = lost ? this.lostCount + 1 : 0;
    dbg.ms_total = performance.now() - T0;
    return this._out(lost, dbg);
  }

  // P_i = dc + h·s_i 를 2점 RANSAC + 인라이어 최소제곱으로 푼다
  solve(obs) {
    const m = obs.length; if (m < this.p.minInliers) return null;
    const thr = this.p.inlierThr;
    let best = null;
    const fit = (idx) => {
      // 최소제곱: h = Σ(P−P̄)·(s−s̄) / Σ|s−s̄|², dc = P̄ − h·s̄
      let Px = 0, Pz = 0, sx = 0, sz = 0;
      for (const i of idx) { Px += obs[i].P.x; Pz += obs[i].P.y; sx += obs[i].s.x; sz += obs[i].s.y; }
      Px /= idx.length; Pz /= idx.length; sx /= idx.length; sz /= idx.length;
      let num = 0, den = 0;
      for (const i of idx) { const dsx = obs[i].s.x - sx, dsz = obs[i].s.y - sz; num += (obs[i].P.x - Px) * dsx + (obs[i].P.y - Pz) * dsz; den += dsx * dsx + dsz * dsz; }
      let h = den > 1e-6 ? num / den : this.h;
      if (!(h > this.p.hMin && h < this.p.hMax)) h = this.h;
      return { h, dc: new THREE.Vector2(Px - h * sx, Pz - h * sz) };
    };
    const inliersOf = (mdl) => { const r = []; for (let i = 0; i < m; i++) { const ex = obs[i].P.x - mdl.dc.x - mdl.h * obs[i].s.x, ez = obs[i].P.y - mdl.dc.y - mdl.h * obs[i].s.y; if (ex * ex + ez * ez < thr * thr) r.push(i); } return r; };
    for (let it = 0; it < this.p.ransacIters; it++) {
      const a = (Math.random() * m) | 0; let b = (Math.random() * m) | 0; if (b === a) b = (a + 1) % m;
      const mdl = fit([a, b]); const inl = inliersOf(mdl);
      if (!best || inl.length > best.inl.length) best = { mdl, inl };
    }
    if (!best || best.inl.length < this.p.minInliers) return null;
    const refined = fit(best.inl); const inl = inliersOf(refined);
    return { dc: refined.dc, h: refined.h, inliers: inl.length };
  }

  _out(lost, dbg) {
    const fallback = lost && this.lostCount >= this.p.lostFallback;
    const conf = dbg.tracked ? dbg.inliers / dbg.tracked : 0;
    return { position: this.position, quaternion: this.quaternion, confidence: lost ? 0 : conf, lost, fallback, points: dbg.tracked, debug: dbg };
  }
  reset() { this.prev = null; this.vel.set(0, 0); this.h = this.p.eye; this.position.set(0, this.h, 0); this.lostCount = 0; this.stillSince = null; }
}

function median(a) { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; }
