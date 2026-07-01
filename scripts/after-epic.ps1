# PM Lite — вызывается после завершения каждого эпика
# Сбрасывает демо-данные и перезапускает сервера для тестирования
#
# Использование: .\scripts\after-epic.ps1 [-Epic "Название эпика"]
# Пример: .\scripts\after-epic.ps1 -Epic "A4: Канбан-доска"

param(
    [string]$Epic = ""
)

$root = Split-Path $PSScriptRoot -Parent

function Kill-Port {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Sort-Object -Unique | Where-Object { $_ -gt 0 }
            foreach ($p in $pids) {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {}
}

Write-Host ""
if ($Epic) {
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Magenta
    Write-Host "║  Эпик завершён: $Epic" -ForegroundColor Magenta
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Magenta
} else {
    Write-Host "=== PM Lite — После эпика: перезапуск ===" -ForegroundColor Magenta
}
Write-Host ""

# 1. Сброс демо-данных
Write-Host "1/3  Сбрасываю демо-данные..." -ForegroundColor Yellow
Set-Location "$root\backend"
npm run db:seed-demo
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌  Ошибка при загрузке демо-данных. Перезапуск отменён." -ForegroundColor Red
    exit 1
}

# 2. Остановка текущих серверов
Write-Host ""
Write-Host "2/3  Останавливаю серверы..." -ForegroundColor Yellow
Kill-Port 3000
Kill-Port 5173
Start-Sleep -Seconds 2

# 3. Запуск серверов
Write-Host "3/3  Запускаю серверы..." -ForegroundColor Yellow

Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$root\backend'; `$host.ui.RawUI.WindowTitle = 'PM Lite Backend'; npm run dev"

Start-Sleep -Seconds 3

Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "Set-Location '$root\frontend'; `$host.ui.RawUI.WindowTitle = 'PM Lite Frontend'; npm run dev"

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✓  Готово к тестированию!               ║" -ForegroundColor Green
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Frontend : http://localhost:5173        ║" -ForegroundColor Green
Write-Host "║  Backend  : http://localhost:3000        ║" -ForegroundColor Green
Write-Host "║  Логин    : admin@pmgroup.ru             ║" -ForegroundColor Green
Write-Host "║  Пароль   : Demo1234!                    ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
