# ===============================================================================
# AMÉLIORATION CONTINUE JUSQU'À 100%
# ===============================================================================
# Script qui boucle : Audit → Correction → Re-test → jusqu'à 100% partout
# Ne s'arrête pas tant que tous les scores ne sont pas à 100%
# ===============================================================================

param(
    [int]$MaxIterations = 50,        # Nombre maximum d'itérations (sécurité)
    [int]$TimeoutMinutes = 30,       # Timeout global en minutes
    [double]$TargetScore = 10.0,     # Score cible (10.0 = 100%)
    [switch]$AutoFix = $true,        # Correction automatique si possible
    [switch]$Verbose = $false
)

$StartTime = Get-Date
$Iteration = 0
$AllScores = @{}
$Corrections = @()
$History = @()

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🚀 AMÉLIORATION CONTINUE JUSQU'À 100%" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "🎯 Objectif: Score 100% (10.0/10) sur toutes les phases" -ForegroundColor Yellow
Write-Host "⏱️  Timeout: $TimeoutMinutes minutes" -ForegroundColor Yellow
Write-Host "🔄 Itérations max: $MaxIterations" -ForegroundColor Yellow
Write-Host "🔧 Auto-correction: $(if ($AutoFix) { 'Activée' } else { 'Désactivée' })" -ForegroundColor Yellow
Write-Host ""

function Get-AuditScores {
    param([string]$AuditOutput)
    
    $scores = @{}
    
    try {
        # 1. Chercher dans les fichiers JSON de résultats (priorité)
        $resultFiles = Get-ChildItem -Path "audit\resultats" -Filter "*state*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($resultFiles) {
            try {
                $jsonContent = Get-Content $resultFiles.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($jsonContent.Scores) {
                    foreach ($score in $jsonContent.Scores.PSObject.Properties) {
                        $value = [double]$score.Value
                        if ($value -ge 0 -and $value -le 10) {
                            $scores[$score.Name] = $value
                        }
                    }
                }
                # Aussi chercher dans PartialResults
                if ($jsonContent.PartialResults) {
                    foreach ($phase in $jsonContent.PartialResults.PSObject.Properties) {
                        if ($phase.Value.Scores) {
                            foreach ($score in $phase.Value.Scores.PSObject.Properties) {
                                $value = [double]$score.Value
                                if ($value -ge 0 -and $value -le 10) {
                                    $scores[$score.Name] = $value
                                }
                            }
                        }
                    }
                }
            } catch {
                Write-Warning "Erreur parsing JSON: $($_.Exception.Message)"
            }
        }
        
        # 2. Extraire depuis l'output texte si pas de JSON
        if ($scores.Count -eq 0 -and $AuditOutput) {
            # Score global
            if ($AuditOutput -match 'Score Global[:\s]+(\d+\.?\d*)') {
                $scores["Global"] = [double]$matches[1]
            }
            
            # Scores par phase (format: "[X/21] Nom: X.X" ou "Nom: X.X/10")
            $scorePatterns = @(
                '\[(\d+)/\d+\]\s+([^:]+):\s+(\d+\.?\d*)',
                '(\w+)[:\s]+(\d+\.?\d*)/10',
                'Score[:\s]+(\w+)[:\s]+(\d+\.?\d*)',
                '(\w+)\s*=\s*(\d+\.?\d*)'
            )
            
            foreach ($pattern in $scorePatterns) {
                $matches = [regex]::Matches($AuditOutput, $pattern)
                foreach ($match in $matches) {
                    if ($match.Groups.Count -ge 3) {
                        $name = $match.Groups[2].Value.Trim()
                        $value = [double]$match.Groups[3].Value
                        if ($name -and $value -ge 0 -and $value -le 10) {
                            $scores[$name] = $value
                        }
                    }
                }
            }
        }
        
        # 3. Si toujours rien, essayer de lire depuis le dernier fichier d'état
        if ($scores.Count -eq 0) {
            $stateFiles = Get-ChildItem -Path "audit\resultats" -Filter "*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
            foreach ($file in $stateFiles) {
                try {
                    $jsonContent = Get-Content $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ($jsonContent.Scores) {
                        foreach ($score in $jsonContent.Scores.PSObject.Properties) {
                            $value = [double]$score.Value
                            if ($value -ge 0 -and $value -le 10) {
                                $scores[$score.Name] = $value
                            }
                        }
                        break
                    }
                } catch {
                    continue
                }
            }
        }
    } catch {
        Write-Warning "Erreur parsing scores: $($_.Exception.Message)"
    }
    
    return $scores
}

