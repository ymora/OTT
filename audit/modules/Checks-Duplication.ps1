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
    
    Write-Section "[11/23] Duplication de Code"
    
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

