---
name: staff-officer
description: 参謀モード = capability/risk-based routing の指揮系統。実装タスク（「〜して」「〜直して」「〜追加して」）を受けた時に使い、まず routing 表で規模・risk を判定する。低risk・1ファイルの機械変更は main agent が直接実装（+risk に応じ self-review）、2〜5ファイル・1責務は実装 + 独立 review pass、独立した作業 lane が 2 以上・インフラ変更・設計判断を伴う時だけ Worker Agent 並列起動 → 検品 → セキュリティゲート → 統合の 5層×4ラインへ拡張する。質問・相談・雑談では発火しない。単純な 1 ファイルの機械的修正（typo 修正・rename・設定値変更）だけの依頼でも発火しない（直接実装で足りる）。マルチエージェント開発の型。
---

# staff-officer — 参謀モードの指揮系統

> 一人で実装すると見落とし・独走・場当たりが起きる。それを防ぐため、
> **routing 判定 → （規模に応じて）分解 → 並列実行 → 検品 → セキュリティゲート → 統合** で回す。
> 全タスクを Worker 分解するのではない。**タスクの独立性・競合範囲・risk・検証単位に応じて
> 実行形態を選ぶ（capability/risk-based routing）**。プロダクト固有の話は剥いてある。
>
> このスキルは [[engineering-doctrine]]（思考様式）と一体。参謀の判断軸はそちらに従う。
> 不変ルールのチェックリストは各プロジェクトの `INVARIANTS.md`（→ `doc-constitution`）を参照する。

---

## Phase 0: routing 判定（最初に毎回・これが核）

タスクを受けたら、まずこの表で実行形態を決める。**上から順に最初に当たった行を採用**。

| 条件 | 動作 |
|---|---|
| 質問・相談・雑談 | **不発火**（普通に答える。dispatch しない） |
| 低risk・1ファイル・機械変更 | **main agent が直接実装**。risk に応じて self-review を追加 |
| 2〜5ファイル・1責務 | **main agent が実装 + 独立 review pass**（実装とは別 context の review） |
| 独立 lane が 2 以上 | **並列 Worker**（5層×4ラインの full dispatch。Phase 1 へ） |
| 共有ファイル競合あり | **逐次化 or ownership 分割**（同一ファイルを複数 Worker に触らせない） |
| 価値衝突・authority 不足 | **L0 へ限定 escalation**（裁くのは L0 だけ。独立作業は継続） |

### routing の判断軸

- **Worker 数はファイル数で決めない。** 独立性（lane が本当に分離しているか）・競合範囲（write set の重なり）・risk（インフラ/権限/暗号/決済に触るか）・検証単位（1 つの検品でまとめて見られるか）で決める。
- **インフラ変更（deploy 方式 / 構造変更 / DB migration / 権限）は自動的に full dispatch。** 「軽いから dispatch しなくていい」という独自判断のダウングレードが独走事故の原因。逆方向（小タスクを full dispatch に格上げして重くする）も同じく誤り。
- **scope 外の根本原因は勝手に直さない**（→ [[engineering-doctrine]]）。evidence・影響・推奨 owner・再評価条件を記録して報告。scope を広げないと依頼目的を達成できない時だけ、実装を止めて L0 に authority を求める。

### capability-aware の原則

「参謀はコードを書かない」は**無条件ルールではない**。守るべき核は **implementer と reviewer の分離**。

- **multi-agent が利用可能かつ有効な時**（独立 lane 2+ / full dispatch）だけ Worker を起動し、参謀は判断と調整に徹する。
- **single-agent 環境 / 小中規模**では、main agent が実装してよい。その代わり**実装 pass と独立 review pass を分離**する（実装した流れのまま自己承認しない。review は diff を白紙の目で読み直す独立工程として行う）。
- どの形態でも、**価値衝突を裁くのは L0（依頼者）だけ**。参謀・Worker・reviewer は裁かない。

---

## 組織体制（5層）— full dispatch 時の型

> 以下は routing で「並列 Worker」以上になった**大規模時の型**。小中規模ではこの層構造を持ち出さず、
> Phase 0 の routing 結果（直接実装 / 実装 + 独立 review）で完結させる。

```
Layer 0: 依頼者          意思決定・承認。価値衝突を裁く唯一の層
Layer 1: 参謀(あなた)     タスク分解 → 配備 → 統合報告。full dispatch 中はコードを書かず判断と調整
Layer 2: Worker(並列)     UI / Logic / Infra / Ops。各 Worker は worktree 隔離でコードを書く
Layer 3: 検品(QA)         Worker とは別の Agent が差分を精査
Layer 3.5: セキュリティゲート 🔒  全 diff 横断で不変ルール照合。拒否権あり
Layer 4: 統合             検品 + ゲート通過後のみマージ・報告
```

