# 失敗カタログ — 過去の失敗クラス → 恒久対策 → 番人

> Tier: T1 ・ 最終確認日: （導入時に更新）・ 1行責務: 過去の開発で踏んだ失敗を二度と踏まないための恒久対策と自動チェックの正典
> 使い方: 各クラスごとに「最初から入れておけばよかった対策」と「番人（検出器）」がある。新規立ち上げ時に一読し、該当クラスの番人を `checks/` に常設する。新しい失敗を踏んだら**1行追記**する（doc-constitution / engineering-doctrine 規律4の還流先）。
> 固有値（ツール名・閾値・鍵名・テーブル名）は自プロジェクト用に読み替えること。

凡例: **失敗** = 何が起きた/起きうるか ／ **根** = 根本原因 ／ **恒久** = 最初から入れるべき対策 ／ **番人** = 検出/予防（◎=静的に自動化可・◯=監査チェックリスト向き）

---

## A. シークレット / 暗号

**A1. 秘密・PII の git 混入**
- 失敗: 鍵・トークン・移行データ(PII)がコミットに混入。
- 根: リポに置いてよい物の境界が曖昧。
- 恒久: 秘密は env / Vault のみ。リポに入れない。
- 番人: ◎ 秘密スキャン（gitleaks 等）を pre-commit **と** CI 両方に。pre-commit だけだと追跡外で漏れる。

**A2. 復号の silent fallback（生 ciphertext を返す）**
- 失敗: 全 salt で復号失敗時に raw を返し、それが外部APIキー/トークンとして送信され外部ログに秘密露出。`parts.length!==3` の raw 返却も同種。
- 根: 失敗時の安全側がない。「とりあえず返す」。
- 恒久: 復号失敗は必ず `throw`。UX が要る経路だけ別途 `tryDecrypt()`（null 返し）を併設。
- 番人: ◎ decrypt 実装で raw/encryptedText を return する経路を grep。壊れフォーマットで throw されるユニットテスト。

**A3. 暗号の正典ドリフト / 方式非互換**
- 失敗: doc は「共通 crypto 修正済」だが共通パッケージに旧実装が残存。または関門と各コンポーネントで key 派生(scrypt vs sha256)・IV長(16 vs 12)が違い、共有鍵ストアで暗黙的に復号不能。
- 根: 暗号実装が分散。doc と実体の乖離。
- 恒久: 暗号は1正典に集約し各所は import。方式を全レイヤーで統一（違うなら明文化＋混在禁止）。
- 番人: ◯ 各実装の algorithm/IV長/key派生 をマトリクス比較。import 元を確認。

**A4. ログ/エラーへの秘密漏洩**
- 失敗: `console.log({token,apiKey})`・`JSON.stringify(error)`(error.response.data に鍵)・診断APIのエラーに raw ciphertext。
- 根: ログ対象の selectivity がない。
- 恒久: token/鍵/password/refresh token は絶対 log しない（長さのみ可）。logger に redact 設定。診断APIに内部状態を出さない。
- 番人: ◎ `console.*` への token/key/error オブジェクト直渡しを grep。ログの secret パターン監視。

**A5. 旧防御コードの取り残し（コメントが嘘になる地雷）**
- 失敗: 暫定の保険コード(`apiKey.includes(':')&&length>100` 等)が本対策後も残り、条件が甘くすり抜け、import 切替で地雷化。
- 恒久: 恒久対策完了時に暫定防御を撤去。残すなら理由をコメント更新。
- 番人: ◯「旧」「fallback」「残骸」コメント付き防御コードを定期 grep。

**A6. 鍵スコープの非局所化**
- 恒久: 最高権限キー・暗号 secret は**関門のみ**保持。トークン/OAuth state はコンポーネント独立鍵で暗号化（流出時の被害局所化）。復号した鍵は log/cache せず短命使用後に破棄。
- 番人: ◎ 各コンポーネントの最高権限キー/`createServiceClient` を CI で 0 件強制。`import.*decrypt` を定期監査。

---

## B. 認可・テナント分離

