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
- `js/geometry.js` 座標変換・マスク処理・指の動き→切り抜きの指示（純粋関数。`npm test`）
- `js/stroke-input.js` ② 確認画面の指の動き（タップ・なぞる・囲う）を受け取り、線を描く
- `js/cutout.js` 背景が透明な切り抜き画像を作る
- `js/model3d.js` 厚みのある切り絵（板を重ねる方式）・床の影・部屋の照明（RoomEnvironment）
- `js/ai-share.js` 自分の AI へ「渡す」: 切り抜き PNG の保存・共有＋お願い文（AI は呼ばない）
- `js/glb.js` 自分の AI から「受け取る」: GLB を読み込み（Draco / meshopt 対応）、高さ 25cm・底 y=0・中心にそろえる
- `js/preview.js` 3D プレビュー（OrbitControls）
- `js/ar.js` WebXR immersive-ar + hit-test で置く。2本指で回す・拡大
- ライブラリは CDN（jsDelivr）から版を固定して読み込む: three 0.186.1 / @mediapipe/tasks-vision 1.0.1

## 方針
- 写真・切り抜きは端末の中だけで扱い、どこにも送らない
- 計算部分は `geometry.js` に寄せ、変えたらテストを追加・実行する
- MediaPipe の `BrushMode` は配布ファイルから export されていないので数値で渡す（geometry.js の `BRUSH`）
- **点 1 つの指示では切り抜き AI がほとんど反応しない**（README の例は点 1 つだが、実験で 5 件中 4 件が空）。
  タップは ±1% の短い線にして渡す。確認画面ではなぞる（POSITIVE の線）・囲う（LASSO）も使える（`gestureToStrokes`）
- カメラ・WebXR は HTTPS が必要。公開は GitHub Pages
- 「本物の 3D」はアプリが AI を呼ばない。利用者が自分の AI（まず Tripo）で作った GLB を読み込むだけ（AI の料金・キーは利用者側）
- 共有（navigator.share）と AR（requestSession）はボタン直後でないと止められる → 共有用 PNG は先に作る／AR は先に始めてから 3D を作る
