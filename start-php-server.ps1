# Script pour démarrer le serveur PHP local
# Usage: .\start-php-server.ps1

Write-Host "Démarrage du serveur PHP local..." -ForegroundColor Cyan
Write-Host ""

# Vérifier si PHP est installé
try {
    $phpVersion = php -v 2>&1 | Select-Object -First 1
    Write-Host "✅ PHP trouvé: $phpVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ PHP n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1. Installer PHP: https://www.php.net/downloads.php" -ForegroundColor Gray
    Write-Host "  2. Utiliser Docker: docker-compose up api" -ForegroundColor Gray
    Write-Host "  3. Utiliser l'API distante (déjà configurée)" -ForegroundColor Gray
    exit 1
}

# Vérifier si le port 8000 est libre
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port8000) {
    Write-Host "⚠️  Le port 8000 est déjà utilisé" -ForegroundColor Yellow
    Write-Host "   Arrêt du processus existant..." -ForegroundColor Gray
    $process = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue
    if ($process) {
        Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

Write-Host ""
Write-Host "🚀 Démarrage du serveur PHP sur http://localhost:8000" -ForegroundColor Green
Write-Host "   Appuyez sur Ctrl+C pour arrêter" -ForegroundColor Gray
Write-Host ""

# Démarrer le serveur PHP
# Le serveur PHP built-in route automatiquement vers index.php ou api.php
php -S localhost:8000 -t . router.php 2>&1

