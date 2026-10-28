# PostgreSQL（Supabase を含む）

> 実地確認 2026-10-20（PostgreSQL 17・手元のバイナリ・Supabase の stub）: 攻め守り対戦 1 回。約束 6・破れた 0・ミューテーションで 4 件赤 + 二重の守り 2 件（スキーマの USAGE / 失敗の受け止め 2 段）を読み分けた。

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

## 関門（2 段）

使い捨ての環境を立てる時に `cluster_name` を付ける。`cluster_name` は起動時にしか決められず、試験の中の `SET` や接続時の `PGOPTIONS` では変えられない（2026-10-20 実測）。

```bash
docker run -d --name duel-pg -e POSTGRES_PASSWORD=duel -p 127.0.0.1:55432:5432 postgres:17 -c cluster_name=duel-disposable
# 手元のバイナリ: pg_ctl ... -o "... -c cluster_name=duel-disposable" start
```

```sql
DO $$ BEGIN
  IF current_setting('cluster_name') <> 'duel-disposable' THEN
    RAISE EXCEPTION 'not a disposable DB (no marker)';
  END IF;
  IF (SELECT count(*) FROM <必ず 1 行以上ある表>) > 0 THEN
    RAISE EXCEPTION 'not a disposable DB (has data)';
  END IF;
END $$;
```

- 「必ず 1 行以上ある表」= 本番で空になりえない表（テナント・組織・利用者の表など）。
- 自作の設定名（`duel.disposable` 等）を印にしない。`SET` で誰でも付けられる（実測で偽れた）。
- `supabase start` のように起動の引数を渡せない環境では、1 段目を「接続先が手元か」（`inet_server_addr()` が NULL か `127.0.0.1` / `::1`）に替える。
- 試験の中で表の形を一時的に変える（`ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` で書き込みを失敗させる等）なら、関門は必須。本番で走ると強い lock を取り、失敗時に制約が残る。

## 守りの層（ミューテーションで外す候補）

- 表の権限（GRANT）・スキーマへの入場（USAGE）
- 行単位セキュリティの述語（USING / WITH CHECK）
- SECURITY DEFINER 関数の内側の絞り込み（呼び出し側の値を信用していないか）
- 関数の EXECUTE 権限
- 関数の `search_path` 固定
