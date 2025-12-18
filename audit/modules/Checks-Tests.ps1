# ===============================================================================
# VÉRIFICATION : TESTS
# ===============================================================================

function Invoke-Check-Tests {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.Tests.Enabled) {
        return
    }
    
    Write-Section "[10/21] Tests et Couverture"
    
    try {
        $testFiles = $Files | Where-Object {
            $_.Name -match '\.(test|spec)\.(js|jsx|ts|tsx)$'
        }
        
        Write-Host "  Fichiers de tests: $($testFiles.Count)" -ForegroundColor White
        
        $testScore = if($testFiles.Count -ge 10) { 8 } 
                    elseif($testFiles.Count -ge 5) { 6 } 
                    else { 4 }
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        if ($testFiles.Count -lt 5) {
            Write-Warn "Tests insuffisants ($($testFiles.Count) fichiers)"
            $Results.Recommendations += "Ajouter tests E2E pour fonctionnalités critiques"
            $aiContext += @{
                Category = "Tests"
                Type = "Insufficient Tests"
                Count = $testFiles.Count
                Recommended = 5
                Severity = "medium"
                NeedsAICheck = $true
                Question = "Seulement $($testFiles.Count) fichier(s) de tests détecté(s) (recommandé >= 5). Les tests sont-ils dans un autre répertoire, ou faut-il ajouter des tests pour les fonctionnalités critiques ?"
            }
        } else {
            Write-OK "$($testFiles.Count) fichiers de tests"
        }
        
        $Results.Scores["Tests"] = $testScore
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Tests = @{
                Questions = $aiContext
            }
        }
    } catch {
        $Results.Scores["Tests"] = 4
    }
}

