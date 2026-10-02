# 引き継ぎメモ

（本来は `.claude/handoff.md` に置く方針。環境の制約で `.claude/` に書けなかったため、プロジェクト直下に置いている）

## 現在の状況
- 試作 1 版を実装（Android の Chrome 向け）。リポジトリは未作成・未公開
- PC の Edge（Playwright）で確認済み: 写真から選ぶ → タップで切り抜き（初回 約5秒）→ 厚みのある切り絵の 3D を指で回す
- AR（④）は PC では未対応表示になるため未確認。Android 実機で確認が必要
- 確認時の注意: MulmoClaude の artifacts 配信は HTML 以外 404・CSP あり → Playwright の page.route で /api/files/raw?path=projects/tap-cutout-ar/... に差し替えて確認した

## 次にやること
1. GitHub にリポジトリ `tap-cutout-ar` を作り、ユーザーが Windows から push → GitHub Pages を有効化
2. Android 実機で確認: カメラでタップ → 切り抜き速度、AR で置く・2本指で回す/拡大・置き直す・終わる
3. 撮影（画面録画）で使えるか確認

## 保留中の判断
- 切り抜き処理を Web Worker に移すか（今は処理中に画面が止まる）
- アプリ名（仮: 切り抜きAR / tap-cutout-ar）
- 複数体を並べる（次の版）、iPhone 対応（model-viewer + AR Quick Look）
