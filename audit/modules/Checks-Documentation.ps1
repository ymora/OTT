# ===============================================================================
# VÉRIFICATION : DOCUMENTATION
# ===============================================================================

function Invoke-Check-Documentation {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    # Si Checks n'existe pas ou Documentation.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.Documentation -and $Config.Checks.Documentation.Enabled -eq $false) {
        return
    }
    
    Write-PhaseSection -PhaseNumber 9 -Title "Documentation"
    
    try {
        $mdFiles = $Files | Where-Object { $_.Extension -eq ".md" }
        $htmlDocs = Get-ChildItem -Recurse -File -Include *.html -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -match 'docs|documentation'
        }
        
        $docCount = $mdFiles.Count + $htmlDocs.Count
        $docScore = if($docCount -ge 5) { 10 } elseif($docCount -ge 3) { 8 } elseif($docCount -ge 1) { 6 } else { 4 }
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        if ($docCount -lt 3) {
            $aiContext += @{
                Category = "Documentation"
                Type = "Insufficient Documentation"
                Count = $docCount
                Recommended = 3
                Severity = "medium"
                NeedsAICheck = $true
                Question = "Seulement $docCount fichier(s) de documentation détecté(s) (recommandé >= 3). La documentation est-elle complète (README, guides, API docs) ? Certains fichiers sont-ils manquants ou la documentation est-elle ailleurs ?"
            }
        }
        
        Write-OK "Documentation: $docCount fichier(s)"
        $Results.Scores["Documentation"] = $docScore
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Documentation = @{
                Questions = $aiContext
            }
        }
    } catch {
        $Results.Scores["Documentation"] = 5
    }
}

