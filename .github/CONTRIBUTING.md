# Contributing to shirokuma-dev-os

このプラグインは **2 層継承構造** を持つメタフレームワークです。コントリビュート時は以下を守ってください。

## 着手前に

[GOVERNANCE.md](../GOVERNANCE.md) を必ず読んでください。**第 1 層 (専用層) と第 2 層 (配布版) の責務分離** を理解しないと、間違った層に変更を加えてしまいます。

## 還流ルール (= 子プロジェクト → 親プラグインへの教訓昇格)

新しい教訓・規律を追加する時、それが **普遍か固有か** を判定:

1. **固有名を剥けるか** — 製品名・ID・URL を消しても意味が残るなら普遍候補。残らないなら固有 (= 子プロジェクトに置く)
2. **統合チェック** — 既存規律・条と束ねられないか先に見る。新規追加は最後の手段
3. **昇格** — 普遍なら親 (= 該当 skill / template) に追記
4. **重複除去** — 昇格したら子側の元記述は親への参照に置き換える (= 1 事実 1 正典)

詳細: [GOVERNANCE.md §4](../GOVERNANCE.md)

## 層の責務

### 第 1 層 (専用層)

- `skills/engineering-doctrine/`
- `skills/doc-constitution/`
- `skills/staff-officer/`

**n=1 経験則を濃いまま保持**。スタック前提・具体例を含んでよい。

### 第 2 層 (配布版)

- `skills/engineering-doctrine-universal/`

**普遍核のみ蒸留**。特定スタック (TS / Supabase / Next.js 等) や特定経験則を完全に剥いた版。
固有名 (= しろくま / Personal / Biz 等) を絶対に含めない (= CI で検出される)。

### テンプレ層

- `templates/CLAUDE.template.md`
- `templates/INVARIANTS.template.md`
- `templates/DOC_CONSTITUTION.template.md`

placeholder `{{xxx}}` を使ってプロジェクト固有値の埋め込み箇所を示す。`{{YYYY-MM-DD}}` と `{{プロジェクト名}}` は `scripts/init.mjs` で自動置換。

## PR 提出前のチェック

```bash
# 自己整合性 audit (= GitHub Actions と同じものをローカルで)
node scripts/audit-self-integrity.mjs
```

全項目 PASS を確認してから PR を提出してください。

audit 内容:
- `plugin.json` の必須フィールド + keywords 整合
- 各 SKILL.md の frontmatter (name / description)
- GOVERNANCE.md の正典マップ ↔ 実在ファイルの整合
- 内部リンク (相対 path + `[[name]]` 形式) の破断
- templates/ の placeholder 整合
- 配布版 (第 2 層) に固有名漏れがないか

## init CLI 動作確認

新規プロジェクトテンプレが正常に展開できるか:

```bash
mkdir -p /tmp/dev-os-test
node scripts/init.mjs /tmp/dev-os-test --name=test-app
ls /tmp/dev-os-test/  # CLAUDE.md / INVARIANTS.md / DOC_CONSTITUTION.md が出るはず
rm -rf /tmp/dev-os-test
```

## 規律違反の検出 (= 配布版に固有名を入れない)

配布版 (`skills/engineering-doctrine-universal/SKILL.md`) は **業界共通用語のみ** で書く。以下の語は禁止:

- `しろくま` / `shirokuma`
- `Personal` / `Biz` (= 固有系統名として)
- 製品名 (`shirokuma-platform` 等)
- 固有リポ名 / project ID

audit script の `checkDoctrineLayers` がこれらを検出します。

## コミットメッセージ規約

```
<type>(<scope>): <summary>

[詳細]

Co-Authored-By: <co-author> <email>
```

`type`:
- `feat`: 新規スキル / 規律追加
- `fix`: 規律の訂正 / 破綻リンク修正
- `docs`: ドキュメントのみ
- `chore`: scripts / .github 等の保守
- `refactor`: 層の分離 / 重複除去 / 還流

`scope`:
- `engineering-doctrine` / `doc-constitution` / `staff-officer` / `templates` / `scripts` / `governance` 等

## 質問 / 提案

Issues で気軽に。教義 (doctrine) の解釈は哲学的議論にもなり得るので、まず Issue で対話してから PR を推奨します。
