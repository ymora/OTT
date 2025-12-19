# ===============================================================================
# DÉFINITION DES PHASES D'AUDIT
# ===============================================================================

# Structure des phases avec leur numéro, nom, description et dépendances
# Organisation logique : phases prioritaires en premier, numérotation par catégorie
# 
# Ordre d'exécution recommandé :
# 1. Structure (base du projet)
# 2. Sécurité (critique)
# 3. Backend (API et BDD)
# 4. Qualité (code mort, duplication, etc.)
# 5. Frontend (UI/UX)
# 6. Performance
# 7. Documentation
# 8. Déploiement
# 9. Hardware

$script:AuditPhases = @(
    # ============================================================================
    # STRUCTURE (1-3) - BASE DU PROJET - À FAIRE EN PREMIER
    # ============================================================================
    @{ Number = 1; Name = "Inventaire Exhaustif"; Description = "Tous les fichiers et répertoires"; Dependencies = @(); Category = "Structure"; CategoryNumber = 1 }
    @{ Number = 2; Name = "Architecture et Statistiques"; Description = "Structure du projet, statistiques"; Dependencies = @(1); Category = "Structure"; CategoryNumber = 2 }
    @{ Number = 3; Name = "Organisation"; Description = "Structure fichiers, doublons"; Dependencies = @(1); Category = "Structure"; CategoryNumber = 3 }
    
    # ============================================================================
    # SÉCURITÉ (4) - CRITIQUE - À FAIRE EN PRIORITÉ
    # ============================================================================
    @{ Number = 4; Name = "Sécurité"; Description = "SQL injection, XSS, secrets, modals unifiés"; Dependencies = @(1); Category = "Sécurité"; CategoryNumber = 1 }
    
    # ============================================================================
    # BACKEND (5-7) - API ET BASE DE DONNÉES - PRIORITAIRE
    # ============================================================================
    @{ Number = 5; Name = "Endpoints API"; Description = "Tests fonctionnels des endpoints API"; Dependencies = @(); Category = "Backend"; CategoryNumber = 1 }
    @{ Number = 6; Name = "Base de Données"; Description = "Cohérence BDD, données, intégrité"; Dependencies = @(5); Category = "Backend"; CategoryNumber = 2 }
    @{ Number = 7; Name = "Structure API"; Description = "Cohérence handlers, routes API"; Dependencies = @(1); Category = "Backend"; CategoryNumber = 3 }
    
    # ============================================================================
    # QUALITÉ (8-14) - CODE MORT, DUPLICATION, ETC.
    # ============================================================================
    @{ Number = 8; Name = "Code Mort"; Description = "Fichiers, composants, fonctions non utilisés"; Dependencies = @(1, 2); Category = "Qualité"; CategoryNumber = 1 }
    @{ Number = 9; Name = "Duplication de Code"; Description = "Code dupliqué, fonctions redondantes"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 2 }
    @{ Number = 10; Name = "Complexité"; Description = "Complexité cyclomatique, fichiers volumineux"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 3 }
    @{ Number = 11; Name = "Tests"; Description = "Tests unitaires, intégration, couverture"; Dependencies = @(); Category = "Qualité"; CategoryNumber = 4 }
    @{ Number = 12; Name = "Gestion d'Erreurs"; Description = "Error boundaries, gestion erreurs API"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 5 }
    @{ Number = 13; Name = "Optimisations Avancées"; Description = "Vérifications détaillées"; Dependencies = @(1, 8, 9, 10); Category = "Qualité"; CategoryNumber = 6 }
    @{ Number = 14; Name = "Liens et Imports"; Description = "Liens cassés, imports manquants"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 7 }
    
    # ============================================================================
    # FRONTEND (15-17) - UI/UX
    # ============================================================================
    @{ Number = 15; Name = "Routes et Navigation"; Description = "Routes Next.js, cohérence navigation"; Dependencies = @(1); Category = "Frontend"; CategoryNumber = 1 }
    @{ Number = 16; Name = "Accessibilité (a11y)"; Description = "WCAG 2.1 AA, aria-labels, navigation clavier"; Dependencies = @(1); Category = "Frontend"; CategoryNumber = 2 }
    @{ Number = 17; Name = "Uniformisation UI/UX"; Description = "Composants unifiés, modals"; Dependencies = @(1); Category = "Frontend"; CategoryNumber = 3 }
    
    # ============================================================================
    # PERFORMANCE (18)
    # ============================================================================
    @{ Number = 18; Name = "Performance"; Description = "Optimisations React, mémoire, re-renders"; Dependencies = @(1); Category = "Performance"; CategoryNumber = 1 }
    
    # ============================================================================
    # DOCUMENTATION (19)
    # ============================================================================
    @{ Number = 19; Name = "Documentation"; Description = "README, commentaires, documentation"; Dependencies = @(1); Category = "Documentation"; CategoryNumber = 1 }
    
    # ============================================================================
    # DÉPLOIEMENT (20)
    # ============================================================================
    @{ Number = 20; Name = "Synchronisation GitHub Pages"; Description = "Vérification déploiement"; Dependencies = @(1); Category = "Déploiement"; CategoryNumber = 1 }
    
    # ============================================================================
    # HARDWARE (21)
    # ============================================================================
    @{ Number = 21; Name = "Firmware"; Description = "Fichiers firmware, versions, compilation, cohérence"; Dependencies = @(1); Category = "Hardware"; CategoryNumber = 1 }
    
    # ============================================================================
    # TESTS COMPLETS (22) - APPLICATION OTT
    # ============================================================================
    @{ Number = 22; Name = "Tests Complets Application"; Description = "Tests exhaustifs, corrections critiques, API, navigation"; Dependencies = @(5, 7); Category = "Tests"; CategoryNumber = 1 }
)

