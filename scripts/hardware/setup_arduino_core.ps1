# ================================================================================
# Script de configuration complète : arduino-cli + core ESP32
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Installe arduino-cli et le core ESP32 en local (cache non versionné)
# ================================================================================

$ErrorActionPreference = "Stop"

Write-Host "🚀 Configuration complète arduino-cli + core ESP32" -ForegroundColor Cyan
Write-Host ""

# Étape 1: Installer arduino-cli
Write-Host "📦 Étape 1: Installation d'arduino-cli..." -ForegroundColor Yellow
& "$PSScriptRoot\download_arduino_cli.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Échec de l'installation d'arduino-cli" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Étape 2: Installer le core ESP32
Write-Host "📦 Étape 2: Installation du core ESP32..." -ForegroundColor Yellow
& "$PSScriptRoot\prepare_arduino_core.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Échec de l'installation du core ESP32" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Configuration terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
Write-Host "   1. Vérifiez que .gitignore contient hardware/arduino-data/" -ForegroundColor White
Write-Host "   2. Configurez un disque persistant (Render) pointant vers hardware/arduino-data/ pour conserver le cache" -ForegroundColor White
Write-Host "   3. Sinon, relancez ce script après chaque nettoyage du dossier" -ForegroundColor White
Write-Host ""
Write-Host "✅ Le core ESP32 est prêt en local" -ForegroundColor Green
Write-Host "✅ Configurez Render pour réutiliser ce cache (Persistent Disk recommandé)" -ForegroundColor Green

