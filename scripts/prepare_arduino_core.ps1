# ================================================================================
# Script de préparation du core ESP32 pour arduino-cli (Windows)
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Télécharge et installe le core ESP32 dans arduino-data/ du projet
# ================================================================================

$ErrorActionPreference = "Stop"

Write-Host "🔧 Préparation du core ESP32 pour arduino-cli..." -ForegroundColor Cyan

# Vérifier que arduino-cli est installé (d'abord dans bin/, puis dans PATH)
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$arduinoCliPath = Join-Path $PROJECT_ROOT "bin\arduino-cli.exe"

if (-not (Test-Path $arduinoCliPath)) {
    $arduinoCli = Get-Command arduino-cli -ErrorAction SilentlyContinue
    if (-not $arduinoCli) {
        Write-Error "❌ ERREUR: arduino-cli n'est pas installé"
        Write-Host "Exécutez d'abord: .\scripts\download_arduino_cli.ps1" -ForegroundColor Yellow
        exit 1
    }
    $arduinoCliPath = $arduinoCli.Source
}

Write-Host "✅ Utilisation de arduino-cli: $arduinoCliPath" -ForegroundColor Green

# Créer le répertoire arduino-data dans le projet
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$ARDUINO_DATA_DIR = Join-Path $PROJECT_ROOT "arduino-data"

Write-Host "📁 Création du répertoire arduino-data..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $ARDUINO_DATA_DIR -Force | Out-Null

# Configurer arduino-cli pour utiliser ce répertoire
$env:ARDUINO_DIRECTORIES_USER = $ARDUINO_DATA_DIR

# Vérifier si le core ESP32 est déjà installé (format: esp32:esp32 ou esp-rv32)
$coreList = & $arduinoCliPath core list 2>&1
if ($coreList -match "(esp32:esp32|esp-rv32)") {
    Write-Host "✅ Core ESP32 déjà installé dans $ARDUINO_DATA_DIR" -ForegroundColor Green
    & $arduinoCliPath core list
    exit 0
}

Write-Host "📥 Téléchargement et installation du core ESP32..." -ForegroundColor Cyan
Write-Host "⏳ Cela peut prendre plusieurs minutes (téléchargement ~430MB)..." -ForegroundColor Yellow

# Mettre à jour l'index
Write-Host "📦 Mise à jour de l'index des cores..." -ForegroundColor Cyan
& $arduinoCliPath core update-index | Out-Null

# Installer le core ESP32
Write-Host "📥 Installation du core ESP32..." -ForegroundColor Cyan
& $arduinoCliPath core install esp32:esp32

# Vérifier l'installation (format: esp32:esp32 ou esp-rv32)
$coreList = & $arduinoCliPath core list 2>&1
if ($coreList -match "(esp32:esp32|esp-rv32)") {
    Write-Host "✅ Core ESP32 installé avec succès dans $ARDUINO_DATA_DIR" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Taille du répertoire arduino-data:" -ForegroundColor Cyan
    $size = (Get-ChildItem -Path $ARDUINO_DATA_DIR -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "   $([math]::Round($size, 2)) MB" -ForegroundColor Green
    Write-Host ""
    Write-Host "✅ Le core ESP32 est maintenant disponible localement" -ForegroundColor Green
    Write-Host "   Les prochaines compilations utiliseront ce core sans retéléchargement" -ForegroundColor Green
} else {
    Write-Error "❌ ERREUR: Le core ESP32 n'a pas pu être installé"
    exit 1
}

