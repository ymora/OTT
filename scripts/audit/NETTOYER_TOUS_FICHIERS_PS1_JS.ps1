# ===============================================================================
# NETTOYAGE COMPLET DES FICHIERS .PS1 ET .JS OBSOLÈTES
# ===============================================================================
# Supprime tous les fichiers .ps1 et .js obsolètes, redondants ou mal organisés
# Usage : .\scripts\NETTOYER_TOUS_FICHIERS_PS1_JS.ps1 [-DryRun]
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
Write-Host "[NETTOYAGE] Suppression fichiers .ps1 et .js obsoletes" -ForegroundColor Cyan
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
# FICHIERS .PS1 OBSOLÈTES (17 fichiers)
# ===============================================================================
Write-Section "Fichiers .ps1 obsoletes (17 fichiers)"

$ps1Obsoletes = @(
    "audit\test-api-modules.ps1",
    "scripts\apply-migration-gps.ps1",
    "scripts\apply-migration-min-max.ps1",
    "scripts\run-config-migration-direct.ps1",
    "scripts\run-config-migration-simple.ps1",
    "scripts\run-config-migration.ps1",
    "scripts\test-api-endpoints.ps1",
    "scripts\test-check-measurement.ps1",
    "scripts\test-config-migration.ps1",
    "scripts\test-database-firmware.ps1",
    "scripts\test-firmware-measurement.ps1",
    "scripts\test-migration-min-max.ps1",
    "scripts\test-send-measurement.ps1",
    "MIGRER.ps1",
    "test-users-api.ps1",
    "test_compile.ps1",
    "test_compile_sse.ps1"
)

foreach ($file in $ps1Obsoletes) {
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
# FICHIERS .PS1 REDONDANTS (5 fichiers)
# ===============================================================================
Write-Section "Fichiers .ps1 redondants (5 fichiers)"

$ps1Redondants = @(
    "scripts\AUDIT_PAGES_DASHBOARD.ps1",
    "scripts\diagnostic-deploiement.ps1",
    "scripts\verifier-base-donnees.ps1",
    "merge-to-main.ps1",
    "start-php-server.ps1"
)

foreach ($file in $ps1Redondants) {
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
# FICHIERS .JS OBSOLÈTES (1 fichier)
# ===============================================================================
Write-Section "Fichiers .js obsoletes (1 fichier)"

$jsObsoletes = @(
    "scripts\audit-complet.js"
)

foreach ($file in $jsObsoletes) {
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
# FICHIERS SQL OBSOLÈTES (2 fichiers)
# ===============================================================================
Write-Section "Fichiers SQL obsoletes (2 fichiers)"

$sqlObsoletes = @(
    "sql\add_config_columns.sql",
    "sql\migration_add_min_max_columns.sql"
)

foreach ($file in $sqlObsoletes) {
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
# RÉSUMÉ
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

