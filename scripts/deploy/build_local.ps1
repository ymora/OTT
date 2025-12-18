# Script pour builder et tester localement le site statique
# Usage: .\scripts\deploy\build_local.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Build local du site statique Next.js" -ForegroundColor Cyan
Write-Host ""

# Vérifier qu'on est dans le bon répertoire
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Ce script doit être exécuté depuis la racine du projet!" -ForegroundColor Red
    exit 1
}

# Variables d'environnement pour le build
$env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
$env:NEXT_PUBLIC_ENABLE_DEMO_RESET = "false"
$env:NEXT_STATIC_EXPORT = "true"
$env:NEXT_PUBLIC_BASE_PATH = "/OTT"
$env:NODE_ENV = "production"
$env:NEXT_TELEMETRY_DISABLED = "1"

Write-Host "📋 Configuration:" -ForegroundColor Yellow
Write-Host "   API_URL: $env:NEXT_PUBLIC_API_URL" -ForegroundColor White
Write-Host "   BASE_PATH: $env:NEXT_PUBLIC_BASE_PATH" -ForegroundColor White
Write-Host "   STATIC_EXPORT: $env:NEXT_STATIC_EXPORT" -ForegroundColor White
Write-Host ""

# Nettoyer les anciens builds
Write-Host "🧹 Nettoyage des anciens builds..." -ForegroundColor Yellow
if (Test-Path ".next") {
    Remove-Item -Recurse -Force .next
    Write-Host "   ✅ .next supprimé" -ForegroundColor Green
}
if (Test-Path "out") {
    Remove-Item -Recurse -Force out
    Write-Host "   ✅ out supprimé" -ForegroundColor Green
}
Write-Host ""

# Installer les dépendances si nécessaire
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installation des dépendances..." -ForegroundColor Yellow
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Dépendances installées" -ForegroundColor Green
    Write-Host ""
}

# Générer SUIVI_TEMPS_FACTURATION.md si le script existe
if (Test-Path "scripts/deploy/generate_time_tracking.sh") {
    Write-Host "📊 Génération du suivi de temps..." -ForegroundColor Yellow
    bash scripts/deploy/generate_time_tracking.sh
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ Suivi de temps généré" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Erreur lors de la génération (non bloquant)" -ForegroundColor Yellow
    }
    Write-Host ""
}

# Build et export
Write-Host "🔨 Build et export du site statique..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors du build" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Build terminé" -ForegroundColor Green
Write-Host ""

# Vérifier que le dossier out existe
if (-not (Test-Path "out")) {
    Write-Host "❌ Le dossier 'out' n'a pas été créé!" -ForegroundColor Red
    exit 1
}

# Copier SUIVI_TEMPS_FACTURATION.md à la racine de out
if (Test-Path "public/docs/SUIVI_TEMPS_FACTURATION.md") {
    Copy-Item "public/docs/SUIVI_TEMPS_FACTURATION.md" "out/SUIVI_TEMPS_FACTURATION.md" -Force
    Write-Host "✅ SUIVI_TEMPS_FACTURATION.md copié dans out/" -ForegroundColor Green
}

# Créer .nojekyll
New-Item -Path "out/.nojekyll" -ItemType File -Force | Out-Null
Write-Host "✅ Fichier .nojekyll créé" -ForegroundColor Green

# Créer le fichier de version
$buildTimestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
$commitSha = git rev-parse HEAD
$commitShort = git rev-parse --short HEAD
$commitMessage = git log -1 --pretty=%B

$versionJson = @{
    version = $commitShort
    timestamp = $buildTimestamp
    commit = $commitSha
    message = $commitMessage
} | ConvertTo-Json

$versionJson | Out-File -FilePath "out/.version.json" -Encoding UTF8
Write-Host "✅ Fichier .version.json créé" -ForegroundColor Green

# Vérifier index.html
if (Test-Path "out/index.html") {
    Write-Host "✅ index.html trouvé" -ForegroundColor Green
} else {
    Write-Host "❌ index.html manquant!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅✅✅ BUILD LOCAL TERMINÉ AVEC SUCCÈS ! ✅✅✅" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Le site statique est dans le dossier 'out/'" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 Pour tester localement:" -ForegroundColor Yellow
Write-Host "   Option 1: Serveur HTTP simple (Python)" -ForegroundColor White
Write-Host "      cd out" -ForegroundColor Gray
Write-Host "      python -m http.server 8080" -ForegroundColor Gray
Write-Host "      Puis ouvrez: http://localhost:8080/OTT/" -ForegroundColor Gray
Write-Host ""
Write-Host "   Option 2: Serveur HTTP simple (Node.js)" -ForegroundColor White
Write-Host "      npx serve out -p 8080" -ForegroundColor Gray
Write-Host "      Puis ouvrez: http://localhost:8080/OTT/" -ForegroundColor Gray
Write-Host ""
Write-Host "   Option 3: PowerShell (simple)" -ForegroundColor White
Write-Host "      cd out" -ForegroundColor Gray
Write-Host "      python -m http.server 8080" -ForegroundColor Gray
Write-Host ""

