// ③ 3D で確かめる画面（指で回せるプレビュー）
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildContactShadow, disposeModel, makeRoomEnvironment } from './model3d.js';

let renderer, scene, camera, controls, holder;

export function initPreview(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.environment = makeRoomEnvironment(renderer);
  scene.environmentIntensity = 0.8;
  camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10);
  camera.position.set(0.25, 0.2, 0.6);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.5, 1, 0.8);
  scene.add(sun);

  const grid = new THREE.GridHelper(1.2, 24, 0x667788, 0x3a4250);
  scene.add(grid);

  holder = new THREE.Group();
  scene.add(holder);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.12, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.5; // 1 秒あたり 1.5/60 周 → 約 40 秒で 1 周
  controls.minDistance = 0.2;
  controls.maxDistance = 1.5;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  new ResizeObserver(() => resize(container)).observe(container);
  resize(container);
}

function resize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/** 表示する 3D を差し替える（古いものは開放） */
export function showInPreview(model) {
  for (const child of [...holder.children]) {
    holder.remove(child);
    disposeModel(child);
  }
  holder.add(model);
  holder.add(buildContactShadow(model.userData.width));
  controls.target.set(0, model.userData.height / 2, 0);
}

export function startPreview() {
  controls.autoRotate = true;
  let last = null;
  renderer.setAnimationLoop((time) => {
    // 経過秒数を渡す（渡さないと画面の書き換え回数しだいで回る速さが変わる。120Hz の端末では倍速になる）
    const delta = last === null ? 0 : Math.min(0.1, (time - last) / 1000);
    last = time;
    controls.update(delta);
    renderer.render(scene, camera);
  });
}

export function stopPreview() {
  renderer.setAnimationLoop(null);
}
