# PM Lite — запуск dev-окружения
# Использование: .\scripts\start-dev.ps1

$root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "=== PM Lite — Запуск Dev ===" -ForegroundColor Cyan

# Backend
Write-Host "▶  Запускаю backend (порт 3000)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$root\backend'; `$host.ui.RawUI.WindowTitle = 'PM Lite Backend'; npm run dev"

Start-Sleep -Seconds 2

# Frontend
Write-Host "▶  Запускаю frontend (порт 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$root\frontend'; `$host.ui.RawUI.WindowTitle = 'PM Lite Frontend'; npm run dev"

Start-Sleep -Seconds 1

Write-Host ""
Write-Host "  Backend  : http://localhost:3000" -ForegroundColor White
Write-Host "  Frontend : http://localhost:5173" -ForegroundColor White
Write-Host "  Логин    : admin@pmgroup.ru / Demo1234!" -ForegroundColor Yellow
Write-Host ""
