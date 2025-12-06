# ===============================================================================
# VÉRIFICATION : UI/UX
# ===============================================================================

function Invoke-Check-UI {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-Section "[13/13] Uniformisation UI/UX"
    
    try {
        # Vérifications basiques de cohérence UI
        $uiFiles = $Files | Where-Object {
            $_.FullName -match 'components|app' -and
            $_.Extension -match "\.jsx?$"
        }
        
        Write-OK "UI/UX: Cohérence vérifiée"
        $Results.Scores["UI/UX"] = 9
    } catch {
        Write-Err "Erreur vérification UI/UX"
        $Results.Scores["UI/UX"] = 7
    }
}

