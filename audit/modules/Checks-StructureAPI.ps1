# ===============================================================================
# VÉRIFICATION : STRUCTURE API (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte les patterns de routing dynamique et génère un rapport pour l'IA
# Évite les faux positifs en analysant le contexte, pas seulement les appels directs

function Invoke-Check-StructureAPI {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath
    )
    
    Write-PhaseSection -PhaseNumber 5 -Title "Structure API"
    
    try {
        $structureScore = 10.0
        $criticalIssues = @()
        $warnings = @()
        $aiContext = @()  # Contexte pour l'IA
        
        # Détection générique du fichier API principal (pas de nom fixe)
        $apiFiles = @()
        $possibleApiFiles = @("api.php", "router.php", "index.php", "app.php", "server.php")
        foreach ($name in $possibleApiFiles) {
            $file = Join-Path $ProjectPath $name
            if (Test-Path $file) {
                $apiFiles += $file
            }
        }
        
        # Si aucun fichier API standard trouvé, chercher des fichiers PHP à la racine
        if ($apiFiles.Count -eq 0) {
            $rootPhpFiles = Get-ChildItem -Path $ProjectPath -File -Filter "*.php" -ErrorAction SilentlyContinue | 
                Where-Object { $_.Name -notmatch '^(config|bootstrap|init)' } |
                Select-Object -First 3
            $apiFiles = $rootPhpFiles | ForEach-Object { $_.FullName }
        }
        
        if ($apiFiles.Count -eq 0) {
            Write-Warn "Aucun fichier API détecté - vérification ignorée"
            $Results.Scores["Structure API"] = 5
            return
        }
        
        $handlersDefined = @{}
        $handlersCalled = @{}
        $routingPatterns = @()  # Patterns de routing détectés
        
        # 1. Détecter les handlers définis (pattern générique)
        # Chercher dans les répertoires handlers ET dans les fichiers API principaux
        $handlerDirs = @(
            (Join-Path $ProjectPath "api" "handlers"),
            (Join-Path $ProjectPath "handlers"),
            (Join-Path $ProjectPath "src" "handlers"),
            (Join-Path $ProjectPath "app" "handlers")
        )
        
        # Chercher aussi dans les fichiers API principaux (api.php, router.php, etc.)
        $apiMainFiles = @()
        foreach ($apiFile in $apiFiles) {
            $apiMainFiles += $apiFile
        }
        
        # Chercher dans les répertoires handlers
        foreach ($dir in $handlerDirs) {
            if (Test-Path $dir) {
                $handlerFiles = Get-ChildItem -Path $dir -Recurse -File -Include *.php -ErrorAction SilentlyContinue
                foreach ($file in $handlerFiles) {
                    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if ($content) {
                        # Pattern générique : function handleXXX( ou public function handleXXX(
                        $functions = [regex]::Matches($content, "(?:public\s+|private\s+|protected\s+)?function\s+(handle\w+)\s*\(")
                        foreach ($func in $functions) {
                            $handlerName = $func.Groups[1].Value
                            $handlersDefined[$handlerName] = @{
                                File = $file.Name
                                Path = $file.FullName
                                Line = ($content.Substring(0, $func.Index) -split "`n").Count
                            }
                        }
                    }
                }
            }
        }
        
        # Chercher aussi dans les fichiers API principaux (api.php contient souvent des handlers)
        foreach ($apiFile in $apiMainFiles) {
            if (Test-Path $apiFile) {
                $content = Get-Content $apiFile -Raw -ErrorAction SilentlyContinue
                if ($content) {
                    # Pattern générique : function handleXXX( ou public function handleXXX(
                    $functions = [regex]::Matches($content, "(?:public\s+|private\s+|protected\s+)?function\s+(handle\w+)\s*\(")
                    foreach ($func in $functions) {
                        $handlerName = $func.Groups[1].Value
                        # Ne pas écraser si déjà trouvé dans un handler file
                        if (-not $handlersDefined.ContainsKey($handlerName)) {
                            $handlersDefined[$handlerName] = @{
                                File = Split-Path $apiFile -Leaf
                                Path = $apiFile
                                Line = ($content.Substring(0, $func.Index) -split "`n").Count
                            }
                        }
                    }
                }
            }
        }
        
        # 2. Analyser les fichiers API pour détecter les patterns de routing
        foreach ($apiFile in $apiFiles) {
            $apiContent = Get-Content $apiFile -Raw -ErrorAction SilentlyContinue
            if (-not $apiContent) { continue }
            
            # Détecter les patterns de routing dynamique (génériques)
            $routingPatternsDetected = @()
            
            # Pattern 1: preg_match avec appel de fonction
            $pregMatches = [regex]::Matches($apiContent, "preg_match\s*\([^)]+\)\s*.*?(\w+)\s*\(\)", [System.Text.RegularExpressions.RegexOptions]::Singleline)
            foreach ($match in $pregMatches) {
                $calledFunction = $match.Groups[1].Value
                if ($calledFunction -match "^handle") {
                    $handlersCalled[$calledFunction] = @{
                        Type = "preg_match"
                        Context = $match.Value
                        File = Split-Path $apiFile -Leaf
                    }
                    $routingPatternsDetected += "preg_match"
                }
            }
            
            # Pattern 2: Routes avec switch/case ou if/elseif
            $routePatterns = @(
                @{Pattern = "case\s+['""]([^'""]+)['""].*?(\w+)\s*\(\)"; Name = "switch_case"},
                @{Pattern = "if\s*\([^)]*['""]([^'""]+)['""].*?(\w+)\s*\(\)"; Name = "if_route"},
                @{Pattern = "['""]/(\w+)['""].*?(\w+)\s*\(\)"; Name = "route_string"}
            )
            
            foreach ($routePattern in $routePatterns) {
                $matches = [regex]::Matches($apiContent, $routePattern.Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
                foreach ($match in $matches) {
                    $route = $match.Groups[1].Value
                    $calledFunction = $match.Groups[2].Value
                    if ($calledFunction -match "^handle") {
                        $handlersCalled[$calledFunction] = @{
                            Type = $routePattern.Name
                            Route = $route
                            Context = $match.Value
                            File = Split-Path $apiFile -Leaf
                        }
                        $routingPatternsDetected += $routePattern.Name
                    }
                }
            }
            
            # Pattern 3: Appels directs (fallback)
            $directCalls = [regex]::Matches($apiContent, "(?:^|\s|;|\{|\()(handle[A-Z]\w+)\s*\(", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            foreach ($match in $directCalls) {
                $handler = $match.Groups[1].Value
                # Exclure si dans commentaire
                $lineStart = [Math]::Max(0, $match.Index - 200)
                $context = $apiContent.Substring($lineStart, [Math]::Min(400, $apiContent.Length - $lineStart))
                if ($context -notmatch '//.*handle|/\*.*handle|#.*handle') {
                    if (-not $handlersCalled.ContainsKey($handler)) {
                        $handlersCalled[$handler] = @{
                            Type = "direct_call"
                            Context = $match.Value
                            File = Split-Path $apiFile -Leaf
                        }
                    }
                }
            }
            
            if ($routingPatternsDetected.Count -gt 0) {
                $routingPatterns += @{
                    File = Split-Path $apiFile -Leaf
                    Patterns = ($routingPatternsDetected | Select-Object -Unique)
                }
            }
        }
        
        # 3. Générer le rapport pour l'IA
        $unusedHandlers = $handlersDefined.Keys | Where-Object { -not $handlersCalled.ContainsKey($_) }
        
        if ($unusedHandlers.Count -gt 0) {
            # Construire le contexte pour l'IA
            foreach ($handler in $unusedHandlers) {
                $handlerInfo = $handlersDefined[$handler]
                
                # Chercher des patterns de routing qui pourraient utiliser ce handler
                $potentialRoutes = @()
                foreach ($apiFile in $apiFiles) {
                    $apiContent = Get-Content $apiFile -Raw -ErrorAction SilentlyContinue
                    if ($apiContent) {
                        # Chercher des routes qui pourraient correspondre au nom du handler
                        $handlerRoute = ($handler -replace '^handle', '' -replace '([A-Z])', '/$1' -replace '^/', '').ToLower()
                        if ($apiContent -match $handlerRoute) {
                            $potentialRoutes += $handlerRoute
                        }
                    }
                }
                
                $aiContext += @{
                    Handler = $handler
                    DefinedIn = $handlerInfo.File
                    DefinedAt = $handlerInfo.Path
                    Line = $handlerInfo.Line
                    RoutingPatterns = $routingPatterns
                    PotentialRoutes = $potentialRoutes
                    Severity = "warning"  # Pas critique, peut être un faux positif
                    NeedsAICheck = $true
                    Question = "Le handler '$handler' est-il utilisé via un routing dynamique non détecté automatiquement ?"
                }
            }
            
            Write-Warn "$($unusedHandlers.Count) handlers potentiellement inutilisés (nécessite vérification IA)"
            $warnings += "Handlers à vérifier: $($unusedHandlers -join ', ')"
            $structureScore -= 0.2  # Pénalité réduite car peut être faux positif
        }
        
        # Handlers appelés mais non définis (critique)
        $missingHandlers = 0
        foreach ($handler in $handlersCalled.Keys) {
            if (-not $handlersDefined.ContainsKey($handler)) {
                Write-Err "Handler appelé mais non défini: $handler"
                $criticalIssues += "Handler $handler appelé mais NON DÉFINI"
                $missingHandlers++
                $structureScore -= 2.0
            }
        }
        
        if ($missingHandlers -eq 0 -and $unusedHandlers.Count -eq 0) {
            Write-OK "Structure API cohérente"
        }
        
        # Sauvegarder le contexte pour l'IA
        $Results.AIContext = @{
            StructureAPI = @{
                HandlersDefined = $handlersDefined.Count
                HandlersCalled = $handlersCalled.Count
                UnusedHandlers = $unusedHandlers.Count
                RoutingPatterns = $routingPatterns
                Questions = $aiContext
            }
        }
        
        $Results.Scores["Structure API"] = [Math]::Max($structureScore, 0)
        
        if ($criticalIssues.Count -gt 0) {
            foreach ($issue in $criticalIssues) {
                $Results.Issues += @{
                    Type = "structure_api"
                    Severity = "high"
                    Description = $issue
                    File = "api.php"
                    Line = 0
                }
            }
        }
        if ($warnings.Count -gt 0) {
            $Results.Warnings += $warnings
        }
    } catch {
        Write-Err "Erreur vérification structure API: $($_.Exception.Message)"
        $Results.Scores["Structure API"] = 5
    }
}

