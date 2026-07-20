#!/usr/bin/env node
/**
 * shirokuma-dev-os init CLI
 *
 * 新規プロジェクトに templates/ を展開する。
 * - {{YYYY-MM-DD}} → 今日の日付 / {{プロジェクト名}} → --name 引数 で置換
 * - 展開先の stack を観測 (package.json / supabase/ / *.config.*) して推奨 pack を根拠付きで表示
 * - INVARIANTS.md は選択 pack の invariants.fragment.md を節番号対応で自動合成
 * - 残った {{...}} placeholder は file 別に一覧表示する (= placeholder が残る限り「完了」とは言わない)
 *
 * Usage:
 *   node scripts/init.mjs <target-dir> --name=<project-name> [--preset=minimal|saas] [--packs=a,b] [--dry-run] [--force]
 *
 * Example:
 *   node scripts/init.mjs ~/projects/my-saas --name=my-saas
 *   node scripts/init.mjs ~/projects/my-cli --name=my-cli --preset=minimal
 *
 * Exit code:
 *   0 = 成功
 *   1 = 引数エラー or 既存ファイル衝突 (--force なし)
 *   2 = 実行時エラー
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const PACKS_DIR = path.join(ROOT, 'skills', 'guardrail-authoring', 'assets', 'packs');

/** pack の正準順序 (= 合成順序もこれに従う) */
const PACK_ORDER = ['universal', 'typescript', 'nextjs', 'supabase-postgres'];

/** preset 定義 */
const PRESETS = {
  minimal: ['universal'],
  saas: ['universal', 'typescript', 'nextjs', 'supabase-postgres'],
};

const TEMPLATE_MAP = [
  { src: 'CLAUDE.template.md', dst: 'CLAUDE.md' },
  { src: 'INVARIANTS.template.md', dst: 'INVARIANTS.md' },
  { src: 'DOC_CONSTITUTION.template.md', dst: 'DOC_CONSTITUTION.md' },
];

function parseArgs(argv) {
  const args = {
    _: [],
    name: null,
    force: false,
    help: false,
    preset: null,
    packs: null,
    dryRun: false,
  };
  for (const a of argv.slice(2)) {
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--force' || a === '-f') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--name=')) args.name = a.slice('--name='.length);
    else if (a.startsWith('--preset=')) args.preset = a.slice('--preset='.length);
    else if (a.startsWith('--packs='))
      args.packs = a
        .slice('--packs='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (!a.startsWith('--')) args._.push(a);
    else console.error(`⚠️  不明なオプション ${a} は無視します`);
  }
  return args;
}

function printHelp() {
  console.log(`
shirokuma-dev-os init — 新規プロジェクトに開発 OS を展開

Usage:
  node scripts/init.mjs <target-dir> --name=<project-name> [options]

Options:
  <target-dir>       展開先ディレクトリ (絶対 path or 相対 path)
  --name=<name>      プロジェクト名 (= CLAUDE.md 等の {{プロジェクト名}} 置換)
  --preset=minimal   universal pack のみ (CLI/ライブラリ向け・最小構成)
  --preset=saas      universal + typescript + nextjs + supabase-postgres 全部入り
  --packs=a,b        pack を個別指定 (universal は常に含まれる)
  (preset/packs 省略時) 展開先の stack を観測して推奨 pack を表示・採用
  --dry-run          書き込まず、生成予定 file と placeholder 残数だけ表示
  --force, -f        既存ファイルを .bak-<日時> に backup してから上書き (デフォルトは skip)
  --help, -h         このヘルプ

Example:
  node scripts/init.mjs ~/projects/my-saas --name=my-saas
  node scripts/init.mjs ~/projects/my-cli --name=my-cli --preset=minimal
  node scripts/init.mjs . --name=my-app --packs=typescript,nextjs --dry-run

展開ファイル:
  - CLAUDE.md           (= プロジェクト最上位ガイド)
  - INVARIANTS.md       (= 不変ルール。選択 pack の invariants.fragment.md を自動合成)
  - DOC_CONSTITUTION.md (= 文書運用憲法)

展開後の手順:
  1. 各ファイル内の残 {{...}} placeholder をプロジェクト固有値で埋める (これを終えて初めて完成)
  2. プラグイン shirokuma-dev-os を Claude Code から有効化
  3. プロジェクト独自スキルが必要なら .claude/skills/ に追加
`);
}

