#!/usr/bin/env node
/**
 * shirokuma-dev-os init CLI
 *
 * 新規プロジェクトに templates/ を展開する。
 * {{YYYY-MM-DD}} → 今日の日付 / {{プロジェクト名}} → --name 引数 で置換。
 * 他の {{...}} placeholder はそのまま残す (= ユーザーが手で埋める)。
 *
 * Usage:
 *   node scripts/init.mjs <target-dir> --name=<project-name> [--force]
 *
 * Example:
 *   node scripts/init.mjs ~/projects/my-saas --name=my-saas
 *
 * Exit code:
 *   0 = 成功
 *   1 = 引数エラー or 既存ファイル衝突 (--force なし)
 *   2 = 実行時エラー
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TEMPLATES_DIR = path.join(ROOT, 'templates');

const TEMPLATE_MAP = [
  { src: 'CLAUDE.template.md', dst: 'CLAUDE.md' },
  { src: 'INVARIANTS.template.md', dst: 'INVARIANTS.md' },
  { src: 'DOC_CONSTITUTION.template.md', dst: 'DOC_CONSTITUTION.md' },
];

function parseArgs(argv) {
  const args = { _: [], name: null, force: false, help: false };
  for (const a of argv.slice(2)) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--force' || a === '-f') args.force = true;
    else if (a.startsWith('--name=')) args.name = a.slice('--name='.length);
    else if (!a.startsWith('--')) args._.push(a);
  }
  return args;
}

function printHelp() {
  console.log(`
shirokuma-dev-os init — 新規プロジェクトに開発 OS を展開

Usage:
  node scripts/init.mjs <target-dir> --name=<project-name> [--force]

Options:
  <target-dir>       展開先ディレクトリ (絶対 path or 相対 path)
  --name=<name>      プロジェクト名 (= CLAUDE.md 等の {{プロジェクト名}} 置換)
  --force, -f        既存ファイルを上書き (デフォルトは skip)
  --help, -h         このヘルプ

Example:
  node scripts/init.mjs ~/projects/my-saas --name=my-saas
  node scripts/init.mjs . --name=my-app --force

展開ファイル:
  - CLAUDE.md         (= プロジェクト最上位ガイド)
  - INVARIANTS.md     (= 不変ルール)
  - DOC_CONSTITUTION.md (= 文書運用憲法)

展開後の手順:
  1. 各ファイル内の残 {{...}} placeholder をプロジェクト固有値で埋める
  2. プラグイン shirokuma-dev-os を Claude Code から有効化
  3. プロジェクト独自スキルが必要なら .claude/skills/ に追加
`);
}

function todayDateString() {
  // 注: Date 引数なしで使うことで、システム時刻に依存させない (= テスト時は --date オプション等で上書き可能にする想定だが現状は now)
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function processTemplate(srcPath, dstPath, replacements, force) {
  if ((await exists(dstPath)) && !force) {
    console.log(`  ⏭️  ${path.basename(dstPath)} 既存 — skip (--force で上書き可)`);
    return { skipped: true };
  }
  const raw = await fs.readFile(srcPath, 'utf8');
  let content = raw;
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  await fs.writeFile(dstPath, content);
  // 残 placeholder を数える
  const remaining = [...content.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
  const uniqRemaining = [...new Set(remaining)];
  console.log(
    `  ✅ ${path.basename(dstPath)} 作成 (残 placeholder: ${uniqRemaining.length} 種${uniqRemaining.length > 0 ? ` = ${uniqRemaining.slice(0, 3).join(', ')}${uniqRemaining.length > 3 ? '...' : ''}` : ''})`,
  );
  return { skipped: false, remaining: uniqRemaining };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args._.length !== 1) {
    console.error('❌ <target-dir> を 1 つ指定してください。');
    printHelp();
    process.exit(1);
  }
  if (!args.name) {
    console.error('❌ --name=<project-name> が必要です。');
    printHelp();
    process.exit(1);
  }

  const targetDir = path.resolve(args._[0]);

  if (!(await exists(targetDir))) {
    console.error(`❌ 展開先 ${targetDir} が存在しません。先に mkdir してください。`);
    process.exit(1);
  }

  const replacements = {
    YYYY: todayDateString(),
    'YYYY-MM-DD': todayDateString(),
    プロジェクト名: args.name,
    'project-name': args.name,
  };

  console.log(`\n🚀 shirokuma-dev-os init: ${args.name}`);
  console.log(`📁 展開先: ${targetDir}`);
  console.log(`📅 今日の日付: ${replacements['YYYY-MM-DD']}\n`);

  const allRemaining = new Set();
  let skippedCount = 0;
  let createdCount = 0;

  for (const { src, dst } of TEMPLATE_MAP) {
    const srcPath = path.join(TEMPLATES_DIR, src);
    const dstPath = path.join(targetDir, dst);
    if (!(await exists(srcPath))) {
      console.error(`❌ template ${srcPath} が不在`);
      process.exit(2);
    }
    const r = await processTemplate(srcPath, dstPath, replacements, args.force);
    if (r.skipped) skippedCount++;
    else {
      createdCount++;
      r.remaining.forEach((p) => allRemaining.add(p));
    }
  }

  console.log(`\n📊 結果: 作成 ${createdCount} / skip ${skippedCount}`);

  if (allRemaining.size > 0) {
    console.log(`\n📝 次の手順:`);
    console.log(`   各ファイル内の残 {{...}} placeholder を埋めてください:`);
    [...allRemaining].slice(0, 10).forEach((p) => console.log(`     - {{${p}}}`));
    if (allRemaining.size > 10) {
      console.log(`     ... 他 ${allRemaining.size - 10} 種`);
    }
  }

  console.log(`\n📚 関連スキル (= Claude Code 経由で発動):`);
  console.log(`   - engineering-doctrine          (= 思考様式 6 規律)`);
  console.log(`   - engineering-doctrine-universal (= 配布版・汎用 6 規律)`);
  console.log(`   - doc-constitution               (= 文書運用憲法)`);
  console.log(`   - staff-officer                  (= 参謀フロー 5 層 × 4 ライン)`);
  console.log(`   - session-operations             (= マルチセッション運用の型)`);

  console.log(`\n🎉 完了\n`);
}

main().catch((e) => {
  console.error('init 実行中エラー:', e);
  process.exit(2);
});
