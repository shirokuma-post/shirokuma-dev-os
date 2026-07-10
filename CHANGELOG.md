# Changelog

## [1.3.0] - 2026-07-11

### Added
- **skills/guardrails** — 番人（番犬）と品質ゲートの型を port（source = shirokuma_SaaS hub repo `skills/shirokuma-dev-os/guardrails/` の snapshot・本文無変更 port）。収録:
  - `SKILL.md`（中核思想「1失敗クラス = 1番人」+ 5層の防御線: pre-commit / CI ゲート / デプロイ前 / 実行時番犬 / 多層防御）+ `VALIDATION.md`（実機検証ログ）
  - `references/` 7 本（failure-catalog = 失敗クラス→恒久対策の正典 / launch-readiness / type-safety-ratchet / supply-chain-and-sast / observability-slo / resilience-and-delivery / maturity-roadmap）
  - `scripts/` 実装雛形 17 本（gitleaks / lefthook / CI workflow / 禁止パターン grep / any ラチェット / RLS・テナント越境 SQL / maxDuration・依存ドリフト・死活スモーク / dependabot / SAST・DAST / semgrep ルール / SLO 定義 / restore-drill）
- plugin.json: keywords に `guardrails` / `failure-catalog` 追加・description に guardrails を反映

### Changed
- port 時の変更は旧 skill 名参照の追従 2 箇所のみ（`staff-mode` → `staff-officer`: SKILL.md 関連節 / VALIDATION.md 未検証節）。checklist・判定ロジック・references 本文は 1 byte も変更なし（md5 一致で確認）

## [1.2.2] - 2026-07-08

### Fixed
- **plugin.json `repository` を string 化** — object 形式 (npm 流) だと `claude plugin install` の manifest validation で reject される。**live E2E で検出** (`claude plugin validate` は marketplace.json しか見ないため素通りしていた)
- marketplace.json に `metadata.description` 追加 (validate warning 解消)

### Verified (live E2E)
- `claude plugin marketplace add shirokuma-post/shirokuma-dev-os` → GitHub clone + validate + 登録 ✔
- `claude plugin install shirokuma-dev-os@shirokuma-dev-os-marketplace` → install 成功 (scope: user) ✔

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
