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
try {
  const sid = String(input.session_id || '').slice(0, 8);
  if (sid && prompt.trim()) {
    const tf = join(cwd, '.claude/.devos', `${sid}.task`);
    if (!existsSync(tf)) {
      mkdirSync(join(cwd, '.claude/.devos'), { recursive: true });
      writeFileSync(tf, prompt.replace(/\s+/g, ' ').trim().slice(0, 120));
    }
  }
} catch {}

const parts = [];

// ── ② 常時 doctrine（2,000字）──────────────────────
// 実測: Haiku 圧力条件の逸脱率 6/6 → 0/6、+3.1% token
const core = join(ROOT, 'doctrine/core-2000.md');
if (existsSync(core)) parts.push(readFileSync(core, 'utf8'));

// ── ① 圧力語彙の検出 ─────────────────────────────
// 実測: 汚染の入口は既存コードでも AI の自発でもなく「依頼の圧力」だった
const PRESSURE = [
  'とりあえず', '雑で', '後で直', 'あとで直', '急ぎ', '急いで', '一旦', '仮で',
  '動けばいい', '動けば良い', '簡単でいい', 'ざっくり', '最低限でいい', '詳細はまた',
];
const hit = PRESSURE.filter((w) => prompt.includes(w));
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
try {
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
parts.push(
  `## 完了報告の形式\n\n`
  + `**書く順序**（この順を守る。大事なものを定型で埋もれさせない）:\n\n`
  + `1. **結果** — 何がどうなったか。冒頭に置く\n`
  + `2. **判断が要った点**（依頼文からは一意に決まらず、こちらで決めたこと。無ければ「なし」）\n`
  + `   - 決めたこと / 選ばなかった案 / そう決めた理由\n`
  + `   - 思いつかない場合も「依頼文に書かれていないのに、自分が決めた振る舞いは本当に無いか？」を自問してから「なし」と書く\n`
  + `3. **再利用できそうな手順**（そのまま使い回せる具体的手順が生まれた場合のみ 1〜3 行。無ければ見出しごと省略）\n`
  + `4. **締めは次のアクション / 待ち事項** — 読み手が次に何をすればいいかで終える。判断が要った点を最後に置かない\n\n`
  + `未検証の開示: 同一プロジェクトの**初回だけフル文**\n`
  + `（「受け入れ条件が未定義のため、仕様を満たしているかは検証されていません」）。\n`
  + `**2 回目以降は、完了に触れる文の直後に「（未検証）」の短い印で足りる。毎回フル文を書かない。**\n`,
);

// ── ⑧ 裁定待ちの可視化 ─────────────────────────
// 実運用フィードバック（2026-07-21）: 「いつ裁定が来るのか分からない」。
// 裁定は「溜まったら来る」ではなく「呼んだら来る」。溜まっても壊れないが、見えるようにする。
try {
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
      `## 決めてほしいことの可視化\n\n`
      + `いま、あなたに決めてほしいことが ${dn + pn} 件あります（判断 ${dn}・手順 ${pn}）。\n`
      + `報告の締めに次の趣旨を 1 行で添えること（「裁定」などの用語は使わない）:\n`
      + `「決めてほしいことが ${dn + pn} 件あります。1 回答えるだけで、AI は次からずっとその通りに動きます（『決めて』でいつでも）」\n`
      + `「決めて」（または「裁定して」）と言われた時に、1 件ずつ簡単な三択で提示する。催促しない。`,
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
