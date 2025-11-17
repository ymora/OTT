# ================================================================================
# Script PowerShell - Export statique Next.js (sans routes API)
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Usage: .\scripts\export_static.ps1
# ================================================================================

$ErrorActionPreference = "Stop"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  OTT - Export Statique" -ForegroundColor Cyan  
Write-Host "  HAPPLYZ MEDICAL SAS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Aller dans le dossier du projet
$projectPath = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $projectPath

Write-Host "📂 Dossier: $projectPath" -ForegroundColor Green
Write-Host ""

# Chemins
$apiRoutePath = "app\api\proxy\[...path]\route.js"
$apiRouteBackup = "app\api\proxy\[...path]\route.js.bak"
$outPath = "out"
$nextPath = ".next"

# Vérifier si Node.js est installé
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ ERREUR: Node.js n'est pas installé!" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Nettoyer les anciens builds
Write-Host "🧹 Nettoyage..." -ForegroundColor Yellow
if (Test-Path $outPath) {
    Remove-Item -Recurse -Force $outPath
    Write-Host "   ✅ Dossier 'out' supprimé" -ForegroundColor Gray
}
if (Test-Path $nextPath) {
    Remove-Item -Recurse -Force $nextPath
    Write-Host "   ✅ Dossier '.next' supprimé" -ForegroundColor Gray
}
Write-Host ""

# Sauvegarder le fichier route.js de l'API (incompatible avec export statique)
$apiRouteExists = Test-Path $apiRoutePath
if ($apiRouteExists) {
    Write-Host "📦 Sauvegarde de la route API..." -ForegroundColor Yellow
    if (Test-Path $apiRouteBackup) {
        Remove-Item -Force $apiRouteBackup
    }
    Move-Item -Path $apiRoutePath -Destination $apiRouteBackup -Force
    Write-Host "   ✅ Route API sauvegardée" -ForegroundColor Gray
    Write-Host ""
}

try {
    # Export statique
    Write-Host "🔨 Génération de l'export statique..." -ForegroundColor Yellow
    Write-Host "   (Cela peut prendre quelques minutes...)" -ForegroundColor Gray
    Write-Host ""
    
    $env:NEXT_STATIC_EXPORT = "true"
    $env:NEXT_PUBLIC_BASE_PATH = "/OTT"
    $env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
    $env:NEXT_PUBLIC_ENABLE_DEMO_RESET = "false"
    $env:NODE_ENV = "production"
    
    npm run export
    
    if ($LASTEXITCODE -ne 0) {
        throw "Erreur lors de l'export statique"
    }
    
    Write-Host ""
    Write-Host "✅ Export statique généré avec succès!" -ForegroundColor Green
    Write-Host ""
    
    # Vérifier que les fichiers ont été générés
    if (!(Test-Path "$outPath\index.html")) {
        throw "index.html non trouvé dans out/"
    }
    
    # Compter les fichiers générés
    $outFiles = Get-ChildItem -Path $outPath -Recurse -File | Measure-Object
    Write-Host "📊 Fichiers générés: $($outFiles.Count)" -ForegroundColor Cyan
    
    # Vérifier les fichiers CSS
    $cssPath = "$outPath\_next\static\css"
    if (Test-Path $cssPath) {
        $cssFiles = Get-ChildItem -Path $cssPath -File
        Write-Host "   ✅ Fichiers CSS: $($cssFiles.Count)" -ForegroundColor Gray
        foreach ($css in $cssFiles) {
            Write-Host "      - $($css.Name)" -ForegroundColor DarkGray
        }
    }
    
    Write-Host ""
    
} finally {
    # Restaurer le fichier route.js
    if ($apiRouteExists -and (Test-Path $apiRouteBackup)) {
        Write-Host "🔄 Restauration de la route API..." -ForegroundColor Yellow
        if (Test-Path $apiRoutePath) {
            Remove-Item -Force $apiRoutePath
        }
        Move-Item -Path $apiRouteBackup -Destination $apiRoutePath -Force
        Write-Host "   ✅ Route API restaurée" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host "======================================" -ForegroundColor Green
Write-Host "  ✅ SUCCÈS!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "📦 Export statique disponible dans 'out/'" -ForegroundColor Green
Write-Host ""
Write-Host "🎯 Prochaines étapes:" -ForegroundColor Yellow
Write-Host "   1. Tester localement: servez le dossier 'out/' avec un serveur HTTP" -ForegroundColor White
Write-Host "   2. Pour déployer: poussez vers GitHub (le workflow déploiera automatiquement)" -ForegroundColor White
Write-Host ""
Write-Host "   Test local (Python):" -ForegroundColor Cyan
Write-Host "   cd out; python -m http.server 8000" -ForegroundColor Gray
Write-Host "   Puis: http://localhost:8000/OTT/" -ForegroundColor Gray
Write-Host ""

