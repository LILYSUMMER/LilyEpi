#!/usr/bin/env python3
"""합성 시나리오 생성기 — 웹캠·실기기 없이 추적기를 돌려 보기 위한 영상 + IMU + 정답 경로.

바닥은 8m×8m 평면 텍스처(젖은 아스팔트 느낌의 노이즈 + 타일 선 + 얼룩)이고, 카메라는 핀홀 모델
(640×480, 세로 화각 67°, lookdown.js CAMERA_FOV와 동일)이다. 매 프레임 바닥→이미지 호모그래피로 텍스처를 왜곡해
그린다. 바닥 위 물체·벽은 없으므로 실제 거리보다 추적이 쉽다(특징점이 전부 한 평면에 있다). 결과는 상대 비교용이다.

시나리오:
  a  제자리 회전: 10초 동안 yaw 0→360°, 위치 고정 (0, 1.4, 0), pitch −55°
  b  걷기: z 0→−2m (0~5초) 정지 (5~6초) 복귀 (6~11초) 정지 (11~12초). 걸음 흔들림 y ±2cm, yaw ±2°
  c  쪼그리기: y 1.4→0.7 (0~2.5초) 정지 (2.5~4.5초) 복귀 (4.5~7초) 정지 (7~8초). pitch −55°→−45°

출력(lab/data/): <s>.webm (VP8 30fps), <s>.json { scenario, fov, eye, frame, fps, samples:[{t,q}], gt:[{t,p,q}] }
  q = three.js 카메라 쿼터니언 [x,y,z,w] (world-from-camera), p = 카메라 위치 [x,y,z] (m, y가 위, 바닥 y=0)
실행: python3 tools/make-synthetic.py [a|b|c|all]   (PIL, numpy, ffmpeg 필요)
"""
import json, math, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

W, H, FOV, FPS, EYE = 640, 480, 67.0, 30, 1.4
PPM, HALF = 200, 4.0                      # 텍스처 200 px/m, 바닥 −4..4 m
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
fy = (H / 2) / math.tan(math.radians(FOV / 2)); fx = fy; cx, cy = W / 2, H / 2
K_P = np.array([[fx, 0, -cx], [0, -fy, -cy], [0, 0, -1.0]])   # (X,Y,Z)_cam → (u·w, v·w, w), w = −Z

def floor_texture(seed=7):
    rng = np.random.default_rng(seed)
    n = int(2 * HALF * PPM)
    base = rng.normal(0.42, 0.06, (n, n))
    # 큰 얼룩(젖은 자리)과 작은 알갱이
    yy, xx = np.mgrid[0:n, 0:n]
    for _ in range(40):
        x0, y0, r = rng.uniform(0, n), rng.uniform(0, n), rng.uniform(40, 220)
        base -= 0.12 * np.exp(-((xx - x0) ** 2 + (yy - y0) ** 2) / (2 * r * r))
    base += rng.normal(0, 0.05, (n, n))
    # 보도 타일 선 (0.5m 간격)
    tile = int(0.5 * PPM)
    base[(yy % tile) < 3] -= 0.18; base[(xx % tile) < 3] -= 0.18
    # 밝은 점(가로등 반사, 돌)
    for _ in range(900):
        x0, y0 = int(rng.uniform(0, n)), int(rng.uniform(0, n)); s = int(rng.uniform(2, 6))
        base[y0:y0 + s, x0:x0 + s] += rng.uniform(0.15, 0.45)
    img = np.clip(base, 0, 1)
    rgb = np.stack([img * 0.78, img * 0.84, img * 0.95], -1)      # 청회색
    return Image.fromarray((rgb * 255).astype(np.uint8))

def rot_y(a): c, s = math.cos(a), math.sin(a); return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
def rot_x(a): c, s = math.cos(a), math.sin(a); return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
def rot_z(a): c, s = math.cos(a), math.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

