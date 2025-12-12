# ===============================================================================
# DÉFINITION DES PHASES D'AUDIT
# ===============================================================================

# Structure des phases avec leur numéro, nom, description et dépendances
$script:AuditPhases = @(
    @{ Number = 0; Name = "Inventaire Exhaustif"; Description = "Tous les fichiers et répertoires"; Dependencies = @() }
    @{ Number = 1; Name = "Architecture et Statistiques"; Description = "Structure du projet, statistiques"; Dependencies = @(0) }
    @{ Number = 2; Name = "Code Mort"; Description = "Fichiers, composants, fonctions non utilisés"; Dependencies = @(0, 1) }
    @{ Number = 3; Name = "Duplication de Code"; Description = "Code dupliqué, fonctions redondantes"; Dependencies = @(0) }
    @{ Number = 4; Name = "Complexité"; Description = "Complexité cyclomatique, fichiers volumineux"; Dependencies = @(0) }
    @{ Number = 5; Name = "Routes et Navigation"; Description = "Routes Next.js, cohérence navigation"; Dependencies = @(0) }
    @{ Number = 6; Name = "Endpoints API"; Description = "Tests fonctionnels des endpoints API"; Dependencies = @() }
    @{ Number = 7; Name = "Base de Données"; Description = "Cohérence BDD, données, intégrité"; Dependencies = @(6) }
    @{ Number = 8; Name = "Sécurité"; Description = "SQL injection, XSS, secrets, modals unifiés"; Dependencies = @(0) }
    @{ Number = 9; Name = "Performance"; Description = "Optimisations React, mémoire, re-renders"; Dependencies = @(0) }
    @{ Number = 10; Name = "Tests"; Description = "Tests unitaires, intégration, couverture"; Dependencies = @() }
    @{ Number = 11; Name = "Accessibilité (a11y)"; Description = "WCAG 2.1 AA, aria-labels, navigation clavier"; Dependencies = @(0) }
    @{ Number = 12; Name = "Gestion d'Erreurs"; Description = "Error boundaries, gestion erreurs API"; Dependencies = @(0) }
    @{ Number = 13; Name = "Documentation"; Description = "README, commentaires, documentation"; Dependencies = @(0) }
    @{ Number = 14; Name = "Optimisations Avancées"; Description = "Vérifications détaillées"; Dependencies = @(0, 2, 3, 4) }
    @{ Number = 15; Name = "Liens et Imports"; Description = "Liens cassés, imports manquants"; Dependencies = @(0) }
    @{ Number = 16; Name = "Uniformisation UI/UX"; Description = "Composants unifiés, modals"; Dependencies = @(0) }
    @{ Number = 17; Name = "Organisation"; Description = "Structure fichiers, doublons"; Dependencies = @(0) }
    @{ Number = 18; Name = "Structure API"; Description = "Cohérence handlers, routes API"; Dependencies = @(0) }
    @{ Number = 19; Name = "Éléments Inutiles"; Description = "Fichiers obsolètes, redondants"; Dependencies = @(0, 2) }
    @{ Number = 20; Name = "Synchronisation GitHub Pages"; Description = "Vérification déploiement"; Dependencies = @(0) }
)

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
    
    # Afficher les phases disponibles
    foreach ($phase in $script:AuditPhases) {
        $status = if ($CompletedPhases -contains $phase.Number) { "[✓]" } else { "[ ]" }
        $color = if ($CompletedPhases -contains $phase.Number) { "Green" } else { "White" }
        Write-Host "  $status Phase $($phase.Number.ToString().PadLeft(2)): $($phase.Name)" -ForegroundColor $color
        Write-Host "      └─ $($phase.Description)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "  Options:" -ForegroundColor Yellow
    Write-Host "    [A]  Relancer TOUTES les phases" -ForegroundColor White
    Write-Host "    [R]  Reprendre depuis la dernière phase incomplète" -ForegroundColor White
    Write-Host "    [1-20] Sélectionner une ou plusieurs phases (ex: 0,2,5-8,10)" -ForegroundColor White
    Write-Host "    [Q]  Quitter" -ForegroundColor White
    Write-Host ""
    
    if ($StateFile -and (Test-Path $StateFile)) {
        Write-Host "  💾 État sauvegardé trouvé: $StateFile" -ForegroundColor Gray
    }
    
    Write-Host ""
    $choice = Read-Host "  Votre choix"
    
    return $choice
}

# Fonction pour parser la sélection de phases
function Parse-PhaseSelection {
    param(
        [string]$Selection,
        [array]$CompletedPhases = @()
    )
    
    $selectedPhases = @()
    
    if ($Selection -eq "A" -or $Selection -eq "a") {
        # Toutes les phases
        $selectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
    } elseif ($Selection -eq "R" -or $Selection -eq "r") {
        # Reprendre depuis la dernière phase incomplète
        $allPhaseNumbers = $script:AuditPhases | ForEach-Object { $_.Number }
        $selectedPhases = $allPhaseNumbers | Where-Object { $CompletedPhases -notcontains $_ }
        if ($selectedPhases.Count -eq 0) {
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
                        $selectedPhases += $i
                    }
                }
            } elseif ($part -match '^\d+$') {
                # Phase unique
                $phaseNum = [int]$part
                if ($script:AuditPhases | Where-Object { $_.Number -eq $phaseNum }) {
                    $selectedPhases += $phaseNum
                }
            }
        }
    }
    
    # Trier et dédupliquer
    $selectedPhases = $selectedPhases | Sort-Object -Unique
    
    # Vérifier les dépendances
    $phasesToRun = @()
    foreach ($phaseNum in $selectedPhases) {
        $phase = $script:AuditPhases | Where-Object { $_.Number -eq $phaseNum } | Select-Object -First 1
        if ($phase) {
            # Ajouter les dépendances si elles ne sont pas déjà complètes
            foreach ($dep in $phase.Dependencies) {
                if ($CompletedPhases -notcontains $dep -and $phasesToRun -notcontains $dep) {
                    $phasesToRun += $dep
                }
            }
            $phasesToRun += $phaseNum
        }
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
        Write-Warn "Erreur lors du chargement de l'état: $($_.Exception.Message)"
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

