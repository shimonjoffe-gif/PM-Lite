@echo off
chcp 65001 > nul
echo.
echo === PM Lite: Запуск Dev ===
echo.
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:5173
echo Логин:    admin@pmgroup.ru / Demo1234!
echo.

start "PM Lite Backend"  cmd /k "cd /d "%~dp0backend"  && npm run dev"
timeout /t 2 /nobreak > nul
start "PM Lite Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"
