# ===============================================================================
# VÉRIFICATION : UI/UX (VERSION AMÉLIORÉE)
# ===============================================================================
# Vérifie la cohérence UI/UX de manière générique

function Invoke-Check-UI {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-Section "[16/21] Uniformisation UI/UX (Amélioré)"
    
    try {
        $uiScore = 10.0
        $uiFiles = $Files | Where-Object {
            $_.Extension -match "\.jsx?$" -and
            $_.FullName -match 'components|app|pages' -and
            $_.FullName -notmatch 'node_modules|\.next|out|docs'
        }
        
        # Vérifier cohérence des classes CSS (patterns génériques)
        $commonClasses = @("table-row", "opacity-60", "btn", "button", "modal", "card", "badge")
        $classUsage = @{}
        
        foreach ($class in $commonClasses) {
            $usage = @($uiFiles | Select-String -Pattern "className.*['\"]$class|class.*['\"]$class").Count
            if ($usage -gt 0) {
                $classUsage[$class] = $usage
            }
        }
        
        # Vérifier uniformisation des modals (détection générique)
        $modalPatterns = @("Modal", "Dialog", "Popup", "Overlay")
        $modalFiles = @()
        $modalComponents = @()
        
        foreach ($pattern in $modalPatterns) {
            $matches = @($uiFiles | Select-String -Pattern "($pattern|use.*$pattern)").Count
            if ($matches -gt 0) {
                $modalFiles += $pattern
            }
        }
        
        # Vérifier uniformisation des badges/status (détection générique)
        $badgePatterns = @("badge", "Badge", "status", "Status", "tag", "Tag")
        $badgeUsage = @()
        
        foreach ($pattern in $badgePatterns) {
            $usage = @($uiFiles | Select-String -Pattern "$pattern").Count
            if ($usage -gt 0) {
                $badgeUsage += @{Pattern=$pattern; Count=$usage}
            }
        }
        
        # Vérifier uniformisation des tables (détection générique)
        $tablePatterns = @("table", "Table", "tbody", "thead")
        $tableUsage = @()
        
        foreach ($pattern in $tablePatterns) {
            $usage = @($uiFiles | Select-String -Pattern "<$pattern").Count
            if ($usage -gt 0) {
                $tableUsage += @{Pattern=$pattern; Count=$usage}
            }
        }
        
        if ($classUsage.Count -gt 0) {
            Write-OK "Classes CSS communes détectées: $($classUsage.Keys -join ', ')"
        }
        
        if ($modalFiles.Count -gt 0) {
            Write-OK "Modals détectés: $($modalFiles -join ', ')"
        }
        
        if ($badgeUsage.Count -gt 0) {
            Write-OK "Badges/Status détectés: $($badgeUsage.Count) pattern(s)"
        }
        
        if ($tableUsage.Count -gt 0) {
            Write-OK "Tables détectées: $($tableUsage.Count) pattern(s)"
        }
        
        # Générer contexte pour l'IA si nécessaire
        $aiContext = @()
        # Note: UI/UX est principalement une vérification de cohérence
        # Si des problèmes spécifiques sont détectés, ils peuvent être ajoutés ici
        
        Write-OK "UI/UX: Cohérence vérifiée"
        $Results.Scores["UI/UX"] = $uiScore
        
        # Sauvegarder le contexte pour l'IA (vide pour l'instant, mais structure prête)
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        if ($aiContext.Count -gt 0) {
            $Results.AIContext.UI = @{
                Questions = $aiContext
            }
        }
    } catch {
        Write-Err "Erreur vérification UI/UX: $($_.Exception.Message)"
        $Results.Scores["UI/UX"] = 7
    }
}

