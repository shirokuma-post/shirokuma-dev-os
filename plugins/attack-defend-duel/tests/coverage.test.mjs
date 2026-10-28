import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../skills/attack-defend-duel/scripts/coverage.mjs', import.meta.url));
const catalog = '- A1 first\n- A2 second\n- A3 third\n- A4 fourth\n- A5 fifth\n- A6 sixth';
function run(t, promises, logs = [''], options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'duel-coverage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const save = (name, body) => { const path = join(dir, name); writeFileSync(path, body); return path; };
  const args = [save('promises.md', promises), ...logs.map((log, i) => save(`${i}.log`, log))];
  if (!options.defaultCatalog) args.push('--catalog', save('catalog.md', options.catalog ?? catalog));
  args.push(...(options.args ?? []));
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return result;
}
const row = (output, id) => output.split('\n').find((line) => line.startsWith(`| ${id} |`));

for (const [name, log, state, code] of [
  ['broken', 'BROKEN P1: leak', 'BROKEN', 1],
  ['error', 'ERROR P1: bad setup', 'ERROR', 1],
  ['inconclusive', 'INCONCLUSIVE P1: missing seed', 'INCONCLUSIVE', 0],
  ['held with control', 'HELD P1\nCONTROL P1: OK', 'HELD', 0],
  ['held without control', 'HELD P1', 'INCONCLUSIVE', 0],
  ['no output', 'ordinary output', 'UNTESTED', 0],
  ['only control', 'CONTROL P1: OK', 'UNTESTED', 0],
  ['broken beats all', 'CONTROL P1: OK\nHELD P1\nERROR P1: fail\nINCONCLUSIVE P1: unsure\nBROKEN P1: leak', 'BROKEN', 1],
  ['error beats inconclusive', 'CONTROL P1: OK\nHELD P1\nERROR P1: fail\nINCONCLUSIVE P1: unsure', 'ERROR', 1],
  ['inconclusive beats held', 'CONTROL P1: OK\nINCONCLUSIVE P1: unsure\nHELD P1', 'INCONCLUSIVE', 0],
]) {
  test(name, (t) => {
    const result = run(t, '- P1 [A1]: promise', [log]);
    assert.equal(result.status, code, result.stderr);
    assert.match(row(result.stdout, 'P1'), new RegExp(` ${state}（`));
    if (name === 'held without control') assert.match(result.stdout, /陽性対照なし/);
  });
}

test('all five catalog states and two Markdown tables', (t) => {
  const result = run(t, '- P1 [A1]: one\n- P2 [A2]: two\n- P3 [A3]: three\n- 当てはまらない [A5]: no logging', ['CONTROL P1: OK\nHELD P1\nBROKEN P2: leak\nERROR P3: setup']);
  assert.equal(result.status, 1);
  for (const [id, state] of [['A1', '確かめた'], ['A2', '破れた'], ['A3', '判定不能'], ['A4', '試していない'], ['A5', '当てはまらない']]) assert.ok(row(result.stdout, id).includes(state));
  assert.match(row(result.stdout, 'A5'), /no logging/);
  assert.equal(result.stdout.split('\n').filter((line) => line.startsWith('| ---')).length, 2);
});

