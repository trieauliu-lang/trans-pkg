#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

if [ ! -d node_modules ] || [ ! -f dist/index.html ]; then
  echo "尚未完成安装，请先双击“安装本地版.command”。"
  printf '\n按回车键关闭窗口...'
  read -r _
  exit 1
fi

echo "比分提醒服务正在启动：http://localhost:8787"
echo "需要停止服务时，请在此窗口按 Control + C。"
(sleep 2; open "http://localhost:8787") &
npm start

