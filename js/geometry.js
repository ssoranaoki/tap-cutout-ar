// 画面座標・マスクまわりの計算（DOM に触れない純粋関数。tests/ でテストする）

/**
 * object-fit: cover で表示している映像の上をタップしたとき、
 * そのタップ位置が映像（元の解像度）のどこに当たるかを 0〜1 の割合で返す。
 * 映像の外（はみ出して隠れている部分）にはならないが、念のため 0〜1 に収める。
 */
export function coverPointToSource(tapX, tapY, viewW, viewH, srcW, srcH) {
  const scale = Math.max(viewW / srcW, viewH / srcH);
  const shownW = srcW * scale;
  const shownH = srcH * scale;
  const offsetX = (shownW - viewW) / 2;
  const offsetY = (shownH - viewH) / 2;
  const x = (tapX + offsetX) / shownW;
  const y = (tapY + offsetY) / shownH;
  return { x: clamp01(x), y: clamp01(y) };
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/**
 * マスク（0〜1 の値が並んだ配列）を 0/1 に分け、
 * タップした点とつながっている部分だけを残す（離れた小さなかけらを消す）。
 * 戻り値は Uint8Array（1 = 切り抜く）。タップ点が外れていたら一番大きい塊を残す。
 */
export function keepConnectedRegion(values, width, height, seedX, seedY, threshold = 0.5) {
  const on = new Uint8Array(width * height);
  for (let i = 0; i < on.length; i++) on[i] = values[i] >= threshold ? 1 : 0;

  const sx = Math.min(width - 1, Math.max(0, Math.round(seedX * (width - 1))));
  const sy = Math.min(height - 1, Math.max(0, Math.round(seedY * (height - 1))));
  if (on[sy * width + sx]) return floodFill(on, width, height, sy * width + sx);

  // タップ点がマスクの外 → 一番大きい塊を探す
  const seen = new Uint8Array(on.length);
  let best = null;
  let bestSize = 0;
  for (let i = 0; i < on.length; i++) {
    if (!on[i] || seen[i]) continue;
    const region = floodFill(on, width, height, i);
    let size = 0;
    for (let j = 0; j < region.length; j++) {
      if (region[j]) { size++; seen[j] = 1; }
    }
    if (size > bestSize) { bestSize = size; best = region; }
  }
  return best ?? new Uint8Array(on.length);
}

function floodFill(on, width, height, start) {
  const out = new Uint8Array(on.length);
  const stack = [start];
  out[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    const y = (i - x) / width;
    const next = [];
    if (x > 0) next.push(i - 1);
    if (x < width - 1) next.push(i + 1);
    if (y > 0) next.push(i - width);
    if (y < height - 1) next.push(i + width);
    for (const n of next) {
      if (on[n] && !out[n]) { out[n] = 1; stack.push(n); }
    }
  }
  return out;
}

/**
 * 0/1 のマスクから、切り抜く物を囲む四角（余白つき）を返す。
 * 何も無ければ null。
 */
export function maskBounds(mask, width, height, padRatio = 0.04) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * padRatio);
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(width - 1, maxX + pad);
  const y1 = Math.min(height - 1, maxY + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * 読み込んだ 3D の大きさ・位置をそろえる計算。
 * min / max: 3D 全体を囲む箱の角（{x,y,z}）。heightM: そろえたい高さ（メートル）
 * 戻り値: scale（拡大率）、offset（拡大する前に足す移動量。底を y=0、中心を x=z=0 にする）、
 *         width（床の影に使う横幅。拡大後）
 * どの AI で作った 3D でも、同じ大きさ・同じ置き方になるようにするためのもの。
 */
export function fitToHeight(min, max, heightM) {
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const longest = Math.max(size.x, size.y, size.z);
  if (!(longest > 0)) return null; // 空っぽ・壊れた 3D
  // ふつうは高さで合わせる。ぺちゃんこな物（高さがほぼ 0）は一番長い辺で合わせる
  const base = size.y > longest * 0.05 ? size.y : longest;
  const scale = heightM / base;
  return {
    scale,
    offset: { x: -(min.x + max.x) / 2, y: -min.y, z: -(min.z + max.z) / 2 },
    width: Math.max(size.x, size.z) * scale,
  };
}

// 切り抜き AI（Interactive Segmenter v2）への指示の種類
export const BRUSH = { POSITIVE: 1, NEGATIVE: 2, LASSO: 3 };

/**
 * 指の動き（0〜1 の座標の列）を、切り抜き AI への指示に変える。
 * - ほとんど動いていない → タップ。点 1 つだと AI がほとんど反応しないため（実験で 5 件中 4 件が空）、
 *   タップ位置を中心にした短い横線（±1%）にして渡す（同じ実験で 5 件とも成功）
 * - 始点と終点が近く、ある程度の大きさがある → 囲う（LASSO）
 * - それ以外 → なぞる（POSITIVE の線）
 * aspect: 写真の 幅 / 高さ（距離を正しく測るため）
 * 戻り値: { kind: 'tap' | 'scribble' | 'lasso', strokes, seed }（seed = 残す塊を選ぶ目印）
 */
export function gestureToStrokes(points, aspect = 1) {
  const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  const first = points[0];
  const last = points[points.length - 1];

  if (points.length < 2 || length < 0.02) {
    const p = last;
    const d = 0.01;
    return {
      kind: 'tap',
      strokes: [{ brushMode: BRUSH.POSITIVE, point: [{ x: clamp01(p.x - d), y: p.y }, { x: p.x, y: p.y }, { x: clamp01(p.x + d), y: p.y }] }],
      seed: p,
    };
  }
  const closed = dist(first, last) < Math.max(0.05, length * 0.2) && length > 0.15;
  if (closed) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    return { kind: 'lasso', strokes: [{ brushMode: BRUSH.LASSO, point: points }], seed: { x: cx, y: cy } };
  }
  return { kind: 'scribble', strokes: [{ brushMode: BRUSH.POSITIVE, point: points }], seed: first };
}

