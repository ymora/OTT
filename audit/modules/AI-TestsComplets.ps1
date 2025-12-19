# ===============================================================================
# GÉNÉRATEUR DE CONTEXTE IA - TESTS COMPLETS APPLICATION OTT
# ===============================================================================
# Génère un contexte structuré pour l'analyse IA des tests complets
# ===============================================================================

function Get-AIContext-TestsComplets {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$TestResults
    )
    
    $context = @{
        Category = "Tests Complets Application OTT"
        Type = "Test Exhaustif"
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Summary = @{
            TotalChecks = ($TestResults.Success.Count + $TestResults.Warnings.Count + $TestResults.Errors.Count)
            Success = $TestResults.Success.Count
            Warnings = $TestResults.Warnings.Count
            Errors = $TestResults.Errors.Count
            Score = if ($TestResults.Score) { $TestResults.Score } else { 0 }
        }
        Details = @{
            CriticalFiles = @()
            Corrections = @()
            APITests = @()
            SecurityChecks = @()
        }
        Questions = @()
        Recommendations = @()
    }
    
    # Analyser les fichiers critiques
    foreach ($file in $TestResults.CriticalFiles) {
        $context.Details.CriticalFiles += @{
            File = $file
            Status = if ($TestResults.Success -contains "Fichier $file") { "OK" } else { "Missing" }
        }
    }
    
    # Analyser les corrections
    foreach ($correction in $TestResults.Corrections) {
        $context.Details.Corrections += @{
            Type = $correction.Type
            File = $correction.File
            Status = $correction.Status
            Question = $correction.Question
        }
        if ($correction.Question) {
            $context.Questions += $correction.Question
        }
    }
    
    # Analyser les tests API
    foreach ($test in $TestResults.APITests) {
        $context.Details.APITests += @{
            Endpoint = $test.Endpoint
            Status = $test.Status
            Error = $test.Error
        }
    }
    
    # Générer des recommandations
    if ($TestResults.Errors.Count -gt 0) {
        $context.Recommendations += "Corriger les erreurs critiques identifiées avant déploiement"
    }
    if ($TestResults.Warnings.Count -gt 5) {
        $context.Recommendations += "Réduire le nombre d'avertissements pour améliorer la qualité"
    }
    if ($TestResults.Score -lt 7) {
        $context.Recommendations += "Améliorer le score global des tests (actuellement $($TestResults.Score)/10)"
    }
    
    return $context
}

