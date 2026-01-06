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
    
    Write-PhaseSection -PhaseNumber 2 -Title "Organisation"
    
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
        
        # Code désactivé temporairement (commenté ou avec marqueurs)
        Write-Info "Détection code désactivé temporairement..."
        $disabledCodePatterns = @(
            # Patterns pour code commenté avec marqueurs
            "//\s*(TODO|FIXME|DISABLED|TEMP|TEMPORARY|OLD|DEPRECATED|REMOVE|DELETE).*"
            "/\*\s*(TODO|FIXME|DISABLED|TEMP|TEMPORARY|OLD|DEPRECATED|REMOVE|DELETE).*\*/"
            # Blocs de code commentés volumineux (> 5 lignes)
            # Pattern pour détecter de gros blocs commentés (délicat sans parser AST, on utilise une heuristique)
        )
        
        $disabledCodeFiles = @()
        foreach ($file in $validFiles) {
            if ($file -match '\.(js|jsx|ts|tsx|php)$') {
                $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
                if ($content) {
                    # Détecter les marqueurs DISABLED/TEMP dans les commentaires
                    $hasDisabledMarker = $false
                    foreach ($pattern in $disabledCodePatterns) {
                        if ($content -match $pattern) {
                            $hasDisabledMarker = $true
                            break
                        }
                    }
                    
                    # Détecter de gros blocs commentés (heuristique: > 5 lignes consécutives commentées)
                    # Compter les lignes consécutives commentées
                    $lines = $content -split "`n"
                    $consecutiveCommented = 0
                    $maxConsecutiveCommented = 0
                    foreach ($line in $lines) {
                        $trimmedLine = $line.Trim()
                        if ($trimmedLine -match '^\s*(//|/\*|\*)' -and $trimmedLine -notmatch '^\s*\*/\s*$') {
                            $consecutiveCommented++
                            if ($consecutiveCommented -gt $maxConsecutiveCommented) {
                                $maxConsecutiveCommented = $consecutiveCommented
                            }
                        } else {
                            $consecutiveCommented = 0
                        }
                    }
                    
                    # Considérer comme code désactivé si marqueur ou > 10 lignes commentées consécutives
                    if ($hasDisabledMarker -or $maxConsecutiveCommented -gt 10) {
                        $disabledCodeFiles += @{
                            File = $file
                            Reason = if ($hasDisabledMarker) { "Marqueur DISABLED/TEMP détecté" } else { "$maxConsecutiveCommented lignes commentées consécutives" }
                        }
                    }
                }
            }
        }
        
        if ($disabledCodeFiles.Count -gt 0) {
            Write-Warn "$($disabledCodeFiles.Count) fichier(s) avec code désactivé temporairement"
            $Results.Recommendations += "Vérifier code désactivé temporairement ($($disabledCodeFiles.Count) fichiers)"
            $fileList = ($disabledCodeFiles | ForEach-Object { "$($_.File) ($($_.Reason))" }) -join ", "
            $aiContext += @{
                Category = "Organization"
                Type = "Disabled Code Found"
                Count = $disabledCodeFiles.Count
                Files = $fileList
                Severity = "medium"
                NeedsAICheck = $true
                Question = "$($disabledCodeFiles.Count) fichier(s) contiennent du code désactivé temporairement (commenté avec marqueurs DISABLED/TEMP ou gros blocs commentés). Ce code doit-il être supprimé, réactivé, ou laissé tel quel ? Fichiers: $fileList"
            }
        } else {
            Write-OK "Aucun code désactivé temporairement détecté"
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
        
        # ============================================================================
        # DÉTECTION DES SCRIPTS DE TEST ÉPARPILLÉS
        # ============================================================================
        # Détecte les scripts de test qui peuvent être mélangés avec les scripts utiles
        Write-Info "Détection des scripts de test éparpillés..."
        
        # Patterns pour identifier les scripts de test
        $testScriptPatterns = @(
            '\btest[_\-]',          # test_, test-
            '\btesting[_\-]',       # testing_, testing-
            '\btest\.',             # test.
            '[_\-]test\.',          # _test., -test.
            '[_\-]spec\.',          # _spec., -spec.
            '\bspec[_\-]',          # spec_, spec-
            '\bdemo[_\-]',          # demo_, demo-
            '\bexample[_\-]',       # example_, example-
            '\bverify[_\-]',        # verify_, verify-
            '\bcheck[_\-]test',     # check_test, check-test
            '\btry[_\-]',           # try_, try-
            '\btemp[_\-]',          # temp_, temp-
            '\bdebug[_\-]',         # debug_, debug-
            '\bplayground',         # playground
            '\bsandbox',            # sandbox
            '^test\d+',             # test1, test2, etc.
            '^try\d+',              # try1, try2, etc.
            '^debug\d+'             # debug1, debug2, etc.
        )
        
        $testPattern = '\b(' + ($testScriptPatterns -join '|') + ')'
        
        # Chercher dans les scripts (PowerShell, Shell, Python, etc.)
        $scriptFiles = $validFiles | Where-Object { 
            $_.Extension -match '\.(ps1|sh|bash|py|js|ts)$' -and
            $_.FullName -notmatch '[\\/](node_modules|\.arduino15|\.git|\.next|hardware[\\/]arduino-data)[\\/]' -and
            $_.FullName -notmatch '[\\/](audit[\\/]projects|audit[\\/]modules|__tests__)[\\/]'
        }
        
        $testScripts = @()
        $productionScripts = @()
        
        foreach ($script in $scriptFiles) {
            $name = $script.Name
            $baseName = $script.BaseName
            $fullPath = $script.FullName
            
            # Vérifier si c'est un script de test
            $isTestScript = $false
            
            # Pattern dans le nom de fichier
            if ($name -match $testPattern -or $baseName -match $testPattern) {
                $isTestScript = $true
            }
            
            # Vérifier dans les dossiers de test connus (mais exclure les vrais dossiers de test)
            if ($fullPath -match '[\\/](test|tests|spec|specs|demo|examples|debug|temp|tmp)[\\/]' -and
                $fullPath -notmatch '[\\/]__tests__[\\/]') {
                $isTestScript = $true
            }
            
            # Vérifier le contenu du script (lignes commentaires ou code)
            try {
                $content = Get-Content -Path $fullPath -First 20 -ErrorAction SilentlyContinue
                $contentStr = ($content -join "`n").ToLower()
                
                # Indicateurs dans le contenu
                $testIndicators = @(
                    'test script', 'testing script', 'debug script',
                    'temporary script', 'temp script', 'demo script',
                    'example script', 'playground', 'sandbox',
                    '# test', '# testing', '# debug', '# temp',
                    'Write-Host.*test', 'console\.log.*test',
                    'This is a test', 'This script is for testing'
                )
                
                foreach ($indicator in $testIndicators) {
                    if ($contentStr -match $indicator) {
                        $isTestScript = $true
                        break
                    }
                }
            } catch {
                # Ignorer les erreurs de lecture
            }
            
            if ($isTestScript) {
                $testScripts += @{
                    File = $script
                    Path = $fullPath
                    Name = $name
                    Reason = "Pattern de test détecté dans le nom ou contenu"
                }
            } else {
                $productionScripts += $script
            }
        }
        
        # Signaler les scripts de test détectés
        if ($testScripts.Count -gt 0) {
            Write-Warn "$($testScripts.Count) script(s) de test détecté(s) (peuvent être mélangés avec scripts de production)"
            
            # Grouper par répertoire pour voir où ils sont éparpillés
            $testScriptsByDir = $testScripts | Group-Object { Split-Path $_.Path -Parent }
            
            foreach ($dirGroup in $testScriptsByDir) {
                $dirPath = $dirGroup.Name
                $scriptsInDir = $dirGroup.Group
                
                Write-Info "  Dossier: $dirPath ($($scriptsInDir.Count) script(s) de test)"
                foreach ($testScript in $scriptsInDir) {
                    Write-Info "    - $($testScript.Name)"
                }
            }
            
            # Ajouter au contexte IA avec avertissement CRITIQUE
            foreach ($testScript in $testScripts) {
                # Vérifier si le script est référencé quelque part
                $referencedCount = 0
                try {
                    $scriptNameOnly = $testScript.Name
                    
                    # Chercher références dans les autres fichiers (grep simple)
                    $refSearch = $validFiles | Select-String -Pattern ([regex]::Escape($scriptNameOnly)) -ErrorAction SilentlyContinue
                    if ($refSearch) {
                        $referencedCount = ($refSearch | Group-Object Path).Count
                    }
                } catch {
                    # Ignorer erreurs
                }
                
                $aiContext += @{
                    Category = "Organization"
                    Type = "Test Script Detection"
                    File = $testScript.Name
                    Path = $testScript.Path
                    Reason = $testScript.Reason
                    ReferencedCount = $referencedCount
                    Severity = "high"
                    NeedsAICheck = $true
                    CriticalWarning = $true
                    Question = "⚠️⚠️⚠️ CRITIQUE - SCRIPT DE TEST DÉTECTÉ ⚠️⚠️⚠️`n`nLe script '$($testScript.Name)' a été détecté comme script de test.`n`n🔴 AVANT TOUTE SUPPRESSION, OBLIGATOIRE de vérifier :`n1. Est-ce vraiment un script de test ou un script utile à la production ?`n2. Est-il référencé/utilisé ailleurs ? (Rechercher avec grep)`n3. Contient-il du code utile qui doit être conservé ?`n4. Peut-il être déplacé vers un dossier scripts/tests/ dédié au lieu d'être supprimé ?`n5. Est-il utilisé dans des workflows CI/CD ou des processus automatisés ?`n`n❌ NE JAMAIS SUPPRIMER SANS VÉRIFICATION MANUELLE COMPLÈTE !`n✅ Si vraiment inutile après vérification, le déplacer vers scripts/tests/ ou scripts/archive/ plutôt que supprimer directement.`n`nRéférences trouvées : $referencedCount fichier(s)"
                }
                
                $refText = if ($referencedCount -gt 0) { " (référencé dans $referencedCount fichier(s))" } else { " (non référencé)" }
                $Results.Recommendations += "⚠️ Script de test détecté: '$($testScript.Path)'$refText - VÉRIFIER MANUELLEMENT avant suppression ou déplacement"
            }
            
            # Pénaliser le score d'organisation
            $Results.Scores["Organization"] = [Math]::Max(10 - ($testScripts.Count * 0.1), 7)
        } else {
            Write-OK "Aucun script de test éparpillé détecté"
        }
        
        # Statistiques
        if ($testScripts.Count -gt 0) {
            Write-Info "Scripts de production: $($productionScripts.Count), Scripts de test: $($testScripts.Count)"
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
        
        # Définir le score final (seulement s'il n'a pas été modifié par les vérifications)
        if (-not $Results.Scores.ContainsKey("Organization")) {
            $Results.Scores["Organization"] = 10
        }
    } catch {
        Write-Err "Erreur vérification organisation: $($_.Exception.Message)"
        if ($script:Verbose) {
            Write-Err "Stack trace: $($_.ScriptStackTrace)"
        }
        $Results.Scores["Organization"] = 7
    }
}

