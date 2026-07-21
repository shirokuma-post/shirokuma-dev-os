#!/usr/bin/env node
// ① 依頼の受け口 ＋ ② 常時 doctrine
// UserPromptSubmit で発火。依頼を検査し、工程の判断基準を注入する。
// 依存: node 標準ライブラリのみ。ネットワークなし。書き込みなし（読むだけ）。
import { readFileSync, existsSync } from 'node:fs';
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

// ── ⑥ 回収のための報告形式 ────────────────────────
// 実測: 素材（判断の言語化）は強いモデルなら 9/9 出るが、弱いモデルは省略する。
//       出ないものは回収できないので、形式を要求して素材を揃える。
parts.push(
  `## 完了報告の形式\n\n`
  + `報告の最後に必ず次を付けること。無ければ「なし」と書く。\n\n`
  + `**判断が要った点**（依頼文からは一意に決まらず、こちらで決めたこと）\n`
  + `- 決めたこと / 選ばなかった案 / そう決めた理由\n\n`
  + `思いつかない場合も、次を自問してから「なし」と書くこと:\n`
  + `「依頼文に書かれていないのに、自分が決めた振る舞いは本当に無いか？」\n`,
);

if (!parts.length) out({});
out({
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: parts.join('\n---\n\n'),
  },
});
