# INVARIANTS fragment — typescript (npm ecosystem) 固有の不変条件

> `templates/INVARIANTS.template.md` に合成する断片。見出し番号は本体の節番号に対応し、同名節の表末尾に行を追記する形で合成する。
> npm ecosystem (bundler / top-level import 評価を持つ JS/TS ビルド) で開発する場合のみ適用。

## 5. 入力検証

| ルール | 詳細 |
|---|---|
| **重い import ライブラリは遅延読み込み** | top-level import がビルドを壊す場合は遅延 require |
