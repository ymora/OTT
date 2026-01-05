# ===============================================================================
# VÉRIFICATION IA : TESTS COMPLETS AVEC ANALYSE IA
# ===============================================================================
# Module d'analyse IA pour les tests complets
# Génère un contexte IA pour analyse approfondie des résultats de tests
# ===============================================================================

function Invoke-Check-AI-TestsComplets {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-PhaseSection -PhaseNumber 13 -Title "Analyse IA Tests Complets"
    
    $errors = @()
    $warnings = @()
    $success = @()
    $aiContext = @()
    
    # 1. Vérifier que les tests complets ont été exécutés
    Write-Host "`n[1] Verification execution tests complets" -ForegroundColor Yellow
    if ($Results.FunctionalTests -or $Results.TestsComplets) {
        Write-OK "Tests complets executes"
        $success += "Tests complets executes"
        
        # Générer un contexte IA basé sur les résultats
        $testResults = if ($Results.FunctionalTests) { $Results.FunctionalTests } else { $Results.TestsComplets }
        
        if ($testResults -and $testResults.CRUD) {
            $crudSuccess = ($testResults.CRUD | Where-Object { $_.Status -eq "OK" }).Count
            $crudTotal = $testResults.CRUD.Count
            $aiContext += "Tests CRUD: $crudSuccess/$crudTotal reussis"
        }
        
        if ($testResults -and $testResults.Workflows) {
            $workflowSuccess = ($testResults.Workflows | Where-Object { $_.Status -eq "OK" }).Count
            $workflowTotal = $testResults.Workflows.Count
            $aiContext += "Tests Workflows: $workflowSuccess/$workflowTotal reussis"
        }
        
        if ($testResults -and $testResults.Firmware) {
            $firmwareSuccess = ($testResults.Firmware | Where-Object { $_.Status -eq "OK" }).Count
            $firmwareTotal = $testResults.Firmware.Count
            $aiContext += "Tests Firmware: $firmwareSuccess/$firmwareTotal reussis"
        }
        
        if ($testResults -and $testResults.Integration) {
            $integrationSuccess = ($testResults.Integration | Where-Object { $_.Status -eq "OK" }).Count
            $integrationTotal = $testResults.Integration.Count
            $aiContext += "Tests Integration: $integrationSuccess/$integrationTotal reussis"
        }
    } else {
        Write-Warn "Tests complets non executes (depend de Checks-FunctionalTests ou Checks-TestsComplets)"
        $warnings += "Tests complets non executes"
    }
    
    # 2. Analyser les scores globaux
    Write-Host "`n[2] Analyse scores globaux" -ForegroundColor Yellow
    if ($Results.Scores) {
        $lowScores = $Results.Scores.GetEnumerator() | Where-Object { $_.Value -lt 7 }
        if ($lowScores.Count -gt 0) {
            Write-Warn "Scores faibles detectes:"
            foreach ($lowScore in $lowScores) {
                Write-Warn "   - $($lowScore.Key): $($lowScore.Value)/10"
                $aiContext += "Score faible: $($lowScore.Key) = $($lowScore.Value)/10"
            }
            $warnings += "$($lowScores.Count) scores faibles"
        } else {
            Write-OK "Tous les scores sont acceptables (>= 7/10)"
            $success += "Scores globaux acceptables"
        }
    }
    
    # 3. Générer un résumé pour l'IA
    Write-Host "`n[3] Generation contexte IA" -ForegroundColor Yellow
    if ($aiContext.Count -gt 0) {
        $aiSummary = $aiContext -join " | "
        Write-OK "Contexte IA genere: $aiSummary"
        $success += "Contexte IA genere"
        
        # Stocker le contexte IA dans Results
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext["TestsComplets"] = $aiSummary
    } else {
        Write-Info "Pas de contexte IA genere (tests non executes ou pas de resultats)"
    }
    
    # Calcul du score
    $totalChecks = $success.Count + $warnings.Count + $errors.Count
    if ($totalChecks -eq 0) {
        $score = 5
    } else {
        $score = [Math]::Round((($success.Count * 10) + ($warnings.Count * 5)) / $totalChecks, 1)
    }
    
    $Results.Scores["AI-TestsComplets"] = $score
    
    # Résumé
    Write-Host "`n[RESUME] Resume Analyse IA Tests Complets:" -ForegroundColor Cyan
    Write-Host "   ✅ Succes: $($success.Count)" -ForegroundColor Green
    Write-Host "   ⚠️  Avertissements: $($warnings.Count)" -ForegroundColor Yellow
    Write-Host "   ❌ Erreurs: $($errors.Count)" -ForegroundColor Red
    Write-Host "   📊 Score: $score/10" -ForegroundColor Cyan
    
    return @{
        Success = $true
        Errors = $errors.Count
        Warnings = $warnings.Count
        Issues = $errors + $warnings
        AIContext = $aiContext
    }
}

