# shirokuma-dev-os

> **開発の普遍原理を束ねた汎用開発 OS** — Claude Code 用プラグイン

エンジニアリング規律 (= 思考様式 + 文書運用 + 参謀フロー) を AI agent (Claude Code 等) 経由で運用する開発のための、**継承構造を持ったメタフレームワーク**。

業界の名作 (Toyota Production System / Site Reliability Engineering / Domain-Driven Design 等) を一本の幹 **「顧客の安全 > 進捗」** で統合し、AI agent が判断の瞬間に立ち止まれるよう実装してある。

**対象読者**: 日本語で開発する個人〜小規模チーム (内容は言語・スタック非依存。ドキュメントは日本語)。

**60 秒で価値を見る** → [demo/](demo/)（Intent Anchor が AI の scope drift を止める before/after・再現可能）

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-blue)](https://docs.anthropic.com/claude-code)

---

## なぜ作ったか

AI agent (Claude Code / Cursor / Aider 等) は **「楽な道」を選びがち**。

`as any` を撃つ。番人を `eslint-disable` で迂回する。「動いてるから OK」で根源を放置する。これらは個別ケースでは些細でも、**累積すると顧客の安全を侵食する**。

人間レビュー / CI ガードレールだけでは追いつかない。AI 自身が判断の瞬間に **立ち止まる装置** が要る。

本プラグインは、その装置を **6 つの思考規律 + 文書運用憲法 + 参謀フロー** という形で組み込む。

---

## 構成

```
shirokuma-dev-os/
├── GOVERNANCE.md                       ← 継承・還流の統治 (配布形態の定義)
├── CHANGELOG.md
├── .claude-plugin/
│   ├── plugin.json                     ← Claude Code プラグイン定義
│   └── marketplace.json                ← marketplace 経由インストール用
├── skills/
│   ├── engineering-doctrine/           ← 思考様式 6 規律 + Intent Anchor (第1層・実例集)
│   ├── engineering-doctrine-universal/ ← 思考様式 6 規律 + Intent Anchor (配布版・蒸留)
│   ├── doc-constitution/               ← 文書運用憲法 (7条 + Tier)
│   ├── staff-officer/                  ← 参謀フロー (5 層 × 4 ライン + 振り返り)
│   ├── session-operations/             ← マルチセッション運用の型
│   └── guardrails/                     ← 番人と品質ゲート (失敗カタログ + CI/番人雛形)
├── templates/
│   ├── CLAUDE.template.md              ← 新規プロジェクト用テンプレ (Intent Anchor 同梱)
│   ├── INVARIANTS.template.md
│   ├── DOC_CONSTITUTION.template.md
│   └── RETROSPECTIVE.template.md       ← 振り返り 5 軸 (タスク完遂ごとにコピー)
├── scripts/
│   ├── audit-self-integrity.mjs        ← 自己整合性 CI
│   └── init.mjs                        ← 新規プロジェクト初期化 CLI
└── .github/workflows/
    └── self-integrity.yml              ← GitHub Actions CI
```

---

## 6 つの思考規律 (= engineering-doctrine の中核)

一本の幹 **「顧客の安全 > 進捗・効率・楽」** から伸びる 6 規律:

| 規律 | 内容 | 業界対応 |
|---|---|---|
| 1. **逃げない** | 本物のバグはその場で潰す | Customer Safety First |
| 2. **根源** | 場当たり回避禁止・「なぜ起きたか」を実測で | **Five Whys** (Toyota) |
| 3. **実測** | RLS / 権限 / 設定は live を読む・推測禁止 | **Trust but verify** (Reagan / SRE) |
| 4. **幹** | 構造・境界線から position する | **Bounded Context** (DDD / Eric Evans) |
| 5. **やり切る** | 仕組み 1 個入れて完了にしない | **"Done is done"** (LinkedIn / Google) |
| 6. **固定** | 重要依存は完全固定 | **Pin your dependencies** (Bazel / Nix) |

判断の流れ: **規律 4 → 3 → 2 → 1** (= 構造で位置取り → 実測で裏取り → 根源を断つ → 逃げずに潰す) + 規律 5/6 で土台固定。

さらに 6 規律の前段に **Intent Anchor (意図の先出し宣言)** を置く (v1.2〜)。「skill 遵守 ≠ skill 発火」— AI の attention は目の前の Read 結果に hijack されるため、**意思決定の前**に目的と scope を宣言して anchor する。宣言フォーマットは常時ロードされる `CLAUDE.md` テンプレと Worker 指示テンプレの両方に同梱 (実証: 8 Worker 並列で scope drift 0 件)。

詳細: [skills/engineering-doctrine/SKILL.md](skills/engineering-doctrine/SKILL.md) (= 専用層) / [skills/engineering-doctrine-universal/SKILL.md](skills/engineering-doctrine-universal/SKILL.md) (= 配布版)

---

## 2 層継承構造 (= 専用層 + 配布版)

```
shirokuma-dev-os/  (= 2 層を同梱したまま配布)
        │
        ├─ 第 1 層: 作者の専用層 (n=1 経験則を濃いまま保持)
        │   └─ engineering-doctrine  ← 「規律がどんな失敗から生まれたか」の実例集として読む
        │
        └─ 第 2 層: 発火推奨セット (固有名・スタック前提を剥いた普遍核)
            └─ engineering-doctrine-universal / doc-constitution / staff-officer / session-operations
                ↑
                外部プロジェクトで実際に運用に組み込むのはこちら + templates/
```

詳細: [GOVERNANCE.md](GOVERNANCE.md)

---

## 使い方

### A. Claude Code にインストール (= プラグインとして使う)

```
# Claude Code 内で (plugin marketplace 経由・推奨)
/plugin marketplace add shirokuma-post/shirokuma-dev-os
/plugin install shirokuma-dev-os
```

インストール後、各スキル (engineering-doctrine 等) が Claude Code に登録され、判断時に自動発火する。

### A'. Codex にインストール (v1.4.0〜・実測済)

```bash
# terminal で (codex-cli 0.144.1 以降)
codex plugin marketplace add shirokuma-post/shirokuma-dev-os
codex plugin add shirokuma-dev-os@shirokuma-dev-os-marketplace
```

skill 本体は Claude Code と共通の 1 ソース (`skills/`) — 両 platform で同じ 6 skill が discovery される (2026-07-11 live 実測)。外す時は `codex plugin remove shirokuma-dev-os@shirokuma-dev-os-marketplace` → `codex plugin marketplace remove shirokuma-dev-os-marketplace`。

> ⚠️ **git clone を `~/.claude/skills/` に置くだけでは skill は登録されない。**
> 個人 skill として発見されるのは `~/.claude/skills/<skill名>/SKILL.md` の 1 階層構造のみで、
> 本 repo は skill を `skills/` 配下に入れ子で持つ **plugin 形式**。skill を発火させる導入は上の plugin install。
> clone は「読む」「templates を展開する (下記 B)」用途に使う:
>
> ```bash
> git clone https://github.com/shirokuma-post/shirokuma-dev-os.git
> ```

なお **skill の自動発火は確率的** — だからこそ B の templates 展開で Intent Anchor を常時ロード位置に置く (= 発火を運に任せない)。

### B. 新規プロジェクトに templates を展開

```bash
# CLI で 3 ファイル (CLAUDE.md / INVARIANTS.md / DOC_CONSTITUTION.md) を一括生成
cd shirokuma-dev-os   # clone した repo (置き場所は任意)
mkdir -p ~/projects/my-saas   # 展開先は既存ディレクトリであること (誤 path への生成防止)
node scripts/init.mjs ~/projects/my-saas --name=my-saas
```

実行後、生成された各ファイルの `{{...}}` placeholder を埋めればプロジェクト固有層が完成。
`RETROSPECTIVE.template.md` は init 対象外 — 大きめのタスク完遂ごとに手でコピーして 5 軸を埋める (→ `staff-officer` Phase 5)。

### C. 開発に "思想" を組み込みたい (= プラグイン使わず参考にする)

`skills/engineering-doctrine-universal/SKILL.md` を読むだけでも価値あり。業界用語へのマッピングが整理されてるので、自分のチームの規律体系に統合可能。

---

## 設計思想

### 1. 「肉と骨を分ける」

固有名 (= 製品名 / project ID / URL / 固有アーキ) は **肉** = プロジェクト側へ。「なぜそうするか = 原理」は **骨** = プラグイン側へ。

この分離があるから、複数プロジェクトで規律を二重管理せず、教訓の還流が一方向に流れる。

### 2. 「2 段階蒸留」

- **第 1 層 (専用層)**: n=1 経験則を濃いまま保持 (スタック前提・具体例含む)
- **第 2 層 (配布版)**: 普遍核だけを蒸留 (どのスタックでも使える)

第 1 層で固めてから第 2 層へ蒸留する流れ = OSS の upstream contribution と同型。

### 2.5. Dogfooding（自分の規律で自分を検品した）

このプラグインは、自分の規律を自分の開発に適用している。実例:

- **規律3「push 成功 ≠ 配布可・実測で確かめる」がリリース直前に自分のバグを止めた** —
  `claude plugin validate` は PASS したのに、install の live E2E で `plugin.json` の
  `repository` フィールド不正を検出（validate は marketplace 側しか見ないため素通りしていた）。
  「検証したから大丈夫」で出荷せず実測したから捕まえられた（→ [CHANGELOG](CHANGELOG.md) v1.2.2）。
- Intent Anchor の効果は [demo/](demo/) で before/after を再現可能にしてある。

### 3. 「番人を緩めない」

CI / lint / SecGate / pre-commit hook 等が FAIL を指摘したら **無条件で全件修正**。「動いてる」「実害なし」「既存パターン」「backlog 化」を理由として持ち出すこと自体を禁止する。

緩めた瞬間、AI agent は楽な方に流れる癖を強化学習する。これは累積で顧客の安全を侵食する。

### 4. 「発火を運に任せない」(Intent Anchor)

規律は「読まれて発火したら」効く — だが **skill 遵守 ≠ skill 発火**。発火は確率的で、subagent には届かないことがある。

だから発火装置を分離する: **意思決定の前**に目的と scope を宣言する Intent Anchor を、毎ターン必ず読まれる位置 (プロジェクト `CLAUDE.md` 最上段 + Worker 指示テンプレ冒頭) に置く。事後チェックで捕まえるのではなく、hijack が起きる前に anchor する。

---

## 業界との位置付け

| カテゴリ | 例 | 本プラグインとの違い |
|---|---|---|
| AI コーディング規約 | GitHub Copilot guidelines / `.cursorrules` | 単発雛形・継承構造なし |
| Claude Code 公式 skills | `anthropic-skills:*` | 個別 skill 集合・上下関係不在 |
| 開発組織運営フレームワーク | Spotify Backstage Tech Radar | 思想近いが AI agent 向けではない |
| エンジニアリング哲学書 | Toyota Way / SRE Book / DDD | 思想正典・実装ツール化されてない |
| **本プラグイン** | **`shirokuma-dev-os`** | **AI agent 経由運用 + 2 層継承 + 還流ルール + 発火装置 (Intent Anchor) の統合 = 類例が少ない** |

---

## 開発と還流

新しい教訓・規律が生まれたら、それが **普遍か固有か** を判定:

1. **固有名を剥けるか** — 製品名・ID を消しても意味が残るなら普遍候補
2. **統合チェック** — 既存規律と束ねられないか先に見る (新規追加は最後の手段)
3. **昇格** — 普遍なら親 (該当 skill / template) に追記
4. **重複除去** — 昇格したら子側は親への参照に置換 (1 事実 1 正典)

詳細フロー: [GOVERNANCE.md §4](GOVERNANCE.md)

---

## 開発者向け

### 自己整合性 audit

```bash
node scripts/audit-self-integrity.mjs
```

GitHub Actions で `push` / `pull_request` 時に自動実行 (= [.github/workflows/self-integrity.yml](.github/workflows/self-integrity.yml))。

### Contribution

[CONTRIBUTING.md](.github/CONTRIBUTING.md) を参照。

---

## 哲学的背景

英語の `doctrine` は「教義」= 学派の中核思想。本 6 規律は単なるベストプラクティス集ではなく、**「顧客の安全 > 進捗」という価値判断を実装の各場面で再起的に適用する思想**。

近い思想:
- **Stoicism** (古代ストア派) — 「制御可能なものに集中する」(= 規律 4)
- **Bushido** (武士道) — 「逃げない」(= 規律 1)
- **Kaizen** (改善) — 「根源を断つ」(= 規律 2)
- **Toyota Way 14 Principles** — 6 規律の統合元

---

## License

[MIT License](LICENSE) — 商用利用 OK / 改変 OK / 再配布 OK / 著作権表示のみ義務。

---

## Author

shirokuma-post — 個人事業者向け SaaS の開発で培った n=1 経験則を、固有名を剥いて配布版に蒸留した。

---

## Related

- Claude Code: <https://docs.anthropic.com/claude-code>
- Claude Agent SDK: <https://docs.anthropic.com/api/claude-code/sdk>
- 業界対応資料:
  - [Toyota Production System](https://en.wikipedia.org/wiki/Toyota_Production_System)
  - [Site Reliability Engineering Book](https://sre.google/books/)
  - [Domain-Driven Design (Eric Evans)](https://www.domainlanguage.com/ddd/)
