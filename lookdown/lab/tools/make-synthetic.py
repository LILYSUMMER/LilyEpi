#!/usr/bin/env python3
"""합성 시나리오 생성기 — 웹캠·실기기 없이 추적기를 돌려 보기 위한 영상 + IMU + 정답 경로.

바닥은 8m×8m 평면 텍스처(젖은 아스팔트 느낌의 노이즈 + 타일 선 + 얼룩)이고, 카메라는 핀홀 모델
(640×480, 세로 화각 67°, lookdown.js CAMERA_FOV와 동일)이다. 매 프레임 바닥→이미지 호모그래피로 텍스처를 왜곡해
그린다. 바닥 위 물체·벽은 없으므로 실제 거리보다 추적이 쉽다(특징점이 전부 한 평면에 있다). 결과는 상대 비교용이다.

시나리오:
  a  제자리 회전: 10초 동안 yaw 0→360°, 위치 고정 (0, 1.4, 0), pitch −55°
  b  걷기: z 0→−2m (0~5초) 정지 (5~6초) 복귀 (6~11초) 정지 (11~12초). 걸음 흔들림 y ±2cm, yaw ±2°
  c  쪼그리기: y 1.4→0.7 (0~2.5초) 정지 (2.5~4.5초) 복귀 (4.5~7초) 정지 (7~8초). pitch −55°→−45°
  b2 b와 같은 경로 + 바닥 위 1 m 높이 상자 2개((−0.6, −2.5), (0.7, −3.5), 0.5×1.0×0.5 m) + 왼쪽 벽(x=−1.5, 높이 2.5 m).
     바닥이 아닌 특징점(이상치)이 추적기에 들어오게 하기 위한 시나리오.

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

def box_texture(seed=11, n=256):
    rng = np.random.default_rng(seed)
    base = rng.normal(0.55, 0.08, (n, n))
    yy, xx = np.mgrid[0:n, 0:n]
    base[(yy // 32 + xx // 32) % 2 == 0] += 0.12          # 체크무늬
    base[(yy % 64) < 4] -= 0.3; base[(xx % 64) < 4] -= 0.3  # 테이프 선
    for _ in range(120):
        x0, y0 = int(rng.uniform(0, n)), int(rng.uniform(0, n)); s_ = int(rng.uniform(2, 6)); base[y0:y0 + s_, x0:x0 + s_] += rng.uniform(0.2, 0.4)
    img = np.clip(base, 0, 1)
    return Image.fromarray((np.stack([img * 0.95, img * 0.78, img * 0.55], -1) * 255).astype(np.uint8))   # 판지색

def wall_texture(seed=13, w=2048, h=640):
    rng = np.random.default_rng(seed)
    base = rng.normal(0.5, 0.06, (h, w))
    yy, xx = np.mgrid[0:h, 0:w]
    row = yy // 40; off = (row % 2) * 60
    base[(yy % 40) < 4] -= 0.35; base[((xx + off) % 120) < 4] -= 0.35      # 벽돌 줄눈
    base += 0.1 * (((xx + off) // 120 + row) % 3 == 0)
    for _ in range(300):
        x0, y0 = int(rng.uniform(0, w)), int(rng.uniform(0, h)); s_ = int(rng.uniform(2, 7)); base[y0:y0 + s_, x0:x0 + s_] += rng.uniform(0.15, 0.4)
    img = np.clip(base, 0, 1)
    return Image.fromarray((np.stack([img * 0.72, img * 0.62, img * 0.6], -1) * 255).astype(np.uint8))   # 벽돌색

def homography(src_pts, dst_pts):
    """4점 대응 → 3×3 H (src → dst), DLT"""
    A = []
    for (x, y), (u, v) in zip(src_pts, dst_pts):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = np.array([c for p in dst_pts for c in p], float)
    hv = np.linalg.solve(np.array(A, float), b)
    return np.append(hv, 1).reshape(3, 3)

def draw_quad(frame, tex, quad_world, R, C):
    """월드 사각형(4점, 시계 또는 반시계)에 텍스처를 입혀 frame 위에 그린다. 카메라 뒤에 걸리면 건너뜀."""
    from PIL import ImageDraw
    Rt = R.T; pts = []
    for X in quad_world:
        Xc = Rt @ (np.array(X, float) - C)
        if Xc[2] > -0.05: return frame
        pts.append((cx + fx * Xc[0] / -Xc[2], cy - fy * Xc[1] / -Xc[2]))
    if all(p[0] < -50 or p[0] > W + 50 for p in pts) or all(p[1] < -50 or p[1] > H + 50 for p in pts): return frame
    tw, th = tex.size
    Hm = homography([(0, 0), (tw, 0), (tw, th), (0, th)], pts)
    Hinv = np.linalg.inv(Hm); Hinv /= Hinv[2, 2]
    coeffs = [Hinv[0, 0], Hinv[0, 1], Hinv[0, 2], Hinv[1, 0], Hinv[1, 1], Hinv[1, 2], Hinv[2, 0], Hinv[2, 1]]
    warped = tex.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BILINEAR)
    mask = Image.new('L', (W, H), 0); ImageDraw.Draw(mask).polygon(pts, fill=255)
    return Image.composite(warped, frame, mask)

# b2 물체: 왼쪽 벽 + 상자 2개. 각 면은 (사각형 4점, 텍스처). 멀리 있는 것부터 그린다.
def objects_b2(texs):
    boxes = [(-0.6, -2.5), (0.7, -3.5)]; d, hh = 0.5, 1.0
    faces = []
    # 벽은 1 m 조각으로 나눠 그린다. 한 조각이라도 카메라 뒤에 걸리면 그 조각만 건너뛴다.
    for z0 in range(1, -9, -1):
        z1 = z0 - 1
        faces.append(([(-1.5, 0, z0), (-1.5, 0, z1), (-1.5, 2.5, z1), (-1.5, 2.5, z0)], texs['wall_seg'], z1 - 0.5))
    for (bx, bz) in boxes:
        x0, x1, z0, z1 = bx - d / 2, bx + d / 2, bz - d / 2, bz + d / 2
        faces.append(([(x0, 0, z1), (x1, 0, z1), (x1, hh, z1), (x0, hh, z1)], texs['box'], bz))          # 앞면 (+z)
        faces.append(([(x0, hh, z1), (x1, hh, z1), (x1, hh, z0), (x0, hh, z0)], texs['box'], bz - 0.1))  # 윗면
        faces.append(([(x1, 0, z1), (x1, 0, z0), (x1, hh, z0), (x1, hh, z1)], texs['box'], bz - 0.05))   # 오른면 (+x)
        faces.append(([(x0, 0, z0), (x0, 0, z1), (x0, hh, z1), (x0, hh, z0)], texs['box'], bz - 0.05))   # 왼면 (−x)
    return faces

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
    if scn in ('b', 'b2'):
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

LEN = {'a': 10.0, 'b': 12.0, 'c': 8.0, 'b2': 12.0}

TEX_OBJ = None
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
        frame = Image.fromarray(arr)
        if scn == 'b2':
            cam_z = C[2]
            for quad, texo, depth in sorted(objects_b2(TEX_OBJ), key=lambda f: f[2]):   # 먼 것(z 작은 것)부터
                frame = draw_quad(frame, texo, quad, R, C)
        frame.save(os.path.join(tmp, f'{i:05d}.png'))
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
    TEX_OBJ = {'box': box_texture(), 'wall_seg': wall_texture(w=256, h=640)}
    for s in (['a', 'b', 'c', 'b2'] if which == 'all' else [which]):
        render(s, tex)
