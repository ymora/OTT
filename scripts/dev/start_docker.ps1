# Script pour démarrer Docker et tester l'API
# Usage: .\scripts\dev\start_docker.ps1

$ErrorActionPreference = "Stop"

Write-Host "🐳 DÉMARRAGE DOCKER OTT" -ForegroundColor Cyan
Write-Host ""

# Vérifier Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker n'est pas installé" -ForegroundColor Red
    exit 1
}

# Arrêter les conteneurs existants
Write-Host "🛑 Arrêt des conteneurs existants..." -ForegroundColor Yellow
docker compose down 2>&1 | Out-Null

# Démarrer la base de données
Write-Host "🗄️  Démarrage PostgreSQL..." -ForegroundColor Yellow
docker compose up -d db

# Attendre que PostgreSQL soit prêt
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
        Write-Host "❌ PostgreSQL n'est pas prêt" -ForegroundColor Red
        exit 1
    }
}

# Initialiser la base de données
Write-Host "📦 Initialisation de la base de données..." -ForegroundColor Yellow
$tableCheck = docker exec ott-postgres psql -U postgres -d ott_data -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>&1
if ($tableCheck -match "^\s*0\s*$") {
    Write-Host "   Application du schéma SQL..." -ForegroundColor Gray
    Get-Content sql/schema.sql -Raw | docker exec -i ott-postgres psql -U postgres -d ott_data 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Base de données initialisée" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Erreur lors de l'initialisation" -ForegroundColor Yellow
    }
} else {
    Write-Host "✅ Base de données déjà initialisée" -ForegroundColor Green
}

# Démarrer l'API
Write-Host "🚀 Démarrage de l'API..." -ForegroundColor Yellow
docker compose up -d api

# Attendre que l'API soit prête
Write-Host "⏳ Attente de l'API..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Tester l'API
Write-Host ""
Write-Host "🧪 TEST DE L'API" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "1️⃣  Test Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8000/index.php" -Method Get -TimeoutSec 10
    if ($health.database -eq "connected") {
        Write-Host "   ✅ Health check OK - Base de données connectée" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Health check OK mais base non connectée" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Health check échoué: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: Login
Write-Host "2️⃣  Test Login..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "ymora@free.fr"
        password = "Ym120879"
    } | ConvertTo-Json
    
    $login = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method Post -Body $loginBody -ContentType "application/json" -TimeoutSec 10
    if ($login.success -and $login.token) {
        Write-Host "   ✅ Login OK - Token reçu" -ForegroundColor Green
        $token = $login.token
    } else {
        Write-Host "   ❌ Login échoué" -ForegroundColor Red
        $token = $null
    }
} catch {
    Write-Host "   ❌ Login échoué: $($_.Exception.Message)" -ForegroundColor Red
    $token = $null
}

# Test 3: Création patient avec date_of_birth
if ($token) {
    Write-Host "3️⃣  Test Création Patient (date_of_birth)..." -ForegroundColor Yellow
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
            Write-Host "   ✅ Patient créé avec succès (ID: $($patient.patient.id))" -ForegroundColor Green
            Write-Host "   ✅ date_of_birth fonctionne correctement" -ForegroundColor Green
            
            # Nettoyer - supprimer le patient de test
            try {
                Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$($patient.patient.id)" -Method Delete -Headers $headers -TimeoutSec 10 | Out-Null
            } catch {
                # Ignorer les erreurs de suppression
            }
        } else {
            Write-Host "   ❌ Création patient échouée" -ForegroundColor Red
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
        Write-Host "   ❌ Création patient échouée: $errorMsg" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ DOCKER DÉMARRÉ" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Services:" -ForegroundColor Cyan
Write-Host "   • API:        http://localhost:8000" -ForegroundColor White
Write-Host "   • Health:     http://localhost:8000/index.php" -ForegroundColor White
Write-Host "   • PostgreSQL: localhost:5432" -ForegroundColor White
Write-Host ""
Write-Host "📋 Commandes utiles:" -ForegroundColor Cyan
Write-Host "   • Logs API:   docker compose logs -f api" -ForegroundColor White
Write-Host "   • Arrêter:    docker compose down" -ForegroundColor White
Write-Host "   • Redémarrer: docker compose restart" -ForegroundColor White
Write-Host ""
Write-Host "📋 Pour le frontend:" -ForegroundColor Cyan
Write-Host "   Créez .env.local avec: NEXT_PUBLIC_API_URL=http://localhost:8000" -ForegroundColor White
Write-Host ""
