#!/usr/bin/env node
// ① 依頼の受け口 ＋ ② 常時 doctrine
// UserPromptSubmit で発火。依頼を検査し、工程の判断基準を注入する。
// 依存: node 標準ライブラリのみ。ネットワークなし。書き込みなし（読むだけ）。
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { out({}); }

const prompt = String(input.prompt ?? '');
const cwd = input.cwd || process.cwd();

// 無効化スイッチ（ユーザーがいつでも止められる）
if (process.env.SHIROKUMA_DEVOS === 'off') out({});

// ⑥' 判断回収の文脈保存: セッション最初の依頼の要旨を残す。
// stop.mjs の harvest が DECISIONS.md のセッション見出しに使う。
// 実運用フィードバック（2026-07-21）: 文脈のない candidate は裁定不能（何の作業の判断か分からない）。
// 同じ .task の有無が「セッション最初の依頼か」の判定にもなる（下の注入量の切替で使う）。
let firstTurn = true;
let turn = 0;
try {
  const sid = String(input.session_id || '').slice(0, 8);
  if (sid && prompt.trim()) {
    const dir = join(cwd, '.claude/.devos');
    const tf = join(dir, `${sid}.task`);
    if (existsSync(tf)) {
      firstTurn = false;
    } else {
      mkdirSync(dir, { recursive: true });
      writeFileSync(tf, prompt.replace(/\s+/g, ' ').trim().slice(0, 120));
    }
    const cf = join(dir, `${sid}.turns`);
    try { turn = Number(readFileSync(cf, 'utf8')) || 0; } catch {}
    turn += 1;
    writeFileSync(cf, String(turn));
  }
} catch {}

// ── 注入量の切替（2026-10-06 しろくま決定「やりましょう」）─────────
// 実測: 全文 7,624 字（≒5,900 token）を毎プロンプト注入していた。
// 長い常駐セッションでは他セッションからの連絡・タスク完了通知も 1 プロンプトとして数えられ、
// 同じ全文が履歴に数百回積まれる（1 セッションで 3,888 回）。
// 規律は「最初の依頼で読ませる」ことで効く（宣言は最初の応答の冒頭で求めている）ので、
// 全文は最初の依頼だけ。以後の人間の依頼には要点だけを付け、機械が送った連絡には何も付けない。
// 文脈の圧縮で全文が消えるので、REFRESH 回ごとに全文を出し直す。
const REFRESH = 25;
const MACHINE = [
  '<cross-session-message', '<task-notification', '<ci-monitor-event',
  'Another Claude session sent a message',
];
const fromMachine = MACHINE.some((m) => prompt.includes(m));
const full = firstTurn || turn % REFRESH === 1;

const parts = [];

// ── ② 常時 doctrine（2,000字）──────────────────────
// 実測: Haiku 圧力条件の逸脱率 6/6 → 0/6、+3.1% token
const core = join(ROOT, 'doctrine/core-2000.md');

// ── ① 圧力語彙の検出 ─────────────────────────────
// 実測: 汚染の入口は既存コードでも AI の自発でもなく「依頼の圧力」だった
const PRESSURE = [
  'とりあえず', '雑で', '後で直', 'あとで直', '急ぎ', '急いで', '一旦', '仮で',
  '動けばいい', '動けば良い', '簡単でいい', 'ざっくり', '最低限でいい', '詳細はまた',
];
const hit = fromMachine ? [] : PRESSURE.filter((w) => prompt.includes(w));

// 機械が送った連絡（最初の依頼を除く）には何も付けない
if (!full && fromMachine) out({});

// doctrine は全文の回と、圧力語が出た回だけ（効果の実測は圧力条件下）
if ((full || hit.length) && existsSync(core)) parts.push(readFileSync(core, 'utf8'));

if (hit.length) {
  parts.push(
    `## 受け口の検査\n\n`
    + `依頼に速度優先の指示が含まれています（検出: ${hit.join('、')}）。\n`
    + `実装の順序と範囲は依頼に合わせて構いませんが、**完了条件は変わりません**。\n`
    + `- 型・テスト・検査が通らない場合は「通らなかった」と報告する\n`
    + `- 機能を削って検査を通すのは、通したことにならない\n`
    + `- 後で直す前提の妥協を入れた場合は、何をどこに残したかを明示する\n`,
  );
}

