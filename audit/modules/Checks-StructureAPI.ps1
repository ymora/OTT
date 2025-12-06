# ===============================================================================
# VÉRIFICATION : STRUCTURE API
# ===============================================================================

function Invoke-Check-StructureAPI {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Results,
        
        [Parameter(Mandatory=$true)]
        [string]$ProjectPath
    )
    
    Write-Section "[15/18] Structure API - Cohérence Handlers"
    
    try {
        $structureScore = 10.0
        $criticalIssues = @()
        $warnings = @()
        
        $apiFile = Join-Path $ProjectPath "api.php"
        if (-not (Test-Path $apiFile)) {
            Write-Warn "api.php introuvable - vérification ignorée"
            $Results.Scores["Structure API"] = 5
            return
        }
        
        $apiContent = Get-Content $apiFile -Raw -ErrorAction SilentlyContinue
        
        # Extraire handlers appelés (uniquement les appels de fonction, pas dans commentaires ou noms de variables)
        $handlersCalled = @{}
        
        # Chercher les patterns d'appel de fonction : handleXXX( ou handleXXX(); ou handleXXX();
        $pattern = "(?:^|\s|;|\{|\()(handle[A-Z]\w+)\s*\("
        $matches = [regex]::Matches($apiContent, $pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
        
        foreach ($match in $matches) {
            $handler = $match.Groups[1].Value
            
            # Exclure si c'est dans un commentaire
            $lineStart = [Math]::Max(0, $match.Index - 200)
            $remainingLength = $apiContent.Length - $lineStart
            if ($remainingLength -gt 0) {
                $contextLength = [Math]::Min(400, $remainingLength)
                $context = $apiContent.Substring($lineStart, $contextLength)
                
                # Vérifier si c'est dans un commentaire - calcul simplifié et sécurisé
                $matchPosInContext = $match.Index - $lineStart
                if ($matchPosInContext -gt 0 -and $matchPosInContext -le $context.Length) {
                    $beforeMatch = $context.Substring(0, $matchPosInContext)
                    if ($beforeMatch -match '//.*handle|/\*.*handle|#.*handle') {
                        continue
                    }
                }
            }
            
            # Exclure les faux positifs comme "handlers", "handlerFiles", etc.
            if ($handler -eq "handlers" -or $handler -eq "handler" -or $handler.Length -lt 7) {
                continue
            }
            
            $handlersCalled[$handler] = $true
        }
        
        # Extraire handlers définis (dans handlers/ ET dans api.php)
        $handlersDefined = @{}
        
        # Handlers dans api/handlers/
        $handlerFiles = Get-ChildItem -Path (Join-Path $ProjectPath "api" "handlers") -Recurse -File -Include *.php -ErrorAction SilentlyContinue
        
        foreach ($file in $handlerFiles) {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content) {
                $functions = [regex]::Matches($content, "function (handle\w+)\(")
                foreach ($func in $functions) {
                    $handlersDefined[$func.Groups[1].Value] = $file.Name
                }
            }
        }
        
        # Handlers définis directement dans api.php
        if ($apiContent) {
            $functions = [regex]::Matches($apiContent, "function (handle\w+)\(")
            foreach ($func in $functions) {
                $handlersDefined[$func.Groups[1].Value] = "api.php"
            }
        }
        
        # Vérifier cohérence
        $missingHandlers = 0
        foreach ($handler in $handlersCalled.Keys) {
            if (-not $handlersDefined.ContainsKey($handler)) {
                Write-Err "Handler appelé mais non défini: $handler"
                $criticalIssues += "Handler $handler appelé mais NON DÉFINI"
                $missingHandlers++
                $structureScore -= 2.0
            }
        }
        
        # Handlers définis mais jamais appelés
        $unusedHandlers = $handlersDefined.Keys | Where-Object { -not $handlersCalled.ContainsKey($_) }
        if ($unusedHandlers.Count -gt 0) {
            Write-Warn "$($unusedHandlers.Count) handlers définis mais jamais appelés"
            $warnings += "Handlers inutilisés: $($unusedHandlers -join ', ')"
            $structureScore -= 0.5
        }
        
        if ($missingHandlers -eq 0 -and $unusedHandlers.Count -eq 0) {
            Write-OK "Structure API cohérente"
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

