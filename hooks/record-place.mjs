// 記録（DECISIONS.md / PLAYBOOK.md）の置き場所と、追記の仕方。
//
// 実測（2026-10-28）: Claude Code は作業ごとに git worktree（例 <repo>/.claude/worktrees/<name>/）を作る。
// 従来は cwd = worktree の DECISIONS.md に追記していたため、
//   - 追記はどの worktree でも commit されず、worktree を撤去すると記録ごと消える
//   - 終わった worktree が「未取り込みの変更あり」に見え続ける（ある repo では取り込み待ち 22 件中 8 件が、
//     残っていたのはこの追記だけだった）。人が手で拾い集めていた
// よって、worktree で動いた時だけ、記録は repo の本体の checkout（git が最初に作った作業ツリー）へ書く。
// worktree でない時（本体の checkout・git 管理外・bare など本体の無い repo）は、従来どおり cwd に書く。
//
// 依存: node 標準ライブラリと git コマンドのみ。git が無い・失敗した時は黙って cwd に戻る（記録を止めない）。
import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync, statSync, openSync, writeSync, closeSync, readFileSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { join, resolve, relative, isAbsolute, basename, dirname } from 'node:path';

// フックが git の中から呼ばれた時の環境変数（GIT_DIR 等）に引きずられて別の repo を見ないよう外す
const gitEnv = () => {
  const env = { ...process.env };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
  return env;
};
// 出力の相対パスは git を走らせた場所（-C の先）からの相対なので、そこを基点に絶対化する
const git = (at, args) => {
  const out = execFileSync('git', ['-C', at, ...args], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000, env: gitEnv() })
    .toString().replace(/\r?\n$/, '');
  return out;
};
const gitPath = (at, args) => realpathSync(resolve(at, git(at, args)));
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// 本体の checkout を返す。見つからない・確かめられない時は null
function primaryCheckout(commonDir) {
  // bare repo の worktree には本体の作業ツリーが無い → 従来どおり
  try { if (git(commonDir, ['rev-parse', '--is-bare-repository']) === 'true') return null; } catch { return null; }
  let cand = null;
  // submodule は common dir（<上位>/.git/modules/<名前>）に core.worktree を持つので、git に解かせる
  try { cand = gitPath(commonDir, ['rev-parse', '--show-toplevel']); } catch {}
  // 通常の repo は <本体>/.git が common dir
  if (!cand && basename(commonDir) === '.git') cand = dirname(commonDir);
  if (!cand || !isDir(cand)) return null;
  // 確かめる: 候補が本当に同じ repo の本体か（common dir が一致し、linked worktree でない）
  try {
    const cCommon = gitPath(cand, ['rev-parse', '--git-common-dir']);
    const cGit = gitPath(cand, ['rev-parse', '--git-dir']);
    if (cCommon !== commonDir || cGit !== commonDir) return null;
    return realpathSync(cand);
  } catch { return null; }
}

/**
 * 記録を書く/読むディレクトリ。
 * @returns {{ dir: string, redirected: boolean }} redirected = worktree から本体の checkout へ振り替えた
 */
export function recordPlace(cwd) {
  const keep = { dir: cwd, redirected: false };
  try {
    const gitDir = gitPath(cwd, ['rev-parse', '--git-dir']);
    const commonDir = gitPath(cwd, ['rev-parse', '--git-common-dir']);
    if (gitDir === commonDir) return keep;   // 本体の checkout（submodule の本体も含む）= 従来どおり
    const top = gitPath(cwd, ['rev-parse', '--show-toplevel']);
    const main = primaryCheckout(commonDir);
    if (!main || main === top) return keep;
    // worktree の中の下位ディレクトリで動いていたら、本体側の同じ下位ディレクトリへ（無ければ本体の直下）
    let rel = '';
    try { rel = relative(top, realpathSync(cwd)); } catch {}
    if (!rel || rel.startsWith('..') || isAbsolute(rel)) rel = '';
    const sub = rel ? join(main, rel) : main;
    return { dir: isDir(sub) ? sub : main, redirected: true };
  } catch { return keep; }
}

/**
 * 1 セッション分の記録（`## <id>` で始まる塊）を足す。複数のセッションが同時に書いても壊さない。
 * - 無い時: 見出しだけの一時ファイルを書いてから link で置く。link は「既にあれば失敗」の 1 手なので、
 *   作成の競合で他の塊を消さず、見出しは必ず先頭に 1 回だけ（実測: O_EXCL で作って書く 2 手だと、
 *   作った直後・書く前に他のセッションの塊が先に入り、見出しが途中に来た）
 * - 塊は O_APPEND で開いて 1 回の write = 互いの塊を上書きしない・混ざらない
 * - 同じ `## <id>` が既にあれば足さない（状態ファイルが消えても二重に書かない）
 * @returns {boolean} 足したか
 */
export function appendRecord(file, header, sid, block) {
  if (!existsSync(file)) {
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(tmp, header, { flag: 'wx' });
      try { linkSync(tmp, file); } catch (e) {
        if (e?.code === 'EEXIST') { /* 他のセッションが先に作った */ }
        // link の使えないファイルシステム: 追記モードで排他作成（見出しの位置は崩れうるが、塊は消さない）
        else try { writeFileSync(file, header, { flag: 'ax' }); } catch (e2) { if (e2?.code !== 'EEXIST') throw e2; }
      }
    } finally { try { unlinkSync(tmp); } catch {} }
  }
  try { if (readFileSync(file, 'utf8').includes(`\n## ${sid}\n`)) return false; } catch {}
  const fd = openSync(file, 'a');
  try { writeAll(fd, block); } finally { closeSync(fd); }
  return true;
}
function writeAll(fd, s) {
  const buf = Buffer.from(s, 'utf8');
  let off = 0;
  while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
}
