# ===============================================================================
# VÉRIFICATION : DUPLICATION DE CODE
# ===============================================================================

function Invoke-Check-Duplication {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.Duplication.Enabled) {
        return
    }
    
    Write-Section "[3/13] Duplication de Code et Refactoring"
    
    try {
        $searchFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        $threshold = $Config.Checks.Duplication.Threshold
        
        $patterns = @(
            @{Pattern='useState\('; Description='useState'; Seuil=100},
            @{Pattern='useEffect\('; Description='useEffect'; Seuil=80},
            @{Pattern='fetchJson|fetch\(|axios\.'; Description='Appels API'; Seuil=50},
            @{Pattern='try\s*\{'; Description='Try/catch'; Seuil=100}
        )
        
        $duplications = @()
        
        # Détecter fonctions dupliquées spécifiques (exclure celles qui viennent de hooks)
        Write-Info "Analyse fonctions dupliquées..."
        
        # Chercher les définitions de fonctions (pas les utilisations depuis hooks)
        $archiveFunctions = @($searchFiles | Select-String -Pattern "(?:const|function)\s+handleArchive\s*=\s*(?:async\s*)?\(|function\s+handleArchive\s*\(" | Where-Object {
            # Exclure si c'est une utilisation depuis un hook (archive: handleArchive)
            $_.Line -notmatch "archive:\s*handleArchive|restore:\s*handleRestore|permanentDelete:\s*handlePermanentDelete"
        })
        
        $deleteFunctions = @($searchFiles | Select-String -Pattern "(?:const|function)\s+handlePermanentDelete\s*=\s*(?:async\s*)?\(|function\s+handlePermanentDelete\s*\(" | Where-Object {
            $_.Line -notmatch "permanentDelete:\s*handlePermanentDelete"
        })
        
        $restoreFunctions = @($searchFiles | Select-String -Pattern "(?:const|function)\s+handleRestore\w+\s*=\s*(?:async\s*)?\(|function\s+handleRestore\w+\s*\(" | Where-Object {
            $_.Line -notmatch "restore:\s*handleRestore"
        })
        
        if ($archiveFunctions.Count -gt 1) {
            Write-Warn "handleArchive dupliquée: $($archiveFunctions.Count) occurrences"
            $duplications += @{Pattern="handleArchive dupliquée"; Count=$archiveFunctions.Count; Files=($archiveFunctions | Group-Object Path).Count}
            $Results.Recommendations += "Unifier handleArchive avec un hook réutilisable ($($archiveFunctions.Count) occurrences)"
            
            $Results.Issues += @{
                Type = "code_duplication"
                Severity = "medium"
                Description = "handleArchive dupliquée dans $($archiveFunctions.Count) fichiers"
                File = ($archiveFunctions | Select-Object -First 1).Path
                Line = ($archiveFunctions | Select-Object -First 1).LineNumber
            }
        }
        
        if ($deleteFunctions.Count -gt 1) {
            Write-Warn "handlePermanentDelete dupliquée: $($deleteFunctions.Count) occurrences"
            $duplications += @{Pattern="handlePermanentDelete dupliquée"; Count=$deleteFunctions.Count; Files=($deleteFunctions | Group-Object Path).Count}
            $Results.Recommendations += "Unifier handlePermanentDelete ($($deleteFunctions.Count) occurrences)"
        }
        
        if ($restoreFunctions.Count -gt 1) {
            Write-Warn "handleRestore* dupliquée: $($restoreFunctions.Count) occurrences"
            $duplications += @{Pattern="handleRestore* dupliquée"; Count=$restoreFunctions.Count; Files=($restoreFunctions | Group-Object Path).Count}
            $Results.Recommendations += "Unifier handleRestore* ($($restoreFunctions.Count) occurrences)"
        }
        
        # Analyser patterns génériques
        foreach ($pattern in $patterns) {
            $matches = @($searchFiles | Select-String -Pattern $pattern.Pattern)
            $count = $matches.Count
            $fileCount = ($matches | Group-Object Path).Count
            
            if ($count -gt $pattern.Seuil) {
                Write-Warn "$($pattern.Description): $count occurrences dans $fileCount fichiers"
                $duplications += @{Pattern=$pattern.Description; Count=$count; Files=$fileCount}
                $Results.Recommendations += "Envisager refactoring: $($pattern.Description) très utilisé ($count fois)"
            }
        }
        
        if ($duplications.Count -eq 0) {
            Write-OK "Pas de duplication excessive détectée"
            $Results.Scores["Duplication"] = 10
        } else {
            Write-Warn "$($duplications.Count) patterns à fort potentiel de refactoring"
            $Results.Scores["Duplication"] = [Math]::Max(10 - $duplications.Count, 5)
        }
    } catch {
        Write-Err "Erreur analyse duplication: $($_.Exception.Message)"
        $Results.Scores["Duplication"] = 7
    }
}

