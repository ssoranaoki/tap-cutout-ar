# 切り抜きAR（タップで切り抜いて AR で置く）

スマホのカメラに映った物をタップ → その物だけ切り抜く → 厚みのある切り絵の 3D にする → 机や床に AR で置いて写真・動画を撮る Web アプリ。
AI native 設計（サービス側は AI の料金を払わない・写真を預からない）。バイブコーディングで進める。

- 引き継ぎ: `handoff.md`（作業前に必ず読む。`.claude/` に書けない環境のため直下に置いている）
- 画面の見本: `../../artifacts/html/2026/10/webar-cutout-mock.html`
- 対象: まず Android の Chrome（WebXR）。iPhone（AR Quick Look）は後回し

## 構成
- `js/app.js` 画面の切り替えとつなぎ込み
- `js/camera.js` カメラ・1コマの取得・写真の読み込み
- `js/segment.js` 切り抜きの窓口（画面側）。写真を長い辺 768px に縮めて Worker に渡す
- `js/segment-worker.js` 切り抜き本体（Web Worker。MediaPipe Interactive Segmenter v2 / tasks-vision 1.0.1。端末内で動く）
  - モジュール Worker なので `forVisionTasks(場所, true)`（ES モジュール版 Wasm）が必須
  - GPU 優先、失敗したら CPU。setImage は軽く、重いのは segment（タップし直しで速くはならない）
- `js/geometry.js` 座標変換・マスク処理（純粋関数。`npm test`）
- `js/cutout.js` 背景が透明な切り抜き画像を作る
- `js/model3d.js` 厚みのある切り絵（板を重ねる方式）と床の影
- `js/preview.js` 3D プレビュー（OrbitControls）
- `js/ar.js` WebXR immersive-ar + hit-test で置く。2本指で回す・拡大
- ライブラリは CDN（jsDelivr）から版を固定して読み込む: three 0.186.1 / @mediapipe/tasks-vision 1.0.1

## 方針
- 写真・切り抜きは端末の中だけで扱い、どこにも送らない
- 計算部分は `geometry.js` に寄せ、変えたらテストを追加・実行する
- MediaPipe の `BrushMode` は配布ファイルから export されていないので数値（1 = POSITIVE）で渡す
- カメラ・WebXR は HTTPS が必要。公開は GitHub Pages
