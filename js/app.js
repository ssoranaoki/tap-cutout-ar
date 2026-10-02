// 画面の切り替えと、各部品のつなぎ込み
import { startCamera, stopCamera, grabFrame, loadImageFile } from './camera.js';
import { loadSegmenter, segmentAt } from './segment.js';
import { makeCutout } from './cutout.js';
import { coverPointToSource, coverage } from './geometry.js';
import { buildCutoutModel } from './model3d.js';
import { initPreview, showInPreview, startPreview, stopPreview } from './preview.js';
import { isArSupported, startAr } from './ar.js';

const $ = (id) => document.getElementById(id);

const state = {
  frame: null,   // 止めた 1 コマ（canvas）
  cutout: null,  // { canvas, aspect, box }
  thickness: 4,
  edgeColor: '#b9732f',
  arSupported: false,
};

// ---- 画面の切り替え ----
function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== screen;
  if (screen === 'screen-camera') {
    startCamera($('video')).then(() => setCameraMsg('')).catch(() => {
      setCameraMsg('カメラを使えませんでした。「写真から選ぶ」なら使えます');
    });
  } else {
    stopCamera($('video'));
  }
  if (screen === 'screen-preview') startPreview(); else stopPreview();
}

function setCameraMsg(text) {
  $('camera-msg').textContent = text;
  $('camera-msg').hidden = !text;
}

// ---- ① 撮影 ----
$('camera-stage').addEventListener('click', (e) => {
  const video = $('video');
  if (!video.videoWidth) return;
  const frame = grabFrame(video);
  const point = tapToSource(e, $('camera-stage'), frame);
  state.frame = frame;
  show('screen-confirm');
  runSegment(point);
});

$('file-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    state.frame = grabFrame(await loadImageFile(file));
  } catch (err) {
    setCameraMsg(err.message);
    return;
  }
  state.cutout = null;
  drawConfirm();
  setConfirmMsg('切り抜きたい物をタップ');
  show('screen-confirm');
});

function tapToSource(e, el, frame) {
  const rect = el.getBoundingClientRect();
  return coverPointToSource(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height, frame.width, frame.height);
}

// ---- ② 切り抜きの確認 ----
function setConfirmMsg(text, busy = false) {
  $('confirm-msg').textContent = text;
  $('confirm-msg').classList.toggle('busy', busy);
}

let segmenting = false; // 処理中のタップは受け付けない（結果の順番が入れ替わらないように）

async function runSegment(point) {
  if (segmenting) return;
  segmenting = true;
  const frame = state.frame;
  state.cutout = null;
  drawConfirm();
  $('btn-accept').disabled = true;
  setConfirmMsg('切り抜き中…（端末の中だけで処理）', true);
  try {
    const { mask, width, height, delegate, ms } = await segmentAt(frame, point);
    console.info(`切り抜き: ${delegate} ${ms}ms（マスク ${width}x${height}）`); // 実機での速さの確認用
    if (frame !== state.frame) return; // 処理中に撮り直された
    const ratio = coverage(mask);
    const cutout = ratio > 0.002 ? makeCutout(state.frame, mask, width, height) : null;
    if (!cutout) {
      setConfirmMsg('うまく切り抜けませんでした。物の真ん中をタップし直してください');
      return;
    }
    state.cutout = cutout;
    drawConfirm();
    $('btn-accept').disabled = false;
    setConfirmMsg(ratio > 0.6
      ? '背景まで入っているかもしれません。違ったら別の場所をタップ'
      : '✓ 切り抜けました。違ったら別の場所をタップ');
  } catch (err) {
    console.error(err);
    setConfirmMsg('切り抜きの準備に失敗しました（通信を確認してください）');
  } finally {
    segmenting = false;
  }
}

/** 止めたコマを暗くし、切り抜いた物だけ明るく光らせて描く */
function drawConfirm() {
  const c = $('confirm-canvas');
  const f = state.frame;
  c.width = f.width;
  c.height = f.height;
  const ctx = c.getContext('2d');
  ctx.filter = state.cutout ? 'brightness(0.45) saturate(0.6)' : 'none';
  ctx.drawImage(f, 0, 0);
  ctx.filter = 'none';
  if (state.cutout) {
    const b = state.cutout.box;
    ctx.save();
    ctx.shadowColor = '#52e0b8';
    ctx.shadowBlur = Math.max(8, f.width / 60);
    ctx.drawImage(state.cutout.canvas, b.x, b.y, b.w, b.h);
    ctx.restore();
  }
}

$('confirm-canvas').addEventListener('click', (e) => {
  if (!state.frame) return;
  runSegment(tapToSource(e, $('confirm-canvas'), state.frame));
});
$('btn-retry').addEventListener('click', () => show('screen-camera'));
$('btn-confirm-back').addEventListener('click', () => show('screen-camera'));
$('btn-accept').addEventListener('click', () => {
  rebuildPreview();
  show('screen-preview');
});

// ---- ③ 3D で確かめる ----
function rebuildPreview() {
  showInPreview(buildCutoutModel(state.cutout, { thickness: state.thickness, edgeColor: state.edgeColor }));
}

$('thickness').addEventListener('input', (e) => {
  state.thickness = Number(e.target.value);
  rebuildPreview();
});
for (const sw of document.querySelectorAll('.swatch')) {
  sw.addEventListener('click', () => {
    state.edgeColor = sw.dataset.color;
    for (const s of document.querySelectorAll('.swatch')) s.setAttribute('aria-pressed', String(s === sw));
    rebuildPreview();
  });
}
$('btn-preview-back').addEventListener('click', () => show('screen-confirm'));

$('btn-ar').addEventListener('click', async () => {
  if (!state.arSupported) return;
  stopPreview();
  const model = buildCutoutModel(state.cutout, { thickness: state.thickness, edgeColor: state.edgeColor });
  const ui = {
    overlay: $('ar-overlay'),
    hint: $('ar-hint'),
    buttons: $('ar-buttons'),
    resetBtn: $('btn-ar-reset'),
    exitBtn: $('btn-ar-exit'),
  };
  ui.overlay.hidden = false;
  try {
    await startAr(model, ui, () => {
      ui.overlay.hidden = true;
      show('screen-preview');
    });
  } catch (err) {
    console.error(err);
    ui.overlay.hidden = true;
    $('ar-msg').textContent = 'AR を始められませんでした（カメラの許可を確認してください）';
    startPreview();
  }
});

// ---- 起動 ----
initPreview($('preview-stage'));
show('screen-camera');
// モデルは裏で先に読み込んでおく（最初のタップを速くする）
loadSegmenter().catch(() => setCameraMsg('切り抜き AI を読み込めませんでした。通信を確認してください'));
isArSupported().then((ok) => {
  state.arSupported = ok;
  $('btn-ar').disabled = !ok;
  $('ar-msg').textContent = ok ? '' : 'この端末・ブラウザは AR に未対応です（Android の Chrome で開いてください）';
});
