#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$APP_DIR"

pause_on_exit() {
  printf '\n按回车键关闭窗口...'
  read -r _
}

if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装 Node.js 20.19 或更高版本："
  echo "https://nodejs.org/zh-cn/download"
  pause_on_exit
  exit 1
fi

if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 20 || (major === 20 && minor >= 19) ? 0 : 1)"; then
  echo "当前 Node.js 版本过低：$(node --version)"
  echo "请升级到 Node.js 20.19 或更高版本。"
  pause_on_exit
  exit 1
fi

echo "正在安装依赖..."
npm ci

echo "正在运行检查..."
npm test

echo "正在构建本地服务..."
npm run build

echo
echo "安装完成。以后双击“启动本地版.command”即可运行。"
pause_on_exit

