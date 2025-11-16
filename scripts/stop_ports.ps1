# ============================================================================
# Script pour arrêter les processus sur les ports utilisés
# ============================================================================

Write-Host "🛑 Arrêt des processus sur les ports utilisés" -ForegroundColor Cyan
Write-Host ""

# Fonction pour tuer un processus sur un port
function Stop-ProcessOnPort {
    param([int]$Port)
    
    $processes = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | 
                 Select-Object -ExpandProperty OwningProcess -Unique
    
    if ($processes) {
        foreach ($pid in $processes) {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  ⚠️  Arrêt de $($proc.ProcessName) (PID: $pid) sur le port $Port" -ForegroundColor Yellow
                Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Host "  ✓ Port $Port libéré" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Port $Port déjà libre" -ForegroundColor Gray
    }
}

# Ports à libérer
$ports = @(3000, 5432, 8080, 8081)

foreach ($port in $ports) {
    Stop-ProcessOnPort -Port $port
}

Write-Host ""
Write-Host "✅ Tous les ports ont été libérés" -ForegroundColor Green

