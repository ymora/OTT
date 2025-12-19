# Script de test complet pour identifier tous les problèmes avant corrections
# Puis relance l'audit complet

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🧪 TEST COMPLET POUR CORRECTIONS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$API_URL = "http://localhost:8000"
$errors = @()
$warnings = @()
$success = @()

# Test 1: Health Check
Write-Host "📋 Test 1: Health Check API" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/api.php/health" -Method GET -TimeoutSec 5
    if ($health.status -eq "online" -or $health.status -eq "ok") {
        Write-Host "   ✅ Health check OK" -ForegroundColor Green
        $success += "Health check"
    } else {
        Write-Host "   ⚠️  Health check: $($health.status)" -ForegroundColor Yellow
        $warnings += "Health check: $($health.status)"
    }
} catch {
    Write-Host "   ❌ Erreur health check: $($_.Exception.Message)" -ForegroundColor Red
    $errors += "Health check: $($_.Exception.Message)"
}

# Test 2: Endpoints GET sans auth
Write-Host "📋 Test 2: Endpoints GET publics" -ForegroundColor Yellow
$publicEndpoints = @("/api.php/devices", "/api.php/patients", "/api.php/users", "/api.php/alerts", "/api.php/firmwares")
foreach ($endpoint in $publicEndpoints) {
    try {
        $response = Invoke-RestMethod -Uri "$API_URL$endpoint" -Method GET -TimeoutSec 5 -ErrorAction Stop
        if ($response.success -ne $false) {
            Write-Host "   ✅ $endpoint" -ForegroundColor Green
            $success += $endpoint
        } else {
            Write-Host "   ⚠️  $endpoint : $($response.error)" -ForegroundColor Yellow
            $warnings += "$endpoint : $($response.error)"
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401 -or $statusCode -eq 403) {
            Write-Host "   ✅ $endpoint (auth requise - normal)" -ForegroundColor Green
            $success += "$endpoint (auth requise)"
        } else {
            Write-Host "   ❌ $endpoint : $($_.Exception.Message)" -ForegroundColor Red
            $errors += "$endpoint : $($_.Exception.Message)"
        }
    }
}

# Test 3: Vérification fichiers PHP
Write-Host "📋 Test 3: Vérification fichiers PHP" -ForegroundColor Yellow
$phpFiles = @(
    "api.php",
    "api/handlers/devices/patients.php",
    "api/handlers/auth.php",
    "api/handlers/usb_logs.php"
)
foreach ($file in $phpFiles) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file existe" -ForegroundColor Green
        $success += "Fichier $file"
    } else {
        Write-Host "   ❌ $file manquant" -ForegroundColor Red
        $errors += "Fichier $file manquant"
    }
}

# Test 4: Vérification variables whereClause
Write-Host "📋 Test 4: Vérification variables whereClause" -ForegroundColor Yellow
$patientsFile = Get-Content "api/handlers/devices/patients.php" -Raw
if ($patientsFile -match '\$whereClause\s*=') {
    Write-Host "   ✅ whereClause défini dans patients.php" -ForegroundColor Green
    $success += "whereClause patients.php"
} else {
    Write-Host "   ❌ whereClause manquant dans patients.php" -ForegroundColor Red
    $errors += "whereClause manquant patients.php"
}

$authFile = Get-Content "api/handlers/auth.php" -Raw
if ($authFile -match '\$whereClause\s*=') {
    Write-Host "   ✅ whereClause défini dans auth.php" -ForegroundColor Green
    $success += "whereClause auth.php"
} else {
    Write-Host "   ❌ whereClause manquant dans auth.php" -ForegroundColor Red
    $errors += "whereClause manquant auth.php"
}

# Test 5: Vérification display_errors
Write-Host "📋 Test 5: Vérification display_errors" -ForegroundColor Yellow
$apiFile = Get-Content "api.php" -Raw
if ($apiFile -match 'ini_set\([''"]display_errors[''"],\s*0\)') {
    Write-Host "   ✅ display_errors désactivé" -ForegroundColor Green
    $success += "display_errors désactivé"
} else {
    Write-Host "   ⚠️  display_errors peut être activé" -ForegroundColor Yellow
    $warnings += "display_errors peut être activé"
}

# Résumé
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 RÉSUMÉ DES TESTS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Succès: $($success.Count)" -ForegroundColor Green
Write-Host "⚠️  Avertissements: $($warnings.Count)" -ForegroundColor Yellow
Write-Host "❌ Erreurs: $($errors.Count)" -ForegroundColor Red
Write-Host ""

if ($errors.Count -gt 0) {
    Write-Host "Erreurs détectées:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host ""
}

if ($warnings.Count -gt 0) {
    Write-Host "Avertissements:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "✅ Tests terminés !" -ForegroundColor Green

