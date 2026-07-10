# shirokuma-dev-os 改善・製品化計画

> Tier: T1 plan ・ 作成日: 2026-07-11 JST ・ 1行責務: shirokuma-dev-os を思想・テンプレ集から、Claude Code / Codex で導入・検証・更新できる開発governance pluginへ引き上げる正典。
> **2026-07-11 改訂**: 初版 baseline は SaaS hub 内 snapshot を実測したもので、上流正典 v1.2.2 の実態と乖離していた。本版は上流 live 実測 (commit e7747ca) + guardrails port (6567a82) を反映した改訂版。

## 0. 結論

shirokuma-dev-os は、Superpowers、Spec Kit、BMADの代替を目指さない。

- Superpowersが「どう実装するか」を担う。
- Spec Kitが「何を作るか」を仕様へ固定する。
- BMADが「誰が担当するか」を役割とworkflowへ落とす。
- shirokuma-dev-osは「何を曲げてはならないか、判断をどう検証し、失敗をどう組織能力へ変えるか」を担う。

北極星は次に固定する。

> **AI開発のconstitution / governance layerとして、北極星・責任境界・実測・不変条件・失敗学習を、agentが実行可能な規律へ変える。**

製品化の順序は、機能追加ではなく以下とする。

1. 現在地を正直にする。
2. 1つのcanonical sourceへ再配置する。
3. Claude Code / Codexの正式pluginとして梱包する。
4. 6 skillの発火精度と相互作用をevalで固定する。
5. staff-officerとguardrailsを説明から実行可能なagent / script / hookへ昇格する。
6. universal coreとstack packを分離する。
7. install / update / doctor / uninstallを閉じる。
8. 実プロジェクトでdogfoodし、証拠付きでpublic alphaへ進む。

本計画はcalendarではなくgateで進める。前Phaseの完了条件を満たさず次へ進まない。

**2026-07-11 実測時点で 1〜3 は上流正典側で既に達成済** (詳細 = §1.2 上流正典側の表)。残る主戦場は 4〜8。

---

## 1. 現状ベースライン

### 1.1 強い資産

| 資産 | 現在の価値 |
|---|---|
| `engineering-doctrine` | 境界線思考・逃げ検知・実測検証・根本原因を、判断前の規律にしている |
| `engineering-doctrine-universal` | 上記の普遍核だけを蒸留した配布版 (第2層)。stack 固有語彙を剥がし済 |
| `staff-officer` | L0〜L4、4ライン、並列Worker、独立検品、統合というAI開発組織モデルを持つ |
| `doc-constitution` | 1事実=1正典、鮮度優先、Tier、上流還流で組織記憶を管理する |
| `session-operations` | マルチセッション並走の運用規律 (1ドメイン1セッション・起動プロトコル・引き継ぎ) |
| `guardrails` | 1失敗クラス=1番人として、失敗を自動検出・恒久対策へ変換する |
| `failure-catalog` | 過去の失敗を根因・対策・番人へ接続する学習資産 |
| scripts/templates | gitleaks、CI、SAST、RLS、型ratchet、SLO、restore drill等の実装雛形を持つ |
| `VALIDATION.md` | 実在9製品でgrep番人の誤検知を調整した実測記録がある |

### 1.2 現在地の事実 (2026-07-11 実測・改訂)

初版が「製品として不足している事実」として挙げた項目は、**SaaS hub repo 内の stale snapshot** (`shirokuma_SaaS/skills/shirokuma-dev-os/`) の実測値であり、上流正典の姿ではなかった。2 表に分離して訂正する。

#### (a) snapshot 側 (SaaS hub 内・stale・初版 baseline の実測対象)

hash 固定 = `docs/baseline-2026-07-11.md` (SaaS repo HEAD 4a614f9 時点・33 file md5 一覧)。

- 33ファイル、Markdown約1,153行。`SKILL.md`は4件 (staff-mode 旧名のまま)。
- plugin.json / marketplace.json / `skills/` 配置 / version / license / changelog / CI = **なし** (snapshot にはない、が正しい主語)。
- READMEが言及する`.skill` installer / archiveは実在しない → **2026-07-11 に README を「上流が正典・本 dir は stale snapshot」へ修正済**。
- guardrails skill の本体はこの snapshot 側にのみ存在していた → **2026-07-11 に上流へ port 完了** (下記 (b))。

#### (b) 上流正典側 (`github.com/shirokuma-post/shirokuma-dev-os`・独立 git repo・v1.2.2 = commit e7747ca)

v1.2.2 (2026-07-08) 時点で既に実在 (2026-07-11 に ls / grep / CHANGELOG で実測):

- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json`・MIT LICENSE・CHANGELOG.md・PRIVACY.md。
- `skills/` 正式配置。skill は **5 個** = engineering-doctrine / engineering-doctrine-universal / doc-constitution / **staff-officer** (初版の「staff-mode」は snapshot 側の旧名) / session-operations。
- `scripts/init.mjs` + `scripts/audit-self-integrity.mjs`・CI (`.github/workflows/self-integrity.yml`)・demo/。
- **`claude plugin marketplace add` + `/plugin install` の live E2E PASS 済** (CHANGELOG [1.2.2] 参照)。

さらに **2026-07-11 に guardrails を上流へ port 完了** (branch feat/guardrails-port・commit 6567a82・26 file・md5 24/26 一致・DIFF 2 は staff-mode→staff-officer 参照追従 各 1 行・version 1.3.0 bump・audit-self-integrity PASS・`claude plugin validate` PASS)。これで skill は **6 個**。

#### (c) 残ギャップ (真の TODO・2026-07-11 実測)

- trigger / behavior eval 0 件 (発火精度は依然未検証)。
- agents / commands / hooks なし。
- doctor.mjs なし (audit-self-integrity.mjs が部分代替)。
- universal core と stack pack の分離未着手 (guardrails scripts に TS/Next/Supabase 固有が混在したまま = §5 W4 は依然有効)。
- marketplace.json description に guardrails 未言及・GOVERNANCE の 2 層継承分類に guardrails 未記載。
- ~~Codex 側は一切未検証 (codex CLI 未導入 = §4.2 参照)。~~ → **✅ 実測済 (2026-07-11・codex-cli 0.144.1)**: dual manifest 実在 + marketplace add / plugin add / 6 skill runtime discovery / remove の live smoke 全 PASS (§4.2 参照)。残 = 同一 task set での behavior 実走 (§7.4)。

### 1.3 現在の評価 (2026-07-11 再採点)

「現在(初版)」列 = snapshot 実測に基づく初版採点。「上流実測」列 = 上流正典 v1.2.2〜1.3.0 の live 実測に基づく再採点 (根拠 1 行付き)。

| 軸 | 現在(初版) | 上流実測 | 目標 | 再採点根拠 (2026-07-11 実測) |
|---|---:|---:|---:|---|
| 思想・一貫性 | 8.5/10 | 8.5/10 | 9/10 | 変わらず (本文は snapshot と md5 ほぼ一致) |
| skill本文 | 7.5/10 | 7.5/10 | 8.5/10 | 変わらず (§5 の改善は未着手) |
| 実務資産 | 8/10 | 8.5/10 | 9/10 | guardrails port 完了で scripts 17 本 + references 7 本が正典入り |
| 発火精度 | 4/10 | 4/10 | 8.5/10 | eval 0 件のまま = 未検証 (VALIDATION.md 自身が認める) |
| plugin梱包 | 2.5/10 | 8/10 | 9/10 | plugin.json + marketplace.json + LICENSE + CHANGELOG + CI + audit script 実在・validate PASS |
| 導入・更新 | 2/10 | 7.5/10 | 9/10 | `/plugin install` live E2E PASS 済 (CHANGELOG [1.2.2])・doctor / uninstall 検証は未 |
| cross-platform | 3/10 | 6.5/10 | 8/10 | Codex dual manifest + install/discovery/remove live smoke PASS (2026-07-11・codex-cli 0.144.1)。同一 task set 実走と dogfood は残 |
| 自動検証 | 4/10 | 5.5/10 | 9/10 | self-integrity CI + audit-self-integrity 全 PASS・trigger/behavior eval は 0 件 |
| 総合 | 5.5〜6/10 | 6.5〜7/10 | 8〜8.5/10 | 梱包・導入は達成済、発火精度と実行可能化が残る |

---

## 2. 製品境界

### 2.1 提供するもの

- 北極星・scope・責任境界を判断の上位に固定する。
- 変更規模とriskに応じて、単独実装・並列Worker・独立reviewを選ぶ。
- 推測ではなくlive / code / test / artifactを根拠にする。
- 既知の失敗クラスを番人へ変換する。
- 失敗から得た普遍教訓を上流へ還流する。
- project固有の事実とuniversal doctrineを混同しない。
- agentが使った規律、見た証拠、残した未完事項を説明可能にする。

### 2.2 提供しないもの

- IDE、compiler、LSPの代替。
- SuperpowersのTDD / brainstorming workflowの再実装。
- Spec Kitのspec生成workflowの再実装。
- BMADの全職種agent catalogの再実装。
- Windshieldのruntime reroute実装の同梱。
- security boundaryや完全安全の保証。
- 全stackの固有best practiceをuniversal coreへ詰め込むこと。
- 1つの失敗から無制限にscopeを拡張すること。

### 2.3 競合ではなく上位レイヤー

shirokuma-dev-osは、既存workflow pluginと併用可能にする。

```text
shirokuma-dev-os
  ├─ North Star / Scope / Invariants
  ├─ Evidence / Review / Failure Learning
  └─ Governance
       ↓ governs
Superpowers / Spec Kit / BMAD / native coding agent
       ↓ executes
Project code / CI / deploy
```

併用時、dev-osは実装手順を横取りしない。workflowの成果物とdiffが、北極星・scope・evidence・invariantsを満たすかを管理する。

---

## 3. 正典・優先順位の修正

現在の「下流とズレたら上流を正とする」は適用範囲が広すぎる。次へ置換する。

### 3.1 判断優先順位

```text
明示されたuser scope / authority
  > live環境・実コード・実測された現在事実
  > project固有のNorth Star / INVARIANTS / boundary
  > universal doctrine
  > template / example / historical note
