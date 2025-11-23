# Script de démarrage optimisé pour le développement
# Usage: .\scripts\start-dev.ps1

Write-Host "🚀 Démarrage du serveur de développement OTT Dashboard" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "❌ node_modules non trouvé" -ForegroundColor Red
    Write-Host "   Exécutez d'abord: npm install" -ForegroundColor Yellow
    exit 1
}

# Nettoyer le cache si nécessaire
if (Test-Path ".next") {
    Write-Host "🧹 Nettoyage du cache..." -ForegroundColor Yellow
    Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  ✓ Cache nettoyé" -ForegroundColor Green
    Write-Host ""
}

# Vérifier le port 3000
$port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000) {
    Write-Host "⚠️  Port 3000 déjà utilisé" -ForegroundColor Yellow
    Write-Host "   Arrêtez le processus ou utilisez un autre port" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Voulez-vous continuer quand même ? (o/N)"
    if ($response -ne "o" -and $response -ne "O") {
        exit 1
    }
    Write-Host ""
}

# Vérifier .env.local
if (Test-Path ".env.local") {
    Write-Host "✓ Configuration trouvée (.env.local)" -ForegroundColor Green
} else {
    Write-Host "⚠️  .env.local non trouvé" -ForegroundColor Yellow
    Write-Host "   Création d'un fichier .env.local par défaut..." -ForegroundColor Gray
    @"
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@ | Out-File -FilePath ".env.local" -Encoding UTF8
    Write-Host "  ✓ .env.local créé" -ForegroundColor Green
}
Write-Host ""

# Afficher la configuration
Write-Host "📋 Configuration:" -ForegroundColor Yellow
if (Test-Path ".env.local") {
    $envContent = Get-Content ".env.local" -Raw
    if ($envContent -match "NEXT_PUBLIC_API_URL=(.+)") {
        $apiUrl = $matches[1].Trim()
        Write-Host "  API URL: $apiUrl" -ForegroundColor Gray
    }
}
Write-Host "  Port: 3000" -ForegroundColor Gray
Write-Host "  URL: http://localhost:3000" -ForegroundColor Gray
Write-Host ""

# Démarrer le serveur
Write-Host "▶️  Démarrage du serveur..." -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Le serveur va démarrer. Appuyez sur Ctrl+C pour arrêter." -ForegroundColor Yellow
Write-Host ""

npm run dev

