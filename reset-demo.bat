@echo off
chcp 65001 > nul
cd /d "%~dp0backend"
echo.
echo === PM Lite: Сброс демо-данных ===
echo.
npm run db:seed-demo
echo.
pause
