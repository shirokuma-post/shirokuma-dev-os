#!/usr/bin/env node
// ⑤ Prevent ＋ ⑥ Learn を 1 本の Stop フックに統合。
// 分けると互いのループ抑制が干渉して暴走する（実測: 同一セッションで7回追記された）。
//
// 判定は四値。
//   PASS        受け入れ条件を全て満たした
//   FAIL        満たしていない → 差し戻す
//   INVALID     検査自体が走らなかった → 止めない・緑とも言わせない
//   UNSPECIFIED 受け入れ条件が定義されていない → 止めない・**緑と言わせない**
//
// 今回の失敗の教訓: プロジェクト自身のテストに委ねると、そのテストの不十分さを継承する。
// 実測では 7/8 の機能を捨てた実装が typecheck も test も緑で通った。
import { readFileSync, existsSync, readdirSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const out = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };
let input = {}; try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { out({}); }
if (process.env.SHIROKUMA_DEVOS === 'off') out({});

const cwd = input.cwd || process.cwd();
const sid = String(input.session_id || 'x').slice(0, 8);
const msg = String(input.last_assistant_message ?? '');
const dir = join(cwd, '.claude/.devos');
const cf = join(dir, `${sid}.json`);
let st = { blocks: 0, harvested: false };
try { if (existsSync(cf)) st = { ...st, ...JSON.parse(readFileSync(cf, 'utf8')) }; } catch {}
const save = () => { try { mkdirSync(dir, { recursive: true }); writeFileSync(cf, JSON.stringify(st)); } catch {} };

let cfg = { command: null, maxBlocks: 3 };
try { cfg = { ...cfg, ...JSON.parse(readFileSync(join(cwd, '.claude/devos.json'), 'utf8')) }; } catch {}

// ── ④ 受け入れ条件 ─────────────────────────────
// .claude/invariants/*.mjs  各ファイルは export function check(cwd) -> {ok, detail}
const invDir = join(cwd, '.claude/invariants');
let invFiles = [];
try { invFiles = readdirSync(invDir).filter((f) => f.endsWith('.mjs')); } catch {}

const failures = [];
let ranAnything = false;

for (const f of invFiles) {
  try {
    const m = await import(join(invDir, f));
    const r = await m.check(cwd);
    ranAnything = true;
    if (!r?.ok) failures.push(`${f}: ${r?.detail ?? '不合格'}`);
  } catch (e) {
    failures.push(`${f}: 検査を実行できません（${String(e.message).slice(0, 80)}）`);
  }
}

// 検査時間を測る。毎ターン走るので、重い command は実用性を殺す。
let gateMs = 0;
if (cfg.command) {
  const t0 = Date.now();
  try { execSync(cfg.command, { cwd, stdio: 'pipe', timeout: (cfg.timeoutSec ?? 120) * 1000 }); ranAnything = true; }
  catch (e) {
    const c = String(e.stdout || '') + String(e.stderr || '');
    if (/command not found|ENOENT|Missing script|ETIMEDOUT/i.test(c)) { /* INVALID: 数えない */ }
    else { ranAnything = true; failures.push(`${cfg.command}:\n${c.slice(-800)}`); }
  }
  gateMs = Date.now() - t0;
}
const slowWarning = gateMs > (cfg.warnSec ?? 30) * 1000
  ? `\n\n⚠ 品質ゲートに ${Math.round(gateMs / 1000)} 秒かかっています（応答のたびに走ります）。`
    + `\`.claude/devos.json\` の \`command\` を軽いもの（型チェックのみ等）に絞ることを検討してください。`
  : '';

