# ===============================================================================
# ANALYSE DES ÉLÉMENTS INUTILES - OTT Dashboard
# ===============================================================================
# Identifie les fichiers, dossiers, code mort et éléments redondants
# Usage : .\scripts\ANALYSER_ELEMENTS_INUTILES.ps1
# ===============================================================================

$ErrorActionPreference = "Continue"

function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  [INFO] $Text" -ForegroundColor Gray }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "[ANALYSE] Identification des éléments inutiles" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = $PSScriptRoot + "\.."
Set-Location $rootDir

$results = @{
    FichiersLogs = @()
    ScriptsRedondants = @()
    FichiersTestObsoletes = @()
    DossiersVides = @()
    FichiersDupliques = @()
    CodeMort = @()
    ImportsNonUtilises = @()
    FichiersTemporaires = @()
    DocumentationObsolete = @()
    ScriptsMigrationRedondants = @()
}

# ===============================================================================
# 1. FICHIERS DE LOGS OBSOLÈTES
# ===============================================================================
Write-Section "1. Fichiers de logs obsolètes"

$logFiles = Get-ChildItem -Path . -Recurse -Include "*.log","*.txt" -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.Name -match "^(audit_result|logs_serie|audit_resultat)" -or
        $_.FullName -match "\\out\\" -or
        $_.FullName -match "\\docs\\_next\\"
    } |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }

foreach ($file in $logFiles) {
    $results.FichiersLogs += $file.FullName.Replace($rootDir + "\", "")
    Write-Warn "Log obsolète: $($file.Name) ($($file.LastWriteTime.ToString('yyyy-MM-dd')))"
}

if ($results.FichiersLogs.Count -eq 0) {
    Write-OK "Aucun fichier de log obsolète trouvé"
} else {
    Write-Warn "$($results.FichiersLogs.Count) fichier(s) de log obsolète(s)"
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
        # Vérifier si le script est encore utilisé
        $content = Get-Content $path -Raw -ErrorAction SilentlyContinue
        if ($content -match "migration|migrate" -and $script -ne "scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1") {
            $results.ScriptsMigrationRedondants += $script
            Write-Warn "Script de migration potentiellement redondant: $script"
        }
    }
}

# ===============================================================================
# 3. FICHIERS DE TEST OBSOLÈTES
# ===============================================================================
Write-Section "3. Fichiers de test obsolètes"

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
        $results.FichiersTestObsoletes += $testFile
        Write-Warn "Fichier de test: $testFile"
    }
}

# ===============================================================================
# 4. DOSSIERS VIDES
# ===============================================================================
Write-Section "4. Dossiers vides"

$emptyDirs = @(
    "docs\archive",
    "audit\reports"
)

foreach ($dir in $emptyDirs) {
    $path = Join-Path $rootDir $dir
    if (Test-Path $path) {
        $items = Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue
        if ($items.Count -eq 0) {
            $results.DossiersVides += $dir
            Write-Warn "Dossier vide: $dir"
        }
    }
}

# ===============================================================================
# 5. FICHIERS DUPLIQUÉS
# ===============================================================================
Write-Section "5. Fichiers dupliqués"

$duplicates = @(
    @{ Original = "public\SUIVI_TEMPS_FACTURATION.md"; Duplicate = "SUIVI_TEMPS_FACTURATION.md" },
    @{ Original = "public\docs"; Duplicate = "docs\docs" },
    @{ Original = "public\icon-192.png"; Duplicate = "docs\icon-192.png" },
    @{ Original = "public\icon-512.png"; Duplicate = "docs\icon-512.png" },
    @{ Original = "public\manifest.json"; Duplicate = "docs\manifest.json" },
    @{ Original = "public\sw.js"; Duplicate = "docs\sw.js" },
    @{ Original = "public\migrate.html"; Duplicate = "docs\migrate.html" },
    @{ Original = "public\monitor-reboot.js"; Duplicate = "docs\monitor-reboot.js" }
)

foreach ($dup in $duplicates) {
    $origPath = Join-Path $rootDir $dup.Original
    $dupPath = Join-Path $rootDir $dup.Duplicate
    if ((Test-Path $origPath) -and (Test-Path $dupPath)) {
        $results.FichiersDupliques += $dup.Duplicate
        Write-Warn "Fichier duplique: $($dup.Duplicate) (existe aussi dans $($dup.Original))"
    }
}