# Fonction pour obtenir toutes les dépendances récursives d'une phase
function Get-PhaseDependencies {
    param(
        [int]$PhaseNumber,
        [array]$Visited = @()
    )
    
    if ($Visited -contains $PhaseNumber) {
        return @()  # Éviter les cycles
    }
    
    $phase = $script:AuditPhases | Where-Object { $_.Number -eq $PhaseNumber } | Select-Object -First 1
    if (-not $phase) {
        return @()
    }
    
    $allDeps = @()
    $newVisited = $Visited + @($PhaseNumber)
    
    foreach ($dep in $phase.Dependencies) {
        $allDeps += $dep
        # Récursivement obtenir les dépendances des dépendances
        $subDeps = Get-PhaseDependencies -PhaseNumber $dep -Visited $newVisited
        foreach ($subDep in $subDeps) {
            if ($allDeps -notcontains $subDep) {
                $allDeps += $subDep
            }
        }
    }
    
    return ($allDeps | Sort-Object -Unique)
}

# Fonction pour afficher le menu de sélection des phases
function Show-PhaseMenu {
    param(
        [array]$CompletedPhases = @(),
        [string]$StateFile = $null
    )
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  MENU DE SÉLECTION DES PHASES D'AUDIT" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  ℹ️  Les dépendances seront exécutées automatiquement si nécessaire" -ForegroundColor Gray
    Write-Host "  📋 Ordre recommandé: Structure → Sécurité → Backend → Qualité → Frontend → Performance → Documentation → Déploiement → Hardware" -ForegroundColor Gray
    Write-Host ""
    
    # Grouper par catégorie pour affichage (ordre logique)
    $categoryOrder = @(
        "Structure",
        "Sécurité",
        "Backend",
        "Qualité",
        "Frontend",
        "Performance",
        "Documentation",
        "Déploiement",
        "Hardware"
    )
    
    # Afficher les phases par catégorie dans l'ordre logique
    foreach ($category in $categoryOrder) {
        $phases = $script:AuditPhases | Where-Object { $_.Category -eq $category } | Sort-Object { $_.CategoryNumber }
        if ($phases.Count -eq 0) { continue }
        
        Write-Host "  📁 $category" -ForegroundColor Yellow
        foreach ($phase in $phases) {
            $status = if ($CompletedPhases -contains $phase.Number) { "[✓]" } else { "[ ]" }
            $color = if ($CompletedPhases -contains $phase.Number) { "Green" } else { "White" }
            Write-Host "    $status Phase $($phase.Number.ToString().PadLeft(2)) ($($phase.CategoryNumber)): $($phase.Name)" -ForegroundColor $color
            Write-Host "        └─ $($phase.Description)" -ForegroundColor Gray
            
            # Afficher les dépendances si elles existent
            if ($phase.Dependencies.Count -gt 0) {
                $depNames = $phase.Dependencies | ForEach-Object {
                    $depPhase = $script:AuditPhases | Where-Object { $_.Number -eq $_ } | Select-Object -First 1
                    if ($depPhase) {
                        "Phase $_ ($($depPhase.Name))"
                    } else {
                        "Phase $_"
                    }
                }
                Write-Host "        ⚙️  Dépendances: $($depNames -join ', ')" -ForegroundColor DarkGray
            }
        }
        Write-Host ""
    }
    
    Write-Host "  Options:" -ForegroundColor Yellow
    Write-Host "    [A]  Relancer TOUTES les phases" -ForegroundColor White
    Write-Host "    [R]  Reprendre depuis la dernière phase incomplète" -ForegroundColor White
    Write-Host "    [1-22] Sélectionner une ou plusieurs phases (ex: 5 ou 0-3)" -ForegroundColor White
    Write-Host "           → Les dépendances seront ajoutées automatiquement" -ForegroundColor DarkGray
    Write-Host "    [Q]  Quitter" -ForegroundColor White
    Write-Host ""
    
    if ($StateFile -and (Test-Path $StateFile)) {
        Write-Host "  💾 État sauvegardé trouvé: $StateFile" -ForegroundColor Gray
    }
    
    Write-Host ""
    $choice = Read-Host "  Votre choix"
    
    return $choice
}

