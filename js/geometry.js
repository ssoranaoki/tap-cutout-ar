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

/** マスク全体に対して、切り抜いた部分が占める割合（小さすぎる・大きすぎるの判定用） */
export function coverage(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i];
  return mask.length ? n / mask.length : 0;
}
