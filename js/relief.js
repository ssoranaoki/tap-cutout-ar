// 浮き彫り: 切り絵の表側を、推定した奥行きに合わせて前に盛り上げる（Three.js）
// 裏とふちは今の切り絵と同じ（buildCutoutModel）。表の板だけを、凹凸のある面に差し替える
import * as THREE from 'three';
import { buildCutoutModel } from './model3d.js';
import { reliefHeights } from './geometry.js';

const GRID = 160; // 盛り上げる面の細かさ（長い辺の分割数）

/**
 * cutout: { canvas, aspect }（背景が透明な切り抜き画像）
 * depth: { data, width, height }（切り抜き画像と同じ範囲の奥行き。0〜255 で大きいほど手前）
 * strength: 盛り上がりの強さ（高さに対する割合。0.2 = 高さ 25cm なら最大 5cm）
 */
export function buildReliefModel(cutout, depth, { strength = 0.2, thickness = 4, edgeColor = '#b9732f' } = {}) {
  const group = buildCutoutModel(cutout, { thickness, edgeColor });
  const { width: w, height: h, depth: plateDepth } = group.userData;

  // 表の板（最初の子）を、凹凸のある面に差し替える
  const front = group.children[0];
  const segX = cutout.aspect >= 1 ? GRID : Math.max(8, Math.round(GRID * cutout.aspect));
  const segY = cutout.aspect >= 1 ? Math.max(8, Math.round(GRID / cutout.aspect)) : GRID;
  const geo = new THREE.PlaneGeometry(w, h, segX, segY).translate(0, h / 2, 0);

  const alpha = readAlpha(cutout.canvas);
  const heights = reliefHeights(depth.data, depth.width, depth.height, alpha.data, alpha.width, alpha.height, segX + 1, segY + 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, heights[i] * h * strength);
  geo.computeVertexNormals();

  front.geometry = geo;
  front.position.z = plateDepth / 2;
  group.userData.depth = plateDepth + h * strength;
  return group;
}

/** 切り抜き画像の透明度（0〜255）を取り出す */
function readAlpha(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const a = new Uint8Array(width * height);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3];
  return { data: a, width, height };
}
