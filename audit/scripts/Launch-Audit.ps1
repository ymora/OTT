# ===============================================================================
# SCRIPT DE LANCEMENT RAPIDE DE L'AUDIT
# ===============================================================================
# Système d'audit autonome et portable
# Détecte automatiquement le répertoire racine du projet (parent de audit)
# ===============================================================================

param(
    [string]$ConfigFile = "audit.config.ps1",
    [switch]$Verbose = $false,
    [int]$MaxFileLines = 500,
    [switch]$SkipMenu = $false,
    [string]$Phases = ""
)

# ===============================================================================
# DÉTECTION AUTOMATIQUE DU RÉPERTOIRE RACINE
# ===============================================================================

# Obtenir le répertoire du script (audit/scripts/)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Détecter le répertoire audit (parent de scripts/)
$auditDir = Split-Path -Parent $scriptDir

# Détecter le répertoire racine du projet (parent de audit)
# Si audit n'est pas trouvé, utiliser le répertoire courant
$currentPath = Get-Location
$rootDir = $currentPath

# Vérifier si on est dans audit/scripts/ ou si audit existe
if (Test-Path (Join-Path $auditDir "audit.ps1")) {
    # On est dans audit/scripts/, le projet racine est le parent
    $rootDir = Split-Path -Parent $auditDir
} else {
    # Chercher audit depuis le répertoire courant
    $searchPath = $currentPath
    $found = $false
    $maxDepth = 5
    $depth = 0
    
    while ($depth -lt $maxDepth -and -not $found) {
        $testPath = Join-Path $searchPath "audit"
        if (Test-Path $testPath -and (Test-Path (Join-Path $testPath "audit.ps1"))) {
            $auditDir = $testPath
            $rootDir = $searchPath
            $found = $true
        } else {
            $parent = Split-Path -Parent $searchPath
            if ($parent -eq $searchPath) {
                break  # On est à la racine
            }
            $searchPath = $parent
            $depth++
        }
    }
    
    if (-not $found) {
        Write-Host "⚠️  Répertoire audit non trouvé. Utilisation du répertoire courant." -ForegroundColor Yellow
        Write-Host "   Assurez-vous que audit/ existe dans ce projet." -ForegroundColor Yellow
        $rootDir = $currentPath
        $auditDir = Join-Path $rootDir "audit"
    }
}

# Changer vers le répertoire racine du projet
Set-Location $rootDir

Write-Host "📁 Répertoire racine détecté: $rootDir" -ForegroundColor Cyan
Write-Host "📁 Répertoire audit: $auditDir" -ForegroundColor Cyan

# Charger les fonctions de gestion des phases
. "$scriptDir\Audit-Phases.ps1"

# S'assurer que le répertoire de résultats existe (dans audit/)
$resultsDir = Join-Path $auditDir "resultats"
if (-not $resultsDir -or -not (Test-Path $resultsDir)) {
    if (-not $resultsDir) {
        $resultsDir = Join-Path $auditDir "resultats"
    }
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
    Write-Host "📁 Répertoire de résultats créé: $resultsDir" -ForegroundColor Green
}

# Fichier d'état pour la reprise
$stateFile = Join-Path $resultsDir "audit_state.json"

# Charger l'état précédent
$previousState = Load-AuditState -StateFile $stateFile
$completedPhases = $previousState.CompletedPhases

