@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0STOP-BACKGROUND.ps1"
echo.
echo 操作完成，本窗口会自动关闭。
timeout /t 2 /nobreak >nul
