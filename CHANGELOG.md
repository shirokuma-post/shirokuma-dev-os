# Changelog

## [1.2.1] - 2026-07-08

### Fixed
- **README のインストール導線** — `git clone` を `~/.claude/skills/` に置く方法では skill が登録されない（個人 skill の発見は `<skill名>/SKILL.md` の 1 階層のみ・本 repo は plugin 形式）。主導線を `/plugin install` に変更し、clone は「読む / templates 展開」用と明記
- GOVERNANCE 継承図の下流例から固有プロジェクト名を除去（generic 化）
- v1.2.0 / v1.2.1 の git tag 付与開始

## [1.2.0] - 2026-07-08

### Added
- **Intent Anchor（意図の先出し宣言）** — 「skill 遵守 ≠ skill 発火」への対策装置。原理は `engineering-doctrine`(+universal) の新節、実配置は `templates/CLAUDE.template.md` 最上段 + `staff-officer` Worker 指示テンプレ冒頭（実証: 8 Worker 並列で scope drift 0 件）
- **skills/session-operations** — マルチセッション運用の型（1ドメイン=1セッション / 起動プロトコル30秒 / 撤退シグナル / handoff / 共有 index 書込直列化）
- **staff-officer Phase 5（振り返り 5 軸）** + `templates/RETROSPECTIVE.template.md` — 整備物の自己更新サイクル
- **staff-officer**: Worker 指示テンプレに「## 禁止」標準 slot（正典 blocklist / git・CI 設定の無断変更禁止 / 指示外の"ついで改善"禁止）/ SecGate に「diff の外」チェック（配布コピー・hook・生成物の grep 横断）/ Phase 4 に統合後の実測 verify
- **doc-constitution 7 条** — 常時ロード文書のサイズ上限 + archive 運用（超過分は黙って落ちる = 静かな嘘）
- **engineering-doctrine(+universal) 規律 3** — 「計画・起案も一次資料 first」を追加
- `.claude-plugin/marketplace.json` / `CHANGELOG.md`

### Changed
- **GOVERNANCE**: 配布形態を「両層同梱」に確定（第 1 層 = 濃い実例集・発火推奨セットは universal + doc-constitution + staff-officer + session-operations）/ 還流を月次ルーティン化 / 「git 管理外」の旧記述を修正
- **README**: 構成図修正（`.claude-plugin/plugin.json`）・対象読者の明記・Intent Anchor を設計思想に追加
- staff-officer の「3 段分離テンプレ」参照を自己完結の記述に変更（外部参照切れ解消）

## [1.1.0] - 2026-06-25
- 業界用語マッピング / 配布版 `engineering-doctrine-universal` / 自己整合性 audit CI / init CLI / OSS 公開準備

## [1.0.0] - 2026-05-31
- 初版（engineering-doctrine / doc-constitution / staff-officer / GOVERNANCE / templates 3 点）
