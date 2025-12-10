# ================================================================================
# REORGANISATION COMPLÈTE DU PROJET
# ================================================================================
# Analyse et réorganise tous les fichiers du projet selon les bonnes pratiques
# Usage: .\scripts\REORGANISER_PROJET.ps1 [-DryRun] [-AutoFix]
# ================================================================================

param(
    [switch]$DryRun = $false,
    [switch]$AutoFix = $false
)

$ErrorActionPreference = "Continue"

function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  [INFO] $Text" -ForegroundColor Gray }

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     REORGANISATION COMPLÈTE DU PROJET OTT                    ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($DryRun) {
    Write-Warn "Mode DRY-RUN activé - Aucune modification ne sera effectuée"
}

# ================================================================================
# 1. FICHIERS À LA RACINE À SUPPRIMER/DÉPLACER
# ================================================================================

Write-Section "1. Analyse fichiers à la racine"

$rootFilesToDelete = @(
    @{ File = "test_compile.ps1"; Reason = "Script de test obsolète" },
    @{ File = "test_compile_sse.ps1"; Reason = "Script de test obsolète" },
    @{ File = "SCRIPTS_MIGRATION_OBSOLETES.md"; Reason = "Documentation obsolète (déjà traitée)" },
    @{ File = "ANALYSE_ELEMENTS_INUTILES_20251210_224625.txt"; Reason = "Rapport d'audit temporaire" },
    @{ File = "ANALYSE_PS1_JS_20251210_225638.txt"; Reason = "Rapport d'audit temporaire" }
)

$rootFilesToMove = @()

foreach ($item in $rootFilesToDelete) {
    $path = Join-Path (Get-Location) $item.File
    if (Test-Path $path) {
        Write-Warn "$($item.File) - $($item.Reason)"
        if ($AutoFix -and -not $DryRun) {
            Remove-Item $path -Force
            Write-OK "Supprimé: $($item.File)"
        }
    }
}

# ================================================================================
# 2. RÉORGANISATION DES SCRIPTS
# ================================================================================

Write-Section "2. Analyse organisation scripts/"

# Structure cible pour scripts/
$scriptsStructure = @{
    "scripts/audit" = @(
        "AUDIT_COMPLET_AUTOMATIQUE.ps1",
        "AUDITER_AUDIT_COMPLET.ps1",
        "ANALYSER_ELEMENTS_INUTILES.ps1",
        "ANALYSER_TOUS_FICHIERS_PS1_JS.ps1",
        "NETTOYER_ELEMENTS_INUTILES.ps1",
        "NETTOYER_TOUS_FICHIERS_PS1_JS.ps1",
        "audit-database.ps1",
        "audit-firmware.ps1"
    )
    "scripts/verification" = @(
        "verifier-deploiement-github-pages.ps1",
        "verifier-synchronisation-deploiement.ps1"
    )
    "scripts/monitoring" = @(
        "MONITOR_SERIE_COM3.ps1",
        "ANALYSER_LOGS_FIRMWARE.ps1"
    )
    "scripts/cleanup" = @(
        "nettoyer-md.ps1"
    )
}

$scriptsToMove = @()

foreach ($targetDir in $scriptsStructure.Keys) {
    $targetPath = Join-Path (Get-Location) $targetDir
    foreach ($script in $scriptsStructure[$targetDir]) {
        $sourcePath = Join-Path (Get-Location) "scripts\$script"
        if (Test-Path $sourcePath) {
            $relativePath = $sourcePath.Replace((Get-Location).Path + "\", "")
            $targetRelativePath = Join-Path $targetDir $script
            if ($relativePath -ne $targetRelativePath) {
                Write-Warn "$script → $targetDir"
                $scriptsToMove += @{
                    Source = $sourcePath
                    Target = Join-Path $targetPath $script
                    TargetDir = $targetPath
                }
            }
        }
    }
}

if ($AutoFix -and -not $DryRun) {
    foreach ($move in $scriptsToMove) {
        if (-not (Test-Path $move.TargetDir)) {
            New-Item -ItemType Directory -Path $move.TargetDir -Force | Out-Null
            Write-OK "Créé: $($move.TargetDir)"
        }
        Move-Item $move.Source $move.Target -Force
        Write-OK "Déplacé: $($move.Source) → $($move.Target)"
    }
}

# ================================================================================
# 3. DOCUMENTATION DUPLIQUÉE/OBSOLÈTE
# ================================================================================

Write-Section "3. Analyse documentation"

$docsToDelete = @(
    @{ File = "docs\VALEURS_DEFAUT_FIRMWARE.md"; Reason = "Déjà intégré dans DOCUMENTATION_DEVELOPPEURS.html" },
    @{ File = "docs\SYNCHRONISATION_DEPLOIEMENT.md"; Reason = "À vérifier si utilisé" }
)

foreach ($doc in $docsToDelete) {
    $path = Join-Path (Get-Location) $doc.File
    if (Test-Path $path) {
        # Vérifier si le fichier est référencé
        $referenced = Select-String -Path "*.md","*.js","*.jsx","*.ts","*.tsx","*.html" -Pattern ([regex]::Escape($doc.File)) -ErrorAction SilentlyContinue
        if ($referenced.Count -eq 0) {
            Write-Warn "$($doc.File) - $($doc.Reason) (non référencé)"
            if ($AutoFix -and -not $DryRun) {
                Remove-Item $path -Force
                Write-OK "Supprimé: $($doc.File)"
            }
        } else {
            Write-Info "$($doc.File) - Référencé $($referenced.Count) fois (conservé)"
        }
    }
}

# ================================================================================
# 4. FICHIERS DE BUILD À IGNORER
# ================================================================================

Write-Section "4. Vérification fichiers de build"

$buildDirs = @("out", "docs\_next", ".next")
foreach ($dir in $buildDirs) {
    $path = Join-Path (Get-Location) $dir
    if (Test-Path $path) {
        $items = Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue | Measure-Object
        if ($items.Count -gt 0) {
            Write-Warn "$dir/ contient $($items.Count) fichiers (devrait être dans .gitignore)"
        }
    }
}

# ================================================================================
# 5. RÉSUMÉ
# ================================================================================

Write-Section "5. Résumé"

$totalActions = $rootFilesToDelete.Count + $scriptsToMove.Count + $docsToDelete.Count

Write-Host ""
if ($DryRun) {
    Write-Info "Mode DRY-RUN: $totalActions action(s) identifiée(s)"
    Write-Info "Pour appliquer les changements, exécutez: .\scripts\REORGANISER_PROJET.ps1 -AutoFix"
} elseif ($AutoFix) {
    Write-OK "Réorganisation terminée ! $totalActions action(s) effectuée(s)"
} else {
    Write-Info "Pour voir les changements proposés: .\scripts\REORGANISER_PROJET.ps1 -DryRun"
    Write-Info "Pour appliquer les changements: .\scripts\REORGANISER_PROJET.ps1 -AutoFix"
}

Write-Host ""

