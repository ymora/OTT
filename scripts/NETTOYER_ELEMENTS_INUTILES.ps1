# ===============================================================================
# NETTOYAGE DES ELEMENTS INUTILES - OTT Dashboard
# ===============================================================================
# Supprime les fichiers, dossiers et code mort identifies comme inutiles
# Usage : .\scripts\NETTOYER_ELEMENTS_INUTILES.ps1 [-DryRun]
# ===============================================================================

param(
    [switch]$DryRun = $false
)

$ErrorActionPreference = "Continue"

function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "[NETTOYAGE] Suppression des elements inutiles" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "MODE DRY-RUN (simulation - aucun fichier ne sera supprime)" -ForegroundColor Yellow
}
Write-Host "Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot + "\.."
Set-Location $rootDir

$deleted = 0
$skipped = 0

# ===============================================================================
# 1. FICHIERS TEMPORAIRES
# ===============================================================================
Write-Section "1. Fichiers temporaires"

$tempFiles = @(
    "audit_result.txt",
    "audit_resultat_20251210_001712.txt",
    "audit_resultat_20251210_184809.txt",
    "audit_final_20251210_190625.txt",
    "logs_serie_20251206_090656.log",
    "docs\AUDIT_COMPLET.json"
)

foreach ($file in $tempFiles) {
    $path = Join-Path $rootDir $file
    if (Test-Path $path) {
        if ($DryRun) {
            Write-Warn "DRY-RUN: Supprimerait $file"
        } else {
            try {
                Remove-Item $path -Force -ErrorAction Stop
                Write-OK "Supprime: $file"
                $deleted++
            } catch {
                Write-Err "Erreur suppression $file : $_"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 2. SCRIPTS DE MIGRATION REDONDANTS
# ===============================================================================
Write-Section "2. Scripts de migration redondants"

$migrationScripts = @(
    "scripts\run-config-migration.ps1",
    "scripts\run-config-migration-simple.ps1",
    "scripts\run-config-migration-direct.ps1",
    "scripts\test-config-migration.ps1",
    "scripts\apply-migration-gps.ps1",
    "scripts\apply-migration-min-max.ps1",
    "scripts\test-migration-min-max.ps1",
    "MIGRER.ps1"
)

foreach ($script in $migrationScripts) {
    $path = Join-Path $rootDir $script
    if (Test-Path $path) {
        if ($DryRun) {
            Write-Warn "DRY-RUN: Supprimerait $script"
        } else {
            try {
                Remove-Item $path -Force -ErrorAction Stop
                Write-OK "Supprime: $script"
                $deleted++
            } catch {
                Write-Err "Erreur suppression $script : $_"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 3. FICHIERS DE TEST OBSOLETES
# ===============================================================================
Write-Section "3. Fichiers de test obsoletes"

$testFiles = @(
    "test_compile_cli.php",
    "test_compile_endpoint.html",
    "test_compile_sse.ps1",
    "test_compile.ps1",
    "test-archived-users-debug.html",
    "test-users-api.ps1",
    "scripts\test-database-firmware.ps1",
    "scripts\test-database-measurements.php",
    "scripts\test-database-schema.sql",
    "scripts\test-firmware-measurement.ps1",
    "scripts\test-api-endpoints.ps1",
    "scripts\test-check-measurement.ps1",
    "scripts\test-send-measurement.ps1",
    "scripts\test-send-measurement.sh",
    "scripts\test-gps-column.js",
    "scripts\test-ota-measurements.sql",
    "scripts\check-measurements-direct.php"
)

foreach ($testFile in $testFiles) {
    $path = Join-Path $rootDir $testFile
    if (Test-Path $path) {
        if ($DryRun) {
            Write-Warn "DRY-RUN: Supprimerait $testFile"
        } else {
            try {
                Remove-Item $path -Force -ErrorAction Stop
                Write-OK "Supprime: $testFile"
                $deleted++
            } catch {
                Write-Err "Erreur suppression $testFile : $_"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 4. SCRIPTS REDONDANTS
# ===============================================================================
Write-Section "4. Scripts redondants"

$redundantScripts = @(
    "scripts\AUDIT_PAGES_DASHBOARD.ps1",
    "scripts\diagnostic-deploiement.ps1",
    "scripts\verifier-base-donnees.ps1",
    "scripts\audit-complet.js",
    "merge-to-main.ps1",
    "start-php-server.ps1"
)

foreach ($script in $redundantScripts) {
    $path = Join-Path $rootDir $script
    if (Test-Path $path) {
        if ($DryRun) {
            Write-Warn "DRY-RUN: Supprimerait $script"
        } else {
            try {
                Remove-Item $path -Force -ErrorAction Stop
                Write-OK "Supprime: $script"
                $deleted++
            } catch {
                Write-Err "Erreur suppression $script : $_"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 5. FICHIERS DUPLIQUES DANS DOCS/
# ===============================================================================
Write-Section "5. Fichiers dupliques dans docs/"

$duplicates = @(
    "docs\icon-192.png",
    "docs\icon-512.png",
    "docs\manifest.json",
    "docs\sw.js",
    "docs\migrate.html",
    "docs\monitor-reboot.js"
)

foreach ($file in $duplicates) {
    $path = Join-Path $rootDir $file
    if (Test-Path $path) {
        if ($DryRun) {
            Write-Warn "DRY-RUN: Supprimerait $file (existe aussi dans public/)"
        } else {
            try {
                Remove-Item $path -Force -ErrorAction Stop
                Write-OK "Supprime: $file"
                $deleted++
            } catch {
                Write-Err "Erreur suppression $file : $_"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 6. SUIVI_TEMPS_FACTURATION.md DUPLIQUE (racine)
# ===============================================================================
Write-Section "6. Fichier SUIVI_TEMPS_FACTURATION.md duplique"

$duplicateFile = "SUIVI_TEMPS_FACTURATION.md"
$path = Join-Path $rootDir $duplicateFile
if (Test-Path $path) {
    if ($DryRun) {
        Write-Warn "DRY-RUN: Supprimerait $duplicateFile (existe aussi dans public/)"
    } else {
        try {
            Remove-Item $path -Force -ErrorAction Stop
            Write-OK "Supprime: $duplicateFile"
            $deleted++
        } catch {
            Write-Err "Erreur suppression $duplicateFile : $_"
            $skipped++
        }
    }
}

# ===============================================================================
# 7. DOCUMENTATION OBSOLETE
# ===============================================================================
Write-Section "7. Documentation obsolete"

$obsDoc = @(
    "docs\EXPLICATION_DEPLOIEMENT_GITHUB_PAGES.md"
)

foreach ($doc in $obsDoc) {
    $path = Join-Path $rootDir $doc
    if (Test-Path $path) {
        if ($DryRun) {
            Write-Warn "DRY-RUN: Supprimerait $doc"
        } else {
            try {
                Remove-Item $path -Force -ErrorAction Stop
                Write-OK "Supprime: $doc"
                $deleted++
            } catch {
                Write-Err "Erreur suppression $doc : $_"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 8. CODE MORT - FONCTIONS NON UTILISEES
# ===============================================================================
Write-Section "8. Code mort - Fonctions non utilisees"

# Verifier createUpdateCalibrationCommand
$calibrationCommandUsed = Select-String -Path "components\**\*.js","app\**\*.js" -Pattern "createUpdateCalibrationCommand\(|createUpdateCalibrationCommand\s" -ErrorAction SilentlyContinue
if ($calibrationCommandUsed.Count -eq 0) {
    Write-Warn "Fonction createUpdateCalibrationCommand non utilisee (importee mais jamais appelee)"
    Write-Warn "  Fichier: lib\deviceCommands.js"
    Write-Warn "  Action: Supprimer l'import dans components\configuration\UsbStreamingTab.js"
    Write-Warn "  Action: Supprimer la fonction createUpdateCalibrationCommand dans lib\deviceCommands.js"
    Write-Warn "  Action: Supprimer buildUpdateCalibrationPayload si non utilisee"
}

# ===============================================================================
# 9. DOSSIERS VIDES
# ===============================================================================
Write-Section "9. Dossiers vides"

$emptyDirs = @(
    "docs\archive",
    "audit\reports"
)

foreach ($dir in $emptyDirs) {
    $path = Join-Path $rootDir $dir
    if (Test-Path $path) {
        $items = Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue
        if ($items.Count -eq 0) {
            if ($DryRun) {
                Write-Warn "DRY-RUN: Supprimerait dossier vide $dir"
            } else {
                try {
                    Remove-Item $path -Force -ErrorAction Stop
                    Write-OK "Supprime dossier vide: $dir"
                    $deleted++
                } catch {
                    Write-Err "Erreur suppression $dir : $_"
                    $skipped++
                }
            }
        }
    }
}

# ===============================================================================
# 10. DOSSIER OUT/ (BUILD) - OPTIONNEL
# ===============================================================================
Write-Section "10. Dossier out/ (build)"

if (Test-Path "out") {
    $outFiles = Get-ChildItem -Path "out" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    if ($outFiles.Count -gt 0) {
        Write-Warn "Dossier out/ contient $($outFiles.Count) fichier(s) de build"
        Write-Warn "  Note: Ce dossier est genere automatiquement par 'npm run build'"
        Write-Warn "  Action: Peut etre supprime, sera regenere au prochain build"
        if (-not $DryRun) {
            $confirm = Read-Host "  Supprimer le dossier out/ ? (o/N)"
            if ($confirm -eq "o" -or $confirm -eq "O") {
                try {
                    Remove-Item "out" -Recurse -Force -ErrorAction Stop
                    Write-OK "Supprime: out/"
                    $deleted++
                } catch {
                    Write-Err "Erreur suppression out/ : $_"
                    $skipped++
                }
            } else {
                Write-OK "Conserve: out/"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# 11. DOSSIER DOCS/_NEXT/ (BUILD) - OPTIONNEL
# ===============================================================================
Write-Section "11. Dossier docs/_next/ (build)"

if (Test-Path "docs\_next") {
    $nextFiles = Get-ChildItem -Path "docs\_next" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    if ($nextFiles.Count -gt 0) {
        Write-Warn "Dossier docs/_next/ contient $($nextFiles.Count) fichier(s) de build"
        Write-Warn "  Note: Ce dossier est genere automatiquement par le build Next.js"
        Write-Warn "  Action: Peut etre supprime, sera regenere au prochain build"
        if (-not $DryRun) {
            $confirm = Read-Host "  Supprimer le dossier docs/_next/ ? (o/N)"
            if ($confirm -eq "o" -or $confirm -eq "O") {
                try {
                    Remove-Item "docs\_next" -Recurse -Force -ErrorAction Stop
                    Write-OK "Supprime: docs/_next/"
                    $deleted++
                } catch {
                    Write-Err "Erreur suppression docs/_next/ : $_"
                    $skipped++
                }
            } else {
                Write-OK "Conserve: docs/_next/"
                $skipped++
            }
        }
    }
}

# ===============================================================================
# RESUME
# ===============================================================================
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "RESUME DU NETTOYAGE" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Host "MODE DRY-RUN: Aucun fichier n'a ete supprime" -ForegroundColor Yellow
    Write-Host "  Pour supprimer reellement, executez sans -DryRun" -ForegroundColor Yellow
} else {
    Write-Host "Fichiers supprimes: $deleted" -ForegroundColor Green
    Write-Host "Fichiers ignores: $skipped" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