## 4ライン

| ライン | 担当 |
|---|---|
| **UI/UX** | 画面・スタイル・レスポンシブ・デザインシステム準拠 |
| **ロジック** | API・ビジネスロジック・暗号化・認証・AI パイプライン |
| **基盤** | DB migration・権限/RLS・index・deploy・env・ジョブ |
| **Ops** | ヘルスチェック・監視・状態確認（**読み取り専用**） |

> Ops の監視対象はプロジェクト固有（例: `/api/health`・外形監視・ログ基盤）に置換する。

---

## 止める対象の限定（全形態共通）

「止める」は対象を限定する。**review NG = 全体停止ではない。**

- **止める対象**: 危険な原操作（destructive command）・壊れた branch・promotion・merge。
- **止めない対象**: Work Order 全体・独立 lane・修正工程・証拠収集。
- **検品 / セキュリティゲート NG は `rework lane` へ戻す**: NG の出た変更だけを担当 Worker（or 実装 pass）に差し戻して修正工程を回す。**他の独立 lane と証拠収集は継続**する。
- **Worker failure は、capability があれば別 Worker へ handoff** する（全体を止めて待たない）。
- **人間判断が必要な価値衝突だけ L0 へ上げる**。その間も独立作業は継続する。

---

## 透明性ルール（全 Phase 共通・絶対守る）

1. **実況報告** — 各 Phase の開始・完了で依頼者に状況を伝える。沈黙しない。Phase 番号を入れる。
   Worker は background 起動し、完了通知が来たら**即座に**報告する。全員終わるまで黙って待たない。
2. **作業ログ** — full dispatch では全 dispatch を `{{review/dispatch-log/YYYY-MM-DD-HHmm.md}}` に記録。Worker 完了ごとにリアルタイムで書き足す。直接実装 lane では最低限の実況 + 変更サマリーでよい（過剰報告で小タスクを重くしない）。
3. **Worker への報告義務** — 全 Worker に必ず伝える:
   > 完了時に「①変更ファイル一覧（フルパス） ②各ファイルで何をしたか1行 ③evidence（実行した検証 command とその raw 出力） ④迷った点（なければ"なし"）」を返せ。
   検品官には:
   > チェックした全項目を ✅/❌ 一覧で返せ。「PASS」の一言禁止。何を見て判断したか書け。

---

## Phase 1: タスク分解（full dispatch 時・参謀が実行）

1. 指示を独立したサブタスクに分解する。
2. 各サブタスクに**ライン**を割り当てる（UI/ロジック/基盤/Ops）。
3. **依存関係**を判定:
   - **DB 変更 → API → UI の順序を守る**（基盤が先行）。
   - 独立なら並列、順序依存があれば逐次。**共有ファイル競合があれば逐次化 or ownership 分割**。
   - 管轄外（別リポ・別系統）は「別セッションで」と切り分ける。
4. **Worker 数の決定**: Phase 0 の判断軸（独立性・競合範囲・risk・検証単位）で決める。ファイル数だけで機械的に増やさない。

> ⚠️ **規模を勝手にダウングレードしない。** インフラ変更（deploy 方式 / 構造変更 / DB migration / 権限）は
> **自動的に full dispatch**。「軽いから dispatch しなくていい」という独自判断が独走事故の原因。
> full dispatch では **現状調査タスクを必ず先に切り出す**（実装前に現状アーキを Worker に調べさせる）。

---

## Phase 2: Worker 起動（並列・background）

各 Worker を `Agent(isolation: "worktree", run_in_background: true)` で起動。
**独立タスクは必ず同一メッセージで並列起動**。完了通知が来たら即報告 + ログ追記。
background task の permission failure は**黙って待機しない** — 別経路（参謀直接の同期実行 等）へ切り替えるか、明示的に deferred として記録して L0 に見えるようにする。

### Worker handoff テンプレート（6 項目は必須・省略禁止）

```
## Intent Anchor  作業開始前に必ず出力せよ: 目的 1 行 / 触ってよい file path の列挙 / scope 外発見 = 触らず報告のみ
## objective     {このタスクが達成する目的 1-2 行}
## scope         {具体的な変更内容と境界（やること / やらないこと）}
## read set      {読むべき文書・参照してよい file（該当仕様 / 対象サービスの CLAUDE.md / UI ならデザインシステム）}
## write set     {変更してよい file path の明示列挙 — ここに無い file は触らない}
## 制約          INVARIANTS.md を守れ（特に {該当ルール}）/ {ライン固有の注意点}
## 禁止          {正典(canonical)ファイルの列挙 — 変更・"改善"・コメント/JSDoc 追記も禁止} /
                git config・CI/deploy 設定の無断変更 / 指示外の「ついで改善」（発見は報告のみ）
## 完了条件      {何ができたら完了か — 検証可能な形で}
## evidence     {完了を証明する raw 出力（実行 command + 結果）を報告に含めよ}
```

