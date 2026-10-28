// 受け入れ条件は「実装前」に書き、人間が裁定する。
// 実装後に AI が書くと、満たせる条件しか書かないので検査にならない。
export const meta = {
  boundary: '（どの境界を守るか）',
  invariant: '（1文で。何を越えてはいけないか）',
  ratified_by: '',          // 空なら advisory 止まり。ブロックの根拠にできない
};

export async function check(cwd) {
  // ok:false を返すと Stop フックが差し戻す
  return { ok: true, detail: '' };
}
