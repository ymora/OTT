#requires -Version 7.0
<#
.SYNOPSIS
  Compile et flash le firmware OTT via arduino-cli (Windows/PowerShell).

.PARAMETER Port
  Port série du module (ex: COM6)

.PARAMETER Sketch
  Chemin du sketch .ino (par défaut hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino)

.PARAMETER Board
  Identifiant FQBN (défaut: esp32:esp32:ttgo-t1)

.EXAMPLE
  .\scripts\flash_firmware.ps1 -Port COM6
#>

param(
  [Parameter(Mandatory=$true)][string]$Port,
  [string]$Sketch = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino",
  [string]$Board = "esp32:esp32:ttgo-t1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command arduino-cli -ErrorAction SilentlyContinue)) {
  Write-Error "arduino-cli introuvable. Installer https://arduino.github.io/arduino-cli/latest/installation/"
}

$root = Resolve-Path "$PSScriptRoot/.."
Set-Location $root

Write-Host "📦 Installation dépendances (arduino-cli core update)" -ForegroundColor Cyan
arduino-cli core update-index

Write-Host "⚙️ Compilation $Sketch" -ForegroundColor Cyan
arduino-cli compile --fqbn $Board $Sketch

Write-Host "🔌 Flash sur $Port" -ForegroundColor Cyan
arduino-cli upload --fqbn $Board -p $Port $Sketch

Write-Host "✅ Firmware flashé. Ouvrir le moniteur série (115200 baud) pour vérifier les logs." -ForegroundColor Green

