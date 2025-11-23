# Script de test complet pour les deux environnements
# Usage: .\scripts\test-all.ps1

Write-Host "🧪 TESTS COMPLETS - OTT Dashboard" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Build de développement
Write-Host "1️⃣  Test du build de développement..." -ForegroundColor Yellow
Write-Host "   Nettoyage..." -ForegroundColor Gray

if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
}

# Configurer pour le dev
$env:NODE_ENV = "development"
$env:NEXT_STATIC_EXPORT = $null
$env:NEXT_PUBLIC_BASE_PATH = $null

Write-Host "   Build en cours..." -ForegroundColor Gray
$buildResult = npm run build 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Build de développement réussi" -ForegroundColor Green
} else {
    Write-Host "   ✗ Build de développement échoué" -ForegroundColor Red
    Write-Host "   Voir les erreurs ci-dessus" -ForegroundColor Yellow
}

Write-Host ""

# Test 2: Build statique (export)
Write-Host "2️⃣  Test du build statique (GitHub Pages)..." -ForegroundColor Yellow
Write-Host "   Nettoyage..." -ForegroundColor Gray

if (Test-Path "out") {
    Remove-Item -Path "out" -Recurse -Force -ErrorAction SilentlyContinue
}

# Configurer pour l'export
$env:NEXT_STATIC_EXPORT = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/OTT"
$env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
$env:NODE_ENV = "production"

Write-Host "   Export en cours..." -ForegroundColor Gray
$exportResult = npm run export 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ Export statique réussi" -ForegroundColor Green
    
    # Vérifier les fichiers critiques
    $criticalFiles = @("out/index.html", "out/sw.js", "out/manifest.json")
    $allPresent = $true
    foreach ($file in $criticalFiles) {
        if (Test-Path $file) {
            Write-Host "     ✓ $(Split-Path $file -Leaf)" -ForegroundColor Green
        } else {
            Write-Host "     ✗ $(Split-Path $file -Leaf) MANQUANT" -ForegroundColor Red
            $allPresent = $false
        }
    }
    
    if ($allPresent) {
        Write-Host "   ✓ Tous les fichiers critiques présents" -ForegroundColor Green
    }
} else {
    Write-Host "   ✗ Export statique échoué" -ForegroundColor Red
    Write-Host "   Voir les erreurs ci-dessus" -ForegroundColor Yellow
}

# Restaurer les variables
$env:NODE_ENV = $null
$env:NEXT_STATIC_EXPORT = $null
$env:NEXT_PUBLIC_BASE_PATH = $null
$env:NEXT_PUBLIC_API_URL = $null

Write-Host ""

# Test 3: Vérification de la connexion API
Write-Host "3️⃣  Test de connexion à l'API..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "https://ott-jbln.onrender.com/api.php/health" -Method GET -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✓ API accessible" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  API répond avec le code: $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Impossible de contacter l'API" -ForegroundColor Yellow
    Write-Host "     Erreur: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host ""

# Résumé
Write-Host "📊 RÉSUMÉ:" -ForegroundColor Cyan
Write-Host "==========" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Tests terminés" -ForegroundColor Green
Write-Host ""
Write-Host "🚀 PROCHAINES ÉTAPES:" -ForegroundColor Yellow
Write-Host "  1. Pour le développement local:" -ForegroundColor White
Write-Host "     .\scripts\start-dev.ps1" -ForegroundColor Cyan
Write-Host "     OU: npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Pour tester le build statique localement:" -ForegroundColor White
Write-Host "     npx serve out -p 3001" -ForegroundColor Cyan
Write-Host "     Puis ouvrir: http://localhost:3001/OTT" -ForegroundColor Cyan
Write-Host ""
Write-Host "  3. Pour déployer sur GitHub Pages:" -ForegroundColor White
Write-Host "     git add out/ && git commit -m 'Deploy' && git push" -ForegroundColor Cyan
Write-Host ""

