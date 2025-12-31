# ===============================================================================
# UTILITAIRES - Fonctions d'affichage et helpers
# ===============================================================================

# Write-Logo supprimée (code mort - jamais utilisée)
# Si nécessaire, utiliser au début de Audit-Complet.ps1 pour un affichage professionnel

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
        # Poids par dÃ©faut
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

# Write-FinalScore supprimée (code mort - jamais utilisée)
# Le résumé final est déjà affiché dans Audit-Complet.ps1 (lignes 1200-1230)

# Normalize-Path supprimée (code mort - jamais utilisée)
# Si nécessaire pour comparaisons de chemins, réimplémenter


