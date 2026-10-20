#!/usr/bin/env node
// 発火の試験 — 各 prompt を headless Claude Code に投げ、Skill tool の実呼び出しだけを発火と数える。
// このプラグインだけを読み込む (--plugin-dir <plugin> + --setting-sources project・空の作業ディレクトリ)。
// 1 case = 1 回の API 会話。使い方: node tests/run-trigger.mjs [--ids pos-01,neg-02]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.resolve(here, '..');
const cases = fs.readFileSync(path.join(here, 'trigger-cases.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const idsArg = process.argv.indexOf('--ids');
const only = idsArg >= 0 ? new Set(process.argv[idsArg + 1].split(',')) : null;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'add-trigger-'));
const env = { ...process.env };
for (const k of Object.keys(env)) if (k === 'CLAUDECODE' || ((k.startsWith('CLAUDE_CODE_') || k.startsWith('CLAUDE_AGENT_')) && k !== 'CLAUDE_CODE_OAUTH_TOKEN')) delete env[k];

let ok = 0, bad = 0;
for (const c of cases) {
  if (only && !only.has(c.id)) continue;
  const r = spawnSync('claude', ['-p', c.prompt, '--plugin-dir', plugin, '--setting-sources', 'project',
    '--output-format', 'stream-json', '--verbose', '--max-turns', '2', '--allowedTools', 'Skill'],
    { cwd: work, env, encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
  let fired = false, loaded = false, err = r.error ? String(r.error) : null;
  for (const line of (r.stdout ?? '').split('\n')) {
    let ev; try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'system' && ev.subtype === 'init') loaded = (ev.plugins ?? []).some((p) => p.name === 'attack-defend-duel');
    if (ev.type === 'assistant') for (const b of ev.message?.content ?? []) {
      if (b.type === 'tool_use' && b.name === 'Skill' && String(b.input?.skill ?? '').split(':').pop() === 'attack-defend-duel') fired = true;
    }
    if (ev.type === 'result' && ev.is_error && String(ev.result ?? '') !== '') err = String(ev.result).slice(0, 120);
  }
  if (!loaded) err = err ?? 'plugin_not_loaded';
  const pass = !err && fired === c.expect;
  pass ? ok++ : bad++;
  console.log(`${pass ? 'OK ' : 'NG '} ${c.id} expect=${c.expect} fired=${fired}${err ? ' error=' + err : ''}`);
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`発火の試験: ${ok}/${ok + bad} 合格`);
process.exit(bad ? 1 : 0);
