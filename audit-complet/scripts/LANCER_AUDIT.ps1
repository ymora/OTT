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

# Nettoyer les résultats précédents avant de lancer l'audit
$resultsDir = Join-Path $rootDir "audit-complet\resultats"
if (Test-Path $resultsDir) {
    $oldResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
    if ($oldResults) {
        $count = $oldResults.Count
        Remove-Item -Path $oldResults.FullName -Force -ErrorAction SilentlyContinue
        Write-Host "🧹 Nettoyage: $count résultat(s) d'audit précédent(s) supprimé(s)" -ForegroundColor Yellow
    }
}

# Lancer l'audit avec le chemin relatif correct
& "$scriptDir\AUDIT_COMPLET_AUTOMATIQUE.ps1" -ConfigFile "audit-complet\scripts\$ConfigFile" -Verbose:$Verbose -MaxFileLines $MaxFileLines

