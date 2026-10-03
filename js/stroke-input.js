// ② 切り抜きの確認画面で、指の動き（タップ・なぞる・囲う）を受け取り、動かしている間は線を描く
// 座標は「要素の左上からの CSS ピクセル」で返す（写真上の位置への変換は app.js が行う）

/**
 * target: 指の動きを受け取る要素
 * overlay: 線を描く canvas（target と同じ位置・大きさに重ねておく）
 * onGesture(points, rect): 指を離したときに呼ばれる。points = [{x, y}]
 * isEnabled(): false の間は受け付けない（切り抜き処理中など）
 */
export function attachStrokeInput(target, overlay, onGesture, isEnabled = () => true) {
  const ctx = overlay.getContext('2d');
  let points = null;
  let rect = null;

  const resizeOverlay = () => {
    const r = overlay.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    overlay.width = Math.round(r.width * dpr);
    overlay.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!points || points.length < 2) return;
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 9;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.strokeStyle = '#52e0b8';
    ctx.lineWidth = 5;
    ctx.stroke();
  };

  const toLocal = (e) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top });

  target.addEventListener('pointerdown', (e) => {
    if (!isEnabled() || !e.isPrimary) return;
    rect = target.getBoundingClientRect();
    resizeOverlay();
    points = [toLocal(e)];
    target.setPointerCapture(e.pointerId);
  });
  target.addEventListener('pointermove', (e) => {
    if (!points || !e.isPrimary) return;
    points.push(toLocal(e));
    draw();
  });
  const finish = (e) => {
    if (!points || !e.isPrimary) return;
    const done = points;
    points = null;
    if (e.type === 'pointercancel') { draw(); return; }
    onGesture(done, rect);
  };
  target.addEventListener('pointerup', finish);
  target.addEventListener('pointercancel', finish);

  // 切り抜きが終わったら線を消す
  return { clear: () => ctx.clearRect(0, 0, overlay.width, overlay.height) };
}
