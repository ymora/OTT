# ===============================================================================
# ANALYSE COMPLÈTE DES FICHIERS .PS1 ET .JS
# ===============================================================================
# Identifie tous les fichiers .ps1 et .js obsolètes, redondants ou mal organisés
# Usage : .\scripts\ANALYSER_TOUS_FICHIERS_PS1_JS.ps1
# ===============================================================================

$ErrorActionPreference = "Continue"

function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "[ANALYSE] Tous les fichiers .ps1 et .js du projet" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot + "\.."
Set-Location $rootDir

$results = @{
    Ps1Obsoletes = @()
    Ps1Redondants = @()
    Ps1MalOrganises = @()
    JsObsoletes = @()
    JsRedondants = @()
    JsBuild = @()
    JsMalOrganises = @()
    TotalPs1 = 0
    TotalJs = 0
}

# ===============================================================================
# 1. ANALYSE DES FICHIERS .PS1
# ===============================================================================
Write-Section "1. Analyse des fichiers .ps1"

$allPs1 = Get-ChildItem -Path . -Recurse -Include "*.ps1" -ErrorAction SilentlyContinue | 
    Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\out\\" }

$results.TotalPs1 = $allPs1.Count
Write-Host "Total fichiers .ps1 trouves: $($allPs1.Count)" -ForegroundColor White