function Invoke-AutoFix {
    param([hashtable]$Issues)
    
    $fixed = @()
    
    foreach ($issue in $Issues) {
        $fixApplied = $false
        
        # Correction 1: Variable whereClause manquante
        if ($issue.Type -eq "whereClause manquant" -and $issue.File -and (Test-Path $issue.File)) {
            try {
                $fileContent = Get-Content $issue.File -Raw -ErrorAction Stop
                if ($fileContent -notmatch '\$whereClause\s*=') {
                    # Chercher la fonction handleGetPatients ou handleGetUsers
                    if ($fileContent -match 'function\s+(handleGetPatients|handleGetUsers)\s*\([^)]*\)\s*\{') {
                        $functionName = $matches[1]
                        # Chercher la ligne avec $includeDeleted
                        if ($fileContent -match '(\$includeDeleted\s*=[^;]+;)') {
                            # Trouver la position après $includeDeleted
                            $lines = $fileContent -split "`n"
                            $newLines = @()
                            $foundIncludeDeleted = $false
                            
                            foreach ($line in $lines) {
                                $newLines += $line
                                if ($line -match '\$includeDeleted\s*=' -and -not $foundIncludeDeleted) {
                                    $foundIncludeDeleted = $true
                                    # Ajouter whereClause avec la bonne indentation
                                    $indent = $line -match '^(\s*)' ? $matches[1] : "        "
                                    $newLines += "$indent`$whereClause = `$includeDeleted ? `"deleted_at IS NOT NULL`" : `"deleted_at IS NULL`";"
                                }
                            }
                            
                            $newContent = $newLines -join "`n"
                            Set-Content -Path $issue.File -Value $newContent -Encoding UTF8 -NoNewline
                            $fixed += "whereClause ajouté dans $($issue.File)"
                            $fixApplied = $true
                        }
                    }
                }
            } catch {
                Write-Warning "Erreur correction whereClause dans $($issue.File): $($_.Exception.Message)"
            }
        }
        
        # Correction 2: display_errors activé
        if ($issue.Type -eq "display_errors activé" -and $issue.File -eq "api.php" -and (Test-Path $issue.File)) {
            try {
                $fileContent = Get-Content $issue.File -Raw -ErrorAction Stop
                # Remplacer toutes les occurrences de display_errors = 1 par 0
                if ($fileContent -match 'ini_set\([''"]display_errors[''"],\s*1\)') {
                    $newContent = $fileContent -replace 'ini_set\([''"]display_errors[''"],\s*1\)', 'ini_set(''display_errors'', 0)'
                    # S'assurer qu'il y a au moins une ligne display_errors = 0
                    if ($newContent -notmatch 'ini_set\([''"]display_errors[''"],\s*0\)') {
                        # Ajouter après error_reporting
                        if ($newContent -match '(error_reporting\([^)]+\);)') {
                            $newContent = $newContent -replace '(error_reporting\([^)]+\);)', "`$1`nini_set('display_errors', 0);"
                        }
                    }
                    Set-Content -Path $issue.File -Value $newContent -Encoding UTF8 -NoNewline
                    $fixed += "display_errors désactivé dans api.php"
                    $fixApplied = $true
                }
            } catch {
                Write-Warning "Erreur correction display_errors: $($_.Exception.Message)"
            }
        }
        
        # Correction 3: urldecode manquant
        if ($issue.Type -eq "urldecode manquant" -and $issue.File -and (Test-Path $issue.File)) {
            try {
                $fileContent = Get-Content $issue.File -Raw -ErrorAction Stop
                if ($fileContent -match 'function\s+getDeviceUsbLogs\s*\([^)]*\$deviceIdentifier[^)]*\)') {
                    if ($fileContent -notmatch 'urldecode\s*\(\s*\$deviceIdentifier') {
                        # Trouver la ligne avec $deviceIdentifier dans la fonction
                        $lines = $fileContent -split "`n"
                        $newLines = @()
                        $inFunction = $false
                        $added = $false
                        
                        foreach ($line in $lines) {
                            if ($line -match 'function\s+getDeviceUsbLogs') {
                                $inFunction = $true
                            }
                            if ($inFunction -and $line -match '\$deviceIdentifier' -and -not $added -and $line -notmatch 'urldecode') {
                                $newLines += $line
                                # Ajouter urldecode avec la bonne indentation
                                $indent = $line -match '^(\s*)' ? $matches[1] : "    "
                                $newLines += "$indent`$deviceIdentifier = urldecode(`$deviceIdentifier);"
                                $added = $true
                            } else {
                                $newLines += $line
                            }
                            if ($inFunction -and $line -match '^\s*\}') {
                                $inFunction = $false
                            }
                        }
                        
                        $newContent = $newLines -join "`n"
                        Set-Content -Path $issue.File -Value $newContent -Encoding UTF8 -NoNewline
                        $fixed += "urldecode ajouté dans $($issue.File)"
                        $fixApplied = $true
                    }
                }
            } catch {
                Write-Warning "Erreur correction urldecode: $($_.Exception.Message)"
            }
        }
        
        # Correction 4: Score insuffisant - analyser et corriger selon la catégorie
        if ($issue.Type -eq "Score insuffisant" -and $issue.Category) {
            Write-Host "   ℹ️  Score insuffisant pour $($issue.Category): $($issue.CurrentScore)/10" -ForegroundColor Gray
            # Les corrections spécifiques par catégorie seront ajoutées progressivement
        }
    }
    
    return $fixed
}

