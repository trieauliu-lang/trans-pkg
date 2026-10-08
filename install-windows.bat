@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 20.19 或更高版本：
  echo https://nodejs.org/zh-cn/download
  pause
  exit /b 1
)

node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>20?0:v[0]===20?(v[1]>=19?0:1):1)"
if errorlevel 1 (
  echo 当前 Node.js 版本过低：
  node --version
  echo 请升级到 Node.js 20.19 或更高版本。
  pause
  exit /b 1
)

echo 正在安装依赖...
call npm ci
if errorlevel 1 goto failed

echo 正在检查依赖安全状态...
call npm audit --audit-level=high
if errorlevel 1 goto failed

echo 正在运行测试...
call npm test
if errorlevel 1 goto failed

echo 正在构建本地服务...
call npm run build
if errorlevel 1 goto failed

echo.
echo 安装完成。以后双击 start-windows.bat 即可运行。
pause
exit /b 0

:failed
echo.
echo 安装未完成，请保留本窗口中的错误信息。
pause
exit /b 1