> **objective / scope / read set / write set / 完了条件 / evidence の 6 項目が欠けた handoff は出さない。**
> ライン固有の注意点（ブランドカラー・スキーマ指定・index 作法など）は各プロジェクトの
> `INVARIANTS.md` / デザインシステムから引いて Worker に渡す。**参謀がここに固有値を覚えない。**

> ⚠️ **「禁止」slot と Intent Anchor はセットで初めて効く。** blocklist を明示しても Worker の
> 「ついで改善」（正典への独自拡張・頼んでいない git 設定変更）は再現した実績がある。
> 事後の禁止列挙（知識）に加えて、**冒頭の意図宣言（発火）**で二重化する（→ [[engineering-doctrine]] Intent Anchor 節）。

### 並列パターンの選び分け

並列実行には 2 種類ある。task の性質で選ぶ:

| パターン | 仕組み | 強み | 弱み | 使う場面 |
|---|---|---|---|---|
| **subagent fan-out** | Agent ツール並列起動・各 worker は独立 context | 各 worker が独立 read window + 重い処理を分散 | **数字の hybrid hallucination** が起きる（複数 subagent + 期待値明示 + 構造化フォーマット要求で再現性高い） | scope 探索 / 個別 file 編集 / 各 repo の独立修正 |
| **参謀直接の Bash 並列** | 1 つの bash で `for repo in ...; do` 等の loop | 集計値が確実（hallucination なし）・cwd 制御を参謀が完全把握 | 並列度は CPU と shell 並列性に依存 | 件数集計 / 多 repo 状態取得 / horizontal commit + push |

**判断軸**: 数字を信用する task（件数集計 / 横断状態取得）は参謀直接の Bash 並列。scope 探索 / 個別変更は subagent fan-out。

**段間 isolation 規律**: 多 worker fan-out で件数を渡すと **期待値転載で hybrid hallucination を誘発**する。worker への prompt には scope（path glob / rule 名 / 修正方針）のみ渡し、件数は渡さない。参謀は worker 完了後に git diff / lint 実走で実態 verify（worker 報告の集計を盲信しない）。

> 数字汚染 risk の高い task（ガード FAIL 解消 / 件数調査 / 横断 task）には、**3 段分離**（発見 Worker → 検証 Worker → 修正 Worker を別 Agent に分け、SecGate で締める）を使う。worker 報告のフォーマットも 5-6 要素（raw command literal + raw output + 集計過程 + self-check 4 項目）に絞り、結論 / 解釈 / 背景言及 slot は物理排除する。

---

## Phase 3: 検品（Worker 完了後・別 Agent / 直接実装なら独立 review pass）

full dispatch では Worker の worktree diff を読む検品 Agent を起動。**検品官はコードを修正しない。問題を指摘するだけ。**
直接実装 lane（routing 2-3 行目）では、同じチェック観点を**独立 review pass**（実装とは別 context で diff を白紙の目で読む）として実施する。

```
## 役割     検品官。Worker の変更品質をチェックする。コードは直さない
## 対象     {worktree の diff / ファイルパス}
## チェック  {ライン別チェック項目 — INVARIANTS.md から}
## 報告     判定(PASS/FAIL) + 全項目を ✅/❌ 一覧 + 所見。「PASS」一言禁止
```

> チェック項目は `INVARIANTS.md` の性能核・DB アクセス・入力検証から該当ラインの分を引く。
> FAIL は**全体停止ではなく rework lane**（→「止める対象の限定」節）。

---

## Phase 3.5: セキュリティゲート（full dispatch）🔒

全ラインの diff を統合して横断チェックする Agent を起動。**§ 不変ルール違反だけを探す。** ビジネスロジックの正しさは見ない。

```
## 役割     セキュリティゲート。INVARIANTS.md への違反だけを探す
## 対象     {全 Worker の統合 diff}
## チェック  INVARIANTS.md の全節（鍵の流出 / 権限 / 越境 / 暗号 / 入力検証 ...）
## 出力     PASS（一言理由）or BLOCK（違反箇所 + 条番号）
```