def quat_from_R(R):   # [x,y,z,w], three.js 규약
    m = R; t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2; w = s / 4; x = (m[2, 1] - m[1, 2]) / s; y = (m[0, 2] - m[2, 0]) / s; z = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; w = (m[2, 1] - m[1, 2]) / s; x = s / 4; y = (m[0, 1] + m[1, 0]) / s; z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; w = (m[0, 2] - m[2, 0]) / s; x = (m[0, 1] + m[1, 0]) / s; y = s / 4; z = (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; w = (m[1, 0] - m[0, 1]) / s; x = (m[0, 2] + m[2, 0]) / s; y = (m[1, 2] + m[2, 1]) / s; z = s / 4
    return [round(float(v), 6) for v in (x, y, z, w)]

def ease(k): k = min(1, max(0, k)); return k * k * (3 - 2 * k)

def pose(scn, t):
    """(C[3], yaw, pitch, roll) at time t"""
    jitter_y = math.radians(0.4) * math.sin(2 * math.pi * 1.3 * t) + math.radians(0.25) * math.sin(2 * math.pi * 3.1 * t + 1)
    jitter_p = math.radians(0.3) * math.sin(2 * math.pi * 1.7 * t + 2)
    if scn == 'a':
        return np.array([0.0, EYE, 0.0]), 2 * math.pi * (t / 10.0) + jitter_y, math.radians(-55) + jitter_p, math.radians(0.3) * math.sin(2 * t)
    if scn == 'b':
        if t < 5: z = -2.0 * ease(t / 5)
        elif t < 6: z = -2.0
        elif t < 11: z = -2.0 * (1 - ease((t - 6) / 5))
        else: z = 0.0
        moving = (0 <= t < 5) or (6 <= t < 11)
        bob = 0.02 * math.sin(2 * math.pi * 2.0 * t) if moving else 0.0
        return np.array([0.03 * math.sin(2 * math.pi * 1.0 * t) if moving else 0.0, EYE + bob, z]), math.radians(2) * math.sin(2 * math.pi * 1.0 * t) + jitter_y, math.radians(-55) + jitter_p, math.radians(0.5) * math.sin(3 * t)
    if scn == 'c':
        if t < 2.5: k = ease(t / 2.5)
        elif t < 4.5: k = 1.0
        elif t < 7: k = 1 - ease((t - 4.5) / 2.5)
        else: k = 0.0
        return np.array([0.0, EYE - 0.7 * k, 0.05 * k]), jitter_y, math.radians(-55 + 10 * k) + jitter_p, math.radians(0.3) * math.sin(2 * t)
    raise ValueError(scn)

LEN = {'a': 10.0, 'b': 12.0, 'c': 8.0}

def render(scn, tex):
    n = tex.size[0]
    T = np.array([[1 / PPM, 0, -HALF], [0, 1 / PPM, -HALF], [0, 0, 1.0]])        # 텍스처 px → 바닥 (x,z)
    frames = int(LEN[scn] * FPS)
    samples, gt = [], []
    # 하늘(바닥에 안 닿는 픽셀) 마스크용 픽셀 방향
    uu, vv = np.meshgrid(np.arange(W) + 0.5, np.arange(H) + 0.5)
    dcam = np.stack([(uu - cx) / fx, -(vv - cy) / fy, -np.ones_like(uu)], -1)   # H×W×3
    sky = np.zeros((H, W, 3), np.uint8); sky[..., 0] = 14; sky[..., 1] = 24; sky[..., 2] = 36
    tmp = tempfile.mkdtemp()
    for i in range(frames):
        t = i / FPS
        C, yaw, pitch, roll = pose(scn, t)
        R = rot_y(yaw) @ rot_x(pitch) @ rot_z(roll)             # world-from-camera
        Rt = R.T
        M = np.column_stack([Rt[:, 0], Rt[:, 2], -Rt @ C])      # (x,z,1) → X_cam
        Hm = K_P @ M @ T                                        # 텍스처 px → 이미지 px (동차)
        Hinv = np.linalg.inv(Hm); Hinv /= Hinv[2, 2]
        coeffs = [Hinv[0, 0], Hinv[0, 1], Hinv[0, 2], Hinv[1, 0], Hinv[1, 1], Hinv[1, 2], Hinv[2, 0], Hinv[2, 1]]
        img = tex.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BILINEAR)
        arr = np.asarray(img).copy()
        dw = dcam @ R.T                                         # 월드 방향 (H×W×3)
        hit = dw[..., 1] < -0.02
        dist = np.where(hit, -C[1] / np.minimum(dw[..., 1], -1e-6), 1e9)
        far = np.clip((dist - 6) / 14, 0, 1)[..., None]
        arr = np.where(hit[..., None], (arr * (1 - far) + sky * far).astype(np.uint8), sky)
        Image.fromarray(arr).save(os.path.join(tmp, f'{i:05d}.png'))
        qv = quat_from_R(R)
        samples.append({'t': round(t, 4), 'q': qv})
        gt.append({'t': round(t, 4), 'p': [round(float(v), 4) for v in C], 'q': qv})
    os.makedirs(OUT, exist_ok=True)
    out = os.path.join(OUT, f'{scn}.webm')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(tmp, '%05d.png'),
                    '-c:v', 'libvpx', '-b:v', '2500k', '-crf', '8', '-pix_fmt', 'yuv420p', out], check=True)
    with open(os.path.join(OUT, f'{scn}.json'), 'w') as f:
        json.dump({'scenario': scn, 'synthetic': True, 'fov': FOV, 'eye': EYE, 'frame': [W, H], 'fps': FPS,
                   'note': 'tools/make-synthetic.py가 만든 합성 바닥 영상. q는 three.js 카메라 쿼터니언, p는 m 단위 카메라 위치(y 위).',
                   'samples': samples, 'gt': gt}, f, separators=(',', ':'))
    for fn in os.listdir(tmp): os.remove(os.path.join(tmp, fn))
    os.rmdir(tmp)
    print(f'{scn}: {frames} frames → {out} ({os.path.getsize(out)} B)')

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    tex = floor_texture()
    for s in (['a', 'b', 'c'] if which == 'all' else [which]):
        render(s, tex)
