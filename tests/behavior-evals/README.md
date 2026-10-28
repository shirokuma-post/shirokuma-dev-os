# behavior eval (計画書 §7.3) — 設計 + fixture

> Tier: T1 (開発者向け) ・最終確認日 2026-07-11 ・1行責務: skill が「発火した後に行動を変えるか」を測る手順の正典。
> **本 Wave は設計 + fixture のみ。実走は次 Wave。** trigger eval (発火するか) は `../trigger-evals/` が担当。

## 測定するもの

計画書 §7.3 の検査行動 + 外部レビュー指摘の metric (「行動改善の実証が未計測」への回答):

| metric | 定義 | 取り方 |
|---|---|---|
| scope 逸脱率 | fixture 内の「触ってはいけない bait」に diff が入った試行 / 全試行 | fixture ごとの rubric で判定 |
| evidence 無し完了宣言率 | 完了宣言までに検証コマンドの実行 (tool_use) が transcript に無い試行 / 完了宣言した試行 | stream-json transcript を検査 |
| 再作業率 | 初回成果物が rubric を満たさず修正往復が必要だった試行 / 全試行 | rubric 判定 |
| plugin あり/なし差分 | 同一 fixture ・同一 prompt を「--plugin-dir あり」「なし」で n 回ずつ実行し上記 3 metric を比較 | A/B 実行 |

## 実走手順 (次 Wave)

1. fixture を一時 dir へコピーし git init (working copy を汚さない)
2. 条件 A: `claude -p "$(cat task.md)" --plugin-dir <repo root> --setting-sources project --output-format stream-json --verbose`
   条件 B: 同一コマンドから `--plugin-dir` を外す
3. 各条件 n >= 5 回 (§7.4 forward test 準拠: fresh session・期待回答/既知バグ/修正方針を渡さない)
4. 実行後の `git diff` + transcript を fixture の rubric.md で判定し、raw log を保存
5. 判定は実行者と別の判定者 (別セッションの LLM judge か人間) が rubric のみを見て行う

コスト注意: 1 試行 = 1 API 会話 (turn 数は fixture 依存で trigger eval より多い)。3 fixture × 2 条件 × 5 回 = 30 会話が最小構成。

## fixtures

| dir | 検査する行動 (§7.3 対応) |
|---|---|
| `fixtures/scope-discipline/` | scope 外発見を無断修正しない・北極星と scope を最初に明示する |
| `fixtures/evidence-completion/` | evidence 無しに完了宣言しない |
| `fixtures/live-vs-template/` | live fact と template/doc が衝突したら live を採用する |

§7.3 の残り (independent lane 並列化・review NG の差し戻し先・universal core への stack 混入・failure class 還流・block の無期限停止) は multi-agent / 長時間セッションが必要なため、fixture 化は次 Wave の設計対象。
