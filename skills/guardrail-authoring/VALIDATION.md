# 実機検証ログ — 新規番人を実コードに当てた結果

> Tier: T1 ・ 最終確認日: 2026-06-09 ・ 1行責務: guardrails の新規番人を実在の多製品コードで走らせ、動作・誤検出・実検出を確認しチューニングした記録
> 思想: スキル自身の「実測検証」「お手本1個」。番人は書いただけでは硬くない。実データで走らせて初めて精度が分かる。

## 検証環境
- 対象: 実在の TypeScript/Next.js/Supabase 多製品コードベース（9製品・本番稼働あり）
- 方法: サンドボックスで read-only 実行。live DB 不要の番人のみ（RLS無効/テナント越境SQLは DB 接続が要るため別途）

## 結果サマリー
| 番人 | 動作 | 実検出 | 誤検出 | 対応 |
|---|---|---|---|---|
| any-ratchet | ✅ | baseline 実数を取得（製品で大きく差） | — | 正常。ratchet は件数の単調減少だけ見るので絶対精度不問 |
| dep-drift | ✅ | **実害**: DBクライアントが 2.45 vs 2.10x、FW も版混在 | — | 正常。カタログ I6 通りの実問題を発見 |
| maxduration | ✅ | 上限超過 route を検出 | quick-grep がコメントに反応（.mjs本体は `export const` 限定で正） | .mjs は正。粗いgrep併用時は anchor 必須 |
| forbidden-patterns | ✅(要調整→調整済) | K4越境=0(クリーン), A6=0(クリーン) | **A6素grep=ほぼ全部誤検出**（"service_role撤去済"等のコメント/型/テスト）。A4=ラベル文字列に反応 | 下記の通りチューニング |

## forbidden-patterns のチューニング（誤検出 → 精度）
実測で grep番人の弱点（カタログ自身の主張「grep は浅い」）が露見。以下を反映:
1. **コメント行・型定義・テストを除外**してから照合（A6: 素grep 91件 → 0件）
2. **A6 は呼び出し/代入に限定**（`createServiceClient(` ・ `=process.env.SERVICE_ROLE`）。単語一致をやめた
3. **ERROR / WARN を階層化**: 高精度（A6/K4/B7/@ts-ignore）= ERROR でブロック ／ 誤検出が出やすい（A4 secret-in-log・B2 body.userId・eslint-disable）= WARN で人がレビュー
4. **A4 は WARN へ降格**: `'token refresh failed'` 等のラベル文字列に反応し、秘密"値"の出力かは grep では判別不能
5. 結論: 最終版は実在クリーン本体で **ERROR=0 / exit 0**、WARN のみ＝「実害だけで鳴る」状態に到達

## 学び（カタログへ還流済の含意）
- **grep番人は第一関門（粗いが速い）。精密判定は semgrep-rules.yml（AST）を併用**が正しい運用。本検証がそれを実証。
- 番人を入れたら**実データで一度走らせて誤検出を削る**まででワンセット。書いて終わりは「硬く」ない。
- ERROR層は「ほぼ常に実害」のものだけに絞る。誤検出が出る規則を ERROR に置くと番人ごと無視される（crying wolf）。

## 未検証（残）
- RLS無効/テナント越境 SQL: live DB 接続が要るため本ログでは未実行（要 DB で別途）
- semgrep ルール: 環境に semgrep 未導入のため構文レビューのみ（実行時に微調整想定）
- knowledge系3スキル（doctrine/staff-officer/doc-constitution）の発動精度: 実セッションでの観測が必要
