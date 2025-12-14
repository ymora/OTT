# Script pour fusionner la PR #3 depuis yannick vers main
$repo = "ymora/OTT"
$prNumber = 3
$token = $env:GITHUB_TOKEN

if (-not $token) {
    Write-Host "Token GitHub non trouve dans GITHUB_TOKEN" -ForegroundColor Red
    Write-Host "Pour creer un token: https://github.com/settings/tokens" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Ou fusionnez la PR manuellement sur GitHub:" -ForegroundColor Yellow
    Write-Host "https://github.com/$repo/pull/$prNumber" -ForegroundColor Cyan
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# Fusionner la PR
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
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}