```

### 3.2 上流を正とする範囲

- universal principleの定義は上流正典を正とする。
- projectの現在事実は下流の実コード・live観測を正とする。
- project固有の例外は、理由と境界を明記して差分として保持する。
- 下流で見つけた普遍教訓は上流へ提案するが、上流更新前に他projectへ自動適用しない。
- templateがlive realityと衝突した場合、templateを優先してはならない。

### 3.3 根本原因とscopeの両立

「そのcommitで根を潰す」を次へ精密化する。

- userが置いたscope内の根本原因は、その変更内で潰す。
- scope外の原因は勝手に修正しない。
- scope外発見は、evidence、影響、推奨owner、期限または再評価条件を記録する。
- scopeを広げないと依頼目的を達成できない場合だけ、実装を止めてauthorityを求める。
- unrelated workを「根本原因」の名で混ぜない。

### 3.4 停止ではなく工程変更

dev-osの「止める」は対象を限定する。

- 止める対象: 危険な原操作、壊れたbranch、promotion、merge。
- 止めない対象: Work Order全体、独立lane、修正工程、証拠収集。
- review NGは`rework lane`へ戻す。
- worker failureは、capabilityがあれば別workerへhandoffする。
- 人間判断が必要な価値衝突だけL0へ上げ、独立作業は継続する。

---

## 4. 目標plugin構造

canonical skill sourceを1箇所に置き、Claude Code / Codex固有差分は薄いmanifestとadapterへ隔離する。
**注 (2026-07-11)**: `.claude-plugin/` (plugin.json + marketplace.json)・`skills/` 6 個・`scripts/init.mjs` + `audit-self-integrity.mjs`・LICENSE・CHANGELOG・docs/ は上流に実在済。以下の木は目標形であり、agents/ commands/ hooks/ tests/ doctor.mjs と `.codex-plugin/` が未着手分。

```text
shirokuma-dev-os/
├── .claude-plugin/
│   ├── plugin.json          # 実在 (v1.3.0)
│   └── marketplace.json     # 実在
├── .codex-plugin/
│   └── plugin.json          # 実在 (v1.4.0・2026-07-11 live smoke PASS)
├── .agents/
│   └── plugins/
│       └── marketplace.json # 実在 (Codex marketplace 定義・実物形式は .claude-plugin/marketplace.json と別 schema)
├── skills/
│   ├── engineering-doctrine/            # 実在
│   ├── engineering-doctrine-universal/  # 実在 (配布版・第2層)
│   ├── staff-officer/                   # 実在 (旧名 staff-mode)
│   │   └── references/
│   │       ├── claude-code.md   # 目標: platform adapter 分離
│   │       ├── codex.md         # 目標 (⚠ blocked)
│   │       └── single-agent.md  # 目標
│   ├── doc-constitution/                # 実在
│   ├── session-operations/              # 実在
│   └── guardrails/                      # 実在 (2026-07-11 port・6567a82)
│       ├── references/
│       ├── scripts/
│       └── assets/packs/        # 目標: universal / typescript / nextjs / supabase-postgres
├── agents/                      # 目標: orchestrator / reviewer / invariant-gatekeeper
├── commands/                    # 目標: dev-os-init / dev-os-doctor / dev-os-audit
├── hooks/                       # 目標
├── scripts/
│   ├── init.mjs                 # 実在
│   ├── audit-self-integrity.mjs # 実在 (audit-self 相当)
│   ├── doctor.mjs               # 目標
│   ├── migrate-legacy-install.mjs  # 目標
│   └── validate-links.mjs       # 目標
├── tests/                       # 目標: trigger-evals / behavior-evals / fixtures / smoke
├── docs/
│   ├── dev-os-productization-plan-2026-07-11-ja.md  # 本 file (正典)
│   └── baseline-2026-07-11.md   # snapshot 側 33 file の md5 固定
├── README.md / LICENSE / CHANGELOG.md / PRIVACY.md / GOVERNANCE.md   # 実在
```

### 4.1 配置規律

- skill内には実行に必要な`SKILL.md / references / scripts / assets / agents`だけを置く。
- install guide、release notes、計画書はplugin root側へ置く。
- 同じ規律本文を複数skillへコピーしない。正典へのlinkで接続する。
- platform固有のtool名やsubagent起動方法をuniversal本文へ直書きしない。
- manifestは2種類持つが、skill本体は1ソースとする。
- manifest metadataのdriftはCIで検出する。

### 4.2 manifest方針

Claude Code:

- `.claude-plugin/plugin.json` — **実在・live E2E PASS 済** (CHANGELOG [1.2.2])。
- `skills/`、`agents/`、`commands/`、`hooks/`をplugin root規約に従って発見させる (`skills/` は達成済・残りは未着手)。
- `claude --plugin-dir`でlocal smokeを通す。
- **実測知見 (2026-07-11)**: `claude plugin validate` は marketplace.json しか検査しない。plugin.json の妥当性は live install E2E でしか担保されない (v1.2.2 で repository field object 形式の reject を live E2E が検出した実績)。

Codex:

> ✅ **実測済 (2026-07-11・codex-cli 0.144.1 導入後・live smoke 全 PASS)**。実物 ground truth = `~/.codex/.tmp/bundled-marketplaces/openai-bundled` + `~/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime` の調査 + 本 repo での marketplace add → plugin add → discovery → remove の一連実測。当初仮説との差分を含め、以下が実形式:

- **plugin manifest = `.codex-plugin/plugin.json`** (仮説どおり実在形式)。`name / version / description / author / license / skills: "./skills/" / interface{displayName, category, capabilities, ...}` を持つ。SKILL.md の frontmatter 形式 (name + description) は Claude Code と同一のため、**skill 本体は 1 ソース (skills/) を両 manifest から共有・複製ゼロ**。
- **marketplace 定義 = `.agents/plugins/marketplace.json`** (仮説になかった実形式・`.claude-plugin/marketplace.json` とは別 schema)。`{name, interface:{displayName}, plugins:[{name, source:{source:"local", path:"./"}, policy:{installation, authentication}, category}]}`。plugin source path は marketplace root 自身 (`"./"`) を指せることを実測確認。
- **strict semver は非強制** (仮説と差分): OpenAI 公式 plugin に `26.709.11516` / `1.0.1000366` 等が実在。semver 準拠は本 repo の自主規律として維持する。
- **`validate_plugin.py` は存在しない** (仮説と差分): codex npm package 内に validator script は無く、検証は CLI (Rust バイナリ) 内部。構造 validation の実測手段 = `codex plugin marketplace add` → `codex plugin add` の live smoke。
- **cachebuster の実態** (仮説の「helper script」は不存在): install cache は version-keyed dir (`~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/` へ copy)。local iteration の反映 = version bump か remove → add 再実行。marketplace 手編集は不要 (config.toml には `[marketplaces.*]` / `[plugins."<name>@<marketplace>"]` の登録 entry のみ書かれる)。
- personal local marketplace (`codex plugin marketplace add <local path>`) は開発用として成立を実測。owner/repo (GitHub) 形式の add は CLI が受け付ける記載だが**未実測**。

live smoke 実測ログ (2026-07-11・要点):

```text
$ codex plugin marketplace add ~/.claude/skills/shirokuma-dev-os
Added marketplace `shirokuma-dev-os-marketplace` from /Users/tsujitakayuki/.claude/skills/shirokuma-dev-os.
$ codex plugin add shirokuma-dev-os@shirokuma-dev-os-marketplace
Added plugin `shirokuma-dev-os` from marketplace `shirokuma-dev-os-marketplace`.
Installed plugin root: ~/.codex/plugins/cache/shirokuma-dev-os-marketplace/shirokuma-dev-os/1.4.0
$ codex exec "List the names of skills you have available"   # → 抜粋
shirokuma-dev-os:doc-constitution / engineering-doctrine / engineering-doctrine-universal
/ guardrails / session-operations / staff-officer   # = 6 skill runtime discovery 実証
$ codex plugin remove ... && codex plugin marketplace remove ...
→ config.toml は backup と diff 完全一致で復元・codex doctor 悪化なし
```

License:

- ~~public alpha前に選定する~~ → **選定済: MIT** (上流 v1.2.2 時点で LICENSE 実在・2026-07-11 実測)。
- Windshieldの商用境界とは別判断にする。

---

## 5. skillの改善仕様

### W1. engineering-doctrine

残す:

- 境界線思考
- 逃げ検知
- 実測検証
- 根本原因

改善:

- descriptionから過剰な常時発火を除き、設計判断、debug、review、権限・境界変更を主要triggerにする。
- 単純な質問、文章修正、機械的renameでは暗黙発火しないnegative conditionをevalで固定する。
- 「手を止める」を「原操作を止め、scope内の正しい経路へ変える」と定義する。
- 根本原因修正にuser scope / authority / budget制約を追加する。
- 実測できない時は推測でclosureせず、unknownと次の観測方法を返す。

完了条件:

- positive / negative / overlap evalでprecision、recallが基準を満たす。
- scope外修正を正当化する出力が0件。
- evidence無しの「PASS」「完了」を出さない。

### W2. staff-officer

残す:

- 5層×4ライン
- dependency-awareな逐次 / 並列判断
- implementerとreviewerの分離
- L0だけが価値衝突を裁く責任分離

改善:

- 「参謀は絶対コードを書かない」をcapability-aware routingへ変更する。
- multi-agent利用可能かつ有効な時だけWorkerを起動する。
- single-agent環境では、実装passと独立review passを分離する。
- 小タスクはmain agentが直接実装し、riskに応じてreviewを追加する。
- worker数をファイル数ではなく、独立性、競合範囲、risk、検証単位で決める。
- review NGを全体停止ではなくrework laneへ戻す。
- worker handoffにobjective、scope、read set、write set、完了条件、evidenceを必須化する。
- background taskのpermission failureは、待機ではなく別経路または明示deferredへ送る。

routing目標:

| 条件 | 動作 |
|---|---|
| 質問・相談 | staff-officer不発火 |
| 低risk・1ファイル・機械変更 | main agentが直接実装 |
| 2〜5ファイル・1責務 | main implementation + independent review |
| 独立laneが2以上 | 並列Worker |
| 共有ファイル競合あり | 逐次化またはownership分割 |
| 価値衝突・authority不足 | L0へ限定escalation |

### W3. doc-constitution

残す:

- 1事実=1正典
- 鮮度>完全性
- Tier
- 上流還流

改善:

- universal principleとproject factの正典を分離する。
- live reality / codeをtemplateより上位に置く。
- doc変更だけ先行して未実装機能を「実装済み」にしない。
- 同じ変更でcodeとdocを更新する対象を、仕様・契約・導入手順に限定する。
- plan / current spec / archiveを明確に分ける。
- broken link、stale date、重複正典、未解決placeholderを機械検査する。

完了条件:

- source-of-truth precedenceが全templateで一致する。
- 同一事実の重複検査がCIにある。
- current specとplanが混ざらない。

### W4. guardrails

**status (2026-07-11)**: 上流へ port 完了 (6567a82)。以下の改善 (特に universal / stack 分離) は依然有効な TODO。

残す:

- 1失敗クラス=1番人
- crying wolf回避
- warning / blockの精度差
- failure catalogへの還流
- 実データでの検出器調整

改善:

- universal ruleとstack固有checkを分離する (guardrails scripts に TS/Next/Supabase 固有が混在したまま = 2026-07-11 実測)。
- `assets/packs/`から選択・コピーするdeterministic installerを作る。
- checkごとに`id / scope / severity / evidence / remediation / limitations`を持たせる。
- grep、AST、live audit、E2Eの適用範囲をmetadataで明示する。
- local warning / CI block / runtime observeを同じseverity語で混同しない。
- CI blockはpromotionを止めるが、修正Work Orderはrework laneへ継続させる。
- false-positive fixtureとfalse-negative fixtureを各番人に用意する。
- stack不一致のcheckを自動導入しない。

pack境界:

| Pack | 内容 |
|---|---|
| universal | secret scanning、forbidden bypass、evidence、release readiness |
| typescript | `any` ratchet、`@ts-ignore`、tsc/lint/build |
| nextjs | route契約、`maxDuration`、production build |
| supabase-postgres | RLS、tenant境界、privileged key |

### W5. session-operations (2026-07-11 追加)

上流 v1.2.2 で既に正典入り。本文は現状維持とし、§7.2 trigger eval の対象に含める (マルチセッション文脈でのみ発火・単一セッション作業での false activation を negative example で固定)。

### W6. engineering-doctrine-universal (2026-07-11 追加)

配布版 (第2層) として上流 v1.2.2 で既に正典入り。本文は現状維持とし、§7.2 trigger eval の対象に含める。audit-self-integrity の doctrine-layers 検査 (固有名漏れなし) が既に CI で回っている。engineering-doctrine との overlap eval (どちらが発火すべきか) を §7.2 の overlap ケースへ追加する。

---

## 6. 実行可能pluginへの昇格

### W7. deterministic CLI

`scripts/init.mjs` — **実在 (v1.2.2)**。以下は強化 TODO:

- project stackを観測する。
- userに選択させる前に推奨packと根拠を表示する。
- 既存`CLAUDE.md / AGENTS.md / INVARIANTS.md`を破壊せずmerge / backupする。
- `{{ }}` placeholderが残った状態を完了扱いしない。
- dry-runとdiff previewを持つ。
- rollback receiptを残す。

`scripts/doctor.mjs` — **未実装 (audit-self-integrity.mjs が部分代替・2026-07-11 実測)**:

- plugin discovery
- skill discovery
- manifest consistency
- hook / agent availability
- broken links
- unresolved placeholders
- selected packとdetected stackの整合
- script runtime dependency
- last eval / version

`scripts/audit-self-integrity.mjs` — **実在・CI (self-integrity.yml) で恒常実行・全 PASS (2026-07-11 実測)**。カバー済: skill frontmatter / name-folder 一致 / references 存在 / doctrine-layers 固有名漏れ。未カバー (TODO):

- duplicate canon
- platform固有語彙のcore漏れ (doctrine-layers 以外)
- README主張と実在assetの一致
- manifest version drift
- release artifact contents

### W8. agents / commands / hooks — **未着手 (2026-07-11 実測)**

Agents:

- `orchestrator`: 分解、ownership、依存、統合だけを担当。
- `reviewer`: diffを修正せず、evidence付き指摘だけを返す。
- `invariant-gatekeeper`: 既知INVARIANTS違反だけを判断し、価値衝突はL0へ上げる。

Commands:

- `dev-os init`
- `dev-os doctor`
- `dev-os audit`
- `dev-os explain <decision>`（どの規律が発火したかを説明）

Hooks:

- 初期releaseでは観測と通知を中心にする。
- 高precisionな禁止パターンだけblock候補にする。
- platform coverageを明記する。
- hook非対応platformで「強制」と表現しない。
- hook failureで開発全体を無言停止させない。

---

## 7. Eval計画

### 7.1 構造validation

必須:

- 各skillへ`quick_validate.py` (未・audit-self-integrity.mjs が frontmatter 検査を部分代替)
- ~~Codex pluginへ`validate_plugin.py`~~ → **✅ 裁定 (2026-07-11 実測・codex-cli 0.144.1)**: `validate_plugin.py` という validator は存在しない (仮説棄却)。検証は CLI 内部で行われ、構造 validation の実測手段 = `codex plugin marketplace add` → `codex plugin add` live smoke (両方 PASS 済 = §4.2)
- Claude Codeへ`claude --plugin-dir <path>` smoke
- **注 (2026-07-11 実測)**: `claude plugin validate` は marketplace.json しか検査しない。構造 validation の最終防衛線は live install E2E とする (v1.2.2 で実証済)
- shellへ`bash -n`
- Nodeへ`node --check`
- JSON / YAML parse
- broken link検査
- unresolved `{{ }}` / `[TODO]`検査
- manifest version / metadata drift検査
- release archive contents検査

### 7.2 Trigger eval

最低80ケースを作る。**現状 0 件 (2026-07-11 実測) = 本計画の最優先 TODO**。

| 種別 | 最低件数 | 例 |
|---|---:|---|
| 各skill positive | 48 | 設計判断、multi-file実装、doc正典更新、CI番人追加、マルチセッション引き継ぎ |
| 全skill negative | 20 | 雑談、単純質問、翻訳、機械的な軽微修正 |
| overlap / conflict | 12 | CI doc更新、multi-agent debug、scope外発見、doctrine⇄doctrine-universal の層選択 |

目標:

- 各skill precision >= 0.90
- 各skill recall >= 0.90
- negative false activation <= 0.05
- staff-officerの小タスク過剰orchestration <= 0.05
- 同一promptで不要な3 skill以上の同時発火 = 0

descriptionだけで判定されることを前提に、trigger情報をbodyへ逃がさない。

### 7.3 Behavior eval

検査する行動:

- 北極星とscopeを最初に明示する。
- scope外発見を無断修正しない。
- evidence無しに完了宣言しない。
- live factとtemplateが衝突したらliveを採用する。
- independent laneだけ並列化する。
- review NGを正しいWorker / rework laneへ戻す。
- universal coreへstack固有ルールを混ぜない。
- failure classをcatalog / guardianへ還流する。
- blockがWork Order全体の無期限停止にならない。

### 7.4 Forward test

- fresh agent / fresh threadで行う。
- test対象skillと自然なuser requestだけを渡す。
- 期待回答、既知bug、修正方針を渡さない。
- raw output、diff、log、receiptを保存する。
- Claude CodeとCodexの両方で同じtask setを実行する (Codex 側は CLI 導入 + install/discovery 実測済 2026-07-11。task set 実走は未 = ここが残作業)。
- platform差は隠さずcompatibility matrixへ残す。

### 7.5 Dogfood matrix

最低3種:

1. 既存のTypeScript / Next.js / Supabase大規模project
2. TypeScript以外のproject（Python等）
3. 小規模repoまたは単一package

確認するもの:

- install時間
- 初回task成功
- false activation
- 不要なsubagent / token overhead
- 実際に検出したfailure class
- 導入後に防げた再発
- uninstall / rollback

---

## 8. 配布・更新・互換

### 8.1 Version (2026-07-11 再マップ)

初版の 0.1.0〜1.0.0 マップは、上流が既に 1.2.2 (live E2E PASS 済)〜1.3.0 (guardrails port) である事実と矛盾するため、1.3.x 以降の semver へ再マップする。

- `1.3.0`: guardrails port 済 (**達成 2026-07-11・6567a82**)
- `1.3.x`: marketplace.json / GOVERNANCE への guardrails 反映 + guardrails 込み live install E2E
- `1.4.0`: **Codex dual manifest + marketplace/install/discovery/remove live smoke (達成 2026-07-11・codex-cli 0.144.1)** — 当初 1.7.x 予定の cross-platform 梱包部分を前倒し。Codex 同一 task set 実走と dogfood は 1.7.x に残置
- `1.4.x`〜`1.5.x`: 6 skill trigger / behavior eval 整備 + description 絞り込み (§7.2/7.3)
- `1.5.x`〜`1.6.x`: agents / commands / doctor.mjs (§6 W7/W8) / universal core / stack pack 分離 (§5 W4)
- `1.7.x`: cross-platform 残件 (Codex 同一 task set 実走) + dogfood 3種 = public alpha 相当
- `2.0.0`: 外部利用証拠と互換方針を満たしたstable (初版 1.0.0 gate 相当)

version番号はgate達成を表し、cache更新目的で乱用しない。~~Codex local iterationのcachebuster運用は ⚠ CLI 導入後に実測してから定める。~~ → **実測済 (2026-07-11)**: Codex install cache は version-keyed dir のため、local iteration の反映は version bump または `codex plugin remove` → `add` 再実行 (helper script 不要 = §4.2)。

### 8.2 Legacy migration

- 上流は既に `skills/` 正式配置済 (v1.2.2 実測)。migration 対象は **SaaS hub 内 snapshot** (`shirokuma_SaaS/skills/shirokuma-dev-os/` = stale・README に stale banner 付与済 2026-07-11) と、`~/.claude/skills/` 等への旧 manual-copy。
- migration前に既存installをbackupする。
- 旧copyを検出し、version / hash /変更有無を表示する (baseline = `docs/baseline-2026-07-11.md` が snapshot 側 hash の固定点)。
- user変更済みcopyを無断上書きしない。
- ~~READMEから実在しない`.skill` installer記述を先に削除する~~ → **完了 (2026-07-11・SaaS 側 README を上流 `/plugin install` 導線へ書き換え)**。
- 実際にarchive生成・smokeが通ったreleaseだけinstallerを案内する。

### 8.3 Distribution

開発中:

- Claude Code: `--plugin-dir` または `claude plugin marketplace add` (後者は live E2E PASS 済・CHANGELOG [1.2.2])
- Codex: `codex plugin marketplace add <local path>` → `codex plugin add shirokuma-dev-os@shirokuma-dev-os-marketplace` (**✅ live smoke PASS 2026-07-11・codex-cli 0.144.1** = §4.2)

team trial:

- repo/team marketplace
- commit SHA pin
- install / update / rollback runbook

public alpha:

- Claude plugin marketplace申請または公開marketplace
- Codex向け公開plugin source — dual manifest は成立済 (2026-07-11)。owner/repo (GitHub) 形式の `codex plugin marketplace add` は CLI が受け付ける記載だが未実測 (public alpha 前に実測する)
- release archive、checksum、SBOM相当の内容一覧
- support範囲とknown limitations

---

## 9. PhaseとGate

### Phase 0 — Truth & Freeze — ✅ **達成 (2026-07-11)**

作業:

- 現状baselineを固定する → **達成**: `docs/baseline-2026-07-11.md` (snapshot 33 file md5)。
- READMEの非実在installer主張を削除候補にする → **達成**: SaaS 側 README 修正済 (2026-07-11)。
- 新skill / 新pack追加をfreezeする (guardrails port は「新規追加」でなく snapshot からの正典移設)。
- 6 skillの利用例・非利用例を収集する → eval 素材として継続。
- 現在のmanual installを再現する → `/plugin install` live E2E で上位互換達成 (CHANGELOG [1.2.2])。

Gate:

- 現在できること / できないことが1枚で一致 → 本 file §1.2 が該当。
- current filesのbackup / hashがある → baseline file。
- migration対象が確定している → §8.2。

### Phase 1 — Canonical Layout & Packaging — **大半達成 (v1.2.2〜1.3.0 実測)**

作業:

- `skills/`へ再配置する → **達成** (v1.2.2 で 5 skill・1.3.0 で guardrails 追加 = 6 skill)。
- dual manifestを作る → Claude 側**達成**・Codex 側**達成 (2026-07-11・`.codex-plugin/plugin.json` + `.agents/plugins/marketplace.json`・skill 本体 1 ソース共有 = §4.2)**。
- version、license、plugin root READMEを整える → **達成** (v1.3.0 / MIT / README)。
- manifest validatorとlink validatorをCIへ入れる → self-integrity.yml 実在・link validator は未。
- Claude / Codex local install smokeを作る → Claude 側 live E2E PASS 済・Codex 側 **live smoke PASS (2026-07-11: marketplace add → plugin add → 6 skill discovery → remove → config.toml 復元 diff 一致 → doctor 悪化なし)**。

Gate (条件分岐へ改訂 2026-07-11):

- ~~Claude CodeとCodexが同じ4 skillを発見する~~ → **Claude Code 側: 6 skill discovery を実測する** (5 skill 時点の E2E は PASS 済・guardrails 込み再実測が残)。**Codex 側: 6 skill runtime discovery 実測済 (2026-07-11・`codex exec` の skill 一覧に `shirokuma-dev-os:*` 6 本露出 = §4.2)。同一 task set の behavior 実走は残 (§7.4)**。
- install / list / invoke / uninstall / reinstallが通る (Claude 側: install/invoke PASS 済・uninstall/reinstall 実測が残。**Codex 側: install / list / uninstall PASS 済 2026-07-11・invoke = discovery まで実測・behavior 実走は残**)。
- plugin validator全緑 → `claude plugin validate` PASS 済 (ただし marketplace.json のみ検査 = §7.1 注意)。
- source duplication 0 → 上流内は 0。SaaS hub snapshot は stale と明示済 (正典は上流)。

### Phase 2 — Doctrine Precision

作業:

- §3の正典優先順位を全skill / templateへ反映する。
- trigger descriptionを絞る。
- staff-officerをcapability-awareにする。
- stop / block / reworkの対象を精密化する。
- trigger / behavior evalを作る。

Gate:

- trigger KPI達成。
- scope外無断変更 0。
- 小タスク過剰orchestration基準達成。
- live factよりtemplateを優先するケース 0。

### Phase 3 — Executable Operations

作業:

- init / doctor / audit-selfを実装する (init / audit-self は実在・doctor が残)。
- orchestrator / reviewer / gatekeeper agentを実装する。
- platform adapterを分離する。
- receipt / decision explanationを追加する。

Gate:

- 説明だけでなく、agent dispatch、review、doctorの実行証拠がある。
- single-agent fallbackが通る。
- reviewerが自己修正せず指摘だけ返す。
- unsupported capabilityを正直に表示する。

### Phase 4 — Universal Core & Packs

作業:

- stack固有scriptをpackへ移す。
- stack detectorとpack selectorを実装する。
- 各checkへmetadataとfixtureを付ける。
- non-TypeScript projectでcoreを試す。

Gate:

- universal coreにNext/Supabase固有前提 0。
- stack不一致checkの自動導入 0。
- 各番人にpositive / negative fixtureがある。

### Phase 5 — Public Alpha Readiness

作業:

- 3種projectでdogfoodする。
- release artifactを作る。
- install / update / rollback docを実測する。
- known limitationsとcompatibility matrixを公開可能にする。
- marketplace導線を閉じる。

Gate:

- 構造validation全緑。
- trigger / behavior KPI達成。
- dogfood 3種完了。
- P0/P1未解決 0。
- installから最初の成功taskまで10分以内。
- clean uninstallとrollbackが通る。

### Phase 6 — External Pilot & Stable Gate

作業:

- 外部3〜5projectへ導入する。
- false activation、継続利用、導入離脱理由を測る。
- failure catalogへの実還流事例を作る。
- compatibilityとversioning policyを固定する。

Stable (2.0.0) Gate:

- 外部利用者が再現できるinstall path。
- 2以上の異なるstackで継続利用。
- pluginを外した時に失われる具体的価値が説明できる。
- 少なくとも3件の「失敗→番人→再発防止」証拠。
- 破壊的変更のmigration policy。
- support / security / license境界が明確。

---

## 10. 削除・凍結リスト

Public Alphaまで追加しない:

- 新しい思想skill
- 大量の専門agent
- hosted dashboard
- MCP server
- billing / license enforcement
- Windshield runtimeの埋め込み
- 認証制度
- stack packの無制限追加

削除または置換する:

- ~~実在しない`.skill` installer記述~~ → **完了 (2026-07-11・SaaS 側 README 修正)**
- 「常に上流が正」という無限定表現
- 「参謀は絶対コードを書かない」というcapability非依存表現
- ファイル数だけでmulti-agent規模を決める規則
- stack固有ruleをuniversalと呼ぶ表現
- evidence無しのPASS
- current behaviorとfuture planの混在

---

## 11. リスクと対策

| リスク | 対策 |
|---|---|
| 思想が増え続けcontextを圧迫 | SKILL本文をcore workflowへ限定し、詳細をreferencesへ送る |
| 6 skillが同時発火 | overlap eval、trigger priority、negative examples |
| staff-officerが全taskを重くする | risk / independence / capability routing |
| multi-platformで語彙がdrift | canonical skills + thin adapters + manifest consistency CI |
| universalを名乗りstack依存 | core / pack分離、non-TS dogfood |
| 番人の誤検知で無視される | warning/block分離、positive/negative fixture、実データ調整 |
| root cause名目のscope creep | explicit scope precedence、out-of-scope record |
| templateがlive realityを上書き | source-of-truth precedence test |
| plugin更新でuser改変を破壊 | backup、hash比較、migration preview、無断上書き禁止 |
| 説明pluginのまま実行されない | init / doctor / agents / hooks / receiptsをrelease gate化 |
| **計画書自身が stale 化** (本改訂の教訓) | baseline を対象 repo 側で実測・正典は上流 docs/ 1 箇所・snapshot に stale banner |

---

## 12. 完遂記録 (2026-07-11)

初版 §12「最初に切る実装単位 = dev-os canonical plugin scaffold」は、上流正典側で v1.2.2 までに大半が達成済だったことが実測で判明した。実施済と次の縦切りを記録する。

### 実施済 (実測根拠付き)

| 項目 | 証拠 |
|---|---|
| baseline hash 固定 | `docs/baseline-2026-07-11.md` (snapshot 33 file md5・SaaS HEAD 4a614f9 / 上流 HEAD e7747ca) |
| `skills/` 正式配置 (6 skill) | v1.2.2 で 5 skill・guardrails port (6567a82) で 6 skill (`ls skills/` 実測) |
| guardrails port | branch feat/guardrails-port・26 file・md5 24/26 一致・DIFF 2 は staff-mode→staff-officer 参照追従 各 1 行 |
| manifest + CHANGELOG | `.claude-plugin/plugin.json` v1.3.0 + marketplace.json + CHANGELOG [1.3.0] |
| validator PASS | `claude plugin validate` PASS + `audit-self-integrity.mjs` 全項目 PASS (2026-07-11 実測) |
| Claude live install E2E | v1.2.2 で `claude plugin marketplace add` + `/plugin install` PASS (CHANGELOG [1.2.2]) |
| README installer 記述修正 | SaaS 側 README から非実在 `.skill` installer 記述を削除し stale banner + 上流導線へ書き換え (2026-07-11) |

### 次の縦切り

1. **marketplace.json・GOVERNANCE への guardrails 反映 + live install E2E** — marketplace.json description に guardrails 未言及・GOVERNANCE の 2 層継承分類に guardrails 未記載 (2026-07-11 実測)。反映後、guardrails 込み 6 skill の `/plugin install` → discovery → invoke を live で再実測 (= §9 Phase 1 gate の Claude 側条件クローズ)。
2. **trigger eval 整備 (§7.2)** — 現状 0 件。6 skill × positive / negative / overlap の最低 80 ケースを作り、precision / recall KPI を初計測する (= Phase 2 の入口)。

非scope (変わらず):

- skill本文の思想変更
- agent実装 (§6 W8)
- stack pack分離 (§5 W4)
- marketplace公開
- Codex 側の同一 task set behavior 実走 (§7.4) — 梱包 + install/discovery smoke は 2026-07-11 達成済のため blocked 解除、実走のみ 1.7.x へ

---

## 13. 最終完了条件

shirokuma-dev-os改善完了は、ファイルを増やしたことではなく、以下を満たした状態とする。

1. Claude Code / Codexの両方で正式pluginとして導入できる。
2. 6 skillが必要な時だけ発火する。
3. 小タスクを不必要にmulti-agent化しない。
4. project事実をuniversal templateで上書きしない。
5. scope外発見を無断修正しない。
6. universal coreがstackに依存しない。
7. stack packがdeterministicに導入・削除できる。
8. reviewer / gatekeeper / doctorが説明ではなく実行される。
9. failure classがguardianへ還流した実証がある。
10. install、update、uninstall、rollbackが実測済み。
11. pluginを外した時に失われる価値を外部利用者が説明できる。

> **完成形: コードを書く方法を増やすpluginではなく、AI開発組織が判断を曲げず、失敗から強くなるためのoperating doctrine。**
