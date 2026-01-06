# Compilation rapide du firmware OTT avec Arduino CLI
# Ce script compile le firmware en utilisant la configuration optimale

$ErrorActionPreference = "Stop"

# Configuration
$ProjectRoot = $PSScriptRoot
$ArduinoCli = Join-Path $ProjectRoot "bin\arduino-cli.exe"
$FirmwarePath = Join-Path $ProjectRoot "hardware\firmware\fw_ott_optimized\fw_ott_optimized.ino"
$FQBN = "esp32:esp32:esp32"  # Configuration générique ESP32 (compatible avec toutes les cartes)

Write-Host "🔧 Compilation du firmware OTT..." -ForegroundColor Cyan
Write-Host "Firmware: $FirmwarePath" -ForegroundColor Gray
Write-Host "FQBN: $FQBN" -ForegroundColor Gray
Write-Host ""

# Vérifier que arduino-cli existe
if (-not (Test-Path $ArduinoCli)) {
    Write-Host "❌ arduino-cli non trouvé: $ArduinoCli" -ForegroundColor Red
    exit 1
}

# Vérifier que le firmware existe
if (-not (Test-Path $FirmwarePath)) {
    Write-Host "❌ Firmware non trouvé: $FirmwarePath" -ForegroundColor Red
    exit 1
}

# Compiler
Write-Host "📦 Compilation en cours..." -ForegroundColor Yellow
$Output = & $ArduinoCli compile --fqbn $FQBN $FirmwarePath 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Compilation réussie !" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Résultat:" -ForegroundColor Cyan
    $Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Host "❌ Erreur de compilation:" -ForegroundColor Red
    $Output | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
