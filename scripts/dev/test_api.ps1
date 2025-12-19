# Script de test de l'API
Write-Host "🧪 TEST DE L'API" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "1️⃣  Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8000/index.php" -Method Get -TimeoutSec 10
    if ($health.database -eq "connected") {
        Write-Host "   ✅ Health check OK - Base connectée" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Base non connectée" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Health check échoué: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Login
Write-Host "2️⃣  Login..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "ymora@free.fr"
        password = "Ym120879"
    } | ConvertTo-Json
    
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

# Test 3: Création patient avec date_of_birth
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
            Write-Host "   ✅ Patient de test supprimé" -ForegroundColor Gray
        } catch {
            # Ignorer
        }
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
Write-Host "✅ TOUS LES TESTS RÉUSSIS!" -ForegroundColor Green
Write-Host ""

