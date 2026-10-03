import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverPointToSource, keepConnectedRegion, maskBounds, coverage, fitToHeight } from '../js/geometry.js';

test('3D をそろえる: 高さ 2 の物を 0.25m に。底が y=0、中心が x=z=0', () => {
  const f = fitToHeight({ x: 1, y: -1, z: 3 }, { x: 3, y: 1, z: 5 }, 0.25);
  assert.equal(f.scale, 0.125);
  assert.deepEqual(f.offset, { x: -2, y: 1, z: -4 });
  assert.equal(f.width, 0.25);
});

test('3D をそろえる: ぺちゃんこな物は一番長い辺で合わせる', () => {
  const f = fitToHeight({ x: 0, y: 0, z: 0 }, { x: 4, y: 0.01, z: 2 }, 0.25);
  assert.equal(f.scale, 0.0625);
});

test('3D をそろえる: 大きさが 0 なら null', () => {
  assert.equal(fitToHeight({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, 0.25), null);
});

test('cover 表示: 縦長の画面に横長の映像。中央をタップすると映像の中央', () => {
  const p = coverPointToSource(180, 400, 360, 800, 1280, 720);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9);
  assert.ok(Math.abs(p.y - 0.5) < 1e-9);
});

test('cover 表示: 左右がはみ出すので、画面の左端は映像の左端より内側', () => {
  // 1280x720 を高さ 800 に合わせると幅 1422.2。はみ出しは左右に 531.1 ずつ
  const p = coverPointToSource(0, 0, 360, 800, 1280, 720);
  assert.ok(Math.abs(p.x - 531.111 / 1422.222) < 1e-3);
  assert.equal(p.y, 0);
});

test('cover 表示: 映像と画面の比率が同じなら、そのままの割合', () => {
  const p = coverPointToSource(90, 600, 360, 800, 720, 1600);
  assert.ok(Math.abs(p.x - 0.25) < 1e-9);
  assert.ok(Math.abs(p.y - 0.75) < 1e-9);
});

// 5x3 のマスク: 左に 2 マスの塊、右に 3 マスの塊
const W = 5, H = 3;
const vals = [
  1, 0, 0, 1, 1,
  1, 0, 0, 0, 1,
  0, 0, 0, 0, 0,
];

test('タップした点とつながった塊だけを残す', () => {
  const m = keepConnectedRegion(vals, W, H, 0, 0);
  assert.deepEqual([...m], [1,0,0,0,0, 1,0,0,0,0, 0,0,0,0,0]);
});

test('タップ点が外れていたら、一番大きい塊を残す', () => {
  const m = keepConnectedRegion(vals, W, H, 0.5, 1);
  assert.deepEqual([...m], [0,0,0,1,1, 0,0,0,0,1, 0,0,0,0,0]);
});

test('しきい値より低い値は切り抜かない', () => {
  const m = keepConnectedRegion([0.4, 0.6, 0.2, 0.9], 2, 2, 1, 0);
  assert.deepEqual([...m], [0, 1, 0, 1]);
});

test('切り抜く物を囲む四角（余白なし）', () => {
  const m = keepConnectedRegion(vals, W, H, 1, 0);
  assert.deepEqual(maskBounds(m, W, H, 0), { x: 3, y: 0, w: 2, h: 2 });
});

test('何も無いマスクは null', () => {
  assert.equal(maskBounds(new Uint8Array(6), 3, 2), null);
});

test('切り抜いた割合', () => {
  assert.equal(coverage(Uint8Array.from([1, 0, 1, 0])), 0.5);
});