function Analyze-AuditResults {
    param([string]$AuditOutput)
    
    $issues = @()
    $scores = Get-AuditScores -AuditOutput $AuditOutput
    
    # Détecter les problèmes depuis l'output de l'audit
    $errorPatterns = @(
        @{ Pattern = 'whereClause.*manquant|Undefined variable.*whereClause'; Type = "whereClause manquant"; Files = @("api/handlers/devices/patients.php", "api/handlers/auth.php"); Severity = "critical" }
        @{ Pattern = 'display_errors.*activé|display_errors.*1'; Type = "display_errors activé"; Files = @("api.php"); Severity = "high" }
        @{ Pattern = 'urldecode.*manquant|USB.*logs.*erreur'; Type = "urldecode manquant"; Files = @("api/handlers/usb_logs.php"); Severity = "medium" }
        @{ Pattern = 'SQL.*injection|concaténation.*SQL'; Type = "Risque SQL injection"; Files = @(); Severity = "critical" }
        @{ Pattern = 'Fichier.*manquant|File.*not found'; Type = "Fichier manquant"; Files = @(); Severity = "high" }
        @{ Pattern = 'Code mort|unused|non utilisé'; Type = "Code mort"; Files = @(); Severity = "medium" }
        @{ Pattern = 'Duplication|duplicate|redondant'; Type = "Code dupliqué"; Files = @(); Severity = "medium" }
    )
    
    foreach ($pattern in $errorPatterns) {
        if ($AuditOutput -match $pattern.Pattern) {
            foreach ($file in $pattern.Files) {
                if ($file -and (Test-Path $file)) {
                    $issues += @{ Type = $pattern.Type; File = $file; Severity = $pattern.Severity }
                }
            }
            if ($pattern.Files.Count -eq 0) {
                $issues += @{ Type = $pattern.Type; File = ""; Severity = $pattern.Severity }
            }
        }
    }
    
    # Vérifier les fichiers critiques manquants
    $criticalFiles = @("api.php", "api/handlers/devices/patients.php", "api/handlers/auth.php")
    foreach ($file in $criticalFiles) {
        if (-not (Test-Path $file)) {
            $issues += @{ Type = "Fichier critique manquant"; File = $file; Severity = "critical" }
        }
    }
    
    # Vérifier les scores faibles
    foreach ($score in $scores.GetEnumerator()) {
        if ($score.Value -lt $TargetScore) {
            $issues += @{ Type = "Score insuffisant"; Category = $score.Key; CurrentScore = $score.Value; TargetScore = $TargetScore; Severity = if ($score.Value -lt 6) { "critical" } elseif ($score.Value -lt 8) { "high" } else { "medium" } }
        }
    }
    
    return @{ Issues = $issues; Scores = $scores }
}

