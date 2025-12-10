# Script pour vérifier le statut du déploiement GitHub Pages
# Usage: .\scripts\verifier-deploiement-github-pages.ps1

Write-Host "🔍 Vérification du déploiement GitHub Pages..." -ForegroundColor Cyan
Write-Host ""

$repo = "ymora/OTT"
$baseUrl = "https://ymora.github.io/OTT"

Write-Host "📋 Informations:" -ForegroundColor Yellow
Write-Host "  Repository: $repo" -ForegroundColor White
Write-Host "  URL GitHub Pages: $baseUrl" -ForegroundColor White
Write-Host ""

# Vérifier les dernières modifications locales
Write-Host "📝 Derniers commits locaux:" -ForegroundColor Yellow
git log --oneline -5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

Write-Host ""
Write-Host "🌐 Vérification de l'accessibilité du site..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "$baseUrl" -Method Head -TimeoutSec 10 -ErrorAction Stop
    Write-Host "  ✅ Site accessible (HTTP $($response.StatusCode))" -ForegroundColor Green
    
    # Vérifier quelques fichiers critiques
    $criticalFiles = @(
        "$baseUrl/index.html",
        "$baseUrl/sw.js",
        "$baseUrl/manifest.json",
        "$baseUrl/SUIVI_TEMPS_FACTURATION.md",
        "$baseUrl/docs/DOCUMENTATION_PRESENTATION.html"
    )
    
    Write-Host ""
    Write-Host "📄 Vérification des fichiers critiques:" -ForegroundColor Yellow
    foreach ($file in $criticalFiles) {
        try {
            $fileResponse = Invoke-WebRequest -Uri $file -Method Head -TimeoutSec 5 -ErrorAction Stop
            Write-Host "  ✅ $(Split-Path $file -Leaf)" -ForegroundColor Green
        } catch {
            Write-Host "  ❌ $(Split-Path $file -Leaf) - Non accessible" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  ❌ Site non accessible: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  ⚠️  Le déploiement est peut-être en cours..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🔗 Liens utiles:" -ForegroundColor Cyan
Write-Host "  Actions GitHub: https://github.com/$repo/actions" -ForegroundColor Yellow
Write-Host "  Pages Settings: https://github.com/$repo/settings/pages" -ForegroundColor Yellow
Write-Host "  Site Live: $baseUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "Astuce: Le deploiement prend generalement 2-5 minutes apres un push" -ForegroundColor Gray

