// 記録の置き場所の自己検査（2026-10-28）。
// 実測: git worktree で動いたセッションの判断が worktree 側の DECISIONS.md に追記され、
// commit されないまま worktree の撤去で消える・終わった worktree が「未取り込みの変更あり」に見え続けていた。
// ここで確かめること:
//   ① worktree で回収した記録は repo の本体の checkout に入り、worktree には差分を残さない
//   ② 2 つの worktree から同時に書いても、どの記録も欠けず・混ざらず・見出しは 1 回だけ
//   ③ worktree を撤去しても記録は残る
//   ④ worktree でない時（本体の checkout の下位ディレクトリ・bare repo の worktree・submodule の本体）は従来どおり cwd
//   ⑤ intake は同じ場所から「溜まっている数」を読む
// すべて空白を含むパスで行う（パスの扱いの破断を同時に見る）。
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_PROCS = 8;   // 同時に起動するフックの上限（共有の開発機を詰まらせない）

export async function worktreeChecks(ROOT) {
  const HOOK = join(ROOT, 'hooks/stop.mjs');
  const INTAKE = join(ROOT, 'hooks/intake.mjs');
  let pass = 0, fail = 0;
  const bad = [];
  const check = (name, ok, detail = '') => { if (ok) pass++; else { fail++; bad.push(`[記録の置き場所] ${name}${detail ? `\n  → ${detail}` : ''}`); } };

  try { execFileSync('git', ['--version'], { stdio: 'pipe' }); }
  catch { fail++; bad.push('[記録の置き場所] git が無いため検査できません（未実行）'); return { pass, fail, bad }; }

  const base = realpathSync(mkdtempSync(join(tmpdir(), 'devos wt-')));
  const stateHome = join(base, 'state home');
  const env = {
    ...process.env, DEVOS_STATE_HOME: stateHome,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(base, 'gitconfig'),
    GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid',
  };
  writeFileSync(env.GIT_CONFIG_GLOBAL, '[init]\n\tdefaultBranch = main\n[protocol "file"]\n\tallow = always\n');
  const git = (at, ...args) => execFileSync('git', ['-C', at, ...args], { stdio: 'pipe', env }).toString().trim();
  const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const report = (tag) => [
    `ヘッダーの折返しを修正しました。実行はしていません。`,
    '',
    '**判断が要った点**',
    `- 決めたこと = 折返しは wrap 指定で直した（${tag}）`,
  ].join('\n');
  const input = (cwd, sid, tag) => JSON.stringify({ session_id: sid, cwd, last_assistant_message: report(tag) });
  const stopSync = (cwd, sid, tag) => execFileSync(process.execPath, [HOOK], { input: input(cwd, sid, tag), stdio: 'pipe', env }).toString();
  const stopAsync = (cwd, sid, tag) => new Promise((res) => {
    const p = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'ignore', 'ignore'], env });
    p.on('close', (code) => res(code));
    p.stdin.end(input(cwd, sid, tag));
  });

  try {
    // repo: 本体 + worktree 2 本（Claude Code と同じ <repo>/.claude/worktrees/ の下）
    const main = join(base, 'main repo');
    mkdirSync(join(main, 'pkg a'), { recursive: true });
    git(base, 'init', '-q', main);
    writeFileSync(join(main, 'pkg a', 'x.txt'), 'x\n');
    writeFileSync(join(main, '.gitignore'), '.claude/\n');
    git(main, 'add', '-A'); git(main, 'commit', '-qm', 'init');
    const wt1 = join(main, '.claude/worktrees/lane one');
    const wt2 = join(main, '.claude/worktrees/lane two');
    git(main, 'worktree', 'add', '-q', '-b', 'l1', wt1);
    git(main, 'worktree', 'add', '-q', '-b', 'l2', wt2);

    // ① worktree → 本体の checkout
    stopSync(wt1, 'wtsolo01', 'SOLO');
    const mainDec = read(join(main, 'DECISIONS.md'));
    check('worktree の判断は本体の checkout の DECISIONS.md に入る', mainDec.includes('\n## wtsolo01\n') && mainDec.includes('SOLO'));
    check('worktree 側には DECISIONS.md を作らない', !existsSync(join(wt1, 'DECISIONS.md')));
    check('worktree に未 commit の差分を残さない', git(wt1, 'status', '--porcelain') === '', git(wt1, 'status', '--porcelain'));

    // ② 同時に書く（DECISIONS.md が無い状態から = 作成の競合も含む）
    rmSync(join(main, 'DECISIONS.md'), { force: true });
    const jobs = [];
    for (let i = 0; i < MAX_PROCS; i++) jobs.push([i % 2 ? wt2 : wt1, `par${String(i).padStart(5, '0')}`, `PAR-${i}`]);
    const codes = await Promise.all(jobs.map(([w, s, t]) => stopAsync(w, s, t)));
    const par = read(join(main, 'DECISIONS.md'));
    const missing = jobs.filter(([, s, t]) => !(par.split(`\n## ${s}\n`).length === 2 && par.includes(`（${t}）`))).map(([, s]) => s);
    check(`2 つの worktree から同時に ${MAX_PROCS} 件書いても全件が 1 回ずつ残る`, codes.every((c) => c === 0) && missing.length === 0,
      `欠け/重複: ${missing.join(', ') || 'なし'} 終了コード: ${codes.join(',')}`);
    check('同時に書いても見出しは 1 回だけ', (par.match(/^# 決定記録$/gm) || []).length === 1);
    // 塊が混ざっていない = 各塊の直後の行がその塊の判断の行
    const torn = jobs.filter(([, s, t]) => {
      const seg = par.split(`\n## ${s}\n`)[1] || '';
      return !seg.split('\n## ')[0].includes(`（${t}）`);
    }).map(([, s]) => s);
    check('同時に書いても塊どうしが混ざらない', torn.length === 0, torn.join(', '));

    // 同じセッションの記録は 2 回書かない（worktree の状態ファイルが消えても）
    rmSync(join(wt1, '.claude/.devos'), { recursive: true, force: true });
    stopSync(wt1, 'par00000', 'PAR-0');
    check('同じ ## <id> は 2 回書かない', read(join(main, 'DECISIONS.md')).split('\n## par00000\n').length === 2);

    // ⑤ intake は本体側の数を読む
    writeFileSync(join(main, 'DECISIONS.md'), read(join(main, 'DECISIONS.md')) + '\n## cand0001\n\n- 候補\n  - status: candidate\n');
    const ictx = JSON.parse(execFileSync(process.execPath, [INTAKE], { input: JSON.stringify({ cwd: wt2, session_id: 'intake01', prompt: 'テストを足して' }), stdio: 'pipe', env }).toString() || '{}')
      .hookSpecificOutput?.additionalContext ?? '';
    check('intake は worktree でも本体の checkout の候補を数える', /判断 1・/.test(ictx), ictx.match(/決めてほしいこと[^\n]*/)?.[0] ?? '（節なし）');

    // ③ worktree を撤去しても残る
    stopSync(wt2, 'wtgone01', 'GONE');
    git(main, 'worktree', 'remove', '--force', wt2);
    check('worktree を撤去しても記録は残る', !existsSync(wt2) && read(join(main, 'DECISIONS.md')).includes('（GONE）'));

    // ④-a 本体の checkout の下位ディレクトリ = 従来どおり cwd（その下位ディレクトリ）
    const sub = join(main, 'pkg a');
    stopSync(sub, 'mainsub1', 'SUBDIR');
    check('本体の checkout では従来どおり cwd に書く', read(join(sub, 'DECISIONS.md')).includes('（SUBDIR）'));
    // ④-b worktree の下位ディレクトリ → 本体の同じ下位ディレクトリ
    stopSync(join(wt1, 'pkg a'), 'wtsub001', 'WTSUB');
    check('worktree の下位ディレクトリは本体の同じ下位ディレクトリへ', read(join(sub, 'DECISIONS.md')).includes('（WTSUB）')
      && !existsSync(join(wt1, 'pkg a', 'DECISIONS.md')));

    // ④-c bare repo の worktree = 本体の作業ツリーが無いので従来どおり cwd
    const bare = join(base, 'bare repo.git');
    git(base, 'clone', '-q', '--bare', main, bare);
    const bwt = join(base, 'bare lane');
    git(bare, 'worktree', 'add', '-q', '-b', 'bl', bwt);
    stopSync(bwt, 'barewt01', 'BARE');
    check('bare repo の worktree は従来どおり cwd に書く', read(join(bwt, 'DECISIONS.md')).includes('（BARE）'));

    // ④-d submodule の本体の checkout = 従来どおり cwd（.git/modules/ の中に書かない）
    const lib = join(base, 'lib src');
    git(base, 'init', '-q', lib); git(lib, 'commit', '-q', '--allow-empty', '-m', 'l');
    git(main, 'submodule', 'add', '-q', lib, 'vendor lib');
    const sm = join(main, 'vendor lib');
    stopSync(sm, 'submod01', 'SUBMOD');
    check('submodule の本体の checkout は従来どおり cwd に書く', read(join(sm, 'DECISIONS.md')).includes('（SUBMOD）')
      && !existsSync(join(main, '.git/modules/vendor lib/DECISIONS.md')));
    // ④-e submodule の worktree → submodule の本体の checkout
    const smwt = join(base, 'lib lane');
    git(sm, 'worktree', 'add', '-q', '-b', 'sl', smwt);
    stopSync(smwt, 'submwt01', 'SUBWT');
    check('submodule の worktree は submodule の本体の checkout へ', read(join(sm, 'DECISIONS.md')).includes('（SUBWT）')
      && !existsSync(join(smwt, 'DECISIONS.md')));

    // ②' 追記そのものの競合（フックの起動のばらつきに頼らず、同じ瞬間に作成と追記をぶつける）
    //   8 プロセスが時刻を揃えて、毎回まだ無いファイルへ 1 塊ずつ書く × ROUNDS 回
    {
      const ROUNDS = 30;
      const race = join(base, 'race dir');
      mkdirSync(race);
      const worker = `
        const { appendRecord } = await import(${JSON.stringify(new URL('file://' + join(ROOT, 'hooks/record-place.mjs')).href)});
        const [dir, me, t0] = process.argv.slice(1);
        const pad = 'x'.repeat(4096);
        for (let r = 0; r < ${ROUNDS}; r++) {
          while (Date.now() < Number(t0) + r * 15) {}
          appendRecord(dir + '/r' + r + '.md', '# 見出し\\n', 'w' + me, '\\n## w' + me + '\\n\\n- ' + me + ':' + r + pad + '\\n');
        }`;
      const t0 = Date.now() + 400;
      const codes = await Promise.all(Array.from({ length: MAX_PROCS }, (_, me) => new Promise((res) => {
        const p = spawn(process.execPath, ['--input-type=module', '-e', worker, race, String(me), String(t0)], { stdio: 'ignore', env });
        p.on('close', res);
      })));
      const broken = [];
      for (let r = 0; r < ROUNDS; r++) {
        const t = read(join(race, `r${r}.md`));
        const heads = (t.match(/^# 見出し$/gm) || []).length;
        const lost = Array.from({ length: MAX_PROCS }, (_, me) => me).filter((me) => !new RegExp(`\\n## w${me}\\n\\n- ${me}:${r}x{4096}\\n`).test(t));
        if (heads !== 1 || lost.length || !t.startsWith('# 見出し\n')) broken.push(`r${r}: 見出し ${heads} 回・欠け ${lost.join(',') || 'なし'}`);
      }
      check(`同じ瞬間に ${MAX_PROCS} プロセスで作成と追記をぶつけても、見出しは先頭に 1 回・塊は全部残る（${ROUNDS} 回）`,
        codes.every((c) => c === 0) && broken.length === 0, broken.slice(0, 3).join(' / ') + ` 終了コード: ${codes.join(',')}`);
    }

    // ④-f git 管理外 = 従来どおり cwd
    const plain = join(base, 'plain dir');
    mkdirSync(plain);
    stopSync(plain, 'plain001', 'PLAIN');
    check('git 管理外は従来どおり cwd に書く', read(join(plain, 'DECISIONS.md')).includes('（PLAIN）'));
  } catch (e) {
    fail++; bad.push(`[記録の置き場所] 検査の途中で失敗: ${String(e.stderr || e.message).split('\n')[0].slice(0, 160)}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
  return { pass, fail, bad };
}
