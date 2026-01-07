# Script pour installer le core ESP32 dans Docker
# Usage: .\scripts\install_esp32_core.ps1

Write-Host "[INSTALL] Installation du core ESP32 dans Docker" -ForegroundColor Cyan
Write-Host "  Cela peut prendre 10-30 minutes (téléchargement de ~570 MB)" -ForegroundColor Yellow
Write-Host ""

# Vérifier que Docker est en cours d'exécution
try {
    $containerRunning = docker ps --filter "name=ott-api" --format "{{.Names}}" 2>&1
    if ($containerRunning -notmatch "ott-api") {
        Write-Host "[ERREUR] Le conteneur ott-api n'est pas en cours d'exécution" -ForegroundColor Red
        Write-Host "  Démarrez Docker avec: docker-compose up -d" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "[ERREUR] Docker n'est pas accessible" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] Installation du core ESP32 (esp32:esp32)..." -ForegroundColor Cyan
Write-Host "  ⏳ Cela peut prendre du temps, soyez patient..." -ForegroundColor Yellow
Write-Host ""

# Installer le core ESP32 (sans timeout pour permettre le téléchargement complet)
# Utiliser nohup pour que le processus continue même si la connexion se ferme
try {
    docker exec ott-api bash -c "nohup arduino-cli core install esp32:esp32 > /tmp/core_install.log 2>&1 & echo \$!"
    Write-Host "[OK] Installation démarrée en arrière-plan" -ForegroundColor Green
    Write-Host ""
    Write-Host "[INFO] Pour suivre la progression:" -ForegroundColor Cyan
    Write-Host "  docker exec ott-api tail -f /tmp/core_install.log" -ForegroundColor White
    Write-Host ""
    Write-Host "[INFO] Pour vérifier si l'installation est terminée:" -ForegroundColor Cyan
    Write-Host "  docker exec ott-api arduino-cli core list" -ForegroundColor White
} catch {
    Write-Host "[ERREUR] Erreur lors de l'installation: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[INFO] Alternative: L'installation se fera automatiquement lors de la compilation" -ForegroundColor Gray
Write-Host "  depuis l'interface web si le core n'est pas installé" -ForegroundColor Gray