**B1. service_role（RLSバイパス）使用時の ownership 検証漏れ（IDOR）**
- 失敗: 「ログイン済か」は見るが `?resourceId=` の所有権を検証せず特権クライアントで検索 → 他テナントの全件取得。同種ルートの一部だけ verify 忘れ。
- 根: 特権昇格と認可が分離されていない。
- 恒久: 特権クライアントを使う全ルートで「クライアント供給IDは必ず `verifyOwnership(id,user)` を通す」を不変化。ID無しの自己引きと ID指定の検証を両方固める。
- 番人: ◯ 特権クライアント利用ルートを全列挙し ID に ownership チェックがあるか1件ずつ。

**B2. body の userId を信頼した特権操作（権限昇格）**
- 失敗: body の `userId` を攻撃者が任意指定し、特権クライアントで他人を admin 昇格/他人の招待消費。
- 恒久: acting user は必ず session/JWT claim から取り、`user.id !== body.userId` を拒否。
- 番人: ◎ body/query 由来の `userId/user_id` を書き込み条件に使う箇所を grep。

**B3. 新規テーブルの RLS 有効化忘れ**
- 失敗: 公開計測テーブル等が RLS 無効のまま。anon key + スキーマ指定で他人の購入履歴(email/支払/トークン)を enumerate。
- 恒久: 新テーブルは migration テンプレに `ENABLE ROW LEVEL SECURITY` ＋用途別ポリシーを必ず含める（anon INSERT のみ・SELECT は owner 限定 等）。
- 番人: ◎ `SELECT ... FROM pg_tables WHERE rowsecurity=false` を全スキーマで定期実行し 0 件を保つ。advisor 定期実行。

**B4. テナント列の刻み忘れ / DEFAULT 越境**
- 失敗: 書き込み時にテナント列を刻み忘れ別テナントに露見。`DEFAULT` 残しがテスト残骸越境の入口。worker 経路でも多数刻み忘れ。
- 恒久: テナント列は `NOT NULL` ＋ DEFAULT 禁止。`BEFORE INSERT` トリガで自動的に刻む（アプリ層の漏れを DB が補完）。RLS は単一正典ポリシー。書き込み層(route/worker/cron)が同じ列を刻むか対で確認。
- 番人: ◎ 違反検出 SQL（返り行=違反）を週次。新表追加時にトリガ＋ポリシー必須の設計ルール。

**B5. クロステナント参照キーの検証漏れ**
- 失敗: `parent_id`/外部キーに他テナントの ID を指定でき汚染/漏洩。
- 恒久: 参照する親を取得し `parent.tenant_id === request.tenant_id` を検証してから保存。
- 番人: ◯ 親ID/外部キーを body で受ける書き込み API を洗い出し所属一致チェックを確認。

**B6. RLS だけに依存（多層防御欠如）**
- 恒久: RLS 適用済でもアプリ層でも `user_id` で二重に絞る。ポリシー緩和/バグ時の即漏洩を防ぐ。
- 番人: ◯ ownership を RLS だけに委ねる read/write を PR レビューで指摘。

**B7. env email allowlist による admin bypass / `USING(TRUE)`**
- 失敗: `ADMIN_EMAILS` 一致で DB role チェックなしに admin。未検証 OAuth でなりすまし。`USING(TRUE)` で全行横断読み取り。
- 恒久: 権限判定は DB の role を正に。env email バイパス削除。ポリシーは `USING((SELECT auth.uid())=user_id)` 基本。
- 番人: ◎ `USING (TRUE)` を grep。env email を権限判定に使う箇所を grep。

---

## C. 入力 URL の server-side fetch（SSRF）

**C1. ユーザー入力 URL の SSRF（private/metadata 到達）**
- 失敗: 渡された URL を無検証 fetch しクラウド metadata(169.254.169.254)・内部サービスへ到達、応答が AI コンテキスト/レスポンスに流出。
- 恒久: 共通 `validatePublicUrl()`（プロトコル allowlist ＋全 private レンジ＋metadata host ブロック）を1個だけ作り全外部 fetch で必ず通す。インライン自前実装を禁止。
- 番人: ◎ 外部 fetch を grep し共通バリデータ経由か確認。blocked host ヒットを監視。

**C2. private レンジの取りこぼし（穴がバラバラ）**
- 失敗: コピペ自前実装で 172.16-31(Docker/VPN)・169.254・CGNAT(100.64) を取りこぼし、4箇所で穴が全部違う。
- 恒久: バリデータを1正典に集約し全レンジ網羅(10/127/0/169.254/172.16-31/192.168/100.64-127 + IPv6 fe80/fc/fd/::1)。
- 番人: ◎ 重複バリデータを grep し1本化。レンジ網羅のユニットテスト。

