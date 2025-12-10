# Script pour vérifier que le site GitHub Pages est synchronisé avec le code local
# Usage: .\scripts\verifier-synchronisation-deploiement.ps1

Write-Host "🔍 Vérification de la synchronisation GitHub Pages" -ForegroundColor Cyan
Write-Host ""

$repo = "ymora/OTT"
$baseUrl = "https://ymora.github.io/OTT"

# Récupérer le commit local actuel
$localCommit = git rev-parse --short HEAD
$localCommitFull = git rev-parse HEAD
$localCommitMessage = git log -1 --pretty=%B

Write-Host "📝 Commit local actuel:" -ForegroundColor Yellow
Write-Host "  SHA: $localCommit" -ForegroundColor White
Write-Host "  Message: $localCommitMessage" -ForegroundColor White
Write-Host ""

# Vérifier si le commit local est poussé
Write-Host "🌐 Vérification du commit distant..." -ForegroundColor Yellow
$remoteCommit = git rev-parse --short origin/main 2>$null
if ($LASTEXITCODE -eq 0) {
    if ($localCommit -eq $remoteCommit) {
        Write-Host "  ✅ Commit local synchronisé avec origin/main" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Commit local différent de origin/main" -ForegroundColor Yellow
        Write-Host "     Local:  $localCommit" -ForegroundColor Gray
        Write-Host "     Remote: $remoteCommit" -ForegroundColor Gray
        Write-Host "  💡 Solution: git push origin main" -ForegroundColor Cyan
    }
} else {
    Write-Host "  ⚠️  Impossible de récupérer le commit distant" -ForegroundColor Yellow
}

Write-Host ""

# Vérifier le fichier de version sur GitHub Pages
Write-Host "🌐 Vérification du fichier de version sur GitHub Pages..." -ForegroundColor Yellow
try {
    $versionUrl = "$baseUrl/.version.json"
    $versionResponse = Invoke-RestMethod -Uri $versionUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
    
    $deployedCommit = $versionResponse.version
    $deployedTimestamp = $versionResponse.timestamp
    $deployedMessage = $versionResponse.message
    
    Write-Host "  ✅ Fichier de version trouvé" -ForegroundColor Green
    Write-Host "     Commit déployé: $deployedCommit" -ForegroundColor White
    Write-Host "     Timestamp: $deployedTimestamp" -ForegroundColor White
    Write-Host "     Message: $deployedMessage" -ForegroundColor White
    Write-Host ""
    
    # Comparer avec le commit local
    if ($localCommit -eq $deployedCommit) {
        Write-Host "  ✅ Le site est à jour !" -ForegroundColor Green
        Write-Host "     Le commit local correspond au commit déployé." -ForegroundColor Green
    } else {
        Write-Host "  ❌ Le site n'est PAS à jour !" -ForegroundColor Red
        Write-Host "     Local:  $localCommit" -ForegroundColor Yellow
        Write-Host "     Déployé: $deployedCommit" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  💡 Solutions possibles:" -ForegroundColor Cyan
        Write-Host "     1. Vérifier que vous avez bien fait: git push origin main" -ForegroundColor White
        Write-Host "     2. Vérifier les Actions GitHub: https://github.com/$repo/actions" -ForegroundColor White
        Write-Host "     3. Attendre 2-5 minutes pour que le déploiement se termine" -ForegroundColor White
        Write-Host "     4. Vider le cache du navigateur (Ctrl+F5)" -ForegroundColor White
        Write-Host "     5. Forcer un redéploiement: git commit --allow-empty -m 'chore: Force deployment' && git push" -ForegroundColor White
    }
} catch {
    Write-Host "  ⚠️  Impossible de récupérer le fichier de version" -ForegroundColor Yellow
    Write-Host "     Erreur: $($_.Exception.Message)" -ForegroundColor Gray
    Write-Host "     Le site est peut-être en cours de déploiement..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  💡 Vérifier manuellement:" -ForegroundColor Cyan
    Write-Host "     - Actions GitHub: https://github.com/$repo/actions" -ForegroundColor White
    Write-Host "     - Site: $baseUrl" -ForegroundColor White
}

Write-Host ""
Write-Host "🔗 Liens utiles:" -ForegroundColor Cyan
Write-Host "  Actions GitHub: https://github.com/$repo/actions" -ForegroundColor Yellow
Write-Host "  Pages Settings: https://github.com/$repo/settings/pages" -ForegroundColor Yellow
Write-Host "  Site Live: $baseUrl" -ForegroundColor Yellow
Write-Host ""

