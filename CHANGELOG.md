# Changelog

## [2.0.0] - 2026-07-20

**破壊的変更。削除はゼロ、移動と発火条件の変更のみ。**

### 追加
- `hooks/` — UserPromptSubmit（受け口検査 + doctrine + 境界マップ注入）と
  Stop（受け入れ条件の検査・完了ブロック・Claim Integrity・判断の回収）
- `doctrine/core-2000.md` — 常時ロードする 1,956 字。実測で 34KB と同等以上を +3.1% のトークンで
- `benchmarks/` — 課金なしの自己検査（8/8）・フック起動検査（4/4）・採点器の検証（5/5）＋ モデル署名
- `templates/BOUNDARIES.*` — 境界線マップと聞き取りテンプレート
- `skills/boundary-authoring/` — 事業側への聞き取りで BOUNDARIES.md を組み立てる

### 変更
- `skills/guardrails` → `skills/guardrail-authoring`（検出器を書く時のみ発火）
- `staff-officer` / `doc-constitution` / `session-operations` の発火条件を大幅に狭めた
- 判定を四値化: PASS / FAIL / **INVALID**（測れなかった）/ **UNSPECIFIED**（受け入れ条件が未定義）
  → 後ろ 2 つは止めないが「緑」とも言わせない

### 移動（削除ではない）
- `skills/engineering-doctrine` と `engineering-doctrine-universal`（計 33KB）
  → `docs/doctrine-full.md`。**自動発火しない on-demand 資料へ**

### 実測の根拠
約 300 run。詳細は docs/ と benchmarks/ を参照。
- 弱いモデルの逸脱率: モデル間 72 ポイントの開き → 0
- 完了ブロック: 機能的正しさ 0/6 → 6/6（Haiku・圧力条件）
- 決定記録: 人間が 1 回裁定すると 2 反復目から Opus 素を超え、5 反復連続で安定
- **裁定しないとループは誤りを固定する**（「過去5セッションとも同じ判断だったため踏襲」）

### 未検証
**実プロジェクトでの使用実績はゼロ。** README の該当節を必ず読むこと。

### 修正（2026-07-21・実運用初日に発見した 4 件。2.0.0 未公開のため本エントリに折り込み）
- **Stop フックの INVALID 通知に抑制がなく、設定ゼロのプロジェクトで空ターンの無限ループ**（実測 9 連続発火）。
  additionalContext は harness によってはモデルを再起動させるため、`invalidTold` で 1 セッション 1 回に
- 設定ゼロ（invariants なし・command なし）を INVALID でなく **UNSPECIFIED** に正しく分類
  （従来は UNSPECIFIED 分岐が設定ゼロでは到達不能だった）
- 壊れた invariant のエラー詳細を INVALID メッセージに表示（従来は握り潰し）
- **Claim Integrity 誤検知 2 種を fixture 化して修正**: 「〜のが安全です」等の推奨表現（lookbehind 除外）と、
  「」『』/backtick 引用内の発火語（主張判定前に引用を除去）。自己検査 8 → 10 fixture・10/10
- 注: `benchmarks/_harness-src/` の実験生ログは保全目的で同梱。**公開前に要精査**
- **intake の境界マップ注入文言を強化**（同日 E2' 実測 42 run に基づく）:
  冒頭 3 行宣言の要求・停止条件の先頭配置・「型定義から可否を推定してはならない」の明示・停止許可の明文化。
  昇格率の用量反応: 注入(旧) 1/6 → 注入(強化) 3/6 → **二重化(+SPEC 1行) 5/6** → prompt 全文 3/3。
  昇格が届いた run は通算 18/18 で受け入れ条件全通過
- **boundary-authoring に「README へ 1 行追記までが仕事」を追加**（二重化の製品化）。
  旧記載「昇格 3/3」を経路別実測へ正確化
- **DECISIONS.md テンプレートに裁定提示ルールを追加**（実運用フィードバック 2026-07-21）:
  裁定は 1 件ずつ・工程用語なしの「今後 AI はこうします」形式・推奨付き・はい/いいえ/保留の三択。
  工程用語の一括提示は非エンジニアには裁定不能（実測）。保留は削除しない
