# Script complet pour Docker : démarrage + tests
# Usage: .\scripts\dev\docker_complete.ps1

$ErrorActionPreference = "Stop"

Write-Host "🐳 DOCKER OTT - DÉMARRAGE COMPLET" -ForegroundColor Cyan
Write-Host ""

# Vérifier Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker n'est pas installé" -ForegroundColor Red
    exit 1
}

# Arrêter les conteneurs existants
Write-Host "🛑 Nettoyage..." -ForegroundColor Yellow
docker compose down -v 2>&1 | Out-Null

# Démarrer la base de données
Write-Host "🗄️  Démarrage PostgreSQL..." -ForegroundColor Yellow
docker compose up -d db

# Attendre PostgreSQL
Write-Host "⏳ Attente de PostgreSQL..." -ForegroundColor Yellow
$maxAttempts = 30
for ($i = 1; $i -le $maxAttempts; $i++) {
    Start-Sleep -Seconds 2
    $result = docker exec ott-postgres pg_isready -U postgres 2>&1
    if ($result -match "accepting connections") {
        Write-Host "✅ PostgreSQL prêt" -ForegroundColor Green
        break
    }
    if ($i -eq $maxAttempts) {
        Write-Host "❌ PostgreSQL timeout" -ForegroundColor Red
        exit 1
    }
}

# Initialiser la base de données
Write-Host "📦 Initialisation de la base de données..." -ForegroundColor Yellow
Get-Content sql/schema.sql -Raw | docker exec -i ott-postgres psql -U postgres -d ott_data 2>&1 | Out-Null
Write-Host "✅ Base de données initialisée" -ForegroundColor Green

# Démarrer l'API
Write-Host "🚀 Démarrage de l'API..." -ForegroundColor Yellow
docker compose up -d api
Start-Sleep -Seconds 5

# Tests
Write-Host ""
Write-Host "🧪 TESTS DE L'API" -ForegroundColor Cyan
Write-Host ""

# Health check
Write-Host "1️⃣  Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8000/index.php" -Method Get -TimeoutSec 10
    if ($health.database -eq "connected") {
        Write-Host "   ✅ Health check OK" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ Health check échoué" -ForegroundColor Red
    exit 1
}

# Login
Write-Host "2️⃣  Login..." -ForegroundColor Yellow
try {
    $loginBody = @{email="ymora@free.fr";password="Ym120879"} | ConvertTo-Json
    $login = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -TimeoutSec 10
    if ($login.success -and $login.token) {
        Write-Host "   ✅ Login OK" -ForegroundColor Green
        $token = $login.token
    } else {
        Write-Host "   ❌ Login échoué" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Login échoué: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Création patient avec date_of_birth
Write-Host "3️⃣  Création Patient (date_of_birth)..." -ForegroundColor Yellow
try {
    $patientBody = @{
        first_name = "Test"
        last_name = "Docker"
        birth_date = "1990-01-15"
        phone = "0123456789"
        email = "test@example.com"
    } | ConvertTo-Json
    
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    $patient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method Post -Body $patientBody -Headers $headers -TimeoutSec 10
    if ($patient.success -and $patient.patient.id) {
        Write-Host "   ✅ Patient créé! ID: $($patient.patient.id)" -ForegroundColor Green
        Write-Host "   ✅ date_of_birth: $($patient.patient.date_of_birth)" -ForegroundColor Green
        
        # Nettoyer
        try {
            Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$($patient.patient.id)" -Method Delete -Headers $headers -TimeoutSec 10 | Out-Null
        } catch {}
    } else {
        Write-Host "   ❌ Création échouée" -ForegroundColor Red
        exit 1
    }
} catch {
    $errorMsg = $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        try {
            $errorJson = $_.ErrorDetails.Message | ConvertFrom-Json
            $errorMsg = $errorJson.error
        } catch {
            $errorMsg = $_.ErrorDetails.Message
        }
    }
    Write-Host "   ❌ Erreur: $errorMsg" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ TOUT FONCTIONNE!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Services disponibles:" -ForegroundColor Cyan
Write-Host "   • API:        http://localhost:8000" -ForegroundColor White
Write-Host "   • Health:     http://localhost:8000/index.php" -ForegroundColor White
Write-Host "   • PostgreSQL: localhost:5432" -ForegroundColor White
Write-Host ""
Write-Host "📋 Pour le frontend:" -ForegroundColor Cyan
Write-Host "   1. Créez .env.local avec: NEXT_PUBLIC_API_URL=http://localhost:8000" -ForegroundColor White
Write-Host "   2. Lancez: npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "📋 Commandes utiles:" -ForegroundColor Cyan
Write-Host "   • Logs API:   docker compose logs -f api" -ForegroundColor White
Write-Host "   • Arrêter:    docker compose down" -ForegroundColor White
Write-Host "   • Redémarrer: docker compose restart" -ForegroundColor White
Write-Host ""

