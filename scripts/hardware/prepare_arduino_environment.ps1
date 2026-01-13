# ================================================================================
# Script de préparation de l'environnement Arduino pour compilation
# ================================================================================
# Télécharge et installe tous les fichiers nécessaires pour la compilation :
# - Core ESP32 (arduino-cli core install esp32:esp32)
# - Librairies (TinyGSM depuis hardware/lib/)
# - Met à jour l'index des cores
# ================================================================================

$ErrorActionPreference = "Stop"

# Obtenir le répertoire du script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$hardwareDir = Join-Path $projectRoot "hardware"
$arduinoDataDir = Join-Path $hardwareDir "arduino-data"

Write-Host "🔧 Préparation de l'environnement Arduino pour compilation rapide" -ForegroundColor Cyan
Write-Host ""

# ================================================================================
# 1. Vérifier que arduino-cli est disponible
# ================================================================================
Write-Host "📋 Étape 1/4: Vérification d'arduino-cli..." -ForegroundColor Yellow

$arduinoCli = $null

# 1. Chercher dans bin/ du projet
$localArduinoCli = Join-Path $projectRoot "bin\arduino-cli.exe"
if (Test-Path $localArduinoCli) {
    $arduinoCli = $localArduinoCli
    Write-Host "  ✅ arduino-cli trouvé dans bin/ du projet" -ForegroundColor Green
} else {
    # 2. Chercher dans le PATH système
    $pathCli = Get-Command arduino-cli -ErrorAction SilentlyContinue
    if ($pathCli) {
        $arduinoCli = $pathCli.Source
        Write-Host "  ✅ arduino-cli trouvé dans le PATH système: $arduinoCli" -ForegroundColor Green
    } else {
        Write-Host "  ❌ arduino-cli non trouvé !" -ForegroundColor Red
        Write-Host "  💡 Options:" -ForegroundColor Yellow
        Write-Host "     - Téléchargez arduino-cli: .\scripts\hardware\download_arduino_cli.ps1" -ForegroundColor Gray
        Write-Host "     - Ou installez-le globalement: https://arduino.github.io/arduino-cli/latest/installation/" -ForegroundColor Gray
        exit 1
    }
}

