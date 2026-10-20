#!/usr/bin/env node
// 攻め役への依頼文を、固定の雛形 (attack-prompt.txt) から作って渡す。
// 依頼文を審判役の AI が毎回書かないため (書く途中で止められても、人がこのコマンドを打てば進める)。
//
//   node run-attacker.mjs <RUN> <関門の形>           Codex CLI で攻め役を起動する
//   node run-attacker.mjs <RUN> <関門の形> --print   依頼文を表示するだけ (他の AI に渡す時)
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function buildPrompt(template, run, gate) {
  const out = template.replaceAll('{{RUN}}', run).replaceAll('{{GATE}}', gate);
  const left = out.match(/\{\{[A-Z]+\}\}/);
  if (left) throw new Error(`雛形に埋まっていない欄があります: ${left[0]}`);
  return out.trimEnd();
}

function main(args) {
  const print = args.includes('--print');
  const rest = args.filter((a) => a !== '--print');
  if (rest.length !== 2 || rest.some((a) => a.startsWith('--'))) {
    throw new Error('使い方: node run-attacker.mjs <RUN> <関門の形> [--print]');
  }
  const run = path.resolve(rest[0]);
  const gate = rest[1].trim();
  if (!gate) throw new Error('関門の形が空です');
  if (!existsSync(path.join(run, 'in', 'promises.md'))) throw new Error(`${run}/in/promises.md がありません`);
  if (!existsSync(path.join(run, 'out')) || !statSync(path.join(run, 'out')).isDirectory()) throw new Error(`${run}/out/ がありません`);

  const template = readFileSync(fileURLToPath(new URL('./attack-prompt.txt', import.meta.url)), 'utf8');
  const prompt = buildPrompt(template, run, gate);
  if (print) {
    process.stdout.write(prompt + '\n');
    return 0;
  }
  // 標準入力は閉じて渡す (開いたままだと Codex が追加の入力を待って止まる)
  const r = spawnSync('codex', ['exec', '-C', run, '-s', 'workspace-write', '--skip-git-repo-check', '-o', path.join(run, 'out', 'last.md'), prompt], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
