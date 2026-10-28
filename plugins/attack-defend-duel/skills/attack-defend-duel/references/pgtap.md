> 未実走 (2026-10-20 時点・手元で回していない)

# pgTAP に固定する

共通の取り込み条件は [ci.md](ci.md)、DB の守りの層は [postgres.md](postgres.md)。ここでは、確定した試験を標準の pgTAP と `supabase_test_helpers` の形に直す差分を書く。新しい攻め方を CI で考えさせない。

## 準備と置き場所

1. 専用の作業場所で `supabase start` を立てる。普段の開発用データも使わない。CLI と補助関数の版を固定し、使った版を結果に残す。
2. 本番と同じスキーマを流す。自動の seed は止め、関門が見る表は空にしておく。既存データを消して空に見せる手順にはしない。
3. `supabase/tests/database/` に、共通準備と約束ごとの SQL を置く。共通準備は先に並ぶ名前にする。準備の file にも、DDL より前に関門を置く。
4. `pgtap` は `extensions` スキーマで有効にする。補助関数は `basejump-supabase_test_helpers` の配布物を使う。導入方法は[補助関数の手引き](https://supabase.com/docs/guides/local-development/testing/pgtap-extended)で確かめる。導入元・版を固定し、試験の中で外から SQL を取って実行しない。

補助関数は試験専用の準備で入れる。本番向けのマイグレーションへ混ぜない。共通準備で入れた拡張を巻き戻すと後の file から見えなくなるため、準備と各試験のトランザクションを分ける。準備だけの緑を、約束が守れた数には含めない。

## 関門（2 段）

**全 SQL file の先頭で、データ作成・補助関数の導入・役の切り替えより前に、例外で止める**。`ok(false)` だけでは SQL が続くため、関門の代わりにならない。

- 1 段目: 起動時の印があるか。指定できる時は [postgres.md](postgres.md) の `cluster_name`。指定できない時は、実行前のラッパーで CLI が今回立てた手元の DB の URL と一致するか確かめる。URL を解析し、ホストが `localhost` / `127.0.0.1` / `::1` のいずれか、ポートも今回の値であることを検査する。外部 DB を選ぶオプションは渡さない。
- 各 SQL からは、接続情報と起動したコンテナの対応も検査する。コンテナ内の DB から見える相手はループバックとは限らない。`inet_server_addr()` が手元の値になると決め付けず、最初に読み取りだけで測る。対応を立証できない時は止める。試験から `SET` できる印を根拠にしない。
- 2 段目: 本番で必ず 1 件以上ある表が 0 件か、管理側の接続で直接数える。RLS で隠れて 0 件になった値は使わない。表が無い・権限が無い場合も止める。

1 段目をラッパーで受け持つ時は、その検査と SQL の実行を 1 つの入口にまとめ、各 file の単独実行でも通す。印の無い接続・データ 1 件の状態で別々に止まり、何も変更されないことを先に確かめる。外の接続先は、通信する前の URL 検査で止める。

## 1 約束の形

以下は**段取りの雛形**。山括弧は対象のスキーマと約束から埋める。攻めの SQL や対象名はここには書かない。

```sql
BEGIN;
-- ここで関門を 2 段とも検査し、不一致なら RAISE EXCEPTION
SELECT plan(2);
SELECT tests.create_supabase_user('actor_a');
SELECT tests.create_supabase_user('actor_b');
-- 管理側で合成データを作る。持ち主の id は tests.get_supabase_uid() で得る
SELECT tests.authenticate_as('actor_a');
SELECT results_eq(
  $$ <許可される操作の結果を読む SQL> $$,
  $$ <期待する結果の SQL> $$,
  'P1 CONTROL'
);
SELECT tests.authenticate_as('actor_b');
SELECT is(
  (<対象の状態から得た真偽値>),
  true,
  'P1 HELD'
);
SELECT * FROM finish();
ROLLBACK;
```

- `tests.authenticate_as()` は DB 内の身元の切り替え。実際のログインやトークンの検証はしない。API の試験は [supabase-api.md](supabase-api.md) で別に回す。
- 未ログインの役への切り替え・管理側への戻し方は、固定した版の[補助関数の仕様](https://github.com/usebasejump/supabase-test-helpers)で確かめる。切り替え後の役と身元を確かめ、管理側のまま試して緑にしない。
- `results_eq` / `is` で結果・件数・変更後の状態を比較する。例外で拒否する約束は `throws_ok` で想定する SQLSTATE まで見る。何のエラーでも成功にする捕まえ方はしない。
- 成功の呼び出しだけを見る `lives_ok` では、期待した行を操作した証拠にならない。陽性対照にも結果の検査を付ける。行が見えない約束は、例外でなく 0 件が正しい場合がある。
- `plan` の数は実際の検査数に合わせ、`finish()` と `ROLLBACK` を必ず置く。複数の手筋はそれぞれ検査し、1 件の失敗を後の成功で打ち消さない。

## 判定と TAP の対応

| 審判の出力 | 固定する検査 | TAP と終了の扱い |
|---|---|---|
| `CONTROL P<n>: OK` | 正しい利用者による同じ操作と、その結果 | 一致した時だけ `ok`。不一致は `not ok`、その約束の HELD は確定しない |
| `HELD P<n>` | 陽性対照が通り、禁止した結果が起きず、想定した層で止まる | 全条件が一致した時だけ `ok` |
| `BROKEN P<n>: …` | 禁止した結果が起きたことを同じ検査で検出する | `not ok`。試験全体も非 0 |
| `INCONCLUSIVE P<n>: …` | 前提不足・想定外の拒否を失敗として残す | `not ok`。skip / TODO で緑にしない |
| `ERROR P<n>: …` | 準備・接続・SQL 自体の失敗 | `not ok` または実行の中断。試験全体も非 0 |

文字列を `ok` に置き換えるのではなく、約束を検査する式を移す。`coverage.mjs` は TAP を読む道具ではない。既存の審判ログはそのまま保存し、固定後も渡すなら、P 番号・陽性対照・全検査の結果を集約して従来の判定形式を別に作る。TAP の説明文だけから HELD を作らない。

## 手元と CI

[標準の実行方法](https://supabase.com/docs/guides/database/testing)は `supabase test db`。リンク先の DB を使う指定は付けない。CI では、既存の runner で CLI とコンテナ実行環境を用意してから、次の順で回す。

```yaml
steps:
  # ソース取得・固定した版の CLI の準備は既存の CI に合わせる
  - name: 使い捨ての環境を立てる
    run: supabase start
  - name: 関門を通して固定した試験を回す
    shell: bash
    run: |
      set -euo pipefail
      # 上記の URL・接続対応の検査をここで実装する（未実装なら走らせない）
      supabase test db
  - name: 片付け
    if: always()
    run: supabase stop --no-backup
```

これは関門を埋めてから使う雛形。接続先や鍵を CI の secret から受け取らず、今回立てた環境からだけ読む。終了コードを握り潰さず、ログを分岐する時も失敗を伝える。取り込み前に、守りがある版で緑・外した版で `not ok` と非 0・関門の両向きを確かめる。
