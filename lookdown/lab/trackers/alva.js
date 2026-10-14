// AlvaAR(단안 SLAM, GPLv3, lab/vendor/alvaar/) 추적기.
//   - alva.findCameraPose(imageData) → 4x4 열우선 행렬(회전 r, 이동 t) 또는 null(초기화 중/추적 실패)
//   - three.js 좌표로 바꾸는 식은 vendor/alvaar/alva_ar_three.js의 AlvaARConnectorTHREE와 같다:
//       quaternion = (-r.x, r.y, r.z, r.w), position = (t.x, -t.y, -t.z)
//   - 바닥 평면은 "첫 포즈 때 카메라 높이 = eye(1.4m)" 가정으로 y=0에 둔다. 단안 SLAM이라 이동량의 절대 스케일은
//     알 수 없으므로 scale 옵션(기본 1 = SLAM 단위 그대로)으로 곱한다. 하네스는 정답 경로(gt)가 있으면 scale을 추정해 보고한다.
//   - 첫 포즈의 회전은 IMU가 있으면 IMU 쿼터니언에, 없으면 단위 쿼터니언에 맞춘다(세계 '위' 방향을 중력에 맞추기 위함).
//   - useFallback: lost일 때 회전은 자이로(GyroTracker)로, 위치는 마지막 값으로 유지한다.
import * as THREE from 'three';
import { AlvaAR } from '../vendor/alvaar/alva_ar.js';
import { GyroTracker } from './gyro.js';

export class AlvaTracker {
  static id = 'alva';
  constructor({ eye = 1.4, fov = 67, scale = 1, useFallback = false, minPoints = 0 } = {}) {
    this.eye = eye; this.fov = fov; this.scale = scale; this.useFallback = useFallback; this.minPoints = minPoints;
    this.gyro = new GyroTracker({ eye });
    this.position = new THREE.Vector3(0, eye, 0);
    this.quaternion = new THREE.Quaternion();
    this.raw = { q: new THREE.Quaternion(), t: new THREE.Vector3() };   // 변환 전 SLAM 포즈
    this.origin = null;                                                  // { q0inv, t0, align }
    this.m = new THREE.Matrix4();
    this.eyeVec = new THREE.Vector3(0, eye, 0);
    this.lastPoints = 0;
    this.poses = 0;
  }
  async init(width, height) {
    this.width = width; this.height = height;
    this.alva = await AlvaAR.Initialize(width, height, this.fov);
    return this;
  }
  update(imageData, imuQuat, t) {
    if (imuQuat) this.gyro.update(null, imuQuat, t);
    const t0 = performance.now();
    const pose = imageData ? this.alva.findCameraPose(imageData) : null;
    this.lastMs = performance.now() - t0;
    if (!pose) return this._lost(imuQuat);

    this.m.fromArray(pose);
    const r = new THREE.Quaternion().setFromRotationMatrix(this.m);
    this.raw.q.set(-r.x, r.y, r.z, r.w);
    this.raw.t.set(pose[12], -pose[13], -pose[14]);

    if (!this.origin) {
      // 첫 포즈: 이 자세를 "눈높이 1.4m, IMU가 말하는 방향(없으면 정면)"에 맞춘다.
      const q0inv = this.raw.q.clone().invert();
      const align = (imuQuat ? imuQuat.clone() : new THREE.Quaternion()).multiply(q0inv);
      this.origin = { q0inv, t0: this.raw.t.clone(), align };
    }
    const { align, t0: tt0 } = this.origin;
    this.quaternion.copy(align).multiply(this.raw.q);
    this.position.copy(this.raw.t).sub(tt0).applyQuaternion(align).multiplyScalar(this.scale).add(this.eyeVec);

    const pts = this.alva.getFramePoints();
    this.lastPoints = pts.length;
    this.poses++;
    const confidence = Math.min(1, pts.length / 100);
    if (pts.length < this.minPoints) return this._lost(imuQuat);
    return { position: this.position, quaternion: this.quaternion, confidence, lost: false, points: pts.length };
  }
  _lost(imuQuat) {
    if (this.useFallback && imuQuat) {
      // 회전은 자이로, 위치는 마지막 SLAM 값
      this.quaternion.copy(imuQuat);
      return { position: this.position, quaternion: this.quaternion, confidence: 0, lost: true, fallback: true };
    }
    return { position: this.position, quaternion: this.quaternion, confidence: 0, lost: true };
  }
  reset() { this.alva.reset(); this.origin = null; this.poses = 0; }
}
