import * as THREE from '/assets/three.module.js';
import { GLTFLoader } from '/assets/GLTFLoader.js';

const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('ar-canvas');
const modelViewer = document.getElementById('model-viewer');
const arGuide = document.getElementById('ar-guide');

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

async function startAR() {
  try {
    console.log('[AR] startAR() called');
    if (location.protocol !== 'https:') {
      alert('AR 기능은 HTTPS 환경에서만 동작합니다. 주소창이 https://로 시작하는지 확인하세요.');
      console.error('[AR] HTTPS 환경이 아님');
      return;
    }
    if (navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')) {
      console.log('[AR] immersive-ar 지원, WebXR 세션 시작 시도');
      startBtn.style.display = 'none';
      arGuide.classList.remove('hidden');
      setTimeout(() => arGuide.classList.add('hidden'), 3000);
      canvas.style.display = 'block';
      launchWebXR();
    } else if (isIOS()) {
      console.log('[AR] iOS 환경, model-viewer fallback');
      startBtn.style.display = 'none';
      modelViewer.style.display = 'block';
      if (modelViewer.activateAR) modelViewer.activateAR();
    } else {
      alert('AR을 지원하지 않는 기기 또는 브라우저입니다. 최신 모바일 크롬/사파리에서 시도해보세요.');
      console.error('[AR] immersive-ar 미지원');
    }
  } catch (e) {
    alert('AR 시작 중 오류가 발생했습니다: ' + e.message);
    console.error('[AR] startAR() error:', e);
  }
}

startBtn.addEventListener('click', startAR);

async function launchWebXR() {
  let session;
  try {
    console.log('[AR] launchWebXR() called');
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['local', 'hit-test']
    });
    console.log('[AR] XRSession 시작 성공', session);
  } catch (e) {
    alert('WebXR AR 세션 시작에 실패했습니다. 카메라 권한을 허용했는지, 기기/브라우저가 지원되는지 확인하세요.');
    console.error('[AR] XRSession 시작 실패:', e);
    return;
  }
  const renderer = new THREE.WebGLRenderer({ alpha: true, canvas });
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1));

  // Reticle
  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff00 })
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // GLTF Loader
  const loader = new GLTFLoader();
  let model = null;

  renderer.xr.setReferenceSpaceType('local');
  try {
    await renderer.xr.setSession(session);
    console.log('[AR] renderer.xr.setSession 완료');
  } catch (e) {
    alert('Three.js XR 세션 연결에 실패했습니다.');
    console.error('[AR] renderer.xr.setSession error:', e);
    return;
  }

  let xrRefSpace, viewerSpace, hitTestSource;
  try {
    xrRefSpace = await session.requestReferenceSpace('local');
    viewerSpace = await session.requestReferenceSpace('viewer');
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
    console.log('[AR] hit-test 소스 준비 완료');
  } catch (e) {
    alert('평면 인식(hit-test) 준비에 실패했습니다.');
    console.error('[AR] hit-test 준비 실패:', e);
    return;
  }

  // Select event (user tap)
  session.addEventListener('select', () => {
    if (reticle.visible && !model) {
      console.log('[AR] select 이벤트: 모델 배치 시도');
      loader.load('assets/model.glb', (gltf) => {
        model = gltf.scene;
        model.position.setFromMatrixPosition(reticle.matrix);
        model.quaternion.setFromRotationMatrix(reticle.matrix);
        scene.add(model);
        console.log('[AR] 모델 배치 완료', model);
        // XRAnchor 고정 (일부 브라우저만 지원)
        if (session.requestAnchor) {
          session.requestAnchor(reticle.matrix, xrRefSpace).then(anchor => {
            anchor.context = model;
            console.log('[AR] XRAnchor 고정 완료', anchor);
          }).catch(e => {
            console.warn('[AR] XRAnchor 고정 실패', e);
          });
        }
      }, undefined, (err) => {
        alert('GLB 모델 로드 실패: ' + err.message);
        console.error('[AR] GLB 모델 로드 실패:', err);
      });
    }
  });

  renderer.setAnimationLoop((timestamp, frame) => {
    if (frame) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(xrRefSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        // 평면 인식 위치 로그
        // console.log('[AR] 평면 인식 위치', pose.transform.position);
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });
} 