#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const labels = { BROKEN: '破れた', ERROR: '試験が壊れた', INCONCLUSIVE: '判定不能', HELD: '確かめた', UNTESTED: '試していない' };
const priority = ['BROKEN', 'ERROR', 'INCONCLUSIVE', 'UNTESTED', 'HELD'];
const strongest = (states) => priority.find((state) => states.includes(state));
const cell = (value) => String(value).replaceAll('&', '&amp;').replaceAll('|', '&#124;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\r\n]/g, ' ');
const table = (headers, rows) => [headers, headers.map(() => '---'), ...rows].map((row) => `| ${row.map(cell).join(' | ')} |`).join('\n');

async function main(args) {
  let catalogPath = fileURLToPath(new URL('../references/promises.md', import.meta.url));
  let hasCatalog = false;
  const paths = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--catalog') {
      if (hasCatalog || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('--catalog には一覧を1本指定してください');
      hasCatalog = true;
      catalogPath = args[++i];
    } else if (args[i].startsWith('--')) throw new Error(`不明なオプション: ${args[i]}`);
    else paths.push(args[i]);
  }
  if (paths.length < 2) throw new Error('使い方: node coverage.mjs <promises.md> <試験の出力 file>... [--catalog <一覧>]');
  const [catalogText, promisesText, ...logs] = await Promise.all([catalogPath, ...paths].map((path) => readFile(path, 'utf8')));
  const catalog = new Map();
  // 一覧の file の ``` で囲んだ見本 (run の promises.md の書き方) は、一覧の項目ではないので読まない
  let fenced = false;
  for (const line of catalogText.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const match = line.match(/^\s*-\s+([A-Z][1-9]\d*)\s+(.+?)\s*$/);
    if (!match) continue;
    if (catalog.has(match[1])) throw new Error(`一覧の番号が重複: ${match[1]}`);
    catalog.set(match[1], match[2]);
  }
  if (!catalog.size) throw new Error('一覧の項目がありません');
  const promises = new Map();
  const excluded = new Map();
  for (const [index, line] of promisesText.split(/\r?\n/).entries()) {
    if (!/^\s*(?:[-*+]\s+)?(?:P\d|当てはまらない)/.test(line)) continue;
    const match = line.match(/^\s*-\s+(P[1-9]\d*|当てはまらない)\s+\[([^\]]+)\]:\s*(\S.*?)\s*$/);
    if (!match) {
      // 一覧の番号 [...] の無い古い形 (v1.2.0 より前) は、何を足せばよいかまで言う
      const hint = /^\s*-\s+(P[1-9]\d*|当てはまらない)\s*:/.test(line)
        ? '一覧の番号が無い。`- P1 [A1,A4]: …` のように、確かめる一覧の項目を [ ] で付ける (references/promises.md の「約束の書き方」)'
        : '`- P<番号> [一覧の番号,…]: 約束` か `- 当てはまらない [一覧の番号,…]: 理由` の形にする';
      throw new Error(`promises.md ${index + 1}行: 書式が不正です — ${hint}`);
    }
    const [, id, list, description] = match;
    const ids = list.split(',').map((item) => item.trim());
    if (new Set(ids).size !== ids.length) throw new Error(`${id}: 一覧の番号が重複しています`);
    for (const item of ids) if (!catalog.has(item)) throw new Error(`${id}: 未知の一覧の番号 ${item}`);
    if (id === '当てはまらない') {
      for (const item of ids) {
        if (excluded.has(item)) throw new Error(`当てはまらない項目が重複: ${item}`);
        excluded.set(item, description);
      }
    } else {
      if (promises.has(id)) throw new Error(`約束の番号が重複: ${id}`);
      promises.set(id, { ids, description, events: [], control: false });
    }
  }
  if (!promises.size && !excluded.size) throw new Error('約束も当てはまらない項目もありません');
  for (const [id, promise] of promises) {
    for (const item of promise.ids) if (excluded.has(item)) throw new Error(`${id}: ${item} は当てはまらない項目と競合しています`);
  }
  for (const log of logs) {
    for (const line of log.split(/\r?\n/)) {
      const match = line.match(/\b(CONTROL|BROKEN|ERROR|INCONCLUSIVE|HELD)\s+(P[1-9]\d*)(?=\s|:|$)(.*)$/);
      if (!match) continue;
      const [, kind, id, tail] = match;
      const promise = promises.get(id);
      if (!promise) throw new Error(`試験の出力に未知の約束: ${id}`);
      if (kind === 'CONTROL') {
        if (!/^:\s*OK\s*$/.test(tail)) throw new Error(`${id}: CONTROL の書式が不正です`);
        promise.control = true;
      } else {
        if (kind === 'HELD' ? !/^\s*$/.test(tail) : !/^:\s*\S/.test(tail)) throw new Error(`${id}: ${kind} の書式が不正です`);
        promise.events.push({ kind, reason: tail.replace(/^:\s*/, '') });
      }
    }
  }
  const rows = [];
  for (const [id, promise] of promises) {
    promise.state = strongest(promise.events.map(({ kind }) => kind === 'HELD' && !promise.control ? 'INCONCLUSIVE' : kind)) ?? 'UNTESTED';
    const reasons = promise.events.filter(({ reason }) => reason).map(({ kind, reason }) => `${kind}: ${reason}`);
    if (promise.events.some(({ kind }) => kind === 'HELD') && !promise.control) reasons.push('陽性対照なし');
    rows.push([id, promise.ids.join(','), promise.description, `${promise.state}（${labels[promise.state]}）`, promise.control ? 'OK' : 'なし', reasons.join(' / ')]);
  }
  const catalogRows = [...catalog].map(([id, description]) => {
    const linked = [...promises].filter(([, promise]) => promise.ids.includes(id));
    const state = strongest(linked.map(([, promise]) => promise.state)) ?? 'UNTESTED';
    // ERROR is a kind of inconclusive coverage, while remaining explicit per promise.
    return [id, description, excluded.has(id) ? '当てはまらない' : state === 'ERROR' ? '判定不能' : labels[state], linked.map(([key]) => key).join(','), excluded.get(id) ?? ''];
  });
  console.log(table(['約束', '一覧の項目', '内容', '判定', '陽性対照', '理由'], rows));
  console.log('\n' + table(['一覧の項目', '内容', '状態', '約束', '理由'], catalogRows));
  return [...promises.values()].some(({ events }) => events.some(({ kind }) => kind === 'BROKEN' || kind === 'ERROR')) ? 1 : 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  console.error(`入力エラー: ${error.message}`);
  process.exitCode = 2;
}
