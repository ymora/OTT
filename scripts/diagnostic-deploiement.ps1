# Script de diagnostic pour le déploiement GitHub Pages
# Vérifie que tout est à jour et correctement configuré

Write-Host "🔍 Diagnostic du déploiement GitHub Pages" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier les commits récents
Write-Host "1️⃣ Vérification des commits récents..." -ForegroundColor Yellow
$recentCommits = git log --oneline -5
Write-Host $recentCommits
Write-Host ""

# 2. Vérifier si on est à jour avec origin/main
Write-Host "2️⃣ Vérification synchronisation avec origin/main..." -ForegroundColor Yellow
$status = git status
Write-Host $status
Write-Host ""

# 3. Vérifier la configuration Next.js
Write-Host "3️⃣ Vérification configuration Next.js..." -ForegroundColor Yellow
if (Test-Path "next.config.js") {
    $nextConfig = Get-Content "next.config.js" -Raw
    if ($nextConfig -match "basePath.*OTT") {
        Write-Host "✅ basePath configuré pour /OTT" -ForegroundColor Green
    } else {
        Write-Host "❌ basePath non trouvé ou incorrect" -ForegroundColor Red
    }
    
    if ($nextConfig -match "assetPrefix.*OTT") {
        Write-Host "✅ assetPrefix configuré pour /OTT" -ForegroundColor Green
    } else {
        Write-Host "❌ assetPrefix non trouvé ou incorrect" -ForegroundColor Red
    }
} else {
    Write-Host "❌ next.config.js non trouvé" -ForegroundColor Red
}
Write-Host ""

# 4. Vérifier le workflow GitHub Actions
Write-Host "4️⃣ Vérification workflow GitHub Actions..." -ForegroundColor Yellow
if (Test-Path ".github/workflows/deploy.yml") {
    $workflow = Get-Content ".github/workflows/deploy.yml" -Raw
    if ($workflow -match "NEXT_PUBLIC_API_URL.*ott-jbln.onrender.com") {
        Write-Host "✅ API URL configurée dans le workflow" -ForegroundColor Green
    } else {
        Write-Host "❌ API URL non trouvée dans le workflow" -ForegroundColor Red
    }
    
    if ($workflow -match "NEXT_PUBLIC_BASE_PATH.*OTT") {
        Write-Host "✅ BASE_PATH configuré dans le workflow" -ForegroundColor Green
    } else {
        Write-Host "❌ BASE_PATH non trouvé dans le workflow" -ForegroundColor Red
    }
} else {
    Write-Host "❌ .github/workflows/deploy.yml non trouvé" -ForegroundColor Red
}
Write-Host ""

# 5. Vérifier les fichiers de configuration
Write-Host "5️⃣ Vérification fichiers de configuration..." -ForegroundColor Yellow
$configFiles = @(
    "next.config.js",
    ".github/workflows/deploy.yml",
    "scripts/deploy/export_static.sh",
    "package.json"
)

foreach ($file in $configFiles) {
    if (Test-Path $file) {
        Write-Host "✅ $file existe" -ForegroundColor Green
    } else {
        Write-Host "❌ $file manquant" -ForegroundColor Red
    }
}
Write-Host ""

# 6. Vérifier l'URL GitHub Pages
Write-Host "6️⃣ URL GitHub Pages attendue..." -ForegroundColor Yellow
Write-Host "   https://ymora.github.io/OTT/" -ForegroundColor Cyan
Write-Host "   (Vérifiez que GitHub Pages est activé dans les paramètres du repo)" -ForegroundColor Gray
Write-Host ""

# 7. Vérifier l'URL de l'API Render
Write-Host "7️⃣ URL API Render..." -ForegroundColor Yellow
Write-Host "   https://ott-jbln.onrender.com" -ForegroundColor Cyan
Write-Host "   (Vérifiez que le service Render est actif)" -ForegroundColor Gray
Write-Host ""

# 8. Instructions pour forcer un nouveau déploiement
Write-Host "8️⃣ Instructions pour forcer un nouveau déploiement..." -ForegroundColor Yellow
Write-Host "   Option 1: Faire un commit vide pour déclencher le workflow" -ForegroundColor Cyan
Write-Host "      git commit --allow-empty -m 'chore: Force redeploy GitHub Pages'" -ForegroundColor White
Write-Host "      git push" -ForegroundColor White
Write-Host ""
Write-Host "   Option 2: Déclencher manuellement depuis GitHub Actions" -ForegroundColor Cyan
Write-Host "      - Aller sur https://github.com/ymora/OTT/actions" -ForegroundColor White
Write-Host "      - Cliquer sur 'Deploy Next.js to GitHub Pages'" -ForegroundColor White
Write-Host "      - Cliquer sur 'Run workflow'" -ForegroundColor White
Write-Host ""

# 9. Vérifier le cache du navigateur
Write-Host "9️⃣ Note sur le cache navigateur..." -ForegroundColor Yellow
Write-Host "   Si la version web semble en retard, essayez:" -ForegroundColor Cyan
Write-Host "   - Ctrl+F5 (hard refresh)" -ForegroundColor White
Write-Host "   - Vider le cache du navigateur" -ForegroundColor White
Write-Host "   - Mode navigation privée" -ForegroundColor White
Write-Host ""

Write-Host "Diagnostic termine" -ForegroundColor Green

