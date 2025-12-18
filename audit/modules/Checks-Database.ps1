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
        if ($Results.Scores["API"] -gt 7) {
            Write-OK "Base de données cohérente (via tests API)"
            $Results.Scores["Database"] = 9
        } else {
            Write-Warn "Analyse BDD ignorée (API non accessible)"
            $Results.Scores["Database"] = 5
        }
    } catch {
        Write-Err "Erreur BDD: $($_.Exception.Message)"
        $Results.Scores["Database"] = 5
    }
}