test('prefixes, CRLF, several files, controls across files, multiple mappings', (t) => {
  const result = run(t, '# prerequisites\nThe roles are seeded.\n- P1 [A1, A2]: promise', ['psql:file.sql:12: NOTICE: HELD P1\r\n', '2026 INFO CONTROL P1: OK\n']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(row(result.stdout, 'P1'), / HELD（/);
  assert.match(row(result.stdout, 'A2'), /確かめた/);
});

test('catalog aggregates every linked promise, including missing evidence', (t) => {
  for (const [log, expected] of [['', '試していない'], ['INCONCLUSIVE P2: unknown', '判定不能'], ['ERROR P2: bad', '判定不能'], ['BROKEN P2: leak', '破れた']]) {
    const result = run(t, '- P1 [A1]: first\n- P2 [A1]: second', [`CONTROL P1: OK\nHELD P1\n${log}`]);
    assert.ok(row(result.stdout, 'A1').includes(expected));
  }
});

test('default catalog is resolved relative to script', (t) => {
  const result = run(t, '- P1 [A1,C2]: promise', ['CONTROL P1: OK\nHELD P1'], { defaultCatalog: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(row(result.stdout, 'F3'), /試していない/);
});

test('only non-applicable items is valid', (t) => {
  const result = run(t, '- 当てはまらない [A1,A2]: absent');
  assert.equal(result.status, 0, result.stderr);
  assert.match(row(result.stdout, 'A1'), /当てはまらない/);
});

for (const promises of [
  '', '- P1: missing mapping', '- P0 [A1]: zero', '- P1 []: empty',
  '- P1 [A1]: ', '- P1 [Z9]: unknown', '- P1 [A1,A1]: duplicate',
  '- P1 [A1]: one\n- P1 [A2]: two', '- P1 [A1]: one\n- 当てはまらない [A1]: no',
  '- 当てはまらない [A1]: ', '- 当てはまらない [A1]: no\n- 当てはまらない [A1]: no',
  'P1 [A1]: missing bullet', '* P1 [A1]: wrong bullet', '- P1 [A1,A2,]: trailing comma',
]) test(`invalid promises: ${JSON.stringify(promises)}`, (t) => {
  const result = run(t, promises);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /入力エラー/);
  assert.equal(result.stdout, '');
});

for (const log of ['BROKEN P2: unknown', 'CONTROL P1: NO', 'ERROR P1', 'INCONCLUSIVE P1: ', 'HELD P1: why']) test(`invalid log: ${log}`, (t) => {
  assert.equal(run(t, '- P1 [A1]: promise', [log]).status, 2);
});

test('input errors: CLI, catalog and unreadable files', (t) => {
  for (const args of [[], ['a'], ['a', 'b', '--catalog'], ['a', 'b', '--wat'], ['a', 'b', '--catalog', 'c', '--catalog', 'd']]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /入力エラー/);
  }
  for (const text of ['', '- A1 one\n- A1 two']) assert.equal(run(t, '- P1 [A1]: promise', [''], { catalog: text }).status, 2);
  assert.equal(run(t, '- P1 [A1]: promise', [''], { args: ['/does-not-exist/coverage.log'] }).status, 2);
});

test('Markdown cell contents are escaped', (t) => {
  const result = run(t, '- P1 [A1]: a | b <tag>', ['BROKEN P1: x | y']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /a &#124; b &lt;tag&gt;/);
  assert.match(result.stdout, /x &#124; y/);
});

// 2026-10-20: 一覧の file の ``` で囲んだ見本 (- P1 [A1,A4]: ...) を一覧の項目として拾っていた
test('fenced example in the catalog is not read as catalog items', (t) => {
  const withExample = catalog + '\n\n```markdown\n- P1 [A1]: example\n- P2 [A2]: example\n```\n- A7 after fence';
  const result = run(t, '- P1 [A1]: promise', ['CONTROL P1: OK\nHELD P1'], { catalog: withExample });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(row(result.stdout.split('\n\n')[1], 'P1'), undefined);
  assert.equal(row(result.stdout.split('\n\n')[1], 'P2'), undefined);
  assert.match(row(result.stdout, 'A7'), /試していない/);
});

test('default catalog (the real promises.md) has no P items', (t) => {
  const result = run(t, '- P1 [A1]: promise', ['CONTROL P1: OK\nHELD P1'], { defaultCatalog: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(row(result.stdout.split('\n\n')[1], 'P1'), undefined);
});

test('一覧の番号の無い古い形の約束は、[ ] を付けるよう言って 2 で止まる', (t) => {
  const result = run(t, '- P1: 他テナントの行は見えない');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /1行: 書式が不正です — 一覧の番号が無い/);
  assert.match(result.stderr, /- P1 \[A1,A4\]/);
});
test('それ以外の書式の誤りは、正しい形を示して 2 で止まる', (t) => {
  const result = run(t, '- P1 A1: 括弧が無い');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /`- P<番号> \[一覧の番号,…\]: 約束`/);
  assert.doesNotMatch(result.stderr, /一覧の番号が無い/);
});
