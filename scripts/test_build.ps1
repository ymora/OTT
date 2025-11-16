# ============================================================================
# Test du build Next.js pour GitHub Pages
# ============================================================================
# Simule le build qui sera fait par GitHub Actions
# ============================================================================

Write-Host "Test du build Next.js pour GitHub Pages..." -ForegroundColor Cyan
Write-Host ""

# Verifier Node.js
$nodeVersion = node -v 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erreur: Node.js n'est pas installe" -ForegroundColor Red
    exit 1
}

Write-Host "Node.js: $nodeVersion" -ForegroundColor Green

# Nettoyer les anciens builds
if (Test-Path "out") {
    Write-Host "Suppression de l'ancien dossier out/..." -ForegroundColor Yellow
    Remove-Item -Path "out" -Recurse -Force
}

if (Test-Path ".next") {
    Write-Host "Suppression de l'ancien dossier .next/..." -ForegroundColor Yellow
    Remove-Item -Path ".next" -Recurse -Force
}

Write-Host ""

# Installer les dependances si necessaire
if (-not (Test-Path "node_modules")) {
    Write-Host "Installation des dependances..." -ForegroundColor Cyan
    npm install
    Write-Host ""
}

# Build avec les memes variables que GitHub Actions
Write-Host "Build Next.js avec basePath=/OTT..." -ForegroundColor Cyan
Write-Host "Variables d'environnement:" -ForegroundColor Gray
Write-Host "  NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com" -ForegroundColor Gray
Write-Host "  NEXT_PUBLIC_REQUIRE_AUTH=true" -ForegroundColor Gray
Write-Host "  NEXT_STATIC_EXPORT=true" -ForegroundColor Gray
Write-Host "  NEXT_PUBLIC_BASE_PATH=/OTT" -ForegroundColor Gray
Write-Host ""

$env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
$env:NEXT_PUBLIC_REQUIRE_AUTH = "true"
$env:NEXT_PUBLIC_ENABLE_DEMO_RESET = "false"
$env:NEXT_STATIC_EXPORT = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/OTT"
$env:NODE_ENV = "production"

npm run export

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Erreur lors du build!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Build termine!" -ForegroundColor Green
Write-Host ""

# Verifier la structure
if (Test-Path "out/index.html") {
    Write-Host "Fichier out/index.html trouve (OK)" -ForegroundColor Green
    
    # Verifier le contenu
    $indexContent = Get-Content "out/index.html" -Raw
    if ($indexContent -match "OTT Dashboard") {
        Write-Host "  Contenu correct: page de login trouvee" -ForegroundColor Green
    } else {
        Write-Host "  ATTENTION: Contenu inattendu dans index.html" -ForegroundColor Yellow
    }
    
    if ($indexContent -match "DOCUMENTATION_COMPLETE_OTT") {
        Write-Host "  ATTENTION: Reference a la documentation trouvee" -ForegroundColor Yellow
    }
} else {
    Write-Host "ERREUR: out/index.html non trouve!" -ForegroundColor Red
}

if (Test-Path "out/DOCUMENTATION_COMPLETE_OTT.html") {
    Write-Host "ATTENTION: out/DOCUMENTATION_COMPLETE_OTT.html existe" -ForegroundColor Yellow
    Write-Host "  Ce fichier ne devrait pas etre dans out/ (il est dans public/)" -ForegroundColor Yellow
} else {
    Write-Host "out/DOCUMENTATION_COMPLETE_OTT.html n'existe pas (OK)" -ForegroundColor Green
}

# Creer .nojekyll
$nojekyll = Join-Path "out" ".nojekyll"
if (-not (Test-Path $nojekyll)) {
    New-Item -Path $nojekyll -ItemType File -Force | Out-Null
    Write-Host "Fichier out/.nojekyll cree" -ForegroundColor Green
}

Write-Host ""
Write-Host "Structure du dossier out/:" -ForegroundColor Cyan
Get-ChildItem "out" -Directory | Select-Object -First 5 Name | ForEach-Object { Write-Host "  $($_.Name)/" -ForegroundColor Gray }
Get-ChildItem "out" -File | Select-Object -First 10 Name | ForEach-Object { Write-Host "  $($_.Name)" -ForegroundColor Gray }

Write-Host ""
Write-Host "Test termine!" -ForegroundColor Green
Write-Host ""
Write-Host "Pour tester localement:" -ForegroundColor Cyan
Write-Host "  cd out" -ForegroundColor Gray
Write-Host "  python -m http.server 8000" -ForegroundColor Gray
Write-Host "  Ouvrir http://localhost:8000/OTT/" -ForegroundColor Gray
Write-Host ""

