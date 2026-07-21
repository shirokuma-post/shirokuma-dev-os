#!/usr/bin/env node
// E5 責任境界の参照消費者 — dev-os の verdict.json を読み、実行可否を返す。
// 契約: AIOM pj/scratchpad/E5-CONTRACT.md（生成は dev-os のみ・一方向・消費側は上書きしない）
//
// usage: node verdict-gate.mjs <projectDir> [--risk=prod|local] [--max-age-min=30]
// exit 0 = 実行してよい / exit 2 = 承認キューへ（理由を stdout に出す）
//
// 意味論:
//   PASS ∧ evidence 2      → 許可
//   FAIL                   → 承認へ（failures を理由に添える）
//   INVALID / UNSPECIFIED  → 「失敗」ではなく「保証がない」。risk=prod は承認へ・local は通す
//   判定なし / 期限切れ     → 判定なしとして扱う（陳腐化した緑の再利用禁止）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const projectDir = args.find((a) => !a.startsWith('--')) || process.cwd();
const risk = (args.find((a) => a.startsWith('--risk=')) || '--risk=prod').split('=')[1];
const maxAgeMin = Number((args.find((a) => a.startsWith('--max-age-min=')) || '--max-age-min=30').split('=')[1]);

const block = (reason) => { console.log(JSON.stringify({ allow: false, reason }, null, 2)); process.exit(2); };
const allow = (reason) => { console.log(JSON.stringify({ allow: true, reason }, null, 2)); process.exit(0); };

let v;
try { v = JSON.parse(readFileSync(join(projectDir, '.claude/.devos/verdict.json'), 'utf8')); }
catch {
  if (risk === 'prod') block('dev-os の判定がありません。検証されていない成果物は本番反映できません。');
  allow('判定なし・低リスク実行のため通過（保証はありません）');
}

const ageMin = (Date.now() - Date.parse(v.at)) / 60000;
if (!Number.isFinite(ageMin) || ageMin > maxAgeMin) {
  if (risk === 'prod') block(`判定が古すぎます（${Math.round(ageMin)} 分前）。最新の検証を通してください。`);
  allow('判定は古いが低リスク実行のため通過（保証はありません）');
}

if (v.verdict === 'PASS' && v.evidence >= 2) allow('裁定済み受け入れ条件を全て満たしています');
if (v.verdict === 'FAIL') block(`受け入れ条件が未達です:\n- ${(v.failures || []).join('\n- ') || '(詳細なし)'}`);
// INVALID / UNSPECIFIED / PASS-with-low-evidence: 失敗ではなく「保証がない」
if (risk === 'prod') block(`保証がありません（verdict=${v.verdict}, evidence=E${v.evidence}）。本番反映は承認が必要です。`);
allow(`保証はないが低リスク実行のため通過（verdict=${v.verdict}）`);
