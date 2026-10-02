// ④ AR で置く（WebXR immersive-ar + hit-test。Android の Chrome 向け）
// 参考: three.js r186 examples/webxr_ar_hittest.html
import * as THREE from 'three';
import { buildContactShadow, disposeModel } from './model3d.js';

export async function isArSupported() {
  if (!('xr' in navigator)) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch {
    return false;
  }
}

/**
 * AR を始める。ボタンを押した直後（ユーザー操作の中）で呼ぶこと。
 * model: buildCutoutModel で作った 3D（AR 専用に作ったもの。終了時に開放する）
 * ui: { overlay, hint, resetBtn, exitBtn }
 * onEnd: AR を終えたときに呼ばれる
 */
export async function startAr(model, ui, onEnd) {
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay'],
    domOverlay: { root: ui.overlay },
  });

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.domElement.classList.add('ar-canvas');
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 2.5);
  light.position.set(0.5, 1, 0.25);
  scene.add(light);

  // 置く物（影ごと 1 つのまとまりにして、回す・大きさを変える）
  const placed = new THREE.Group();
  const spinner = new THREE.Group(); // 2 本指で回す・拡大するのはこちら
  spinner.add(model);
  spinner.add(buildContactShadow(model.userData.width));
  placed.add(spinner);
  placed.visible = false;
  scene.add(placed);

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.08, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial(),
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  let placing = true;
  let hitTestSource = null;

  const setHint = (text) => { ui.hint.textContent = text; };
  setHint('床や机に、スマホをゆっくり向けてください');

  // 画面タップ（WebXR の select）で置く
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', () => {
    if (!placing || !reticle.visible) return;
    reticle.matrix.decompose(placed.position, placed.quaternion, placed.scale);
    // 置いた物がスマホの方を向くように、上下の向きだけ回す
    const camPos = new THREE.Vector3().setFromMatrixPosition(renderer.xr.getCamera().matrixWorld);
    placed.quaternion.identity();
    placed.rotation.y = Math.atan2(camPos.x - placed.position.x, camPos.z - placed.position.z);
    placed.visible = true;
    placing = false;
    reticle.visible = false;
    setHint('2本指で回す・大きさを変える');
  });
  scene.add(controller);

  // ボタンを押したときは「置く」にしない
  const stopSelect = (e) => e.preventDefault();
  ui.buttons.addEventListener('beforexrselect', stopSelect);

  const onReset = () => {
    placing = true;
    placed.visible = false;
    setHint('置きたい場所に白い輪を合わせて、タップ');
  };
  const onExit = () => session.end();
  ui.resetBtn.addEventListener('click', onReset);
  ui.exitBtn.addEventListener('click', onExit);

  // 2 本指: 回す・大きさを変える
  const gesture = { active: false, dist: 0, angle: 0, scale: 1, rot: 0 };
  const twoFinger = (t) => {
    const dx = t[1].clientX - t[0].clientX;
    const dy = t[1].clientY - t[0].clientY;
    return { dist: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
  };
  const onTouchStart = (e) => {
    if (e.touches.length !== 2 || placing) return;
    const g = twoFinger(e.touches);
    Object.assign(gesture, { active: true, dist: g.dist, angle: g.angle, scale: spinner.scale.x, rot: spinner.rotation.y });
  };
  const onTouchMove = (e) => {
    if (!gesture.active || e.touches.length !== 2) return;
    const g = twoFinger(e.touches);
    const s = Math.min(4, Math.max(0.25, gesture.scale * (g.dist / gesture.dist)));
    spinner.scale.setScalar(s);
    spinner.rotation.y = gesture.rot - (g.angle - gesture.angle);
  };
  const onTouchEnd = (e) => { if (e.touches.length < 2) gesture.active = false; };
  ui.overlay.addEventListener('touchstart', onTouchStart);
  ui.overlay.addEventListener('touchmove', onTouchMove);
  ui.overlay.addEventListener('touchend', onTouchEnd);

  session.addEventListener('end', () => {
    renderer.setAnimationLoop(null);
    hitTestSource?.cancel();
    ui.buttons.removeEventListener('beforexrselect', stopSelect);
    ui.resetBtn.removeEventListener('click', onReset);
    ui.exitBtn.removeEventListener('click', onExit);
    ui.overlay.removeEventListener('touchstart', onTouchStart);
    ui.overlay.removeEventListener('touchmove', onTouchMove);
    ui.overlay.removeEventListener('touchend', onTouchEnd);
    disposeModel(scene);
    renderer.dispose();
    renderer.domElement.remove();
    onEnd();
  });

  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);

  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitTestSource = await session.requestHitTestSource({ space: viewerSpace });

  renderer.setAnimationLoop((time, frame) => {
    if (frame && placing && hitTestSource) {
      const results = frame.getHitTestResults(hitTestSource);
      if (results.length) {
        const pose = results[0].getPose(renderer.xr.getReferenceSpace());
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
        setHint('置きたい場所に白い輪を合わせて、タップ');
      } else {
        reticle.visible = false;
      }
    }
    renderer.render(scene, camera);
  });
}
