# PM Lite — остановка dev-серверов
# Использование: .\scripts\stop-dev.ps1

function Kill-Port {
    param([int]$Port)
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($conns) {
            $pids = $conns.OwningProcess | Sort-Object -Unique | Where-Object { $_ -gt 0 }
            foreach ($p in $pids) {
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
            }
            Write-Host "  Остановлен процесс на порту $Port" -ForegroundColor Gray
        } else {
            Write-Host "  Порт $Port уже свободен" -ForegroundColor DarkGray
        }
    } catch {
        Write-Host "  Ошибка при остановке порта ${Port}: $_" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "=== PM Lite — Остановка серверов ===" -ForegroundColor Yellow

Kill-Port 3000
Kill-Port 5173

Write-Host ""
Write-Host "✓  Серверы остановлены" -ForegroundColor Green
Write-Host ""
