#!/usr/bin/env bash
# 构建时注入版本信息。CI 会在部署前调用。
# 本地不必运行，未注入时页面显示 "dev / local"。
set -euo pipefail
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "nogit")
DATE=$(date -u +%Y-%m-%d)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
CHANNEL="stable"
[ "$BRANCH" != "main" ] && CHANNEL="dev"

sed -i.bak \
  -e "s/__COMMIT__/${COMMIT}/" \
  -e "s/__DATE__/${DATE}/" \
  -e "s/__CHANNEL__/${CHANNEL}/" \
  shared/version.js
rm -f shared/version.js.bak
echo "stamped: ${COMMIT} ${DATE} ${CHANNEL}"
