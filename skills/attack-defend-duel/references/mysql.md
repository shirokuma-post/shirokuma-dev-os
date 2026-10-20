# MySQL / MariaDB

MySQL には行単位セキュリティが無い。守りは「利用者ごとの DB アカウント + ビュー + ストアドプロシージャの権限」か、アプリ側（→ `http-app.md`）にある。アプリが 1 つの強いアカウントで繋いでいるなら、守りの本体はアプリなので `http-app.md` で回す。

## 使い捨ての環境

```bash
docker run -d --name duel-my -e MYSQL_ROOT_PASSWORD=duel -p 127.0.0.1:53306:3306 mysql:8.4
mysql -h127.0.0.1 -P53306 -uroot -pduel < schema.sql   # mysqldump --no-data の出力
```

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

## 関門

MySQL は `SELECT` の中で失敗を起こしにくい (ゼロ除算も NULL になる)。試験を回す script の最初で確かめ、満たさなければ流さない。

```bash
case "$MYSQL_HOST" in 127.0.0.1|localhost) ;; *) echo 'not a disposable DB'; exit 1;; esac
n=$(mysql -h"$MYSQL_HOST" -P53306 -uroot -pduel -N -e "SELECT COUNT(*) FROM app.<必ず 1 行以上ある表>")
[ "$n" = 0 ] || { echo 'not a disposable DB'; exit 1; }
```

SQL の中で止めたい時は、`SIGNAL SQLSTATE '45000'` を使うプロシージャを試験の最初で呼ぶ。

## 守りの層

- アカウントごとの GRANT（表・ビュー・プロシージャ）
- ビューの絞り込み条件（`DEFINER` / `INVOKER` の違い）
- プロシージャ内の持ち主の確かめ方（引数で受けていないか）
