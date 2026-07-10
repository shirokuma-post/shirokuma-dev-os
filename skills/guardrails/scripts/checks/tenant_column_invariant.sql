-- 番人: テナント列の不変条件チェック（失敗クラス B4 テナント越境）
-- 返り行 = 違反。テナント表は ①列 NOT NULL ②DEFAULT 禁止 ③自動刻みトリガ を満たすべき。
-- {{tenant_col}} = 顧客ID/組織ID列名（例: agency_id, org_id, tenant_id）に置換。
-- {{trigger_fn}} = BEFORE INSERT で列を刻むトリガ関数名に置換。

WITH tenant_tables AS (
  -- tenant 列を持つ業務データ表を対象に
  SELECT c.oid, n.nspname AS schema, c.relname AS table
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = '{{tenant_col}}'
  WHERE c.relkind = 'r' AND n.nspname IN ({{'public','app'}}) AND a.attnum > 0
)
SELECT t.schema, t.table, v.violation FROM tenant_tables t
CROSS JOIN LATERAL (
  VALUES
    -- ① NOT NULL でない
    ('tenant col is NULLABLE',
     EXISTS (SELECT 1 FROM pg_attribute a
             WHERE a.attrelid=t.oid AND a.attname='{{tenant_col}}' AND a.attnotnull=FALSE)),
    -- ② DEFAULT が付いている（テスト残骸 default = 越境の入口）
    ('tenant col has DEFAULT',
     EXISTS (SELECT 1 FROM pg_attrdef d JOIN pg_attribute a
               ON a.attrelid=d.adrelid AND a.attnum=d.adnum
             WHERE d.adrelid=t.oid AND a.attname='{{tenant_col}}')),
    -- ③ 自動刻みトリガが無い
    ('missing auto-fill trigger',
     NOT EXISTS (SELECT 1 FROM pg_trigger tg
                 WHERE tg.tgrelid=t.oid AND tg.tgfoid='{{trigger_fn}}'::regproc))
) AS v(violation, is_violation)
WHERE v.is_violation
ORDER BY 1,2;
