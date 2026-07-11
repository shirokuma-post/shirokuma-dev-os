#!/usr/bin/env node
/**
 * trigger eval harness (計画書 §7.2)
 *
 * 各 case の prompt を headless Claude Code (`claude -p`) に投げ、
 * stream-json 出力から **Skill tool の実呼び出し (tool_use)** だけを発火と数える。
 * 回答テキスト中の skill 名言及は発火と数えない。
 *
 * 前提 (2026-07-11 実測):
 *   - claude CLI v2.1.85
 *   - `--plugin-dir <repo root>` + `--setting-sources project` で
 *     init event の skills が本 plugin の 6 skill + built-in のみになる
 *     (user 設定の他 skill 汚染なし) ことを実測確認済
 *   - 実行 cwd は空の .workdir (プロジェクト CLAUDE.md の影響を排除)
 *
 * 使い方:
 *   node tests/trigger-evals/run-trigger-eval.mjs --calibrate [case-id]   # 較正 1 call: raw event dump
 *   node tests/trigger-evals/run-trigger-eval.mjs --sample 15             # pilot (category 均等サンプル)
 *   node tests/trigger-evals/run-trigger-eval.mjs --resume --confirm-full # フル 80 case (中断安全・再開可)
 *   node tests/trigger-evals/run-trigger-eval.mjs --report                # 実行なし・results.jsonl 集計のみ
 *
 * flags:
 *   --sample N       category 比率 (positive .60 / negative .25 / overlap 残り) で N 件抽出。
 *                    positive 内は skill round-robin で全 skill をカバー
 *   --ids a,b,c      指定 id のみ強制再実行 (--sample/--resume より優先・skip しない)。
 *                    集計は既存仕様どおり同一 id の最新 entry 後勝ち = 再計測用
 *   --resume         results.jsonl に既にある id を skip
 *   --calibrate [id] 1 case だけ実行し raw stream-json を全 dump (results へは書かない)
 *   --report         API を呼ばず集計だけ表示
 *   --dry-run        実行コマンドの表示のみ
 *   --confirm-full   21 case 以上の実行に必須 (コスト暴発ガード: 1 case = 1 API 会話)
 *   --max-turns N    1 case あたりの agent turn 上限 (default 2)
 *   --timeout SEC    1 case のタイムアウト (default 240)
 *   --model NAME     claude CLI へ --model を透過
 *   --results FILE   results ファイル指定 (default: tests/trigger-evals/results.jsonl)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const CASES_FILE = path.join(__dirname, "cases.jsonl");
const WORKDIR = path.join(__dirname, ".workdir");
const SIX = [
  "doc-constitution",
  "engineering-doctrine",
  "engineering-doctrine-universal",
  "guardrails",
  "session-operations",
  "staff-officer",
];

// ---------- args ----------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
};
const OPT = {
  sample: val("--sample", null),
  ids: val("--ids", null),
  resume: has("--resume"),
  calibrate: has("--calibrate"),
  calibrateId: has("--calibrate") ? val("--calibrate", null) : null,
  report: has("--report"),
  dryRun: has("--dry-run"),
  confirmFull: has("--confirm-full"),
  maxTurns: val("--max-turns", "2"),
  timeoutSec: Number(val("--timeout", "240")),
  model: val("--model", null),
  results: val("--results", path.join(__dirname, "results.jsonl")),
};

// ---------- helpers ----------
const readJsonl = (file) =>
  fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
    : [];

const normalizeSkill = (s) => String(s ?? "").split(":").pop().trim();

function sampleCases(all, n) {
  const byCat = { positive: [], negative: [], overlap: [] };
  for (const c of all) byCat[c.category]?.push(c);
  const nPos = Math.min(byCat.positive.length, Math.round(n * 0.6));
  const nNeg = Math.min(byCat.negative.length, Math.round(n * 0.25));
  const nOvl = Math.min(byCat.overlap.length, Math.max(0, n - nPos - nNeg));
  // positive は expected skill 別 round-robin で全 skill をカバー
  const groups = new Map();
  for (const c of byCat.positive) {
    const k = c.expected_skills[0] ?? "_";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const pos = [];
  const keys = [...groups.keys()];
  for (let round = 0; pos.length < nPos; round++) {
    let took = false;
    for (const k of keys) {
      if (pos.length >= nPos) break;
      const g = groups.get(k);
      if (g[round]) {
        pos.push(g[round]);
        took = true;
      }
    }
    if (!took) break;
  }
  const spread = (arr, k) =>
    Array.from({ length: k }, (_, i) => arr[Math.floor((i * arr.length) / k)]);
  return [...pos, ...spread(byCat.negative, nNeg), ...spread(byCat.overlap, nOvl)];
}

function sanitizedEnv() {
  // 親が Claude Code セッションでも「fresh thread」(§7.4) として起動させる。
  // CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_* は正規の認証手段なので残す。
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === "CLAUDE_CODE_OAUTH_TOKEN") continue;
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_") || k.startsWith("CLAUDE_AGENT_")) {
      delete env[k];
    }
  }
  return env;
}

function runCase(c) {
  fs.mkdirSync(WORKDIR, { recursive: true });
  const args = [
    "-p",
    c.prompt,
    "--plugin-dir",
    REPO_ROOT,
    "--setting-sources",
    "project",
    "--output-format",
    "stream-json",
    "--verbose",
    "--max-turns",
    OPT.maxTurns,
    "--allowedTools",
    "Skill",
  ];
  if (OPT.model) args.push("--model", OPT.model);
  if (OPT.dryRun) {
    console.log(`[dry-run] claude ${args.map((a) => JSON.stringify(a)).join(" ")}`);
    return null;
  }
  const t0 = Date.now();
  const r = spawnSync("claude", args, {
    cwd: WORKDIR,
    env: sanitizedEnv(),
    encoding: "utf8",
    timeout: OPT.timeoutSec * 1000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const rec = {
    id: c.id,
    category: c.category,
    subcategory: c.subcategory ?? null,
    expected_skills: c.expected_skills,
    fired_skills: [],
    all_tool_calls: [],
    is_error: false,
    truncated: false, // --max-turns 打ち切り (result event は is_error だが Skill 発火計測は有効)
    result_subtype: null, // result event の subtype (観測用)
    error: null,
    cost_usd: null,
    num_turns: null,
    duration_ms: Date.now() - t0,
    unparsed_lines: 0,
    ts: new Date().toISOString(),
  };
  if (r.error) {
    rec.is_error = true;
    rec.error = r.error.code === "ETIMEDOUT" ? "timeout" : String(r.error);
    return { rec, rawLines: [] };
  }
  const rawLines = (r.stdout ?? "").split("\n").filter((l) => l.trim());
  const fired = new Set();
  for (const line of rawLines) {
    let ev;
    try {
      ev = JSON.parse(line);
    } catch {
      rec.unparsed_lines++;
      continue;
    }
    if (ev.type === "system" && ev.subtype === "init") {
      const loaded = (ev.plugins ?? []).some((p) => p.name === "shirokuma-dev-os");
      if (!loaded) {
        rec.is_error = true;
        rec.error = "plugin_not_loaded";
      }
    }
    if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b.type !== "tool_use") continue;
        rec.all_tool_calls.push({ name: b.name, input_keys: Object.keys(b.input ?? {}) });
        if (b.name === "Skill") {
          const s = normalizeSkill(b.input?.skill ?? b.input?.command);
          if (s) fired.add(s);
        }
      }
    }
    if (ev.type === "result") {
      rec.cost_usd = ev.total_cost_usd ?? null;
      rec.num_turns = ev.num_turns ?? null;
      rec.result_subtype = ev.subtype ?? null;
      if (ev.is_error) {
        rec.is_error = true;
        const msg = String(ev.result ?? "").slice(0, 200);
        // 2026-07-11 pilot 15 件 + calibration log 実測:
        //   --max-turns 打ち切り = is_error:true だが result text が空 (9/9 件とも error='')。
        //     stream は正常 parse・Skill tool_use は打ち切り前に記録済 → trigger 計測有効。
        //   真の実行失敗 = 非空 message (例 'Not logged in · Please run /login') /
        //     spawn error / plugin_not_loaded / timeout。
        if (rec.error == null && msg === "") {
          rec.truncated = true;
        } else {
          rec.error = rec.error ?? msg;
        }
      }
    }
  }
  rec.fired_skills = [...fired];
  return { rec, rawLines };
}

// ---------- aggregate ----------
// record 分類 (2026-07-11 pilot 実測起点):
//   completed  = 完走 (is_error なし)                        → 計測有効
//   truncated  = --max-turns 打ち切り (Skill 発火は記録済)     → 計測有効
//   failed     = 真の実行失敗 (spawn/API error・unparsed>0)   → 集計除外
// 旧 record (truncated field 追加前) 互換: 打ち切りは error==='' で実測判別。
function classify(r) {
  if ((r.unparsed_lines ?? 0) > 0) return "failed";
  if (r.truncated) return "truncated";
  if (!r.is_error) return "completed";
  if (r.error === "") return "truncated"; // 旧 record 互換 (pilot 9/9 件実測)
  return "failed";
}

function aggregate(records) {
  const latest = new Map();
  for (const r of records) latest.set(r.id, r); // 後勝ち = 同一 id は最新 entry を採用
  const all = [...latest.values()];
  const rs = all.filter((r) => classify(r) !== "failed");
  const errs = all.filter((r) => classify(r) === "failed");
  const nTrunc = rs.filter((r) => classify(r) === "truncated").length;
  const stat = Object.fromEntries(SIX.map((s) => [s, { tp: 0, fp: 0, fn: 0 }]));
  let negTotal = 0, negFired = 0, smallTotal = 0, smallStaff = 0;
  let ovlTotal = 0, ovlPass = 0, multi3 = 0;
  for (const r of rs) {
    const fired6 = r.fired_skills.map(normalizeSkill).filter((s) => SIX.includes(s));
    if (fired6.length >= 3) multi3++;
    if (r.category === "positive") {
      for (const e of r.expected_skills) fired6.includes(e) ? stat[e].tp++ : stat[e].fn++;
      for (const f of fired6) if (!r.expected_skills.includes(f)) stat[f].fp++;
    } else if (r.category === "negative") {
      negTotal++;
      if (fired6.length > 0) negFired++;
      for (const f of fired6) stat[f].fp++;
      if (r.subcategory === "small-task") {
        smallTotal++;
        if (fired6.includes("staff-officer")) smallStaff++;
      }
    } else if (r.category === "overlap") {
      ovlTotal++;
      const hit = fired6.filter((f) => r.expected_skills.includes(f));
      const stray = fired6.filter((f) => !r.expected_skills.includes(f));
      if (hit.length >= 1 && stray.length === 0) ovlPass++;
      for (const f of hit) stat[f].tp++;
      for (const f of stray) stat[f].fp++;
    }
  }
  const pct = (a, b) => (b === 0 ? "n/a" : (a / b).toFixed(2));
  console.log(
    `\n== 集計 (計測有効 ${rs.length} 件 = 完走 ${rs.length - nTrunc} + max-turns打ち切り ${nTrunc} / 実行失敗 ${errs.length} 件) ==`
  );
  console.log("| skill | TP | FP | FN | precision | recall |");
  console.log("|---|---|---|---|---|---|");
  for (const s of SIX) {
    const { tp, fp, fn } = stat[s];
    console.log(`| ${s} | ${tp} | ${fp} | ${fn} | ${pct(tp, tp + fp)} | ${pct(tp, tp + fn)} |`);
  }
  console.log(`\nnegative false activation: ${negFired}/${negTotal} (目標 <= 0.05)`);
  console.log(`small-task staff-officer 過剰 orchestration: ${smallStaff}/${smallTotal} (目標 <= 0.05)`);
  console.log(`overlap pass (fired ⊆ expected かつ 1 個以上): ${ovlPass}/${ovlTotal}`);
  console.log(`3+ skill 同時発火: ${multi3} 件 (目標 = 0)`);
  if (errs.length)
    console.log(`\n実行失敗 cases: ${errs.map((r) => `${r.id}(${r.error})`).join(", ")}`);
}

// ---------- main ----------
const allCases = readJsonl(CASES_FILE);

if (OPT.report) {
  aggregate(readJsonl(OPT.results));
  process.exit(0);
}

if (OPT.calibrate) {
  const c = OPT.calibrateId
    ? allCases.find((x) => x.id === OPT.calibrateId)
    : allCases.find((x) => x.category === "positive");
  if (!c) throw new Error(`case not found: ${OPT.calibrateId}`);
  console.log(`[calibrate] 1 case = 1 API call: ${c.id}\n  prompt: ${c.prompt}`);
  const out = runCase(c);
  if (!out) process.exit(0);
  console.log("\n--- raw stream-json events ---");
  for (const l of out.rawLines) console.log(l);
  console.log("\n--- 抽出結果 ---");
  console.log(JSON.stringify(out.rec, null, 2));
  const log = path.join(__dirname, `calibration-${Date.now()}.log`);
  fs.writeFileSync(log, out.rawLines.join("\n"));
  console.log(`raw log: ${log} (results.jsonl へは書いていない)`);
  process.exit(0);
}

let queue = OPT.sample ? sampleCases(allCases, Number(OPT.sample)) : [...allCases];
if (OPT.ids) {
  // 指定 id のみ強制再実行 (--resume の skip 対象外)。集計は最新 entry 後勝ち (既存仕様)
  const want = OPT.ids.split(",").map((s) => s.trim()).filter(Boolean);
  const missing = want.filter((id) => !allCases.some((c) => c.id === id));
  if (missing.length) throw new Error(`case not found in cases.jsonl: ${missing.join(", ")}`);
  queue = want.map((id) => allCases.find((c) => c.id === id));
}
if (OPT.resume && !OPT.ids) {
  // 同一 id の最新 entry を採用し、計測有効 (completed/truncated) なら skip = 再実行 (API call) しない
  const latest = new Map();
  for (const r of readJsonl(OPT.results)) latest.set(r.id, r);
  const done = new Set(
    [...latest.values()].filter((r) => classify(r) !== "failed").map((r) => r.id)
  );
  queue = queue.filter((c) => !done.has(c.id));
}
if (queue.length > 20 && !OPT.confirmFull && !OPT.dryRun) {
  console.error(
    `対象 ${queue.length} case = ${queue.length} API 会話。20 件超のフル実行は --confirm-full を付けること (コスト暴発ガード)。`
  );
  process.exit(1);
}
console.log(`対象 ${queue.length} case (results: ${OPT.results})`);
let i = 0;
for (const c of queue) {
  i++;
  process.stdout.write(`[${i}/${queue.length}] ${c.id} ... `);
  const out = runCase(c);
  if (!out) continue; // dry-run
  fs.appendFileSync(OPT.results, JSON.stringify(out.rec) + "\n"); // 1 case ごと追記 = 中断安全
  console.log(
    classify(out.rec) === "failed"
      ? `ERROR (${out.rec.error})`
      : `fired=[${out.rec.fired_skills.join(", ")}] cost=$${out.rec.cost_usd ?? "?"}${
          out.rec.truncated ? " (max-turns打ち切り・計測有効)" : ""
        }`
  );
}
if (!OPT.dryRun) aggregate(readJsonl(OPT.results));
