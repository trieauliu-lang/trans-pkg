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

echo 正在后台启动比分提醒服务...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0START-BACKGROUND.ps1"
if errorlevel 1 (
  echo.
  echo 服务启动失败，请查看 data\server-error.log 和 data\server-supervisor.log。
  pause
  exit /b 1
)

start "" "http://localhost:8787"
echo 服务已在后台运行，本窗口会自动关闭。
echo 需要停止服务时，请双击 STOP-SERVICE.bat。
timeout /t 2 /nobreak >nul

