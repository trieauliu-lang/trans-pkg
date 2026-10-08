@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist "node_modules\" (
  echo 尚未安装依赖，请先双击 install-windows.bat。
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo 尚未构建本地服务，请先双击 install-windows.bat。
  pause
  exit /b 1
)

echo 比分提醒服务正在启动：http://localhost:8787
echo 需要停止服务时，请在此窗口按 Ctrl + C。
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:8787'"
call npm start

