import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

const startBtn = document.getElementById('start-btn');
const canvas = document.getElementById('ar-canvas');
const modelViewer = document.getElementById('model-viewer');
const arGuide = document.getElementById('ar-guide');

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

async function startAR() {
  if (navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')) {
    startBtn.style.display = 'none';
    arGuide.classList.remove('hidden');
    setTimeout(() => arGuide.classList.add('hidden'), 3000);
    canvas.style.display = 'block';
    launchWebXR();
  } else if (isIOS()) {
    startBtn.style.display = 'none';
    modelViewer.style.display = 'block';
    if (modelViewer.activateAR) modelViewer.activateAR();
  } else {
    alert('AR을 지원하지 않는 기기입니다.');
  }
}

startBtn.addEventListener('click', startAR);

async function launchWebXR() {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['local', 'hit-test']
  });
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
  await renderer.xr.setSession(session);

  const xrRefSpace = await session.requestReferenceSpace('local');
  const viewerSpace = await session.requestReferenceSpace('viewer');
  const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  // Select event (user tap)
  session.addEventListener('select', () => {
    if (reticle.visible && !model) {
      loader.load('assets/model.glb', (gltf) => {
        model = gltf.scene;
        model.position.setFromMatrixPosition(reticle.matrix);
        model.quaternion.setFromRotationMatrix(reticle.matrix);
        scene.add(model);
        // XRAnchor 고정 (일부 브라우저만 지원)
        if (session.requestAnchor) {
          session.requestAnchor(reticle.matrix, xrRefSpace).then(anchor => {
            anchor.context = model;
          });
        }
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
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });
} 