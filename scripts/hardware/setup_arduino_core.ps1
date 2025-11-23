# ================================================================================
# Script de configuration complète : arduino-cli + core ESP32
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Installe arduino-cli et le core ESP32 dans le projet pour GitHub LFS
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
Write-Host "   1. Vérifiez que .gitattributes contient hardware/arduino-data/**" -ForegroundColor White
Write-Host "   2. Installez Git LFS: git lfs install" -ForegroundColor White
Write-Host "   3. Ajoutez les fichiers: git add hardware/arduino-data/" -ForegroundColor White
Write-Host "   4. Commit: git commit -m 'Add ESP32 core with GitHub LFS'" -ForegroundColor White
Write-Host "   5. Push: git push origin main" -ForegroundColor White
Write-Host ""
Write-Host "✅ Le core ESP32 sera maintenant versionné avec le projet" -ForegroundColor Green
Write-Host "✅ Pas besoin de Persistent Disk Render (gratuit !)" -ForegroundColor Green

