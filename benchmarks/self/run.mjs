#!/usr/bin/env node
// 自己検査 — API 課金なし・数秒で終わる。
// フック自身が正しく動くかを、正常例と違反例で確認する。
// これが赤いとき、フックは誰かの手元で誤検知している。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { negative, positive } from './claim-integrity.fixtures.mjs';
import { harvestCases } from './harvest.fixtures.mjs';

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

rmSync(stateHome, { recursive: true, force: true });
console.log(`自己検査: ${pass}/${pass + fail} 合格`);
if (bad.length) { console.log('\n' + bad.join('\n')); process.exit(1); }
console.log('  正常例を止めない / 違反例を見逃さない / 判断だけを回収する、を確認しました。');
