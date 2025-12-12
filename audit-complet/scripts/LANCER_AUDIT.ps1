# Script de lancement rapide de l'audit
# Utilise le répertoire courant comme base

param(
    [string]$ConfigFile = "audit.config.ps1",
    [switch]$Verbose = $false,
    [int]$MaxFileLines = 500
)

# Obtenir le répertoire du script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir

# Changer vers le répertoire racine du projet
Set-Location $rootDir

# S'assurer que le répertoire de résultats existe (chemin correct sans doublon)
$resultsDir = Join-Path $rootDir "audit-complet\resultats"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

# Nettoyer les résultats précédents avant de lancer l'audit
if (Test-Path $resultsDir) {
    $oldResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
    if ($oldResults) {
        $count = $oldResults.Count
        Remove-Item -Path $oldResults.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "🧹 Nettoyage: $count résultat(s) d'audit précédent(s) supprimé(s)" -ForegroundColor Yellow
    }
}

# Lancer l'audit directement pour voir les logs en temps réel
# IMPORTANT: Le script doit s'exécuter depuis la racine du projet
Write-Host "`n📋 Exécution de l'audit avec affichage des logs en temps réel..." -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Capturer la sortie dans une variable ET l'afficher en temps réel
$resultFile = Join-Path $resultsDir "audit_resultat_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"

# Exécuter l'audit et rediriger la sortie vers le fichier ET la console
& "$scriptDir\AUDIT_COMPLET_AUTOMATIQUE.ps1" -ConfigFile "audit-complet\scripts\$ConfigFile" -Verbose:$Verbose -MaxFileLines $MaxFileLines | Tee-Object -FilePath $resultFile

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "✅ Audit terminé - Résultats sauvegardés dans : $resultFile" -ForegroundColor Green

