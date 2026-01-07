# ===============================================================================
# MODULE: GÉNÉRATEUR DE QUESTIONS IA
# ===============================================================================
# Ce module identifie les cas ambigus que l'audit CPU ne peut pas trancher
# et génère des questions structurées pour l'IA avec contexte minimal
#
# PHILOSOPHIE:
# - L'audit CPU fait ce qu'il sait faire à 100% (patterns, comptages)
# - L'IA reçoit UNIQUEMENT les cas ambigus avec contexte suffisant
# - Objectif: Minimiser les tokens tout en maximisant la précision
# ===============================================================================

function Invoke-AIQuestionGenerator {
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
    
    Write-PhaseSection -PhaseNumber 14 -Title "Génération Questions IA"
    
    $aiQuestions = @{
        # Questions que SEULE l'IA peut résoudre (pas de pattern fiable)
        SemanticAnalysis = @()      # Analyse de sens/logique
        RefactoringAdvice = @()     # Conseils de refactoring
        ArchitectureReview = @()    # Revue d'architecture
        SecurityReview = @()        # Cas de sécurité ambigus
        
        # Métadonnées pour l'IA
        ProjectContext = @{
            Type = $ProjectInfo.Type
            Languages = $ProjectInfo.Language
            Framework = $ProjectInfo.Framework
            TotalFiles = $Files.Count
        }
    }
    
    try {
        # =========================================================================
        # 1. FONCTIONS COMPLEXES (IA doit juger si refactoring nécessaire)
        # =========================================================================
        Write-Info "Analyse fonctions complexes pour avis IA..."
        
        $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        
        foreach ($file in $jsFiles) {
            if ($file.FullName -match 'node_modules|\.next|out') { continue }
            
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            $lines = $content -split "`n"
            
            # Détecter fonctions très longues (>100 lignes) - L'IA doit juger si split nécessaire
            $functionMatches = [regex]::Matches($content, "(function\s+\w+|const\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*=>)", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            
            foreach ($match in $functionMatches) {
                $startLine = ($content.Substring(0, $match.Index) -split "`n").Count
                
                # Compter les lignes jusqu'à la fin de la fonction (approximatif)
                $braceCount = 0
                $functionLength = 0
                $started = $false
                
                for ($i = $startLine - 1; $i -lt $lines.Count -and $i -lt ($startLine + 200); $i++) {
                    $line = $lines[$i]
                    if ($line -match '\{') { $braceCount += ($line -split '\{').Count - 1; $started = $true }
                    if ($line -match '\}') { $braceCount -= ($line -split '\}').Count - 1 }
                    $functionLength++
                    if ($started -and $braceCount -le 0) { break }
                }
                
                if ($functionLength -gt 100) {
                    # Extraire le nom de la fonction
                    $funcName = if ($match.Value -match "function\s+(\w+)") { $Matches[1] }
                                elseif ($match.Value -match "const\s+(\w+)") { $Matches[1] }
                                else { "anonymous" }
                    
                    $aiQuestions.RefactoringAdvice += @{
                        Type = "LongFunction"
                        File = $file.Name
                        Function = $funcName
                        Lines = $functionLength
                        StartLine = $startLine
                        Question = "La fonction '$funcName' ($functionLength lignes) dans '$($file.Name)' devrait-elle être découpée ? Si oui, suggérer comment."
                        Context = $lines[($startLine - 1)..([Math]::Min($startLine + 10, $lines.Count - 1))] -join "`n"
                        Priority = if ($functionLength -gt 200) { "high" } else { "medium" }
                    }
                }
            }
        }
        
        # =========================================================================
        # 2. IMPORTS POTENTIELLEMENT INUTILISÉS (IA doit vérifier usage dynamique)
        # =========================================================================
        Write-Info "Analyse imports pour vérification IA..."
        
        foreach ($file in $jsFiles) {
            if ($file.FullName -match 'node_modules|\.next|out') { continue }
            
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            # Trouver les imports
            $importMatches = [regex]::Matches($content, "import\s+(?:\{([^}]+)\}|(\w+))\s+from", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            
            foreach ($import in $importMatches) {
                $importedItems = if ($import.Groups[1].Value) { 
                    $import.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() -replace '\s+as\s+\w+', '' }
                } else { 
                    @($import.Groups[2].Value) 
                }
                
                foreach ($item in $importedItems) {
                    if (-not $item -or $item -eq '') { continue }
                    
                    # Compter les usages (hors ligne d'import)
                    $usageCount = ([regex]::Matches($content, "\b$item\b")).Count - 1
                    
                    if ($usageCount -eq 0) {
                        $lineNumber = ($content.Substring(0, $import.Index) -split "`n").Count
                        
                        $aiQuestions.SemanticAnalysis += @{
                            Type = "UnusedImport"
                            File = $file.Name
                            Import = $item
                            Line = $lineNumber
                            Question = "L'import '$item' dans '$($file.Name)' semble inutilisé. Est-il utilisé dynamiquement (ex: via props, context) ou peut-il être supprimé ?"
                            Priority = "low"
                        }
                    }
                }
            }
        }
        
        # =========================================================================
        # 3. COMMENTAIRES TODO/FIXME (IA doit prioriser)
        # =========================================================================
        Write-Info "Analyse TODO/FIXME pour priorisation IA..."
        
        $allCodeFiles = $Files | Where-Object { $_.Extension -match "\.(js|jsx|php|ps1)$" }
        
        foreach ($file in $allCodeFiles) {
            if ($file.FullName -match 'node_modules|\.next|out|vendor') { continue }
            
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            $todoMatches = [regex]::Matches($content, "(TODO|FIXME|HACK|XXX)[:\s]+(.{0,100})", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            
            foreach ($match in $todoMatches) {
                $lineNumber = ($content.Substring(0, $match.Index) -split "`n").Count
                $todoType = $match.Groups[1].Value.ToUpper()
                $todoText = $match.Groups[2].Value.Trim()
                
                $aiQuestions.SemanticAnalysis += @{
                    Type = "TodoComment"
                    File = $file.Name
                    Line = $lineNumber
                    TodoType = $todoType
                    Text = $todoText
                    Question = "Le $todoType '$todoText' dans '$($file.Name):$lineNumber' est-il toujours pertinent ? Priorité suggérée ?"
                    Priority = if ($todoType -eq "FIXME") { "high" } elseif ($todoType -eq "HACK") { "medium" } else { "low" }
                }
            }
        }
        
        # =========================================================================
        # 4. PATTERNS D'ARCHITECTURE DISCUTABLES (IA doit évaluer)
        # =========================================================================
        Write-Info "Analyse patterns architecture..."
        
        # Détecter les fichiers avec beaucoup de dépendances (couplage fort)
        foreach ($file in $jsFiles) {
            if ($file.FullName -match 'node_modules|\.next|out') { continue }
            
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            $importCount = ([regex]::Matches($content, "^import\s+", [System.Text.RegularExpressions.RegexOptions]::Multiline)).Count
            
            if ($importCount -gt 15) {
                $aiQuestions.ArchitectureReview += @{
                    Type = "HighCoupling"
                    File = $file.Name
                    ImportCount = $importCount
                    Question = "Le fichier '$($file.Name)' a $importCount imports. Est-ce un signe de couplage excessif ? Suggérer une meilleure organisation."
                    Priority = if ($importCount -gt 25) { "high" } else { "medium" }
                }
            }
        }
        
        # =========================================================================
        # 5. GÉNÉRATION DU RAPPORT
        # =========================================================================
        
        $totalQuestions = $aiQuestions.SemanticAnalysis.Count + 
                          $aiQuestions.RefactoringAdvice.Count + 
                          $aiQuestions.ArchitectureReview.Count +
                          $aiQuestions.SecurityReview.Count
        
        if ($totalQuestions -gt 0) {
            Write-Info "$totalQuestions question(s) générée(s) pour l'IA"
            
            # Trier par priorité
            $highPriority = ($aiQuestions.SemanticAnalysis + $aiQuestions.RefactoringAdvice + $aiQuestions.ArchitectureReview + $aiQuestions.SecurityReview) | 
                Where-Object { $_.Priority -eq "high" }
            $mediumPriority = ($aiQuestions.SemanticAnalysis + $aiQuestions.RefactoringAdvice + $aiQuestions.ArchitectureReview + $aiQuestions.SecurityReview) | 
                Where-Object { $_.Priority -eq "medium" }
            
            if ($highPriority.Count -gt 0) {
                Write-Warn "$($highPriority.Count) question(s) priorité HAUTE"
            }
            if ($mediumPriority.Count -gt 0) {
                Write-Info "$($mediumPriority.Count) question(s) priorité moyenne"
            }
        } else {
            Write-OK "Aucune question ambiguë détectée"
        }
        
        # Sauvegarder dans Results
        if (-not $Results.AIQuestions) {
            $Results.AIQuestions = @{}
        }
        $Results.AIQuestions = $aiQuestions
        
    } catch {
        Write-Err "Erreur génération questions IA: $($_.Exception.Message)"
    }
}
