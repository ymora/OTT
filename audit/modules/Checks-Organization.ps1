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
    
    # Si Checks n'existe pas ou Organization.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.Organization -and $Config.Checks.Organization.Enabled -eq $false) {
        return
    }
    
    Write-Section "[3/23] Organisation"
    
    try {
        # Filtrer les fichiers valides (exclure les répertoires et fichiers non lisibles)
        $validFiles = $Files | Where-Object { 
            $_ -and (Test-Path $_) -and (Get-Item $_ -ErrorAction SilentlyContinue) -is [System.IO.FileInfo]
        }
        
        if ($validFiles.Count -eq 0) {
            Write-Warn "Aucun fichier valide à analyser"
            $Results.Scores["Organization"] = 10
            return
        }
        
        # TODO/FIXME
        $todoFiles = Select-String -Path $validFiles -Pattern "TODO|FIXME|XXX|HACK" -ErrorAction SilentlyContinue | 
            Group-Object Path
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        
        if ($todoFiles.Count -gt 0) {
            Write-Warn "$($todoFiles.Count) fichier(s) avec TODO/FIXME"
            $Results.Recommendations += "Nettoyer les TODO/FIXME ($($todoFiles.Count) fichiers)"
            $aiContext += @{
                Category = "Organization"
                Type = "TODO/FIXME Found"
                Count = $todoFiles.Count
                Files = ($todoFiles | ForEach-Object { $_.Name }) -join ", "
                Severity = "low"
                NeedsAICheck = $true
                Question = "$($todoFiles.Count) fichier(s) contiennent des TODO/FIXME. Ces éléments doivent-ils être traités maintenant, reportés, ou supprimés s'ils sont obsolètes ?"
            }
        } else {
            Write-OK "Aucun TODO/FIXME en attente"
        }
        
        # console.log
        $consoleLogs = Select-String -Path $validFiles -Pattern "console\.(log|warn|error)" -ErrorAction SilentlyContinue | 
            Where-Object { $_.Path -notmatch "logger\.js|inject\.js|test|spec" }
        
        $consoleCount = ($consoleLogs | Measure-Object).Count
        if ($consoleCount -gt 20) {
            Write-Warn "$consoleCount console.log détectés (>20)"
            $Results.Recommendations += "Remplacer console.log par logger"
            $aiContext += @{
                Category = "Organization"
                Type = "Too Many console.log"
                Count = $consoleCount
                Recommended = 20
                Severity = "low"
                NeedsAICheck = $true
                Question = "$consoleCount console.log détectés (recommandé <= 20). Doivent-ils être remplacés par logger pour une meilleure gestion des logs en production ?"
            }
        } else {
            Write-OK "$consoleCount console.log (acceptable)"
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Organization = @{
                Questions = $aiContext
            }
        }
        
        $Results.Scores["Organization"] = 10
    } catch {
        Write-Err "Erreur vérification organisation: $($_.Exception.Message)"
        if ($script:Verbose) {
            Write-Err "Stack trace: $($_.ScriptStackTrace)"
        }
        $Results.Scores["Organization"] = 7
    }
}

