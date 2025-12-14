#requires -Version 7.0
<#
.SYNOPSIS
  Installer les tools ESP32 en local pour des tests rapides

.DESCRIPTION
  Ce script télécharge et installe les tools ESP32 (compilateurs)
  dans .arduino15/packages/esp32/tools/ pour des tests locaux rapides.
  
  Les tools (~5.4 GB) ne seront PAS committés dans Git grâce au .gitignore.
  Seul le core (~48 MB) sera dans Git.

.EXAMPLE
  .\scripts\installer_tools_local.ps1
  Installe tous les tools ESP32 en local
#>

param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🔧 INSTALLATION TOOLS ESP32 EN LOCAL" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que le core est présent
$corePath = ".arduino15\packages\esp32\hardware\esp32\3.3.4"
if (-not (Test-Path $corePath)) {
    Write-Host "❌ ERREUR: Core ESP32 non trouvé dans .arduino15/" -ForegroundColor Red
    Write-Host ""
    Write-Host "Exécutez d'abord :" -ForegroundColor Yellow
    Write-Host "  Copy-Item -Path `"`$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware`" -Destination `".arduino15\packages\esp32\`" -Recurse -Force" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Core ESP32 v3.3.4 détecté" -ForegroundColor Green
Write-Host ""

# Vérifier si les tools sont déjà installés
$toolsPath = ".arduino15\packages\esp32\tools"
if ((Test-Path $toolsPath) -and -not $Force) {
    $toolsSize = (Get-ChildItem $toolsPath -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1GB
    if ($toolsSize -gt 1) {
        Write-Host "✅ Tools déjà installés ($([math]::Round($toolsSize, 1)) GB)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Pour forcer la réinstallation :" -ForegroundColor Yellow
        Write-Host "  .\scripts\installer_tools_local.ps1 -Force" -ForegroundColor Gray
        exit 0
    }
}

# Copier les tools depuis l'installation locale d'Arduino
Write-Host "📦 Copie des tools depuis l'installation locale..." -ForegroundColor Yellow

$localToolsPath = "$env:LOCALAPPDATA\Arduino15\packages\esp32\tools"
if (-not (Test-Path $localToolsPath)) {
    Write-Host ""
    Write-Host "⚠️ Tools non trouvés dans $localToolsPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Installation des tools via arduino-cli..." -ForegroundColor Cyan
    Write-Host ""
    
    # Installer les tools via arduino-cli
    try {
        # Mettre à jour l'index
        Write-Host "1. Mise à jour de l'index..." -ForegroundColor Gray
        & .\bin\arduino-cli.exe core update-index 2>&1 | Out-Null
        
        # Installer le core ESP32 (qui téléchargera aussi les tools)
        Write-Host "2. Installation du core ESP32 et tools..." -ForegroundColor Gray
        $output = & .\bin\arduino-cli.exe core install esp32:esp32 2>&1
        
        # Vérifier si les tools sont maintenant installés
        if (Test-Path $localToolsPath) {
            Write-Host "   ✅ Tools installés avec succès" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Erreur : Tools non installés" -ForegroundColor Red
            Write-Host $output
            exit 1
        }
    } catch {
        Write-Host "   ❌ Erreur lors de l'installation : $_" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "📋 Copie des tools vers .arduino15/..." -ForegroundColor Yellow

try {
    # Créer le dossier de destination
    if (-not (Test-Path ".arduino15\packages\esp32\tools")) {
        New-Item -ItemType Directory -Path ".arduino15\packages\esp32\tools" -Force | Out-Null
    }
    
    # Copier tous les tools
    $startTime = Get-Date
    Copy-Item -Path "$localToolsPath\*" -Destination ".arduino15\packages\esp32\tools\" -Recurse -Force
    $duration = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
    
    Write-Host "✅ Tools copiés en ${duration}s" -ForegroundColor Green
    
    # Vérifier la taille
    $toolsSize = (Get-ChildItem ".arduino15\packages\esp32\tools" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB
    Write-Host "📦 Taille totale : $([math]::Round($toolsSize, 2)) GB" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Erreur lors de la copie : $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✅ INSTALLATION TERMINÉE !" -ForegroundColor Green
Write-Host ""
Write-Host "Structure en local :" -ForegroundColor White
Write-Host "  .arduino15/packages/esp32/" -ForegroundColor Gray
Write-Host "    ├── hardware/  (48 MB)   → Sera dans Git ✅" -ForegroundColor Green
Write-Host "    └── tools/     (5.4 GB)  → Exclu de Git ❌" -ForegroundColor Yellow
Write-Host ""
Write-Host "Avantages :" -ForegroundColor White
Write-Host "  ✅ Tests locaux ultra-rapides (~2 min)" -ForegroundColor Green
Write-Host "  ✅ Pas de téléchargement à chaque compilation" -ForegroundColor Green
Write-Host "  ✅ Git ne contient que le core (48 MB)" -ForegroundColor Green
Write-Host "  ✅ Render utilisera le core depuis Git" -ForegroundColor Green
Write-Host ""
Write-Host "Vous pouvez maintenant tester :" -ForegroundColor Cyan
Write-Host "  .\scripts\test_compilation_rapide.ps1" -ForegroundColor Gray
Write-Host ""