# Fonction pour parser la sélection de phases avec gestion automatique des dépendances
function Parse-PhaseSelection {
    param(
        [string]$Selection,
        [array]$CompletedPhases = @()
    )
    
    $userSelectedPhases = @()  # Phases explicitement sélectionnées par l'utilisateur
    
    if ($Selection -eq "A" -or $Selection -eq "a") {
        # Toutes les phases
        $userSelectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
    } elseif ($Selection -eq "R" -or $Selection -eq "r") {
        # Reprendre depuis la dernière phase incomplète
        $allPhaseNumbers = $script:AuditPhases | ForEach-Object { $_.Number }
        $userSelectedPhases = $allPhaseNumbers | Where-Object { $CompletedPhases -notcontains $_ }
        if ($userSelectedPhases.Count -eq 0) {
            Write-Host "  ✅ Toutes les phases sont complètes !" -ForegroundColor Green
            return @()
        }
    } else {
        # Parser la sélection (ex: "0,2,5-8,10")
        $parts = $Selection -split ','
        foreach ($part in $parts) {
            $part = $part.Trim()
            if ($part -match '^(\d+)-(\d+)$') {
                # Plage (ex: 5-8)
                $start = [int]$matches[1]
                $end = [int]$matches[2]
                for ($i = $start; $i -le $end; $i++) {
                    if ($script:AuditPhases | Where-Object { $_.Number -eq $i }) {
                        $userSelectedPhases += $i
                    }
                }
            } elseif ($part -match '^\d+$') {
                # Phase unique
                $phaseNum = [int]$part
                if ($script:AuditPhases | Where-Object { $_.Number -eq $phaseNum }) {
                    $userSelectedPhases += $phaseNum
                }
            }
        }
    }
    
    # Trier et dédupliquer les phases sélectionnées par l'utilisateur
    $userSelectedPhases = $userSelectedPhases | Sort-Object -Unique
    
    # Calculer toutes les dépendances nécessaires (récursif)
    $allDependencies = @()
    $phasesToRun = @()
    
    foreach ($phaseNum in $userSelectedPhases) {
        # Obtenir toutes les dépendances récursives
        $deps = Get-PhaseDependencies -PhaseNumber $phaseNum
        foreach ($dep in $deps) {
            # Ajouter seulement si pas déjà complète ET pas déjà dans la liste
            if ($CompletedPhases -notcontains $dep -and $allDependencies -notcontains $dep -and $userSelectedPhases -notcontains $dep) {
                $allDependencies += $dep
            }
        }
        $phasesToRun += $phaseNum
    }
    
    # Ajouter les dépendances à la liste des phases à exécuter
    foreach ($dep in $allDependencies) {
        if ($phasesToRun -notcontains $dep) {
            $phasesToRun += $dep
        }
    }
    
    # Trier final
    $phasesToRun = $phasesToRun | Sort-Object -Unique
    
    # Afficher un message informatif si des dépendances ont été ajoutées
    if ($allDependencies.Count -gt 0) {
        $depNames = $allDependencies | ForEach-Object {
            $depPhase = $script:AuditPhases | Where-Object { $_.Number -eq $_ } | Select-Object -First 1
            if ($depPhase) {
                "Phase $_ ($($depPhase.Name))"
            } else {
                "Phase $_"
            }
        }
        Write-Host ""
        Write-Host "  ℹ️  Dépendances automatiques ajoutées: $($depNames -join ', ')" -ForegroundColor Cyan
        Write-Host "      (nécessaires pour les phases sélectionnées)" -ForegroundColor DarkGray
    }
    
    return ($phasesToRun | Sort-Object -Unique)
}

