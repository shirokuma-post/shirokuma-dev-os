# CI に固定する（GitHub Actions の雛形）

> 2026-10-20: `ALTER SYSTEM SET cluster_name` → 再起動で印が付き関門が通ることは手元の PostgreSQL 17 で確認。**GitHub Actions 上での実走はまだ**（`docker restart` で services の container を再起動する所を含む）。最初に使う時に 1 回確かめる。

破れた約束の試験は、直したあと CI で毎回走らせる。直した守りが後の変更で戻った時に、赤で気づくため。

## 決まり

- CI の中で使い捨ての環境を立てる。本番・ステージングの接続文字列を CI の secret に置かない（この試験には要らない）
- 環境には関門の印を付けて立てる（`cluster_name` / `report_host` / `demo-` プロジェクト）
- 試験は **BROKEN が 1 件でもあれば 0 以外で終わる**。console に出すだけの試験は CI で緑になる
- seed は試験の中で作り、最後に消す（または環境ごと捨てる）
- 攻め役が書いた試験は、取り込む前に人か審判役が全部読む

## PostgreSQL（Supabase を含む）

```yaml
jobs:
  duel-postgres:
    runs-on: ubuntu-latest
    services:
      pg:
        image: postgres:17
        env: { POSTGRES_PASSWORD: duel }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 2s --health-retries 30
    steps:
      - uses: actions/checkout@v4
      # services は起動の引数を渡せないので、印は再起動で付ける
      - run: |
          psql "postgresql://postgres:duel@127.0.0.1:5432/postgres" -c "ALTER SYSTEM SET cluster_name = 'duel-disposable'"
          docker restart "${{ job.services.pg.id }}"
          until pg_isready -h 127.0.0.1 -U postgres; do sleep 1; done
      - run: psql "postgresql://postgres:duel@127.0.0.1:5432/postgres" -v ON_ERROR_STOP=1 -f schema.sql
      - run: psql "postgresql://postgres:duel@127.0.0.1:5432/postgres" -v ON_ERROR_STOP=1 -f checks/duel_check.sql
```

- `cluster_name` を `ALTER SYSTEM` で付ける時は、接続できる人なら誰でも付けられる。CI の使い捨ての環境では問題ないが、共有の DB にこの手順を流さない
- Supabase の役（`anon` / `authenticated` / `service_role`）を使う試験は、スキーマの前に stub を流す（`postgres.md`）

## MySQL

```yaml
      - run: |
          docker run -d --name duel-my -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -p 127.0.0.1:3306:3306 mysql:8.4 --report-host=duel-disposable
          until mysqladmin -h127.0.0.1 -uroot ping >/dev/null 2>&1; do sleep 1; done
          mysql -h127.0.0.1 -uroot < schema.sql
          MYSQL_HOST=127.0.0.1 MYSQL_PORT=3306 bash checks/duel_check.sh
```

## Firebase（ルール）

```yaml
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: "21" }
      - run: npm ci
      - run: npx firebase emulators:exec --only firestore --project demo-duel "node checks/duel.test.mjs"
```

`emulators:exec` は試験の終了コードをそのまま返す。

## アプリの API

```yaml
      - run: npm ci
      - run: |
          PORT=3999 node server.mjs &
          until curl -s -o /dev/null http://127.0.0.1:3999/; do sleep 0.5; done
          BASE_URL=http://127.0.0.1:3999 bash checks/duel_check.sh
```

アプリが DB を使うなら、上の DB の手順で使い捨ての DB を先に立て、アプリをそこへ繋ぐ。

## 取り込む前の確かめ

1. 今の守りで緑になる
2. 直す前の守り（または守りを 1 か所外した版）で赤になる
3. 関門が、印の無い環境・データのある環境の両方で止まる
