# 番人スクリプト雛形 (universal core + stack pack) — 配線ガイド

> Tier: T1 ・ 1行責務: 失敗カタログの各番人を実コードにした雛形。universal core と stack pack に分離。コピーして `{{ }}` を埋める。
> 思想は `../../SKILL.md`、対応する失敗クラスは `../../references/failure-catalog.md` を参照。

## pack 構成（どの pack を使うか）

| Pack | applies_when | 内容 |
|---|---|---|
| `universal/` | 常時（git repo なら適用可。smoke/slo/dast は公開 HTTP endpoint がある場合のみ） | 秘密スキャン・禁止パターン関門・死活スモーク・SLO 定義・DAST |
| `typescript/` | npm ecosystem（package.json）で開発 | any ラチェット・依存ドリフト・CI ゲート（tsc/lint/本番 build）・SCA/SAST |
| `nextjs/` | Next.js + serverless（Vercel 等） | maxDuration 実行時間上限 |
| `supabase-postgres/` | PostgreSQL（Supabase/PostgREST）を DB に使用 | RLS 無効検出・テナント列不変条件・復元演習 |

- 各 pack の `pack.json` = checks のメタデータ（id / scope / severity / evidence / remediation / limitations）。**limitations を読んでから使う**（盛っていない実態記述）。
- 各 pack の `invariants.fragment.md` = `templates/INVARIANTS.template.md` へ節番号対応で合成する stack 固有の不変条件断片（universal の不変条件は template 本体に既在）。

## 何を・どこに置くか

| ファイル (pack 内) | 層 | 対応失敗クラス | コピー先（自リポ） |
|---|---|---|---|
| `universal/.gitleaks.toml` | pre-commit/CI | A1 秘密混入 | リポ直下 |
| `universal/lefthook.yml.template` | pre-commit | A1 | リポ直下（`lefthook install`）|
| `typescript/ci-guardrails.yml.template` | CI | A1/A6/B/J/I4/K4 | `.github/workflows/` |
| `universal/forbidden-patterns.sh` | CI | A6/B2/B7/G1/H1/K4 禁止パターン | `checks/` |
| `typescript/any-ratchet.sh` | CI | J1 型ラチェット | `checks/` |
| `supabase-postgres/rls_disabled_tables.sql` | 監査(定期) | B3 RLS無効 | `checks/` |
| `supabase-postgres/tenant_column_invariant.sql` | 監査(定期) | B4 テナント越境 | `checks/` |
| `nextjs/maxduration-check.mjs` | CI/週次 | I5 実行時間上限 | `checks/` |
| `typescript/dep-drift.mjs` | 週次 | I6 依存ドリフト | `checks/` |
| `universal/smoke.mjs` | デプロイ後/cron | 層4 死活 | `scripts/smoke/` |
| `typescript/dependabot.yml.template` | SCA | I6/供給網 CVE | `.github/` |
| `typescript/sast.yml.template` | CI(SAST) | C/D/B 各クラス | `.github/workflows/` |
| `typescript/semgrep-rules.yml.template` | CI(SAST) | A6/C1/B1/B2/H1 をAST化 | `checks/` |
| `universal/slo.template.yml` | 実行時 | 層4 SLO/エラーバジェット | `observability/` |
| `universal/dast.yml.template` | デプロイ前 | D/E/K 実挙動(ZAP) | `.github/workflows/` |
| `supabase-postgres/restore-drill.md.template` | 定期演習 | A1 復元演習 | runbook/ |

## 原則（SKILL.md より）
- **偽番人を作らない**: ここの静的番人(◎)は確実に検出できるものだけ。config/E2E にしか失敗モードが無いもの(◯)は監査チェックリスト（このスクリプト群でなく `launch-readiness.template.md`）に置く。
- **横断検出器はオーケストレータ層 `checks/` に集約**。本体修正は各コンポーネントの別作業に。
- **多層防御**: pre-commit は警告、CI でブロック。

## 最低限の導入順
1. `universal/.gitleaks.toml` + `universal/lefthook.yml.template`（秘密の止血）
2. `typescript/ci-guardrails.yml.template`（push で必ず止まるゲート。npm 以外の stack は同構成の CI を自作）
3. `universal/forbidden-patterns.sh` + `typescript/any-ratchet.sh`（禁止パターン・型止血）
4. DB を持つなら `supabase-postgres/` の監査 SQL を定期実行
5. 本番があるなら `universal/smoke.mjs` を cron 化
