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

# S'assurer que le répertoire de résultats existe
$resultsDir = Join-Path $rootDir "audit-complet\resultats"
if (-not (Test-Path $resultsDir)) {
    New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
}

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

# Lancer l'audit avec le chemin relatif correct et timeout
# IMPORTANT: Le script doit s'exécuter depuis la racine du projet
$job = Start-Job -ScriptBlock {
    param($scriptPath, $configFile, $verbose, $maxFileLines, $rootDir)
    Set-Location $rootDir
    & $scriptPath -ConfigFile $configFile -Verbose:$verbose -MaxFileLines $maxFileLines
} -ArgumentList "$scriptDir\AUDIT_COMPLET_AUTOMATIQUE.ps1", "audit-complet\scripts\$ConfigFile", $Verbose, $MaxFileLines, $rootDir

# Timeout de 10 minutes
$timeout = 600
$elapsed = 0
$interval = 5

while ($job.State -eq 'Running' -and $elapsed -lt $timeout) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    Write-Host "." -NoNewline -ForegroundColor Gray
}

if ($job.State -eq 'Running') {
    Write-Host "`n⚠️ Timeout atteint (10 min), arrêt de l'audit..." -ForegroundColor Yellow
    Stop-Job $job
    Remove-Job $job
} else {
    Write-Host "`n✅ Audit terminé" -ForegroundColor Green
    $result = Receive-Job $job
    $resultFile = Join-Path $resultsDir "audit_resultat_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
    $result | Out-File -FilePath $resultFile
    $result
    Remove-Job $job
}

