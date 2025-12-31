# ===============================================================================
# VÉRIFICATION : FICHIERS MARKDOWN - CONSOLIDATION ET NETTOYAGE
# ===============================================================================

function Invoke-Check-MarkdownFiles {
    param(
        [Parameter(Mandatory=$true)]
        [string]$ProjectRoot,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    # Les fonctions Write-* sont déjà disponibles depuis Utils.ps1 (chargé en premier)
    # Pas besoin de les redéfinir ici
    
    Write-Section "[5/23] Liens et Imports"
    
    try {
        # ================================================================================
        # 1. VÉRIFICATION DES DOCS DASHBOARD (PROTECTION)
        # ================================================================================
        Write-Info "Vérification des fichiers requis par le dashboard..."
        
        $dashboardDocs = @{
            "public/docs/DOCUMENTATION_PRESENTATION.html" = "Documentation Présentation"
            "public/docs/DOCUMENTATION_DEVELOPPEURS.html" = "Documentation Développeurs"
            "public/docs/DOCUMENTATION_COMMERCIALE.html" = "Documentation Commerciale"
            "public/docs/SUIVI_TEMPS_FACTURATION.md" = "Suivi Temps Facturation"
        }
        
        $dashboardStatus = @{
            Required = @()
            Missing = @()
            Protected = @()
        }
        
        foreach ($docPath in $dashboardDocs.Keys) {
            $fullPath = Join-Path $ProjectRoot $docPath
            $exists = Test-Path $fullPath
            $dashboardStatus.Required += @{
                Path = $docPath
                Name = $dashboardDocs[$docPath]
                Exists = $exists
            }
            if ($exists) {
                $dashboardStatus.Protected += $fullPath
            } else {
                $dashboardStatus.Missing += $docPath
            }
        }
        
        if ($dashboardStatus.Missing.Count -gt 0) {
            Write-Err "Fichiers dashboard manquants: $($dashboardStatus.Missing -join ', ')"
        } else {
            Write-OK "Tous les fichiers dashboard sont présents"
        }
        
        # ================================================================================
        # 2. VÉRIFICATION DE COHÉRENCE AVEC LE CODE
        # ================================================================================
        Write-Info "Vérification de cohérence avec le code..."
        
        $coherenceIssues = @{
            HooksMissingInDoc = @()
            HooksMissingInCode = @()
            EndpointsMissingInDoc = @()
            ComponentsMissingInDoc = @()
        }
        
        # Vérifier les hooks documentés vs hooks existants
        $hooksPath = Join-Path $ProjectRoot "hooks"
        if (Test-Path $hooksPath) {
            $existingHooks = Get-ChildItem -Path $hooksPath -Filter "*.js" -File | ForEach-Object { $_.BaseName }
            
            # Hooks récents à vérifier dans la doc
            $recentHooks = @("useApiCall", "useModalState", "useEntityArchive", "useEntityPermanentDelete", "useEntityRestore")
            foreach ($hook in $recentHooks) {
                if ($existingHooks -contains $hook) {
                    # Vérifier si présent dans la doc développeurs
                    $devDocPath = Join-Path $ProjectRoot "public/docs/DOCUMENTATION_DEVELOPPEURS.html"
                    if (Test-Path $devDocPath) {
                        $docContent = Get-Content $devDocPath -Raw -ErrorAction SilentlyContinue
                        if ($docContent -and $docContent -notmatch [regex]::Escape($hook)) {
                            $coherenceIssues.HooksMissingInDoc += $hook
                        }
                    }
                }
            }
        }
        
        if ($coherenceIssues.HooksMissingInDoc.Count -gt 0) {
            Write-Warn "Hooks manquants dans la documentation: $($coherenceIssues.HooksMissingInDoc -join ', ')"
        }
        
        # ================================================================================
        # 3. ANALYSE DES FICHIERS MARKDOWN
        # ================================================================================
        
        # Exclure les dépendances externes (.arduino15, node_modules, etc.)
        $excludePatterns = @(
            "\.arduino15",
            "node_modules",
            "\.git",
            "\.next",
            "out",
            "build"
        )
        
        # PROTECTION : Exclure les fichiers dashboard de l'analyse de consolidation
        $protectedPatterns = @(
            "public\\docs\\.*",  # Tous les fichiers dans public/docs/
            "public/docs/.*"     # Format alternatif
        )
        
        # Trouver tous les fichiers .md
        $allMdFiles = Get-ChildItem -Path $ProjectRoot -Recurse -File -Filter "*.md" -ErrorAction SilentlyContinue | Where-Object {
            $excluded = $false
            $protected = $false
            
            # Vérifier les exclusions
            foreach ($pattern in $excludePatterns) {
                if ($_.FullName -match $pattern) {
                    $excluded = $true
                    break
                }
            }
            
            # Vérifier les fichiers protégés (dashboard)
            if (-not $excluded) {
                foreach ($pattern in $protectedPatterns) {
                    if ($_.FullName -match $pattern) {
                        $protected = $true
                        break
                    }
                }
            }
            
            # Exclure si exclu OU protégé
            return (-not $excluded) -and (-not $protected)
        }
        
        Write-Info "Fichiers MD trouvés (hors dashboard): $($allMdFiles.Count)"
        
        $mdAnalysis = @{
            TotalFiles = $allMdFiles.Count
            ByDirectory = @{}
            Duplicates = @()
            Obsolete = @()
            ToConsolidate = @()
            ToArchive = @()
            ToDelete = @()
            ToKeep = @()
            Recommendations = @()
            DashboardStatus = $dashboardStatus
            CoherenceIssues = $coherenceIssues
            ConsolidationGroups = @()
        }
        
        # Analyser par répertoire
        foreach ($file in $allMdFiles) {
            $dir = $file.DirectoryName
            if ($dir.StartsWith($ProjectRoot)) {
                $dir = $dir.Substring($ProjectRoot.Length)
            }
            $dir = $dir.TrimStart('\', '/')
            if ([string]::IsNullOrEmpty($dir)) {
                $dir = "racine"
            }
            
            if (-not $mdAnalysis.ByDirectory.ContainsKey($dir)) {
                $mdAnalysis.ByDirectory[$dir] = @()
            }
            $mdAnalysis.ByDirectory[$dir] += $file
        }
        
        # Analyser le contenu pour identifier les doublons et obsolètes
        $fileContents = @{}
        $fileSizes = @{}
        
        foreach ($file in $allMdFiles) {
            try {
                $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
                $size = (Get-Item $file.FullName).Length
                $fileContents[$file.FullName] = $content
                $fileSizes[$file.FullName] = $size
                
                # Détecter les fichiers potentiellement obsolètes
                $fileName = $file.Name.ToLower()
                $filePath = $file.FullName.ToLower()
                
                # Patterns indiquant des fichiers obsolètes (mais exclure les faux positifs)
                $obsoletePatterns = @(
                    "old", "backup", "temporary", "deprecated", "archive",
                    "ancien", "ancienne", "old_", "backup_"
                )
                
                # Exceptions : fichiers qui contiennent "temp" mais ne sont PAS obsolètes
                $falsePositives = @(
                    "suivi.*temp.*facturation",  # SUIVI_TEMPS_FACTURATION.md
                    "temps.*facturation"          # Fichiers de suivi du temps
                )
                
                $isObsolete = $false
                $isFalsePositive = $false
                
                # Vérifier d'abord les faux positifs
                foreach ($fp in $falsePositives) {
                    if ($fileName -match $fp -or $filePath -match $fp) {
                        $isFalsePositive = $true
                        break
                    }
                }
                
                # Si ce n'est pas un faux positif, vérifier les patterns obsolètes
                if (-not $isFalsePositive) {
                    foreach ($pattern in $obsoletePatterns) {
                        if ($fileName -like "*$pattern*" -or $filePath -like "*$pattern*") {
                            $mdAnalysis.Obsolete += @{
                                File = $file.FullName
                                Reason = "Nom contient '$pattern'"
                            }
                            $isObsolete = $true
                            break
                        }
                    }
                    
                    # Vérifier "temp" seulement si ce n'est pas un faux positif
                    if (-not $isObsolete -and ($fileName -like "*temp*" -or $filePath -like "*temp*")) {
                        # Exclure les fichiers de suivi du temps
                        if ($fileName -notlike "*suivi*" -and $fileName -notlike "*temps*" -and $fileName -notlike "*facturation*") {
                            $mdAnalysis.Obsolete += @{
                                File = $file.FullName
                                Reason = "Nom contient 'temp' (vérifier manuellement)"
                            }
                            $isObsolete = $true
                        }
                    }
                }
                
                # Détecter les fichiers très petits (probablement vides ou obsolètes)
                if ($size -lt 100 -and -not $isObsolete) {
                    $mdAnalysis.Obsolete += @{
                        File = $file.FullName
                        Reason = "Fichier très petit ($size bytes) - probablement vide ou obsolète"
                    }
                }
                
                # Détecter les fichiers de résultats d'audit anciens
                if ($filePath -like "*audit*resultats*" -and $fileName -like "*2025*") {
                    # Garder les plus récents, marquer les anciens pour archivage
                    $dateMatch = [regex]::Match($fileName, "(\d{4}-\d{2}-\d{2})")
                    if ($dateMatch.Success) {
                        $fileDate = [DateTime]::ParseExact($dateMatch.Groups[1].Value, "yyyy-MM-dd", $null)
                        $daysOld = (Get-Date) - $fileDate
                        
                        if ($daysOld.Days -gt 30) {
                            $mdAnalysis.ToArchive += @{
                                File = $file.FullName
                                Reason = "Résultat d'audit ancien ($($daysOld.Days) jours)"
                                Date = $fileDate
                                TargetPath = "audit/resultats/archive/"
                            }
                        }
                    }
                }
                
                # Identifier les fichiers à supprimer (obsolètes confirmés)
                $fileNameLower = $fileName
                if ($fileNameLower -like "*liste*questions*audit*" -or 
                    $fileNameLower -like "*confirmation*protection*" -or
                    $fileNameLower -like "*ancien*repertoire*") {
                    $mdAnalysis.ToDelete += @{
                        File = $file.FullName
                        Reason = "Fichier obsolète confirmé"
                    }
                }
                
                # Identifier les fichiers à archiver (statuts ponctuels)
                if ($fileNameLower -like "*status*firmware*" -or
                    $fileNameLower -like "*analyse*coherence*" -or
                    $fileNameLower -like "*resume*actions*") {
                    $mdAnalysis.ToArchive += @{
                        File = $file.FullName
                        Reason = "Document de statut/analyse ponctuel"
                        TargetPath = "docs/archive/"
                    }
                }
                
            } catch {
                Write-Warn "Erreur lecture $($file.FullName): $($_.Exception.Message)"
            }
        }
        
        # Détecter les doublons (même nom dans différents répertoires)
        $fileNames = @{}
        foreach ($file in $allMdFiles) {
            $name = $file.Name
            if (-not $fileNames.ContainsKey($name)) {
                $fileNames[$name] = @()
            }
            $fileNames[$name] += $file
        }
        
        foreach ($name in $fileNames.Keys) {
            if ($fileNames[$name].Count -gt 1) {
                $mdAnalysis.Duplicates += @{
                    Name = $name
                    Files = $fileNames[$name] | ForEach-Object { $_.FullName }
                    Count = $fileNames[$name].Count
                }
            }
        }
        
        # Analyser les répertoires avec beaucoup de fichiers MD
        foreach ($dir in $mdAnalysis.ByDirectory.Keys) {
            $count = $mdAnalysis.ByDirectory[$dir].Count
            if ($count -gt 5) {
                $mdAnalysis.ToConsolidate += @{
                    Directory = $dir
                    Files = $mdAnalysis.ByDirectory[$dir] | ForEach-Object { $_.FullName }
                    Count = $count
                    Reason = "Trop de fichiers MD dans un même répertoire ($count fichiers)"
                }
            }
        }
        
        # ================================================================================
        # 4. IDENTIFIER LES GROUPES DE CONSOLIDATION
        # ================================================================================
        
        # Groupe 1 : Guides Collaboration
        $collabFiles = $allMdFiles | Where-Object {
            $name = $_.Name.ToLower()
            $name -like "*workflow*collaboration*" -or $name -like "*readme*collaboration*"
        }
        if ($collabFiles.Count -ge 2) {
            $mdAnalysis.ConsolidationGroups += @{
                Name = "Guides Collaboration"
                Files = $collabFiles | ForEach-Object { $_.FullName }
                TargetPath = "docs/guides/COLLABORATION.md"
                Action = "Fusionner"
            }
        }
        
        # Groupe 2 : Consolidation Audit
        $consolidationFiles = $allMdFiles | Where-Object {
            $name = $_.Name.ToLower()
            $name -like "*consolidation*" -and $_.DirectoryName -like "*audit*"
        }
        if ($consolidationFiles.Count -ge 2) {
            $mdAnalysis.ConsolidationGroups += @{
                Name = "Consolidation Audit"
                Files = $consolidationFiles | ForEach-Object { $_.FullName }
                TargetPath = "docs/audit/CONSOLIDATION.md"
                Action = "Fusionner"
            }
        }
        
        # Groupe 3 : Documentation Scripts
        $scriptsFiles = $allMdFiles | Where-Object {
            $_.DirectoryName -like "*scripts*" -and $_.Name -like "*.md"
        }
        if ($scriptsFiles.Count -ge 2) {
            $mdAnalysis.ConsolidationGroups += @{
                Name = "Documentation Scripts"
                Files = $scriptsFiles | ForEach-Object { $_.FullName }
                TargetPath = "docs/scripts/SCRIPTS.md"
                Action = "Fusionner"
            }
        }
        
        # Générer des recommandations
        if ($dashboardStatus.Missing.Count -gt 0) {
            $mdAnalysis.Recommendations += "URGENT: $($dashboardStatus.Missing.Count) fichier(s) dashboard manquant(s)"
        }
        
        if ($coherenceIssues.HooksMissingInDoc.Count -gt 0) {
            $mdAnalysis.Recommendations += "METTRE A JOUR: Documentation développeurs manque $($coherenceIssues.HooksMissingInDoc.Count) hook(s)"
        }
        
        if ($mdAnalysis.Obsolete.Count -gt 0) {
            $mdAnalysis.Recommendations += "SUPPRIMER: $($mdAnalysis.Obsolete.Count) fichier(s) obsolète(s) identifié(s)"
        }
        
        if ($mdAnalysis.ToDelete.Count -gt 0) {
            $mdAnalysis.Recommendations += "SUPPRIMER: $($mdAnalysis.ToDelete.Count) fichier(s) obsolète(s) confirmé(s)"
        }
        
        if ($mdAnalysis.ToArchive.Count -gt 0) {
            $mdAnalysis.Recommendations += "ARCHIVER: $($mdAnalysis.ToArchive.Count) fichier(s) historique(s)"
        }
        
        if ($mdAnalysis.Duplicates.Count -gt 0) {
            $mdAnalysis.Recommendations += "CONSOLIDER: $($mdAnalysis.Duplicates.Count) doublon(s) de nom de fichier détecté(s)"
        }
        
        if ($mdAnalysis.ConsolidationGroups.Count -gt 0) {
            $mdAnalysis.Recommendations += "CONSOLIDER: $($mdAnalysis.ConsolidationGroups.Count) groupe(s) de fichiers à fusionner"
        }
        
        if ($mdAnalysis.ToConsolidate.Count -gt 0) {
            $mdAnalysis.Recommendations += "CONSOLIDER: $($mdAnalysis.ToConsolidate.Count) groupe(s) de fichiers à consolider"
        }
        
        # Afficher les résultats
        Write-Host ""
        Write-Host "  📊 Statistiques:" -ForegroundColor Cyan
        Write-Host "     Total fichiers MD: $($mdAnalysis.TotalFiles)" -ForegroundColor White
        Write-Host "     Répertoires: $($mdAnalysis.ByDirectory.Keys.Count)" -ForegroundColor White
        
        # Afficher le statut des docs dashboard
        if ($dashboardStatus.Missing.Count -gt 0) {
            Write-Host ""
            Write-Host "  ⚠️  Fichiers Dashboard Manquants ($($dashboardStatus.Missing.Count)):" -ForegroundColor Red
            foreach ($missing in $dashboardStatus.Missing) {
                Write-Host "     - $missing" -ForegroundColor Red
            }
        } else {
            Write-Host ""
            Write-Host "  ✅ Tous les fichiers dashboard sont présents" -ForegroundColor Green
        }
        
        # Afficher les problèmes de cohérence
        if ($coherenceIssues.HooksMissingInDoc.Count -gt 0) {
            Write-Host ""
            Write-Host "  ⚠️  Hooks Manquants dans la Documentation:" -ForegroundColor Yellow
            foreach ($hook in $coherenceIssues.HooksMissingInDoc) {
                Write-Host "     - $hook" -ForegroundColor Gray
            }
        }
        
        # Afficher les groupes de consolidation
        if ($mdAnalysis.ConsolidationGroups.Count -gt 0) {
            Write-Host ""
            Write-Host "  📦 Groupes de Consolidation ($($mdAnalysis.ConsolidationGroups.Count)):" -ForegroundColor Cyan
            foreach ($group in $mdAnalysis.ConsolidationGroups) {
                Write-Host "     - $($group.Name) → $($group.TargetPath)" -ForegroundColor Gray
                Write-Host "       Fichiers: $($group.Files.Count)" -ForegroundColor DarkGray
            }
        }
        
        # Afficher les fichiers à archiver
        if ($mdAnalysis.ToArchive.Count -gt 0) {
            Write-Host ""
            Write-Host "  🗄️  Fichiers à Archiver ($($mdAnalysis.ToArchive.Count)):" -ForegroundColor Yellow
            foreach ($item in $mdAnalysis.ToArchive) {
                $relativePath = $item.File
                if ($relativePath.StartsWith($ProjectRoot)) {
                    $relativePath = $relativePath.Substring($ProjectRoot.Length)
                }
                $relativePath = $relativePath.TrimStart('\', '/')
                Write-Host "     - $relativePath → $($item.TargetPath)" -ForegroundColor Gray
                Write-Host "       Raison: $($item.Reason)" -ForegroundColor DarkGray
            }
        }
        
        # Afficher les fichiers à supprimer
        if ($mdAnalysis.ToDelete.Count -gt 0) {
            Write-Host ""
            Write-Host "  🗑️  Fichiers à Supprimer ($($mdAnalysis.ToDelete.Count)):" -ForegroundColor Red
            foreach ($item in $mdAnalysis.ToDelete) {
                $relativePath = $item.File
                if ($relativePath.StartsWith($ProjectRoot)) {
                    $relativePath = $relativePath.Substring($ProjectRoot.Length)
                }
                $relativePath = $relativePath.TrimStart('\', '/')
                Write-Host "     - $relativePath" -ForegroundColor Gray
                Write-Host "       Raison: $($item.Reason)" -ForegroundColor DarkGray
            }
        }
        
        if ($mdAnalysis.Obsolete.Count -gt 0) {
            Write-Host ""
            Write-Host "  🗑️  Fichiers obsolètes ($($mdAnalysis.Obsolete.Count)):" -ForegroundColor Yellow
            foreach ($item in $mdAnalysis.Obsolete) {
                $relativePath = $item.File
                if ($relativePath.StartsWith($ProjectRoot)) {
                    $relativePath = $relativePath.Substring($ProjectRoot.Length)
                }
                $relativePath = $relativePath.TrimStart('\', '/')
                Write-Host "     - $relativePath ($($item.Reason))" -ForegroundColor Gray
            }
        }
        
        if ($mdAnalysis.Duplicates.Count -gt 0) {
            Write-Host ""
            Write-Host "  🔄 Doublons ($($mdAnalysis.Duplicates.Count)):" -ForegroundColor Yellow
            foreach ($dup in $mdAnalysis.Duplicates) {
                Write-Host "     - $($dup.Name) ($($dup.Count) occurrences)" -ForegroundColor Gray
                foreach ($file in $dup.Files) {
                    $relativePath = $file
                    if ($relativePath.StartsWith($ProjectRoot)) {
                        $relativePath = $relativePath.Substring($ProjectRoot.Length)
                    }
                    $relativePath = $relativePath.TrimStart('\', '/')
                    Write-Host "       • $relativePath" -ForegroundColor DarkGray
                }
            }
        }
        
        if ($mdAnalysis.ToConsolidate.Count -gt 0) {
            Write-Host ""
            Write-Host "  📦 À consolider ($($mdAnalysis.ToConsolidate.Count)):" -ForegroundColor Yellow
            foreach ($item in $mdAnalysis.ToConsolidate) {
                if ($item.ContainsKey("File")) {
                    $relativePath = $item.File.Replace($ProjectRoot, "")
                    $relativePath = $relativePath.TrimStart('\').TrimStart('/')
                    Write-Host "     - $relativePath ($($item.Reason))" -ForegroundColor Gray
                } elseif ($item.ContainsKey("Directory")) {
                    Write-Host "     - $($item.Directory) ($($item.Count) fichiers)" -ForegroundColor Gray
                }
            }
        }
        
        # Calculer le score
        $score = 10
        
        # Pénalités pour fichiers dashboard manquants (critique)
        if ($dashboardStatus.Missing.Count -gt 0) {
            $score -= [Math]::Min(5, $dashboardStatus.Missing.Count * 2)
        }
        
        # Pénalités pour problèmes de cohérence
        if ($coherenceIssues.HooksMissingInDoc.Count -gt 0) {
            $score -= [Math]::Min(2, $coherenceIssues.HooksMissingInDoc.Count)
        }
        
        # Pénalités pour fichiers obsolètes
        if ($mdAnalysis.Obsolete.Count -gt 0) {
            $score -= [Math]::Min(3, $mdAnalysis.Obsolete.Count)
        }
        
        # Pénalités pour doublons
        if ($mdAnalysis.Duplicates.Count -gt 0) {
            $score -= [Math]::Min(2, $mdAnalysis.Duplicates.Count)
        }
        
        # Pénalités pour trop de fichiers à consolider
        if ($mdAnalysis.ToConsolidate.Count -gt 5) {
            $score -= 2
        }
        
        $score = [Math]::Max(0, $score)
        
        # Sauvegarder les résultats
        $Results.MarkdownAnalysis = $mdAnalysis
        $Results.Scores["MarkdownFiles"] = $score
        
        if ($score -eq 10) {
            Write-OK "Aucun problème détecté avec les fichiers Markdown"
        } else {
            Write-Warn "Problèmes détectés: $($mdAnalysis.Obsolete.Count) obsolètes, $($mdAnalysis.Duplicates.Count) doublons, $($mdAnalysis.ToConsolidate.Count) à consolider"
        }
        
        # Générer un rapport détaillé
        $reportFile = Join-Path $ProjectRoot "audit\resultats\ANALYSE_MARKDOWN_$(Get-Date -Format 'yyyyMMdd_HHmmss').md"
        $nl = [Environment]::NewLine
        $reportContent = "# Analyse des Fichiers Markdown - $(Get-Date -Format 'yyyy-MM-dd HH:mm')" + $nl + $nl
        $reportContent += "## Statistiques" + $nl + $nl
        $reportContent += "- Total fichiers MD: $($mdAnalysis.TotalFiles)" + $nl
        $reportContent += "- Repertoires: $($mdAnalysis.ByDirectory.Keys.Count)" + $nl + $nl
        
        $reportContent += "## Fichiers Obsoletes ($($mdAnalysis.Obsolete.Count))" + $nl + $nl
        
        foreach ($item in $mdAnalysis.Obsolete) {
            $relativePath = $item.File.Replace($ProjectRoot, "")
            $relativePath = $relativePath.TrimStart('\').TrimStart('/')
            $reportContent += "- $relativePath" + $nl
            $reportContent += "  - Raison: $($item.Reason)" + $nl + $nl
        }
        
        $reportContent += "## Doublons ($($mdAnalysis.Duplicates.Count))" + $nl + $nl
        
        foreach ($dup in $mdAnalysis.Duplicates) {
            $reportContent += "### $($dup.Name) ($($dup.Count) occurrences)" + $nl + $nl
            foreach ($file in $dup.Files) {
                $relativePath = $file.Replace($ProjectRoot, "")
                $relativePath = $relativePath.TrimStart('\').TrimStart('/')
                $reportContent += "- $relativePath" + $nl
            }
            $reportContent += $nl
        }
        
        $reportContent += "## Fichiers a Consolider ($($mdAnalysis.ToConsolidate.Count))" + $nl + $nl
        
        foreach ($item in $mdAnalysis.ToConsolidate) {
            if ($item.ContainsKey("File")) {
                $relativePath = $item.File
                if ($relativePath.StartsWith($ProjectRoot)) {
                    $relativePath = $relativePath.Substring($ProjectRoot.Length)
                }
                $relativePath = $relativePath.TrimStart('\', '/')
                $reportContent += "- $relativePath" + $nl
                $reportContent += "  - Raison: $($item.Reason)" + $nl + $nl
            } elseif ($item.ContainsKey("Directory")) {
                $reportContent += "- Repertoire: $($item.Directory) ($($item.Count) fichiers)" + $nl + $nl
            }
        }
        
        $reportContent += "## Fichiers a Archiver ($($mdAnalysis.ToArchive.Count))" + $nl + $nl
        
        foreach ($item in $mdAnalysis.ToArchive) {
            $relativePath = $item.File
            if ($relativePath.StartsWith($ProjectRoot)) {
                $relativePath = $relativePath.Substring($ProjectRoot.Length)
            }
            $relativePath = $relativePath.TrimStart('\', '/')
            $reportContent += "- $relativePath → $($item.TargetPath)" + $nl
            $reportContent += "  - Raison: $($item.Reason)" + $nl + $nl
        }
        
        $reportContent += "## Fichiers a Supprimer ($($mdAnalysis.ToDelete.Count))" + $nl + $nl
        
        foreach ($item in $mdAnalysis.ToDelete) {
            $relativePath = $item.File
            if ($relativePath.StartsWith($ProjectRoot)) {
                $relativePath = $relativePath.Substring($ProjectRoot.Length)
            }
            $relativePath = $relativePath.TrimStart('\', '/')
            $reportContent += "- $relativePath" + $nl
            $reportContent += "  - Raison: $($item.Reason)" + $nl + $nl
        }
        
        $reportContent += "## Groupes de Consolidation ($($mdAnalysis.ConsolidationGroups.Count))" + $nl + $nl
        
        foreach ($group in $mdAnalysis.ConsolidationGroups) {
            $reportContent += "### $($group.Name)" + $nl + $nl
            $reportContent += "**Cible**: $($group.TargetPath)" + $nl + $nl
            $reportContent += "**Fichiers à fusionner**:" + $nl
            foreach ($file in $group.Files) {
                $relativePath = $file
                if ($relativePath.StartsWith($ProjectRoot)) {
                    $relativePath = $relativePath.Substring($ProjectRoot.Length)
                }
                $relativePath = $relativePath.TrimStart('\', '/')
                $reportContent += "- $relativePath" + $nl
            }
            $reportContent += $nl
        }
        
        $reportContent += "## Statut Dashboard" + $nl + $nl
        
        if ($dashboardStatus.Missing.Count -gt 0) {
            $reportContent += "**⚠️ FICHIERS MANQUANTS**:" + $nl
            foreach ($missing in $dashboardStatus.Missing) {
                $reportContent += "- $missing" + $nl
            }
            $reportContent += $nl
        } else {
            $reportContent += "✅ Tous les fichiers requis sont présents" + $nl + $nl
        }
        
        $reportContent += "## Problemes de Coherence" + $nl + $nl
        
        if ($coherenceIssues.HooksMissingInDoc.Count -gt 0) {
            $reportContent += "**Hooks manquants dans la documentation**: $($coherenceIssues.HooksMissingInDoc -join ', ')" + $nl + $nl
        } else {
            $reportContent += "✅ Aucun problème de cohérence détecté" + $nl + $nl
        }
        
        $reportContent += "## Recommandations" + $nl + $nl
        
        foreach ($rec in $mdAnalysis.Recommendations) {
            $reportContent += "- $rec" + $nl
        }
        
        $reportContent | Out-File -FilePath $reportFile -Encoding UTF8
        Write-OK "Rapport détaillé sauvegardé: $reportFile"
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        if ($dashboardStatus.Missing.Count -gt 0) {
            $aiContext += @{
                Category = "MarkdownFiles"
                Type = "Missing Dashboard Files"
                MissingFiles = $dashboardStatus.Missing
                Count = $dashboardStatus.Missing.Count
                Severity = "high"
                NeedsAICheck = $true
                Question = "$($dashboardStatus.Missing.Count) fichier(s) dashboard manquant(s): $($dashboardStatus.Missing -join ', '). Ces fichiers sont-ils critiques pour le fonctionnement du dashboard ? Doivent-ils être créés ou restaurés ?"
            }
        }
        if ($coherenceIssues.HooksMissingInDoc.Count -gt 0) {
            $aiContext += @{
                Category = "MarkdownFiles"
                Type = "Hooks Missing in Documentation"
                MissingHooks = $coherenceIssues.HooksMissingInDoc
                Count = $coherenceIssues.HooksMissingInDoc.Count
                Severity = "medium"
                NeedsAICheck = $true
                Question = "$($coherenceIssues.HooksMissingInDoc.Count) hook(s) manquant(s) dans la documentation développeurs: $($coherenceIssues.HooksMissingInDoc -join ', '). La documentation doit-elle être mise à jour pour inclure ces hooks ?"
            }
        }
        if ($mdAnalysis.Obsolete.Count -gt 0 -or $mdAnalysis.ToDelete.Count -gt 0) {
            $totalObsolete = $mdAnalysis.Obsolete.Count + $mdAnalysis.ToDelete.Count
            $aiContext += @{
                Category = "MarkdownFiles"
                Type = "Obsolete Files"
                ObsoleteCount = $mdAnalysis.Obsolete.Count
                ToDeleteCount = $mdAnalysis.ToDelete.Count
                Total = $totalObsolete
                Severity = "low"
                NeedsAICheck = $true
                Question = "$totalObsolete fichier(s) Markdown obsolète(s) détecté(s) ($($mdAnalysis.Obsolete.Count) obsolètes, $($mdAnalysis.ToDelete.Count) à supprimer). Ces fichiers peuvent-ils être supprimés en toute sécurité ou doivent-ils être archivés ?"
            }
        }
        if ($mdAnalysis.Duplicates.Count -gt 0) {
            $aiContext += @{
                Category = "MarkdownFiles"
                Type = "Duplicate Files"
                Duplicates = $mdAnalysis.Duplicates
                Count = $mdAnalysis.Duplicates.Count
                Severity = "low"
                NeedsAICheck = $true
                Question = "$($mdAnalysis.Duplicates.Count) doublon(s) de fichiers Markdown détecté(s). Ces fichiers doivent-ils être consolidés ou l'un d'eux peut-il être supprimé ?"
            }
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.MarkdownFiles = @{
                Questions = $aiContext
            }
        }
        
    } catch {
        Write-Err "Erreur analyse fichiers Markdown: $($_.Exception.Message)"
        $Results.Scores["MarkdownFiles"] = 5
    }
}
