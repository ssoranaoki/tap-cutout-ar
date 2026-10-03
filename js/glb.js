// 利用者が自分の AI（Tripo など）で作った 3D ファイル（GLB）を読み込み、大きさ・向き・位置をそろえる
// 端末の中だけで読み込む。ファイルはどこにも送らない。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight } from './geometry.js';
import { DEFAULT_HEIGHT_M } from './model3d.js';

export const MAX_GLB_BYTES = 60 * 1024 * 1024; // これより大きいとスマホで重すぎる

let loader = null;
function getLoader() {
  if (!loader) {
    // 圧縮された GLB（Draco / meshopt）にも対応しておく
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/');
    loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** GLB ファイルかどうかを先頭 4 バイト（"glTF"）で確かめる */
export function isGlb(buffer) {
  if (buffer.byteLength < 12) return false;
  const magic = new Uint8Array(buffer, 0, 4);
  return String.fromCharCode(...magic) === 'glTF';
}

/**
 * GLB を読み込んで、そろえた 3D を返す。
 * rotation: { x, y }（ラジアン）。AI によって向きがばらばらなので、画面のボタンで直した向き
 * 戻り値: THREE.Group（原点 = 底の中心。userData に width / height）
 */
export async function buildGlbModel(buffer, rotation = { x: 0, y: 0 }, heightM = DEFAULT_HEIGHT_M) {
  // parse は渡した ArrayBuffer を使うので、AR 用にもう一度読めるようコピーを渡す
  const gltf = await getLoader().parseAsync(buffer.slice(0), '');
  const content = gltf.scene;

  const turned = new THREE.Group(); // 向きを直す
  turned.rotation.set(rotation.x, rotation.y, 0);
  turned.add(content);

  const fitted = new THREE.Group(); // 大きさ・位置をそろえる
  fitted.add(turned);
  fitted.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(turned);
  const fit = fitToHeight(box.min, box.max, heightM);
  if (!fit) throw new Error('3D の中身が空のようです');

  turned.position.set(fit.offset.x, fit.offset.y, fit.offset.z);
  fitted.scale.setScalar(fit.scale);
  fitted.userData = { width: fit.width, height: heightM };

  // 影を落とす・受ける設定は今は使わない。テクスチャの色の扱いは GLTFLoader に任せる
  return fitted;
}
