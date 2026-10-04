import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverPointToSource, keepConnectedRegion, maskBounds, coverage, fitToHeight, gestureToStrokes, thinPoints, BRUSH, reliefHeights } from '../js/geometry.js';

test('指の動き: ほとんど動かなければタップ。点 1 つではなく短い横線にする', () => {
  const g = gestureToStrokes([{ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.5 }]);
  assert.equal(g.kind, 'tap');
  assert.equal(g.strokes[0].brushMode, BRUSH.POSITIVE);
  assert.equal(g.strokes[0].point.length, 3);
  assert.ok(Math.abs(g.strokes[0].point[0].x - 0.495) < 1e-9);
  assert.ok(Math.abs(g.strokes[0].point[2].x - 0.515) < 1e-9);
});

test('指の動き: 端でのタップも線が 0〜1 からはみ出さない', () => {
  const g = gestureToStrokes([{ x: 0.995, y: 0.2 }]);
  assert.equal(g.strokes[0].point[2].x, 1);
});

test('指の動き: ぐるっと一周すれば囲う（LASSO）。目印は真ん中', () => {
  const pts = Array.from({ length: 20 }, (_, i) => {
    const a = (i / 19) * Math.PI * 2;
    return { x: 0.5 + 0.1 * Math.cos(a), y: 0.5 + 0.1 * Math.sin(a) };
  });
  const g = gestureToStrokes(pts);
  assert.equal(g.kind, 'lasso');
  assert.equal(g.strokes[0].brushMode, BRUSH.LASSO);
  assert.ok(Math.abs(g.seed.x - 0.5) < 0.02 && Math.abs(g.seed.y - 0.5) < 0.02);
});

test('指の動き: 一筆の線ならなぞる（POSITIVE の線）。目印は書き始め', () => {
  const g = gestureToStrokes([{ x: 0.3, y: 0.3 }, { x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }]);
  assert.equal(g.kind, 'scribble');
  assert.equal(g.strokes[0].brushMode, BRUSH.POSITIVE);
  assert.deepEqual(g.seed, { x: 0.3, y: 0.3 });
});

test('指の動き: 横長の写真では横方向の距離を広く数える', () => {
  // 横に 0.012 動いただけでも、幅/高さ = 2 なら 0.024 → タップではなくなぞる
  const g = gestureToStrokes([{ x: 0.5, y: 0.5 }, { x: 0.512, y: 0.5 }], 2);
  assert.equal(g.kind, 'scribble');
});

test('浮き彫り: 切り抜いていない所は 0。手前ほど高く、ふちはなだらかに低い', () => {
  // 21×21 の格子。真ん中の 15×15 が切り抜き部分。奥行きは右ほど手前
  const N = 21;
  const alpha = new Uint8Array(N * N);
  const depth = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (x >= 3 && x < 18 && y >= 3 && y < 18) alpha[y * N + x] = 255;
    depth[y * N + x] = x * 10;
  }
  const h = reliefHeights(depth, N, N, alpha, N, N, N, N, { edgeCells: 3 });
  assert.equal(h[0], 0); // 外側
  const row = 10;
  const edge = h[row * N + 3];
  const left = h[row * N + 7];
  const right = h[row * N + 14];
  assert.ok(edge < left, 'ふちは内側より低い');
  assert.ok(right > left, '手前（右）ほど高い');
  assert.ok(Math.max(...h) <= 1);
});

test('浮き彫り: 切り抜き部分が無ければ全部 0', () => {
  const h = reliefHeights(new Uint8Array(4), 2, 2, new Uint8Array(4), 2, 2, 3, 3);
  assert.deepEqual([...h], new Array(9).fill(0));
});

test('点を間引く: 最初と最後は残し、指定の数にする', () => {
  const pts = Array.from({ length: 200 }, (_, i) => ({ x: i, y: 0 }));
  const t = thinPoints(pts, 10);
  assert.equal(t.length, 10);
  assert.equal(t[0].x, 0);
  assert.equal(t[9].x, 199);
});

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
