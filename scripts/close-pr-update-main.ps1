# Script pour fermer la PR depuis update-main vers main
$repo = "ymora/OTT"
$token = $env:GITHUB_TOKEN

if (-not $token) {
    Write-Host "Token GitHub non trouve dans GITHUB_TOKEN" -ForegroundColor Red
    Write-Host "Pour creer un token: https://github.com/settings/tokens" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Ou fermez la PR manuellement sur GitHub:" -ForegroundColor Yellow
    Write-Host "https://github.com/$repo/pulls" -ForegroundColor Cyan
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

# Chercher la PR depuis update-main vers main
$prsUrl = "https://api.github.com/repos/$repo/pulls?state=open&base=main&head=ymora:update-main"
try {
    $response = Invoke-RestMethod -Uri $prsUrl -Headers $headers -Method Get
    
    if ($response.Count -gt 0) {
        $pr = $response[0]
        Write-Host "PR trouvee: #$($pr.number) - $($pr.title)" -ForegroundColor Green
        
        # Fermer la PR
        $closeUrl = "https://api.github.com/repos/$repo/pulls/$($pr.number)"
        $closeBody = @{
            state = "closed"
        } | ConvertTo-Json
        
        $closeResponse = Invoke-RestMethod -Uri $closeUrl -Headers $headers -Method Patch -Body $closeBody -ContentType "application/json"
        Write-Host "PR #$($pr.number) fermee avec succes!" -ForegroundColor Green
    } else {
        Write-Host "Aucune PR ouverte trouvee depuis update-main vers main" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
