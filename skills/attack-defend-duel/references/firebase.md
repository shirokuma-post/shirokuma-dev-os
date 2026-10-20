# Firebase（Firestore / Realtime Database / Storage のセキュリティルール）

守りの本体はセキュリティルール。クライアントから直接読み書きされるので、ルールが唯一の守りになりやすい。

## 使い捨ての環境

```bash
firebase emulators:start --only firestore,auth --project demo-duel
```

- プロジェクト ID は `demo-` で始める。`demo-` のプロジェクトはエミュレータ以外に繋がらない。
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
