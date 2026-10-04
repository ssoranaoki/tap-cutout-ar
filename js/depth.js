// 写真から奥行きを推定する（Depth Anything V2 small / Transformers.js 4.3.0）。端末の中で動く
// 初回だけモデルをダウンロードする（約 18〜25MB。ブラウザがキャッシュするので 2 回目からは不要）
import { pipeline } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';

const MODEL = 'onnx-community/depth-anything-v2-small';

let estimatorPromise = null;

/** GPU（WebGPU）が使えればそれを、使えなければ Wasm（CPU）を使う */
async function pickBackend() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (adapter) {
      // 16bit 小数が使える GPU なら一番小さいモデル（約 18MB）
      return adapter.features.has('shader-f16')
        ? { device: 'webgpu', dtype: 'q4f16' }
        : { device: 'webgpu', dtype: 'fp32' };
    }
  } catch { /* WebGPU なし */ }
  return { device: 'wasm', dtype: 'q8' }; // 約 25MB
}

export function loadDepth(onProgress) {
  if (!estimatorPromise) {
    estimatorPromise = (async () => {
      const backend = await pickBackend();
      const estimator = await pipeline('depth-estimation', MODEL, {
        ...backend,
        progress_callback: onProgress,
      });
      return { estimator, backend };
    })();
    estimatorPromise.catch(() => { estimatorPromise = null; });
  }
  return estimatorPromise;
}

/**
 * canvas の写真の奥行きを推定する。
 * 戻り値: { data: Uint8Array（0〜255。大きいほど手前）, width, height, backend, ms }
 */
export async function estimateDepth(canvas, onProgress) {
  const { estimator, backend } = await loadDepth(onProgress);
  const t0 = performance.now();
  const { depth } = await estimator(canvas);
  return { data: depth.data, width: depth.width, height: depth.height, backend, ms: Math.round(performance.now() - t0) };
}
