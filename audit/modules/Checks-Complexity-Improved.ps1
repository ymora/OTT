# ===============================================================================
# VÉRIFICATION : COMPLEXITÉ (VERSION AMÉLIORÉE)
# ===============================================================================
# Détecte la complexité de manière générique avec contexte pour l'IA

function Invoke-Check-Complexity-Improved {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    if (-not $Config.Checks.Complexity.Enabled) {
        return
    }
    
    Write-Section "[9/21] Complexité - Fichiers/Fonctions Volumineux (Amélioré)"
    
    try {
        $maxFileLines = $Config.Checks.Complexity.MaxFileLines
        $maxFunctionLines = $Config.Checks.Complexity.MaxFunctionLines
        $largeFiles = @()
        $aiContext = @()  # Contexte pour l'IA
        
        foreach ($file in $Files) {
            try {
                $lines = @(Get-Content $file.FullName -ErrorAction SilentlyContinue).Count
                if ($lines -gt $maxFileLines) {
                    $relativePath = $file.FullName.Replace((Get-Location).Path + '\', '').Replace((Get-Location).Path + '/', '')
                    $largeFiles += @{Path=$relativePath; Lines=$lines; File=$file}
                    
                    # Analyser le type de fichier pour déterminer si la complexité est justifiée
                    $isJustified = $false
                    $justification = ""
                    
                    # Fichiers de configuration/schéma (complexité acceptable)
                    if ($relativePath -match "schema|migration|config|setup|init") {
                        $isJustified = $true
                        $justification = "Fichier de configuration/schéma"
                    }
                    
                    # Fichiers de compilation/build (complexité acceptable)
                    if ($relativePath -match "compile|build|webpack|rollup") {
                        $isJustified = $true
                        $justification = "Fichier de build/compilation"
                    }
                    
                    # Composants complexes avec beaucoup de logique métier (peut être acceptable)
                    if ($relativePath -match "context|provider|manager|handler") {
                        $isJustified = $true
                        $justification = "Fichier de contexte/gestion (logique métier complexe)"
                    }
                    
                    if (-not $isJustified) {
                        $aiContext += @{
                            Category = "Complexity"
                            Type = "Large File"
                            File = $relativePath
                            Path = $file.FullName
                            Lines = $lines
                            MaxRecommended = $maxFileLines
                            Severity = "medium"
                            NeedsAICheck = $true
                            Question = "Le fichier '$relativePath' fait $lines lignes (max recommandé: $maxFileLines). Peut-il être refactorisé en plusieurs fichiers plus petits ou la complexité est-elle justifiée par la logique métier ?"
                        }
                    }
                    
                    Write-Warn "$relativePath : $lines lignes (> $maxFileLines)" + $(if($isJustified){" - $justification"})
                    
                    $Results.Issues += @{
                        Type = "complexity"
                        Severity = if($isJustified){"low"}else{"medium"}
                        Description = "Fichier volumineux: $lines lignes (max recommandé: $maxFileLines)" + $(if($isJustified){" - $justification"})
                        File = $file.FullName
                        Line = 0
                        Metrics = @{Lines = $lines; Complexity = 0; Justified = $isJustified}
                    }
                }
            } catch {}
        }
        
        # Sauvegarder le contexte pour l'IA
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext.Complexity = @{
            LargeFiles = $largeFiles.Count
            Questions = $aiContext
        }
        
        $complexityScore = if($largeFiles.Count -lt 10) { 10 } 
                          elseif($largeFiles.Count -lt 20) { 9 } 
                          elseif($largeFiles.Count -lt 30) { 8 } 
                          else { 7 }
        
        if ($largeFiles.Count -eq 0) {
            Write-OK "Complexité code parfaite"
        } elseif ($largeFiles.Count -lt 20) {
            Write-OK "$($largeFiles.Count) fichiers volumineux (acceptable)"
        } else {
            Write-Warn "$($largeFiles.Count) fichiers volumineux (> $maxFileLines lignes)"
        }
        
        $Results.Scores["Complexity"] = $complexityScore
    } catch {
        Write-Err "Erreur analyse complexité: $($_.Exception.Message)"
        $Results.Scores["Complexity"] = 7
    }
}

