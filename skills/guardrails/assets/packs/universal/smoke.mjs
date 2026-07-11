#!/usr/bin/env node
// 番人: 死活スモーク（層4）。全コンポーネントの /health を巡回し top-level status で判定。
// 使い方: node scripts/smoke/smoke.mjs   （cron 化推奨。デプロイ後にも実行）
// health 出力契約: { status: 'healthy'|'degraded'|'unhealthy', product, version, checks }
// unhealthy が1つでもあれば exit 1。version 照合でデプロイ実反映も裏取り（失敗クラス I1/I2）。

// 監視対象（自系統のみ。越境厳禁）。health:null は静的/MVP で監視対象外。
const TARGETS = [
  { name: "{{component-a}}", url: "https://{{component-a}}/api/health" },
  { name: "{{component-b}}", url: "https://{{component-b}}/api/health" },
  // { name: "static-site", url: null }, // health 未配備は top200 判定等に置換
];
const EXPECT_VERSION = process.env.EXPECT_VERSION; // HEAD の commit sha（任意。渡せば一致確認）
const TIMEOUT_MS = 8000;

async function probe(t) {
  if (!t.url) return { ...t, status: "skip" };
  try {
    const r = await fetch(t.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await r.json().catch(() => ({}));
    const status = body.status ?? (r.ok ? "healthy?" : "unhealthy");
    const verOk = !EXPECT_VERSION || body.version === EXPECT_VERSION;
    return { ...t, http: r.status, status, version: body.version, verOk };
  } catch (e) {
    return { ...t, status: "unhealthy", error: String(e.name || e) };
  }
}

const results = await Promise.all(TARGETS.map(probe));
let bad = 0;
for (const r of results) {
  const flag = r.status === "healthy" && r.verOk !== false ? "✅"
            : r.status === "degraded" ? "🟡"
            : r.status === "skip" ? "⚪" : "❌";
  if (flag === "❌") bad++;
  const ver = r.version ? ` v=${r.version}${r.verOk === false ? " (stale!)" : ""}` : "";
  console.log(`${flag} ${r.name}: ${r.status}${ver}${r.error ? " " + r.error : ""}`);
}
// 異常時はここで運営最上位の管理者のみへ通知（dedupe 付き）。例: webhook 送信を追加。
if (bad) { console.log(`\n🚨 ${bad} 件 unhealthy。`); process.exit(1); }
console.log("\n✅ 全コンポーネント healthy");
