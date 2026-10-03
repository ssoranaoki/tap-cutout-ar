# 引き継ぎメモ

（本来は `.claude/handoff.md` に置く方針。環境の制約で `.claude/` に書けなかったため、プロジェクト直下に置いている）

## 現在の状況
- 試作 1 版: GitHub Pages で公開済み https://ssoranaoki.github.io/tap-cutout-ar/ （push はユーザーが Windows から `git push`）
  - 2026-10-03 Android 実機で全工程を確認済み（切り抜き／3D／AR で置く／2本指／画面録画）
- 切り抜きは Web Worker（GPU 優先・768px）。PC で約1.4秒。実機の速さは Chrome コンソールの「切り抜き: GPU 〇〇ms」
- 2 版（AI native の本題）を実装・PC で確認済み・未 push:
  - 渡す: 3D 画面の「🤖 自分の AI で裏側まである 3D にする」欄 → 画像を保存／Tripo を開く／AI アプリへ送る（お願い文つき）
  - 受け取る: 「🧊 3D ファイルを開く」（撮影画面と 3D 画面）で GLB を読み込み → 大きさ・底・中心を自動でそろえる → 向きを直すボタン → AR
  - PC で確認: Khronos のサンプル（Duck / DamagedHelmet）表示・向き直し・GLB でないファイルのエラー・PNG 保存
- 切り抜きの失敗が多い件を修正（未 push）: 原因は「タップを点 1 つで渡していた」こと。点 1 つだと AI がほとんど反応しない
  （机の写真の 4 物体で全滅、短い線なら 5/5 成功）。タップは短い線に変換。確認画面でなぞる・囲うも使えるようにした
  - PC で確認: 机の写真でタップ（マグ）・囲う（マグ）・なぞる（本 1 冊だけ）すべて成功
- 確認方法の注意: MulmoClaude の artifacts 配信は HTML 以外 404・CSP あり → Playwright の context.route で /api/files/raw?path=projects/tap-cutout-ar/... に差し替え（キャッシュ無効化も）

## 次にやること
1. ユーザーが `git push` → Android で確認: 切り抜きの成功率（タップ・なぞる・囲う）、画像を保存 → Tripo で 3D 化 → GLB をダウンロード → 3D ファイルを開く → 向き → AR
2. Tripo の GLB の向き・大きさ・ファイルサイズを記録し、向きの初期値やお願い文を調整する

## 保留中の判断
- アプリ名（仮: 切り抜きAR / tap-cutout-ar）
- app.js が約 310 行。次に大きく触るとき、AI 連携（渡す・受け取る）部分を別ファイルに分ける
- 複数体を並べる、ふちのなめらかな立体、iPhone 対応（model-viewer + AR Quick Look）
