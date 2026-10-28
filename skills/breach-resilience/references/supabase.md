# Supabase の落とし穴（2026-10 時点で実測）

> 仕様は変わる。使う前に公式 docs（API Keys / JWT Signing Keys / Sessions）で確かめ直すこと。

## 鍵の型
- 新しい型は `sb_publishable_`（ブラウザ用）と `sb_secret_`（サーバー用）。**legacy の service_role は単独で作り直せない**（JWT secret ごと回す = anon も全利用者のセッションも同時に切れる）。新しい型の secret key は 1 本ずつ作り直せるので、侵害時の止め方が「その鍵を消して差し替える 30 分」になる。
- 新しい型の鍵は **`apikey` ヘッダだけ**で送る。`Authorization: Bearer <鍵>` に入れない（JWT ではない）。自前の fetch・e2e の helper・ヘルスチェックに Bearer で送る所が残っていないかを全 repo で数える。
- 用途ごとに secret key を分ける（サーバー用 / 手元の運用用）。手元の鍵が漏れても、サーバーの鍵は無傷で、手元の鍵だけ消せる。
- 既定の鍵（`default`）は管理画面とコマンドツールが使う。消すと、それらが別の鍵を拾い、用途の分離が崩れる。
- 画面とログは鍵の先頭（例: `sb_secret_` + 5 文字 = 15 文字）を識別子として表示する。そこまでの表示は漏れではない。それより先が出たら作り直す。

## ログで数える（edge logs）
- `request.sb.apikey.apikey.prefix` で鍵ごとの利用を数えられる。legacy の JWT 型は prefix が空。UA（`supabase-js-node/…`・`SupabaseCLI/…`・`@supabase-infra/mgmt-api`）で、アプリと管理基盤を見分ける。
- 利用者の token の署名方式は `request.sb.jwt.authorization.payload.*` / header で見分けられる。**署名鍵がすでに非対称に切り替わっているかは、ここで authenticated の alg を数えれば分かる**（画面を見る前に実測できる）。

## セッション
- 無操作の期限・最長の期限（有料プラン）は **refresh の時点で判定**され、行は消えない。「行数が減らない = 効いていない」と判定しない。効いている証拠は auth のログの `Session Expired (Inactivity)`。
- e2e が試験のたびに新しくログインして signOut しないと、行が溜まる。試験の終わりに `POST /auth/v1/logout?scope=local` で消す（同じアカウントの他の試験を巻き込まない）。
- 利用者単位の一括失効: 自前の token（ゲートウェイの JWT など）にも世代番号を持たせ、元の Supabase のセッション id と結び、refresh のたびに生存を照合する。Supabase 側だけ切っても、自前の token が生きていれば届く。

## 署名鍵（JWT Signing Keys）
- 非対称の鍵へ rotate 済みなら、legacy secret の Revoke で**利用者は切れない**（token の寿命 + 15 分以上たっていれば）。前提として legacy の anon / service_role を先に無効化しておく。
- Storage の署名付き URL は別の内部鍵で署名されていて、署名鍵の移行の影響を受けない。

## 運営者の 2 段階認証
- 画面で 6 桁を求めても、DB の権限判定（RLS の関数）が aal を見ていなければ、6 桁を通らないセッションで DB に届く。運営者の判定関数自体に `aal2` を入れる（claims が無い時は偽）。
- 運営者のアカウントは予備の認証端末を持つ（端末を失くすと入れない）。
