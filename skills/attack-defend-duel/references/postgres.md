# PostgreSQL（Supabase を含む）

## 使い捨ての環境

どちらか。本番と同じスキーマ（データ無し）を流す。

```bash
# A. コンテナ
docker run -d --name duel-pg -e POSTGRES_PASSWORD=duel -p 127.0.0.1:55432:5432 postgres:17
URL="postgresql://postgres:duel@127.0.0.1:55432/postgres"

# B. 手元のバイナリ (コンテナが使えない時)
export LC_ALL=C   # 全角を含む SQL で locale 起因の失敗を避ける
initdb -D "$RUN/pg" -U postgres -A trust -E UTF8 --no-locale
pg_ctl -D "$RUN/pg" -w -o "-k $RUN -p 55432 -c listen_addresses=''" start
URL="postgresql:///postgres?host=$RUN&port=55432&user=postgres"
```

- スキーマ: `pg_dump --schema-only` の出力、またはマイグレーションを順に流す。
- Supabase: 本番には `anon` / `authenticated` / `service_role` の役と `auth.uid()` などの関数がある。素の Postgres には無いので、**最小の stub**（3 つの役・`auth.users`・`auth.uid()` が `request.jwt.claims` の `sub` を返す関数）を先に流す。Supabase CLI の `supabase start` を使えば stub は要らない。

## 役（身元）の切り替え

1 つのトランザクションの中で:

```sql
SELECT set_config('request.jwt.claims', json_build_object('sub', '<利用者のid>', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- ここで試す
RESET ROLE;
```

- データを作る（seed）のは、行単位セキュリティを越えられる接続役（postgres など）で、役を切り替える前に行う。
- 権限で拒否される手筋は `EXCEPTION WHEN insufficient_privilege` で受けて次へ進む。
- 試験は `BEGIN` で始め `ROLLBACK` で終える。実行は `psql -v ON_ERROR_STOP=1 -f`。

## 関門

```sql
DO $$ BEGIN
  IF (SELECT count(*) FROM <必ず 1 行以上ある表>) > 0 THEN
    RAISE EXCEPTION 'not a disposable DB';
  END IF;
END $$;
```

- 「必ず 1 行以上ある表」= 本番で空になりえない表（テナント・組織・利用者の表など）。
- 試験の中で表の形を一時的に変える（`ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` で書き込みを失敗させる等）なら、関門は必須。本番で走ると強い lock を取り、失敗時に制約が残る。

## 守りの層（ミューテーションで外す候補）

- 表の権限（GRANT）・スキーマへの入場（USAGE）
- 行単位セキュリティの述語（USING / WITH CHECK）
- SECURITY DEFINER 関数の内側の絞り込み（呼び出し側の値を信用していないか）
- 関数の EXECUTE 権限
- 関数の `search_path` 固定
