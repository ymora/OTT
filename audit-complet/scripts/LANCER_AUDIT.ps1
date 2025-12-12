# Script de lancement rapide de l'audit avec menu de sélection des phases
# Utilise le répertoire courant comme base

param(
    [string]$ConfigFile = "audit.config.ps1",
    [switch]$Verbose = $false,
    [int]$MaxFileLines = 500,
    [switch]$SkipMenu = $false,
    [string]$Phases = ""
)

# Obtenir le répertoire du script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

# Changer vers le répertoire racine du projet
Set-Location $rootDir

# Charger les fonctions de gestion des phases
. "$scriptDir\AUDIT_PHASES.ps1"

# S'assurer que le répertoire de résultats existe
$resultsDir = Join-Path $rootDir "audit-complet\resultats"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
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
    
    $selectedPhases = Parse-PhaseSelection -Selection $choice -CompletedPhases $completedPhases
    
    if ($selectedPhases.Count -eq 0) {
        Write-Host "  ℹ️  Aucune phase sélectionnée" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host ""
    Write-Host "  ✅ Phases sélectionnées: $($selectedPhases -join ', ')" -ForegroundColor Green
    Write-Host ""
} elseif (-not [string]::IsNullOrEmpty($Phases)) {
    # Phases spécifiées en paramètre
    $selectedPhases = Parse-PhaseSelection -Selection $Phases -CompletedPhases $completedPhases
} else {
    # Toutes les phases si -SkipMenu
    $selectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
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

# Construire les paramètres pour l'audit
$auditParams = @{
    ConfigFile = "audit-complet\scripts\$ConfigFile"
    Verbose = $Verbose
    MaxFileLines = $MaxFileLines
    SelectedPhases = $selectedPhases
    StateFile = $stateFile
    ResultFile = $resultFile
    CorrectionPlansFile = $correctionPlansFile
}

# Exécuter l'audit et rediriger la sortie vers le fichier ET la console
& "$scriptDir\AUDIT_COMPLET_AUTOMATIQUE.ps1" @auditParams | Tee-Object -FilePath $resultFile

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Audit terminé - Résultats sauvegardés dans :" -ForegroundColor Green
Write-Host "   📄 Rapport: $resultFile" -ForegroundColor White
if (Test-Path $correctionPlansFile) {
    Write-Host "   📋 Plans de correction: $correctionPlansFile" -ForegroundColor White
}
if (Test-Path $stateFile) {
    Write-Host "   💾 État sauvegardé: $stateFile" -ForegroundColor White
}