# Menu de sélection des phases (sauf si -SkipMenu ou -Phases spécifié)
$selectedPhases = @()
if (-not $SkipMenu -and [string]::IsNullOrEmpty($Phases)) {
    $choice = Show-PhaseMenu -CompletedPhases $completedPhases -StateFile $stateFile
    
    if ($choice -eq "Q" -or $choice -eq "q") {
        Write-Host "  ❌ Audit annulé par l'utilisateur" -ForegroundColor Yellow
        exit 0
    }
    
    # Parser la sélection avec gestion automatique des dépendances
    $selectedPhases = Parse-PhaseSelection -Selection $choice -CompletedPhases $completedPhases
    
    if ($selectedPhases.Count -eq 0) {
        Write-Host "  ℹ️  Aucune phase sélectionnée" -ForegroundColor Yellow
        exit 0
    }
    
    # Extraire les phases utilisateur depuis le choix original
    $userPhases = @()
    if ($choice -eq "A" -or $choice -eq "a") {
        $userPhases = $selectedPhases
    } else {
        $parts = $choice -split ','
        foreach ($part in $parts) {
            $part = $part.Trim()
            if ($part -match '^(\d+)-(\d+)$') {
                $start = [int]$matches[1]
                $end = [int]$matches[2]
                for ($i = $start; $i -le $end; $i++) {
                    if ($selectedPhases -contains $i) {
                        $userPhases += $i
                    }
                }
            } elseif ($part -match '^\d+$') {
                $phaseNum = [int]$part
                if ($selectedPhases -contains $phaseNum) {
                    $userPhases += $phaseNum
                }
            }
        }
    }
    
    $userPhases = $userPhases | Sort-Object -Unique
    $dependencyPhases = $selectedPhases | Where-Object { $userPhases -notcontains $_ }
    
    Write-Host ""
    Write-Host "  ✅ Phases à exécuter:" -ForegroundColor Green
    if ($userPhases.Count -gt 0) {
        $userPhaseNames = $userPhases | ForEach-Object {
            $phase = $script:AuditPhases | Where-Object { $_.Number -eq $_ } | Select-Object -First 1
            if ($phase) {
                "Phase $_ ($($phase.Name))"
            } else {
                "Phase $_"
            }
        }
        Write-Host "     📋 Sélectionnées: $($userPhases -join ', ')" -ForegroundColor White
        Write-Host "        $($userPhaseNames -join ', ')" -ForegroundColor DarkGray
    }
    if ($dependencyPhases.Count -gt 0) {
        $depPhaseNames = $dependencyPhases | ForEach-Object {
            $phase = $script:AuditPhases | Where-Object { $_.Number -eq $_ } | Select-Object -First 1
            if ($phase) {
                "Phase $_ ($($phase.Name))"
            } else {
                "Phase $_"
            }
        }
        Write-Host "     ⚙️  Dépendances (ajoutées automatiquement): $($dependencyPhases -join ', ')" -ForegroundColor Cyan
        Write-Host "        $($depPhaseNames -join ', ')" -ForegroundColor DarkGray
    }
    Write-Host "     📊 Total: $($selectedPhases.Count) phase(s) à exécuter" -ForegroundColor Gray
    Write-Host ""
} elseif (-not [string]::IsNullOrEmpty($Phases)) {
    # Phases spécifiées en paramètre
    $selectedPhases = Parse-PhaseSelection -Selection $Phases -CompletedPhases $completedPhases
    if ($selectedPhases.Count -eq 0) {
        Write-Host "  ℹ️  Aucune phase sélectionnée" -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""
    Write-Host "  ✅ Phases à exécuter: $($selectedPhases -join ', ')" -ForegroundColor Green
    Write-Host "     (dépendances incluses automatiquement)" -ForegroundColor Gray
    Write-Host ""
} else {
    # Toutes les phases si -SkipMenu
    $selectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
    Write-Host ""
    Write-Host "  ✅ Toutes les phases seront exécutées" -ForegroundColor Green
    Write-Host ""
}

# Nettoyer les résultats précédents seulement si on relance toutes les phases
if ($selectedPhases.Count -eq $script:AuditPhases.Count -or $selectedPhases -contains 0) {
    if (Test-Path $resultsDir) {
        $oldResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
        if ($oldResults) {
            $count = $oldResults.Count
            Remove-Item -Path $oldResults.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "🧹 Nettoyage: $count résultat(s) d'audit précédent(s) supprimé(s)" -ForegroundColor Yellow
        }
    }
    # Réinitialiser l'état si on relance tout
    $completedPhases = @()
    $stateFile = Join-Path $resultsDir "audit_state_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
}

# Lancer l'audit directement pour voir les logs en temps réel
Write-Host "`n📋 Exécution de l'audit avec affichage des logs en temps réel..." -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Capturer la sortie dans une variable ET l'afficher en temps réel
$resultFile = Join-Path $resultsDir "audit_resultat_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
$correctionPlansFile = Join-Path $resultsDir "correction_plans_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"

# Détecter automatiquement le projet avant de lancer l'audit
Write-Host "`n🔍 Détection automatique du projet..." -ForegroundColor Cyan
$detectScript = Join-Path $scriptDir "Detect-Project.ps1"
if (Test-Path $detectScript) {
    try {
        $projectMetadata = & $detectScript -ProjectRoot $rootDir -OutputFile "project_metadata.json"
        Write-Host "✅ Projet détecté: $($projectMetadata.project.name)" -ForegroundColor Green
    } catch {
        Write-Warning "Détection automatique échouée (continuation avec valeurs par défaut)"
    }
}

# Construire les paramètres pour l'audit
# Passer aussi les phases utilisateur pour l'affichage des dépendances
$configPath = Join-Path $scriptDir $ConfigFile
$auditParams = @{
    ConfigFile = $configPath
    Verbose = $Verbose
    MaxFileLines = $MaxFileLines
    SelectedPhases = $selectedPhases
    UserSelectedPhases = $userPhases  # Phases explicitement sélectionnées (sans dépendances)
    StateFile = $stateFile
    ResultFile = $resultFile
    CorrectionPlansFile = $correctionPlansFile
    ProjectRoot = $rootDir  # Passer le répertoire racine explicitement
    AuditDir = $auditDir    # Passer le répertoire audit explicitement
}

# Exécuter l'audit et rediriger la sortie vers le fichier ET la console
& "$scriptDir\Audit-Complet.ps1" @auditParams | Tee-Object -FilePath $resultFile

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Audit terminé - Résultats sauvegardés dans :" -ForegroundColor Green
Write-Host "   📄 Rapport: $resultFile" -ForegroundColor White
if (Test-Path $correctionPlansFile) {
    Write-Host "   📋 Plans de correction: $correctionPlansFile" -ForegroundColor White
}
if ($stateFile -and (Test-Path $stateFile)) {
    Write-Host "   💾 État sauvegardé: $stateFile" -ForegroundColor White
}

