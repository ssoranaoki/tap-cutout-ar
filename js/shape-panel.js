// ③ 3D 画面の「形: 切り絵／浮き彫り」欄
// 浮き彫りは写真の奥行きを AI（端末内）で推定して作る。AI は浮き彫りを初めて選んだときだけ読み込む
// （depth.js は Transformers.js ごと大きいので、使うときに import する。切り絵だけの人には読み込ませない）

const $ = (id) => document.getElementById(id);

// スライダー 1〜10 → 盛り上がりの強さ（高さに対する割合）。4 → 0.06（高さ 25cm で最大 1.5cm）
const strengthOf = (v) => 0.02 + (v - 1) * (0.1 / 9);

const panel = {
  shape: 'flat',     // 'flat'（切り絵）| 'relief'（浮き彫り）
  strength: strengthOf(4),
  depth: null,       // 推定した奥行き（切り抜きごとに 1 回だけ計算）
  depthPromise: null,
  frame: null,
  cutout: null,
  onChange: () => {},
};

function setStatus(text, busy = false) {
  $('shape-status').textContent = text;
  $('shape-status').classList.toggle('busy-dark', busy);
}

function render() {
  for (const b of document.querySelectorAll('.shape-btn')) {
    b.setAttribute('aria-pressed', String(b.dataset.shape === panel.shape));
  }
  $('relief-row').hidden = panel.shape !== 'relief';
}

/** 切り抜いた四角と同じ範囲の写真（背景つき）。奥行きは周りも見た方が正しく推定できる */
function cropForDepth(frame, cutout) {
  const c = document.createElement('canvas');
  c.width = cutout.canvas.width;
  c.height = cutout.canvas.height;
  const b = cutout.box;
  c.getContext('2d').drawImage(frame, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
  return c;
}

async function ensureDepth() {
  if (panel.depth) return panel.depth;
  if (!panel.depthPromise) {
    const { frame, cutout } = panel;
    const files = new Map();
    setStatus('立体を計算中…', true);
    const estimate = (...args) => import('./depth.js').then((m) => m.estimateDepth(...args));
    panel.depthPromise = estimate(cropForDepth(frame, cutout), (p) => {
      // 初回だけ AI のダウンロードがある。進み具合を % で出す
      if (p.status === 'progress' && p.total) {
        files.set(p.file, { loaded: p.loaded, total: p.total });
        let loaded = 0, total = 0;
        for (const f of files.values()) { loaded += f.loaded; total += f.total; }
        setStatus(`立体の AI を準備中… ${Math.floor((loaded / total) * 100)}%（初回だけ）`, true);
      }
    }).then((depth) => {
      if (panel.cutout !== cutout) return null; // 途中で別の切り抜きに変わった
      panel.depth = depth;
      console.info(`奥行き推定: ${depth.backend.device}/${depth.backend.dtype} ${depth.ms}ms`); // 実機での確認用
      setStatus('');
      return depth;
    }).catch((err) => {
      console.error(err);
      panel.depthPromise = null;
      panel.shape = 'flat';
      render();
      setStatus('浮き彫りを作れませんでした（通信を確認してください）');
      return null;
    });
  }
  return panel.depthPromise;
}

export function initShapePanel(onChange) {
  panel.onChange = onChange;
  for (const b of document.querySelectorAll('.shape-btn')) {
    b.addEventListener('click', async () => {
      panel.shape = b.dataset.shape;
      render();
      if (panel.shape === 'relief' && !panel.depth) {
        const depth = await ensureDepth();
        if (!depth) return;
      }
      panel.onChange();
    });
  }
  $('relief-strength').addEventListener('input', (e) => {
    panel.strength = strengthOf(Number(e.target.value));
    if (panel.depth) panel.onChange();
  });
  render();
}

/** 新しい切り抜きになったら呼ぶ（奥行きは計算し直し。形は切り絵に戻す） */
export function resetShape(frame, cutout) {
  Object.assign(panel, { frame, cutout, depth: null, depthPromise: null, shape: 'flat' });
  setStatus('');
  render();
}

/** いまの形の設定。浮き彫りでも奥行きがまだなら null（切り絵で表示する） */
export function currentRelief() {
  return panel.shape === 'relief' && panel.depth ? { depth: panel.depth, strength: panel.strength } : null;
}
