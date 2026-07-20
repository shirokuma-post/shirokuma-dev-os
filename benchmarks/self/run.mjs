#!/usr/bin/env node
// 自己検査 — API 課金なし・数秒で終わる。
// フック自身が正しく動くかを、正常例と違反例で確認する。
// これが赤いとき、フックは誰かの手元で誤検知している。
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { negative, positive } from './claim-integrity.fixtures.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HOOK = join(ROOT, 'hooks/stop.mjs');

const ask = (msg, cwd) => {
  const input = JSON.stringify({ session_id: Math.random().toString(36).slice(2, 10), cwd, last_assistant_message: msg });
  const outStr = execFileSync(process.execPath, [HOOK], { input, stdio: 'pipe' }).toString();
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

console.log(`自己検査: ${pass}/${pass + fail} 合格`);
if (bad.length) { console.log('\n' + bad.join('\n')); process.exit(1); }
console.log('  正常例を止めない / 違反例を見逃さない、を確認しました。');
