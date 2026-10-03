// 画面の切り替えと、各部品のつなぎ込み
import { startCamera, stopCamera, grabFrame, loadImageFile } from './camera.js';
import { loadSegmenter, segmentStrokes } from './segment.js';
import { makeCutout } from './cutout.js';
import { coverPointToSource, coverage, gestureToStrokes, thinPoints } from './geometry.js';
import { attachStrokeInput } from './stroke-input.js';
import { buildCutoutModel, disposeModel } from './model3d.js';
import { initPreview, showInPreview, startPreview, stopPreview } from './preview.js';
import { isArSupported, startAr } from './ar.js';
import { buildGlbModel, isGlb, MAX_GLB_BYTES } from './glb.js';
import { TRIPO_URL, makeCutoutFile, saveFile, shareToAi } from './ai-share.js';

const $ = (id) => document.getElementById(id);

const state = {
  frame: null,   // 止めた 1 コマ（canvas）
  cutout: null,  // { canvas, aspect, box }
  thickness: 4,
  edgeColor: '#b9732f',
  arSupported: false,
  source: 'cutout',       // 表示する 3D の元: 'cutout' | 'glb'
  glb: null,              // { buffer, name, rotation: {x, y} }（利用者の AI で作った 3D）
  cutoutFile: null,       // AI に渡す PNG（Promise）
  cutoutFileReady: null,  // 同じ PNG（できあがったもの。共有ボタン用）
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
  runSegment(gestureToStrokes([point], frame.width / frame.height));
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
  setConfirmMsg(CONFIRM_HELP);
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

const CONFIRM_HELP = '物をタップ。うまくいかなければ、なぞる・ぐるっと囲む';
let segmenting = false; // 処理中のタップは受け付けない（結果の順番が入れ替わらないように）

/** gesture: gestureToStrokes の結果（{ kind, strokes, seed }） */
async function runSegment(gesture) {
  if (segmenting) return;
  segmenting = true;
  const frame = state.frame;
  state.cutout = null;
  drawConfirm();
  $('btn-accept').disabled = true;
  setConfirmMsg('切り抜き中…（端末の中だけで処理）', true);
  try {
    const { mask, width, height, delegate, ms } = await segmentStrokes(frame, gesture.strokes, gesture.seed);
    console.info(`切り抜き(${gesture.kind}): ${delegate} ${ms}ms（マスク ${width}x${height}）`); // 実機での確認用
    if (frame !== state.frame) return; // 処理中に撮り直された
    const ratio = coverage(mask);
    const cutout = ratio > 0.002 ? makeCutout(state.frame, mask, width, height) : null;
    if (!cutout) {
      setConfirmMsg(gesture.kind === 'lasso'
        ? 'うまく切り抜けませんでした。物の上を指でなぞってみてください'
        : 'うまく切り抜けませんでした。物のまわりをぐるっと囲んでみてください');
      return;
    }
    state.cutout = cutout;
    drawConfirm();
    $('btn-accept').disabled = false;
    setConfirmMsg(ratio > 0.6
      ? '背景まで入っているかもしれません。違ったら、なぞる・囲むでやり直し'
      : '✓ 切り抜けました。違ったら、なぞる・囲むでやり直し');
  } catch (err) {
    console.error(err);
    setConfirmMsg('切り抜きの準備に失敗しました（通信を確認してください）');
  } finally {
    segmenting = false;
    strokeInput.clear();
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

// タップ・なぞる・囲う を受け取り、写真上の位置に直して切り抜く
const strokeInput = attachStrokeInput(
  $('confirm-stage'),
  $('stroke-canvas'),
  (points, rect) => {
    const f = state.frame;
    const src = points.map((p) => coverPointToSource(p.x, p.y, rect.width, rect.height, f.width, f.height));
    runSegment(gestureToStrokes(thinPoints(src), f.width / f.height));
  },
  () => !!state.frame && !segmenting,
);
$('btn-retry').addEventListener('click', () => show('screen-camera'));
$('btn-confirm-back').addEventListener('click', () => show('screen-camera'));
$('btn-accept').addEventListener('click', () => {
  // 「AI アプリへ送る」用の画像ファイルを先に作っておく
  state.cutoutFileReady = null;
  state.cutoutFile = makeCutoutFile(state.cutout.canvas);
  state.cutoutFile.then((f) => { state.cutoutFileReady = f; }).catch(() => {});
  $('ai-msg').textContent = '';
  setSource('cutout');
  show('screen-preview');
});

// ---- ③ 3D で確かめる ----
// 表示する 3D の元: 'cutout'（切り絵）か 'glb'（利用者の AI で作った 3D ファイル）
function makeModel() {
  if (state.source === 'glb') return buildGlbModel(state.glb.buffer, state.glb.rotation);
  return Promise.resolve(buildCutoutModel(state.cutout, { thickness: state.thickness, edgeColor: state.edgeColor }));
}

let previewVersion = 0;
async function rebuildPreview() {
  const version = ++previewVersion;
  try {
    const model = await makeModel();
    if (version !== previewVersion) return; // 途中で別の 3D に切り替わった
    showInPreview(model);
  } catch (err) {
    console.error(err);
    $('ar-msg').textContent = '3D を表示できませんでした';
  }
}

function setSource(source) {
  state.source = source;
  $('panel-cutout').hidden = source !== 'cutout';
  $('panel-glb').hidden = source !== 'glb';
  $('btn-back-cutout').hidden = !state.cutout;
  resetArMsg();
  rebuildPreview();
}

// 設定パネルの高さに合わせて、3D の表示範囲を空ける
new ResizeObserver(() => {
  const h = $('preview-panel').offsetHeight;
  $('screen-preview').style.setProperty('--panel-space', `${h + 92 + 8}px`);
}).observe($('preview-panel'));

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
// 切り絵なら切り抜きの確認へ、読み込んだ 3D なら撮影へ戻る
$('btn-preview-back').addEventListener('click', () => {
  show(state.source === 'cutout' ? 'screen-confirm' : 'screen-camera');
});

const AR_UNSUPPORTED = 'この端末・ブラウザは AR に未対応です（Android の Chrome で開いてください）';
function resetArMsg() {
  $('ar-msg').textContent = state.arSupported ? '' : AR_UNSUPPORTED;
}

// ---- 自分の AI で「裏側まである 3D」にする（渡す） ----
$('link-tripo').href = TRIPO_URL;
const setAiMsg = (text) => { $('ai-msg').textContent = text; };

$('btn-save-png').addEventListener('click', async () => {
  try {
    saveFile(await state.cutoutFile);
    setAiMsg('画像を保存しました。Tripo の「Image to 3D」にアップロードしてください');
  } catch {
    setAiMsg('画像を保存できませんでした');
  }
});
$('btn-share-ai').addEventListener('click', async () => {
  // 共有はボタンを押した直後でないと止められるため、ファイルは先に作ってある（state.cutoutFileReady）
  const file = state.cutoutFileReady;
  if (!file) { setAiMsg('画像を準備中です。もう一度押してください'); return; }
  try {
    const r = await shareToAi(file);
    if (r === 'saved') setAiMsg('この端末は共有に未対応のため、画像を保存し、お願い文をコピーしました');
    if (r === 'shared') setAiMsg('できた GLB をダウンロードしたら「3D ファイルを開く」で読み込みます');
  } catch {
    setAiMsg('送れませんでした');
  }
});

// ---- 自分の AI で作った 3D ファイルを読み込む（受け取る） ----
$('glb-input').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const fail = (text) => {
    setCameraMsg(text);
    $('ar-msg').textContent = text;
  };
  if (file.size > MAX_GLB_BYTES) {
    fail(`ファイルが大きすぎます（${Math.round(file.size / 1024 / 1024)}MB）。60MB 以下にしてください`);
    return;
  }
  const buffer = await file.arrayBuffer();
  if (!isGlb(buffer)) {
    fail('GLB 形式の 3D ファイルを選んでください（.glb）');
    return;
  }
  const glb = { buffer, name: file.name, rotation: { x: 0, y: 0 } };
  try {
    await buildGlbModel(buffer).then(disposeModel); // 読めるかどうかを先に確かめる
  } catch (err) {
    console.error(err);
    fail('この 3D ファイルは読み込めませんでした');
    return;
  }
  state.glb = glb;
  $('glb-name').textContent = `🧊 ${file.name}（あなたの AI で作った 3D）`;
  setCameraMsg('');
  setSource('glb');
  show('screen-preview');
});

const QUARTER = Math.PI / 2;
$('btn-rot-y').addEventListener('click', () => { state.glb.rotation.y += QUARTER; rebuildPreview(); });
$('btn-rot-x').addEventListener('click', () => { state.glb.rotation.x += QUARTER; rebuildPreview(); });
$('btn-rot-reset').addEventListener('click', () => { state.glb.rotation = { x: 0, y: 0 }; rebuildPreview(); });
$('btn-back-cutout').addEventListener('click', () => setSource('cutout'));

// ---- ④ AR で置く ----
$('btn-ar').addEventListener('click', async () => {
  if (!state.arSupported) return;
  stopPreview();
  const ui = {
    overlay: $('ar-overlay'),
    hint: $('ar-hint'),
    buttons: $('ar-buttons'),
    resetBtn: $('btn-ar-reset'),
    exitBtn: $('btn-ar-exit'),
  };
  ui.overlay.hidden = false;
  try {
    await startAr(makeModel, ui, () => {
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
  resetArMsg();
});