// ── ⑥' 手順の回収（1 セッション 1 回だけ）────────────
// 自己改善の裁定ゲート: 生成は AI・権限は人間。adopted になるまで注入されない。
const harvestPlays = () => {
  if (st.playsHarvested) return 0;
  const lines = msg.split('\n');
  const picked = [];
  let cap = false;
  for (const raw of lines) {
    const line = raw.trim().replace(/\*\*/g, '').replace(/^[-*・]\s*/, '');
    // 行頭一致のみ（実測 2026-07-21: 本文中の言及だけで発火し、機能説明の断片が手順として混入した）
    if (/^再利用できそうな手順/.test(line)) { cap = true; continue; }
    if (!cap) continue;
    if (/^#{1,4}\s/.test(line) || /判断が要った/.test(line)) break;
    if (/(受け入れ条件が未定義|検証されて(いない|いません)|\bnot verified\b|^なし$)/i.test(line)) break;
    if (line.length > 10 && !/^\(|^（/.test(line)) picked.push(line);
    if (picked.length >= 3) break;
  }
  if (!picked.length) return 0;
  const file = join(cwd, 'PLAYBOOK.md');
  if (!existsSync(file)) writeFileSync(file,
    '# 手順書\n\n> `status: candidate` はまだ誰も承認していない。\n'
    + '> 承認して `adopted` にした手順だけが、以後のセッションに注入される。\n'
    + '> 生成は AI・権限は人間（自己改善は裁定を経て初めて資産になる）。\n'
    + '> 裁定の提示は DECISIONS.md と同じ形式（1 件ずつ・平易な帰結文・はい/いいえ/保留）。\n');
  let taskLine = '';
  try { taskLine = readFileSync(join(dir, `${sid}.task`), 'utf8').trim(); } catch {}
  appendFileSync(file, `\n## ${sid}\n\n`
    + (taskLine ? `> 依頼: ${taskLine}\n\n` : '')
    + picked.map((p) => `- ${p}\n  - status: candidate\n  - ratified_by: （未裁定）\n`).join(''));
  st.playsHarvested = true; save();
  return picked.length;
};

// ── ⑥ 判断の回収（1 セッション 1 回だけ）────────────
const harvest = () => {
  harvestPlays();
  if (st.harvested) return 0;
  const lines = msg.split('\n');
  const picked = [];
  let cap = false;
  for (const raw of lines) {
    const line = raw.trim().replace(/\*\*/g, '').replace(/^[-*・]\s*/, '');
    // 行頭一致のみ（本文中の言及での誤発火を防ぐ・手順回収と同じ欠陥クラス）
    if (/^(判断が要った|設計判断|決めた点|前提を置)/.test(line)) { cap = true; continue; }
    if (!cap) continue;
    if (/^#{1,4}\s/.test(line)) break;
    // 手順セクションは判断ではない（別ファイルへ回収する）
    if (/再利用できそうな手順/.test(line)) break;
    // 開示文は判断ではない（実測 2026-07-21: 末尾の未検証開示が candidate に混入した）
    if (/(受け入れ条件が未定義|検証されて(いない|いません)|\bnot verified\b)/i.test(line)) break;
    if (line.length > 10 && !/^\(|^（/.test(line)) picked.push(line);
    if (picked.length >= 5) break;
  }
  if (!picked.length) return 0;
  const file = join(cwd, 'DECISIONS.md');
  if (!existsSync(file)) writeFileSync(file,
    '# 決定記録\n\n> `status: candidate` はまだ誰も承認していない。\n'
    + '> 承認・訂正して `adopted` にしたものだけが、以後の検査の根拠になる。\n'
    + '>\n'
    + '> **裁定を頼まれた AI へ**（実測 2026-07-21: 工程用語の一括提示は非エンジニアには裁定不能）:\n'
    + '> 1. まず候補を二分する。**その作業限りの解釈**（この依頼をこう読んだ等）は裁定にかけず\n'
    + '>    `status: task-local`（裁定不要・記録のみ）に畳む。**今後すべてに効く普遍ルール**だけを裁定にかける\n'
    + '> 2. 提示は 1 件ずつ・工程用語なしの「今後 AI はこうします」という帰結の平易文で、\n'
    + '>    「> 依頼:」の文脈（どの作業での判断か）を必ず添える\n'
    + '> 3. 推奨を明示して「はい（推奨）/ いいえ / 保留」の三択にする。保留は削除しない\n');
  let taskLine = '';
  try { taskLine = readFileSync(join(dir, `${sid}.task`), 'utf8').trim(); } catch {}
  appendFileSync(file, `\n## ${sid}\n\n`
    + (taskLine ? `> 依頼: ${taskLine}\n\n` : '')
    + picked.map((p) => `- ${p}\n  - status: candidate\n  - ratified_by: （未裁定）\n`).join(''));
  st.harvested = true; save();
  return picked.length;
};

// ── Claim Integrity ─────────────────────────────
// 完了主張の強さが、実際に存在する証拠の強さを超えていないか。
// 分散ゼロは主成果ではない（悪い状態に安定していても分散は 0 になる）。
// 見るべきは「根拠以上のことを保証していないか」。
// 事実の報告と、範囲を伴う主張を分ける。
// 「npm run typecheck: 通過」は検査対象を特定した事実 → 読み手が範囲を判断できる → C1
// 「テストが通ったので問題ありません」は範囲が無限に読める主張 → C2/C3
// 実測の反省: この区別が無いと、正直な報告まで差し戻して 3 回空転させた。
const SPECIFIC = /(npm |yarn |pnpm |tsc|jest|vitest|pytest|`[^`]+`\s*[:：])/;
// 引用は主張ではない（実測 2026-07-21: 誤検知の発火語を引用した報告が再ブロックされ、書き直しが空転した）。
// 主張判定の前に 「」『』・backtick 内を除去する。SPECIFIC だけは原文を見る（`cmd`: 形式の事実表記を拾うため）。
const QUOTED = /「[^」]*」|『[^』]*』|`[^`]*`/g;
// 「〜のが安全です」等の推奨表現は、成果物への保証ではない（実測 2026-07-21: 委ね先の推奨で C3 誤判定）。
const C3 = /(問題ありません|問題なし|(?<!のが|ほうが|方が)安全です|保証します|万全)|(\bno issues\b|\ball (tests|checks) pass|\bfully (working|verified)|\bis safe\b|\bguarantee)/i;
const C3b = /(完了しました|完了です|全て通りました|すべて通りました)|(\b(all )?done\b|\bcompleted?\b|\beverything (works|passes))/i;
const C2 = /(動作を確認しました|検証しました|確認済みです|問題なく動作)|(\bverified\b|\bconfirmed working\b|\btested and working\b|\bvalidated\b)/i;
const C1 = /(実装しました|修正しました|作成しました|変更しました|通過|通りました)|(\bimplemented\b|\bfixed\b|\bcreated\b|\bupdated\b|\bpassed\b)/i;
const claimLevel = () => {
  const t = msg.replace(QUOTED, '');
  if (C3.test(t)) return 3;
  if (C3b.test(t)) return 3;
  // 一般的な検証主張。ただし検査対象を明示していれば事実として扱う
  if (C2.test(t) && !SPECIFIC.test(msg)) return 2;
  if (C1.test(t)) return 1;
  return 0;
};
const LADDER = ['未検証', 'プロジェクトのテストのみ', '裁定済み受け入れ条件で検証済み'];
const claimIntegrity = (evidence) => {
  const c = claimLevel();
  const allowed = evidence >= 2 ? 3 : evidence === 1 ? 1 : 1;   // E1 でも「検証済み」は名乗れない
  if (c <= allowed) return null;
  return `【Claim Integrity 違反】報告の主張が、存在する証拠より強すぎます。\n`
    + `- 証拠の強さ: E${evidence}（${LADDER[evidence]}）\n`
    + `- 主張の強さ: C${c}\n`
    + `この証拠で名乗れるのは C${allowed} までです。`
    + `「実装した」とは言えますが、「検証した」「完了した」とは言えません。\n`
    + `報告を書き直してください。何を確認し、何を確認していないかを分けて書くこと。`;
};

// 「過大な主張を止める」と「正しい開示をさせる」は別物。
// 実測: 抑止は 3/3 効いたが、開示は 1/3 しか出なかった（残り2件は無言で終了）。
// 無言は嘘ではないが、非エンジニアは未検証だと気づけない。よって開示も block で強制する。
const DISCLOSED = /(未検証|検証されて(いない|いません)|受け入れ条件が(未定義|ありません|ない)|保証(できません|していません|されていません)|確認できていません)|(\bnot verified\b|\bunverified\b|\bno acceptance criteria\b|\bcannot guarantee\b|\bnot confirmed\b)/i;
// 開示の強制は 1 プロジェクト 1 回だけ。毎ターン差し戻すと恒久的な税になる。
// 2 回目以降は block せず、文脈で伝えるにとどめる。
const askedFlag = join(dir, 'disclosure-asked');
const needDisclosure = (evidence) => {
  if (evidence >= 2) return null;
  if (DISCLOSED.test(msg)) return null;
  if (claimLevel() === 0 && msg.length < 40) return null;   // 何も報告していないなら求めない
  if (existsSync(askedFlag)) return null;                   // 一度教えたら以後は求めない
  try { mkdirSync(dir, { recursive: true }); writeFileSync(askedFlag, '1'); } catch {}
  return `報告に「検証されていない」という事実が書かれていません。\n`
    + `証拠の強さは E${evidence}（${LADDER[evidence]}）です。\n`
    + `報告の最後に、次の趣旨を必ず1行入れてください。\n`
    + `「受け入れ条件が未定義のため、仕様を満たしているかは検証されていません」\n（英語なら: "Not verified — no acceptance criteria are defined."）\n`
    + `嘘をつかないだけでは足りません。**読み手が未検証だと分かる形で書いてください。**`;
};

// ── 報告形式の検査（判断欄の欠落）─────────────────
// 回収の空振りは静かな失敗（見出しが崩れて回収ゼロでも誰も気づかない）。
// 実質的な作業報告なのに「判断が要った点」欄が無ければ、1 セッション 1 回だけ差し戻す。
// 弱いモデルほど形式を省略する（実測 9-1: 開示は指示だけで 1/3・block で 3/3）。
const hasJudgmentSection = () => msg.split('\n').some((raw) => {
  const line = raw.trim().replace(/\*\*/g, '').replace(/^[-*・#\s]+/, '');
  return /^(判断が要った|設計判断|決めた点|前提を置)/.test(line);
});
const needFormat = () => {
  if (st.formatAsked) return null;
  if (msg.length < 120 || claimLevel() === 0) return null;   // 短い返答・作業報告でないものは対象外（日本語 120 字 ≈ 実質的な報告の下限）
  if (hasJudgmentSection()) return null;
  st.formatAsked = true; save();
  return `報告に「**判断が要った点**」の欄がありません（無い場合も「なし」と書く決まりです）。\n`
    + `この欄が無いと、あなたの判断は記録されず、次のセッションに引き継がれません。\n`
    + `報告の形式: ①結果 ②判断が要った点（無ければ「なし」） ③締めは次のアクション。`;
};

// ── 責任境界の受け渡し（E5 契約・2026-07-21）───────────
// 実行制御層（Windshield 等）が読む機械可読の判定。契約は AIOM pj/scratchpad/E5-CONTRACT.md。
// 生成は dev-os のみ・一方向。実行時状態なので git 管理しない。
const writeVerdict = (verdict, evidence) => {
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'verdict.json'), JSON.stringify({
      verdict, evidence,
      failures: failures.map((f) => String(f).slice(0, 200)),
      invariants: invFiles.length,
      session: sid,
      at: new Date().toISOString(),
    }, null, 2));
  } catch {}
};

// ── 判定 ────────────────────────────────────
if (!ranAnything) {
  writeVerdict(invFiles.length > 0 || !!cfg.command ? "INVALID" : "UNSPECIFIED", 0);
  harvest();
  const ci = claimIntegrity(0) || needDisclosure(0) || needFormat();
  if (ci && st.blocks < cfg.maxBlocks) { st.blocks += 1; save(); out({ decision: "block", reason: ci }); }
  // INVALID の注意喚起は 1 セッション 1 回だけ。
  // 毎ターン付けると、開示済みの応答にも警告が乗り続け、harness 側で応答ループを誘発する（2026-07-21 実測）。
  if (st.invalidTold) out(slowWarning
    ? { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: slowWarning.trim() } } : {});
  st.invalidTold = true; save();
  // 設定ゼロ（invariants なし・command なし）は「検査が走らなかった」ではなく「条件が未定義」＝ UNSPECIFIED。
  // 従来はここで INVALID と誤表示され、下方の UNSPECIFIED 分岐は設定ゼロでは到達不能だった（2026-07-21）。
  const configured = invFiles.length > 0 || !!cfg.command;
  out({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
    (configured
      ? '【品質ゲート: INVALID】検査を1つも実行できませんでした。'
        + (failures.length ? `\n${failures.join('\n')}\n` : '')
      : '【品質ゲート: UNSPECIFIED】受け入れ条件が定義されていません（`.claude/invariants/` なし・`devos.json` の command なし）。')
    + '**「通りました」「完了しました」と報告しないでください。**検証されていない状態です。'
    + '（開示は初回のみフル文。以後は「（未検証）」の短い印で足ります）' + slowWarning } });
}

if (failures.length && st.blocks < cfg.maxBlocks) {
  writeVerdict("FAIL", invFiles.length ? 2 : 1);
  st.blocks += 1; save();
  out({ decision: 'block', reason:
    `受け入れ条件が満たされていません（${st.blocks}/${cfg.maxBlocks} 回目）。\n\n`
    + failures.join('\n\n') + '\n\n'
    + '検査を「消す」「回避する」「対象を減らす」のではなく、条件を満たす実装にしてください。'
    + '解けない場合は、解けないと報告してください。' });
}

if (failures.length) {
  writeVerdict("FAIL", invFiles.length ? 2 : 1);
  harvest();
  out({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
    `【品質ゲート: FAIL（差し戻し上限）】まだ満たされていない条件があります。\n${failures.join('\n')}\n`
    + '**「完了しました」と報告しないでください。**どこまでやって何が残っているかを報告してください。' + slowWarning } });
}

// 全て通った。ただし受け入れ条件が1つも無いなら「検証済み」とは言わせない。
const n = harvest();
if (invFiles.length === 0) {
  writeVerdict("UNSPECIFIED", 1);
  const ci = claimIntegrity(1) || needDisclosure(1) || needFormat();
  if (ci && st.blocks < cfg.maxBlocks) { st.blocks += 1; save(); out({ decision: "block", reason: ci }); }
  out({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
    '【品質ゲート: UNSPECIFIED】`.claude/invariants/` に受け入れ条件が1件もありません。'
    + 'プロジェクトのテストは通りましたが、**それが仕様を満たす証拠にはなりません**。'
    + '報告には「受け入れ条件が未定義のため、検証されていない」と明記してください。'
    + (n ? `\n判断 ${n} 件を DECISIONS.md に candidate として記録しました。` : '') + slowWarning } });
}
writeVerdict("PASS", 2);
{
  const fi = needFormat();
  if (fi && st.blocks < cfg.maxBlocks) { st.blocks += 1; save(); out({ decision: 'block', reason: fi }); }
}
out(n ? { hookSpecificOutput: { hookEventName: 'Stop', additionalContext:
  `【品質ゲート: PASS】受け入れ条件 ${invFiles.length} 件すべて合格。`
  + `判断 ${n} 件を DECISIONS.md に candidate として記録しました。裁定をお願いします。` + slowWarning } }
  : (slowWarning ? { hookSpecificOutput: { hookEventName: 'Stop', additionalContext: slowWarning.trim() } } : {}));