# ===============================================================================
# 6. CODE MORT - FONCTIONS NON UTILISÉES
# ===============================================================================
Write-Section "6. Code mort - Fonctions non utilisées"

# Vérifier createUpdateCalibrationCommand
$calibrationCommandUsed = Select-String -Path "components\**\*.js","app\**\*.js" -Pattern "createUpdateCalibrationCommand" -ErrorAction SilentlyContinue
if ($calibrationCommandUsed.Count -eq 0) {
    $results.CodeMort += "lib\deviceCommands.js::createUpdateCalibrationCommand (importée mais jamais appelée)"
    Write-Warn "Fonction non utilisée: createUpdateCalibrationCommand"
}

# Vérifier buildUpdateCalibrationPayload
$calibrationPayloadUsed = Select-String -Path "components\**\*.js","app\**\*.js","lib\*.js" -Pattern "buildUpdateCalibrationPayload" -ErrorAction SilentlyContinue
if ($calibrationPayloadUsed.Count -eq 0) {
    $results.CodeMort += "lib\deviceCommands.js::buildUpdateCalibrationPayload (jamais utilisée)"
    Write-Warn "Fonction non utilisée: buildUpdateCalibrationPayload"
}

# ===============================================================================
# 7. SCRIPTS REDONDANTS
# ===============================================================================
Write-Section "7. Scripts redondants"

$redundantScripts = @(
    @{ Script = "scripts\AUDIT_PAGES_DASHBOARD.ps1"; Reason = "Fonctionnalités intégrées dans AUDIT_COMPLET_AUTOMATIQUE.ps1" },
    @{ Script = "scripts\diagnostic-deploiement.ps1"; Reason = "Fonctionnalités similaires à verifier-deploiement-github-pages.ps1" },
    @{ Script = "scripts\verifier-base-donnees.ps1"; Reason = "Script de test obsolète" },
    @{ Script = "scripts\audit-complet.js"; Reason = "Version JS obsolète, utiliser .ps1" },
    @{ Script = "merge-to-main.ps1"; Reason = "Script de merge temporaire" },
    @{ Script = "start-php-server.ps1"; Reason = "Utiliser docker-compose à la place" }
)

foreach ($script in $redundantScripts) {
    $path = Join-Path $rootDir $script.Script
    if (Test-Path $path) {
        $results.ScriptsRedondants += "$($script.Script) - $($script.Reason)"
        Write-Warn "Script redondant: $($script.Script) - $($script.Reason)"
    }
}

# ===============================================================================
# 8. FICHIERS TEMPORAIRES
# ===============================================================================
Write-Section "8. Fichiers temporaires"

$tempFiles = @(
    "audit_result.txt",
    "audit_resultat_20251210_001712.txt",
    "audit_resultat_20251210_184809.txt",
    "audit_final_20251210_190625.txt",
    "logs_serie_20251206_090656.log",
    "docs\AUDIT_COMPLET.json"
)

foreach ($tempFile in $tempFiles) {
    $path = Join-Path $rootDir $tempFile
    if (Test-Path $path) {
        $results.FichiersTemporaires += $tempFile
        Write-Warn "Fichier temporaire: $tempFile"
    }
}

# ===============================================================================
# 9. DOCUMENTATION OBSOLÈTE
# ===============================================================================
Write-Section "9. Documentation obsolète"

$obsDoc = @(
    "docs\EXPLICATION_DEPLOIEMENT_GITHUB_PAGES.md"
)

foreach ($doc in $obsDoc) {
    $path = Join-Path $rootDir $doc
    if (Test-Path $path) {
        # Verifier si le fichier est reference ailleurs
        $referenced = Select-String -Path "*.md","*.js","*.jsx","*.ts","*.tsx" -Pattern [regex]::Escape($doc) -ErrorAction SilentlyContinue
        if ($referenced.Count -eq 0) {
            $results.DocumentationObsolete += $doc
            Write-Warn "Documentation non referencee: $doc"
        }
    }
}

# ===============================================================================
# 10. FICHIERS DANS OUT/ (BUILD)
# ===============================================================================
Write-Section "10. Fichiers de build (out/)"

if (Test-Path "out") {
    $outFiles = Get-ChildItem -Path "out" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    if ($outFiles.Count -gt 0) {
        Write-Warn "Dossier out/ contient $($outFiles.Count) fichier(s) de build (peut être supprimé)"
        $results.FichiersTemporaires += "out/ (dossier de build, $($outFiles.Count) fichiers)"
    }
}

