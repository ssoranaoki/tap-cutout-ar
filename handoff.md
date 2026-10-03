# 引き継ぎメモ

（本来は `.claude/handoff.md` に置く方針。環境の制約で `.claude/` に書けなかったため、プロジェクト直下に置いている）

## 現在の状況
- 試作 1 版を実装（Android の Chrome 向け）。GitHub Pages で公開済み: https://ssoranaoki.github.io/tap-cutout-ar/ （push はユーザーが Windows から）
- 2026-10-03 Android 実機で全工程を確認済み: カメラでタップ→切り抜き／3D で回す・厚み・色／AR で白い輪→タップで置く／2本指で回す・拡大／画面録画で撮影
- PC の Edge（Playwright）で確認済み: 写真から選ぶ → タップで切り抜き → 厚みのある切り絵の 3D を指で回す
- 切り抜きを Web Worker に移した（処理中も画面は止まらない。くるくる回る印つき）。GPU 優先＋写真を 768px に縮めて 約5秒 → 約1.3〜1.5秒（PC）
  - 実機の速さは Chrome のコンソールに「切り抜き: GPU 〇〇ms」と出る
- AR（④）は PC では未対応表示になるため未確認。Android 実機で確認が必要
- 確認時の注意: MulmoClaude の artifacts 配信は HTML 以外 404・CSP あり → Playwright の page.route で /api/files/raw?path=projects/tap-cutout-ar/... に差し替えて確認した

## 次にやること
1. 次の版の内容を決める（候補: 複数体を並べる／ふちのなめらかな立体／利用者の AI で作った本物の 3D を読み込む／iPhone 対応）

## 保留中の判断
- アプリ名（仮: 切り抜きAR / tap-cutout-ar）
- 複数体を並べる（次の版）、iPhone 対応（model-viewer + AR Quick Look）
