# PM Lite — сброс демо-данных (без перезапуска серверов)
# Использование: .\scripts\reset-demo.ps1

$root = Split-Path $PSScriptRoot -Parent

Write-Host ""
Write-Host "=== PM Lite — Сброс демо-данных ===" -ForegroundColor Yellow
Write-Host "  Удаляю старые данные и загружаю свежие..." -ForegroundColor Gray
Write-Host ""

Set-Location "$root\backend"
npm run db:seed-demo

Write-Host ""
Write-Host "✓  Демо-данные обновлены" -ForegroundColor Green
Write-Host "  Если сервер запущен — изменения применятся автоматически." -ForegroundColor Gray
Write-Host ""
