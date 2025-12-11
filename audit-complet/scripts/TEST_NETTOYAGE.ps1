# Script de test pour vérifier le nettoyage des résultats précédents

$resultsDir = Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) "resultats"

Write-Host "=== Test de Nettoyage des Résultats d'Audit ===" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $resultsDir) {
    $oldResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
    if ($oldResults) {
        Write-Host "Fichiers trouvés avant nettoyage: $($oldResults.Count)" -ForegroundColor Yellow
        $oldResults | ForEach-Object { Write-Host "  - $($_.Name)" -ForegroundColor Gray }
        Write-Host ""
        
        # Simuler le nettoyage
        Write-Host "Simulation du nettoyage..." -ForegroundColor Cyan
        Remove-Item -Path $oldResults.FullName -Force -ErrorAction SilentlyContinue
        
        # Vérifier après nettoyage
        $remainingResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
        if ($remainingResults) {
            Write-Host "❌ ERREUR: $($remainingResults.Count) fichier(s) restant(s) après nettoyage" -ForegroundColor Red
        } else {
            Write-Host "✅ SUCCÈS: Tous les fichiers ont été supprimés" -ForegroundColor Green
        }
    } else {
        Write-Host "Aucun fichier de résultat trouvé (répertoire vide)" -ForegroundColor Green
    }
} else {
    Write-Host "Répertoire resultats/ n'existe pas encore" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Répertoire: $resultsDir" -ForegroundColor Gray

