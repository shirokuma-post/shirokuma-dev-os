# Vercel の落とし穴（2026-10 時点で実測）

- **デプロイ用の token が漏れたら、全部漏れた扱い**: 任意のコードを本番に deploy できれば、実行時の env は sensitive 型も含めて全部読める。止め方は ① token を削除 ② 知らない deployment があれば直前の版を Promote ③ 全 secret を作り直す。
- **token に期限を付けない運用なら**、代わりに毎週 token の一覧（`GET /v5/user/tokens`）と team のメンバーを前回値と比べる。名前の分かる token 1 本だけにしておく。
- **sensitive の env は読み戻せない**: 作り直しは「新しい値を置く」しかなく、戻すのも「もう一度作り直す」。値は script の中で生成し（`openssl rand`）、stdin から JSON にして送り、argv にも画面にも出さない。
- **sensitive の行の置き換え**: PATCH の body に `key` を含めると、同じ名前でも 400「You cannot change the key of a Sensitive Environment Variable」。**`{"value": …}` だけ**を送る。
- **共有の行を分ける**: production と preview を 1 行で共有している env は、片方だけ値を変えられない。行から対象を外す → 新しい行を足す、の 2 手。2 回目の計画は 1 回目を当てた後の行で立て直す。
- **env は新しい build にしか効かない**: 置いた後に作り直し（build → promote）が要り、その本番化の瞬間が切り替え。
- **preview に本番の強い鍵を置かない**: どの branch の build からも読める。
- **Deployment Checks は GitHub 側から偽装できる**: ソース管理の token を奪われた前提では門にならない。本番へ出す版を自分の手元の台帳（runner や CI から読めない場所）に残し、本番の version と毎時突き合わせる見張りの方が効く。
- **`vercel env add` の値に改行を入れない**（`printf '%s'`）。末尾改行で HMAC の鍵がずれる。
