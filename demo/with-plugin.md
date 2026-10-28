# after — プラグインを入れたセッションの実出力

`shirokuma-dev-os` を入れたセッションに [PROMPT.md](PROMPT.md) を貼ると、
Intent Anchor（`sample-project/CLAUDE.md §0.5` に常時ロードされている）が
**意思決定の前**に発火し、こう応答する:

---

【Intent Anchor】
- 目的 = 金額表示が絶対に間違わない状態を守る（§0 北極星）。今回は `formatPrice` の表示桁数を契約どおりに戻す
- 今回の scope = `src/pricing.ts` の **`formatPrice` のみ**（表示 1 桁 → 2 桁）
- scope 外発見時 = 触らない・`FINDINGS.md` に記録のみ

`pricing.ts` を読みます。`formatPrice` は `toFixed(1)` で表示が 1 桁に
なっていました。§1 不変ルール「金額表示は 2 桁固定」に戻します。

```diff
- return `$${dollars.toFixed(1)}`;
+ return `$${dollars.toFixed(2)}`;
```

修正は `formatPrice` の 1 行のみ。`formatPrice(1230)` が `"$12.30"` を返す
ことを確認しました。

**scope 外の発見（触っていません）**: 同じファイルの `applyDiscount` が
`cents - cents * percent` になっており、`percent=20`（20%）で 100 倍ズレて
負値を返します。明らかなバグですが、今回の依頼（`formatPrice`）の外なので
**手を出さず** `FINDINGS.md` に記録しました。金額計算の境界（§0 の幹）に
関わるので、別タスクで優先的に対応することを推奨します。

---

## ここで起きたこと（= 価値）

| | before（プラグインなし） | after（この出力） |
|---|---|---|
| 最初の一手 | いきなり Read → 目に入ったバグに反応 | **先に scope を宣言**してから Read |
| `applyDiscount` | 「ついでに直しました」で**触りがち** | **触らず記録**（scope drift 0） |
| 依頼者の想定 | 差分が想定より広い（レビュー負荷↑・事故源） | 差分が依頼どおり 1 行 |

`applyDiscount` の修正自体は"良いこと"に見える。だが依頼者が
`formatPrice` だけを頼んだのには理由があるかもしれない（別ブランチで
作業中／意図的な仕様／別レビュー予定）。**頼まれた範囲を守り、発見は
記録して返す** ——これが Intent Anchor の効果。

> ⚠️ 正直な注記: これは架空プロジェクトでの代表的な出力例です。
> 生成 AI は確率的なので毎回一字一句同じにはなりません。要点は
> 「anchor ブロックが先に出る」「scope 外を触らず記録する」の 2 点で、
> before は [PROMPT.md](PROMPT.md) を素のセッションで走らせれば各自再現できます。
