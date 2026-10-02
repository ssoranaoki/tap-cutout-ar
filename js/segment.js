// 切り抜きの窓口（画面側）。実際の処理は segment-worker.js（Web Worker）で動く
// AI のモデルは端末の中で動く。画像はどこにも送らない（モデルとプログラムを最初に取得するだけ）。

// 切り抜き AI に渡す写真の長い辺。小さいほど速い（PC の GPU: 1280px 約2.3秒 → 640px 約1.3秒）
// マスクは元の写真に合わせて拡大して使うので、切り抜く画像そのものの画質は落ちない
const SEGMENT_MAX_SIDE = 768;

let worker = null;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./segment-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, ok, error, ...rest } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      ok ? p.resolve(rest) : p.reject(new Error(error));
    };
    worker.onerror = (e) => {
      // Worker 自体が読み込めなかったとき（通信エラーなど）。待っている処理をすべて失敗にする
      for (const p of pending.values()) p.reject(new Error(e.message || '切り抜きの準備に失敗しました'));
      pending.clear();
      worker.terminate();
      worker = null;
    };
  }
  return worker;
}

function request(message, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...message }, transfer);
  });
}

/** 最初の 1 回だけモデルを読み込む。画面を開いた直後に裏で呼んでおく */
export function loadSegmenter() {
  return request({ type: 'load' });
}

/**
 * canvas に描いた 1 コマと、タップ位置（0〜1）から、切り抜きマスクを作る。
 * 戻り値: { mask: Uint8Array(0/1), width, height, delegate, ms }（マスクの解像度は canvas より小さいことがある）
 */
export async function segmentAt(canvas, point) {
  const scale = Math.min(1, SEGMENT_MAX_SIDE / Math.max(canvas.width, canvas.height));
  const bitmap = await createImageBitmap(canvas, {
    resizeWidth: Math.max(1, Math.round(canvas.width * scale)),
    resizeHeight: Math.max(1, Math.round(canvas.height * scale)),
    resizeQuality: 'high',
  });
  return request({ type: 'segment', bitmap, point }, [bitmap]);
}
