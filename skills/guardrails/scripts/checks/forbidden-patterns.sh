#!/usr/bin/env bash
# 番人: 禁止パターン検出（失敗クラス A6/B2/B7/H1/A4/J1）
# 使い方: bash checks/forbidden-patterns.sh [--staged]
# ERROR が1件でもあれば exit 1（CIブロック）。WARN は報告のみ（誤検出が出やすい=人がレビュー）。
#
# ※ これは「第一関門（粗いが速い）」。実コード検証で grep は誤検出が多いと判明
#   （例: "service_role を撤去済" というコメント文字列に反応／型定義/テストに反応）。
#   精密版は checks/semgrep-rules.yml（AST/データフロー）を併用すること。
# {{ }} は自プロジェクト値に置換。
set -uo pipefail

if [ "${1:-}" = "--staged" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|sql)$' || true)
else
  FILES=$(git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.sql' \
    | grep -vE '/(node_modules|migrations_archive|_archive)/' || true)
fi
[ -z "$FILES" ] && { echo "no source files"; exit 0; }

err=0; warn=0
# コメント行/型・テストを除外して行抽出（実コード検証で誤検出源だった3つを排除）
grep_code() { # grep_code <regex> [追加除外regex]
  grep -nE "$1" $FILES 2>/dev/null \
    | grep -vE ':[0-9]+:\s*(//|\*|/\*)' \
    | { [ -n "${2:-}" ] && grep -vE "$2" || cat; }
}
report() { # report <ERROR|WARN> <label> <件数> <サンプル>
  local sev="$1" label="$2" n="$3" body="$4"
  [ "$n" -eq 0 ] && return
  if [ "$sev" = ERROR ]; then echo "❌ [$label] $n 件"; err=$((err+n));
  else echo "⚠️  [$label] $n 件（要レビュー・誤検出あり得る）"; warn=$((warn+n)); fi
  echo "$body" | head -8 | sed 's/^/    /'
}

# === ERROR（ブロック）: 呼び出し/代入に限定して誤検出を抑制 ===
A6=$(grep_code 'createServiceClient\(|=\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY' '/(test|tests|__tests__)/|\.test\.|shared-types|{{lib/gateway/}}')
report ERROR "A6 service-role越境" "$(echo -n "$A6" | grep -c . || true)" "$A6"

K4=$(grep_code 'fetch\(\s*[`"'"'"']https?://[a-z0-9-]+\.{{vercel\.app}}')
report ERROR "K4 cross-component-fetch" "$(echo -n "$K4" | grep -c . || true)" "$K4"

B7=$(grep_code 'USING\s*\(\s*[Tt][Rr][Uu][Ee]\s*\)' '/(test|scripts)/')
report ERROR "B7 USING(TRUE)" "$(echo -n "$B7" | grep -c . || true)" "$B7"

# J1: 型システムの逃げは ERROR（@ts-ignore/@ts-nocheck は明確なエスケープ）
J1=$(grep_code '@ts-ignore|@ts-nocheck')
report ERROR "J1 ts-ignore" "$(echo -n "$J1" | grep -c . || true)" "$J1"

# === WARN（報告のみ）: 正規利用が多く誤検出しやすい＝人がレビュー ===
# A4: 実測で console の token/api_key は "ラベル文字列"（例: 'token refresh failed' / 'shared_api_keys query error'）
#     に反応する誤検出が多い。秘密"値"の出力かは grep では判別不能 → WARN。精密判定は semgrep。
A4=$(grep_code 'console\.(log|error)\([^)]*(token|apiKey|api_key|password|secret)')
report WARN "A4 secret-in-log(要確認)" "$(echo -n "$A4" | grep -c . || true)" "$A4"

# eslint-disable は正規利用もある（@ts-ignore と違い型システムの逃げとは限らない）→ WARN
ED=$(grep_code 'eslint-disable(-next-line)?\s')
report WARN "J1b eslint-disable(要確認)" "$(echo -n "$ED" | grep -c . || true)" "$ED"
# B2: body.user_id は targetUser 逆引き等の正規パターンも多い（実測135件中ほぼ正規/ガード付き）
B2=$(grep_code '(body|req\.query|searchParams)\.(user_?[Ii]d)\b' 'interface |type |: string\[\]')
report WARN "B2 trust-body-userId(要確認)" "$(echo -n "$B2" | grep -c . || true)" "$B2"

echo ""
echo "ERROR=$err / WARN=$warn"
if [ "$err" -gt 0 ]; then
  echo "🚫 ブロック。failure-catalog.md の該当クラスを根治（逃げ禁止）。精密判定は semgrep-rules.yml。"
  exit 1
fi
echo "✅ ERROR なし（WARN は目視確認）"
