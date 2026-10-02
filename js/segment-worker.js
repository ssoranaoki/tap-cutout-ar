// 切り抜きを画面とは別の場所（Web Worker）で動かす。画面は処理中も固まらない
// MediaPipe Interactive Segmenter v2 / tasks-vision 1.0.1
// GPU を優先し、使えなければ CPU に切り替える（PC の計測: GPU 約1.3秒 / CPU 約5秒、768px 前後の写真で）
import { FilesetResolver, InteractiveSegmenter }
  from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
import { keepConnectedRegion } from './geometry.js';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task';

// d.ts の enum BrushMode は配布ファイルから export されていないため数値で指定する（1 = POSITIVE）
const BRUSH_POSITIVE = 1;

let segmenterPromise = null;
let delegate = 'GPU';

function loadSegmenter() {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      // モジュール形式の Worker では importScripts が使えないため、ES モジュール版の Wasm 読み込み（true）を使う
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE, true);
      const create = () => InteractiveSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
      });
      try {
        return await create();
      } catch (err) {
        if (delegate !== 'GPU') throw err;
        delegate = 'CPU';
        return create();
      }
    })();
    segmenterPromise.catch(() => { segmenterPromise = null; });
  }
  return segmenterPromise;
}

/** GPU で失敗したら CPU で作り直す */
async function switchToCpu() {
  const old = await segmenterPromise?.catch(() => null);
  old?.close();
  segmenterPromise = null;
  delegate = 'CPU';
  return loadSegmenter();
}

function runOnce(segmenter, bitmap, point) {
  segmenter.setImage(bitmap);
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
    return { mask: keepConnectedRegion(values, width, height, point.x, point.y), width, height };
  } finally {
    mpMask.close();
  }
}

self.onmessage = async (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'load') {
      await loadSegmenter();
      self.postMessage({ id, ok: true, delegate });
      return;
    }
    if (type === 'segment') {
      const { bitmap, point } = e.data;
      const t0 = performance.now();
      let result;
      try {
        result = runOnce(await loadSegmenter(), bitmap, point);
      } catch (err) {
        if (delegate !== 'GPU') throw err;
        result = runOnce(await switchToCpu(), bitmap, point);
      } finally {
        bitmap.close();
      }
      const ms = Math.round(performance.now() - t0);
      self.postMessage({ id, ok: true, ...result, delegate, ms }, [result.mask.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
