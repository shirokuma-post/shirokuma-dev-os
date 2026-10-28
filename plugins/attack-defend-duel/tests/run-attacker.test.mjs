// node --test tests/run-attacker.test.mjs
// 攻め役への依頼文を固定の雛形から作る道具 (run-attacker.mjs) の約束を固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt } from '../skills/attack-defend-duel/scripts/run-attacker.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '..', 'skills', 'attack-defend-duel');
const script = path.join(skill, 'scripts', 'run-attacker.mjs');
const template = readFileSync(path.join(skill, 'scripts', 'attack-prompt.txt'), 'utf8');

test('雛形の欄は全部埋まる', () => {
  const p = buildPrompt(template, '/r', 'G');
  assert.doesNotMatch(p, /\{\{/);
  assert.match(p, /\/r\/in\/promises\.md/);
  assert.match(p, /\(G\)/);
});

test('埋まっていない欄が残れば止める', () => {
  assert.throws(() => buildPrompt('{{RUN}} {{OTHER}}', '/r', 'G'), /OTHER/);
});

test('雛形は 4 つの判定・陽性対照・非 0 終了・書く場所の限定を持つ', () => {
  for (const w of ["'CONTROL P<n>: OK'", "'BROKEN P<n>", "'HELD P<n>'", "'INCONCLUSIVE P<n>", "'ERROR P<n>", '0 以外の終了コード', '{{RUN}}/out/ 以外には書かない', '関門']) {
    assert.ok(template.includes(w), `雛形に無い: ${w}`);
  }
});

test('SKILL.md に依頼文を写していない (2 か所に置くとずれる)', () => {
  const s = readFileSync(path.join(skill, 'SKILL.md'), 'utf8');
  assert.ok(!s.includes('codex exec -C "$RUN"'), 'SKILL.md に codex の依頼文が残っている');
  assert.ok(s.includes('scripts/run-attacker.mjs'));
});

function run(args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('--print は依頼文だけを出して 0 で終わる (攻め役は起動しない)', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'duel-'));
  try {
    mkdirSync(path.join(d, 'in'));
    mkdirSync(path.join(d, 'out'));
    writeFileSync(path.join(d, 'in', 'promises.md'), '- P1 [A1]: x\n');
    const r = run([d, '関門の形', '--print']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\(関門の形\)/);
    assert.ok(r.stdout.includes(path.join(d, 'out')));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('promises.md か out/ が無ければ起動しない', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'duel-'));
  try {
    mkdirSync(path.join(d, 'in'));
    assert.equal(run([d, 'G', '--print']).status, 2);
    writeFileSync(path.join(d, 'in', 'promises.md'), '- P1 [A1]: x\n');
    assert.equal(run([d, 'G', '--print']).status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('関門の形が空・引数違いなら起動しない', () => {
  assert.equal(run(['/nonexistent', '  ', '--print']).status, 2);
  assert.equal(run(['/nonexistent']).status, 2);
});

test('攻め役は標準入力を閉じて起動し、終了コードをそのまま返す (偽の codex で確かめる)', () => {
  const d = mkdtempSync(path.join(tmpdir(), 'duel-'));
  try {
    mkdirSync(path.join(d, 'bin'));
    mkdirSync(path.join(d, 'run', 'in'), { recursive: true });
    mkdirSync(path.join(d, 'run', 'out'));
    writeFileSync(path.join(d, 'run', 'in', 'promises.md'), '- P1 [A1]: x\n');
    const log = path.join(d, 'log');
    writeFileSync(path.join(d, 'bin', 'codex'), `#!/bin/sh\necho "$1 $2" > "${log}"\nif read -r x; then echo open >> "${log}"; else echo closed >> "${log}"; fi\nexit 7\n`, { mode: 0o755 });
    const r = spawnSync(process.execPath, [script, path.join(d, 'run'), 'G'], {
      encoding: 'utf8',
      input: 'この入力は攻め役に届いてはいけない\n',
      env: { ...process.env, PATH: `${path.join(d, 'bin')}:${process.env.PATH}` },
    });
    assert.equal(r.status, 7, r.stderr);
    assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'), ['exec -C', 'closed']);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

function mkRun(withJudge = false) {
  const d = mkdtempSync(path.join(tmpdir(), 'duel-'));
  mkdirSync(path.join(d, 'bin'));
  mkdirSync(path.join(d, 'run', 'in'), { recursive: true });
  mkdirSync(path.join(d, 'run', 'out'));
  writeFileSync(path.join(d, 'run', 'in', 'promises.md'), '- P1 [A1]: x\n');
  if (withJudge) writeFileSync(path.join(d, 'run', 'out', 'judge.log'), 'ERROR P1: 陽性対照が通らない\n');
  return d;
}

test('--retry は直しの雛形を使い、judge.log が無ければ起動しない', () => {
  const d = mkRun();
  try {
    const run1 = path.join(d, 'run');
    assert.equal(run([run1, '--retry', '--print']).status, 2);
    writeFileSync(path.join(run1, 'out', 'judge.log'), 'ERROR P1: x\n');
    const r = run([run1, '--retry', '--print']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes(path.join(run1, 'out', 'judge.log')));
    assert.match(r.stdout, /手筋を減らさない/);
    assert.equal(run([run1, 'G', '--retry', '--print']).status, 2);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('直しの雛形は 書く場所の限定・約束を変えない・判定と終了コードを保つ を持つ', () => {
  const t = readFileSync(path.join(skill, 'scripts', 'attack-retry.txt'), 'utf8');
  for (const w of ['{{RUN}}/out/ 以外には書かない', '約束', '変えない', '試す手筋を減らさない', '0 以外の終了', '陽性対照']) assert.ok(t.includes(w), `直しの雛形に無い: ${w}`);
});

function fakeRun(d, script) {
  writeFileSync(path.join(d, 'bin', 'codex'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return spawnSync(process.execPath, [path.join(skill, 'scripts', 'run-attacker.mjs'), path.join(d, 'run'), 'G'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${path.join(d, 'bin')}:${process.env.PATH}` },
  });
}

test('攻め役が out/ の外に書いたら、名指しして 3 で終わる', () => {
  const d = mkRun();
  try {
    const r = fakeRun(d, `echo x > "${path.join(d, 'run', 'DECISIONS.md')}"; echo y > "${path.join(d, 'run', 'out', 'attack_P1.mjs')}"; exit 0`);
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /DECISIONS\.md/);
    assert.doesNotMatch(r.stderr, /attack_P1/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('攻め役が out/ の中だけに書いたら 0 のまま', () => {
  const d = mkRun();
  try {
    const r = fakeRun(d, `echo y > "${path.join(d, 'run', 'out', 'attack_P1.mjs')}"; exit 0`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, '');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