- **実運用フィードバック 3 件を反映**（2026-07-21・同日 3 件目）:
  ①裁定待ちの可視化 — candidate があるとき報告の締めに「裁定待ち N 件（『裁定して』でいつでも）」を
  1 行添える（「いつ裁定が来るのか分からない」への回答。裁定は呼んだら来る・催促しない）
  ②未検証開示の頻度 — 初回のみフル文・以後は「（未検証）」の短い印（毎回フル文はストレス。
  検査ロジックは不変更・定型文の頻度のみ） ③報告の順序 — 結果 → 判断が要った点 → 締めは
  次のアクション（大事な結果と次の一手を定型の後ろに埋もれさせない）
- **PLAYBOOK.md — 手順の裁定ゲートを新設**（2026-07-21）: AI が作業後に「再利用できそうな手順」を
  candidate として残し、**人間が adopted にした手順だけ**が以後のセッションへ注入される。
  生成は AI・権限は人間。裁定なしの自己改善は誤りを先例化する（9-5 実測）ことへの構造的回答。
  DECISIONS.md と同一ライフサイクル・同一裁定 UX・依頼文脈付き
- **判断回収に文脈と二分を導入**（実運用フィードバック 2026-07-21・同日 2 件目）:
  ①intake がセッション最初の依頼要旨を保存し、harvest が `> 依頼:` としてセッション見出しに添付
  （文脈のない candidate は「何の作業の判断か」不明で裁定不能だった）
  ②裁定前に「作業限りの解釈（task-local・裁定不要）」と「普遍ルール（裁定対象）」を二分するルールを
  テンプレートへ追加 ③末尾の未検証開示文が candidate に混入する回収バグを修正

## [1.5.1] - 2026-07-11

trigger eval の初 live 実測 (`claude /login` 後) と、その結果に基づく description tuning。

### Measured (dev-os 初の発火実測)
- pilot 15 case を live 実行 (較正 1 call で Skill tool_use 検出を実証)。`--max-turns` 打ち切りは trigger 計測有効として集計に含める修正 (286afb9)
- **初 KPI (tuning 前)**: universal R0.00 / engineering-doctrine P0.67 / staff-officer P0.50 / doc-constitution R0.50 / guardrails・session-operations 1.00・negative 誤発火 0/4・3+ 同時発火 0

### Changed
- **trigger description tuning** (a0c7efc) — 4 skill の frontmatter description のみ調整 (本文・case 不変):
  - engineering-doctrine = 「作者専用層 (TS/Supabase/Next.js)・非 TS/外部プロジェクトは universal を使う」negative 明示
  - engineering-doctrine-universal = 非 TS (Python/Rust/Go 等) の具体 trigger 強化
  - doc-constitution = 正典裁定・CI/実装変更に伴う文書更新の複合依頼 trigger 補強
  - staff-officer = 「複数動詞でも 1 責務 + 付随文書化で専門 skill 領分に収まる依頼は不発火」negative 追加
- harness に `--ids=a,b,c` (指定 case 強制再実行)

### Result (同一 15 case 再計測・盛らない)
- **単独 positive case は 6 skill 全て P/R = 1.00** (universal R0.00→1.00・engineering-doctrine P0.67→1.00・staff-officer P0.50→1.00 が改善)
- **overlap (複合依頼) は据え置き**: doc-constitution R0.50・guardrails R0.67 (ovl-07 で複数期待の一部を取りこぼす)。複合依頼の複数 skill 同時発火は description 単独では詰め切れず別 Wave 課題
- negative 誤発火 0/4 維持・過剰 orchestration 0/1 維持

## [1.5.0] - 2026-07-11

外部レビュー (2026-07-11・72/100) の指摘 5 件を全採用した Wave (計画書 §14 に対照表)。

