# ================================================================================
# Script de démarrage Docker - OTT Dashboard (PowerShell)
# ================================================================================

Write-Host "🐳 Démarrage de l'environnement Docker OTT..." -ForegroundColor Green

# Vérifier que Docker Desktop est lancé
try {
    docker info | Out-Null
    Write-Host "✅ Docker Desktop: OK" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Desktop n'est pas lancé !" -ForegroundColor Red
    Write-Host "📋 Veuillez démarrer Docker Desktop et relancer ce script" -ForegroundColor Yellow
    exit 1
}

# Arrêter les anciens conteneurs
Write-Host "🛑 Arrêt des anciens conteneurs..." -ForegroundColor Yellow
docker-compose down

# Démarrer les nouveaux conteneurs
Write-Host "🚀 Démarrage des conteneurs..." -ForegroundColor Green
docker-compose up -d --build

# Attendre que les services soient prêts
Write-Host "⏳ Attente de démarrage des services..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Vérifier que tout fonctionne
Write-Host "🔍 Vérification des services..." -ForegroundColor Cyan

# Vérifier l'API
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/api.php/health" -TimeoutSec 5
    Write-Host "✅ API PHP: OK (http://localhost:8080)" -ForegroundColor Green
} catch {
    Write-Host "❌ API PHP: ERREUR" -ForegroundColor Red
}

# Vérifier Next.js
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5
    Write-Host "✅ Next.js: OK (http://localhost:3000)" -ForegroundColor Green
} catch {
    Write-Host "⏳ Next.js: Démarrage en cours..." -ForegroundColor Yellow
}

# Vérifier PostgreSQL
try {
    $result = docker-compose exec -T db pg_isready -U ott_user
    Write-Host "✅ PostgreSQL: OK" -ForegroundColor Green
} catch {
    Write-Host "❌ PostgreSQL: ERREUR" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎯 Accès à l'application:" -ForegroundColor Cyan
Write-Host "   📱 Dashboard: http://localhost:3000" -ForegroundColor White
Write-Host "   🔌 API: http://localhost:8080/api.php/health" -ForegroundColor White
Write-Host "   🗄️  Database: db:5432 (ott_user/ott_password)" -ForegroundColor White
Write-Host ""
Write-Host "📋 Commandes utiles:" -ForegroundColor Cyan
Write-Host "   📊 Logs: docker-compose logs -f" -ForegroundColor White
Write-Host "   🛑 Arrêter: docker-compose down" -ForegroundColor White
Write-Host "   🔄 Rebuild: docker-compose up -d --build" -ForegroundColor White
