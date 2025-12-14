# Script pour fusionner la PR #3 depuis yannick vers main
$repo = "ymora/OTT"
$prNumber = 3
$token = $env:GITHUB_TOKEN

if (-not $token) {
    Write-Host "Token GitHub non trouve dans GITHUB_TOKEN" -ForegroundColor Red
    Write-Host "Pour creer un token: https://github.com/settings/tokens" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "OU fusionnez manuellement sur GitHub:" -ForegroundColor Yellow
    Write-Host "https://github.com/$repo/pull/$prNumber" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Si la protection est desactivee, vous devriez voir un bouton 'Merge pull request'" -ForegroundColor White
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

Write-Host "Fusion de la PR #$prNumber..." -ForegroundColor Cyan

$mergeUrl = "https://api.github.com/repos/$repo/pulls/$prNumber/merge"
$mergeBody = @{
    commit_title = "Merge yannick into main"
    commit_message = "Mise a jour main avec code fonctionnel actuel"
    merge_method = "merge"
} | ConvertTo-Json

try {
    $mergeResponse = Invoke-RestMethod -Uri $mergeUrl -Headers $headers -Method Put -Body $mergeBody -ContentType "application/json"
    Write-Host "PR #$prNumber fusionnee avec succes!" -ForegroundColor Green
    Write-Host "SHA: $($mergeResponse.sha)" -ForegroundColor Gray
} catch {
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Message: $($errorJson.message)" -ForegroundColor Red
    }
    exit 1
}
