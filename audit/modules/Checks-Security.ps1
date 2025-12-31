# ===============================================================================
# VÉRIFICATION : SÉCURITÉ (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte les problèmes de sécurité sans patterns spécifiques au projet

function Invoke-Check-Security {
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
    
    # Vérifier si la sécurité est activée (optionnel, par défaut activée)
    if ($Config.Checks -and $Config.Checks.Security -and -not $Config.Checks.Security.Enabled) {
        return
    }
    
    Write-Section "[6/23] Sécurité"
    
    try {
        $securityScore = 10
        $aiContext = @()  # Contexte pour l'IA
        
        # 1. SQL Injection (PHP) - AMÉLIORÉ
        if ($ProjectInfo.Language -contains "PHP") {
            Write-Info "Vérification SQL avec détection patterns sécurisés..."
            $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
            
            $unsafeSQL = @()
            $safeSQL = @()
            
            foreach ($file in $phpFiles) {
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                if (-not $content) { continue }
                
                # Chercher patterns non sécurisés
                $unsafePatterns = @(
                    @{Pattern = '\$pdo->query\(\$[^)]'; Name = "query with variable"},
                    @{Pattern = '\$pdo->exec\(\$[^)]'; Name = "exec with variable"},
                    @{Pattern = '->query\(".*\$'; Name = "query with string interpolation"},
                    @{Pattern = '->exec\(".*\$'; Name = "exec with string interpolation"}
                )
                
                foreach ($pattern in $unsafePatterns) {
                    $matches = [regex]::Matches($content, $pattern.Pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)
                    foreach ($match in $matches) {
                        $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                        
                        # Vérifier le contexte (peut être sécurisé si dans un contexte contrôlé)
                        $contextStart = [Math]::Max(0, $match.Index - 500)
                        $contextEnd = [Math]::Min($content.Length, $match.Index + 500)
                        $context = $content.Substring($contextStart, $contextEnd - $contextStart)
                        
                        # Exclure si c'est dans un contexte sécurisé (migration, schema, etc.)
                        $isSafeContext = $false
                        if ($context -match "migration|schema|CREATE TABLE|ALTER TABLE|information_schema|static.*sql") {
                            $isSafeContext = $true
                        }
                        
                        if (-not $isSafeContext) {
                            $unsafeSQL += @{
                                File = $file.Name
                                Path = $file.FullName
                                Line = $lineNumber
                                Pattern = $pattern.Name
                                Context = $context
                                Severity = "high"
                                NeedsAICheck = $true
                                Question = "La requête SQL à la ligne $lineNumber de '$($file.Name)' est-elle sécurisée (utilise-t-elle des requêtes préparées) ?"
                            }
                        } else {
                            $safeSQL += @{
                                File = $file.Name
                                Line = $lineNumber
                                Pattern = $pattern.Name
                                Reason = "Contexte sécurisé (migration/schema)"
                            }
                        }
                    }
                }
            }
            
            if ($unsafeSQL.Count -gt 0) {
                Write-Warn "$($unsafeSQL.Count) requête(s) SQL à vérifier"
                $securityScore -= 2
                
                foreach ($sql in $unsafeSQL) {
                    $aiContext += $sql
                }
            } else {
                Write-OK "Requêtes SQL préparées (PDO) ou contexte sécurisé"
            }
        }
        
        # 2. XSS (React/JavaScript) - AMÉLIORÉ
        if ($ProjectInfo.Language -contains "JavaScript" -or $ProjectInfo.Type -match "React") {
            Write-Info "Vérification XSS avec contexte..."
            $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
            
            $dangerousHTML = @()
            
            foreach ($file in $jsFiles) {
                if ($file.FullName -match 'node_modules|\.next|out|docs') { continue }
                
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                if (-not $content) { continue }
                
                $matches = [regex]::Matches($content, "dangerouslySetInnerHTML", [System.Text.RegularExpressions.RegexOptions]::Multiline)
                foreach ($match in $matches) {
                    $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                    
                    # Extraire le contexte
                    $contextStart = [Math]::Max(0, $match.Index - 500)
                    $contextEnd = [Math]::Min($content.Length, $match.Index + 500)
                    $context = $content.Substring($contextStart, $contextEnd - $contextStart)
                    
                    # Exclure si c'est dans un contexte sécurisé (service worker, script externe, etc.)
                    $isSafeContext = $false
                    if ($context -match "serviceWorker|Service Worker|Script.*id.*service-worker|meta.*tag|external.*script|sanitize|DOMPurify") {
                        $isSafeContext = $true
                    }
                    
                    if (-not $isSafeContext) {
                        $dangerousHTML += @{
                            File = $file.Name
                            Path = $file.FullName
                            Line = $lineNumber
                            Context = $context
                            Severity = "medium"
                            NeedsAICheck = $true
                            Question = "Le dangerouslySetInnerHTML à la ligne $lineNumber de '$($file.Name)' est-il sécurisé (contenu statique ou sanitizé) ?"
                        }
                    }
                }
            }
            
            if ($dangerousHTML.Count -gt 0) {
                Write-Warn "dangerouslySetInnerHTML détecté ($($dangerousHTML.Count))"
                $securityScore -= 1
                
                foreach ($html in $dangerousHTML) {
                    $aiContext += $html
                }
            } else {
                Write-OK "XSS protégé"
            }
        }
        
        # 3. Secrets dans le code (générique)
        Write-Info "Vérification secrets..."
        $secretPatterns = @(
            @{Pattern='password\s*=\s*["''][^"''\s]{8,}["'']'; Name="Password en dur"; MinLength=8},
            @{Pattern='api[_-]?key\s*=\s*["''][^"''\s]{10,}["'']'; Name="API key en dur"; MinLength=10},
            @{Pattern='secret\s*=\s*["''][^"''\s]{10,}["'']'; Name="Secret en dur"; MinLength=10},
            @{Pattern='token\s*=\s*["''][^"''\s]{10,}["'']'; Name="Token en dur"; MinLength=10},
            @{Pattern='private[_-]?key\s*=\s*["''][^"''\s]{20,}["'']'; Name="Private key en dur"; MinLength=20}
        )
        
        foreach ($pattern in $secretPatterns) {
            $matches = @($Files | Select-String -Pattern $pattern.Pattern -CaseSensitive:$false | 
                Where-Object { $_.Line.Length -gt $pattern.MinLength })
            
            # Exclure les fichiers de config exemple ou test
            $matches = $matches | Where-Object {
                $_.Path -notmatch '\.example|\.sample|\.test|\.spec|example\.|sample\.|test\.'
            }
            
            if ($matches.Count -gt 0) {
                Write-Warn "$($pattern.Name): $($matches.Count) occurrence(s)"
                $securityScore -= 0.5
                
                foreach ($match in $matches) {
                    $Results.Issues += @{
                        Type = "security"
                        Severity = "high"
                        Description = "$($pattern.Name) détecté"
                        File = $match.Path
                        Line = $match.LineNumber
                        SecurityRisk = "Secret Exposure"
                        VulnerabilityType = "Information Disclosure"
                    }
                }
            }
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext.Security = @{
            UnsafeSQL = $unsafeSQL.Count
            DangerousHTML = $dangerousHTML.Count
            Questions = $aiContext
        }
        
        Write-OK "Vérification sécurité terminée"
        $Results.Scores["Security"] = [Math]::Max($securityScore, 0)
    } catch {
        Write-Err "Erreur vérification sécurité: $($_.Exception.Message)"
        $Results.Scores["Security"] = 7
    }
}

