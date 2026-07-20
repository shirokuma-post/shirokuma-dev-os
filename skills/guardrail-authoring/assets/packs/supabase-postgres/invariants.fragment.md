# INVARIANTS fragment — supabase-postgres (RLS / PostgREST / マルチスキーマ DB) 固有の不変条件

> `templates/INVARIANTS.template.md` に合成する断片。見出し番号は本体の節番号に対応し、同名節の表末尾に行を追記する形で合成する（§2 §3 のように本体側が空の節は表ごと持ち込む）。
> PostgreSQL (特に Supabase/PostgREST 構成) を DB に使う場合のみ適用。

## 2. 性能核

| ルール | 詳細 |
|---|---|
| **(RLS) 権限式は実行計画でキャッシュされる形に** | {{例: auth.uid() は (SELECT auth.uid()) で initplan 化}} |
| **1 テーブル × 1 role × 1 cmd で 1 ポリシー** | 重複ポリシーを避ける（評価コスト増） |
| **owner 権限ポリシーは認証済みロール限定** | `TO public` 禁止、`TO authenticated` 等に絞る |
| **1 リクエストの DB クエリ数が多いと設計レビュー** | 例: 4個以上は N+1 を疑う |
| **cron/worker の副作用 UPDATE はスロットル** | dispatch 毎の無条件 UPDATE 禁止。{{例: Redis スロットル}} |
| **頻出 WHERE には index** | {{例: partial index / CREATE INDEX CONCURRENTLY}} |

## 3. DB アクセス

| ルール | 詳細 |
|---|---|
| **(マルチスキーマ) スキーマを必ず明示** | {{例: .schema('xxx')}}。忘れると別スキーマを参照して空振り |
| **migration は集約ディレクトリに記録** | DB 直接 DDL 後も追記。正典 = {{migrations ディレクトリ}} |
| **共有テーブルを優先、個別新設は抑制** | 新規モジュールは {{共有テーブル}} を使う。安易な個別テーブル新設禁止 |
| **固有カラムは命名規約で衝突回避** | {{例: {module}_xxx 形式}} |
| **廃止モジュールのスキーマを安易に DROP しない** | {{例: PostgREST schema cache 連鎖障害}}。空でも CREATE 状態維持 |
