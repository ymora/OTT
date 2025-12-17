# Script pour vérifier l'état de la base de données
# Usage: .\scripts\db\check_database_status.ps1 -ApiUrl 'https://ott-jbln.onrender.com'

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🔍 Vérification de l'état de la base de données" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "Test 1: Health check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$ApiUrl/api.php/health" -Method GET -TimeoutSec 10 -ErrorAction Stop
    Write-Host "✅ API accessible" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    if ($health.database) {
        Write-Host "   Database: $($health.database.status)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ API non accessible: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Test 2: Tentative de login (pour voir l'erreur exacte)
Write-Host "Test 2: Tentative de login..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = "ymora@free.fr"
        password = "Ym120879"
    } | ConvertTo-Json
    
    $loginResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -TimeoutSec 10 `
        -ErrorAction Stop
    
    if ($loginResponse.success) {
        Write-Host "✅ Login réussi !" -ForegroundColor Green
        Write-Host "   L'utilisateur admin existe et le mot de passe est correct." -ForegroundColor Gray
    } else {
        Write-Host "❌ Login échoué: $($loginResponse.error)" -ForegroundColor Red
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401) {
        Write-Host "❌ Erreur 401: Invalid credentials" -ForegroundColor Red
        Write-Host "   Cela signifie que:" -ForegroundColor Yellow
        Write-Host "   - Soit la vue 'users_with_roles' n'existe pas (schéma non appliqué)" -ForegroundColor Gray
        Write-Host "   - Soit l'utilisateur admin n'existe pas" -ForegroundColor Gray
        Write-Host "   - Soit le hash du mot de passe est incorrect" -ForegroundColor Gray
    } else {
        Write-Host "❌ Erreur (code $statusCode): $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "📋 Conclusion:" -ForegroundColor Cyan
Write-Host "   Si vous voyez 'Invalid credentials', il faut appliquer le schéma SQL." -ForegroundColor Yellow
Write-Host "   Utilisez un client PostgreSQL (DBeaver) pour exécuter sql/schema.sql" -ForegroundColor Yellow

