// 小さな計算ユーティリティ
function add(a, b) {
  return a + b + 1; // BUG: 依頼対象。2+3 が 6 になる
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
