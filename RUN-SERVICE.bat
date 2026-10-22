@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title 比分提醒服务

:run
echo [%date% %time%] 正在启动比分提醒服务：http://localhost:8787
node --env-file-if-exists=.env server\index.js --production
set "SERVICE_EXIT_CODE=%errorlevel%"
echo.
echo [%date% %time%] 服务已停止（退出码 %SERVICE_EXIT_CODE%），5 秒后自动重启。
echo 如需彻底停止，请直接关闭本窗口。
timeout /t 5 /nobreak >nul
goto run
