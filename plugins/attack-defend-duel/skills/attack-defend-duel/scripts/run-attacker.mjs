#!/usr/bin/env node
// 攻め役への依頼文を、固定の雛形から作って渡す。
// 依頼文を審判役の AI が毎回書かないため (書く途中で止められても、人がこのコマンドを打てば進める)。
//
//   node run-attacker.mjs <RUN> <関門の形>           攻めの試験を書かせる (雛形 attack-prompt.txt)
//   node run-attacker.mjs <RUN> --retry              審判の結果を渡して、試験の誤りを直させる (雛形 attack-retry.txt)
//   どちらも --print を付けると依頼文を表示するだけ (他の AI に渡す時)
//
// 終了コード: 攻め役の終了コード。攻め役が 0 でも、$RUN/out/ の外に file を足した・変えた時は 3
// (攻め役の側の hook 等が書いた物。審判は攻め役の出力として扱わない)。使い方の誤り = 2
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function buildPrompt(template, run, gate = '') {
  const out = template.replaceAll('{{RUN}}', run).replaceAll('{{GATE}}', gate);
  const left = out.match(/\{\{[A-Z]+\}\}/);
  if (left) throw new Error(`雛形に埋まっていない欄があります: ${left[0]}`);
  return out.trimEnd();
}

// $RUN/out/ の外にある file の、path → 大きさと更新時刻
export function snapshotOutside(run) {
  const seen = new Map();
  const walk = (rel) => {
    for (const e of readdirSync(path.join(run, rel), { withFileTypes: true })) {
      const r = rel ? path.join(rel, e.name) : e.name;
      if (!rel && e.name === 'out') continue;
      if (e.isDirectory()) walk(r);
      else {
        const st = statSync(path.join(run, r));
        seen.set(r, `${st.size}:${st.mtimeMs}`);
      }
    }
  };
  walk('');
  return seen;
}

export function changedOutside(before, after) {
  return [...after].filter(([r, v]) => before.get(r) !== v).map(([r]) => r).sort();
}

function main(args) {
  const print = args.includes('--print');
  const retry = args.includes('--retry');
  const rest = args.filter((a) => a !== '--print' && a !== '--retry');
  const usage = '使い方: node run-attacker.mjs <RUN> <関門の形> [--print] / node run-attacker.mjs <RUN> --retry [--print]';
  if (rest.length !== (retry ? 1 : 2) || rest.some((a) => a.startsWith('--'))) throw new Error(usage);
  const run = path.resolve(rest[0]);
  const gate = retry ? '' : rest[1].trim();
  if (!retry && !gate) throw new Error('関門の形が空です');
  if (!existsSync(path.join(run, 'in', 'promises.md'))) throw new Error(`${run}/in/promises.md がありません`);
  if (!existsSync(path.join(run, 'out')) || !statSync(path.join(run, 'out')).isDirectory()) throw new Error(`${run}/out/ がありません`);
  if (retry && !existsSync(path.join(run, 'out', 'judge.log'))) throw new Error(`${run}/out/judge.log がありません (審判の結果を先に置く)`);

  const name = retry ? 'attack-retry.txt' : 'attack-prompt.txt';
  const template = readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), 'utf8');
  const prompt = buildPrompt(template, run, gate);
  if (print) {
    process.stdout.write(prompt + '\n');
    return 0;
  }
  const before = snapshotOutside(run);
  // 標準入力は閉じて渡す (開いたままだと Codex が追加の入力を待って止まる)
  const r = spawnSync('codex', ['exec', '-C', run, '-s', 'workspace-write', '--skip-git-repo-check', '-o', path.join(run, 'out', 'last.md'), prompt], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  if (r.error) throw r.error;
  const changed = changedOutside(before, snapshotOutside(run));
  if (changed.length) {
    console.error(`⚠ 攻め役の実行中に ${run}/out/ の外の file が増えた・変わった (攻め役の出力として扱わない):`);
    for (const c of changed) console.error(`  - ${c}`);
  }
  const status = r.status ?? 1;
  return status === 0 && changed.length ? 3 : status;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
