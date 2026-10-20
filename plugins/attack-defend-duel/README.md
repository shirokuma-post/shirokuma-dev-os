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

## 必要なもの

- Claude Code
- 攻め役の AI（例: Codex CLI。別契約）
- 使い捨ての環境（手元の DB・コンテナ・エミュレータ）

本体の説明は `skills/attack-defend-duel/SKILL.md` にあります。
