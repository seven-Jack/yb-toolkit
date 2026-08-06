#!/usr/bin/env bash
# scripts/verify.sh — 每个任务的验收闸门
#
# 依次做四件事，任何一步失败都以非零退出码结束：
#   1. 五套测试：bench.js / bench.py / crosscheck.js / smoke.js / browser.js
#      browser.js 需要本地 HTTP 服务：脚本在后台起 python3 -m http.server 8000，跑完杀掉。
#   2. 硬校验四个数值锚点（相对容差 2e-4，由 scripts/check-anchors.js 执行）
#   3. 报告工作区是否干净
#   4. 全绿时打印一行摘要（各套通过数 + 四锚点确认）
#
# 退出码规则：测试的真实退出码用 `$?` 直接捕获（run_test 里命令后立即读），
# 不做 `| tail` 之类会吞掉退出码的管道。任何一步失败最终以非零退出码结束。
#
# 注意：工作区"不干净"只报告、不判失败 —— 验收闸门本来就在 commit 之前跑，
# 此时带着刚实现完的改动是预期状态。
#
# 用法：bash scripts/verify.sh
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAILED=0
COUNTS=""
SUMMARY_LINES=""

run_test() {
  local name="$1"; shift
  local out rc count
  echo "--- $name ---"
  out="$("$@" 2>&1)"          # 捕获完整输出，真实退出码立即存入 $?
  rc=$?
  printf '%s\n' "$out"
  count="$(printf '%s\n' "$out" | grep -Eo '通过 *[0-9]+ */ *[0-9]+|[0-9]+ *项，失败 *[0-9]+ *项|全部一致' | awk 'END{print}')"
  if [ -z "$count" ]; then count="通过数未知"; fi
  if [ "$rc" -eq 0 ]; then
    COUNTS="${COUNTS}${name}=${count}; "
    echo "✓ $name 通过"
  else
    FAILED=1
    COUNTS="${COUNTS}${name}=FAIL(exit ${rc}); "
    echo "✗ $name 失败（exit ${rc}）"
  fi
}

echo "==== 1/4 五套测试 ===="
run_test bench.js   node tests/bench.js
run_test bench.py   python3 tests/bench.py
run_test crosscheck node tests/crosscheck.js
run_test smoke      node tests/smoke.js

echo "--- browser.js（后台起 http.server 8000，跑完杀掉）---"
python3 -m http.server 8000 >/tmp/yb_verify_http.log 2>&1 &
HTTP_PID=$!
for _ in $(seq 1 20); do
  curl -s -o /dev/null --max-time 1 http://localhost:8000/index.html && break
  sleep 0.25
done
run_test browser node tests/browser.js
kill "$HTTP_PID" 2>/dev/null
wait "$HTTP_PID" 2>/dev/null
echo "（已关闭自起的 http.server，PID ${HTTP_PID}）"

echo
echo "==== 2/4 四锚点硬校验（相对容差 2e-4）===="
if node scripts/check-anchors.js; then
  echo "✓ 四锚点确认"
else
  FAILED=1
  echo "✗ 锚点漂移（见上方输出）"
fi

echo
echo "==== 3/4 工作区状态 ===="
DIRTY="$(git status --short)"
WS_STATE="干净"
if [ -z "$DIRTY" ]; then
  echo "✓ 工作区干净"
else
  WS_STATE="不干净（commit 前预期）"
  echo "（工作区不干净 —— 仅报告，不判失败；commit 前的正常状态）"
  printf '%s\n' "$DIRTY"
fi

echo
echo "==== 4/4 摘要 ===="
if [ "$FAILED" -eq 0 ]; then
  echo "✅ 全绿：${COUNTS}四锚点确认"
  echo "   工作区：${WS_STATE}"
  exit 0
else
  echo "❌ 有失败：${COUNTS}锚点未确认"
  echo "   修复后重跑：bash scripts/verify.sh"
  exit 1
fi
