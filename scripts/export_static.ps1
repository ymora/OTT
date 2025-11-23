# Script PowerShell pour exporter Next.js en site statique pour GitHub Pages
# Usage: .\scripts\export_static.ps1

Write-Host "📦 Export statique Next.js pour GitHub Pages" -ForegroundColor Cyan
Write-Host ""

# Définir les variables d'environnement
$env:NEXT_STATIC_EXPORT = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/OTT"
$env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
$env:NODE_ENV = "production"

Write-Host "Variables d'environnement:" -ForegroundColor Yellow
Write-Host "  NEXT_STATIC_EXPORT=$env:NEXT_STATIC_EXPORT"
Write-Host "  NEXT_PUBLIC_BASE_PATH=$env:NEXT_PUBLIC_BASE_PATH"
Write-Host "  NEXT_PUBLIC_API_URL=$env:NEXT_PUBLIC_API_URL"
Write-Host ""

# Nettoyer l'ancien build
if (Test-Path "out") {
    Write-Host "🧹 Nettoyage de l'ancien build..." -ForegroundColor Yellow
    Remove-Item -Path "out" -Recurse -Force
}

# Exporter le site statique
Write-Host "🔨 Build et export en cours..." -ForegroundColor Cyan
npx next build

# Vérifier que le build a réussi
if (-not (Test-Path "out")) {
    Write-Host "❌ ERREUR: Le dossier 'out' n'a pas été créé" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "out/index.html")) {
    Write-Host "❌ ERREUR: index.html non trouvé dans out/" -ForegroundColor Red
    exit 1
}

# Vérifier les fichiers critiques
Write-Host "🔍 Vérification des fichiers critiques..." -ForegroundColor Cyan
$criticalFiles = @(
    "out/index.html",
    "out/sw.js",
    "out/manifest.json",
    "out/icon-192.png",
    "out/icon-512.png"
)

$missingFiles = 0
foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Write-Host "  ✓ $(Split-Path $file -Leaf)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $(Split-Path $file -Leaf) - MANQUANT" -ForegroundColor Red
        $missingFiles++
    }
}

# Vérifier les fichiers CSS
$cssFiles = Get-ChildItem -Path "out/_next/static/css" -Filter "*.css" -ErrorAction SilentlyContinue
if ($cssFiles) {
    Write-Host "  ✓ Fichiers CSS: $($cssFiles.Count) trouvé(s)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Aucun fichier CSS trouvé dans out/_next/static/css" -ForegroundColor Yellow
}

# Vérifier les fichiers JS
$jsFiles = Get-ChildItem -Path "out/_next/static/chunks" -Filter "*.js" -Recurse -ErrorAction SilentlyContinue
if ($jsFiles) {
    Write-Host "  ✓ Fichiers JS: $($jsFiles.Count) trouvé(s)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  Aucun fichier JS trouvé dans out/_next/static/chunks" -ForegroundColor Yellow
}

if ($missingFiles -gt 0) {
    Write-Host ""
    Write-Host "⚠️  ATTENTION: $missingFiles fichier(s) critique(s) manquant(s)" -ForegroundColor Yellow
    Write-Host "   Le déploiement pourrait échouer" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Export réussi !" -ForegroundColor Green
$fileCount = (Get-ChildItem -Path "out" -Recurse -File).Count
Write-Host "   Dossier: out/" -ForegroundColor White
Write-Host "   Fichiers: $fileCount" -ForegroundColor White
Write-Host ""

