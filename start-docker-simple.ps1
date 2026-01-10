# ================================================================================
# Script de démarrage Docker - OTT Dashboard (PowerShell)
# ================================================================================

Write-Host "Demarrage de l'environnement Docker OTT..." -ForegroundColor Green

# Verifier que Docker Desktop est lance
try {
    docker info | Out-Null
    Write-Host "Docker Desktop: OK" -ForegroundColor Green
} catch {
    Write-Host "Docker Desktop n'est pas lance !" -ForegroundColor Red
    Write-Host "Veuillez demarrer Docker Desktop et relancer ce script" -ForegroundColor Yellow
    exit 1
}

# Arreter les anciens conteneurs
Write-Host "Arret des anciens conteneurs..." -ForegroundColor Yellow
docker-compose down

# Demarrer les nouveaux conteneurs
Write-Host "Demarrage des conteneurs..." -ForegroundColor Green
docker-compose up -d --build

# Attendre que les services soient prets
Write-Host "Attente de demarrage des services..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verifier que tout fonctionne
Write-Host "Verification des services..." -ForegroundColor Cyan

# Verifier l'API
try {
    $response = Invoke-RestMethod -Uri "http://localhost:8080/api.php/health" -TimeoutSec 5
    Write-Host "API PHP: OK (http://localhost:8080)" -ForegroundColor Green
} catch {
    Write-Host "API PHP: ERREUR" -ForegroundColor Red
}

# Verifier Next.js
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5
    Write-Host "Next.js: OK (http://localhost:3000)" -ForegroundColor Green
} catch {
    Write-Host "Next.js: Demarrage en cours..." -ForegroundColor Yellow
}

# Verifier PostgreSQL
try {
    $result = docker-compose exec -T db pg_isready -U ott_user
    Write-Host "PostgreSQL: OK" -ForegroundColor Green
} catch {
    Write-Host "PostgreSQL: ERREUR" -ForegroundColor Red
}

Write-Host ""
Write-Host "Acces a l'application:" -ForegroundColor Cyan
Write-Host "   Dashboard: http://localhost:3000" -ForegroundColor White
Write-Host "   API: http://localhost:8080/api.php/health" -ForegroundColor White
Write-Host "   Database: db:5432 (ott_user/ott_password)" -ForegroundColor White
Write-Host ""
Write-Host "Commandes utiles:" -ForegroundColor Cyan
Write-Host "   Logs: docker-compose logs -f" -ForegroundColor White
Write-Host "   Arreter: docker-compose down" -ForegroundColor White
Write-Host "   Rebuild: docker-compose up -d --build" -ForegroundColor White