**C3. DNS rebinding / リダイレクトすり抜け / timeout・サイズ無制限**
- 失敗: 検証時 public→fetch 時 private へ解決。3xx 先が private。timeout/サイズ上限なしで DoS。
- 恒久: DNS resolve 後の IP を判定し解決 IP に fetch。`redirect:"manual"` で各段再検証＋最大数制限＋最終URL再検証。共通 `safeFetch()` に timeout・max bytes 標準装備。
- 番人: ◯ fetch オプション(redirect/timeout/サイズ)とDNS検証をコードレビュー。

**C4. DB 経由 URL の保存側ノーガード連鎖**
- 失敗: 設定保存した URL(webhook/site/image)を後で fetch する時、保存側未検証で SSRF 成立。「DB経由だから安全」が崩れる。
- 恒久: URL を保存する書き込み API 側でも検証（読む側＋書く側を対で固める）。
- 番人: ◯ URL カラムへの INSERT/UPDATE 経路を洗い出し保存時バリデーションを確認。

---

## D. 公開レンダラー（XSS）

**D1. URL 属性の `javascript:`/`data:` 未拒否**
- 失敗: `href/src` にユーザー URL を escapeHtml だけで挿入。`javascript:` は変換対象文字を含まず素通り→クリック型 XSS。
- 恒久: `sanitizeUrl()`(http/https/mailto/tel/#/相対のみ許可・他は `#`)を全 URL 属性に。escapeHtml だけでは URL 属性を守れないと明示。
- 番人: ◎ `href=`/`src=` への変数挿入を grep し sanitizeUrl 経由か確認。XSS fixture でリグレッション。

**D2. style 属性内の未検証 color/数値の直挿（属性ブレイクアウト）**
- 失敗: `style="background:${color}"` を抜け出し script 注入。同種 sink で一部だけ sanitize 残し。
- 恒久: 全 color に `sanitizeColor()`(hex/rgb/hsl/名前色 allowlist)、数値は `typeof==='number'`＋範囲検証を例外なく。
- 番人: ◯ inline `style=` への変数挿入を全列挙し sanitize を通すかチェックリスト化。

**D3. AI生成/持ち込み HTML を未サニタイズ配信 + 「自社が書いたから安全」誤前提**
- 失敗: AI生成/import HTML を DOMPurify 通さず返却。マルチテナント同一オリジンで1テナント汚染が他を攻撃。プロンプトインジェクションで素材に script 混入。
- 恒久: テナント由来/AI生成 HTML は**保存時と配信時の両方**で DOMPurify(遅延 require)。script を残す必要があれば別オリジン/iframe sandbox で隔離。「持ち込みだから安全」を設計から排除。
- 番人: ◎ `dangerouslySetInnerHTML`/生 HTML の Response 返却を grep。

**D4. CSP/セキュリティヘッダ未設定 / dataset 経由のエンティティ解凍**
- 失敗: 公開ページに CSP/X-Frame-Options 等なく XSS 被害増幅。サーバでエスケープした値を client が `dataset` で取り出し `innerHTML` 代入してデコード発火。
- 恒久: 公開ページに strict CSP(`object-src 'none'`,`frame-ancestors 'none'`,`base-uri 'self'`)。client は `textContent` を使う（innerHTML しない）。
- 番人: ◯ 公開ルートのヘッダ確認。`el.innerHTML = ...+変数` を grep。

---

## E. 公開エンドポイント・レート制限

**E1. 公開計測 endpoint のレート制限/存在検証欠落（データ汚染）**
- 失敗: 認証不要の analytics 受信で rate-limit/存在チェックなく任意 ID で集計汚染、`purchase` 偽造で水増し。一部ルートだけ付け忘れ。
- 恒久: 公開 endpoint は per-IP rate-limit 標準装備。対象 ID の存在・公開状態を検証。event_type を allowlist。
- 番人: ◯ 認証なし書き込みルートを全列挙し rate-limit/存在チェックを確認。

**E2. 招待/検証コードの enumeration**
- 失敗: rate-limit なしの `validate?code=` を叩き放題、コードが短く(24bit)数日で全列挙。失敗レスポンスが詳細を返す。
- 恒久: per-IP rate-limit、コードを十分長く(8byte+ base64url)、未認証には `{valid:false}` のみ（理由非開示）。
- 番人: ◯ validate/lookup 系のレート制限・コード長・レスポンス内容を確認。

**E3. AI ルートのレート制限欠落 / in-memory rate-limit**
- 失敗: AI ルートに rate-limit なく濫用（BYOK でも流出時の請求/評判は自社に跳ねる）。in-memory 実装は serverless 各インスタンスで共有されず無効。
- 恒久: AI 呼び出しは共通 middleware で rate-limit(per-user/公開は per-IP/共有鍵は厳しく)。判定は `.allowed`。Redis-backed に統一。
- 番人: ◎ AI provider を叩くルートに rate-limit があるか全数確認。rate-limit が Redis backed か確認。

---

## F. cron / worker / webhook / 内部 API

**F1. webhook 署名検証欠落 / 構文のみ検証**
- 失敗: webhook 受信で署名未検証。または保存時 `new URL()` 構文チェックのみで SSRF。
- 恒久: 全 webhook 受信は raw body ＋ timing-safe HMAC 署名検証。webhook URL は保存時＋送信直前に SSRF 検証、リダイレクト禁止。
- 番人: ◯ webhook ハンドラの署名検証・URL 検証を確認。新規追加時のルール化。

**F2. 署名の存在チェック短絡（認証バイパス）/ 鍵未設定フォールバック**
- 失敗: 「署名ヘッダがあれば OK」と短絡し、署名鍵未設定時に認証バイパス。鍵未設定で `CRON_SECRET` フォールバック→401連発。
- 恒久: 署名検証は鍵存在前提でなく常に timing-safe HMAC 照合。鍵未設定はフォールバックでなく**エラー**。起動時に鍵存在をアサート。
- 番人: ◎ 全 route を走査する自動チェック（負例で検出を実証）を週次。

**F3. cron/worker の内部呼び出しで秘密を外部転送（SSRF/秘密転送）**
- 失敗: cron が `callInternal(url)` で CRON_SECRET を載せ外部へ転送可能。worker が CRON_SECRET だけで任意操作。
- 恒久: 内部呼び出しは HTTP でなく in-process import に。やむを得ず HTTP なら HMAC 署名ペイロード。
- 番人: ◎ cron/worker からの自コンポーネント fetch・秘密をヘッダに載せる箇所を grep。

**F4. cron UPDATE の predicate が緩い / race condition**
- 失敗: 状態遷移 UPDATE に遷移元 status の WHERE がなく再実行で誤更新。並列リクエストで二重消費。
- 恒久: 状態遷移 UPDATE は遷移元 status を WHERE に必ず含める。加算/消費は RPC(DBトランザクション)経由。`event_id` で冪等化(unique + onConflict ignore)。
- 番人: ◯ cron の UPDATE に状態 predicate があるか。read-modify-write を grep し RPC 化を確認。

**F5. cron/worker の過剰 DB 権限・特権直使用**
- 恒久: cron/worker で特権クライアントを直使用せず関門経由。`select("*")` を避け必要列のみ・`.eq("user_id",acting)`・`.limit()`。acting user は署名 claim から。
- 番人: ◎ cron/worker の特権クライアント import を機械検出。

---

## G. 性能（504 連鎖の教訓）

**G1. middleware 暴走 → 504 連鎖**
- 失敗: middleware で毎リクエスト `getUser()`、client polling と RLS 毎行評価が重なり認証テーブル SELECT が 25万回/24h →504連鎖。
- 恒久: middleware は cookie pass-through のみ（`getUser()/getSession()` 禁止）。client polling は短間隔禁止(focus復帰時＋イベント時のみ)。RLS の `auth.uid()` は `(SELECT auth.uid())` で initplan 化。1テーブル×1role×1cmd で1 policy。owner CRUD は `TO authenticated`。
- 番人: ◎ middleware の getUser/getSession 呼び出し・短間隔 polling を grep。RLS の裸 auth.uid()・multiple permissive を advisor で。

**G2. N+1 / 副作用 UPDATE の氾濫**
- 恒久: API route の DB クエリ4個以上は設計レビュー。cron/worker の副作用 UPDATE は Redis スロットル(dispatch毎 UPDATE 禁止)。頻出 WHERE に partial index(`CREATE INDEX CONCURRENTLY`)。
- 番人: ◯ route のクエリ数・cron の UPDATE 頻度をレビュー。

---

## H. DB / migration

**H1. スキーマ指定忘れで空振り**
- 恒久: 専用テーブルは `.schema('xxx')` を必ず付ける（忘れると既定スキーマ参照で空振り）。
- 番人: ◎ クエリビルダ呼び出しの `.schema()` 有無を lint/grep。

**H2. migration 逆流 / 正典分散**
- 失敗: コンポーネント配下で `db push` すると相手 DB に DDL 逆流。
- 恒久: migration は系統ごと集約ディレクトリ1箇所が正典。live 適用は project_id 明示の apply。配下で `db push` しない。アーカイブは md5 凍結。
- 番人: ◯ 配下 `db push` を禁止する手順ルール。

**H3. schema DROP による PostgREST キャッシュ破壊連鎖 / 公開漏れ**
- 失敗: 廃止コンポーネントの schema を DROP すると schema cache が壊れ全コンポーネント unhealthy 連鎖。schema 未公開で依存クエリ全失敗(PGRST106)。
- 恒久: 廃止 schema も DROP せず空のまま CREATE 維持。
- 番人: ◎ health で対象 schema を 2-ping し偽 healthy を防ぐ。DROP 禁止を不変ルール化。

**H3b. 暗号化キー移行 / 列名衝突 / 鍵テーブル乱立**
- 恒久: DB 統合移行は「旧キーで復号→新キーで再暗号化」。固有カラムは `{prefix}_xxx`。新規は共有テーブルのみ（個別キーテーブル新設禁止）。
- 番人: ◯ 移行手順書・命名規約・共有テーブル方針。

---

## I. デプロイ / インフラ / env

**I1. 「push＝本番」前提の誤り（経路がコンポーネント別）**
- 失敗: 大半は push→本番自動だが、push 先が Production Branch と不一致のものは preview 止まり(silent skip)。
- 恒久: 全コンポーネントのデプロイ経路を棚卸し表で明文化(Production Branch=push先 の一致が判定軸)。不一致は昇格操作を手順に固定(`promote` は env 事故リスクで避ける)。
- 番人: ◯ デプロイ後に本番 health の version=HEAD を確認。新規追加時に棚卸し表へ1行。

**I2. identity 不一致で stale ビルド**
- 失敗: repo owner/push/ホスティング連携の不一致で本番 deploy が無言スキップ→旧ビルドが live。
- 恒久: 3者を一致させ続ける。移管/連携張り替え前に整合確認。
- 番人: ◯ デプロイ完了 = ビルドステータス success かつ health version=HEAD。assumption 禁止。

**I3. env 末尾改行で HMAC/JWT 検証が永久失敗**
- 失敗: env 投入で末尾改行混入→鍵 mismatch→署名検証が永久失敗。
- 恒久: env 投入は `printf '%s'`(`'%s\n'` 禁止)。署名/トークン系 env は設定後に検証フローを通す。
- 番人: ◯ env 投入手順ルール化。

**I4. `tsc --noEmit` 緑でも本番ビルドで落ちる**
- 失敗: route ファイルで規定外 export → tsc は通るが本番ビルドで fail。
- 恒久: 補助関数は route 内 private(非 export)。デプロイ前に本番ビルド相当を必ず実行。
- 番人: ◎ CI に typecheck だけでなく本番ビルド job を含める。

**I5. プラン実行時間上限(serverless)超過の潜在在庫**
- 失敗: 無料/低位プランの 60秒上限を超える宣言の route が多数残存。ローンチ後に顧客が踏むと途中 kill。
- 恒久: 長時間処理はジョブキューで非同期化 or 有料昇格。各 route の `maxDuration` をプラン上限と突合。
- 番人: ◎ プラン上限を変数化したチェックで上限超過 route 数を週次可視化。ローンチ時 0 件確認。

**I6. 依存パッケージの caret ドリフト**
- 失敗: `^` 指定でコンポーネント間に同一ライブラリの異版混在、breaking 差分が潜在化。
- 恒久: 主要依存は caret を外し固定。横断でバージョンを揃える。
- 番人: ◎ コンポーネント間の依存バージョン突合スクリプトを週次(違反=不一致行)。

---

## J. 型安全（any 撲滅）

**J1. `as any`/二段キャスト/`@ts-ignore` が本物バグを隠す**
- 失敗: 型を黙らせた結果、phantom 列参照・列ズレ・write 失敗・鍵が常に null・出力機能が常時例外、を tsc が検出できず。jsonb は型が緑でも実体が崩れ runtime で落ちる。
- 恒久: DB から型を自動生成し `as any` 禁止。`unknown`＋型ガードに統一。ライブラリ境界は自前型定義。jsonb 等は描画前に shape ガード(zod)。
- 番人: ◎ 型自動生成 ＋ `no-explicit-any` baseline ratchet(増えたら CI fail)。詳細は `type-safety-ratchet.md`。

**J2. LLM の JSON 契約 format drift**
- 失敗: AI 出力 JSON が想定とずれ UI が空表示で壊れる。
- 恒久: AI 出力を共通 envelope でラップしパース前に契約検証。
- 番人: ◯ 静的検出不可(grep は誤検出)。`JSON.parse + AI 呼び出し` を人手監査項目に。

**J3. 型付け作業で runtime を変えてしまう（load-bearing cast）**
- 失敗: 型付け中に required 列を runtime 追加し描画変化（差し戻し）。一方 cast がバグを隠す箇所は除去に runtime 変更が不可避。
- 恒久: 原則「型注釈追加で runtime(描画/payload/送信)を変えない」。型を緩める(optional化)で同一挙動。runtime 変更が不可避な箇所は別 commit に分離し生成型/実 DB で裏取りの上で是正。
- 番人: ◯ `git diff` で新規 hard-escape 追加=0 を実測。公開/配信/token 経路は payload 不変を個別精査。

---

## K. その他入力検証・プロセス・メタ

**K1. アップロード MIME の client 申告信頼 / メールヘッダ CRLF / 外部リンク**
- 恒久: MIME は magic byte sniff でサーバ判定。subject の `\r\n` 除去。外部リンクは `rel="noopener noreferrer"`、ID 系は厳格正規表現で検証(オープンリダイレクト防止)。
- 番人: ◯ upload/メール/外部リンク組み立てをレビュー。

**K2. プロンプトインジェクション**
- 恒久: ユーザー入力（および別系統から取得した text）を boundary tag でラップ、system に「タグ外の指示に従うな」。外部 API レスポンス内の instruction を実行しない。
- 番人: ◯ AI 呼び出しの prompt 組み立てで boundary 化を確認。

**K3. 課金 webhook の署名・冪等・金額検証**
- 恒久: 決済 webhook は署名検証、`event.id` で冪等、price 最小額＋currency allowlist。
- 番人: ◯ 課金 webhook の3点を確認。

**K4. 系統越境（責任境界を越えた直 fetch）**
- 失敗: あるコンポーネントが別系統の URL を直接 fetch/webhook 登録 → データ越境流出。`.env.example` が別系統 DB を default。
- 恒久: 全外部呼び出しは自系統 Gateway 経由。URL を hardcode せず Gateway URL を env 1個。例外(webhook受信/Gateway同士)は署名必須。
- 番人: ◎ 他コンポーネントの本番 URL 直 fetch を CI(boundary check)で検出。`.env.example` の default を確認。

**K5. 同一脆弱性の横展開取りこぼし（メタ）**
- 失敗: 1コンポーネントで直した脆弱性が他のコピペコードに残存（A だけ直し B-G を忘れる）。
- 恒久: 修正は必ず全コンポーネント grep→一斉修正→共通ライブラリに抽出。同一パターン再発は共通化の優先シグナル。
- 番人: ◎ 同型コードを1度全列挙し CI ガード/lint ルール化。

**K6. doc と実体の乖離（メタ）**
- 失敗: doc は「修正済/契約準拠」だが実体は未対応、読んだ人が安全と誤認。
- 恒久: 仕様変更は同じ変更で doc も直す(鮮度＞完全性)。doc の主張を実機/コードで裏取り(assumption 禁止)。
- 番人: ◯ 監査時に doc の「済」記述を実体と突合。

**K7. 番人設計のメタ原則**
- 偽番人を作らない(静的に sound なものだけ自動化、config/E2E 失敗モードは監査チェックリスト)。横断検出器はオーケストレータ層 `checks/` に集約し本体修正は別作業に分離。各クラスに番人1個で「探す」を「存在できない」に変える。
