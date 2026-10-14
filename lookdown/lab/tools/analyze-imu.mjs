// 실기기에서 기록한 IMU JSON(scenario-*.json)만으로 잴 수 있는 것: 자이로 드리프트와 회전 통계.
//   node tools/analyze-imu.mjs results/device/*.json
// 시작 자세로 돌아오는 시나리오에서 끝 쿼터니언과 시작 쿼터니언의 차이(각도)가 자이로 드리프트 + 사람의 복귀 오차다.
// 마커 밀림(px)은 그 회전 차이를 화각(세로 67°, 480px)으로 환산한 값: px ≈ 각도 × (480 / 67).
import * as THREE from '../../../assets/vendor/three-0.160.0/three.module.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rad2deg = 180 / Math.PI;
const fwd = (q) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);
const yawOf = (q) => { const f = fwd(q); return Math.atan2(-f.x, -f.z); };
const pitchOf = (q) => Math.asin(THREE.MathUtils.clamp(fwd(q).y, -1, 1));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const rows = [];
for (const file of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  const s = j.samples;
  if (!s || s.length < 2) { console.log(file, 'samples 없음'); continue; }
  const qs = s.map((x) => new THREE.Quaternion().fromArray(x.q).normalize());
  // q와 -q는 같은 회전: 앞 샘플과 부호를 맞춘다
  for (let i = 1; i < qs.length; i++) if (qs[i].dot(qs[i - 1]) < 0) qs[i].set(-qs[i].x, -qs[i].y, -qs[i].z, -qs[i].w);
  const dur = s[s.length - 1].t - s[0].t;
  const rate = (s.length - 1) / dur;
  const q0 = qs[0], q1 = qs[qs.length - 1];
  const endAngle = q0.angleTo(q1) * rad2deg;
  const yawErr = wrap(yawOf(q1) - yawOf(q0)) * rad2deg;
  let yawTravel = 0; const pitches = [];
  for (let i = 1; i < qs.length; i++) { yawTravel += Math.abs(wrap(yawOf(qs[i]) - yawOf(qs[i - 1]))) * rad2deg; pitches.push(pitchOf(qs[i]) * rad2deg); }
  // 마지막 1초 평균 자세 vs 처음 1초 평균 자세(손떨림을 눌러서)
  const first = qs.filter((_, i) => s[i].t - s[0].t < 1), last = qs.filter((_, i) => s[s.length - 1].t - s[i].t < 1);
  const avgQ = (arr) => { const a = arr[0].clone(); for (let i = 1; i < arr.length; i++) a.slerp(arr[i], 1 / (i + 1)); return a; };
  const settled = avgQ(first).angleTo(avgQ(last)) * rad2deg;
  const gaps = []; for (let i = 1; i < s.length; i++) gaps.push(s[i].t - s[i - 1].t);
  rows.push({
    file: path.basename(file), scenario: j.scenario, device: (j.device?.ua || '').match(/iPhone OS [\d_]+|Android [\d.]+/)?.[0] || j.device?.platform,
    inapp: /INAPP|Instagram|KAKAOTALK/i.test(j.device?.ua || ''), dur_s: +dur.toFixed(2), samples: s.length, rate_hz: +rate.toFixed(1), max_gap_ms: +(Math.max(...gaps) * 1000).toFixed(0),
    yaw_travel_deg: +yawTravel.toFixed(0), pitch_min: +Math.min(...pitches).toFixed(1), pitch_max: +Math.max(...pitches).toFixed(1),
    end_vs_start_deg: +endAngle.toFixed(2), end_vs_start_settled_deg: +settled.toFixed(2), yaw_err_deg: +yawErr.toFixed(2), px_equiv: +(settled * 480 / 67).toFixed(0),
  });
}
console.log('| 파일 | scn | 기기 | 앱내 | 길이 s | 샘플 | Hz | 최대 공백 ms | yaw 누적 ° | pitch min/max ° | 끝-시작 각도 ° (1초 평균) | yaw 오차 ° | px 환산 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.file} | ${r.scenario} | ${r.device} | ${r.inapp ? '예' : '아니오'} | ${r.dur_s} | ${r.samples} | ${r.rate_hz} | ${r.max_gap_ms} | ${r.yaw_travel_deg} | ${r.pitch_min} / ${r.pitch_max} | ${r.end_vs_start_settled_deg} (순간 ${r.end_vs_start_deg}) | ${r.yaw_err_deg} | ${r.px_equiv} |`);
