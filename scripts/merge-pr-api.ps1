# Script pour créer et fusionner la PR via l'API GitHub
# Nécessite un token GitHub dans la variable d'environnement GITHUB_TOKEN

$repo = "ymora/OTT"
$baseBranch = "main"
$headBranch = "yannick"

# Vérifier si un token GitHub est disponible
$token = $env:GITHUB_TOKEN
if (-not $token) {
    Write-Host "❌ Token GitHub non trouvé dans GITHUB_TOKEN" -ForegroundColor Red
    Write-Host "💡 Pour créer un token:" -ForegroundColor Yellow
    Write-Host "   1. Allez sur https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "   2. Créez un token avec les permissions: repo" -ForegroundColor White
    Write-Host "   3. Définissez: `$env:GITHUB_TOKEN = 'votre_token'" -ForegroundColor White
    exit 1
}

Write-Host "🔍 Vérification des PRs existantes..." -ForegroundColor Cyan

# Vérifier si une PR existe déjà
$headers = @{
    "Authorization" = "token $token"
    "Accept" = "application/vnd.github.v3+json"
}

$prsUrl = 'https://api.github.com/repos/' + $repo + '/pulls?state=open&base=' + $baseBranch + '&head=ymora:' + $headBranch
$response = Invoke-RestMethod -Uri $prsUrl -Headers $headers -Method Get

if ($response.Count -gt 0) {
    $pr = $response[0]
    Write-Host "✅ PR trouvée: #$($pr.number) - $($pr.title)" -ForegroundColor Green
    Write-Host "🔄 Fusion de la PR..." -ForegroundColor Cyan
    
    # Fusionner la PR
    $mergeUrl = "https://api.github.com/repos/$repo/pulls/$($pr.number)/merge"
    $mergeBody = @{
        commit_title = "Merge yannick into main"
        commit_message = "Mise à jour main avec code actuel fonctionnel"
        merge_method = "merge"
    } | ConvertTo-Json
    
    try {
        $mergeResponse = Invoke-RestMethod -Uri $mergeUrl -Headers $headers -Method Put -Body $mergeBody -ContentType "application/json"
        Write-Host "✅ PR fusionnée avec succès!" -ForegroundColor Green
        Write-Host "   SHA: $($mergeResponse.sha)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Erreur lors de la fusion: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "   Détails: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        exit 1
    }
} else {
    Write-Host "Aucune PR trouvee, creation d'une nouvelle PR..." -ForegroundColor Yellow
    
    # Créer une nouvelle PR
    $createUrl = "https://api.github.com/repos/$repo/pulls"
    $prBody = @{
        title = "Mise à jour main avec code actuel fonctionnel"
        body = "Fusion de yannick dans main pour mettre à jour avec le code actuel qui fonctionne."
        head = $headBranch
        base = $baseBranch
    } | ConvertTo-Json
    
    try {
        $newPr = Invoke-RestMethod -Uri $createUrl -Headers $headers -Method Post -Body $prBody -ContentType "application/json"
        Write-Host "✅ PR créée: #$($newPr.number)" -ForegroundColor Green
        Write-Host "🔄 Fusion de la PR..." -ForegroundColor Cyan
        
        # Fusionner immédiatement
        $mergeUrl = "https://api.github.com/repos/$repo/pulls/$($newPr.number)/merge"
        $mergeBody = @{
            commit_title = "Merge yannick into main"
            commit_message = "Mise à jour main avec code actuel fonctionnel"
            merge_method = "merge"
        } | ConvertTo-Json
        
        $mergeResponse = Invoke-RestMethod -Uri $mergeUrl -Headers $headers -Method Put -Body $mergeBody -ContentType "application/json"
        Write-Host "✅ PR fusionnée avec succès!" -ForegroundColor Green
        Write-Host "   SHA: $($mergeResponse.sha)" -ForegroundColor Gray
    } catch {
        Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails.Message) {
            Write-Host "   Détails: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        exit 1
    }
}

Write-Host ""
Write-Host "🎉 Main est maintenant à jour avec yannick!" -ForegroundColor Green