# Catégoriser les fichiers .ps1
foreach ($file in $allPs1) {
    $relativePath = $file.FullName.Replace($rootDir + "\", "")
    $fileName = $file.Name
    $dir = $file.DirectoryName.Replace($rootDir + "\", "")
    
    # Scripts de test obsoletes
    if ($fileName -match "^test-|^test_") {
        $results.Ps1Obsoletes += @{
            File = $relativePath
            Reason = "Script de test obsolete"
            Category = "Test"
        }
        continue
    }
    
    # Scripts de migration obsoletes
    if ($fileName -match "migration|migrate|MIGRER") {
        if ($relativePath -notmatch "scripts\\db\\migrate_render.ps1") {
            $results.Ps1Obsoletes += @{
                File = $relativePath
                Reason = "Script de migration obsolete (API le fait automatiquement)"
                Category = "Migration"
            }
            continue
        }
    }
    
    # Scripts redondants
    $redundantPatterns = @(
        @{ Pattern = "AUDIT_PAGES_DASHBOARD"; Reason = "Fonctionnalités intégrées dans AUDIT_COMPLET_AUTOMATIQUE.ps1" },
        @{ Pattern = "diagnostic-deploiement"; Reason = "Redondant avec verifier-deploiement-github-pages.ps1" },
        @{ Pattern = "verifier-base-donnees"; Reason = "Script de test obsolète" },
        @{ Pattern = "audit-complet.js"; Reason = "Version JS obsolète, utiliser .ps1" },
        @{ Pattern = "merge-to-main"; Reason = "Script de merge temporaire" },
        @{ Pattern = "start-php-server"; Reason = "Utiliser docker-compose à la place" }
    )
    
    $isRedundant = $false
    foreach ($pattern in $redundantPatterns) {
        if ($fileName -match $pattern.Pattern) {
            $results.Ps1Redondants += @{
                File = $relativePath
                Reason = $pattern.Reason
                Category = "Redondant"
            }
            $isRedundant = $true
            break
        }
    }
    if ($isRedundant) { continue }
    
    # Scripts mal organises (a la racine ou dans mauvais dossier)
    if ($relativePath -match "^[^\\]+\.ps1$" -and $fileName -ne "MIGRER.ps1") {
        # Script a la racine (sauf MIGRER.ps1 qui est deja marque obsolete)
        if ($fileName -ne "start-php-server.ps1") {
            $results.Ps1MalOrganises += @{
                File = $relativePath
                Reason = "Script a la racine (devrait etre dans scripts/)"
                Category = "Organisation"
            }
        }
    }
    
    # Scripts dans scripts/ mais sans sous-dossier
    if ($relativePath -match "^scripts\\[^\\]+\.ps1$") {
        $category = switch -Wildcard ($fileName) {
            "*test*" { "Test" }
            "*audit*" { "Audit" }
            "*migration*" { "Migration" }
            "*deploy*" { "Deploy" }
            "*hardware*" { "Hardware" }
            "*db*" { "Database" }
            default { "Autre" }
        }
        
        if ($category -ne "Autre") {
            $results.Ps1MalOrganises += @{
                File = $relativePath
                Reason = "Script dans scripts/ devrait etre dans scripts/$category/"
                Category = "Organisation"
            }
        }
    }
}

# ===============================================================================
# 2. ANALYSE DES FICHIERS .JS
# ===============================================================================
Write-Section "2. Analyse des fichiers .js"

$allJs = Get-ChildItem -Path . -Recurse -Include "*.js" -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.FullName -notmatch "\\node_modules\\" -and 
        $_.FullName -notmatch "\\out\\" -and
        $_.FullName -notmatch "\\docs\\_next\\" -and
        $_.FullName -notmatch "\\\.next\\"
    }

$results.TotalJs = $allJs.Count
Write-Host "Total fichiers .js trouves: $($allJs.Count)" -ForegroundColor White

foreach ($file in $allJs) {
    $relativePath = $file.FullName.Replace($rootDir + "\", "")
    $fileName = $file.Name
    $dir = $file.DirectoryName.Replace($rootDir + "\", "")
    
    # Fichiers de build (docs/_next, out/)
    if ($relativePath -match "docs\\_next|out\\_next") {
        $results.JsBuild += @{
            File = $relativePath
            Reason = "Fichier de build (peut être supprimé, sera régénéré)"
            Category = "Build"
        }
        continue
    }
    
    # Scripts de test obsoletes
    if ($fileName -match "^test-|^test_") {
        if ($relativePath -match "^scripts\\") {
            $results.JsObsoletes += @{
                File = $relativePath
                Reason = "Script de test obsolete"
                Category = "Test"
            }
            continue
        }
    }
    
    # audit-complet.js obsolete
    if ($fileName -eq "audit-complet.js") {
        $results.JsObsoletes += @{
            File = $relativePath
            Reason = "Version JS obsolete, utiliser AUDIT_COMPLET_AUTOMATIQUE.ps1"
            Category = "Redondant"
        }
        continue
    }
    
    # Fichiers .js a la racine (sauf next.config.js, instrumentation.js, jest.setup.js)
    $allowedRootJs = @("next.config.js", "instrumentation.js", "jest.setup.js")
    if ($relativePath -match "^[^\\]+\.js$" -and $allowedRootJs -notcontains $fileName) {
        $results.JsMalOrganises += @{
            File = $relativePath
            Reason = "Fichier .js a la racine (devrait etre dans lib/, scripts/, ou components/)"
            Category = "Organisation"
        }
    }
}

# ===============================================================================
# 3. RÉSUMÉ
# ===============================================================================
Write-Section "3. Résumé"

Write-Host "Fichiers .ps1:" -ForegroundColor Yellow
Write-Host "  Total: $($results.TotalPs1)" -ForegroundColor White
Write-Host "  Obsoletes: $($results.Ps1Obsoletes.Count)" -ForegroundColor Red
Write-Host "  Redondants: $($results.Ps1Redondants.Count)" -ForegroundColor Yellow
Write-Host "  Mal organises: $($results.Ps1MalOrganises.Count)" -ForegroundColor Yellow

Write-Host "`nFichiers .js:" -ForegroundColor Yellow
Write-Host "  Total: $($results.TotalJs)" -ForegroundColor White
Write-Host "  Obsoletes: $($results.JsObsoletes.Count)" -ForegroundColor Red
Write-Host "  Redondants: $($results.JsRedondants.Count)" -ForegroundColor Yellow
Write-Host "  Build (a nettoyer): $($results.JsBuild.Count)" -ForegroundColor Yellow
Write-Host "  Mal organises: $($results.JsMalOrganises.Count)" -ForegroundColor Yellow

$totalProblemes = $results.Ps1Obsoletes.Count + $results.Ps1Redondants.Count + $results.Ps1MalOrganises.Count + 
                  $results.JsObsoletes.Count + $results.JsRedondants.Count + $results.JsBuild.Count + $results.JsMalOrganises.Count

Write-Host "`nTOTAL PROBLEMES: $totalProblemes" -ForegroundColor Cyan

# ===============================================================================
# 4. DÉTAILS
# ===============================================================================
Write-Section "4. Details - Fichiers .ps1 obsoletes"
foreach ($item in $results.Ps1Obsoletes) {
    Write-Warn "$($item.File) - $($item.Reason)"
}

Write-Section "5. Details - Fichiers .ps1 redondants"
foreach ($item in $results.Ps1Redondants) {
    Write-Warn "$($item.File) - $($item.Reason)"
}

Write-Section "6. Details - Fichiers .ps1 mal organises"
foreach ($item in $results.Ps1MalOrganises) {
    Write-Warn "$($item.File) - $($item.Reason)"
}

Write-Section "7. Details - Fichiers .js obsoletes"
foreach ($item in $results.JsObsoletes) {
    Write-Warn "$($item.File) - $($item.Reason)"
}

Write-Section "8. Détails - Fichiers .js de build"
Write-Host "  (Premiers 10 fichiers de build sur $($results.JsBuild.Count))" -ForegroundColor Gray
foreach ($item in $results.JsBuild | Select-Object -First 10) {
    Write-Warn "$($item.File)"
}
if ($results.JsBuild.Count -gt 10) {
    Write-Host "  ... et $($results.JsBuild.Count - 10) autres fichiers de build" -ForegroundColor Gray
}

# ===============================================================================
# 9. GÉNÉRER RAPPORT
# ===============================================================================
$reportPath = "ANALYSE_PS1_JS_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
$reportLines = @()
$reportLines += "==============================================================================="
$reportLines += "RAPPORT ANALYSE FICHIERS .PS1 ET .JS"
$reportLines += "==============================================================================="
$reportLines += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$reportLines += ""
$reportLines += "FICHIERS .PS1"
$reportLines += "  Total: $($results.TotalPs1)"
$reportLines += "  Obsoletes: $($results.Ps1Obsoletes.Count)"
$reportLines += "  Redondants: $($results.Ps1Redondants.Count)"
$reportLines += "  Mal organises: $($results.Ps1MalOrganises.Count)"
$reportLines += ""
$reportLines += "FICHIERS .JS"
$reportLines += "  Total: $($results.TotalJs)"
$reportLines += "  Obsoletes: $($results.JsObsoletes.Count)"
$reportLines += "  Redondants: $($results.JsRedondants.Count)"
$reportLines += "  Build: $($results.JsBuild.Count)"
$reportLines += "  Mal organises: $($results.JsMalOrganises.Count)"
$reportLines += ""
$reportLines += "TOTAL PROBLEMES: $totalProblemes"
$reportLines += ""
$reportLines += "==============================================================================="
$reportLines += "DETAILS"
$reportLines += "==============================================================================="
$reportLines += ""
$reportLines += "PS1 OBSOLETES:"
$results.Ps1Obsoletes | ForEach-Object { $reportLines += "  - $($_.File) : $($_.Reason)" }
$reportLines += ""
$reportLines += "PS1 REDONDANTS:"
$results.Ps1Redondants | ForEach-Object { $reportLines += "  - $($_.File) : $($_.Reason)" }
$reportLines += ""
$reportLines += "PS1 MAL ORGANISES:"
$results.Ps1MalOrganises | ForEach-Object { $reportLines += "  - $($_.File) : $($_.Reason)" }
$reportLines += ""
$reportLines += "JS OBSOLETES:"
$results.JsObsoletes | ForEach-Object { $reportLines += "  - $($_.File) : $($_.Reason)" }
$reportLines += ""
$reportLines += "JS BUILD (premiers 20):"
$results.JsBuild | Select-Object -First 20 | ForEach-Object { $reportLines += "  - $($_.File)" }
if ($results.JsBuild.Count -gt 20) {
    $reportLines += "  ... et $($results.JsBuild.Count - 20) autres"
}
$reportLines += ""
$reportLines += "==============================================================================="

$reportLines | Out-File -FilePath $reportPath -Encoding UTF8
Write-OK "Rapport detaille sauvegarde: $reportPath"

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

