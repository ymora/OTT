# ================================================================================
# Script pour redémarrer Docker avec le nouveau volume .arduino15/
# ================================================================================

Write-Host "🔄 Redémarrage Docker avec volume .arduino15/..." -ForegroundColor Cyan
Write-Host ""

# Arrêter les conteneurs
Write-Host "⏹️  Arrêt des conteneurs..." -ForegroundColor Yellow
docker-compose down

Write-Host ""

# Vérifier que .arduino15/ existe
if (-not (Test-Path ".arduino15")) {
    Write-Host "❌ ERREUR: .arduino15/ n'existe pas localement !" -ForegroundColor Red
    Write-Host "   Le volume Docker ne peut pas être monté." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ .arduino15/ trouvé localement" -ForegroundColor Green
Write-Host ""

# Redémarrer les conteneurs
Write-Host "▶️  Démarrage des conteneurs avec nouveau volume..." -ForegroundColor Yellow
docker-compose up -d

Write-Host ""
Write-Host "✅ Docker redémarré !" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Vérification du volume monté:" -ForegroundColor Cyan
docker exec ott-api ls -la /var/www/html/.arduino15 2>&1 | Select-Object -First 5

Write-Host ""
Write-Host "✅ Prêt pour la compilation !" -ForegroundColor Green

