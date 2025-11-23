# ================================================================================
# Script de préparation du core ESP32 pour arduino-cli (Windows)
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Télécharge et installe le core ESP32 dans hardware/arduino-data/ du projet
# ================================================================================

$ErrorActionPreference = "Stop"

Write-Host "🔧 Préparation du core ESP32 pour arduino-cli..." -ForegroundColor Cyan

# Vérifier que arduino-cli est installé
$arduinoCli = $null

# 1. Chercher dans bin/ du projet
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$binArduinoCli = Join-Path $projectRoot "bin\arduino-cli.exe"
if (Test-Path $binArduinoCli) {
    $arduinoCli = $binArduinoCli
    Write-Host "✅ arduino-cli trouvé dans bin/ du projet" -ForegroundColor Green
}

# 2. Chercher dans le PATH système
if (-not $arduinoCli) {
    $pathCli = Get-Command arduino-cli -ErrorAction SilentlyContinue
    if ($pathCli) {
        $arduinoCli = $pathCli.Source
        Write-Host "✅ arduino-cli trouvé dans le PATH système" -ForegroundColor Green
    }
}

if (-not $arduinoCli) {
    Write-Host "❌ ERREUR: arduino-cli n'est pas installé" -ForegroundColor Red
    Write-Host "Exécutez d'abord: .\scripts\hardware\download_arduino_cli.ps1" -ForegroundColor Yellow
    exit 1
}

# Créer le répertoire hardware/arduino-data dans le projet (versionné avec GitHub LFS)
$arduinoDataDir = Join-Path $projectRoot "hardware\arduino-data"

Write-Host "📁 Création du répertoire hardware/arduino-data..." -ForegroundColor Cyan
if (-not (Test-Path $arduinoDataDir)) {
    New-Item -ItemType Directory -Path $arduinoDataDir -Force | Out-Null
}

# Configurer arduino-cli pour utiliser ce répertoire
$env:ARDUINO_DIRECTORIES_USER = $arduinoDataDir

# Vérifier si le core ESP32 est déjà installé
Write-Host "🔍 Vérification du core ESP32..." -ForegroundColor Cyan
$coreListOutput = & $arduinoCli core list 2>&1
$coreListStr = $coreListOutput -join "`n"

if ($coreListStr -match "(esp32:esp32|esp-rv32)") {
    Write-Host "✅ Core ESP32 déjà installé dans $arduinoDataDir" -ForegroundColor Green
    $coreListOutput | ForEach-Object { Write-Host $_ }
    exit 0
}

Write-Host "📥 Téléchargement et installation du core ESP32..." -ForegroundColor Yellow
Write-Host "⏳ Cela peut prendre plusieurs minutes (téléchargement ~430MB)..." -ForegroundColor Yellow

# Mettre à jour l'index
Write-Host "📦 Mise à jour de l'index des cores..." -ForegroundColor Cyan
$updateOutput = & $arduinoCli core update-index 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Avertissement lors de la mise à jour de l'index" -ForegroundColor Yellow
    Write-Host ($updateOutput -join "`n") -ForegroundColor Gray
}

# Installer le core ESP32
Write-Host "📥 Installation du core ESP32..." -ForegroundColor Cyan
$installOutput = & $arduinoCli core install esp32:esp32 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ERREUR: Le core ESP32 n'a pas pu être installé" -ForegroundColor Red
    Write-Host ($installOutput -join "`n") -ForegroundColor Red
    exit 1
}

# Vérifier l'installation
$coreListOutput = & $arduinoCli core list 2>&1
$coreListStr = $coreListOutput -join "`n"

if ($coreListStr -match "(esp32:esp32|esp-rv32)") {
    Write-Host "✅ Core ESP32 installé avec succès dans $arduinoDataDir" -ForegroundColor Green
    Write-Host ""
    
    # Afficher la taille du répertoire
    $size = (Get-ChildItem -Path $arduinoDataDir -Recurse -ErrorAction SilentlyContinue | 
             Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "📊 Taille du répertoire hardware/arduino-data: $([math]::Round($size, 2)) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "✅ Le core ESP32 est maintenant disponible localement" -ForegroundColor Green
    Write-Host "   Les prochaines compilations utiliseront ce core sans retéléchargement" -ForegroundColor Green
    Write-Host "   ⚠️ IMPORTANT: Ajoutez hardware/arduino-data/ à GitHub LFS avant de commit!" -ForegroundColor Yellow
} else {
    Write-Host "❌ ERREUR: Le core ESP32 n'a pas pu être installé" -ForegroundColor Red
    exit 1
}
