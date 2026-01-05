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
    
    # Si Checks n'existe pas ou Tests.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.Tests -and $Config.Checks.Tests.Enabled -eq $false) {
        return
    }
    
    Write-PhaseSection -PhaseNumber 10 -Title "Tests"
    
    try {
        # Détecter les fichiers de tests (pattern .test.js, .spec.js, etc.)
        $testFiles = $Files | Where-Object {
            $_.Name -match '\.(test|spec)\.(js|jsx|ts|tsx)$' -or
            $_.FullName -match '[\\/]__tests__[\\/]' -or
            $_.FullName -match '[\\/]tests?[\\/]'
        }
        
        # Compter aussi les fichiers dans __tests__/ même s'ils n'ont pas le pattern .test.js
        $testDirFiles = $Files | Where-Object {
            $_.FullName -match '[\\/]__tests__[\\/]' -and
            $_.Extension -match '\.(js|jsx|ts|tsx)$'
        }
        
        # Combiner et dédupliquer
        $allTestFiles = ($testFiles + $testDirFiles) | Sort-Object FullName -Unique
        
        Write-Host "  Fichiers de tests: $($allTestFiles.Count)" -ForegroundColor White
        if ($testDirFiles.Count -gt 0) {
            Write-Info "  Dont $($testDirFiles.Count) dans __tests__/"
        }
        
        $testScore = if($allTestFiles.Count -ge 10) { 8 } 
                    elseif($allTestFiles.Count -ge 5) { 6 } 
                    else { 4 }
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        if ($allTestFiles.Count -lt 5) {
            Write-Warn "Tests insuffisants ($($allTestFiles.Count) fichiers)"
            $Results.Recommendations += "Ajouter tests E2E pour fonctionnalités critiques"
            $aiContext += @{
                Category = "Tests"
                Type = "Insufficient Tests"
                Count = $allTestFiles.Count
                Recommended = 5
                Severity = "medium"
                NeedsAICheck = $true
                Question = "Seulement $($allTestFiles.Count) fichier(s) de tests détecté(s) (recommandé >= 5). Les tests sont-ils dans un autre répertoire, ou faut-il ajouter des tests pour les fonctionnalités critiques ?"
            }
        } else {
            Write-OK "$($allTestFiles.Count) fichiers de tests détectés"
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

