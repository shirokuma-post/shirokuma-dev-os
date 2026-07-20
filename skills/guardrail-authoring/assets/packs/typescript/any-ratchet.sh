#!/usr/bin/env bash
# 番人: any ラチェット（失敗クラス J1）。詳細思想は ../references/type-safety-ratchet.md
# 現在の any 系「逃げ」件数が baseline を超えたら fail（増やさない止血）。減れば baseline 更新を促す。
# baseline は CI と同一コマンドで算出（乖離防止）。コピー先: checks/any-ratchet.sh
set -uo pipefail

BASELINE_FILE="checks/any-baseline.txt"   # 現在件数を記録（最初は実測値で作成）
PATTERN='(\bas\s+any\b|:\s*any\b|as\s+unknown\s+as|@ts-ignore|@ts-nocheck)'
GLOBS=("*.ts" "*.tsx")

count=$(git grep -nE "$PATTERN" -- "${GLOBS[@]}" 2>/dev/null | wc -l | tr -d ' ')
baseline=$(cat "$BASELINE_FILE" 2>/dev/null || echo "")

if [ -z "$baseline" ]; then
  echo "ℹ️ baseline 未設定。現在値 $count を $BASELINE_FILE に記録してコミットしてください:"
  echo "    echo $count > $BASELINE_FILE"
  exit 0
fi

echo "any系 escape: 現在=$count / baseline=$baseline"
if [ "$count" -gt "$baseline" ]; then
  echo "❌ J1: any系の逃げが増えました（$baseline → $count）。新規混入を禁止します。"
  echo "   正しい型 or unknown+型ガードに。撲滅手順: type-safety-ratchet.md"
  exit 1
fi
if [ "$count" -lt "$baseline" ]; then
  echo "✅ 減少。baseline を更新してロックしてください: echo $count > $BASELINE_FILE"
fi
# 0 到達コンポーネントは eslint を off→error に切替えて恒久ロック（type-safety-ratchet.md §5）
exit 0
