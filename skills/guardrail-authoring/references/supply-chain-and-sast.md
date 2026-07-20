# 供給網 & SAST — grep番人を構文解析へ格上げ

> Tier: T1 ・ 1行責務: 依存の脆弱性(SCA)・静的解析(SAST)・供給網の完全性を CI ゲートに足し、番人を grep から AST/CVE 照合へ格上げする
> 位置づけ: guardrails 層2(CIゲート)の強化。失敗カタログの「grep番人(◎)」は構文を見ないため取りこぼす。ここで AST 解析(Semgrep/CodeQL)と既知脆弱性照合(SCA)を重ねる＝多層防御。

## なぜ必要か（grep の限界）
`forbidden-patterns.sh` は速いが「文字列一致」で、変数経由・別名 import・コメント内などを誤検出/取りこぼす（crying wolf の芽）。AST ベースの Semgrep/CodeQL はデータフローを追えるので、同じ失敗クラスを**より正確に**捕まえる。依存の既知脆弱性(CVE)は静的解析では出ない別軸 → SCA が要る。

## 1. SCA（依存の脆弱性スキャン）
- **Dependabot / Renovate**: 依存の CVE 検知＋自動 PR。`dependabot.yml.template` 参照。最低限これだけは即入れる（無料・設定だけ）。
- **`npm audit --audit-level=high`** を CI に。高/重大が出たら fail（許容するなら理由を記録）。
- **lockfile 必須**: `npm ci`（`npm install` でなく）で lockfile 通りに固定。失敗カタログ I6（caret ドリフト）と対。
- 補強: Snyk / Trivy / osv-scanner（OSV データベース照合）。

## 2. SAST（静的アプリ解析）
- **CodeQL**（GitHub 無料・公開/一部private）: SQLi/XSS/SSRF/パストラバーサル等をデータフローで検出。`sast.yml.template` 参照。
- **Semgrep**: 軽量・自前ルールが書きやすい。**失敗カタログの番人を Semgrep ルール化**すると grep より正確（`semgrep-rules.yml.template` に C1 SSRF / B1 URL属性XSS / A6 特権越境 / B2 body.userId信頼 を AST で）。
- 運用: SAST は **差分(PR)に対して** 走らせると速く誤検出疲れしにくい。新規 finding を fail、既存は baseline 管理（型ラチェットと同思想）。

## 3. 供給網の完全性（SLSA 的な最低線）
- **GitHub Actions を commit SHA で pin**（`@v4` でなく `@<sha>`）。タグは差し替え可能＝サプライチェーン注入の入口。Dependabot で actions も更新。
- **`permissions:` を最小化**（workflow に `permissions: contents: read` を明示。デフォルト広すぎ）。
- **SBOM 生成**（`syft` 等）でビルド成果物の中身を記録。インシデント時に「どの依存が入っていたか」を遡れる。
- **ビルドの来歴(provenance)**: 余裕があれば SLSA provenance / artifact 署名（`cosign`）。ここは成熟段階で。
- **third-party script の固定**: CDN script は SRI(integrity ハッシュ)付き、または self-host。

## 4. 秘密のライフサイクル（カタログ A6 の補完）
- **ローテーション周期を決める**（例: 鍵は90日、漏洩時は即時）。周期を doc に明文化（さもないと「いつか」になる）。
- **KMS/Vault** に寄せ、アプリは復号結果を短命使用・log/cache しない（既出）。
- **アクセスレビュー**: 誰がどの秘密に触れるかを定期棚卸し。

## CI への足し方（最小→充実）
1. `dependabot.yml`（依存＋actions の CVE/更新）— 設定だけ
2. `npm audit` を既存 `ci-guardrails.yml` の typecheck job に1行追加
3. `semgrep-rules.yml` で失敗カタログの主要4クラスを AST 化（grep番人と併走）
4. CodeQL workflow を別 job に（言語が対応していれば）
5. Actions の SHA pin ＋ `permissions` 最小化（全 workflow）
6. （成熟段階）SBOM・provenance・署名

## 番人まとめ
- ◎ Dependabot/Renovate（CVE自動PR）／`npm audit` CI fail
- ◎ Semgrep ルール（失敗カタログを AST 化）／CodeQL（データフロー）
- ◎ Actions SHA pin ＋ `permissions` 最小（grep でも検出可）
- ◯ SBOM/provenance/署名（成熟段階）／秘密ローテ周期の明文化
