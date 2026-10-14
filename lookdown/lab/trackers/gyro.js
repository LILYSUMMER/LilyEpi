// 기준선 추적기: lookdown/lookdown.js의 방식을 그대로 감쌌다.
//   자이로 3DoF(회전만) + 눈높이 EYE=1.4m 고정 + floorPoint(앞 방향과 y=0 평면의 교점, 0.7~2.6m 클램프)
// 원본: lookdown/lookdown.js:14 EYE, :162-166 deviceQuat(), :518-523 updateCamera(), :526-530 floorPoint()
// 이동(translation)은 전혀 추정하지 않으므로 position은 항상 (0, EYE, 0)이다. 그것이 '현재 상태'의 측정값이다.
import * as THREE from 'three';

export class GyroTracker {
  static id = 'gyro';
  constructor({ eye = 1.4, near = 0.7, far = 2.6 } = {}) {
    this.eye = eye; this.near = near; this.far = far;
    this.position = new THREE.Vector3(0, eye, 0);
    this.quaternion = new THREE.Quaternion();
    this.forward = new THREE.Vector3();
  }
  async init(/* width, height */) { return this; }
  // imuQuat: 하네스가 deviceorientation을 뒤 카메라 기준 쿼터니언으로 바꿔 준 값(lookdown.js deviceQuat와 동일). 없으면 lost.
  update(_imageData, imuQuat, _t) {
    if (!imuQuat) return { position: this.position, quaternion: this.quaternion, confidence: 0, lost: true };
    this.quaternion.copy(imuQuat);
    return { position: this.position, quaternion: this.quaternion, confidence: 1, lost: false };
  }
  // lookdown.js:526-530과 같은 식. dir은 월드 좌표의 카메라 앞 방향.
  floorPoint(dir, out = new THREE.Vector3()) {
    if (dir.y > -0.08) return null;
    const d = THREE.MathUtils.clamp(this.eye / -dir.y, this.near, this.far);
    return out.copy(this.position).addScaledVector(dir, d);
  }
  reset() {}
}
