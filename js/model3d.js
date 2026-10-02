// 切り抜いた画像から「厚みのある切り絵」の 3D を作る（Three.js）
// 作り方: 同じ形の板を少しずつずらして重ね、厚みに見せる。
//   表 = 写真、裏 = 写真（裏から見るので左右反転）、間の板 = ふちの色
import * as THREE from 'three';

export const DEFAULT_HEIGHT_M = 0.25; // AR で置いたときの最初の高さ（25cm）

/** 形だけを白く塗った画像（ふちの板に使う） */
function silhouette(canvas) {
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

function texture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * cutout: { canvas, aspect }
 * thickness: 1〜10（画面のスライダーの値）。高さに対する割合で厚みを決める
 * edgeColor: ふちの色（'#rrggbb'）
 * 戻り値: THREE.Group（原点 = 底の中心。床に置くとそのまま立つ）
 */
export function buildCutoutModel(cutout, { thickness = 4, edgeColor = '#b9732f', heightM = DEFAULT_HEIGHT_M } = {}) {
  const h = heightM;
  const w = h * cutout.aspect;
  const depth = h * 0.006 * thickness; // 高さ 25cm のとき: 4 → 約 6mm、10 → 約 1.5cm（アクリルスタンドくらい）
  const layers = Math.min(40, Math.max(6, Math.ceil(depth / 0.0012)));

  const plane = new THREE.PlaneGeometry(w, h).translate(0, h / 2, 0);
  const photo = texture(cutout.canvas);
  const photoMat = new THREE.MeshStandardMaterial({ map: photo, alphaTest: 0.5, roughness: 0.8 });
  const edgeMat = new THREE.MeshStandardMaterial({
    map: texture(silhouette(cutout.canvas)),
    color: new THREE.Color(edgeColor),
    alphaTest: 0.5,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const group = new THREE.Group();
  const front = new THREE.Mesh(plane, photoMat);
  front.position.z = depth / 2;
  group.add(front);

  const back = new THREE.Mesh(plane, photoMat);
  back.rotation.y = Math.PI;
  back.position.z = -depth / 2;
  group.add(back);

  for (let i = 1; i < layers; i++) {
    const layer = new THREE.Mesh(plane, edgeMat);
    layer.position.z = depth / 2 - (depth * i) / layers;
    group.add(layer);
  }

  group.userData = { width: w, height: h, depth };
  return group;
}

/** 床に落ちる丸い影（AR とプレビューで共通） */
export function buildContactShadow(width) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.3, width * 0.5).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  mesh.position.y = 0.001;
  return mesh;
}

/** 作り直すときに古い 3D のメモリを開放する */
export function disposeModel(object) {
  const seen = new Set();
  object.traverse((o) => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const mats = o.material ? [].concat(o.material) : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
}
