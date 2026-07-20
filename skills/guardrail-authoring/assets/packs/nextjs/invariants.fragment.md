# INVARIANTS fragment — nextjs (web アプリ / serverless) 固有の不変条件

> `templates/INVARIANTS.template.md` に合成する断片。見出し番号は本体の節番号に対応し、同名節の表末尾に行を追記する形で合成する。
> web アプリ (OAuth / middleware / client polling / Webhook / HTML レンダリング / serverless hosting) を持つ場合のみ適用。CLI/ライブラリ開発では合成しない。

## 1. セキュリティ核

| ルール | 詳細 |
|---|---|
| **トークン/OAuth state はコンポーネント独立の鍵で** | 流出時の被害を局所化する。共有鍵で全体を保護しない |
| **API キー等の機微情報は AES-256-GCM で暗号化** | 暗号化は単一の `encrypt()` を必ず通す。生保存禁止 |
| **OAuth state 有効期限は十分に** | 短すぎると同意画面操作中に期限切れ（例: 15分） |
| **(env 投入時) 末尾改行を混入させない** | {{例: Vercel}} で `printf '%s'`（`'%s\n'` 禁止）。改行混入は HMAC 鍵 mismatch → 署名検証が永久失敗 |

## 2. 性能核

| ルール | 詳細 |
|---|---|
| **middleware で重い認証呼び出しをしない** | {{例: getUser()/getSession()}} を毎リクエスト呼ばない。cookie pass-through に留める |
| **client-side polling は短くしすぎない** | 例: 60秒以下禁止。focus 復帰時 + イベント発火時のみに寄せる |

## 5. 入力検証

| ルール | 詳細 |
|---|---|
| **外部 HTML/リッチ入力はサニタイズ** | {{例: DOMPurify}} を必ず通す |
| **Webhook は署名検証必須** | {{例: Stripe / Discord / Meta}}。署名なしの着信を信用しない |