function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function backupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/* ─── pack 一覧 (実在する pack dir = pack.json を持つ dir) ─── */
async function listAvailablePacks() {
  const entries = await fs.readdir(PACKS_DIR, { withFileTypes: true });
  const packs = [];
  for (const e of entries) {
    if (e.isDirectory() && (await exists(path.join(PACKS_DIR, e.name, 'pack.json')))) {
      packs.push(e.name);
    }
  }
  return packs;
}

/* ─── stack 検出 (展開先を観測・推測しない = 観測できた根拠だけ出す) ─── */
async function detectStack(targetDir) {
  const findings = []; // { pack, reason }
  let pkg = null;
  const pkgPath = path.join(targetDir, 'package.json');
  if (await exists(pkgPath)) {
    try {
      pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
    } catch {
      console.error('⚠️  package.json が JSON parse 不能 — stack 検出から除外します');
    }
  }
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);

  if (pkg) {
    const signals = ['package.json (npm ecosystem)'];
    if (has('typescript')) signals.push('deps に typescript');
    if (has('react')) signals.push('deps に react');
    if (await exists(path.join(targetDir, 'tsconfig.json'))) signals.push('tsconfig.json');
    findings.push({ pack: 'typescript', reason: signals.join(' / ') });
  }

  const nextSignals = [];
  if (has('next')) nextSignals.push('deps に next');
  for (const c of ['next.config.js', 'next.config.mjs', 'next.config.ts']) {
    if (await exists(path.join(targetDir, c))) {
      nextSignals.push(c);
      break;
    }
  }
  if (nextSignals.length) findings.push({ pack: 'nextjs', reason: nextSignals.join(' / ') });

  const sbSignals = [];
  if (await exists(path.join(targetDir, 'supabase'))) sbSignals.push('supabase/ dir');
  if (has('@supabase/supabase-js')) sbSignals.push('deps に @supabase/supabase-js');
  if (sbSignals.length) findings.push({ pack: 'supabase-postgres', reason: sbSignals.join(' / ') });

  return findings;
}