// ── ③ 境界マップの提示 ───────────────────────────
// 実測: 発火条件を「内省」から「分類」へ移すと 0/3 → 3/3 で止まる
for (const name of ['BOUNDARIES.md', 'docs/BOUNDARIES.md', '.claude/BOUNDARIES.md']) {
  const p = join(cwd, name);
  if (!existsSync(p)) continue;
  if (!full) {
    // 2 回目以降の依頼: 宣言と停止条件だけ。本文は最初の依頼で読ませ済み
    parts.push(
      `## 境界線マップ（${name}）\n\n`
      + `作業の範囲が変わったら、3 行の宣言（属する境界 / 可否の記載 / 判断）を出し直す。\n`
      + `境界に関わるのにマップに可否が無ければ、着手せず停止して確認する（型や既存コードから推定しない）。\n`
      + `本文が要るときは ${name} を読む。`,
    );
    break;
  }
  // 文言強化（2026-07-21 E2' 実測）: 旧文言では昇格が Sonnet 1/6・Haiku 0/6。
  // 非昇格 run は全て「マップを読み・境界を認識し・型定義から可否を推定して」進んだ。
  // 効く要素は実測済みの 3 つ — 宣言の出力要求（照合 Anchor: 誤成功 4/11 → 0/11）・
  // 停止の明示的許可（承認の正体 = 断る許可）・観測された失敗経路（技術形からの推定）の名指し禁止。
  parts.push(
    `## 境界線マップ（${name}）— 作業前の必須工程\n\n`
    + `**最初の応答の冒頭で、次の 3 行を必ず宣言してから作業に入ること:**\n`
    + `- 属する境界: （マップの境界名。属さないなら「なし」）\n`
    + `- 可否の記載: あり ／ なし\n`
    + `- 判断: 進む ／ 停止して確認\n\n`
    + `**停止条件（最優先）**: 作業が境界に関わるのに、マップに可否が書かれていないなら、\n`
    + `**実装に着手せず停止し**、何が書かれていないかと選択肢を示して事業責任者の判断を仰ぐ。\n`
    + `型定義・既存コード・引数の形から可否を**推定してはならない**。\n`
    + `技術的に導けるように見える解釈は、事業判断の代わりにならない（実測: この推定は系統的に誤る）。\n`
    + `停止は失敗ではない。依頼を保留する許可は、この指示によって既に与えられている。\n\n`
    + readFileSync(p, 'utf8')
    + `\n\nどの境界にも属さない作業なら、宣言のうえそのまま進めてよい。確認は不要。\n`,
  );
  break;
}

// ── ⑤' 裁定済みの手順書（PLAYBOOK.md）────────────────
// 自己改善の裁定ゲート: AI が残した手順候補のうち、人間が adopted にしたものだけを注入する。
// candidate は権限を持たない（裁定なしの学習は誤りを先例化する・実測 9-5）。
if (full) try {
  const pb = join(cwd, 'PLAYBOOK.md');
  if (existsSync(pb)) {
    const lines = readFileSync(pb, 'utf8').split('\n');
    const adopted = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^- (.+)$/);
      if (m && lines.slice(i + 1, i + 3).some((l) => /status:\s*adopted/.test(l))) adopted.push(m[1]);
    }
    if (adopted.length) {
      parts.push(
        `## 裁定済みの手順書（PLAYBOOK.md）\n\n`
        + adopted.map((p) => `- ${p}`).join('\n')
        + `\n\n該当する作業では、この手順に従うこと。`,
      );
    }
  }
} catch {}