# Tester arduino-cli
try {
    $version = & $arduinoCli version 2>&1
    Write-Host "  ℹ️  Version: $($version -join ' ')" -ForegroundColor Gray
} catch {
    Write-Host "  ❌ Erreur lors de l'exécution d'arduino-cli: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ================================================================================
# 2. Créer le répertoire hardware/arduino-data si nécessaire
# ================================================================================
Write-Host "📋 Étape 2/4: Configuration du répertoire arduino-data..." -ForegroundColor Yellow

if (-not (Test-Path $arduinoDataDir)) {
    Write-Host "  📁 Création du répertoire hardware/arduino-data..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $arduinoDataDir -Force | Out-Null
    Write-Host "  ✅ Répertoire créé" -ForegroundColor Green
} else {
    Write-Host "  ✅ Répertoire hardware/arduino-data existe déjà" -ForegroundColor Green
}

# Définir ARDUINO_DIRECTORIES_USER
$env:ARDUINO_DIRECTORIES_USER = $arduinoDataDir
Write-Host "  ℹ️  ARDUINO_DIRECTORIES_USER = $arduinoDataDir" -ForegroundColor Gray

Write-Host ""

# ================================================================================
# 3. Vérifier et installer le core ESP32
# ================================================================================
Write-Host "📋 Étape 3/4: Vérification du core ESP32..." -ForegroundColor Yellow

# Vérifier si le core est déjà installé
$corePath = Join-Path $arduinoDataDir "packages\esp32\hardware\esp32"
$coreInstalled = Test-Path $corePath

if ($coreInstalled) {
    Write-Host "  ✅ Core ESP32 déjà installé dans hardware/arduino-data/" -ForegroundColor Green
    $coreSize = (Get-ChildItem -Path $corePath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  ℹ️  Taille: $([math]::Round($coreSize, 2)) MB" -ForegroundColor Gray
} else {
    Write-Host "  ⏳ Core ESP32 non installé, installation en cours..." -ForegroundColor Cyan
    Write-Host "  ⚠️  Cette opération peut prendre plusieurs minutes (~568MB à télécharger)..." -ForegroundColor Yellow
    Write-Host ""
    
    # Mettre à jour l'index des cores (seulement si nécessaire)
    $indexFile = Join-Path $arduinoDataDir "package_index.json"
    $shouldUpdateIndex = $true
    if (Test-Path $indexFile) {
        $indexAge = (Get-Date) - (Get-Item $indexFile).LastWriteTime
        if ($indexAge.TotalHours -lt 24) {
            $shouldUpdateIndex = $false
            Write-Host "  ✅ Index des cores récent (moins de 24h), pas besoin de mise à jour" -ForegroundColor Green
        }
    }
    
    if ($shouldUpdateIndex) {
        Write-Host "  🔄 Mise à jour de l'index des cores Arduino..." -ForegroundColor Cyan
        & $arduinoCli core update-index 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  ✅ Index mis à jour" -ForegroundColor Green
        } else {
            Write-Host "  ⚠️  Avertissement lors de la mise à jour de l'index (continuons quand même)" -ForegroundColor Yellow
        }
    }
    
    Write-Host "  📥 Téléchargement et installation du core ESP32..." -ForegroundColor Cyan
    Write-Host "  ⏳ Veuillez patienter, cette étape peut prendre 5-15 minutes selon votre connexion..." -ForegroundColor Yellow
    
    # Installer le core ESP32 avec verbose pour voir la progression
    $output = & $arduinoCli core install esp32:esp32 --verbose 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ Core ESP32 installé avec succès !" -ForegroundColor Green
        $coreSize = (Get-ChildItem -Path $corePath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "  ℹ️  Taille finale: $([math]::Round($coreSize, 2)) MB" -ForegroundColor Gray
    } else {
        Write-Host "  ❌ Erreur lors de l'installation du core ESP32" -ForegroundColor Red
        Write-Host "  Détails:" -ForegroundColor Yellow
        $output | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
        exit 1
    }
}

Write-Host ""

# ================================================================================
# 4. Copier les librairies nécessaires dans arduino-data/libraries
# ================================================================================
Write-Host "📋 Étape 4/4: Installation des librairies..." -ForegroundColor Yellow

$hardwareLibDir = Join-Path $hardwareDir "lib"
$arduinoDataLibrariesDir = Join-Path $arduinoDataDir "libraries"

if (-not (Test-Path $hardwareLibDir)) {
    Write-Host "  ⚠️  Répertoire hardware/lib/ non trouvé, pas de librairies à installer" -ForegroundColor Yellow
    Write-Host ""
} else {
    # Créer le répertoire libraries si nécessaire
    if (-not (Test-Path $arduinoDataLibrariesDir)) {
        New-Item -ItemType Directory -Path $arduinoDataLibrariesDir -Force | Out-Null
    }
    
    # Trouver les librairies TinyGSM
    $libraryDirs = Get-ChildItem -Path $hardwareLibDir -Directory -Filter "TinyGSM*"
    
    if ($libraryDirs.Count -eq 0) {
        Write-Host "  ⚠️  Aucune librairie TinyGSM trouvée dans hardware/lib/" -ForegroundColor Yellow
    } else {
        foreach ($libDir in $libraryDirs) {
            $libName = $libDir.Name
            $targetLibDir = Join-Path $arduinoDataLibrariesDir $libName
            
            if (Test-Path $targetLibDir) {
                Write-Host "  ✅ Librairie $libName déjà installée dans arduino-data/libraries/" -ForegroundColor Green
            } else {
                Write-Host "  📚 Installation de la librairie $libName..." -ForegroundColor Cyan
                
                # Copier récursivement
                Copy-Item -Path $libDir.FullName -Destination $targetLibDir -Recurse -Force
                
                if (Test-Path $targetLibDir) {
                    $libSize = (Get-ChildItem -Path $targetLibDir -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1KB
                    Write-Host "  ✅ Librairie $libName installée ($([math]::Round($libSize, 2)) KB)" -ForegroundColor Green
                } else {
                    Write-Host "  ❌ Erreur lors de l'installation de $libName" -ForegroundColor Red
                }
            }
        }
    }
}

Write-Host ""

# ================================================================================
# Résumé final
# ================================================================================
Write-Host "✅ Préparation terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Résumé:" -ForegroundColor Cyan
Write-Host "  ✅ arduino-cli: $arduinoCli" -ForegroundColor White
Write-Host "  ✅ Répertoire arduino-data: $arduinoDataDir" -ForegroundColor White

if ($coreInstalled -or (Test-Path $corePath)) {
    $coreSize = (Get-ChildItem -Path $corePath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "  ✅ Core ESP32: Installé ($([math]::Round($coreSize, 2)) MB)" -ForegroundColor White
} else {
    Write-Host "  ❌ Core ESP32: Non installé" -ForegroundColor Red
}

$installedLibs = @()
if (Test-Path $arduinoDataLibrariesDir) {
    $installedLibs = Get-ChildItem -Path $arduinoDataLibrariesDir -Directory | Select-Object -ExpandProperty Name
}
if ($installedLibs.Count -gt 0) {
    Write-Host "  ✅ Librairies: $($installedLibs -join ', ')" -ForegroundColor White
} else {
    Write-Host "  ⚠️  Librairies: Aucune installée" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "💡 L'environnement est prêt pour la compilation !" -ForegroundColor Green
Write-Host "   Les compilations futures seront plus rapides car tout est déjà téléchargé." -ForegroundColor Gray








