#!/usr/bin/env node
// 番人: 依存バージョンドリフト検出（失敗クラス I6）
// 複数コンポーネント間で「揃えるべき主要依存」のバージョンが食い違ったら検出。
// 使い方: node checks/dep-drift.mjs <component-dir>...
//   node checks/dep-drift.mjs apps/* packages/*
// 不一致があれば exit 1（週次実行）。
import { readFileSync } from "node:fs";

// 揃えるべき主要依存（DBクライアント・FW・型基盤等）。自プロジェクトに置換。
const PINNED = ["{{@supabase/supabase-js}}", "{{next}}", "{{typescript}}", "{{zod}}"];
const dirs = process.argv.slice(2);
if (!dirs.length) { console.error("usage: dep-drift.mjs <dir>..."); process.exit(2); }

const seen = {}; // pkg -> { version -> [components] }
for (const d of dirs) {
  let pj;
  try { pj = JSON.parse(readFileSync(`${d}/package.json`, "utf8")); } catch { continue; }
  const deps = { ...pj.dependencies, ...pj.devDependencies };
  for (const p of PINNED) {
    const v = deps?.[p];
    if (!v) continue;
    (seen[p] ??= {});
    (seen[p][v] ??= []).push(pj.name ?? d);
  }
}

let drift = 0;
for (const [p, versions] of Object.entries(seen)) {
  const keys = Object.keys(versions);
  if (keys.length > 1) {
    drift++;
    console.log(`❌ I6 ${p}: ${keys.length} バージョン混在`);
    for (const [v, comps] of Object.entries(versions)) console.log(`     ${v} ← ${comps.join(", ")}`);
  }
  if (keys.some(v => v.startsWith("^") || v.startsWith("~"))) {
    console.log(`⚠️  ${p}: caret/tilde 指定あり（${keys.join(", ")}）→ 固定推奨`);
  }
}
if (drift) { console.log(`\n🚫 ${drift} 件のドリフト。主要依存は横断で揃え caret を外す。`); process.exit(1); }
console.log("✅ 主要依存のドリフトなし");
