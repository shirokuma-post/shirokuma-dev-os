#!/usr/bin/env node
/**
 * audit-self-integrity.mjs
 *
 * shirokuma-dev-os プラグインの自己整合性 audit。
 * - GOVERNANCE.md の正典マップ §2 に列挙されたスキル / テンプレが実在するか
 * - skills/*//*SKILL.md の frontmatter (name / description) 必須項目
 * - 内部リンク drift (相対 path / [[name]] 形式) の破断検出
 * - plugin.json の keywords と skills/ ディレクトリ名の対応
 * - templates/ 内 placeholder ({{xxx}}) の整合性
 *
 * Exit code:
 *   0 = 全項目 PASS
 *   1 = 1 件以上 FAIL
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const errors = [];
const warnings = [];
const passes = [];

function fail(check, msg) {
  errors.push({ check, msg });
}
function warn(check, msg) {
  warnings.push({ check, msg });
}
function pass(check, msg) {
  passes.push({ check, msg });
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p) {
  return fs.readFile(p, 'utf8');
}

/* ─── 1. plugin.json 検証 ─── */
async function checkPluginJson() {
  const p = path.join(ROOT, '.claude-plugin/plugin.json');
  if (!(await exists(p))) {
    fail('plugin.json', `${p} が存在しない`);
    return;
  }
  const raw = await readText(p);
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch (e) {
    fail('plugin.json', `JSON parse fail: ${e.message}`);
    return;
  }
  for (const k of ['name', 'version', 'description', 'author']) {
    if (!pkg[k]) fail('plugin.json', `required field "${k}" 欠落`);
  }
  if (pkg.name !== 'shirokuma-dev-os') {
    fail('plugin.json', `name は "shirokuma-dev-os" のはず (現在: ${pkg.name})`);
  }
  pass('plugin.json', 'name/version/description/author 揃ってる');

  // keywords vs skills/ ディレクトリ名
  const skillsDir = path.join(ROOT, 'skills');
  if (await exists(skillsDir)) {
    const skillDirs = (await fs.readdir(skillsDir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const declared = pkg.keywords || [];
    for (const dir of skillDirs) {
      // engineering-doctrine-universal は keywords に未登録でも可 (= 配布版で許容)
      if (dir.endsWith('-universal')) continue;
      if (!declared.includes(dir)) {
        warn('plugin.json', `skills/${dir} が plugin.json keywords に未登録`);
      }
    }
    pass('plugin.json', 'keywords ↔ skills/ ディレクトリ整合性チェック完了');
  }
}

/* ─── 2. skills/*//*SKILL.md frontmatter 検証 ─── */
async function checkSkillFrontmatter() {
  const skillsDir = path.join(ROOT, 'skills');
  if (!(await exists(skillsDir))) {
    fail('skills/', `${skillsDir} が存在しない`);
    return;
  }
  const dirs = (await fs.readdir(skillsDir, { withFileTypes: true })).filter((d) =>
    d.isDirectory(),
  );
  for (const d of dirs) {
    const skillPath = path.join(skillsDir, d.name, 'SKILL.md');
    if (!(await exists(skillPath))) {
      fail('skills/SKILL.md', `${d.name}/SKILL.md が存在しない`);
      continue;
    }
    const content = await readText(skillPath);
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) {
      fail('skills/SKILL.md', `${d.name}/SKILL.md に frontmatter なし`);
      continue;
    }
    const nameMatch = fm[1].match(/^name:\s*(.+)$/m);
    const descMatch = fm[1].match(/^description:\s*(.+)$/m);
    if (!nameMatch) fail('skills/SKILL.md', `${d.name}/SKILL.md の name 欠落`);
    if (!descMatch) fail('skills/SKILL.md', `${d.name}/SKILL.md の description 欠落`);
    if (nameMatch && nameMatch[1].trim() !== d.name) {
      fail(
        'skills/SKILL.md',
        `${d.name}/SKILL.md の name (${nameMatch[1].trim()}) がディレクトリ名と不一致`,
      );
    }
    if (descMatch) {
      const desc = descMatch[1].trim();
      if (desc.length < 30) {
        warn('skills/SKILL.md', `${d.name}/SKILL.md の description が短すぎ (${desc.length} chars)`);
      }
    }
    pass('skills/SKILL.md', `${d.name}/SKILL.md frontmatter OK`);
  }
}

/* ─── 3. GOVERNANCE.md 正典マップ vs 実在ファイル ─── */
async function checkGovernanceMap() {
  const govPath = path.join(ROOT, 'GOVERNANCE.md');
  if (!(await exists(govPath))) {
    fail('GOVERNANCE.md', '本体が存在しない');
    return;
  }
  const content = await readText(govPath);

  // skills/xxx 言及を抽出
  const skillRefs = [...content.matchAll(/`skills\/([\w-]+)`/g)].map((m) => m[1]);
  for (const ref of new Set(skillRefs)) {
    const p = path.join(ROOT, 'skills', ref, 'SKILL.md');
    if (!(await exists(p))) {
      fail('GOVERNANCE.md', `正典マップで skills/${ref} を言及してるが SKILL.md 不在`);
    }
  }
  pass('GOVERNANCE.md', `skills/* 言及 ${new Set(skillRefs).size} 件すべて実在`);

  // templates/xxx 言及を抽出
  const tmplRefs = [...content.matchAll(/`templates\/([\w.-]+)`/g)].map((m) => m[1]);
  for (const ref of new Set(tmplRefs)) {
    const p = path.join(ROOT, 'templates', ref);
    if (!(await exists(p))) {
      fail('GOVERNANCE.md', `正典マップで templates/${ref} を言及してるが実在しない`);
    }
  }
  pass('GOVERNANCE.md', `templates/* 言及 ${new Set(tmplRefs).size} 件すべて実在`);
}

/* ─── 4. 内部リンク drift 検出 (相対 path + [[name]] 形式) ─── */
async function checkInternalLinks() {
  const targets = [
    path.join(ROOT, 'GOVERNANCE.md'),
    ...(await collectMd(path.join(ROOT, 'skills'))),
  ];
  let totalRefs = 0;
  for (const file of targets) {
    const content = await readText(file);

    // [[name]] 形式 (= skill 相互参照)
    const wikiLinks = [...content.matchAll(/\[\[([\w-]+)\]\]/g)].map((m) => m[1]);
    for (const link of wikiLinks) {
      totalRefs++;
      // skill 名として存在するか
      const skillPath = path.join(ROOT, 'skills', link, 'SKILL.md');
      if (!(await exists(skillPath))) {
        warn(
          'internal-links',
          `${path.relative(ROOT, file)} の [[${link}]] が skills/ にない (= 未作成 placeholder)`,
        );
      }
    }

    // 相対 path リンク ([text](../path) / [text](./path))
    const relLinks = [...content.matchAll(/\]\((\.\.?\/[^\s)]+)\)/g)].map((m) => m[1]);
    for (const link of relLinks) {
      totalRefs++;
      const baseDir = path.dirname(file);
      const targetPath = path.resolve(baseDir, link.split('#')[0]);
      if (!(await exists(targetPath))) {
        fail(
          'internal-links',
          `${path.relative(ROOT, file)} の相対リンク ${link} が破断 (= 実体なし)`,
        );
      }
    }
  }
  pass('internal-links', `相対リンク + [[name]] 計 ${totalRefs} 件 audit 完了`);
}