// ── ⑥ 回収のための報告形式 ────────────────────────
// 実測: 素材（判断の言語化）は強いモデルなら 9/9 出るが、弱いモデルは省略する。
//       出ないものは回収できないので、形式を要求して素材を揃える。
// 順序と開示頻度は実運用フィードバック（2026-07-21）: 大事な結果が末尾の定型に埋もれない順に。
if (full) parts.push(
  `## 完了報告の形式\n\n`
  + `**書く順序**（この順を守る。大事なものを定型で埋もれさせない）:\n\n`
  + `1. **結果** — 何がどうなったか。冒頭に置く\n`
  + `2. **判断が要った点**（依頼文からは一意に決まらず、こちらで決めたこと。無ければ「なし」）\n`
  + `   - 決めたこと / 選ばなかった案 / そう決めた理由\n`
  + `   - 思いつかない場合も「依頼文に書かれていないのに、自分が決めた振る舞いは本当に無いか？」を自問してから「なし」と書く\n`
  + `   - **行頭に ★ を付けるのは「今後すべての作業に効く普遍ルール」だけ**（事業判断・境界・恒久方針）。\n`
  + `     その作業限りの実装細部（命名・慣習合わせ・手順の選択）には付けない = 記録のみで人に聞かない。\n`
  + `     迷ったら付けない。人の時間を使う価値があるものだけに ★ を使う\n`
  + `   - ★ **を付けない物**（2026-09-23 実測: 溜まっていた候補 8 件を読み直したら全件がこれ）:\n`
  + `     ①観察・計測結果（「今月 3 日目の欠測」「遅延を織り込むと 26h 窓が要る」）= 判断ではない\n`
  + `     ②自分が前に書いた数字・事実の訂正 = 判断ではない（訂正は報告に書いて終わり）\n`
  + `     ③既存の決定・正典から導けた処理（「指示文と正典がズレたので正典を採った」等）\n`
  + `     ④その作業限りの粒度・分割の選択（「13 件を 4 つに割らず 1 件に束ねた」等）\n`
  + `     ⑤再利用できる手順 → 「再利用できそうな手順」節へ回す（判断ではない）\n`
  + `     ★ が付いた行だけが人の画面に出る。**★ を 1 つ付けるたびに人の時間を 1 回使う**\n`
  + `3. **再利用できそうな手順**（そのまま使い回せる具体的手順が生まれた場合のみ 1〜3 行。無ければ見出しごと省略）\n`
  + `4. **締めは次のアクション / 待ち事項** — 読み手が次に何をすればいいかで終える。判断が要った点を最後に置かない\n\n`
  + `未検証の開示: 検査で確かめていない事は、読み手に分かる言い方で 1 文書く（例: 「実行はしていません」「試験は流していません」「（未検証）」）。\n`
  + `**定型文を毎回貼らない。**言い方は自由で、事実（何をして何をしていないか）が伝われば足りる。\n`,
);

// ── ⑧ 裁定待ちの可視化 ─────────────────────────
// 実運用フィードバック（2026-07-21）: 「いつ裁定が来るのか分からない」。
// 裁定は「溜まったら来る」ではなく「呼んだら来る」。溜まっても壊れないが、見えるようにする。
if (full) try {
  const countC = (f) => {
    // 行頭の実エントリだけ数える（ヘッダ説明文の `status: candidate` を誤カウントしない）
    try { return (readFileSync(join(cwd, f), 'utf8').match(/^\s+- status:\s*candidate/gm) || []).length; }
    catch { return 0; }
  };
  const dn = countC('DECISIONS.md');
  const pn = countC('PLAYBOOK.md');
  if (dn + pn > 0) {
    // 文言は実運用フィードバック（2026-07-21）: 「裁定」は非エンジニアに難しい・
    // 「急ぎません」は後回しの未来を見せる。見せるべきは「1 回答えれば以後ずっと効く」というベネフィット。
    parts.push(
      `## 決めてほしいこと（溜まっている数: ${dn + pn} 件 = 判断 ${dn}・手順 ${pn}）\n\n`
      + `★ **この件数を報告に書かない**（2026-09-23 しろくま決定）。毎回の定型は催促になり、\n`
      + `  大事な結果を埋もれさせる。自分から持ち出さない・進捗として数えない。\n`
      + `人間が「決める」「決めます」「やる」（または「裁定して」）と宣言した時にだけ、1 件ずつ三択で出す。\n`
      + `トリガーは人間の一人称宣言。「決めて」という依頼形は決定の AI への移譲に読めるため使わない。\n`
      + `★ **三択を出す前に、溜まっている中身を実際に読む**（2026-09-23 実測: 読まずに原因を想像して\n`
      + `  三択にしたら、読んだ瞬間に選択肢そのものが変わった）。読める人が他に居るなら内訳を頼む。\n`
      + `  自分の担当分が 0 件なら「0 件です」と返して止まるのも正解（三択を添える義務はない）。\n`
      + `  出した問いが実測で消えたら、取り下げをその人に伝える（放置は考える時間を使わせる）。`,
    );
  }
} catch {}

if (!parts.length) out({});
out({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: parts.join('\n---\n\n'),
  },
});
