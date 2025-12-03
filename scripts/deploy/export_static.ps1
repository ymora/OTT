# Script PowerShell pour exporter Next.js en site statique pour GitHub Pages
# Usage: .\scripts\export_static.ps1

Write-Host "Export statique Next.js pour GitHub Pages" -ForegroundColor Cyan
Write-Host ""

# Definir les variables d'environnement
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
    Write-Host "Nettoyage de l'ancien build..." -ForegroundColor Yellow
    Remove-Item -Path "out" -Recurse -Force
}

# Exporter le site statique
Write-Host "Build et export en cours..." -ForegroundColor Cyan
npx next build

# Verifier que le build a reussi
if (-not (Test-Path "out")) {
    Write-Host "ERREUR: Le dossier 'out' n'a pas ete cree" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "out/index.html")) {
    Write-Host "ERREUR: index.html non trouve dans out/" -ForegroundColor Red
    exit 1
}

# Verifier les fichiers critiques
Write-Host "Verification des fichiers critiques..." -ForegroundColor Cyan
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
        Write-Host "  OK $(Split-Path $file -Leaf)" -ForegroundColor Green
    } else {
        Write-Host "  MANQUANT $(Split-Path $file -Leaf)" -ForegroundColor Red
        $missingFiles++
    }
}

# Verifier les fichiers CSS
$cssFiles = Get-ChildItem -Path "out/_next/static/css" -Filter "*.css" -ErrorAction SilentlyContinue
if ($cssFiles) {
    Write-Host "  OK Fichiers CSS: $($cssFiles.Count) trouve(s)" -ForegroundColor Green
} else {
    Write-Host "  ATTENTION: Aucun fichier CSS trouve dans out/_next/static/css" -ForegroundColor Yellow
}

# Verifier les fichiers JS
$jsFiles = Get-ChildItem -Path "out/_next/static/chunks" -Filter "*.js" -Recurse -ErrorAction SilentlyContinue
if ($jsFiles) {
    Write-Host "  OK Fichiers JS: $($jsFiles.Count) trouve(s)" -ForegroundColor Green
} else {
    Write-Host "  ATTENTION: Aucun fichier JS trouve dans out/_next/static/chunks" -ForegroundColor Yellow
}

if ($missingFiles -gt 0) {
    Write-Host ""
    Write-Host "ATTENTION: $missingFiles fichier(s) critique(s) manquant(s)" -ForegroundColor Yellow
    Write-Host "   Le deploiement pourrait echouer" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Export reussi !" -ForegroundColor Green
$fileCount = (Get-ChildItem -Path "out" -Recurse -File).Count
Write-Host "   Dossier: out/" -ForegroundColor White
Write-Host "   Fichiers: $fileCount" -ForegroundColor White
Write-Host ""

# Copier les fichiers exportes vers docs/ pour GitHub Pages
Write-Host "Copie vers docs/ pour GitHub Pages..." -ForegroundColor Cyan

# Nettoyer le dossier docs/ (sauf les fichiers de documentation)
if (Test-Path "docs") {
    # Sauvegarder temporairement les screenshots
    if (Test-Path "docs/screenshots") {
        Write-Host "  Sauvegarde des screenshots..." -ForegroundColor Yellow
        if (Test-Path "docs_screenshots_backup") {
            Remove-Item -Path "docs_screenshots_backup" -Recurse -Force
        }
        Move-Item -Path "docs/screenshots" -Destination "docs_screenshots_backup" -Force
    }
    
    # Supprimer tout le contenu de docs/
    Write-Host "  Nettoyage de docs/..." -ForegroundColor Yellow
    Remove-Item -Path "docs\*" -Recurse -Force -ErrorAction SilentlyContinue
    
    # Restaurer les screenshots
    if (Test-Path "docs_screenshots_backup") {
        New-Item -Path "docs" -ItemType Directory -Force | Out-Null
        Move-Item -Path "docs_screenshots_backup" -Destination "docs/screenshots" -Force
    }
}

# Creer le dossier docs/ s'il n'existe pas
if (-not (Test-Path "docs")) {
    New-Item -Path "docs" -ItemType Directory -Force | Out-Null
}

# Copier tous les fichiers de out/ vers docs/
Write-Host "  Copie des fichiers..." -ForegroundColor Yellow
Copy-Item -Path "out\*" -Destination "docs" -Recurse -Force

# Copier le fichier .nojekyll
Write-Host "  Copie de .nojekyll..." -ForegroundColor Yellow
Copy-Item -Path ".nojekyll" -Destination "docs\.nojekyll" -Force

Write-Host ""
Write-Host "Copie vers docs/ terminee !" -ForegroundColor Green
$docsFileCount = (Get-ChildItem -Path "docs" -Recurse -File).Count
Write-Host "   Dossier: docs/" -ForegroundColor White
Write-Host "   Fichiers: $docsFileCount" -ForegroundColor White
Write-Host ""
Write-Host "Prochaine etape:" -ForegroundColor Cyan
Write-Host "   git add docs/ .nojekyll" -ForegroundColor White
Write-Host "   git commit -m ""Deploy: Update GitHub Pages""" -ForegroundColor White
Write-Host "   git push origin main" -ForegroundColor White
Write-Host ""