function sortPacks(packs) {
  return [...new Set(packs)].sort((a, b) => {
    const ia = PACK_ORDER.indexOf(a);
    const ib = PACK_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

/**
 * pack 選択の解決。
 * @returns {{ packs: string[], source: 'preset'|'packs'|'detect' }}
 */
function resolvePacks(args, detected, available) {
  if (args.preset && args.packs) {
    console.error('❌ --preset と --packs は同時指定できません。どちらか片方にしてください。');
    process.exit(1);
  }
  if (args.preset) {
    if (!PRESETS[args.preset]) {
      console.error(`❌ 不明な preset "${args.preset}"。使用可能: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }
    return { packs: sortPacks(PRESETS[args.preset]), source: 'preset' };
  }
  if (args.packs) {
    for (const p of args.packs) {
      if (!available.includes(p)) {
        console.error(`❌ 不明な pack "${p}"。使用可能: ${available.join(', ')}`);
        process.exit(1);
      }
    }
    return { packs: sortPacks(['universal', ...args.packs]), source: 'packs' };
  }
  return { packs: sortPacks(['universal', ...detected.map((f) => f.pack)]), source: 'detect' };
}

/* ─── INVARIANTS 合成 (base template + pack fragment を節番号対応で merge) ─── */

/** md を「## 見出し」単位の section に分割。数字節は num を持つ */
function splitSections(md) {
  const lines = md.split('\n');
  const preamble = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const numMatch = line.match(/^## (\d+)\./);
      current = { num: numMatch ? numMatch[1] : null, heading: line, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { preamble, sections };
}

/** fragment の 1 section を base の同番号 section へ merge (表末尾に行追記 / 空節は表ごと持ち込み) */
function mergeSectionBody(baseBody, fragBody) {
  const fragTable = fragBody.filter((l) => l.startsWith('|'));
  if (fragTable.length < 3) return; // header + separator + 最低 1 行 が無ければ合成対象なし
  let lastTableIdx = -1;
  for (let i = 0; i < baseBody.length; i++) {
    if (baseBody[i].startsWith('|')) lastTableIdx = i;
  }
  if (lastTableIdx >= 0) {
    // base に既存の表がある → header/separator を落として行だけ追記
    baseBody.splice(lastTableIdx + 1, 0, ...fragTable.slice(2));
  } else {
    // base 側が空の節 (注記のみ) → 表ごと持ち込む
    while (baseBody.length > 0 && baseBody[baseBody.length - 1].trim() === '') baseBody.pop();
    baseBody.push('', ...fragTable, '');
  }
}

/**
 * base INVARIANTS template に選択 pack の invariants.fragment.md を合成する。
 * fragment を持たない pack は skip。
 * @returns {{ content: string, mergedPacks: string[] }}
 */
async function synthesizeInvariants(baseRaw, packs) {
  const base = splitSections(baseRaw);
  const mergedPacks = [];

  for (const pack of packs) {
    const fragPath = path.join(PACKS_DIR, pack, 'invariants.fragment.md');
    if (!(await exists(fragPath))) continue; // fragment 無し pack (universal 等) は skip
    const fragRaw = await fs.readFile(fragPath, 'utf8');
    const frag = splitSections(fragRaw);
    let mergedAny = false;
    for (const fs_ of frag.sections) {
      if (!fs_.num) continue;
      const target = base.sections.find((s) => s.num === fs_.num);
      if (target) {
        mergeSectionBody(target.body, fs_.body);
        mergedAny = true;
      } else {
        // 対応節が base に無い場合は末尾に節ごと追加 (欠落を黙って捨てない)
        base.sections.push({ num: fs_.num, heading: fs_.heading, body: [...fs_.body] });
        mergedAny = true;
      }
    }
    if (mergedAny) mergedPacks.push(pack);
  }

  if (mergedPacks.length > 0) {
    // 冒頭 blockquote の末尾に合成記録を 1 行追加 (どの pack が合成済かを file 自身が語る)
    let lastQuoteIdx = -1;
    for (let i = 0; i < base.preamble.length; i++) {
      if (base.preamble[i].startsWith('>')) lastQuoteIdx = i;
    }
    const note = `> **合成済 stack pack**: ${mergedPacks.join(', ')} (init CLI が invariants.fragment.md を節番号対応で自動合成済)`;
    if (lastQuoteIdx >= 0) base.preamble.splice(lastQuoteIdx + 1, 0, note);
    else base.preamble.unshift(note);
  }

  const content = [
    ...base.preamble,
    ...base.sections.flatMap((s) => [s.heading, ...s.body]),
  ].join('\n');
  return { content, mergedPacks };
}

/* ─── placeholder ─── */
function applyReplacements(raw, replacements) {
  let content = raw;
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

function remainingPlaceholders(content) {
  const remaining = [...content.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
  return [...new Set(remaining)];
}

function truncate(s, n = 48) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/* ─── main ─── */
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
    'YYYY-MM-DD': todayDateString(),
    プロジェクト名: args.name,
    'project-name': args.name,
  };

  console.log(`\n🚀 shirokuma-dev-os init: ${args.name}${args.dryRun ? ' (dry-run: 書き込みません)' : ''}`);
  console.log(`📁 展開先: ${targetDir}`);
  console.log(`📅 今日の日付: ${replacements['YYYY-MM-DD']}`);

  // ── stack 検出 + pack 解決 ──
  const available = await listAvailablePacks();
  const detected = await detectStack(targetDir);

  console.log(`\n🔍 stack 検出 (展開先を観測):`);
  if (detected.length === 0) {
    console.log(`   検出なし → universal pack のみ推奨`);
  } else {
    for (const f of detected) {
      console.log(`   - ${f.reason} → ${f.pack} pack 推奨`);
    }
  }

  const { packs, source } = resolvePacks(args, detected, available);
  const sourceLabel = { preset: `preset "${args.preset}" 指定`, packs: '--packs 指定', detect: 'stack 検出から採用' }[source];
  console.log(`\n📦 使用 pack: ${packs.join(', ')} (= ${sourceLabel})`);

  // 明示指定が検出結果を含まない場合は正直に告知 (block はしない)
  if (source !== 'detect') {
    const missing = detected.map((f) => f.pack).filter((p) => !packs.includes(p));
    if (missing.length > 0) {
      console.log(`   ⚠️  検出された ${missing.join(', ')} は選択に含まれていません (意図的なら OK)`);
    }
  }

  // ── 対話確認 (TTY のみ・検出採用時のみ。CI/非 TTY では flag だけで動く) ──
  if (source === 'detect' && process.stdin.isTTY && process.stdout.isTTY && !args.dryRun) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = (await rl.question(`この pack 構成で展開しますか? [Y/n] `)).trim().toLowerCase();
    rl.close();
    if (ans === 'n' || ans === 'no') {
      console.log('中止しました。--preset= か --packs= で構成を明示して再実行してください。');
      process.exit(0);
    }
  }

  // ── 各 file の内容を先に確定 (render) ──
  const rendered = []; // { dst, dstPath, content, remaining }
  for (const { src, dst } of TEMPLATE_MAP) {
    const srcPath = path.join(TEMPLATES_DIR, src);
    if (!(await exists(srcPath))) {
      console.error(`❌ template ${srcPath} が不在`);
      process.exit(2);
    }
    let raw = await fs.readFile(srcPath, 'utf8');
    if (dst === 'INVARIANTS.md') {
      const { content, mergedPacks } = await synthesizeInvariants(raw, packs);
      raw = content;
      if (mergedPacks.length > 0) {
        console.log(`\n🧩 INVARIANTS.md へ合成: ${mergedPacks.map((p) => `${p} (invariants.fragment.md)`).join(' / ')}`);
      }
    }
    const content = applyReplacements(raw, replacements);
    rendered.push({
      dst,
      dstPath: path.join(targetDir, dst),
      content,
      remaining: remainingPlaceholders(content),
    });
  }

  // ── 書き込み (or dry-run 表示) ──
  console.log('');
  let createdCount = 0;
  let overwrittenCount = 0;
  let skippedCount = 0;
  const written = []; // 残 placeholder 報告対象 (skip した file は対象外)
  const stamp = backupStamp();

  for (const r of rendered) {
    const already = await exists(r.dstPath);
    if (already && !args.force) {
      console.log(`  ⏭️  ${r.dst} 既存 — skip (--force で backup + 上書き可)`);
      skippedCount++;
      continue;
    }
    if (args.dryRun) {
      const action = already ? `上書き予定 (backup: ${r.dst}.bak-${stamp})` : '作成予定';
      console.log(`  📄 ${r.dst} ${action} (残 placeholder: ${r.remaining.length} 種)`);
      written.push(r);
      continue;
    }
    if (already) {
      const bakPath = `${r.dstPath}.bak-${stamp}`;
      await fs.copyFile(r.dstPath, bakPath);
      await fs.writeFile(r.dstPath, r.content);
      console.log(`  ♻️  ${r.dst} 上書き (backup: ${path.basename(bakPath)}) (残 placeholder: ${r.remaining.length} 種)`);
      overwrittenCount++;
    } else {
      await fs.writeFile(r.dstPath, r.content);
      console.log(`  ✅ ${r.dst} 作成 (残 placeholder: ${r.remaining.length} 種)`);
      createdCount++;
    }
    written.push(r);
  }

  if (args.dryRun) {
    console.log(`\n📊 dry-run 結果: 生成予定 ${written.length} / skip ${skippedCount} — 何も書き込んでいません`);
  } else {
    console.log(`\n📊 結果: 作成 ${createdCount} / 上書き(backup付) ${overwrittenCount} / skip ${skippedCount}`);
  }

  // ── 残 placeholder の正直な報告 (「完了」と言わない) ──
  const totalRemaining = new Set(written.flatMap((r) => r.remaining));
  if (totalRemaining.size > 0) {
    console.log(`\n📝 残り placeholder: 合計 ${totalRemaining.size} 種 — file 別内訳:`);
    for (const r of written) {
      if (r.remaining.length === 0) continue;
      console.log(`   ${r.dst} (${r.remaining.length} 種):`);
      for (const p of r.remaining) console.log(`     - {{${truncate(p)}}}`);
    }
  }

  console.log(`\n📚 関連スキル (= Claude Code 経由で発動):`);
  console.log(`   - engineering-doctrine          (= 思考様式 6 規律)`);
  console.log(`   - engineering-doctrine-universal (= 配布版・汎用 6 規律)`);
  console.log(`   - doc-constitution               (= 文書運用憲法)`);
  console.log(`   - staff-officer                  (= 参謀フロー 5 層 × 4 ライン)`);
  console.log(`   - session-operations             (= マルチセッション運用の型)`);
  console.log(`   - guardrail-authoring            (= 検出器・CI・品質ゲートを書く時のみ)
   - boundary-authoring             (= 境界線マップの聞き取り)`);

  if (args.dryRun) {
    console.log(`\n🔎 dry-run 終了 — 実行するには --dry-run を外してください\n`);
  } else if (totalRemaining.size > 0) {
    console.log(
      `\n⏸  init はここまで — まだ「完了」ではありません。残り ${totalRemaining.size} 種の placeholder をプロジェクト固有値で埋めて初めて固有層が完成します。\n`,
    );
  } else {
    console.log(`\n✅ placeholder 残 0 — プロジェクト固有層の骨格が揃いました\n`);
  }
}

main().catch((e) => {
  console.error('init 実行中エラー:', e);
  process.exit(2);
});