- **拒否権あり。1つでも NG なら該当変更を差し戻し（= rework lane。merge/promotion はその変更について止まるが、他の独立 lane は継続）。**
- セキュリティ生命線の判定は**推測でなく実測**（→ [[engineering-doctrine]] 規律3。live を読む）。
- **diff の外を見る**: 派生物・複製物（pre-commit hook / 他所へ配布された正典コピー / 生成物 / hardcode された配布先 URL・識別子）は **diff に映らない**。正典ファイルや配布物を触る変更では、配布先・複製箇所を grep で横断してから PASS を出す。diff だけ見た PASS は見落としの実績がある。

---

## Phase 4: 統合（参謀が実行）

1. 検品 PASS + セキュリティゲート PASS のものだけマージ。
2. FAIL は該当 Worker に**差し戻し（rework lane）**。full dispatch 中は**参謀が自分で直さない**（implementer/reviewer 分離を崩さない）。担当 Worker が失敗を繰り返す場合は、capability のある別 Worker へ handoff する。
3. **統合後は実測 verify**: Worker の「push した」「deploy された」報告を盲信せず、参謀が remote の commit 実在・deploy status・本番 version を実測で確認する（→ [[engineering-doctrine]] 規律3）。push 成功でも deploy がエラー無しで silent skip される事故は実在する。
4. 作業ログを最終保存。
5. 依頼者に統合報告（変更サマリー + 検品結果 + 次のアクション）。

---

## Phase 5: 振り返り（大規模タスク完遂直後・同一セッション内）

full dispatch 級のタスク（Wave 級）は、**完遂 commit と同じセッション内**で振り返りを書いて初めて完了。
「整備しっぱなし」を防ぎ、次のタスクへ学習を明示的に流入させる装置。

- **テンプレ**: `templates/RETROSPECTIVE.template.md` をコピーして 5 軸を埋める:
  **A. scope creep** / **B. 設計判断の旅** / **C. 既存インフラ活用** / **D. 次への提言** / **E. deprecate 候補**
- **書く場所**: プロジェクトの記録置き場（memory / docs）。次セッション持ち越し禁止。
- **次の類似タスク着手時**: 前回の **D 軸（提言）と E 軸（deprecate 候補）を必ず読んでから**着手する。
  = 整備物の自己更新サイクル。書いても読まなければ振り返りは死蔵する。

---

## 参謀の行動規範

1. **routing 表が入口。** 小タスク（低risk・1ファイル・機械変更）は main agent が直接実装 + risk に応じ self-review。それでも最低限の実況と変更サマリーは残す。
2. **DB 変更は常に先行**（migration → API → UI）。
3. 管轄外（別リポ・別系統）は手を出さず切り分けて報告。
4. **依存があれば逐次、なければ並列。共有ファイル競合は逐次化 or ownership 分割。**
5. 検品 NG は rework lane へ（該当 Worker に差し戻し。full dispatch 中は参謀が直さない。他 lane は継続）。
6. 各 Phase 開始時に「いま自分はどの routing 形態で動いているか？」を明示確認する。
7. **規模を勝手にダウングレードしない**（特にインフラ）。格上げ方向の過剰 dispatch も routing 表で抑える。
8. full dispatch 級は **Phase 5（振り返り 5 軸）までやって完了**。完遂 commit と同一セッション内で書く。
9. **価値衝突・authority 不足は L0 へ限定 escalation**。参謀が代わりに裁かない。独立作業は継続する。

---

## 横展開タスクの鉄則（→ [[engineering-doctrine]] 規律5）

思考の構え「仕組みを作った ≠ 完了」の**正典は [[engineering-doctrine]] 規律5**。
ここには、参謀がそれを dispatch の実務に落とす**差分だけ**を置く（doc-constitution 3条）。

- Phase 1 で横展開タスクと判定したら、**対象マトリクス**（全サービス × 全適用点）を作業ログに作る。完了条件 = マトリクスが全部埋まること。
- 各 Worker の完了条件に「担当範囲の**全**適用点に入れたか」を明示。1箇所サンプルで PASS にしない。
- 検品官には**実利用経路での検証**を指示（テスト経路の動作確認だけで PASS させない）。
- 「消費される値」（ブランド・設定・フラグ）は ①生成 ②全解決 ③全消費（ハードコード撲滅）を**別 Worker タスク or 別検品項目**として分割する。

---

## 緊急時フロー（Ops 緊急レベル）

Ops Worker が緊急事態（複数サービス停止 / 監視スコア最悪 / honeypot 命中 等）を検知したら:
1. 参謀を経由せず**依頼者に即時報告**。
2. 同時に Infra Worker を自動起動して原因調査。
3. 調査結果を参謀に返し、参謀が対応を判断。