/** 長い指の動きを間引く（送るデータを小さくする）。最初と最後は必ず残す */
export function thinPoints(points, maxCount = 64) {
  if (points.length <= maxCount) return points;
  const step = (points.length - 1) / (maxCount - 1);
  return Array.from({ length: maxCount }, (_, i) => points[Math.round(i * step)]);
}

/**
 * 浮き彫りの高さ（0〜1）を、格子の点ごとに計算する。
 * depth: 奥行き（0〜255、大きいほど手前。dw×dh）、alpha: 切り抜きの透明度（0〜255。aw×ah）
 * 両方とも同じ範囲（切り抜いた四角）を表す。gw×gh: 格子の点の数（上の行から、左から右へ並ぶ）
 * - 切り抜いた部分の奥行きを、下位 5%〜上位 95% の幅で 0〜1 に引き伸ばす（物の中の凹凸だけを使う）
 * - ふちから edgeCells マス以内はなだらかに低くして、板とつなげる（崖にしない）
 * - 全体を少しふくらませる（base）。奥行きが平らな物でも丸みが出る
 */
export function reliefHeights(depth, dw, dh, alpha, aw, ah, gw, gh, { edgeCells = 12, base = 0.25, smooth = 2 } = {}) {
  const n = gw * gh;
  const inside = new Uint8Array(n);
  const d = new Float32Array(n);
  const samples = [];
  for (let iy = 0; iy < gh; iy++) {
    for (let ix = 0; ix < gw; ix++) {
      const u = gw > 1 ? ix / (gw - 1) : 0.5;
      const v = gh > 1 ? iy / (gh - 1) : 0.5;
      const i = iy * gw + ix;
      const a = alpha[Math.min(ah - 1, Math.round(v * (ah - 1))) * aw + Math.min(aw - 1, Math.round(u * (aw - 1)))];
      if (a < 128) continue;
      inside[i] = 1;
      d[i] = sampleBilinear(depth, dw, dh, u, v);
      samples.push(d[i]);
    }
  }
  const out = new Float32Array(n);
  if (!samples.length) return out;
  samples.sort((x, y) => x - y);
  const lo = samples[Math.floor(samples.length * 0.05)];
  const hi = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
  const range = hi - lo || 1;

  const dist = distanceToEdge(inside, gw, gh);
  for (let i = 0; i < n; i++) {
    if (!inside[i]) continue;
    const t = Math.min(1, Math.max(0, (d[i] - lo) / range));
    const e = Math.min(1, dist[i] / edgeCells);
    const fall = e * e * (3 - 2 * e); // なめらかに 0→1
    out[i] = fall * (base + (1 - base) * t);
  }
  // 細かいでこぼこをならす（急な斜面ほど写真が横に引き伸ばされて見えるため）
  for (let k = 0; k < smooth; k++) smoothInside(out, inside, gw, gh);
  return out;
}

/** 内側の点だけ、上下左右との平均でならす（外側は 0 のまま） */
function smoothInside(values, inside, w, h) {
  const src = Float32Array.from(values);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!inside[i]) continue;
      let sum = src[i] * 2, cnt = 2;
      if (x > 0) { sum += src[i - 1]; cnt++; }
      if (x < w - 1) { sum += src[i + 1]; cnt++; }
      if (y > 0) { sum += src[i - w]; cnt++; }
      if (y < h - 1) { sum += src[i + w]; cnt++; }
      values[i] = sum / cnt;
    }
  }
}

function sampleBilinear(img, w, h, u, v) {
  const x = u * (w - 1);
  const y = v * (h - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const top = img[y0 * w + x0] * (1 - fx) + img[y0 * w + x1] * fx;
  const bottom = img[y1 * w + x0] * (1 - fx) + img[y1 * w + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

/** 内側の各点から、いちばん近い外側（または画像の端）までのおおよその距離（マス数） */
function distanceToEdge(inside, w, h) {
  const INF = 1e9;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < dist.length; i++) dist[i] = inside[i] ? INF : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : dist[y * w + x]);
  const D = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + D, at(x + 1, y - 1) + D);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!dist[i]) continue;
      dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + D, at(x - 1, y + 1) + D);
    }
  }
  return dist;
}

/** マスク全体に対して、切り抜いた部分が占める割合（小さすぎる・大きすぎるの判定用） */
export function coverage(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return mask.length ? n / mask.length : 0;
}
