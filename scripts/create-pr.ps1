# Script pour créer une Pull Request depuis update-main vers main
# Ce script ouvre automatiquement la page GitHub pour créer la PR

$repo = "ymora/OTT"
$baseBranch = "main"
$compareBranch = "update-main"

$prUrl = "https://github.com/$repo/compare/$baseBranch...$compareBranch?expand=1"

Write-Host "🔗 Ouverture de la page de création de Pull Request..." -ForegroundColor Cyan
Write-Host "URL: $prUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "📝 Instructions:" -ForegroundColor Green
Write-Host "1. Remplissez le titre: 'Mise à jour main avec code actuel fonctionnel'" -ForegroundColor White
Write-Host "2. Cliquez sur 'Create pull request'" -ForegroundColor White
Write-Host "3. Une fois créée, cliquez sur 'Merge pull request'" -ForegroundColor White
Write-Host "4. Confirmez la fusion" -ForegroundColor White
Write-Host ""

# Ouvrir le navigateur
Start-Process $prUrl
