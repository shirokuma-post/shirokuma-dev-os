#!/usr/bin/env node
// 番人: serverless 実行時間上限チェック（失敗クラス I5）
// プラン上限を超える maxDuration 宣言の route を検出。PLAN 環境変数で上限を切替え。
//   PLAN=free node checks/maxduration-check.mjs   # 上限60秒
//   PLAN=paid node checks/maxduration-check.mjs   # 上限300秒
// 上限超過 route が1件でもあれば exit 1。ローンチ時に 0 件を確認。
import { readFileSync } from "node:fs";
import { globSync } from "node:fs"; // Node 22+。古い環境は fast-glob 等に置換。

const CAP = { free: 60, paid: 300 }[process.env.PLAN ?? "free"] ?? 60;
const ROUTES = "{{src}}/**/route.{ts,js}"; // 自プロジェクトの route glob に置換

let bad = 0;
for (const f of globSync(ROUTES)) {
  const src = readFileSync(f, "utf8");
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  if (m && Number(m[1]) > CAP) {
    console.log(`❌ I5 ${f}: maxDuration=${m[1]}s > プラン上限${CAP}s`);
    bad++;
  }
}
if (bad) {
  console.log(`\n🚫 ${bad} 件が上限超過。長時間処理はジョブキューで非同期化 or 有料昇格。`);
  process.exit(1);
}
console.log(`✅ 上限超過 route なし（cap=${CAP}s）`);
