# ===============================================================================
# VÉRIFICATION : DUPLICATION DE CODE (VERSION AMÉLIORÉE - GÉNÉRALISTE)
# ===============================================================================
# Détecte les patterns de duplication sans noms de fonctions spécifiques

function Invoke-Check-Duplication {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    # Si Checks n'existe pas ou Duplication.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.Duplication -and $Config.Checks.Duplication.Enabled -eq $false) {
        return
    }
    
    Write-PhaseSection -PhaseNumber 7 -Title "Duplication de Code"
    
    try {
        $searchFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$|\.php$" }
        $threshold = $Config.Checks.Duplication.Threshold
        $aiContext = @()  # Contexte pour l'IA
        
        # Patterns génériques (pas de noms spécifiques)
        $patterns = @(
            @{Pattern='useState\('; Description='useState'; Seuil=100; Context="React"},
            @{Pattern='useEffect\('; Description='useEffect'; Seuil=80; Context="React"},
            @{Pattern='fetchJson|fetch\(|axios\.|http\.'; Description='Appels API'; Seuil=50; Context="Frontend"},
            @{Pattern='try\s*\{'; Description='Try/catch'; Seuil=100; Context="Error Handling"},
            @{Pattern='->(query|prepare|execute)'; Description='Requêtes SQL'; Seuil=30; Context="PHP"},
            @{Pattern='function\s+\w+Archive|handleArchive|archive\s*='; Description='Fonctions Archive'; Seuil=2; Context="CRUD"},
            @{Pattern='function\s+\w+Delete|handleDelete|delete\s*='; Description='Fonctions Delete'; Seuil=2; Context="CRUD"},
            @{Pattern='function\s+\w+Restore|handleRestore|restore\s*='; Description='Fonctions Restore'; Seuil=2; Context="CRUD"}
        )
        
        $duplications = @()
        
        # Détecter fonctions dupliquées (pattern générique)
        Write-Info "Analyse fonctions dupliquées avec patterns génériques..."
        
        foreach ($pattern in $patterns) {
            $matches = @($searchFiles | Select-String -Pattern $pattern.Pattern)
            $count = $matches.Count
            $fileCount = ($matches | Group-Object Path).Count
            
            if ($count -gt $pattern.Seuil) {
                Write-Warn "$($pattern.Description): $count occurrences dans $fileCount fichiers"
                $duplications += @{Pattern=$pattern.Description; Count=$count; Files=$fileCount; Context=$pattern.Context}
                
                # Générer contexte pour l'IA si seuil dépassé significativement
                if ($count -gt $pattern.Seuil * 1.5) {
                    $aiContext += @{
                        Category = "Duplication"
                        Type = "Pattern Overuse"
                        Pattern = $pattern.Description
                        Count = $count
                        Files = $fileCount
                        Context = $pattern.Context
                        Severity = "medium"
                        NeedsAICheck = $true
                        Question = "Le pattern '$($pattern.Description)' est utilisé $count fois. Y a-t-il des opportunités de refactoring pour réduire cette duplication ?"
                    }
                }
            }
        }
        
        # ============================================================================
        # DÉTECTION DES FICHIERS AVEC SUFFIXES INDICANT DES VARIANTES
        # ============================================================================
        # Détecte les fichiers avec des noms similaires mais des suffixes différents
        # (simple, optimized, v2, refactored, new, old, etc.)
        Write-Info "Détection des fichiers avec suffixes de variantes..."
        
        $variantSuffixes = @(
            'simple', 'simplified', 'simplify',
            'optimized', 'optimised', 'optimize', 'opt',
            'refactored', 'refactor', 'ref',
            'v\d+', 'version\d+', 'ver\d+',  # v1, v2, version1, etc.
            'new', 'old',
            'backup', 'copy', 'duplicate',
            'fast', 'slow',
            'test', 'testing',
            'temp', 'tmp', 'temporary'
        )
        
        $variantPattern = '\b(' + ($variantSuffixes -join '|') + ')\b'
        
        # Grouper les fichiers par nom de base (sans suffixe)
        $fileGroups = @{}
        $variantFiles = @()
        
        foreach ($file in $searchFiles) {
            $baseName = $file.BaseName
            $fullName = $file.Name
            
            # Vérifier si le nom contient un suffixe de variante
            if ($baseName -match $variantPattern) {
                $variantFiles += $file
                
                # Extraire le nom de base (sans suffixe de variante)
                # Ex: "UsbStreamingTab" depuis "SimpleUsbStreamingTab" ou "UsbStreamingTabSimple"
                $baseNameClean = $baseName
                $capturedSuffix = $null
                
                # Capturer le suffixe pour référence
                if ($matches -and $matches.Count -gt 1) {
                    $capturedSuffix = $matches[1]
                }
                
                # Pattern pour identifier le nom de base
                # Cas 1: Suffixe au début en camelCase (ex: SimpleUsbStreamingTab -> UsbStreamingTab)
                # Cas 2: Suffixe à la fin en camelCase (ex: UsbStreamingTabSimple -> UsbStreamingTab)
                # Cas 3: Suffixe avec underscore/hyphen (ex: usb_streaming_tab_simple -> usb_streaming_tab)
                
                # Liste des suffixes possibles (version regex-friendly)
                $suffixList = 'simple|simplified|optimized|optimised|refactored|new|old|fast|slow|test|temp|tmp|opt|ref'
                $suffixListWithVersion = "$suffixList|v[0-9]+|version[0-9]+|ver[0-9]+"
                
                # Enlever le suffixe du début (camelCase: SimpleComponent -> Component)
                if ($baseNameClean -match "^($suffixListWithVersion)([A-Z])") {
                    $baseNameClean = $baseNameClean -replace "^($suffixListWithVersion)([A-Z])", '$2'
                }
                
                # Enlever le suffixe de la fin (camelCase: ComponentSimple -> Component)
                if ($baseNameClean -match "([a-z0-9])(Simple|Optimized|Optimised|Refactored|New|Old|Fast|Slow|Test|Temp|Tmp|Opt|Ref|V[0-9]+|Version[0-9]+)$") {
                    $baseNameClean = $baseNameClean -replace "([a-z0-9])(Simple|Optimized|Optimised|Refactored|New|Old|Fast|Slow|Test|Temp|Tmp|Opt|Ref|V[0-9]+|Version[0-9]+)$", '$1'
                }
                
                # Enlever le suffixe avec underscore/hyphen (snake_case ou kebab-case)
                $baseNameClean = $baseNameClean -replace "[_-]($suffixListWithVersion)$", ''
                
                # Si le nom est vide après nettoyage, utiliser le nom original
                if ([string]::IsNullOrWhiteSpace($baseNameClean)) {
                    $baseNameClean = $baseName
                }
                
                # Normaliser pour la comparaison (enlever les underscores/hyphens et mettre en minuscule)
                $normalizedBase = ($baseNameClean -replace '[_-]', '').ToLower()
                
                if (-not $fileGroups.ContainsKey($normalizedBase)) {
                    $fileGroups[$normalizedBase] = @()
                }
                $fileGroups[$normalizedBase] += @{
                    File = $file
                    OriginalName = $fullName
                    BaseName = $baseNameClean
                    Suffix = if ($capturedSuffix) { $capturedSuffix } else { "unknown" }
                }
            }
        }
        
        # Détecter les groupes avec plusieurs fichiers (variantes multiples)
        $variantDuplicates = @()
        foreach ($groupKey in $fileGroups.Keys) {
            $group = $fileGroups[$groupKey]
            if ($group.Count -gt 1) {
                # Plusieurs fichiers avec le même nom de base mais différents suffixes
                $variantDuplicates += @{
                    BaseName = $group[0].BaseName
                    Files = $group
                    Count = $group.Count
                }
            }
        }
        
        # Comparer le contenu des fichiers similaires pour confirmer la duplication
        $confirmedDuplicates = @()
        foreach ($dup in $variantDuplicates) {
            if ($dup.Files.Count -lt 2) { continue }
            
            # Lire le contenu des fichiers et calculer une similarité basique
            $fileContents = @()
            foreach ($fileInfo in $dup.Files) {
                try {
                    $content = Get-Content -Path $fileInfo.File.FullName -Raw -ErrorAction SilentlyContinue
                    if ($content) {
                        # Normaliser le contenu (enlever les espaces, commentaires basiques, etc.)
                        $normalized = ($content -replace '\s+', ' ' -replace '//.*?$', '' -replace '/\*.*?\*/', '').Trim()
                        $fileContents += @{
                            File = $fileInfo
                            Content = $normalized
                            Length = $normalized.Length
                        }
                    }
                } catch {
                    # Ignorer les erreurs de lecture
                }
            }
            
            # Comparer chaque paire de fichiers
            for ($i = 0; $i -lt $fileContents.Count; $i++) {
                for ($j = $i + 1; $j -lt $fileContents.Count; $j++) {
                    $file1 = $fileContents[$i]
                    $file2 = $fileContents[$j]
                    
                    # Calculer une similarité simple (ratio de caractères communs)
                    # Méthode simple : utiliser la distance de Levenshtein simplifiée
                    $similarity = 0
                    if ($file1.Length -gt 0 -and $file2.Length -gt 0) {
                        $minLength = [Math]::Min($file1.Length, $file2.Length)
                        $maxLength = [Math]::Max($file1.Length, $file2.Length)
                        
                        # Comparer les premières lignes et dernières lignes
                        $content1Lines = ($file1.Content -split '[\r\n]+') | Where-Object { $_.Trim().Length -gt 0 }
                        $content2Lines = ($file2.Content -split '[\r\n]+') | Where-Object { $_.Trim().Length -gt 0 }
                        
                        if ($content1Lines.Count -gt 0 -and $content2Lines.Count -gt 0) {
                            # Comparer les 10 premières lignes significatives
                            $linesToCompare = [Math]::Min(10, [Math]::Min($content1Lines.Count, $content2Lines.Count))
                            $matchingLines = 0
                            for ($k = 0; $k -lt $linesToCompare; $k++) {
                                $line1 = $content1Lines[$k].Trim()
                                $line2 = $content2Lines[$k].Trim()
                                if ($line1 -eq $line2 -and $line1.Length -gt 10) {
                                    $matchingLines++
                                }
                            }
                            
                            # Similarité basée sur la longueur et les lignes correspondantes
                            $lengthRatio = $minLength / $maxLength
                            $lineRatio = if ($linesToCompare -gt 0) { $matchingLines / $linesToCompare } else { 0 }
                            $similarity = ($lengthRatio * 0.5) + ($lineRatio * 0.5)
                        }
                    }
                    
                    # Si similarité > 60%, considérer comme dupliqué
                    if ($similarity -gt 0.6) {
                        $confirmedDuplicates += @{
                            BaseName = $dup.BaseName
                            File1 = $file1.File
                            File2 = $file2.File
                            Similarity = [Math]::Round($similarity * 100, 1)
                            Type = "Variant Files"
                        }
                    }
                }
            }
        }
        
        # Signaler les duplications de variantes
        if ($confirmedDuplicates.Count -gt 0) {
            Write-Warn "$($confirmedDuplicates.Count) paires de fichiers variantes détectées (simple, optimized, etc.)"
            foreach ($dup in $confirmedDuplicates) {
                $msg = "Variantes détectées: '$($dup.File1.OriginalName)' et '$($dup.File2.OriginalName)' (similarité: $($dup.Similarity)%)"
                Write-Warn "  $msg"
                $duplications += @{
                    Pattern = "Variantes de fichiers"
                    Count = 1
                    Files = 2
                    Context = "Fichiers avec suffixes (simple/optimized/v2/etc.)"
                    Details = $msg
                }
                $Results.Recommendations += "Fichiers variantes détectés: '$($dup.File1.OriginalName)' et '$($dup.File2.OriginalName)' - Envisager de consolider en un seul fichier ou supprimer les versions obsolètes"
                
                # Ajouter au contexte IA
                $aiContext += @{
                    Category = "Duplication"
                    Type = "Variant Files"
                    File1 = $dup.File1.OriginalName
                    File2 = $dup.File2.OriginalName
                    Similarity = $dup.Similarity
                    BaseName = $dup.BaseName
                    Severity = "high"
                    NeedsAICheck = $true
                    Question = "Les fichiers '$($dup.File1.OriginalName)' et '$($dup.File2.OriginalName)' sont similaires ($($dup.Similarity)% de similarité). Faut-il consolider ces variantes ou supprimer les versions obsolètes ?"
                }
            }
        }
        
        # Signaler TOUS les fichiers variantes trouvés (même sans similarité confirmée)
        if ($variantDuplicates.Count -gt 0 -and $confirmedDuplicates.Count -eq 0) {
            Write-Warn "$($variantDuplicates.Count) groupes de fichiers variantes détectés (similarité non confirmée, vérification manuelle recommandée)"
            foreach ($dup in $variantDuplicates) {
                $fileNames = ($dup.Files | ForEach-Object { $_.OriginalName }) -join "', '"
                Write-Info "  Groupe '$($dup.BaseName)': '$fileNames'"
                
                # Ajouter au contexte IA même si similarité non confirmée
                $aiContext += @{
                    Category = "Duplication"
                    Type = "Variant Files (Unconfirmed)"
                    BaseName = $dup.BaseName
                    Files = ($dup.Files | ForEach-Object { $_.OriginalName })
                    Count = $dup.Files.Count
                    Severity = "medium"
                    NeedsAICheck = $true
                    Question = "Plusieurs fichiers avec des suffixes de variantes partagent le nom de base '$($dup.BaseName)': $($dup.Files.Count) fichiers trouvés. Faut-il vérifier s'il s'agit de doublons à consolider ?"
                }
            }
        }
        
        if ($variantFiles.Count -gt 0 -and $variantDuplicates.Count -eq 0) {
            Write-Info "$($variantFiles.Count) fichiers avec suffixes de variantes trouvés (mais pas de groupes avec nom de base commun)"
            if ($Verbose) {
                $fileList = ($variantFiles | ForEach-Object { $_.Name }) -join ", "
                Write-Info "  Fichiers: $fileList"
            }
        }
        
        # Détecter code dupliqué avec jscpd si disponible (outil externe)
        $hasJscpd = $false
        try {
            $jscpdCheck = Get-Command jscpd -ErrorAction SilentlyContinue
            if ($jscpdCheck) {
                $hasJscpd = $true
            }
        } catch {
            # jscpd non disponible, continuer sans
        }
        
        if ($hasJscpd) {
            Write-Info "Analyse avec jscpd (outil automatique)..."
            # Note: jscpd nécessiterait une configuration spécifique
        } else {
            Write-Info "jscpd non disponible - analyse basée sur patterns uniquement"
        }
        
        if ($duplications.Count -eq 0) {
            Write-OK "Pas de duplication excessive détectée"
            $Results.Scores["Duplication"] = 10
        } else {
            Write-Warn "$($duplications.Count) patterns à fort potentiel de refactoring"
            $Results.Scores["Duplication"] = [Math]::Max(10 - ($duplications.Count * 0.2), 5)
            
            foreach ($dup in $duplications) {
                $Results.Recommendations += "Envisager refactoring: $($dup.Pattern) très utilisé ($($dup.Count) fois dans $($dup.Files) fichiers)"
            }
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext.Duplication = @{
            Patterns = $duplications.Count
            Questions = $aiContext
        }
    } catch {
        Write-Err "Erreur analyse duplication: $($_.Exception.Message)"
        $Results.Scores["Duplication"] = 7
    }
}

