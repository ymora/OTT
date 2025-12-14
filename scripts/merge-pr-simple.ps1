# Script pour creer et fusionner la PR via l'API GitHub
$repo = "ymora/OTT"
$baseBranch = "main"
$headBranch = "yannick"

$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "Token GitHub non trouve dans GITHUB_TOKEN" -ForegroundColor Red
    Write-Host "Pour creer un token: https://github.com/settings/tokens" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

$prsUrl = "https://api.github.com/repos/$repo/pulls?state=open&base=$baseBranch&head=ymora`:$headBranch"
try {
    $response = Invoke-RestMethod -Uri $prsUrl -Headers $headers -Method Get
    
    if ($response.Count -gt 0) {
        $pr = $response[0]
        Write-Host "PR trouvee: #$($pr.number)" -ForegroundColor Green
        
        $mergeUrl = "https://api.github.com/repos/$repo/pulls/$($pr.number)/merge"
        $mergeBody = @{
            commit_title = "Merge yannick into main"
            commit_message = "Mise a jour main avec code actuel fonctionnel"
            merge_method = "merge"
        } | ConvertTo-Json
        
        $mergeResponse = Invoke-RestMethod -Uri $mergeUrl -Headers $headers -Method Put -Body $mergeBody -ContentType "application/json"
        Write-Host "PR fusionnee avec succes!" -ForegroundColor Green
    } else {
        Write-Host "Creation d'une nouvelle PR..." -ForegroundColor Yellow
        
        $createUrl = "https://api.github.com/repos/$repo/pulls"
        $prBody = @{
            title = "Mise a jour main avec code actuel fonctionnel"
            body = "Fusion de yannick dans main"
            head = $headBranch
            base = $baseBranch
        } | ConvertTo-Json
        
        $newPr = Invoke-RestMethod -Uri $createUrl -Headers $headers -Method Post -Body $prBody -ContentType "application/json"
        Write-Host "PR creee: #$($newPr.number)" -ForegroundColor Green
        
        $mergeUrl = "https://api.github.com/repos/$repo/pulls/$($newPr.number)/merge"
        $mergeBody = @{
            commit_title = "Merge yannick into main"
            commit_message = "Mise a jour main avec code actuel fonctionnel"
            merge_method = "merge"
        } | ConvertTo-Json
        
        $mergeResponse = Invoke-RestMethod -Uri $mergeUrl -Headers $headers -Method Put -Body $mergeBody -ContentType "application/json"
        Write-Host "PR fusionnee avec succes!" -ForegroundColor Green
    }
} catch {
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