# ===============================================================================
# 11. FICHIERS DANS DOCS/_NEXT/ (BUILD)
# ===============================================================================
Write-Section "11. Fichiers de build dans docs/_next/"

if (Test-Path "docs\_next") {
    $nextFiles = Get-ChildItem -Path "docs\_next" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    if ($nextFiles.Count -gt 0) {
        Write-Warn "Dossier docs/_next/ contient $($nextFiles.Count) fichier(s) de build (peut être supprimé)"
        $results.FichiersTemporaires += "docs/_next/ (dossier de build, $($nextFiles.Count) fichiers)"
    }
}

# ===============================================================================
# RÉSUMÉ
# ===============================================================================
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "RÉSUMÉ DE L'ANALYSE" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$total = 0
$total += $results.FichiersLogs.Count
$total += $results.ScriptsRedondants.Count
$total += $results.FichiersTestObsoletes.Count
$total += $results.DossiersVides.Count
$total += $results.FichiersDupliques.Count
$total += $results.CodeMort.Count
$total += $results.FichiersTemporaires.Count
$total += $results.DocumentationObsolete.Count
$total += $results.ScriptsMigrationRedondants.Count

Write-Host "Statistiques:" -ForegroundColor Yellow
Write-Host "  - Fichiers de logs obsoletes: $($results.FichiersLogs.Count)" -ForegroundColor White
Write-Host "  - Scripts de migration redondants: $($results.ScriptsMigrationRedondants.Count)" -ForegroundColor White
Write-Host "  - Fichiers de test obsoletes: $($results.FichiersTestObsoletes.Count)" -ForegroundColor White
Write-Host "  - Dossiers vides: $($results.DossiersVides.Count)" -ForegroundColor White
Write-Host "  - Fichiers dupliques: $($results.FichiersDupliques.Count)" -ForegroundColor White
Write-Host "  - Code mort: $($results.CodeMort.Count)" -ForegroundColor White
Write-Host "  - Scripts redondants: $($results.ScriptsRedondants.Count)" -ForegroundColor White
Write-Host "  - Fichiers temporaires: $($results.FichiersTemporaires.Count)" -ForegroundColor White
Write-Host "  - Documentation obsolete: $($results.DocumentationObsolete.Count)" -ForegroundColor White
Write-Host ""
Write-Host "TOTAL: $total element(s) potentiellement inutile(s)" -ForegroundColor Cyan
Write-Host ""

# Générer un rapport détaillé
$reportPath = "ANALYSE_ELEMENTS_INUTILES_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
$reportLines = @()
$reportLines += "==============================================================================="
$reportLines += "RAPPORT D'ANALYSE DES ELEMENTS INUTILES"
$reportLines += "==============================================================================="
$reportLines += "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$reportLines += "Total elements identifies: $total"
$reportLines += ""
$reportLines += "1. FICHIERS DE LOGS OBSOLETES ($($results.FichiersLogs.Count))"
$results.FichiersLogs | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "2. SCRIPTS DE MIGRATION REDONDANTS ($($results.ScriptsMigrationRedondants.Count))"
$results.ScriptsMigrationRedondants | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "3. FICHIERS DE TEST OBSOLETES ($($results.FichiersTestObsoletes.Count))"
$results.FichiersTestObsoletes | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "4. DOSSIERS VIDES ($($results.DossiersVides.Count))"
$results.DossiersVides | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "5. FICHIERS DUPLIQUES ($($results.FichiersDupliques.Count))"
$results.FichiersDupliques | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "6. CODE MORT ($($results.CodeMort.Count))"
$results.CodeMort | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "7. SCRIPTS REDONDANTS ($($results.ScriptsRedondants.Count))"
$results.ScriptsRedondants | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "8. FICHIERS TEMPORAIRES ($($results.FichiersTemporaires.Count))"
$results.FichiersTemporaires | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "9. DOCUMENTATION OBSOLETE ($($results.DocumentationObsolete.Count))"
$results.DocumentationObsolete | ForEach-Object { $reportLines += "  - $_" }
$reportLines += ""
$reportLines += "==============================================================================="

$reportLines | Out-File -FilePath $reportPath -Encoding UTF8
Write-OK "Rapport detaille sauvegarde: $reportPath"

Write-Host ""
Write-Host "Pour nettoyer automatiquement, executez:" -ForegroundColor Yellow
Write-Host "   .\scripts\NETTOYER_ELEMENTS_INUTILES.ps1" -ForegroundColor White
Write-Host ""

