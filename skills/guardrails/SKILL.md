---
name: guardrails
description: 安全に開発を進めるための「番犬（番人）と品質ゲート」の型。過去の失敗を二度と起こさないため、1失敗クラスに1つ自動チェックを置き「探す」を「存在できない」に変える。pre-commit秘密スキャン・CIゲート（秘密スキャン/禁止パターン/型/lint/本番ビルド）・デプロイ前E2E/スモーク・実行時の番犬（honeypot/canary/死活監視）・多層防御・ローンチ前チェックリスト・型安全ラチェット(any撲滅)を含む。「番犬」「番人」「CI」「ESLint」「lint」「E2E」「Playwright」「スモークテスト」「死活監視」「gitleaks」「秘密スキャン」「pre-commit」「フック」「チェックポイント」「品質ゲート」「ローンチ前」「商用化前」「リリース準備」「再発防止」「型安全」「any撲滅」「バックアップ」「復元」「ロールバック」「feature flag」「段階リリース」「DAST」「SBOM」「SLO」「依存脆弱性」「SCA」「CodeQL」「Semgrep」「成熟度」「ロードマップ」といった場面で使う。同梱の失敗カタログは過去の全失敗クラス→恒久対策の正典、maturity-roadmapは全対策をNow/Next/Laterに段階化（何も削らず順序付け）。プロジェクト非依存（固有のツール名・閾値は置換）。
---

# Guardrails — 番犬（番人）と品質ゲート

> 安全に開発を進めるための手引き。**人の注意力を当てにしない。** 失敗は「気をつける」では消えない。
> 中核思想: **1失敗クラス = 1番人**。手で直すだけだと兄弟コンポーネントで同じ根からまた生える。
> 失敗クラスごとに**機械の番人（自動チェック）を1個**つけて、「探す」を「**存在できない**」に変える。
> 同梱の `references/failure-catalog.md` が、過去の全失敗クラス→根因→恒久対策→番人 の正典。

## 中核原則（番人を置くときの掟）

1. **1失敗クラス = 1番人**: バグは個別に潰しても根が残れば再発する。クラス単位で自動チェックを1個常設し、再発を構造的に不可能にする。
2. **検出器を起動すると潜在在庫が一斉に露見する（回帰ではない）**: 型生成・E2E・実データ巡回・スモークを**出荷前**に走らせると、本番未発火の潜在バグが顧客に当たる前に出る。これは「壊れた」のではなく「元からあった」。歓迎する。
3. **多層防御（defense in depth）**: ローカル（pre-commit）は**警告**、CI は**ブロック**。1層に頼らない。RLS があってもアプリ層でも絞る。
4. **偽番人を作らない（crying wolf 回避）**: 静的に確実に検出できるものだけ自動番人化する。config/E2E にしか失敗モードが無いもの（cookie domain・redirect allowlist 等）は grep でなく**監査チェックリスト**にする。誤検出する番人は無視され機能しない。
5. **番人の置き場所を分ける**: 横断検出器はオーケストレータ層（`checks/` ＋ 定期レビュー）に集約。本体修正は各コンポーネントの別作業に分離。
6. **最初から入れる**: これらは「後で」ではなく**プロジェクト立ち上げ時**に仕込む。番人ゼロで書き始めると潜在在庫が溜まり、ローンチ直前に雪崩になる。

---

## 5層の防御線

### 層1. pre-commit（ローカルの番犬・警告）
- **秘密スキャン**: commit 時に staged diff へ秘密スキャン（gitleaks 等）。ヒットしたら commit 中断。
- ツール未導入のローカルでは**警告のみで通す**設計（CI で必ず止まるので二重には止めない）。緊急 bypass は明示フラグでのみ。
- 目的: 秘密（鍵・トークン・PII・移行データ）の混入を**コミット前**に止める。

### 層2. CI ゲート（push/PR・ブロック）
push/PR で**必ず止まる**ゲート群。ローカルをすり抜けてもここで止める。
- **秘密スキャン（再）**: pre-commit は追跡外で漏れるため CI でも必ず実行。
- **禁止パターン番人**: 「再導入してはいけないもの」を機械検出して 0 件強制。例: 最高権限キー（service_role 等）を関門以外で import / 他コンポーネントの本番URL直 fetch（越境）/ `as any`・`@ts-ignore` の新規増加 / `.env.example` に別系統の接続先。
- **型安全ラチェット**: 型エラー 0 を fail 条件に。`any` は baseline ratchet（現在数を上限、超過で fail・減少のみ可）。0到達したら `off→error` で再混入を永久ブロック（→ `references/type-safety-ratchet.md`）。
- **lint**: lint error を fail 条件に。
- **本番ビルド job**: `tsc --noEmit` 緑をデプロイ可否の唯一根拠にしない。フレームワークの**本番ビルド**でしか落ちないエラー（route の不正 export 等）があるため、本番ビルド相当を CI に含める。

