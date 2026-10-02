// ① 撮影の画面: カメラ映像を映し、タップした瞬間の 1 コマを止める
const MAX_FRAME_SIDE = 1280; // 切り抜きに使う 1 コマの最大サイズ

let stream = null;

/** 背面カメラを開く。失敗したら理由を投げる */
export async function startCamera(video) {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
}

/** カメラを止める（AR 画面はカメラを自分で使うので、先に止めておく） */
export function stopCamera(video) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  stream = null;
  video.srcObject = null;
}

/** いま映っているコマ（または読み込んだ写真）を canvas に描いて返す */
export function grabFrame(source) {
  const w = source.videoWidth || source.naturalWidth || source.width;
  const h = source.videoHeight || source.naturalHeight || source.height;
  const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 「写真から選ぶ」で選んだファイルを画像として読み込む */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
    img.src = url;
  });
}
