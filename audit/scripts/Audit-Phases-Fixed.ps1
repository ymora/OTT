# ===============================================================================
# DÉFINITION DES PHASES D'AUDIT - VERSION CORRIGÉE
# ===============================================================================

# Structure des phases avec leur numéro, nom, description et dépendances
$script:AuditPhases = @(
    # STRUCTURE (1-3) - BASE DU PROJET
    @{ Number = 1; Name = "Inventaire Exhaustif"; Description = "Tous les fichiers et répertoires"; Dependencies = @(); Category = "Structure"; CategoryNumber = 1 }
    @{ Number = 2; Name = "Architecture et Statistiques"; Description = "Structure du projet, statistiques"; Dependencies = @(1); Category = "Structure"; CategoryNumber = 2 }
    @{ Number = 3; Name = "Organisation"; Description = "Structure fichiers, doublons"; Dependencies = @(1); Category = "Structure"; CategoryNumber = 3 }
    
    # CONFIGURATION (4)
    @{ Number = 4; Name = "Cohérence Configuration"; Description = "Vérification Docker/Render/GitHub cohérence"; Dependencies = @(1); Category = "Configuration"; CategoryNumber = 1 }
    
    # LIENS ET IMPORTS (5)
    @{ Number = 5; Name = "Liens et Imports"; Description = "Liens cassés, imports manquants"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 7 }
    
    # SÉCURITÉ (6) - CRITIQUE
    @{ Number = 6; Name = "Sécurité"; Description = "SQL injection, XSS, secrets, modals unifiés"; Dependencies = @(1); Category = "Sécurité"; CategoryNumber = 1 }
    
    # BACKEND (7-9)
    @{ Number = 7; Name = "Structure API"; Description = "Cohérence handlers, routes API"; Dependencies = @(1); Category = "Backend"; CategoryNumber = 3 }
    @{ Number = 8; Name = "Endpoints API"; Description = "Tests fonctionnels des endpoints API"; Dependencies = @(7); Category = "Backend"; CategoryNumber = 1 }
    @{ Number = 9; Name = "Base de Données"; Description = "Cohérence BDD, données, intégrité"; Dependencies = @(8); Category = "Backend"; CategoryNumber = 2 }
    
    # QUALITÉ (10-15)
    @{ Number = 10; Name = "Code Mort"; Description = "Fichiers, composants, fonctions non utilisés"; Dependencies = @(1, 2); Category = "Qualité"; CategoryNumber = 1 }
    @{ Number = 11; Name = "Duplication de Code"; Description = "Code dupliqué, fonctions redondantes"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 2 }
    @{ Number = 12; Name = "Complexité"; Description = "Complexité cyclomatique, fichiers volumineux"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 3 }
    @{ Number = 13; Name = "Optimisations Avancées"; Description = "Vérifications détaillées"; Dependencies = @(1, 10, 11, 12); Category = "Qualité"; CategoryNumber = 6 }
    @{ Number = 14; Name = "Tests"; Description = "Tests unitaires, intégration, couverture"; Dependencies = @(); Category = "Qualité"; CategoryNumber = 4 }
    @{ Number = 15; Name = "Gestion d'Erreurs"; Description = "Error boundaries, gestion erreurs API"; Dependencies = @(1); Category = "Qualité"; CategoryNumber = 5 }
    
    # FRONTEND (16-18)
    @{ Number = 16; Name = "Routes et Navigation"; Description = "Routes Next.js, cohérence navigation"; Dependencies = @(1); Category = "Frontend"; CategoryNumber = 1 }
    @{ Number = 17; Name = "Accessibilité (a11y)"; Description = "WCAG 2.1 AA, aria-labels, navigation clavier"; Dependencies = @(1); Category = "Frontend"; CategoryNumber = 2 }
    @{ Number = 18; Name = "Uniformisation UI/UX"; Description = "Composants unifiés, modals"; Dependencies = @(1); Category = "Frontend"; CategoryNumber = 3 }
    
    # PERFORMANCE (19)
    @{ Number = 19; Name = "Performance"; Description = "Optimisations React, mémoire, re-renders"; Dependencies = @(1); Category = "Performance"; CategoryNumber = 1 }
    
    # DOCUMENTATION (20)
    @{ Number = 20; Name = "Documentation"; Description = "README, commentaires, documentation"; Dependencies = @(1); Category = "Documentation"; CategoryNumber = 1 }
    
    # DÉPLOIEMENT (21)
    @{ Number = 21; Name = "Synchronisation GitHub Pages"; Description = "Vérification déploiement"; Dependencies = @(1); Category = "Déploiement"; CategoryNumber = 1 }
    
    # HARDWARE (22)
    @{ Number = 22; Name = "Firmware"; Description = "Fichiers firmware, versions, compilation, cohérence"; Dependencies = @(1); Category = "Hardware"; CategoryNumber = 1 }
    
    # TESTS COMPLETS (23-24)
    @{ Number = 23; Name = "Tests Complets Application"; Description = "Tests exhaustifs, corrections critiques, API, navigation"; Dependencies = @(7, 8); Category = "Tests"; CategoryNumber = 1 }
    @{ Number = 24; Name = "Tests Fonctionnels Complets"; Description = "Workflows complets, CRUD, compilation firmware, intégrations"; Dependencies = @(7, 8, 23); Category = "Tests"; CategoryNumber = 2 }
)

