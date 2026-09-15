#!/usr/bin/env bash
# deploy.sh — 一键部署：自动版本号 → commit → push → 服务器 pull → 线上自检
# 用法：./deploy.sh "本次改动说明"（说明可省略）
set -euo pipefail

cd "$(dirname "$0")"

SERVER="root@43.167.198.21"
REMOTE_DIR="/opt/name-picker"
SITE="https://picker.taouuuuuu.tech"
V="$(date +%Y%m%d-%H%M)"
MSG="${1:-deploy $V}"

echo "==> 版本号: $V"

# 1) 有改动才递增版本号并提交
if [ -n "$(git status --porcelain)" ]; then
  sed -i "s/?v=[0-9-]*/?v=$V/g" index.html
  git add -A
  git commit -m "$MSG"
  echo "==> 已提交: $MSG"
else
  echo "==> 工作区无改动，跳过版本号与提交"
fi

# 2) 推送（没有新提交时 git 会快速返回）
echo "==> 推送到 GitHub..."
git push origin main

# 3) 服务器拉取
echo "==> 服务器拉取..."
ssh -o BatchMode=yes -o ConnectTimeout=12 "$SERVER" "cd $REMOTE_DIR && git pull"

# 4) 重启历史 API（静态页无需重启 nginx；API 重启秒级且无状态）
echo "==> 重启 picker-api..."
ssh -o BatchMode=yes "$SERVER" "systemctl restart picker-api" || echo "    （picker-api 重启失败，若未改动 API 可忽略）"

# 5) 线上自检
echo "==> 线上自检..."
CODE=$(curl -s -o /dev/null -m 12 -w "%{http_code}" "$SITE/")
LIVE_V=$(curl -s -m 12 "$SITE/" | grep -o 'style.css?v=[0-9-]*' | head -1)
API_CODE=$(curl -s -o /dev/null -m 12 -w "%{http_code}" "$SITE/api/history")

echo "    首页:   HTTP $CODE"
echo "    资源版本: $LIVE_V"
echo "    历史API: HTTP $API_CODE"

if [ "$CODE" = "200" ] && [ "$API_CODE" = "200" ]; then
  echo "✅ 部署完成: $SITE"
else
  echo "❌ 自检未通过，请检查服务器状态"
  exit 1
fi
