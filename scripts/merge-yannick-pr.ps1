# Script pour fusionner la PR depuis yannick vers main
$repo = "ymora/OTT"
$prsUrl = "https://github.com/$repo/pulls?q=is%3Apr+is%3Aopen+base%3Amain+head%3Ayannick"
$createPrUrl = "https://github.com/$repo/compare/main...yannick?expand=1"

Write-Host "Recherche de la Pull Request depuis yannick vers main..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Si une PR existe deja:" -ForegroundColor Green
Write-Host "   1. Ouvrez la PR" -ForegroundColor White
Write-Host "   2. Cliquez sur Merge pull request" -ForegroundColor White
Write-Host "   3. Confirmez la fusion" -ForegroundColor White
Write-Host ""
Write-Host "Si aucune PR n'existe:" -ForegroundColor Green
Write-Host "   1. Cliquez sur New pull request" -ForegroundColor White
Write-Host "   2. Base: main <- Compare: yannick" -ForegroundColor White
Write-Host "   3. Creez la PR puis fusionnez-la" -ForegroundColor White
Write-Host ""

Start-Process $prsUrl
Start-Sleep -Seconds 2
Start-Process $createPrUrl
