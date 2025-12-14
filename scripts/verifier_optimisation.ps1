#requires -Version 7.0
<#
.SYNOPSIS
  Vérifier que l'optimisation de compilation est bien en place

.DESCRIPTION
  Ce script vérifie que tous les éléments nécessaires pour l'optimisation
  de la compilation sont présents avant de pousser vers Git.
#>

Write-Host ""
Write-Host "🔍 VÉRIFICATION OPTIMISATION COMPILATION" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

$allGood = $true

# 1. Vérifier .arduino15/
Write-Host "1. Dossier .arduino15/" -ForegroundColor Yellow
if (Test-Path ".arduino15") {
    Write-Host "   ✅ Dossier existe" -ForegroundColor Green
    
    # Vérifier le core ESP32
    if (Test-Path ".arduino15\packages\esp32\hardware\esp32\3.3.4") {
        Write-Host "   ✅ Core ESP32 v3.3.4 présent" -ForegroundColor Green
        
        $coreSize = (Get-ChildItem ".arduino15\packages\esp32\hardware" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
        Write-Host "   📦 Taille: $([math]::Round($coreSize, 1)) MB" -ForegroundColor Gray
        
        if ($coreSize -gt 100) {
            Write-Host "   ⚠️ ATTENTION: Taille > 100 MB, peut poser problème sur Git" -ForegroundColor Yellow
            $allGood = $false
        }
    } else {
        Write-Host "   ❌ Core ESP32 NON trouvé" -ForegroundColor Red
        $allGood = $false
    }
    
    # Vérifier .gitignore
    if (Test-Path ".arduino15\.gitignore") {
        Write-Host "   ✅ .gitignore présent (exclut les tools)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ .gitignore manquant" -ForegroundColor Yellow
    }
    
    # Vérifier README.md
    if (Test-Path ".arduino15\README.md") {
        Write-Host "   ✅ README.md présent" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ README.md manquant" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ Dossier .arduino15/ NON trouvé" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""

# 2. Vérifier compile.php
Write-Host "2. Code modifié (compile.php)" -ForegroundColor Yellow
if (Test-Path "api\handlers\firmwares\compile.php") {
    $content = Get-Content "api\handlers\firmwares\compile.php" -Raw
    
    if ($content -match 'ARDUINO_DIRECTORIES_DATA') {
        Write-Host "   ✅ ARDUINO_DIRECTORIES_DATA défini" -ForegroundColor Green
    } else {
        Write-Host "   ❌ ARDUINO_DIRECTORIES_DATA NON défini" -ForegroundColor Red
        $allGood = $false
    }
    
    if ($content -match '\.arduino15') {
        Write-Host "   ✅ Utilise .arduino15/" -ForegroundColor Green
    } else {
        Write-Host "   ❌ N'utilise PAS .arduino15/" -ForegroundColor Red
        $allGood = $false
    }
    
    if ($content -match 'Core ESP32 pré-installé') {
        Write-Host "   ✅ Log de détection du core présent" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Log de détection manquant" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ Fichier compile.php NON trouvé" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""

# 3. Vérifier arduino-cli
Write-Host "3. Arduino-cli" -ForegroundColor Yellow
if (Test-Path "bin\arduino-cli.exe") {
    Write-Host "   ✅ arduino-cli.exe présent dans bin/" -ForegroundColor Green
    
    try {
        $version = & .\bin\arduino-cli.exe version 2>&1 | Select-String -Pattern "Version" | Select-Object -First 1
        if ($version) {
            Write-Host "   📦 $version" -ForegroundColor Gray
        }
    } catch {
        Write-Host "   ⚠️ Impossible de vérifier la version" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ arduino-cli.exe NON trouvé dans bin/" -ForegroundColor Red
    $allGood = $false
}

Write-Host ""

# 4. Vérifier les scripts de test
Write-Host "4. Scripts de test" -ForegroundColor Yellow
$scripts = @(
    "scripts\test_compilation_complete.ps1",
    "scripts\test_compilation_rapide.ps1",
    "scripts\monitor_compilation.ps1",
    "scripts\check_compile_status.ps1"
)

foreach ($script in $scripts) {
    if (Test-Path $script) {
        Write-Host "   ✅ $(Split-Path $script -Leaf)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ $(Split-Path $script -Leaf) manquant" -ForegroundColor Yellow
    }
}

Write-Host ""

# 5. Documentation
Write-Host "5. Documentation" -ForegroundColor Yellow
if (Test-Path "OPTIMISATION_COMPILATION.md") {
    Write-Host "   ✅ OPTIMISATION_COMPILATION.md présent" -ForegroundColor Green
} else {
    Write-Host "   ⚠️ OPTIMISATION_COMPILATION.md manquant" -ForegroundColor Yellow
}

Write-Host ""

# Résultat final
Write-Host "=========================================" -ForegroundColor Cyan
if ($allGood) {
    Write-Host "✅ TOUT EST PRÊT !" -ForegroundColor Green
    Write-Host ""
    Write-Host "Vous pouvez maintenant :" -ForegroundColor White
    Write-Host "  1. Tester localement : .\scripts\test_compilation_rapide.ps1" -ForegroundColor Gray
    Write-Host "  2. Commit : git add .arduino15/ api/ OPTIMISATION_COMPILATION.md" -ForegroundColor Gray
    Write-Host "  3. Push : git push origin main" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Gain attendu : 10-30 min → ~2 min ⚡" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ DES ÉLÉMENTS SONT MANQUANTS" -ForegroundColor Red
    Write-Host ""
    Write-Host "Corrigez les erreurs ci-dessus avant de continuer" -ForegroundColor Yellow
    exit 1
}

