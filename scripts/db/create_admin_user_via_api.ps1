# Script pour créer l'utilisateur admin via l'API
# Usage: .\scripts\db\create_admin_user_via_api.ps1 -ApiUrl 'https://ott-jbln.onrender.com'

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🔧 Création de l'utilisateur admin via l'API" -ForegroundColor Cyan
Write-Host ""

# Lire le fichier SQL
$sqlFile = Join-Path $PSScriptRoot "..\..\sql\create_admin_user.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ Fichier introuvable: $sqlFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $sqlFile -Raw

Write-Host "📋 Fichier SQL: $sqlFile" -ForegroundColor Gray
Write-Host "🌐 API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""

# Essayer l'endpoint /migrate
Write-Host "🔍 Tentative via /migrate..." -ForegroundColor Yellow

try {
    $body = @{
        file = "create_admin_user.sql"
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/migrate" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host "✅ Utilisateur admin créé avec succès !" -ForegroundColor Green
        if ($response.logs) {
            $response.logs | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
        Write-Host "📋 Identifiants de connexion:" -ForegroundColor Cyan
        Write-Host "   Email: ymora@free.fr" -ForegroundColor Gray
        Write-Host "   Password: Ym120879" -ForegroundColor Gray
        exit 0
    } else {
        Write-Host "❌ Erreur: $($response.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Erreur (code $statusCode)" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Gray
    
    if ($statusCode -eq 400) {
        Write-Host ""
        Write-Host "💡 Le fichier create_admin_user.sql n'est peut-être pas trouvé sur Render" -ForegroundColor Yellow
        Write-Host "   Ou le schéma n'a pas encore été appliqué." -ForegroundColor Yellow
    }
    
    exit 1
}

