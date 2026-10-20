# MySQL / MariaDB

> 実地確認 2026-10-20（MySQL 26.7・手元のバイナリ）: 関門の両向き・SIGNAL の関門・アカウントごとの GRANT（表は拒否・ビューは読める）・DDL の暗黙 commit を実測。攻め守り対戦 1 回: 約束 4・破れた 0・権限を開けたミューテーション 4/4 で赤。

MySQL には行単位セキュリティが無い。守りは「利用者ごとの DB アカウント + ビュー + ストアドプロシージャの権限」か、アプリ側（→ `http-app.md`）にある。アプリが 1 つの強いアカウントで繋いでいるなら、守りの本体はアプリなので `http-app.md` で回す。

## 使い捨ての環境

```bash
# A. コンテナ
docker run -d --name duel-my -e MYSQL_ROOT_PASSWORD=duel -p 127.0.0.1:53306:3306 mysql:8.4

# B. 手元のバイナリ (コンテナが使えない時・brew install mysql)
mysqld --initialize-insecure --datadir="$RUN/my" --user="$(whoami)"
mysqld --datadir="$RUN/my" --socket="$RUN/my.sock" --port=53306 --bind-address=127.0.0.1 --mysqlx=OFF --pid-file="$RUN/my.pid" &
until mysqladmin -uroot -h127.0.0.1 -P53306 ping >/dev/null 2>&1; do sleep 1; done

mysql -h127.0.0.1 -P53306 -uroot < schema.sql   # mysqldump --no-data の出力
```

- zsh で `M="mysql -uroot ..."; $M -e ...` と書くと、空白で分割されず「そんなファイルは無い」で全部失敗する。shell 関数にする（`M(){ mysql -uroot -h127.0.0.1 -P53306 "$@"; }`）

## 役（身元）の切り替え

役ごとに DB アカウントを作り、別の接続で試す。

```sql
CREATE USER 'tenant_a'@'%' IDENTIFIED BY 'duel';
GRANT SELECT ON app.v_orders_tenant_a TO 'tenant_a'@'%';
```

```bash
mysql -h127.0.0.1 -P53306 -utenant_a -pduel -e "SELECT * FROM app.orders"   # 拒否されれば HELD
```

- テナントをセッション変数で絞るビュー（`WHERE tenant_id = @tenant`）は、利用者が `SET @tenant = ...` で書き換えられる。**この形は攻め役に必ず試させる**。
- 試験は 1 本ずつ `START TRANSACTION; ... ROLLBACK;`。DDL は暗黙に commit されるので、DDL を含む試験は環境ごと作り直す。
- `GRANT` / `REVOKE` / `CREATE USER` も暗黙に commit される。権限を渡せるかの試験は「既に持っている権限の再付与」で試すか、`SHOW GRANTS` の中身（`WITH GRANT OPTION` 等）を読んで判定する。
- ミューテーションは権限を 1 つ開ける → 試験 → `REVOKE` で戻す、の順。最後に `SHOW GRANTS FOR` で元どおりかを確かめる。

## 関門（2 段）

1 段目の印は `report_host`。起動時に `--report-host=duel-disposable` を付ける。実行中は読み取り専用で、`SET GLOBAL` / `SET SESSION` のどちらでも変えられない（2026-10-20 実測）。

```bash
mysqld ... --report-host=duel-disposable
[ "$(mysql ... -N -e 'SELECT @@report_host')" = duel-disposable ] || { echo 'not a disposable DB (no marker)'; exit 1; }
```

2 段目は下のデータの確かめ。両方を通ってから seed を作る。

MySQL は `SELECT` の中で失敗を起こしにくい (ゼロ除算も NULL になる)。試験を回す script の最初で確かめ、満たさなければ流さない。

```bash
case "$MYSQL_HOST" in 127.0.0.1|localhost) ;; *) echo 'not a disposable DB'; exit 1;; esac
n=$(mysql -h"$MYSQL_HOST" -P53306 -uroot -pduel -N -e "SELECT COUNT(*) FROM app.<必ず 1 行以上ある表>")
[ "$n" = 0 ] || { echo 'not a disposable DB'; exit 1; }
```

SQL の中で止めたい時は、`SIGNAL` で止めるプロシージャを作り、試験の最初で呼ぶ。mysql クライアントでは `DELIMITER` の指定が要る（無いと構文エラーで作られず、関門が無いまま進む）:

```sql
DELIMITER //
CREATE PROCEDURE app.duel_guard() BEGIN
  IF (SELECT COUNT(*) FROM app.<必ず 1 行以上ある表>) > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'not a disposable DB';
  END IF;
END//
DELIMITER ;
CALL app.duel_guard();
```

★ 関門のプロシージャが作れたかを、試験の前に `SHOW PROCEDURE STATUS WHERE Db='app'` で確かめる。作れていないと `CALL` が「存在しない」で失敗するだけで、`ON_ERROR` の扱い次第では先へ進む。

## 守りの層

- アカウントごとの GRANT（表・ビュー・プロシージャ）
- ビューの絞り込み条件（`DEFINER` / `INVOKER` の違い）
- プロシージャ内の持ち主の確かめ方（引数で受けていないか）
