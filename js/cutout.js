// 切り抜いた物を「背景が透明な画像（canvas）」にする
import { maskBounds } from './geometry.js';

const MAX_SIDE = 1024; // テクスチャの最大サイズ（大きすぎるとスマホで重い）

/**
 * frame: 止めた 1 コマ（canvas）、mask: 0/1（frame と解像度が違ってもよい）
 * 戻り値: { canvas, aspect, box }（aspect = 幅 / 高さ、box = 元のコマ上の位置）。何も切り抜けなければ null
 */
export function makeCutout(frame, mask, maskW, maskH) {
  const box = maskBounds(mask, maskW, maskH);
  if (!box) return null;

  // マスクを、ふちを少しぼかした透明度の画像にする
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskW;
  maskCanvas.height = maskH;
  const mctx = maskCanvas.getContext('2d');
  const img = mctx.createImageData(maskW, maskH);
  for (let i = 0; i < mask.length; i++) {
    img.data[i * 4 + 3] = mask[i] ? 255 : 0;
  }
  mctx.putImageData(img, 0, 0);

  // マスクの四角を、元のコマの座標に直す
  const sx = frame.width / maskW;
  const sy = frame.height / maskH;
  const src = { x: box.x * sx, y: box.y * sy, w: box.w * sx, h: box.h * sy };
  const scale = Math.min(1, MAX_SIDE / Math.max(src.w, src.h));
  const outW = Math.max(1, Math.round(src.w * scale));
  const outH = Math.max(1, Math.round(src.h * scale));

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  ctx.drawImage(frame, src.x, src.y, src.w, src.h, 0, 0, outW, outH);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.filter = `blur(${Math.max(0.5, outW / 400)}px)`;
  ctx.drawImage(maskCanvas, box.x, box.y, box.w, box.h, 0, 0, outW, outH);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'source-over';

  return { canvas: out, aspect: outW / outH, box: src };
}
