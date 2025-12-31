# ===============================================================================
# VÉRIFICATION : OPTIMISATIONS AVANCÉES (VERSION AMÉLIORÉE)
# ===============================================================================
# Détecte les patterns d'optimisation et génère un rapport pour l'IA
# Évite les faux positifs en vérifiant les JOINs SQL

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
    
    Write-Section "[13/23] Optimisations Avancées"
    
    try {
        $optimizationScore = 10.0
        $optimizationIssues = @()
        $aiContext = @()  # Contexte pour l'IA
        
        # 1. Vérifier requêtes SQL N+1 dans PHP (AMÉLIORÉ - Vérifie les JOINs)
        if ($ProjectInfo.Language -contains "PHP") {
            Write-Info "Vérification requêtes SQL N+1 (backend) avec détection JOINs..."
            $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
            
            $nPlusOneCandidates = @()
            # OPTIMISATION: Limiter l'analyse aux fichiers les plus pertinents (handlers, crud, etc.)
            $relevantFiles = $phpFiles | Where-Object { 
                $_.Name -match 'handler|crud|api|controller|service' -or 
                $_.FullName -match 'api[/\\]handlers|api[/\\]crud'
            }
            if ($relevantFiles.Count -eq 0) { $relevantFiles = $phpFiles | Select-Object -First 30 }
            
            foreach ($file in $relevantFiles) {
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                if (-not $content) { continue }
                
                # Chercher des patterns de requêtes dans des boucles
                $loopPatterns = @(
                    @{Pattern = 'foreach\s*\([^)]*\)\s*\{[^}]*->(query|prepare|execute)'; Name = "foreach with query"},
                    @{Pattern = 'while\s*\([^)]*\)\s*\{[^}]*->(query|prepare|execute)'; Name = "while with query"},
                    @{Pattern = 'for\s*\([^)]*\)\s*\{[^}]*->(query|prepare|execute)'; Name = "for with query"}
                )
                
                foreach ($loopPattern in $loopPatterns) {
                    $matches = [regex]::Matches($content, $loopPattern.Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
                    foreach ($match in $matches) {
                        $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                        
                        # Extraire le contexte autour de la boucle
                        $contextStart = [Math]::Max(0, $match.Index - 2000)
                        $contextEnd = [Math]::Min($content.Length, $match.Index + 2000)
                        $context = $content.Substring($contextStart, $contextEnd - $contextStart)
                        
                        # Vérifier si la requête utilise des JOINs (pas un vrai N+1)
                        $hasJoin = $false
                        $joinTypes = @("JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "CROSS JOIN")
                        foreach ($joinType in $joinTypes) {
                            if ($context -match $joinType) {
                                $hasJoin = $true
                                break
                            }
                        }
                        
                        # Vérifier si les données sont pré-chargées avant la boucle
                        $preloaded = $false
                        if ($context -match "fetchAll|fetchAll\(\)|already.*loaded|pre.*fetch") {
                            $preloaded = $true
                        }
                        
                        if (-not $hasJoin -and -not $preloaded) {
                            $nPlusOneCandidates += @{
                                File = $file.Name
                                Path = $file.FullName
                                Line = $lineNumber
                                Pattern = $loopPattern.Name
                                Context = $context.Substring([Math]::Max(0, $context.Length - 1000))
                                Severity = "warning"
                                NeedsAICheck = $true
                                Question = "La requête SQL dans la boucle '$($loopPattern.Name)' à la ligne $lineNumber de '$($file.Name)' est-elle vraiment un problème N+1 ou utilise-t-elle des JOINs/requêtes groupées pour éviter le problème ?"
                            }
                        }
                    }
                }
            }
            
            if ($nPlusOneCandidates.Count -gt 0) {
                Write-Warn "$($nPlusOneCandidates.Count) requête(s) SQL potentiellement N+1 (nécessite vérification IA)"
                
                foreach ($candidate in $nPlusOneCandidates) {
                    $aiContext += $candidate
                }
                
                $optimizationScore -= 0.3  # Pénalité réduite car peut être faux positif
            } else {
                Write-OK "Aucun pattern N+1 détecté dans PHP (ou JOINs présents)"
            }
        }
        
        # 2. Vérifier index SQL (générique)
        $sqlFiles = Get-ChildItem -Recurse -File -Include *.sql -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -notmatch 'node_modules|vendor|\.next'
        }
        
        $hasIndexes = $false
        $indexCount = 0
        foreach ($file in $sqlFiles) {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $indexMatches = [regex]::Matches($content, 'CREATE\s+(?:UNIQUE\s+)?INDEX', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                $indexCount += $indexMatches.Count
                if ($indexMatches.Count -gt 0) {
                    $hasIndexes = $true
                }
            }
        }
        
        if ($hasIndexes) {
            Write-OK "Index SQL présents ($indexCount index détectés)"
        } else {
            Write-Info "Aucun index SQL explicite trouvé (peut être normal si créés ailleurs)"
        }
        
        # 3. Vérifier pagination API (générique) - OPTIMISATION: Limiter aux fichiers handlers
        if ($ProjectInfo.Language -contains "PHP") {
            $phpFiles = $Files | Where-Object { 
                $_.Extension -eq ".php" -and 
                ($_.Name -match 'handler|api\.php' -or $_.FullName -match 'api[/\\]handlers')
            }
            if ($phpFiles.Count -eq 0) { $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" } | Select-Object -First 20 }
            
            $paginatedEndpoints = 0
            $endpointsWithoutPagination = @()
            
            foreach ($file in $phpFiles) {
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                if ($content) {
                    # Chercher des fonctions qui retournent des listes
                    $listFunctions = [regex]::Matches($content, "function\s+(handleGet\w+|get\w+List|getAll\w+)\s*\(", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                    
                    foreach ($func in $listFunctions) {
                        $funcName = $func.Groups[1].Value
                        $funcStart = $func.Index
                        $funcEnd = [Math]::Min($content.Length, $funcStart + 5000)
                        $funcContent = $content.Substring($funcStart, $funcEnd - $funcStart)
                        
                        # Vérifier si la fonction utilise LIMIT/OFFSET ou pagination
                        if ($funcContent -match 'LIMIT\s+[:$]?\w+|OFFSET\s+[:$]?\w+|page|limit|offset|pagination') {
                            $paginatedEndpoints++
                        } else {
                            $endpointsWithoutPagination += @{
                                File = $file.Name
                                Function = $funcName
                            }
                        }
                    }
                }
            }
            
            if ($paginatedEndpoints -gt 5) {
                Write-OK "Pagination présente dans $paginatedEndpoints endpoints"
            } else {
                Write-Warn "Pagination limitée - $($endpointsWithoutPagination.Count) endpoints sans pagination détectés"
                $optimizationScore -= 0.2
            }
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext.Optimizations = @{
            NPlusOneCandidates = $nPlusOneCandidates.Count
            Questions = $aiContext
        }
        
        Write-OK "Vérification optimisations terminée"
        $Results.Scores["Optimisations"] = [Math]::Max($optimizationScore, 0)
        
        if ($nPlusOneCandidates.Count -gt 0) {
            $Results.Warnings += "Optimisations: $($nPlusOneCandidates.Count) requêtes SQL N+1 à vérifier"
        }
    } catch {
        Write-Err "Erreur vérification optimisations: $($_.Exception.Message)"
        $Results.Scores["Optimisations"] = 7
    }
}