# Boucle principale
while ($Iteration -lt $MaxIterations) {
    $Iteration++
    $ElapsedTime = (Get-Date) - $StartTime
    
    # Vérifier timeout
    if ($ElapsedTime.TotalMinutes -gt $TimeoutMinutes) {
        Write-Host "⏱️  Timeout atteint ($TimeoutMinutes minutes)" -ForegroundColor Yellow
        break
    }
    
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "🔄 ITÉRATION $Iteration" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "⏱️  Temps écoulé: $([math]::Round($ElapsedTime.TotalMinutes, 1)) minutes" -ForegroundColor Gray
    Write-Host ""
    
    # 1. Lancer l'audit complet
    Write-Host "📋 Étape 1: Lancement de l'audit complet..." -ForegroundColor Yellow
    $auditResultFile = "audit\resultats\audit_iteration_$Iteration.json"
    $auditOutput = ""
    
    try {
        # Créer le répertoire de résultats s'il n'existe pas
        $resultDir = "audit\resultats"
        if (-not (Test-Path $resultDir)) {
            New-Item -ItemType Directory -Path $resultDir -Force | Out-Null
        }
        
        # Lancer l'audit et capturer la sortie
        Write-Host "   🔄 Lancement de l'audit..." -ForegroundColor Gray
        $auditOutputFile = "$resultDir\audit_output_$Iteration.txt"
        $auditErrorFile = "$resultDir\audit_error_$Iteration.txt"
        
        # Exécuter l'audit et capturer la sortie
        $auditOutput = & powershell -ExecutionPolicy Bypass -File "audit\audit.ps1" -All 2>&1 | Out-String
        
        # Sauvegarder la sortie
        $auditOutput | Out-File -FilePath $auditOutputFile -Encoding UTF8
        
        Write-Host "✅ Audit terminé" -ForegroundColor Green
    } catch {
        Write-Host "❌ Erreur audit: $($_.Exception.Message)" -ForegroundColor Red
        $auditOutput = ""
    }
    
    # 2. Analyser les résultats
    Write-Host "📋 Étape 2: Analyse des résultats..." -ForegroundColor Yellow
    $analysis = Analyze-AuditResults -AuditOutput $auditOutput
    $currentScores = $analysis.Scores
    $issues = $analysis.Issues
    
    # Afficher les scores actuels
    Write-Host "📊 Scores actuels:" -ForegroundColor Cyan
    if ($currentScores.Count -eq 0) {
        Write-Host "   ⚠️  Aucun score détecté dans l'output" -ForegroundColor Yellow
        # Essayer de lire depuis les fichiers JSON de résultats
        $resultFiles = Get-ChildItem -Path "audit\resultats" -Filter "*state*.json" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($resultFiles) {
            try {
                $jsonContent = Get-Content $resultFiles.FullName -Raw | ConvertFrom-Json
                if ($jsonContent.Scores) {
                    foreach ($score in $jsonContent.Scores.PSObject.Properties) {
                        $currentScores[$score.Name] = [double]$score.Value
                    }
                }
            } catch {
                Write-Host "   ⚠️  Impossible de lire les scores depuis JSON" -ForegroundColor Yellow
            }
        }
    }
    
    foreach ($score in $currentScores.GetEnumerator()) {
        $status = if ($score.Value -ge $TargetScore) { "✅" } elseif ($score.Value -ge 8) { "⚠️" } else { "❌" }
        Write-Host "   $status $($score.Key): $($score.Value)/10" -ForegroundColor $(if ($score.Value -ge $TargetScore) { "Green" } elseif ($score.Value -ge 8) { "Yellow" } else { "Red" })
    }
    
    # Afficher les problèmes détectés
    if ($issues.Count -gt 0) {
        Write-Host "📋 Problèmes détectés: $($issues.Count)" -ForegroundColor Cyan
        foreach ($issue in $issues) {
            $icon = switch ($issue.Severity) {
                "critical" { "🔴" }
                "high" { "🟠" }
                default { "🟡" }
            }
            Write-Host "   $icon $($issue.Type)" -ForegroundColor $(if ($issue.Severity -eq "critical") { "Red" } elseif ($issue.Severity -eq "high") { "Yellow" } else { "Gray" })
            if ($issue.File) {
                Write-Host "      Fichier: $($issue.File)" -ForegroundColor Gray
            }
        }
    }
    
    # Vérifier si tous les scores sont à 100%
    $allAt100 = $true
    $scoresBelowTarget = @()
    
    if ($currentScores.Count -eq 0) {
        $allAt100 = $false
        Write-Host "   ⚠️  Aucun score détecté - continuer l'analyse..." -ForegroundColor Yellow
    } else {
        Write-Host "📊 Analyse des scores:" -ForegroundColor Cyan
        foreach ($score in $currentScores.GetEnumerator()) {
            if ($score.Value -lt $TargetScore) {
                $allAt100 = $false
                $scoresBelowTarget += "$($score.Key): $($score.Value)/10"
                Write-Host "   ❌ $($score.Key): $($score.Value)/10 (objectif: $TargetScore)" -ForegroundColor Red
            } else {
                Write-Host "   ✅ $($score.Key): $($score.Value)/10" -ForegroundColor Green
            }
        }
        
        if ($scoresBelowTarget.Count -gt 0) {
            Write-Host "   ⚠️  $($scoresBelowTarget.Count) score(s) en dessous de $TargetScore" -ForegroundColor Yellow
        }
    }
    
    if ($allAt100) {
        Write-Host ""
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host "🎉 SUCCÈS ! Tous les scores sont à 100% !" -ForegroundColor Green
        Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Résumé final:" -ForegroundColor Cyan
        Write-Host "   Itérations: $Iteration" -ForegroundColor White
        Write-Host "   Temps total: $([math]::Round($ElapsedTime.TotalMinutes, 1)) minutes" -ForegroundColor White
        Write-Host "   Corrections: $($Corrections.Count)" -ForegroundColor White
        Write-Host ""
        Write-Host "✅ Application parfaite - Prête pour la production !" -ForegroundColor Green
        Write-Host ""
        break
    }
    
    # 3. Corriger automatiquement si activé
    if ($AutoFix -and $issues.Count -gt 0) {
        Write-Host "📋 Étape 3: Correction automatique..." -ForegroundColor Yellow
        $fixed = Invoke-AutoFix -Issues $issues
        if ($fixed.Count -gt 0) {
            Write-Host "✅ $($fixed.Count) correction(s) appliquée(s):" -ForegroundColor Green
            foreach ($fix in $fixed) {
                Write-Host "   - $fix" -ForegroundColor White
                $Corrections += $fix
            }
        } else {
            Write-Host "⚠️  Aucune correction automatique possible" -ForegroundColor Yellow
        }
    }
    
    # 4. Sauvegarder l'historique
    $History += @{
        Iteration = $Iteration
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        Scores = $currentScores
        Issues = $issues
        Corrections = if ($AutoFix) { $fixed } else { @() }
    }
    
    Write-Host ""
    Write-Host "⏸️  Pause 5 secondes avant prochaine itération..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
}

# Rapport final
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 RAPPORT FINAL" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "🔄 Itérations: $Iteration/$MaxIterations" -ForegroundColor White
Write-Host "⏱️  Temps total: $([math]::Round($ElapsedTime.TotalMinutes, 1)) minutes" -ForegroundColor White
Write-Host "🔧 Corrections appliquées: $($Corrections.Count)" -ForegroundColor White
Write-Host ""

if ($Corrections.Count -gt 0) {
    Write-Host "📋 Corrections appliquées:" -ForegroundColor Cyan
    foreach ($correction in $Corrections) {
        Write-Host "   ✅ $correction" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "📈 Historique des itérations:" -ForegroundColor Cyan
foreach ($entry in $History) {
    Write-Host "   Itération $($entry.Iteration): $(if ($entry.Scores.Global) { "Score Global: $($entry.Scores.Global)" } else { "Pas de score global" })" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Processus terminé !" -ForegroundColor Green

