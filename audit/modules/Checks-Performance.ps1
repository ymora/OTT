# ===============================================================================
# VÉRIFICATION : PERFORMANCE
# ===============================================================================

function Invoke-Check-Performance {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$ProjectInfo
    )
    
    if (-not $Config.Checks.Performance.Enabled) {
        return
    }
    
    Write-Section "[9/13] Performance - Optimisations React et Cache"
    
    try {
        $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        
        $lazyLoading = @($jsFiles | Select-String -Pattern 'dynamicImport|lazy\(|React\.lazy').Count
        $memoUsage = @($jsFiles | Select-String -Pattern 'useMemo|useCallback').Count
        $cacheUsage = @($jsFiles | Select-String -Pattern 'cache|Cache').Count
        
        Write-OK "Lazy loading: $lazyLoading composants"
        Write-OK "Optimisations React: $memoUsage useMemo/useCallback"
        Write-OK "Cache: $cacheUsage utilisations"
        
        # Requêtes dans loops (N+1) - Exclure fichiers de build
        $loopQueries = @($jsFiles | Where-Object { 
            $_.FullName -match '\\app\\|\\components\\|\\hooks\\' -and
            $_.FullName -notmatch '\\docs\\|\\out\\|\\_next\\|node_modules'
        } | Select-String -Pattern '\.map\(.*fetchJson|\.map\(.*fetch\(')
        
        if ($loopQueries.Count -gt 0) {
            Write-Warn "Requêtes dans loops détectées: $($loopQueries.Count)"
            $Results.Warnings += "Performance: $($loopQueries.Count) requêtes dans loops (N+1)"
            
            foreach ($match in $loopQueries) {
                $Results.Issues += @{
                    Type = "performance"
                    Severity = "medium"
                    Description = "Requête API dans une boucle (problème N+1)"
                    File = $match.Path
                    Line = $match.LineNumber
                }
            }
            
            $Results.Scores["Performance"] = 8
        } else {
            Write-OK "Pas de requêtes N+1 détectées"
            $Results.Scores["Performance"] = 10
        }
    } catch {
        Write-Err "Erreur analyse performance"
        $Results.Scores["Performance"] = 7
    }
}