# Fonction pour obtenir les dépendances récursives
function Get-PhaseDependencies {
    param(
        [int]$PhaseNumber,
        [array]$Visited = @()
    )
    
    if ($Visited -contains $PhaseNumber) {
        return @()
    }
    
    $phase = $script:AuditPhases | Where-Object { $_.Number -eq $PhaseNumber } | Select-Object -First 1
    if (-not $phase) {
        return @()
    }
    
    $allDeps = @()
    $newVisited = $Visited + @($PhaseNumber)
    
    foreach ($dep in $phase.Dependencies) {
        $allDeps += $dep
        $subDeps = Get-PhaseDependencies -PhaseNumber $dep -Visited $newVisited
        foreach ($subDep in $subDeps) {
            if ($allDeps -notcontains $subDep) {
                $allDeps += $subDep
            }
        }
    }
    
    return ($allDeps | Sort-Object -Unique)
}

# Fonction pour afficher le menu
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
    
    $categoryOrder = @("Structure", "Configuration", "Qualité", "Sécurité", "Backend", "Frontend", "Performance", "Documentation", "Déploiement", "Hardware", "Tests")
    
    foreach ($category in $categoryOrder) {
        $phases = $script:AuditPhases | Where-Object { $_.Category -eq $category } | Sort-Object { $_.CategoryNumber }
        if ($phases.Count -eq 0) { continue }
        
        Write-Host "  📁 $category" -ForegroundColor Yellow
        foreach ($phase in $phases) {
            $status = if ($CompletedPhases -contains $phase.Number) { "[✓]" } else { "[ ]" }
            $color = if ($CompletedPhases -contains $phase.Number) { "Green" } else { "White" }
            Write-Host "    $status Phase $($phase.Number.ToString().PadLeft(2)): $($phase.Name)" -ForegroundColor $color
        }
        Write-Host ""
    }
    
    Write-Host "  Options:" -ForegroundColor Yellow
    Write-Host "    [A]  Toutes les phases" -ForegroundColor White
    Write-Host "    [1-24] Sélectionner des phases" -ForegroundColor White
    Write-Host "    [Q]  Quitter" -ForegroundColor White
    Write-Host ""
    
    $choice = Read-Host "  Votre choix"
    return $choice
}

# Fonction pour parser la sélection
function Parse-PhaseSelection {
    param(
        [string]$Selection,
        [array]$CompletedPhases = @()
    )
    
    $userSelectedPhases = @()
    
    if ($Selection -eq "A" -or $Selection -eq "a") {
        $userSelectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
    } elseif ($Selection -eq "Q" -or $Selection -eq "q") {
        return @()
    } else {
        $parts = $Selection -split ','
        foreach ($part in $parts) {
            $part = $part.Trim()
            if ($part -match '^(\d+)-(\d+)$') {
                $start = [int]$matches[1]
                $end = [int]$matches[2]
                for ($i = $start; $i -le $end; $i++) {
                    if ($script:AuditPhases | Where-Object { $_.Number -eq $i }) {
                        $userSelectedPhases += $i
                    }
                }
            } elseif ($part -match '^\d+$') {
                $phaseNum = [int]$part
                if ($script:AuditPhases | Where-Object { $_.Number -eq $phaseNum }) {
                    $userSelectedPhases += $phaseNum
                }
            }
        }
    }
    
    # Ajouter les dépendances
    $allPhases = @()
    foreach ($phaseNum in $userSelectedPhases) {
        $deps = Get-PhaseDependencies -PhaseNumber $phaseNum
        foreach ($dep in $deps) {
            if ($allPhases -notcontains $dep -and $CompletedPhases -notcontains $dep) {
                $allPhases += $dep
            }
        }
        if ($allPhases -notcontains $phaseNum) {
            $allPhases += $phaseNum
        }
    }
    
    return ($allPhases | Sort-Object -Unique)
}

# Fonction pour sauvegarder l'état
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

# Fonction pour charger l'état
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
        return @{
            CompletedPhases = @()
            PartialResults = @{}
        }
    }
}

Write-Host "Audit-Phases-Fixed.ps1 chargé avec succès" -ForegroundColor Green
