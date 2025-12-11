# ===============================================================================
# VÉRIFICATION : OPTIMISATIONS AVANCÉES
# ===============================================================================

function Invoke-Check-Optimizations {
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
    
    Write-Section "[16/18] Optimisations Avancées - Backend"
    
    try {
        $optimizationScore = 10.0
        $optimizationIssues = @()
        
        # Vérifier requêtes SQL N+1 dans PHP
        if ($ProjectInfo.Language -contains "PHP") {
            Write-Info "Vérification requêtes SQL N+1 (backend)..."
            $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
            
            $nPlusOnePatterns = @()
            foreach ($file in $phpFiles) {
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                if ($content) {
                    # Chercher des patterns de requêtes dans des boucles
                    if ($content -match '(foreach|while|for)\s*\([^)]*\)\s*\{[^}]*->(query|prepare|execute)', [System.Text.RegularExpressions.RegexOptions]::Singleline) {
                        $nPlusOnePatterns += $file.Name
                    }
                }
            }
            
            if ($nPlusOnePatterns.Count -gt 0) {
                Write-Warn "$($nPlusOnePatterns.Count) fichier(s) avec requêtes SQL potentiellement N+1"
                $optimizationIssues += "Backend: $($nPlusOnePatterns.Count) requêtes SQL dans loops"
                $optimizationScore -= 1.0
                
                foreach ($file in $nPlusOnePatterns) {
                    $Results.Warnings += "Potentiel N+1 SQL dans: $file"
                }
            } else {
                Write-OK "Aucun pattern N+1 détecté dans PHP"
            }
        }
        
        # Vérifier index SQL
        $sqlFiles = Get-ChildItem -Recurse -File -Include *.sql -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -notmatch 'node_modules|vendor'
        }
        
        $hasIndexes = $false
        foreach ($file in $sqlFiles) {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content -and ($content -match 'CREATE\s+INDEX|CREATE\s+UNIQUE\s+INDEX')) {
                $hasIndexes = $true
                break
            }
        }
        
        if ($hasIndexes) {
            Write-OK "Index SQL présents"
        } else {
            Write-Info "Aucun index SQL explicite trouvé (peut être normal)"
        }
        
        # Vérifier pagination API
        if ($ProjectInfo.Language -contains "PHP") {
            $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
            $paginatedEndpoints = 0
            foreach ($file in $phpFiles) {
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                if ($content -and ($content -match 'LIMIT\s+\d+|OFFSET\s+\d+|page|limit|offset')) {
                    $paginatedEndpoints++
                }
            }
            
            if ($paginatedEndpoints -gt 5) {
                Write-OK "Pagination présente dans $paginatedEndpoints endpoints"
            } else {
                Write-Warn "Pagination limitée - à vérifier pour les grandes listes"
                $optimizationScore -= 0.5
            }
        }
        
        Write-OK "Vérification optimisations terminée"
        $Results.Scores["Optimisations"] = [Math]::Max($optimizationScore, 0)
        
        if ($optimizationIssues.Count -gt 0) {
            $Results.Warnings += $optimizationIssues
        }
    } catch {
        Write-Err "Erreur vérification optimisations: $($_.Exception.Message)"
        $Results.Scores["Optimisations"] = 7
    }
}

