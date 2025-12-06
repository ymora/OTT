# ===============================================================================
# UTILITAIRES - Fonctions d'affichage et helpers
# ===============================================================================

function Write-Logo {
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Cyan
    Write-Host "  AUDIT INTELLIGENT AUTOMATIQUE" -ForegroundColor Cyan
    Write-Host ("=" * 80) -ForegroundColor Cyan
    Write-Host "  Date    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
    Write-Host "  Version : 3.0 - Intelligent & Réutilisable" -ForegroundColor Gray
    Write-Host ("=" * 80) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "=== $Text ===" -ForegroundColor Cyan
}

function Write-OK {
    param([string]$Text)
    Write-Host "  [OK] $Text" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Text)
    Write-Host "  [WARN] $Text" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Text)
    Write-Host "  [ERROR] $Text" -ForegroundColor Red
}

function Write-Info {
    param([string]$Text)
    if ($script:Verbose) {
        Write-Host "  [INFO] $Text" -ForegroundColor Gray
    }
}

function Calculate-GlobalScore {
    param(
        [hashtable]$Results,
        [hashtable]$Config
    )
    
    $weights = $Config.ScoreWeights
    if (-not $weights) {
        # Poids par défaut
        $weights = @{
            "Architecture" = 1.0
            "CodeMort" = 1.5
            "Duplication" = 1.2
            "Complexity" = 1.2
            "Security" = 2.0
            "Performance" = 1.0
            "API" = 1.5
            "Database" = 1.0
            "Tests" = 0.8
            "Documentation" = 0.5
        }
    }
    
    $totalWeight = 0
    $weightedSum = 0
    
    foreach ($key in $weights.Keys) {
        $score = if ($Results.Scores.ContainsKey($key)) { $Results.Scores[$key] } else { 5 }
        $weight = $weights[$key]
        $totalWeight += $weight
        $weightedSum += ($score * $weight)
    }
    
    if ($totalWeight -eq 0) { return 0 }
    return [Math]::Round($weightedSum / $totalWeight, 1)
}

function Write-FinalScore {
    param(
        [double]$Score,
        [hashtable]$Results
    )
    
    $duration = ((Get-Date) - $Results.StartTime).TotalSeconds
    
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host "  RÉSUMÉ FINAL" -ForegroundColor Cyan
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host "  Score Global     : $Score/10" -ForegroundColor $(if($Score -ge 9){"Green"}elseif($Score -ge 7){"Yellow"}else{"Red"})
    Write-Host "  Problèmes        : $($Results.Issues.Count)" -ForegroundColor $(if($Results.Issues.Count -eq 0){"Green"}else{"Red"})
    Write-Host "  Avertissements   : $($Results.Warnings.Count)" -ForegroundColor $(if($Results.Warnings.Count -eq 0){"Green"}else{"Yellow"})
    Write-Host "  Recommandations  : $($Results.Recommendations.Count)" -ForegroundColor Yellow
    Write-Host "  Durée            : $([Math]::Round($duration, 1))s" -ForegroundColor Gray
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host ""
    
    # Afficher les scores par catégorie
    Write-Host "  Scores par catégorie:" -ForegroundColor Cyan
    foreach ($key in ($Results.Scores.Keys | Sort-Object)) {
        $score = $Results.Scores[$key]
        $color = if($score -ge 9){"Green"}elseif($score -ge 7){"Yellow"}else{"Red"}
        Write-Host "    $($key.PadRight(20)) : $score/10" -ForegroundColor $color
    }
    Write-Host ""
}

# Fonction pour normaliser les chemins
function Normalize-Path {
    param([string]$Path)
    return $Path -replace '\\', '/' -replace '//+', '/'
}