### 層3. デプロイ前ゲート（出荷の関門）
- **E2E（コアフロー）**: 主要導線を**本番直叩き**で緑にする（越境0・データ汚染0を確認）。
- **スモーク**: 全コンポーネントの死活を1コマンドで判定（→ 層4 の health 契約）。
- **デプロイ実測検証**: 「push が通った＝本番反映」と仮定しない。デプロイ経路はコンポーネント別（Production Branch と push 先の一致を要確認）。完了の定義 = 「ビルドステータス success **かつ** 本番 health の version(commit sha) が HEAD と一致」。identity 不一致（repo owner / push / ホスティング連携）は無言のスキップ＝stale ビルドを生むので事前整合。

### 層4. 実行時の番犬（runtime watchdog）
本番で動き続ける番人。攻撃・障害を**動いている最中**に捕まえる。
- **死活監視 cron**: 定期スケジュールで全コンポーネントの health を巡回し、異常時に**運営最上位の管理者のみ**へ通知（dedupe 付き）。最初から全コンポーネントに行き渡らせる（お手本1個で止めない）。**自系統のみ**を叩く（越境・テナント越境厳禁）。
- **health 出力契約（単一正典）**: top-level `status`（`healthy|degraded|unhealthy` の3値）＋ `product/timestamp/version/checks` を共通契約として1箇所で定義。監視は `status` だけ見れば死活判定できる状態を保つ。DB ping は**自分のスキーマ**を叩く（共通の当たり障りない経路だけ叩いて偽 healthy を作らない）。
- **honeypot（罠）**: 触れてはいけない餌（おとりendpoint/レコード）を置き、命中＝侵入のシグナルとして即エスカレーション。
- **canary**: 軽量な疎通/鍵経路の生存確認 endpoint を常設し、壊れたら即わかる。
- **レート制限（実行時）**: 公開 endpoint・AI ルートは per-IP / per-user のレート制限を標準装備（BYOK でも濫用責任は自社に跳ねる）。**Redis-backed** に統一（in-memory は serverless で無効）。

### 層5. 多層防御の常識（設計に織り込む）
- 認可は RLS **だけ**に頼らずアプリ層でも `user_id` で絞る。
- 秘密はスコープ局所化（最高権限キー・暗号鍵は関門のみ／トークンはコンポーネント独立鍵）。
- 復号失敗は **throw**（silent に生 ciphertext を返さない。UX 用途のみ null 返しを別関数で）。
- 公開レンダラーは保存時＋配信時の二重サニタイズ。

---

## 使い方

**新規プロジェクト立ち上げ時**: 層1〜2を最初に仕込む（pre-commit フック＋CI ゲート）。`references/failure-catalog.md` を一読し、該当する失敗クラスの番人を `checks/` に置く。`references/launch-readiness.template.md` をローンチ用ゲートとして用意。

**機能追加・レビュー時**: その変更が `references/failure-catalog.md` のどの失敗クラスに触れるかを見て、対応する番人が効いているか確認。新しい失敗クラスを踏んだら、**1個番人を足し**てカタログへ1行還流（→ doc-constitution / engineering-doctrine 規律4）。

**ローンチ前**: `references/launch-readiness.template.md` を機械的ゲートとして通す（総合評価とは分離）。全番人が緑・E2E コアフロー緑・health 契約準拠・プラン上限超過0 を確認。

## 関連
- **engineering-doctrine**（逃げ検知）: ゲートを `ignoreBuildErrors` 等で**殺す**のを禁じる。番人を無効化しない規律。
- **staff-officer**: セキュリティゲート（Phase 3.5）がこのカタログをチェックリスト源に使う。
- **doc-constitution**: 新しい失敗クラス・番人をカタログへ還流する doc 運用。
- 同梱(参照): `references/failure-catalog.md`（全失敗クラス→恒久対策）/ `references/launch-readiness.template.md` / `references/type-safety-ratchet.md` / `references/supply-chain-and-sast.md`（SCA/SAST/供給網）/ `references/observability-slo.md`（可観測性・SLO）/ `references/resilience-and-delivery.md`（復元演習・expand-contract移行・feature flag/即ロールバック・DAST・SBOM）/ `references/maturity-roadmap.md`（全項目を Now/Next/Later に段階化）
- 実装雛形: `assets/packs/`（universal / typescript / nextjs / supabase-postgres の 4 pack に分離。gitleaks・lefthook・CIワークフロー・禁止パターンgrep・anyラチェット・RLS無効/テナント越境SQL・maxDuration/依存ドリフト/死活スモーク・dependabot・CodeQL/Semgrep・semgrepルール(失敗カタログのAST化)・SLO定義）。配線は `assets/packs/README.md`、各 pack の checks メタデータは `pack.json`、stack 固有の不変条件断片は `invariants.fragment.md`（INVARIANTS.template.md へ節番号対応で合成）。コピーして `{{ }}` を埋める。

## 番人の格上げ（grep → 構文解析 → CVE/SLO）
層2の grep番人は速いが浅い。`references/supply-chain-and-sast.md` で **Semgrep/CodeQL（AST・データフロー）** と **SCA（Dependabot/npm audit で既知脆弱性）** を重ねて精度を上げる。層4の死活監視は最低線で、`references/observability-slo.md` で **SLO/エラーバジェット＋バーンレート・アラート** に引き上げ、じわ劣化を顧客より先に捕まえる。