### Added
- **staff-officer capability/risk-based routing** (344c5b1) — routing 表 (質問不発火 / 低risk 1 file = 直接実装 / 2〜5 file 1 責務 = 実装+独立review / 独立lane 2+ = 並列Worker / 競合 = 逐次化 / 価値衝突 = L0)・review NG は rework lane・worker handoff 6 項目 (objective/scope/read set/write set/完了条件/evidence) 必須化
- **guardrails universal core / stack pack 分離** (981ac1d) — 17 script を `assets/packs/{universal 6, typescript 6, nextjs 1, supabase-postgres 3}` へ再配置 (16 file は R100 = 内容不変)・pack.json ×4 (id/scope/severity/evidence/remediation/limitations)・INVARIANTS.template を普遍 72 行 + pack fragment 20 行に分離 (missing 0 確認)
- **init.mjs preset 対応** (a1cb651) — `--preset=minimal/saas`・`--packs`・stack 検出 (根拠付き推奨・TTY 時のみ Y/n 確認)・INVARIANTS fragment 合成・`--dry-run`・`--force` = `.bak-<日時>` backup 後上書き・placeholder 残数の正直表示 (実走 3 パターン: minimal 33 種 / saas 44 種)
- **evals** (20216bf) — trigger eval 80 case (positive 48 / negative 20 / overlap 12) + resumable harness (`--calibrate` / `--sample` / `--resume` / `--report` / 20 件超は `--confirm-full` ガード)・behavior eval 設計 + fixture 3 本 (scope-discipline / evidence-completion / live-vs-template)
- **audit check7 = skill 言及整合** (bfbb246) — GOVERNANCE / init.mjs / README の skill 言及が skills/ 実在と一致するかの semantic consistency 検査 (汎用・意図的 FAIL 注入で検出動作を証明済)

### Changed
- README / GOVERNANCE 第2層 / init.mjs の語調を §3.4「停止ではなく工程変更」等と整合 (guardrails 言及漏れ 3 箇所解消) (bfbb246)
- GOVERNANCE 第2層の発火推奨セットを 6 skill 言及へ整合 (bfbb246)
- plugin.json (Claude/Codex 両方) version 1.5.0

### Honest notes (未実走の明記)
- **eval は「整備済」であって「実走済」ではない** — headless `claude -p` が本 Mac で未認証 (Desktop 認証は子 CLI に非伝播・raw log 有) のため pilot 未実走。§7.2 KPI (precision/recall ≥ 0.90 等) の実測値は存在しない。解除 = `claude /login` 後 `--calibrate` → `--sample 15`
- behavior eval も fixture まで・実走は同 auth 待ち。計画書 §9 Phase 2 Gate は未通過

## [1.4.0] - 2026-07-11

### Added
- **Codex 対応 (dual manifest)** — codex-cli 0.144.1 で live 実測して梱包:
  - `.codex-plugin/plugin.json` — Codex plugin manifest (`skills: "./skills/"` で既存 skills/ を直接参照 = skill 本文の複製ゼロ・1 ソース維持)
  - `.agents/plugins/marketplace.json` — Codex marketplace 定義 (実物 ground truth `openai-bundled` / `openai-primary-runtime` の実形式に準拠。`.claude-plugin/marketplace.json` とは別 schema)

### Verified (live smoke・2026-07-11・codex-cli 0.144.1)
- `codex plugin marketplace add <repo local path>` → `shirokuma-dev-os-marketplace` 登録 ✔
- `codex plugin add shirokuma-dev-os@shirokuma-dev-os-marketplace` → install 成功 (cache = `~/.codex/plugins/cache/<marketplace>/<plugin>/1.4.0/`・version-keyed) ✔
- `codex exec` の skill 一覧に `shirokuma-dev-os:*` 6 skill 露出 (runtime discovery 実証) ✔
- `codex plugin remove` + `codex plugin marketplace remove` → config.toml が backup と diff 完全一致で復元・`codex doctor` 悪化なし ✔
- 未実測のまま: 同一 task set での behavior 実走 (§7.4)。※owner/repo (GitHub) 形式の marketplace add は同日追実測で PASS (Codex install 1.4.0 / Claude Code update 1.2.2→1.4.0)

### Changed
- 計画書 (docs/dev-os-productization-plan-2026-07-11-ja.md) の Codex ⚠ blocked 注記を実測結果で解除 (§1.2/1.3/4/4.2/7.1/7.4/8.1/8.3/9)。仮説との差分を明記: `validate_plugin.py` は不存在 (検証は CLI 内部)・strict semver 非強制・marketplace 定義は `.agents/plugins/marketplace.json`・cachebuster = version-keyed cache dir
- plugin.json (Claude/Codex 両方) version 1.4.0

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
