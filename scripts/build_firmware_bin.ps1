#requires -Version 7.0
<#
.SYNOPSIS
  Compile le firmware OTT en fichier .bin pour flash direct (Windows/PowerShell).

.DESCRIPTION
  Ce script compile le firmware .ino en .bin prêt à être flashé.
  Le fichier .bin sera placé dans firmwares/ pour être utilisé par le système de flash USB.

.PARAMETER Board
  Identifiant FQBN (défaut: esp32:esp32:esp32)

.PARAMETER OutputDir
  Dossier de sortie (défaut: firmwares/)

.EXAMPLE
  .\scripts\build_firmware_bin.ps1
  Compile le firmware avec les paramètres par défaut

.EXAMPLE
  .\scripts\build_firmware_bin.ps1 -Board "esp32:esp32:ttgo-t1"
  Compile pour une carte spécifique
#>

param(
  [string]$Board = "esp32:esp32:esp32",
  [string]$OutputDir = "firmwares"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Vérifier que arduino-cli est installé
if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  Write-Error "arduino-cli introuvable. Installer depuis: https://arduino.github.io/arduino-cli/latest/installation/"
  exit 1
}

# Chemin du sketch
$root = Resolve-Path "$PSScriptRoot/.."
Set-Location $root

$sketchPath = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
if (-not (Test-Path $sketchPath)) {
  Write-Error "Fichier firmware introuvable: $sketchPath"
  exit 1
}

# Créer le dossier de sortie si nécessaire
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
  Write-Host "📁 Dossier créé: $OutputDir" -ForegroundColor Cyan
}

# Mettre à jour l'index des cores
Write-Host "📦 Mise à jour de l'index des cores Arduino..." -ForegroundColor Cyan
arduino-cli core update-index | Out-Null

# Installer le core ESP32 si nécessaire
Write-Host "⚙️ Vérification du core ESP32..." -ForegroundColor Cyan
arduino-cli core install esp32:esp32 | Out-Null

# Créer un dossier temporaire pour la compilation
$buildDir = Join-Path $env:TEMP "ott_firmware_build_$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $buildDir | Out-Null

try {
  # Compiler le firmware
  Write-Host "🔨 Compilation du firmware..." -ForegroundColor Cyan
  Write-Host "   Board: $Board" -ForegroundColor Gray
  Write-Host "   Sketch: $sketchPath" -ForegroundColor Gray
  
  $compileOutput = arduino-cli compile --fqbn $Board --build-path $buildDir $sketchPath 2>&1
  
  if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Compilation échouée"
    Write-Host $compileOutput
    exit 1
  }
  
  # Trouver le fichier .bin généré
  $binFile = Get-ChildItem -Path $buildDir -Filter "*.bin" -Recurse | 
    Where-Object { $_.Name -like "*fw_ott_optimized*" -or $_.Name -like "*sketch*" } | 
    Select-Object -First 1
  
  if (-not $binFile) {
    # Chercher n'importe quel .bin dans le dossier build
    $binFile = Get-ChildItem -Path $buildDir -Filter "*.bin" -Recurse | Select-Object -First 1
  }
  
  if (-not $binFile) {
    Write-Error "❌ Fichier .bin introuvable après compilation"
    Write-Host "Contenu du dossier build:" -ForegroundColor Yellow
    Get-ChildItem -Path $buildDir -Recurse | Select-Object FullName
    exit 1
  }
  
  # Extraire la version du firmware depuis le .ino
  $firmwareVersion = "3.0-rebuild"
  $inoContent = Get-Content $sketchPath -Raw
  if ($inoContent -match 'FIRMWARE_VERSION_STR\s+"([^"]+)"') {
    $firmwareVersion = $matches[1]
  }
  
  # Nom du fichier de sortie
  $outputFileName = "ott_firmware_v${firmwareVersion}_$(Get-Date -Format 'yyyyMMdd').bin"
  $outputPath = Join-Path $OutputDir $outputFileName
  
  # Copier le fichier .bin
  Copy-Item $binFile.FullName $outputPath -Force
  Write-Host "✅ Firmware compilé avec succès!" -ForegroundColor Green
  Write-Host "   Version: $firmwareVersion" -ForegroundColor Gray
  Write-Host "   Fichier: $outputPath" -ForegroundColor Gray
  Write-Host "   Taille: $([math]::Round($binFile.Length / 1KB, 2)) KB" -ForegroundColor Gray
  
  # Afficher aussi le chemin complet
  Write-Host "`n📦 Fichier .bin prêt pour le flash:" -ForegroundColor Cyan
  Write-Host "   $((Resolve-Path $outputPath).Path)" -ForegroundColor White
  
} finally {
  # Nettoyer le dossier temporaire
  if (Test-Path $buildDir) {
    Remove-Item -Path $buildDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "`n💡 Pour flasher le firmware:" -ForegroundColor Yellow
Write-Host "   1. Utilisez le modal 'Flash USB' dans le dashboard" -ForegroundColor Gray
Write-Host "   2. Ou utilisez: .\scripts\flash_firmware.ps1 -Port COM6" -ForegroundColor Gray

