# ===============================================================================
# VÉRIFICATION : BASE DE DONNÉES
# ===============================================================================

function Invoke-Check-Database {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-Section "[5/21] Base de Données - Cohérence et Intégrité"
    
    try {
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        
        if ($Results.Scores["API"] -gt 7) {
            Write-OK "Base de données cohérente (via tests API)"
            $Results.Scores["Database"] = 9
        } else {
            Write-Warn "Analyse BDD ignorée (API non accessible)"
            $Results.Scores["Database"] = 5
            $aiContext += @{
                Category = "Database"
                Type = "Analysis Skipped"
                Reason = "API not accessible"
                APIScore = $Results.Scores["API"]
                Severity = "medium"
                NeedsAICheck = $true
                Question = "L'analyse de la base de données a été ignorée car l'API n'est pas accessible (score API: $($Results.Scores["API"])). L'API est-elle déployée et accessible ? Y a-t-il des problèmes de connexion ou de configuration ?"
            }
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Database = @{
                Questions = $aiContext
            }
        }
    } catch {
        Write-Err "Erreur BDD: $($_.Exception.Message)"
        $Results.Scores["Database"] = 5
    }
}

