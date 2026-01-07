# ===============================================================================
# VÉRIFICATION : PERFORMANCE (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte les patterns de performance et génère un rapport pour l'IA
# Évite les faux positifs en analysant le contexte React

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
    
    # Si Checks n'existe pas ou Performance.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.Performance -and $Config.Checks.Performance.Enabled -eq $false) {
        return
    }
    
    Write-PhaseSection -PhaseNumber 8 -Title "Performance"
    
    try {
        $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        $aiContext = @()  # Contexte pour l'IA
        
        # 1. Lazy loading
        $lazyLoading = @($jsFiles | Select-String -Pattern 'dynamicImport|lazy\(|React\.lazy|next/dynamic').Count
        Write-OK "Lazy loading: $lazyLoading composants"
        
        # 2. Optimisations React
        $memoUsage = @($jsFiles | Select-String -Pattern 'useMemo|useCallback').Count
        Write-OK "Optimisations React: $memoUsage useMemo/useCallback"
        
        # 3. Cache
        $cacheUsage = @($jsFiles | Select-String -Pattern 'cache|Cache').Count
        Write-OK "Cache: $cacheUsage utilisations"
        
        # 4. Timers sans cleanup (AMÉLIORÉ - Détecte le contexte React)
        Write-Info "Vérification timers avec cleanup..."
        $timersWithoutCleanup = @()
        $timersWithCleanup = @()
        
        foreach ($file in $jsFiles) {
            if ($file.FullName -match 'node_modules|\.next|out|docs') { continue }
            
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            # Chercher setTimeout/setInterval
            $timerMatches = [regex]::Matches($content, "(setTimeout|setInterval)\s*\(", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            
            foreach ($match in $timerMatches) {
                $timerType = $match.Groups[1].Value
                $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                
                # Extraire le contexte autour du timer (50 lignes avant/après)
                $contextStart = [Math]::Max(0, $match.Index - 2000)
                $contextEnd = [Math]::Min($content.Length, $match.Index + 2000)
                $context = $content.Substring($contextStart, $contextEnd - $contextStart)
                
                # Vérifier si le timer est dans un useEffect avec cleanup
                $hasCleanup = $false
                $isInUseEffect = $false
                $cleanupPattern = ""
                
                # Chercher useEffect avant le timer
                $beforeTimer = $content.Substring(0, $match.Index)
                $useEffectMatches = [regex]::Matches($beforeTimer, "useEffect\s*\([^)]*\)\s*=>\s*\{", [System.Text.RegularExpressions.RegexOptions]::Singleline)
                
                if ($useEffectMatches.Count -gt 0) {
                    $lastUseEffect = $useEffectMatches[$useEffectMatches.Count - 1]
                    $useEffectStart = $lastUseEffect.Index
                    $useEffectEnd = $match.Index
                    
                    # Vérifier si le timer est dans le useEffect
                    if ($useEffectEnd -gt $useEffectStart) {
                        $useEffectContent = $content.Substring($useEffectStart, $useEffectEnd - $useEffectStart)
                        
                        # Chercher return () => { clearTimeout/clearInterval ou return () => clearTimeout
                        if ($useEffectContent -match "return\s+\(\)\s*=>\s*(\{[^}]*)?clear(Timeout|Interval)") {
                            $hasCleanup = $true
                            $isInUseEffect = $true
                            $cleanupPattern = "useEffect cleanup"
                        }
                    }
                }
                
                # Vérifier si c'est un await new Promise(resolve => setTimeout) - pas besoin de cleanup
                if ($context -match "await\s+new\s+Promise\s*\([^)]*setTimeout") {
                    $hasCleanup = $true
                    $cleanupPattern = "Promise-wrapped (no cleanup needed)"
                }
                
                # Vérifier si le timer est suivi de location.reload/href (navigation = pas besoin de cleanup)
                if ($context -match "set(Timeout|Interval)[^}]*location\.(reload|href|replace)") {
                    $hasCleanup = $true
                    $cleanupPattern = "Navigation after timer (no cleanup needed)"
                }
                
                # Vérifier si c'est dans une fonction handler (pas un useEffect)
                if ($context -match "const\s+handle\w+\s*=\s*(async\s*)?\(" -and $context -notmatch "useEffect") {
                    $hasCleanup = $true
                    $cleanupPattern = "Event handler (cleanup not required)"
                }
                
                # Vérifier si le cleanup est dans le même bloc (return () => clear...)
                if ($context -match "return\s+\(\)\s*=>\s*(\{[^}]*)?clear(Timeout|Interval)") {
                    $hasCleanup = $true
                    $cleanupPattern = "cleanup in same block"
                }
                
                # Vérifier si c'est stocké dans une ref et clearTimeout/clearInterval appelé ailleurs
                if ($context -match "(Ref\.current|IntervalRef|TimeoutRef).*=.*set(Timeout|Interval)" -and $context -match "clear(Timeout|Interval)") {
                    $hasCleanup = $true
                    $cleanupPattern = "Ref-based cleanup"
                }
                
                # Vérifier si c'est dans un hook personnalisé (useTimer, useTimeout, etc.)
                $hookPatterns = @("useTimer", "useTimeout", "useInterval", "useAutoRefresh", "useDebounce", "useSmartDeviceRefresh", "useApiCall", "useModalState")
                foreach ($hookPattern in $hookPatterns) {
                    if ($file.Name -match "^$hookPattern" -or $context -match "function\s+$hookPattern") {
                        $hasCleanup = $true
                        $cleanupPattern = "Hook personnalisé: $hookPattern"
                        break
                    }
                }
                
                # Vérifier si c'est dans createTimeoutWithCleanup ou une fonction qui retourne un cleanup
                if ($context -match "createTimeoutWithCleanup|createIntervalWithCleanup|startQueueProcessor|stopQueueProcessor") {
                    $hasCleanup = $true
                    $cleanupPattern = "Function with cleanup"
                }
                
                if (-not $hasCleanup) {
                    $timersWithoutCleanup += @{
                        File = $file.Name
                        Path = $file.FullName
                        Line = $lineNumber
                        Type = $timerType
                        Context = $context.Substring([Math]::Max(0, $context.Length - 500))
                    }
                } else {
                    $timersWithCleanup += @{
                        File = $file.Name
                        Line = $lineNumber
                        Type = $timerType
                        CleanupPattern = $cleanupPattern
                    }
                }
            }
        }
        
        if ($timersWithoutCleanup.Count -gt 0) {
            Write-Warn "$($timersWithoutCleanup.Count) timer(s) potentiellement sans cleanup (nécessite vérification IA)"
            
            foreach ($timer in $timersWithoutCleanup) {
                $aiContext += @{
                    Category = "Performance"
                    Type = "Timer Without Cleanup"
                    File = $timer.File
                    Path = $timer.Path
                    Line = $timer.Line
                    TimerType = $timer.Type
                    Context = $timer.Context
                    Severity = "warning"
                    NeedsAICheck = $true
                    Question = "Le timer '$($timer.Type)' à la ligne $($timer.Line) de '$($timer.File)' a-t-il un cleanup approprié (useEffect, hook personnalisé, ou cleanup manuel) ?"
                }
            }
        } else {
            Write-OK "Tous les timers ont un cleanup détecté"
        }
        
        # 5. Requêtes dans loops (N+1) - AMÉLIORÉ
        Write-Info "Vérification requêtes N+1..."
        $loopQueries = @()
        
        foreach ($file in $jsFiles) {
            if ($file.FullName -match 'node_modules|\.next|out|docs') { continue }
            
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            # Chercher des patterns de boucles avec fetch
            $loopPatterns = @(
                @{Pattern = '\.map\s*\([^)]*=>[^}]*fetchJson|\.map\s*\([^)]*=>[^}]*fetch\('; Name = "Array.map with fetch"},
                @{Pattern = 'for\s*\([^)]*\)\s*\{[^}]*fetchJson|for\s*\([^)]*\)\s*\{[^}]*fetch\('; Name = "for loop with fetch"},
                @{Pattern = 'forEach\s*\([^)]*=>[^}]*fetchJson|forEach\s*\([^)]*=>[^}]*fetch\('; Name = "forEach with fetch"}
            )
            
            foreach ($loopPattern in $loopPatterns) {
                $matches = [regex]::Matches($content, $loopPattern.Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
                foreach ($match in $matches) {
                    $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                    
                    # Extraire le contexte
                    $contextStart = [Math]::Max(0, $match.Index - 1000)
                    $contextEnd = [Math]::Min($content.Length, $match.Index + 1000)
                    $context = $content.Substring($contextStart, $contextEnd - $contextStart)
                    
                    # Vérifier si c'est vraiment un problème N+1 ou si les données sont déjà chargées
                    $isNPlusOne = $true
                    $potentialBatch = $false
                    
                    # Chercher des patterns qui indiquent que ce n'est pas N+1
                    if ($context -match "Promise\.all|batch|bulk|already.*loaded|pre.*loaded") {
                        $isNPlusOne = $false
                        $potentialBatch = $true
                    }
                    
                    if ($isNPlusOne) {
                        $loopQueries += @{
                            File = $file.Name
                            Path = $file.FullName
                            Line = $lineNumber
                            Pattern = $loopPattern.Name
                            Context = $context
                            Severity = "warning"
                            NeedsAICheck = $true
                            Question = "La requête dans la boucle '$($loopPattern.Name)' à la ligne $lineNumber de '$($file.Name)' est-elle vraiment un problème N+1 ou les données sont-elles déjà chargées/batchées ?"
                        }
                    }
                }
            }
        }
        
        if ($loopQueries.Count -gt 0) {
            Write-Warn "$($loopQueries.Count) requête(s) dans loops détectée(s) (nécessite vérification IA)"
            
            foreach ($query in $loopQueries) {
                $aiContext += $query
            }
        } else {
            Write-OK "Pas de requêtes N+1 détectées"
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext.Performance = @{
            TimersWithoutCleanup = $timersWithoutCleanup.Count
            TimersWithCleanup = $timersWithCleanup.Count
            LoopQueries = $loopQueries.Count
            Questions = $aiContext
        }
        
        # Calculer le score
        $performanceScore = 10.0
        if ($timersWithoutCleanup.Count -gt 0) {
            $performanceScore -= 0.5  # Pénalité réduite car peut être faux positif
        }
        if ($loopQueries.Count -gt 0) {
            $performanceScore -= 0.5  # Pénalité réduite car peut être faux positif
        }
        
        $Results.Scores["Performance"] = [Math]::Max($performanceScore, 0)
        
        if ($timersWithoutCleanup.Count -gt 0 -or $loopQueries.Count -gt 0) {
            $Results.Warnings += "Performance: $($timersWithoutCleanup.Count) timers et $($loopQueries.Count) requêtes à vérifier"
        }
    } catch {
        Write-Err "Erreur analyse performance: $($_.Exception.Message)"
        $Results.Scores["Performance"] = 7
    }
}

