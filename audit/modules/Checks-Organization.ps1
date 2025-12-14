# ===============================================================================
# VÉRIFICATION : ORGANISATION
# ===============================================================================

function Invoke-Check-Organization {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.Organization.Enabled) {
        return
    }
    
    Write-Section "[12/13] Organisation Projet et Nettoyage"
    
    try {
        # TODO/FIXME
        $todoFiles = Select-String -Path $Files -Pattern "TODO|FIXME|XXX|HACK" -ErrorAction SilentlyContinue | 
            Group-Object Path
        
        if ($todoFiles.Count -gt 0) {
            Write-Warn "$($todoFiles.Count) fichier(s) avec TODO/FIXME"
            $Results.Recommendations += "Nettoyer les TODO/FIXME ($($todoFiles.Count) fichiers)"
        } else {
            Write-OK "Aucun TODO/FIXME en attente"
        }
        
        # console.log
        $consoleLogs = Select-String -Path $Files -Pattern "console\.(log|warn|error)" -ErrorAction SilentlyContinue | 
            Where-Object { $_.Path -notmatch "logger\.js|inject\.js|test|spec" }
        
        $consoleCount = ($consoleLogs | Measure-Object).Count
        if ($consoleCount -gt 20) {
            Write-Warn "$consoleCount console.log détectés (>20)"
            $Results.Recommendations += "Remplacer console.log par logger"
        } else {
            Write-OK "$consoleCount console.log (acceptable)"
        }
        
        $Results.Scores["Organization"] = 10
    } catch {
        Write-Err "Erreur vérification organisation"
        $Results.Scores["Organization"] = 7
    }
}

