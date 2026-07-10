# 番人スクリプト雛形 — 配線ガイド

> Tier: T1 ・ 1行責務: 失敗カタログの各番人を実コードにした雛形。コピーして `{{ }}` を埋める。
> 思想は `../SKILL.md`、対応する失敗クラスは `../references/failure-catalog.md` を参照。

## 何を・どこに置くか

| ファイル | 層 | 対応失敗クラス | 置き場所 |
|---|---|---|---|
| `.gitleaks.toml` | pre-commit/CI | A1 秘密混入 | リポ直下 |
| `lefthook.yml` | pre-commit | A1 | リポ直下（`lefthook install`）|
| `ci-guardrails.yml` | CI | A1/A6/B/J/I4/K4 | `.github/workflows/` |
| `checks/forbidden-patterns.sh` | CI | A6/B2/B7/G1/H1/K4 禁止パターン | `checks/` |
| `checks/any-ratchet.sh` | CI | J1 型ラチェット | `checks/` |
| `checks/rls_disabled_tables.sql` | 監査(定期) | B3 RLS無効 | `checks/` |
| `checks/tenant_column_invariant.sql` | 監査(定期) | B4 テナント越境 | `checks/` |
| `checks/maxduration-check.mjs` | CI/週次 | I5 実行時間上限 | `checks/` |
| `checks/dep-drift.mjs` | 週次 | I6 依存ドリフト | `checks/` |
| `smoke/smoke.mjs` | デプロイ後/cron | 層4 死活 | `scripts/smoke/` |
| `dependabot.yml` | SCA | I6/供給網 CVE | `.github/` |
| `sast.yml` | CI(SAST) | C/D/B 各クラス | `.github/workflows/` |
| `checks/semgrep-rules.yml` | CI(SAST) | A6/C1/B1/B2/H1 をAST化 | `checks/` |
| `observability/slo.yml` | 実行時 | 層4 SLO/エラーバジェット | `observability/` |
| `dast.yml` | デプロイ前 | D/E/K 実挙動(ZAP) | `.github/workflows/` |
| `restore-drill.md` | 定期演習 | A1 復元演習 | runbook/ |

## 原則（SKILL.md より）
- **偽番人を作らない**: ここの静的番人(◎)は確実に検出できるものだけ。config/E2E にしか失敗モードが無いもの(◯)は監査チェックリスト（このスクリプト群でなく `launch-readiness.template.md`）に置く。
- **横断検出器はオーケストレータ層 `checks/` に集約**。本体修正は各コンポーネントの別作業に。
- **多層防御**: pre-commit は警告、CI でブロック。

## 最低限の導入順
1. `.gitleaks.toml` + `lefthook.yml`（秘密の止血）
2. `ci-guardrails.yml`（push で必ず止まるゲート）
3. `checks/forbidden-patterns.sh` + `checks/any-ratchet.sh`（禁止パターン・型止血）
4. DB を持つなら `rls_disabled_tables.sql` / `tenant_column_invariant.sql` を定期実行
5. 本番があるなら `smoke/smoke.mjs` を cron 化