async function collectMd(dir) {
  const results = [];
  if (!(await exists(dir))) return results;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...(await collectMd(p)));
    } else if (e.name.endsWith('.md')) {
      results.push(p);
    }
  }
  return results;
}

/* ─── 5. templates/ placeholder 整合性 ─── */
async function checkTemplatePlaceholders() {
  const tmplDir = path.join(ROOT, 'templates');
  if (!(await exists(tmplDir))) {
    warn('templates/', 'templates ディレクトリが存在しない');
    return;
  }
  const tmplFiles = (await fs.readdir(tmplDir)).filter((f) => f.endsWith('.md'));
  for (const f of tmplFiles) {
    const content = await readText(path.join(tmplDir, f));
    const placeholders = [...content.matchAll(/\{\{([\w_-]+)\}\}/g)].map((m) => m[1]);
    const uniq = [...new Set(placeholders)];
    if (uniq.length === 0) {
      warn('templates/', `${f} に placeholder ({{xxx}}) なし — テンプレ機能してる?`);
    } else {
      pass('templates/', `${f} に placeholder ${uniq.length} 種 (${uniq.join(', ')})`);
    }
  }
}

/* ─── 6. engineering-doctrine ↔ universal の二重管理チェック ─── */
async function checkDoctrineLayers() {
  const l1 = path.join(ROOT, 'skills/engineering-doctrine/SKILL.md');
  const l2 = path.join(ROOT, 'skills/engineering-doctrine-universal/SKILL.md');
  if (!(await exists(l1)) || !(await exists(l2))) {
    warn('doctrine-layers', '第 1 層 or 第 2 層が不在 — 配布版未起案?');
    return;
  }
  const l1Content = await readText(l1);
  const l2Content = await readText(l2);

  // 第 2 層は第 1 層を参照すべき
  if (!l2Content.includes('engineering-doctrine')) {
    fail('doctrine-layers', '配布版 SKILL.md が第 1 層 (engineering-doctrine) を参照していない');
  } else {
    pass('doctrine-layers', '配布版 → 第 1 層 参照あり');
  }

  // 第 1 層は固有名 (= しろくま / Personal / Biz 等) を含んでよいが、配布版は含むべきでない
  const proprietaryTerms = ['しろくま', 'Personal', 'Biz', 'shirokuma_SaaS'];
  const leaks = proprietaryTerms.filter((t) => l2Content.includes(t));
  // engineering-doctrine 自身の name 参照は OK
  const realLeaks = leaks.filter(
    (t) => !(t === 'しろくま' && l2Content.includes('しろくま自身の規律')),
  );
  if (realLeaks.length > 0) {
    fail(
      'doctrine-layers',
      `配布版 SKILL.md に固有名漏れ: ${realLeaks.join(', ')} (= 普遍核に蒸留できてない)`,
    );
  } else {
    pass('doctrine-layers', '配布版 SKILL.md に固有名漏れなし (= 蒸留 OK)');
  }
}

/* ─── 実行 ─── */
async function main() {
  console.log('\n🔍 shirokuma-dev-os 自己整合性 audit\n');

  await checkPluginJson();
  await checkSkillFrontmatter();
  await checkGovernanceMap();
  await checkInternalLinks();
  await checkTemplatePlaceholders();
  await checkDoctrineLayers();

  console.log(`✅ PASS: ${passes.length}`);
  for (const p of passes) console.log(`  - [${p.check}] ${p.msg}`);

  if (warnings.length > 0) {
    console.log(`\n⚠️  WARN: ${warnings.length}`);
    for (const w of warnings) console.log(`  - [${w.check}] ${w.msg}`);
  }

  if (errors.length > 0) {
    console.log(`\n❌ FAIL: ${errors.length}`);
    for (const e of errors) console.log(`  - [${e.check}] ${e.msg}`);
    process.exit(1);
  }

  console.log('\n🎉 全項目 PASS\n');
  process.exit(0);
}

main().catch((e) => {
  console.error('audit 実行中エラー:', e);
  process.exit(2);
});
