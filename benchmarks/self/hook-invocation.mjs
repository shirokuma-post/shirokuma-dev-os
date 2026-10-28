#!/usr/bin/env node
// フックが「起動できるか」の検査。中身の正しさではなく、呼び出しが成立するかを見る。
// 実測の反省: パスに空白があると settings のコマンド文字列が壊れ、
// エラーも出さずにフックが無効化された。**静かに死ぬ**のが最悪。
import { execSync } from 'node:child_process';
import { mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const input = JSON.stringify({ session_id: 'inv', cwd: '/tmp', last_assistant_message: '完了しました。すべて通りました。' });

const cases = [];
// 空白を含むパスへプラグインを丸ごと複製して起動する
const base = mkdtempSync(join(tmpdir(), 'devos with space-'));
cpSync(join(ROOT, 'hooks'), join(base, 'hooks'), { recursive: true });
cpSync(join(ROOT, 'doctrine'), join(base, 'doctrine'), { recursive: true });

for (const [name, root] of [['通常のパス', ROOT], ['空白を含むパス', base]]) {
  for (const hook of ['intake.mjs', 'stop.mjs']) {
    const cmd = `node "${join(root, 'hooks', hook)}"`;
    let ok = false, detail = '';
    try {
      const out = execSync(cmd, { input, stdio: 'pipe', timeout: 30000 }).toString();
      JSON.parse(out || '{}');   // JSON を返せば起動成功
      ok = true;
    } catch (e) { detail = String(e.stderr || e.message).split('\n')[0].slice(0, 80); }
    cases.push({ name: `${name} / ${hook}`, ok, detail });
  }
}
rmSync(base, { recursive: true, force: true });

const bad = cases.filter((c) => !c.ok);
console.log(`フック起動検査: ${cases.length - bad.length}/${cases.length} 合格`);
for (const b of bad) console.log(`  [起動失敗] ${b.name}\n    → ${b.detail}`);
if (bad.length) process.exit(1);
console.log('  空白を含むパスでも起動できることを確認しました。');
