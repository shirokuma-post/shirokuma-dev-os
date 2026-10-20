# attack-defend-duel

守りの約束（行単位の権限・役ごとの権限・取得量の上限・記録の改ざん防止など）が本当に破れないかを確かめるスキル 1 本だけのプラグインです。フックは入りません。

- **攻め役**: 別の AI（Codex など）が、約束を破る試験を書く
- **審判役**: Claude が試験を全部読み、使い捨ての環境で流して判定する
- 破れたら守りを直し、守りを 1 か所ずつわざと外して試験が効くかを確かめ（ミューテーション）、CI に固定する

本番・共有のステージングには使いません。全ての試験に「本番に流れたら止まる関門」を入れます。

## 入れ方

Claude Code:

```
/plugin install attack-defend-duel --marketplace shirokuma-post/shirokuma-dev-os
```

（Claude Code 2.1.275 より前は 2 手: `/plugin marketplace add shirokuma-post/shirokuma-dev-os` → `/plugin install attack-defend-duel@shirokuma-dev-os-marketplace`）

Codex:

```
codex plugin marketplace add shirokuma-post/shirokuma-dev-os
codex plugin add attack-defend-duel@shirokuma-dev-os-marketplace
```

`shirokuma-dev-os`（開発工程の門番・フック付き）を入れなくても単独で動きます。

## 対応する環境

| 守りがある所 | 参照 |
|---|---|
| PostgreSQL の行単位セキュリティ（Supabase を含む） | `skills/attack-defend-duel/references/postgres.md` |
| MySQL / MariaDB のアカウントごとの権限・ビュー | `references/mysql.md` |
| Firebase のセキュリティルール | `references/firebase.md` |
| アプリの API（DB 側に守りが無い時） | `references/http-app.md` |

4 つとも 2026-10-20 に実地で 1 回ずつ回しています（各参照の冒頭に実測の内容）。

共通の参照: `references/promises.md`（約束の一覧・書き漏れを防ぐ）/ `references/ci.md`（CI に固定する雛形）

## 実測

- **見つける力**: 目立たない穴を仕込んだ題材 2 つ（アプリの API・Firestore のルール）を、穴の中身を知らせずに攻め役へ渡した → 仕込んだ 4 個を 4 個とも発見・誤った指摘 0。小さな測定なので、どんな穴でも見つかる保証ではありません
- **試験が効くか**: 4 環境で、守りを 1 か所ずつ外した版を流し、全件で試験が赤になることを確認
- **関門**: 2 段（環境の印 + データ 0 件）。印は試験の中から書き換えられない設定を使う（PostgreSQL の `cluster_name`・MySQL の `report_host`）
- **発火**: `tests/run-trigger.mjs` で 10/10（守りを攻めて確かめる依頼 5 件で発火・無関係な依頼 5 件で発火しない）

## 必要なもの

- Claude Code
- 攻め役の AI（例: Codex CLI。別契約）
- 使い捨ての環境（手元の DB・コンテナ・エミュレータ）

本体の説明は `skills/attack-defend-duel/SKILL.md` にあります。
