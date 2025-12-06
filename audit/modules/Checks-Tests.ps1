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
    
    Write-Section "[10/13] Tests et Couverture"
    
    try {
        $testFiles = $Files | Where-Object {
            $_.Name -match '\.(test|spec)\.(js|jsx|ts|tsx)$'
        }
        
        Write-Host "  Fichiers de tests: $($testFiles.Count)" -ForegroundColor White
        
        $testScore = if($testFiles.Count -ge 10) { 8 } 
                    elseif($testFiles.Count -ge 5) { 6 } 
                    else { 4 }
        
        if ($testFiles.Count -lt 5) {
            Write-Warn "Tests insuffisants ($($testFiles.Count) fichiers)"
            $Results.Recommendations += "Ajouter tests E2E pour fonctionnalités critiques"
        } else {
            Write-OK "$($testFiles.Count) fichiers de tests"
        }
        
        $Results.Scores["Tests"] = $testScore
    } catch {
        $Results.Scores["Tests"] = 4
    }
}

