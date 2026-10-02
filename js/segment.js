// タップした物の切り抜き（MediaPipe Interactive Segmenter v2 / tasks-vision 1.0.1）
// AI のモデルは端末の中で動く。画像はどこにも送らない（モデルとプログラムを最初に取得するだけ）。
import { FilesetResolver, InteractiveSegmenter }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { keepConnectedRegion } from './geometry.js';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task';

// d.ts の enum BrushMode は配布ファイルから export されていないため数値で指定する（1 = POSITIVE）
const BRUSH_POSITIVE = 1;

let segmenterPromise = null;

/** 最初の 1 回だけモデルを読み込む。画面を開いた直後に裏で呼んでおく */
export function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return InteractiveSegmenter.createFromModelPath(fileset, MODEL_URL);
    })();
    segmenterPromise.catch(() => { segmenterPromise = null; });
  }
  return segmenterPromise;
}

/**
 * canvas に描いた 1 コマと、タップ位置（0〜1）から、切り抜きマスクを作る。
 * 戻り値: { mask: Uint8Array(0/1), width, height }（マスクの解像度は canvas と違うことがある）
 */
export async function segmentAt(canvas, point) {
  const segmenter = await loadSegmenter();
  segmenter.setImage(canvas);
  const mpMask = segmenter.segment([
    { brushMode: BRUSH_POSITIVE, point: [{ x: point.x, y: point.y }], isCompleted: true },
  ]);
  try {
    const { width, height } = mpMask;
    let values = mpMask.getAsFloat32Array();
    // 0〜1 ではなく 0〜255 で返ってきた場合に備えて正規化する
    let max = 0;
    for (let i = 0; i < values.length; i++) if (values[i] > max) max = values[i];
    if (max > 1.5) values = values.map((v) => v / 255);
    const mask = keepConnectedRegion(values, width, height, point.x, point.y);
    return { mask, width, height };
  } finally {
    mpMask.close();
  }
}