# Fonction pour sauvegarder l'état de progression
function Save-AuditState {
    param(
        [string]$StateFile,
        [array]$CompletedPhases,
        [hashtable]$PartialResults = @{}
    )
    
    $state = @{
        CompletedPhases = $CompletedPhases
        PartialResults = $PartialResults
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    
    $state | ConvertTo-Json -Depth 10 | Out-File -FilePath $StateFile -Encoding UTF8 -Force
}

# Fonction pour charger l'état de progression
function Load-AuditState {
    param([string]$StateFile)
    
    if (-not (Test-Path $StateFile)) {
        return @{
            CompletedPhases = @()
            PartialResults = @{}
        }
    }
    
    try {
        $content = Get-Content $StateFile -Raw -Encoding UTF8
        $state = $content | ConvertFrom-Json
        return @{
            CompletedPhases = if ($state.CompletedPhases) { [array]$state.CompletedPhases } else { @() }
            PartialResults = if ($state.PartialResults) { $state.PartialResults } else { @{} }
        }
    } catch {
        Write-Warning "Erreur lors du chargement de l'état: $($_.Exception.Message)"
        return @{
            CompletedPhases = @()
            PartialResults = @{}
        }
    }
}

# Fonction pour générer un plan de correction structuré
function New-CorrectionPlan {
    param(
        [string]$IssueType,
        [string]$Severity,
        [string]$Description,
        [string]$File = "",
        [int]$Line = 0,
        [string]$CurrentCode = "",
        [string]$RecommendedFix = "",
        [array]$VerificationSteps = @(),
        [array]$Dependencies = @()
    )
    
    return @{
        IssueType = $IssueType
        Severity = $Severity  # "critical", "high", "medium", "low", "info"
        Description = $Description
        File = $File
        Line = $Line
        CurrentCode = $CurrentCode
        RecommendedFix = $RecommendedFix
        VerificationSteps = $VerificationSteps
        Dependencies = $Dependencies
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
}

# Fonction pour formater un plan de correction en texte lisible
function Format-CorrectionPlan {
    param([hashtable]$Plan)
    
    $output = @"
═══════════════════════════════════════════════════════════════════════════════
PROBLÈME: $($Plan.IssueType)
Sévérité: $($Plan.Severity.ToUpper())
═══════════════════════════════════════════════════════════════════════════════

Description:
  $($Plan.Description)

Localisation:
  Fichier: $($Plan.File)
  Ligne: $($Plan.Line)

Code actuel:
$($Plan.CurrentCode)

Recommandation:
$($Plan.RecommendedFix)

Étapes de vérification:
$($Plan.VerificationSteps | ForEach-Object { "  $($_.ToString())" } | Out-String)

Dépendances:
$($Plan.Dependencies | ForEach-Object { "  - $_" } | Out-String)

═══════════════════════════════════════════════════════════════════════════════
"@
    
    return $output
}

# Fonction pour exporter les plans de correction en JSON
function Export-CorrectionPlans {
    param(
        [array]$Plans,
        [string]$OutputFile
    )
    
    $export = @{
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        TotalIssues = $Plans.Count
        Critical = ($Plans | Where-Object { $_.Severity -eq "critical" }).Count
        High = ($Plans | Where-Object { $_.Severity -eq "high" }).Count
        Medium = ($Plans | Where-Object { $_.Severity -eq "medium" }).Count
        Low = ($Plans | Where-Object { $_.Severity -eq "low" }).Count
        Plans = $Plans
    }
    
    $export | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputFile -Encoding UTF8 -Force
}
