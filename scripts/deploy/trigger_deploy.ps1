# Script pour déclencher le déploiement GitHub Pages via l'API GitHub
# Usage: .\scripts\deploy\trigger_deploy.ps1

param(
    [string]$Token = $env:GITHUB_TOKEN
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Déclenchement du déploiement GitHub Pages..." -ForegroundColor Cyan
Write-Host ""

# Vérifier qu'on est dans un dépôt Git
if (-not (Test-Path ".git")) {
    Write-Host "❌ Ce répertoire n'est pas un dépôt Git!" -ForegroundColor Red
    exit 1
}

# Récupérer le nom du repo depuis Git
$remoteUrl = git remote get-url origin
if ($remoteUrl -match "github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$") {
    $owner = $matches[1]
    $repo = $matches[2] -replace '\.git$', ''
    Write-Host "📦 Repository: $owner/$repo" -ForegroundColor Green
} else {
    Write-Host "❌ Impossible de déterminer le repository GitHub" -ForegroundColor Red
    exit 1
}

# Vérifier le token
if (-not $Token) {
    Write-Host "⚠️  Token GitHub non fourni" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Pour utiliser ce script, vous devez:" -ForegroundColor Cyan
    Write-Host "   1. Créer un Personal Access Token sur GitHub:" -ForegroundColor White
    Write-Host "      https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "   2. Permissions requises: 'workflow' (pour déclencher les workflows)" -ForegroundColor White
    Write-Host "   3. Définir la variable d'environnement:" -ForegroundColor White
    Write-Host "      `$env:GITHUB_TOKEN = 'votre_token'" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 OU déclencher manuellement:" -ForegroundColor Cyan
    Write-Host "   https://github.com/$owner/$repo/actions/workflows/deploy.yml" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Nom du workflow (sans l'extension .yml)
$workflowName = "Deploy Next.js to GitHub Pages"
$workflowFile = "deploy.yml"

# API GitHub pour déclencher le workflow
$apiUrl = "https://api.github.com/repos/$owner/$repo/actions/workflows/$workflowFile/dispatches"
$headers = @{
    "Accept" = "application/vnd.github+json"
    "Authorization" = "Bearer $Token"
    "X-GitHub-Api-Version" = "2022-11-28"
}
$body = @{
    ref = "main"
} | ConvertTo-Json

Write-Host "🔄 Déclenchement du workflow '$workflowName'..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Headers $headers -Body $body -ContentType "application/json"
    Write-Host "✅ Workflow déclenché avec succès!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Suivez le déploiement sur:" -ForegroundColor Cyan
    Write-Host "   https://github.com/$owner/$repo/actions" -ForegroundColor White
    Write-Host ""
} catch {
    $errorDetails = $_.ErrorDetails.Message
    if ($errorDetails) {
        try {
            $errorJson = $errorDetails | ConvertFrom-Json
            Write-Host "❌ Erreur: $($errorJson.message)" -ForegroundColor Red
        } catch {
            Write-Host "❌ Erreur: $errorDetails" -ForegroundColor Red
        }
    } else {
        Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    }
    Write-Host ""
    Write-Host "💡 Vérifiez que:" -ForegroundColor Yellow
    Write-Host "   • Le token a la permission 'workflow'" -ForegroundColor White
    Write-Host "   • Le workflow existe et est activé" -ForegroundColor White
    Write-Host "   • Vous avez les droits sur le repository" -ForegroundColor White
    exit 1
}







