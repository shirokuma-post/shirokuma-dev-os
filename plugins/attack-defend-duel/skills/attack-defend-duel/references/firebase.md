# Firebase（Firestore / Realtime Database / Storage のセキュリティルール）

> 実地確認 2026-10-20（firebase-tools 15.34・firebase@11・@firebase/rules-unit-testing@4・OpenJDK 27）: 攻め守り対戦 1 回。約束 5・破れた 0・ルールをゆるめたミューテーション 5/5 で赤。関門はエミュレータ無し・`demo-` 以外の両方で止まった。

守りの本体はセキュリティルール。クライアントから直接読み書きされるので、ルールが唯一の守りになりやすい。

## 使い捨ての環境

```bash
firebase emulators:start --only firestore,auth --project demo-duel
```

- プロジェクト ID は `demo-` で始める。`demo-` のプロジェクトはエミュレータ以外に繋がらない。
- エミュレータには Java が要る（macOS なら `brew install openjdk` → `JAVA_HOME=/opt/homebrew/opt/openjdk`）。
- ポートは `firebase.json` の `emulators.firestore` で固定する（試験側の host/port と揃える）:

```json
{ "firestore": { "rules": "firestore.rules" },
  "emulators": { "firestore": { "host": "127.0.0.1", "port": 58080 }, "ui": { "enabled": false } } }
```

- 試験は node で直接流せる形にしてよい（テストランナー無し）。ただし **BROKEN が 1 件でもあれば `process.exitCode = 1`** にする。console に出すだけだと CI で緑になる。
- 拒否された操作ごとに、エミュレータが `false for 'update' @ L8` のような評価ログを出す。これは拒否の記録で、失敗ではない。
- ミューテーションはルールのファイルを控えてから 1 か所ずつ書き換え、終わったら控えで戻して `cmp` で確かめる。
- 試験は `@firebase/rules-unit-testing` で書く。

## 役（身元）の切り替え

```js
const env = await initializeTestEnvironment({
  projectId: 'demo-duel',
  firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
});
const alice = env.authenticatedContext('alice', { tenant: 't1' });   // カスタムクレームも渡せる
const anon  = env.unauthenticatedContext();
await env.withSecurityRulesDisabled(async (ctx) => { /* seed */ });
await assertFails(getDoc(doc(alice.firestore(), 'tenants/t2/orders/x')));   // 失敗すれば HELD
```

- カスタムクレームを信用するルールなら、**クレームを誰が付けているか**も約束に入れる（利用者が自分で書ける場所から来ていないか）。
- リスト（`getDocs` / クエリ）と 1 件取得（`getDoc`）でルールの評価が違う。両方を試させる。

## 関門

```js
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith('demo-')) {
  throw new Error('not a disposable environment');
}
```

## 守りの層

- `match` ごとの `allow read/write` の条件
- `request.auth.uid` と文書の持ち主の照合
- `request.resource.data` の検査（書き込みで持ち主やロールを書き換えられないか）
- 関数（`function isMember()` 等）の中で `get()` / `exists()` が見ている文書
