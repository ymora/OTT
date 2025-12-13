#requires -Version 7.0
<#
.SYNOPSIS
  Configuration pour tests locaux sans copier les tools

.DESCRIPTION
  Configure le système pour utiliser les tools déjà installés dans
  $env:LOCALAPPDATA\Arduino15 sans les copier (économie de 5.4 GB).
  
  STRATÉGIE :
  - Core ESP32 dans .arduino15/ (48 MB) → Git ✅
  - Tools dans $env:LOCALAPPDATA\Arduino15 → Local uniquement
  - Pas de copie = pas de problème d'espace disque

.EXAMPLE
  .\scripts\configurer_local.ps1
#>

Write-Host ""
Write-Host "⚙️ CONFIGURATION POUR TESTS LOCAUX" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier que le core est présent dans .arduino15/
$corePath = ".arduino15\packages\esp32\hardware\esp32\3.3.4"
if (Test-Path $corePath) {
    Write-Host "✅ Core ESP32 dans .arduino15/ (48 MB) → Sera dans Git" -ForegroundColor Green
} else {
    Write-Host "❌ Core ESP32 NON trouvé dans .arduino15/" -ForegroundColor Red
    Write-Host ""
    Write-Host "Installation du core..." -ForegroundColor Yellow
    Copy-Item -Path "$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware" -Destination ".arduino15\packages\esp32\" -Recurse -Force
    Write-Host "✅ Core copié" -ForegroundColor Green
}

# 2. Vérifier que les tools sont dans l'installation locale
$localToolsPath = "$env:LOCALAPPDATA\Arduino15\packages\esp32\tools"
if (Test-Path $localToolsPath) {
    $toolsSize = (Get-ChildItem $localToolsPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB
    Write-Host "✅ Tools dans %LOCALAPPDATA% ($([math]::Round($toolsSize, 1)) GB) → Local uniquement" -ForegroundColor Green
} else {
    Write-Host "⚠️ Tools NON trouvés dans %LOCALAPPDATA%" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Installation via arduino-cli..." -ForegroundColor Yellow
    & .\bin\arduino-cli.exe core install esp32:esp32 2>&1 | Out-Null
    
    if (Test-Path $localToolsPath) {
        Write-Host "✅ Tools installés" -ForegroundColor Green
    } else {
        Write-Host "❌ Erreur installation tools" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""

# 3. Créer un fichier de config arduino-cli.yaml dans .arduino15/
$configContent = @"
# Configuration Arduino-cli pour le projet OTT
# Les tools restent dans %LOCALAPPDATA%\Arduino15 (pas de copie)
# Seul le core est dans .arduino15/ (committé dans Git)

board_manager:
  additional_urls:
    - https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json

directories:
  # Data : utilise .arduino15/ (core pré-installé)
  data: .arduino15
  # Downloads : utilise le cache local
  downloads: $env:LOCALAPPDATA\Arduino15\staging
  # User : utilise le projet
  user: .arduino15

library:
  enable_unsafe_install: false

logging:
  level: info
  format: text
"@

$configPath = ".arduino15\arduino-cli.yaml"
Set-Content -Path $configPath -Value $configContent -Encoding UTF8

Write-Host "✅ Config arduino-cli.yaml créé" -ForegroundColor Green
Write-Host ""

# 4. Tester la configuration
Write-Host "🧪 Test de la configuration..." -ForegroundColor Yellow
Write-Host ""

$env:ARDUINO_DIRECTORIES_DATA = (Resolve-Path ".arduino15").Path
$coreList = & .\bin\arduino-cli.exe core list 2>&1

if ($coreList -match "esp32:esp32") {
    Write-Host "✅ Core ESP32 détecté par arduino-cli" -ForegroundColor Green
    $coreList | Select-String "esp32:esp32" | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "⚠️ Core non détecté par arduino-cli" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "✅ CONFIGURATION TERMINÉE !" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Structure :" -ForegroundColor White
Write-Host "  .arduino15/" -ForegroundColor Gray
Write-Host "    ├── packages/esp32/hardware/  (48 MB)  → Git ✅" -ForegroundColor Green
Write-Host "    └── arduino-cli.yaml                   → Git ✅" -ForegroundColor Green
Write-Host ""
Write-Host "  %LOCALAPPDATA%\Arduino15/" -ForegroundColor Gray
Write-Host "    └── packages/esp32/tools/     (5.4 GB) → Local uniquement ⚡" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 Avantages :" -ForegroundColor Cyan
Write-Host "  ✅ Pas de duplication (économie 5.4 GB)" -ForegroundColor Green
Write-Host "  ✅ Tests locaux rapides (~2 min)" -ForegroundColor Green
Write-Host "  ✅ Git léger (seulement 48 MB)" -ForegroundColor Green
Write-Host "  ✅ Render téléchargera les tools une fois" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 Vous pouvez tester :" -ForegroundColor Cyan
Write-Host "  .\scripts\test_compilation_rapide.ps1" -ForegroundColor Gray
Write-Host ""

