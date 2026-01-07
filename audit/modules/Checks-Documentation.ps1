# ===============================================================================
# VÉRIFICATION : DOCUMENTATION (coherence doc/code)
# ===============================================================================

function Invoke-Check-Documentation {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if ($Config.Checks -and $Config.Checks.Documentation -and $Config.Checks.Documentation.Enabled -eq $false) {
        return
    }
    
    Write-PhaseSection -PhaseNumber 9 -Title "Documentation"
    
    try {
        $projectRoot = if ($Config.ProjectRoot) { $Config.ProjectRoot } else { Get-Location }
        $aiContext = @()
        
        # 1. Compter les fichiers de documentation
        $mdFiles = $Files | Where-Object { $_.Extension -eq ".md" }
        $htmlDocs = @()
        if ($projectRoot -and (Test-Path $projectRoot)) {
            $htmlDocs = Get-ChildItem -Path $projectRoot -Recurse -File -Include *.html -ErrorAction SilentlyContinue | Where-Object {
                $_.FullName -match 'docs|documentation|public[\\/]docs'
            }
        }
        
        $docCount = $mdFiles.Count + $htmlDocs.Count
        Write-Info "Documentation: $docCount fichier(s) detecte(s)"
        
        # 2. Detecter les docs accessibles par le dashboard (public/docs, docs/)
        $publicDocs = @()
        $docPaths = @("docs", "public/docs", "public/documentation")
        foreach ($docPath in $docPaths) {
            $fullPath = Join-Path $projectRoot $docPath
            if (Test-Path $fullPath) {
                $docsInPath = Get-ChildItem -Path $fullPath -Recurse -File -Include *.md,*.html -ErrorAction SilentlyContinue
                $publicDocs += $docsInPath
            }
        }
        
        if ($publicDocs.Count -gt 0) {
            Write-Info "$($publicDocs.Count) doc(s) accessible(s) par le dashboard"
        }
        
        # 3. Extraire les references de code dans la documentation
        $codeRefs = @()
        $outdatedRefs = @()
        
        foreach ($doc in $publicDocs) {
            $content = Get-Content $doc.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            # Extraire les noms de fichiers mentionnes (ex: `api.php`, `DeviceDashboard.js`)
            $fileRefs = [regex]::Matches($content, '`([a-zA-Z0-9_-]+\.(js|jsx|php|ps1|py|ts|tsx))`')
            foreach ($ref in $fileRefs) {
                $fileName = $ref.Groups[1].Value
                $exists = $Files | Where-Object { $_.Name -eq $fileName }
                if (-not $exists) {
                    $outdatedRefs += @{
                        Doc = $doc.Name
                        Reference = $fileName
                        Type = "File"
                    }
                }
            }
            
            # Extraire les endpoints API mentionnes (ex: /api/patients, /api.php/devices)
            $endpointRefs = [regex]::Matches($content, '`?(/api[^\s`\)]+)`?')
            foreach ($ref in $endpointRefs) {
                $codeRefs += @{
                    Doc = $doc.Name
                    Endpoint = $ref.Groups[1].Value
                }
            }
            
            # Extraire les noms de fonctions/composants mentionnes
            $funcRefs = [regex]::Matches($content, '`(use[A-Z][a-zA-Z]+|handle[A-Z][a-zA-Z]+|[A-Z][a-zA-Z]+Context)`')
            foreach ($ref in $funcRefs) {
                $funcName = $ref.Groups[1].Value
                # Verifier si la fonction existe dans le code
                $funcExists = $false
                foreach ($file in ($Files | Where-Object { $_.Extension -match '\.(js|jsx|ts|tsx)$' })) {
                    $fileContent = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                    if ($fileContent -and $fileContent -match "\b$funcName\b") {
                        $funcExists = $true
                        break
                    }
                }
                if (-not $funcExists) {
                    $outdatedRefs += @{
                        Doc = $doc.Name
                        Reference = $funcName
                        Type = "Function/Component"
                    }
                }
            }
        }
        
        # 4. Generer contexte IA pour verification coherence
        if ($outdatedRefs.Count -gt 0) {
            Write-Warn "$($outdatedRefs.Count) reference(s) potentiellement obsolete(s) dans la doc"
            
            # Grouper par doc
            $groupedRefs = $outdatedRefs | Group-Object -Property { $_.Doc }
            foreach ($group in $groupedRefs) {
                $docName = if ($group.Name) { $group.Name } else { "documentation" }
                $refList = ($group.Group | ForEach-Object { "$($_.Type): $($_.Reference)" }) -join ", "
                $aiContext += @{
                    Category = "Documentation"
                    Type = "Outdated Documentation"
                    File = $docName
                    Severity = "medium"
                    NeedsAICheck = $true
                    Context = "References potentiellement obsoletes: $refList"
                    Question = "La documentation '$docName' reference des elements qui n'existent plus dans le code: $refList. Verifier si ces references sont obsoletes et proposer une mise a jour."
                }
            }
        } else {
            Write-OK "Aucune reference obsolete detectee dans la documentation"
        }
        
        # 5. Verifier si README existe et est a jour
        $readmePath = Join-Path $projectRoot "README.md"
        $readme = if (Test-Path $readmePath) { Get-Item $readmePath } else { $null }
        if ($readme) {
            $readmeAge = (Get-Date) - $readme.LastWriteTime
            
            if ($readmeAge.TotalDays -gt 90) {
                Write-Warn "README.md non modifie depuis $([int]$readmeAge.TotalDays) jours"
                $aiContext += @{
                    Category = "Documentation"
                    Type = "Stale README"
                    File = "README.md"
                    Severity = "low"
                    NeedsAICheck = $true
                    Context = "Derniere modification: $($readme.LastWriteTime.ToString('yyyy-MM-dd'))"
                    Question = "Le README.md n'a pas ete modifie depuis $([int]$readmeAge.TotalDays) jours. Est-il toujours a jour avec les fonctionnalites actuelles du projet ?"
                }
            } else {
                Write-OK "README.md present et recent"
            }
        } else {
            Write-Warn "README.md absent"
            $aiContext += @{
                Category = "Documentation"
                Type = "Missing README"
                Severity = "high"
                NeedsAICheck = $false
                Question = "Aucun README.md trouve. Creer un README avec: description, installation, usage, structure du projet."
            }
        }
        
        # 6. Calculer le score
        $docScore = 10
        if ($docCount -lt 3) { $docScore -= 2 }
        if ($outdatedRefs.Count -gt 0) { $docScore -= [Math]::Min($outdatedRefs.Count, 3) }
        if (-not $readme) { $docScore -= 2 }
        $docScore = [Math]::Max($docScore, 0)
        
        $Results.Scores["Documentation"] = $docScore
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.Documentation = @{
                Questions = $aiContext
                QuestionCount = $aiContext.Count
            }
        }
        
    } catch {
        Write-Err "Erreur verification documentation: $($_.Exception.Message)"
        $Results.Scores["Documentation"] = 5
    }
}

