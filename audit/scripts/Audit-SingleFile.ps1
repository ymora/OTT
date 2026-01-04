# ===============================================================================
# AUDIT UNIFIÉ POUR FICHIER UNIQUE
# ===============================================================================
# Script optimisé pour auditer un fichier spécifique en réutilisant tous les modules
# ===============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [string]$ProjectRoot = "",
    [switch]$ShowVerbose = $false,
    [switch]$AllChecks = $false,
    [string]$AuditDir = ""
)

# ===============================================================================
# DÉTECTION ET CHARGEMENT
# ===============================================================================

# Détection automatique des répertoires
if ([string]::IsNullOrEmpty($ProjectRoot)) {
    $ProjectRoot = Get-Location
}

if ([string]::IsNullOrEmpty($AuditDir)) {
    $AuditDir = Join-Path $ProjectRoot "audit"
}

$scriptDir = Join-Path $AuditDir "scripts"
$modulesDir = Join-Path $AuditDir "modules"

# Charger les modules utilitaires
$ErrorActionPreference = "Stop"

try {
    $utilsPath = Join-Path $modulesDir "Utils.ps1"
    if (Test-Path $utilsPath) {
        . $utilsPath
        $script:Verbose = $ShowVerbose
    } else {
        throw "Module Utils.ps1 introuvable"
    }
} catch {
    Write-Host "❌ Erreur critique: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ===============================================================================
# VALIDATION DU FICHIER
# ===============================================================================

Write-Section "AUDIT DE FICHIER UNIQUE"
Write-Host "Fichier: $FilePath" -ForegroundColor Cyan
Write-Host "Projet: $ProjectRoot" -ForegroundColor Gray

# Résoudre le chemin complet
if (-not [System.IO.Path]::IsPathRooted($FilePath)) {
    $FullPath = Join-Path $ProjectRoot $FilePath
} else {
    $FullPath = $FilePath
}

if (-not (Test-Path $FullPath)) {
    Write-Err "Fichier introuvable: $FullPath"
    exit 1
}

# Obtenir les informations du fichier
$fileInfo = Get-Item $FullPath
$fileExtension = $fileInfo.Extension.ToLower()
$fileSize = $fileInfo.Length
$fileName = $fileInfo.Name

Write-Host "Type: $fileExtension" -ForegroundColor Gray
Write-Host "Taille: $([math]::Round($fileSize/1KB,2)) KB" -ForegroundColor Gray

# ===============================================================================
# DÉTECTION DU TYPE DE FICHIER ET SÉLECTION DES VÉRIFICATIONS
# ===============================================================================

Write-Section "DÉTECTION DU TYPE DE FICHIER"

$checksToRun = @()

# Déterminer le type de fichier et les vérifications appropriées
switch ($fileExtension) {
    ".php" {
        Write-Info "Fichier PHP détecté"
        $checksToRun += @(
            @{Name="Syntaxe PHP"; Module="Checks-Syntax"; Type="syntax"},
            @{Name="Sécurité PHP"; Module="Checks-Security"; Type="security"},
            @{Name="Qualité Code"; Module="Checks-Quality"; Type="quality"}
        )
    }
    ".js", ".jsx", ".ts", ".tsx" {
        Write-Info "Fichier JavaScript/TypeScript détecté"
        $checksToRun += @(
            @{Name="Syntaxe JS/TS"; Module="Checks-Syntax"; Type="syntax"},
            @{Name="ESLint Rules"; Module="Checks-Linting"; Type="linting"},
            @{Name="Sécurité JS"; Module="Checks-Security"; Type="security"}
        )
    }
    ".ino" {
        Write-Info "Firmware Arduino détecté"
        $checksToRun += @(
            @{Name="Syntaxe Arduino"; Module="Checks-Syntax"; Type="syntax"},
            @{Name="Structure Firmware"; Module="Checks-Firmware"; Type="firmware"},
            @{Name="Portabilité"; Module="Checks-Portability"; Type="portability"}
        )
    }
    ".json" {
        Write-Info "Fichier JSON détecté"
        $checksToRun += @(
            @{Name="Validité JSON"; Module="Checks-JSON"; Type="validation"},
            @{Name="Structure"; Module="Checks-Structure"; Type="structure"}
        )
    }
    ".md" {
        Write-Info "Fichier Markdown détecté"
        $checksToRun += @(
            @{Name="Liens Markdown"; Module="Checks-Markdown"; Type="links"},
            @{Name="Structure"; Module="Checks-Structure"; Type="structure"}
        )
    }
    default {
        Write-Info "Type de fichier générique détecté"
        $checksToRun += @(
            @{Name="Structure Générale"; Module="Checks-Structure"; Type="general"},
            @{Name="Encodage"; Module="Checks-Encoding"; Type="encoding"}
        )
    }
}

if ($AllChecks) {
    Write-Info "Mode toutes les vérifications activé"
    # Ajouter des vérifications supplémentaires
    $checksToRun += @(
        @{Name="Complexité"; Module="Checks-Complexity"; Type="complexity"},
        @{Name="Duplication"; Module="Checks-Duplication"; Type="duplication"},
        @{Name="Documentation"; Module="Checks-Documentation"; Type="documentation"}
    )
}

Write-Host "Vérifications à exécuter: $($checksToRun.Count)" -ForegroundColor Green
foreach ($check in $checksToRun) {
    Write-Host "  - $($check.Name)" -ForegroundColor Gray
}

# ===============================================================================
# EXÉCUTION DES VÉRIFICATIONS
# ===============================================================================

Write-Section "EXÉCUTION DES VÉRIFICATIONS"

$results = @{
    File = $FullPath
    Timestamp = Get-Date
    Checks = @()
    Summary = @{
        TotalChecks = $checksToRun.Count
        Passed = 0
        Failed = 0
        Warnings = 0
    }
}

foreach ($check in $checksToRun) {
    Write-Host "`n--- $($check.Name) ---" -ForegroundColor Cyan
    
    try {
        # Charger le module de vérification spécifique
        $modulePath = Join-Path $modulesDir "$($check.Module).ps1"
        if (Test-Path $modulePath) {
            . $modulePath
            
            # Exécuter la vérification selon le type
            $checkResult = switch ($check.Type) {
                "syntax" { Test-Syntax -FilePath $FullPath -Verbose:$ShowVerbose }
                "security" { Test-Security -FilePath $FullPath -Verbose:$ShowVerbose }
                "quality" { Test-CodeQuality -FilePath $FullPath -Verbose:$ShowVerbose }
                "linting" { Test-ESLintRules -FilePath $FullPath -Verbose:$ShowVerbose }
                "firmware" { Test-FirmwareStructure -FilePath $FullPath -Verbose:$ShowVerbose }
                "portability" { Test-Portability -FilePath $FullPath -Verbose:$ShowVerbose }
                "validation" { Test-JSONValidity -FilePath $FullPath -Verbose:$ShowVerbose }
                "structure" { Test-FileStructure -FilePath $FullPath -Verbose:$ShowVerbose }
                "links" { Test-MarkdownLinks -FilePath $FullPath -Verbose:$ShowVerbose }
                "general" { Test-GeneralStructure -FilePath $FullPath -Verbose:$ShowVerbose }
                "encoding" { Test-FileEncoding -FilePath $FullPath -Verbose:$ShowVerbose }
                "complexity" { Test-Complexity -FilePath $FullPath -Verbose:$ShowVerbose }
                "duplication" { Test-Duplication -FilePath $FullPath -Verbose:$ShowVerbose }
                "documentation" { Test-Documentation -FilePath $FullPath -Verbose:$ShowVerbose }
                default @{ Status = "Unknown"; Message = "Type de vérification inconnu" }
            }
            
            # Traiter le résultat
            if ($checkResult.Status -eq "Passed") {
                Write-OK "$($check.Name): Réussi"
                $results.Summary.Passed++
            } elseif ($checkResult.Status -eq "Failed") {
                Write-Err "$($check.Name): Échec - $($checkResult.Message)"
                $results.Summary.Failed++
            } elseif ($checkResult.Status -eq "Warning") {
                Write-Warn "$($check.Name): Avertissement - $($checkResult.Message)"
                $results.Summary.Warnings++
            } else {
                Write-Warn "$($check.Name): Statut inconnu"
                $results.Summary.Warnings++
            }
            
            # Ajouter aux résultats détaillés
            $results.Checks += @{
                Name = $check.Name
                Type = $check.Type
                Status = $checkResult.Status
                Message = $checkResult.Message
                Details = $checkResult.Details
            }
            
        } else {
            Write-Warn "Module $($check.Module).ps1 introuvable"
            $results.Summary.Warnings++
            $results.Checks += @{
                Name = $check.Name
                Type = $check.Type
                Status = "Skipped"
                Message = "Module introuvable"
                Details = $null
            }
        }
        
    } catch {
        Write-Err "Erreur lors de $($check.Name): $($_.Exception.Message)"
        $results.Summary.Failed++
        $results.Checks += @{
            Name = $check.Name
            Type = $check.Type
            Status = "Error"
            Message = $_.Exception.Message
            Details = $null
        }
    }
}

# ===============================================================================
# RAPPORT FINAL
# ===============================================================================

Write-Section "RAPPORT D'AUDIT"

Write-Host "Fichier audité: $FilePath" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date)" -ForegroundColor Gray
Write-Host ""

