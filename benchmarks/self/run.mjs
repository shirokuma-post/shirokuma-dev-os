#!/usr/bin/env node
// 自己検査 — API 課金なし・数秒で終わる。
// フック自身が正しく動くかを、正常例と違反例で確認する。
// これが赤いとき、フックは誰かの手元で誤検知している。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { negative, positive } from './claim-integrity.fixtures.mjs';
import { harvestCases } from './harvest.fixtures.mjs';
import { worktreeChecks } from './worktree-record.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = join(ROOT, 'hooks/stop.mjs');

// 利用者単位の印（disclosure-asked）を本物の home に書かないよう、自己検査専用の置き場に差し替える。
const stateHome = mkdtempSync(join(tmpdir(), 'devos-self-state-'));
const ask = (msg, cwd, home = stateHome) => {
  const input = JSON.stringify({ session_id: Math.random().toString(36).slice(2, 10), cwd, last_assistant_message: msg });
  const outStr = execFileSync(process.execPath, [HOOK], { input, stdio: 'pipe', env: { ...process.env, DEVOS_STATE_HOME: home } }).toString();
  try { return JSON.parse(outStr); } catch { return {}; }
};

const tmp = mkdtempSync(join(tmpdir(), 'devos-self-'));
let pass = 0, fail = 0;
const bad = [];

for (const c of negative) {
  const r = ask(c.msg, tmp);
  if (r.decision === 'block') { fail++; bad.push(`[誤検知] 正常例を止めた: ${c.name}\n  → ${String(r.reason).split('\n')[0]}`); }
  else pass++;
}
for (const c of positive) {
  const r = ask(c.msg, tmp);
  if (r.decision !== 'block') { fail++; bad.push(`[見逃し] 違反例を通した: ${c.name}`); }
  else pass++;
}
rmSync(tmp, { recursive: true, force: true });

// 開示の差し戻しは利用者ごとに 1 回だけ。新しいディレクトリでも 2 回目は止めない（2026-10-20 実測: 作業のたびに
// 新しいディレクトリを作る使い方で毎回差し戻していた）。
{
  const home = mkdtempSync(join(tmpdir(), 'devos-self-once-'));
  const d1 = mkdtempSync(join(tmpdir(), 'devos-self-d1-'));
  const d2 = mkdtempSync(join(tmpdir(), 'devos-self-d2-'));
  const undisclosed = '修正しました。npm run typecheck: 通過。';
  const first = ask(undisclosed, d1, home);
  const second = ask(undisclosed, d2, home);
  if (first.decision === 'block' && second.decision !== 'block') pass++;
  else { fail++; bad.push(`[回数] 開示の差し戻しが利用者ごと 1 回になっていない: 1 回目=${first.decision ?? 'なし'} 2 回目=${second.decision ?? 'なし'}`); }
  for (const t of [home, d1, d2]) rmSync(t, { recursive: true, force: true });
}

// 判断回収（DECISIONS.md）— 判断の行は回収し、報告の締めや定型文は混入させない。
for (const c of harvestCases) {
  const t = mkdtempSync(join(tmpdir(), 'devos-self-harvest-'));
  ask(c.msg, t);
  const dec = join(t, 'DECISIONS.md');
  // ヘッダーの説明文（status: candidate 等の語を含む）は判定対象外。回収された本文だけを見る。
  const raw = existsSync(dec) ? readFileSync(dec, 'utf8') : '';
  const i = raw.indexOf('\n## ');
  const body = i >= 0 ? raw.slice(i) : '';
  const missed = c.mustInclude.filter((s) => !body.includes(s));
  const leaked = c.mustExclude.filter((s) => body.includes(s));
  if (missed.length || leaked.length) {
    fail++;
    if (missed.length) bad.push(`[回収漏れ] 判断の行が DECISIONS.md に無い: ${c.name}\n  → ${missed.join(' / ')}`);
    if (leaked.length) bad.push(`[誤回収] 判断でない行が DECISIONS.md に混入: ${c.name}\n  → ${leaked.join(' / ')}`);
  } else pass++;
  rmSync(t, { recursive: true, force: true });
}

// ── intake: 境界の節の出し分けと、癖の設定 (2026-10-20) ──
{
  const INTAKE = join(ROOT, 'hooks/intake.mjs');
  const ctx = (cwd, sid, prompt) => {
    const o = execFileSync(process.execPath, [INTAKE], { input: JSON.stringify({ cwd, session_id: sid, prompt }), stdio: 'pipe' }).toString();
    try { return JSON.parse(o).hookSpecificOutput?.additionalContext ?? ''; } catch { return ''; }
  };
  const d = mkdtempSync(join(tmpdir(), 'devos-self-intake-'));
  writeFileSync(join(d, 'BOUNDARIES.md'), '# 境界\n\n## いつも\n常に全文の節。FULLBODY_A\n\n## メール\n<!-- devos: topics=メール,Resend -->\n送信の既定の要点。\n詳細 MAILDETAIL\n');
  writeFileSync(join(d, 'DECISIONS.md'), '- x\n  - status: candidate\n');
  const check = (name, ok) => { if (ok) pass++; else { fail++; bad.push(`[intake] ${name}`); } };
  let c = ctx(d, 'i1', 'テストを足して');
  check('印の無い節は全文', c.includes('FULLBODY_A'));
  check('話題外の印付きの節は要点だけ', c.includes('送信の既定の要点。') && !c.includes('MAILDETAIL'));
  check('既定は ★ の基準と「決めてほしいこと」を付ける', c.includes('を付けない物') && c.includes('決めてほしいこと'));
  c = ctx(d, 'i2', 'Resend の鍵を替えたい');
  check('話題の語が出たら印付きの節も全文', c.includes('MAILDETAIL'));
  c = ctx(d, 'i2', 'メールの文面を直す');
  check('全文の回でなくても、話題の節は付ける', c.includes('MAILDETAIL') && !c.includes('FULLBODY_A'));
  mkdirSync(join(d, '.claude'), { recursive: true });
  writeFileSync(join(d, '.claude/devos.json'), JSON.stringify({ profile: 'light' }));
  c = ctx(d, 'i3', 'テストを足して');
  check('light は ★ の基準と「決めてほしいこと」を付けない', !c.includes('を付けない物') && !c.includes('決めてほしいこと') && c.includes('結果を冒頭に置く'));
  const longReport = 'ヘッダーの表示崩れを修正しました。原因は flex コンテナの折返し指定漏れで、wrap を指定して 3 つの画面幅で表示を確認しています。あわせて同じ指定漏れがフッターにもあったため、そちらも同様に修正しました。影響範囲はこの 2 箇所のみで、他のレイアウトには手を入れていません。残作業はありません。実行はしていません。';
  check('light は判断欄の差し戻しをしない', ask(longReport, d).decision !== 'block');
  rmSync(d, { recursive: true, force: true });
}

// ── 記録の置き場所: git worktree で動いた時は repo の本体の checkout へ (2026-10-28) ──
{
  const r = await worktreeChecks(ROOT);
  pass += r.pass; fail += r.fail; bad.push(...r.bad);
}

rmSync(stateHome, { recursive: true, force: true });
console.log(`自己検査: ${pass}/${pass + fail} 合格`);
if (bad.length) { console.log('\n' + bad.join('\n')); process.exit(1); }
console.log('  正常例を止めない / 違反例を見逃さない / 判断だけを回収する / worktree の記録を本体へ寄せる、を確認しました。');
