# ================================================================================
# Script de diagnostic pour tester la connexion à l'API Render
# ================================================================================

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "`n🔍 Diagnostic de l'API Render" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

# Test 1: Health check
Write-Host "1️⃣  Test de santé de l'API..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-WebRequest -Uri "$ApiUrl/api.php/health" -Method GET -TimeoutSec 10 -ErrorAction Stop
    if ($healthResponse.StatusCode -eq 200) {
        Write-Host "   ✅ API accessible (code 200)" -ForegroundColor Green
        $healthData = $healthResponse.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($healthData) {
            Write-Host "   Réponse: $($healthData | ConvertTo-Json -Compress)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ❌ API non accessible: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 2: Vérifier l'endpoint de migration
Write-Host "2️⃣  Test de l'endpoint de migration..." -ForegroundColor Yellow
try {
    $body = @{
        file = "schema.sql"
    } | ConvertTo-Json
    
    $migrationResponse = Invoke-WebRequest -Uri "$ApiUrl/api.php/admin/migrations/run" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -TimeoutSec 10 `
        -ErrorAction Stop
    
    Write-Host "   ✅ Endpoint accessible (code $($migrationResponse.StatusCode))" -ForegroundColor Green
    $migrationData = $migrationResponse.Content | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($migrationData) {
        Write-Host "   Réponse: $($migrationData | ConvertTo-Json -Compress)" -ForegroundColor Gray
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "   ❌ Erreur (code $statusCode): $($_.Exception.Message)" -ForegroundColor Red
    
    # Essayer de lire le body d'erreur
    try {
        $errorStream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($errorStream)
        $errorBody = $reader.ReadToEnd()
        $reader.Close()
        $errorStream.Close()
        
        Write-Host "   Détails:" -ForegroundColor Yellow
        Write-Host "   $errorBody" -ForegroundColor Gray
    } catch {
        Write-Host "   Impossible de lire les détails de l'erreur" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "💡 Vérifications à faire sur Render:" -ForegroundColor Cyan
Write-Host "   1. Service API → Logs (onglet 'Logs')" -ForegroundColor White
Write-Host "   2. Service API → Environment → DATABASE_URL est correct" -ForegroundColor White
Write-Host "   3. Base de données → Statut est 'Available'" -ForegroundColor White
Write-Host "   4. Service API → Statut est 'Live'" -ForegroundColor White