Write-Host "RÉSUMÉ:" -ForegroundColor Yellow
Write-Host "  Total des vérifications: $($results.Summary.TotalChecks)" -ForegroundColor White
Write-Host "  Réussies: $($results.Summary.Passed)" -ForegroundColor Green
Write-Host "  Échecs: $($results.Summary.Failed)" -ForegroundColor Red
Write-Host "  Avertissements: $($results.Summary.Warnings)" -ForegroundColor Yellow

# Calculer un score simple
$totalChecks = $results.Summary.TotalChecks
if ($totalChecks -gt 0) {
    $score = [math]::Round((($results.Summary.Passed * 100) / $totalChecks), 1)
    Write-Host "  Score global: $score%" -ForegroundColor $(if ($score -ge 80) { "Green" } elseif ($score -ge 60) { "Yellow" } else { "Red" })
}

# Détails des problèmes
if ($results.Summary.Failed -gt 0 -or $results.Summary.Warnings -gt 0) {
    Write-Host "`nDÉTAILS DES PROBLÈMES:" -ForegroundColor Yellow
    foreach ($check in $results.Checks) {
        if ($check.Status -in @("Failed", "Warning", "Error")) {
            $statusSymbol = switch ($check.Status) {
                "Failed" { "❌" }
                "Warning" { "⚠️" }
                "Error" { "🔥" }
                default { "❓" }
            }
            Write-Host "  $statusSymbol $($check.Name): $($check.Message)" -ForegroundColor White
        }
    }
}

# Sauvegarder les résultats
$resultsDir = Join-Path $AuditDir "resultats"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$resultFile = Join-Path $resultsDir "audit_singlefile_$($fileName)_$timestamp.json"
$results | ConvertTo-Json -Depth 10 | Set-Content $resultFile -Encoding UTF8

Write-Host "`nRésultats sauvegardés dans: $resultFile" -ForegroundColor Cyan

# Code de sortie
if ($results.Summary.Failed -gt 0) {
    exit 1
} elseif ($results.Summary.Warnings -gt 0) {
    exit 2
} else {
    exit 0
}
