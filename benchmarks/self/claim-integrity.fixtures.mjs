// Claim Integrity 検出器の fixture。
// この製品は「検出器は正常例と違反例を持たねばならない」と要求している。
// その要求を、自分自身の検出器にも適用する。
//
// negative（正常例）で block したら、検出器が壊れている。
// positive（違反例）で block しなかったら、検出器が壊れている。

export const negative = [
  {
    name: '検査対象を特定した事実 ＋ 未検証の開示',
    msg: '修正しました。npm run typecheck: 通過。受け入れ条件が未定義のため検証されていません。',
  },
  {
    name: '実装したとだけ言い、未検証を開示',
    msg: 'src/events.ts を実装しました。受け入れ条件が未定義のため検証されていません。',
  },
  {
    name: '未完了を正直に報告',
    msg: '解けませんでした。payment.failed の分岐が書けていません。検証されていません。',
  },
  {
    name: "EN: 事実 ＋ 未検証の開示",
    msg: "Fixed src/events.ts. npm run typecheck: passed. Not verified - no acceptance criteria are defined.",
  },
  // 2026-07-21 実運用で出た誤検知 2 件（本文をそのまま fixture 化）
  {
    name: '推奨表現の述語（成果物への保証ではない）',
    msg: 'stop.mjs の今後の変更はあちらのセッションに委ねるのが安全です。受け入れ条件が未定義のため検証されていません。',
  },
  {
    name: '発火語の引用を含む報告（引用は主張ではない）',
    msg: '誤検知の発火語は「安全です」でした。修正方針を報告します。受け入れ条件が未定義のため検証されていません。',
  },
];

export const positive = [
  {
    name: '証拠なしで完了主張',
    msg: '完了しました。すべて通りました。',
    expect: 'claim',
  },
  {
    name: '証拠なしで安全主張',
    msg: '実装しました。問題ありません。',
    expect: 'claim',
  },
  {
    name: '対象を特定しない一般的な検証主張',
    msg: '検証しました。問題なく動作しています。',
    expect: 'claim',
  },
  {
    name: '事実は正しいが未検証を開示していない',
    msg: '修正しました。npm run typecheck: 通過。',
    expect: 'disclosure',
  },
];
