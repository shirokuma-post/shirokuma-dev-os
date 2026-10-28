# 型安全ラチェット — `any` 撲滅の段取り

> Tier: T1 ・ 最終確認日: YYYY-MM-DD ・ 1行責務: `as any` 等の「逃げ」を止血し、段階的に撲滅し、再混入を恒久ロックする手順
> 前提: `as any`・二段キャスト(`as unknown as X`)・`@ts-ignore`・`eslint-disable` は engineering-doctrine の「逃げ」。型を黙らせると phantom 列参照・列ズレ・write 失敗・常時 null 等の**本物バグ**が隠れる。

## なぜ段階的にやるか
一気にやると巨大 diff でレビュー不能。未確立の手順で中枢（関門/Vault/secret 系）を触ると影響半径が最大。だから「止血 → 危険度順 → 小→大→中枢最後 → 恒久ロック」。

## 手順

### 1. 止血（増やさない gate を先に）
撲滅の前に**新規混入を止める**。
- CI で型エラー / lint error を fail させる。
- `no-explicit-any` の **baseline ratchet**: 現在数を上限として記録し、超過したら CI fail・減少のみ許可。
- baseline は CI と同一コマンドで算出（乖離防止）。

### 2. 危険度順に潰す（件数順にしない）
1. `as any`（型チェック無効化）を最優先
2. `:any` 注釈
3. ライブラリ境界（自前の `*.d.ts` / module augmentation / 明示戻り値型で潰す）

### 3. Wave 分割（小→大→中枢最後）
- 小規模コンポーネントで「置換手順・検品基準・型付けパターン集」を確立。
- 確立後に大規模へ。影響半径最大の中枢（関門/Vault/secret）は**最後**。
- コンポーネント単位で1イニシアチブ、ファイル/モジュール単位で 50–100 件のサブバッチ。

### 4. runtime 不変の原則（load-bearing cast の扱い）
- 原則: **型注釈の追加で runtime（描画/payload/送信内容）を変えない**。型を緩める（optional 化）で同一挙動を保つ。
- cast がバグを隠していた箇所は除去に runtime 変更が不可避な「load-bearing cast」→ **別 commit に分離**し、生成型・実 DB で裏取りの上で承認して是正。
- 各バッチの合格 = `tsc --noEmit`=0 かつ lint error=0 かつ差分レビュー（型が緩んでいない/runtime 不変）。公開・配信・token 経路は payload 不変を個別精査。

### 5. 恒久ロック（2段ラチェット）
- 第1段: baseline ratchet（全コンポーネントで単調減少のみ許可）。
- 第2段: 0 到達したコンポーネントは設定を `off → error` に切替え、再混入を**永久ブロック**。
- 全コンポーネント `error` 化 = 撲滅完了＋恒久ロック。
- 完了定義を「100%・境界も0・妥協ライン無し」と明文化（中途半端な許容を防ぐ）。

## 番人まとめ
- ◎ 型自動生成（DB → 型）を ground truth に。
- ◎ `no-explicit-any` baseline ratchet（増えたら CI fail）。
- ◎ 0 到達後の `off→error` 恒久ロック。
- ◯ `git diff` で新規 hard-escape 追加=0 を実測（worker 報告も実測で裏取り。誤報があった前例あり）。
