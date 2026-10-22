@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 比分提醒 - 一键安装

call :check_node
if not errorlevel 1 goto node_ready

echo 未检测到 Node.js 20.19 或更高版本，正在尝试自动安装...
where winget >nul 2>nul
if errorlevel 1 goto node_manual

winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 goto node_manual

set "PATH=%ProgramFiles%\nodejs;%APPDATA%\npm;%PATH%"
call :check_node
if errorlevel 1 (
  echo Node.js 已安装，但当前窗口尚未识别。请关闭窗口后再次双击本文件。
  pause
  exit /b 1
)

:node_ready
echo Node.js 已就绪：
node --version

if exist "node_modules\express\package.json" goto dependencies_ready
echo.
echo 正在安装运行依赖，请保持网络连接...
if exist "dist\index.html" (
  call npm ci --omit=dev
) else (
  call npm ci
)
if errorlevel 1 goto install_failed

:dependencies_ready
if exist "dist\index.html" goto build_ready
echo.
echo 正在构建网页...
call npm run build
if errorlevel 1 goto install_failed

:build_ready
echo.
echo 正在启动比分提醒服务...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-BACKGROUND.ps1"
if errorlevel 1 (
  echo 服务启动超时，请查看 data\server-error.log 和 data\server-supervisor.log。
  pause
  exit /b 1
)

:open_browser
start "" "http://localhost:8787"
echo.
echo 安装并启动完成，浏览器已打开。
echo 服务已隐藏在后台运行，不需要保留黑色窗口。
echo 需要停止服务时，请双击 STOP-SERVICE.bat。
echo 以后只需双击 start-windows.bat 即可启动。
pause
exit /b 0

:check_node
where node >nul 2>nul
if errorlevel 1 exit /b 1
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>20?0:v[0]===20?(v[1]>=19?0:1):1)"
exit /b %errorlevel%

:node_manual
echo.
echo 当前 Windows 没有可用的 winget，无法自动安装 Node.js。
echo 浏览器即将打开 Node.js 下载页；安装 LTS 版本后，再次双击本文件。
start "" "https://nodejs.org/zh-cn/download"
pause
exit /b 1

:install_failed
echo.
echo 安装未完成，请保留本窗口中的错误信息后重试。
pause
exit /b 1

