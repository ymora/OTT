# ===============================================================================
# VÉRIFICATION : SÉCURITÉ
# ===============================================================================

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
    
    if (-not $Config.Checks.Security.Enabled) {
        return
    }
    
    Write-Section "[8/13] Sécurité - Headers, SQL Injection, XSS"
    
    try {
        $securityScore = 10
        
        # SQL Injection (PHP)
        if ($ProjectInfo.Language -contains "PHP") {
            Write-Info "Vérification SQL..."
            $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
            
            $unsafeSQL = @($phpFiles | Select-String -Pattern '\$pdo->query\(\$[^)]|\$pdo->exec\(\$[^)]' | Where-Object {
                $_.Line -notmatch 'migration|sql file' -and
                $_.Path -notmatch 'helpers\.php'
            })
            
            if ($unsafeSQL.Count -gt 0) {
                Write-Warn "$($unsafeSQL.Count) requêtes SQL à vérifier"
                $securityScore -= 2
                
                foreach ($match in $unsafeSQL) {
                    $Results.Issues += @{
                        Type = "security"
                        Severity = "high"
                        Description = "Requête SQL potentiellement non préparée (risque injection SQL)"
                        File = $match.Path
                        Line = $match.LineNumber
                        SecurityRisk = "SQL Injection"
                        VulnerabilityType = "SQL Injection"
                    }
                }
            } else {
                Write-OK "Requêtes SQL préparées (PDO)"
            }
        }
        
        # XSS (React/JavaScript)
        if ($ProjectInfo.Language -contains "JavaScript" -or $ProjectInfo.Type -match "React") {
            Write-Info "Vérification XSS..."
            $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
            
            $dangerousHTML = @($jsFiles | Select-String -Pattern 'dangerouslySetInnerHTML' | Where-Object {
                $_.Line -notmatch 'serviceWorker|Service Worker'
            })
            
            if ($dangerousHTML.Count -gt 0) {
                Write-Warn "dangerouslySetInnerHTML détecté ($($dangerousHTML.Count))"
                $securityScore -= 1
                
                foreach ($match in $dangerousHTML) {
                    $Results.Warnings += "XSS potentiel: dangerouslySetInnerHTML dans $($match.Path)"
                }
            } else {
                Write-OK "XSS protégé"
            }
        }
        
        # Secrets dans le code
        Write-Info "Vérification secrets..."
        $secretPatterns = @(
            @{Pattern='password\s*=\s*["''][^"''\s]+["'']'; Name="Password en dur"},
            @{Pattern='api[_-]?key\s*=\s*["''][^"''\s]+["'']'; Name="API key en dur"},
            @{Pattern='secret\s*=\s*["''][^"''\s]+["'']'; Name="Secret en dur"},
            @{Pattern='token\s*=\s*["''][^"''\s]+["'']'; Name="Token en dur"}
        )
        
        foreach ($pattern in $secretPatterns) {
            $matches = @($Files | Select-String -Pattern $pattern.Pattern -CaseSensitive:$false)
            if ($matches.Count -gt 0) {
                Write-Warn "$($pattern.Name): $($matches.Count) occurrence(s)"
                $securityScore -= 0.5
            }
        }
        
        Write-OK "Vérification sécurité terminée"
        $Results.Scores["Security"] = [Math]::Max($securityScore, 0)
    } catch {
        Write-Err "Erreur vérification sécurité"
        $Results.Scores["Security"] = 7
    }
}

