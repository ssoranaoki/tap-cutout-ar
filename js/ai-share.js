// 「自分の AI で本物の 3D にする」: 切り抜き画像とお願い文を、利用者の AI に渡す
// アプリは AI を呼ばない。料金・API キーは利用者側（AI native）。画像は利用者が選んだ先にだけ渡る。

export const TRIPO_URL = 'https://www.tripo3d.ai/';

// AI チャット（3D 生成の MCP をつないだ Claude / ChatGPT など）に渡すお願い文
export const AI_PROMPT = [
  'この画像に写っている物を、裏側まである 3D モデルにしてください。',
  '・形式: GLB（テクスチャは埋め込み）',
  '・向き: Y 軸が上。底を下に、正面を +Z 方向に向ける',
  '・大きさ: 何でもよい（アプリ側で高さ 25cm にそろえます）',
  '・ファイルサイズ: できれば 20MB 以下',
  'できた GLB ファイルをダウンロードできる形で渡してください。',
].join('\n');

/**
 * 背景が透明な PNG ファイルを作る。
 * 共有（navigator.share）はボタンを押した直後でないとブラウザに止められるため、
 * 画面を開いた時点で先に作っておき、ボタンではできあがったファイルを使う。
 */
export function makeCutoutFile(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('画像を作れませんでした')); return; }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      resolve(new File([blob], `cutout-${stamp}.png`, { type: 'image/png' }));
    }, 'image/png');
  });
}

/** 端末に保存する（Tripo などの Web サイトにアップロードする用） */
export function saveFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * 画像＋お願い文を共有シートで AI アプリへ送る。
 * 共有できない端末では、画像を保存してお願い文をコピーする。戻り値: 'shared' | 'saved' | 'cancelled'
 */
export async function shareToAi(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: AI_PROMPT });
      return 'shared';
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled';
      throw err;
    }
  }
  saveFile(file);
  await navigator.clipboard?.writeText(AI_PROMPT).catch(() => {});
  return 'saved';
}
