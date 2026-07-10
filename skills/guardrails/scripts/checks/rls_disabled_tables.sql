-- 番人: RLS 無効テーブル検出（失敗クラス B3）
-- 返り行 = 違反。0 行を保つ。定期実行（CI db-audit / 週次）。
-- PostgreSQL / Supabase 前提。{{監視対象スキーマ}} を自プロジェクトに置換。

SELECT n.nspname  AS schema,
       c.relname  AS table,
       'RLS disabled' AS violation
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'                              -- ordinary table
  AND n.nspname IN ({{'public','app'}})            -- 監視対象スキーマ
  AND c.relrowsecurity = FALSE                     -- RLS 無効
  -- 公開anon submitを意図的に許す表があれば allowlist で除外:
  AND c.relname NOT IN ({{'__intentionally_public_table__'}})
ORDER BY 1, 2;

-- 補助: RLS は有効だがポリシーが1つも無い（=全拒否 or 設定漏れ）テーブル
-- SELECT n.nspname, c.relname, 'RLS enabled but no policy'
-- FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE c.relkind='r' AND c.relrowsecurity AND n.nspname IN ({{'public'}})
--   AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid);
