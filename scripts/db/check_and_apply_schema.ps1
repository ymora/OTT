# Script pour vérifier l'état de la base et appliquer le schéma si nécessaire
# Usage: .\scripts\db\check_and_apply_schema.ps1 -ApiUrl 'https://ott-jbln.onrender.com'

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🔍 Vérification de l'état de la base de données..." -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier si l'API est accessible
Write-Host "1️⃣  Vérification de l'API..." -ForegroundColor Yellow
try {
    $healthResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/health" -Method GET -TimeoutSec 10 -ErrorAction Stop
    if ($healthResponse.success) {
        Write-Host "   ✅ API accessible" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  API répond mais avec un warning" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ API non accessible: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Vérifier si l'endpoint /admin/migrate-sql existe
Write-Host "2️⃣  Vérification de l'endpoint /admin/migrate-sql..." -ForegroundColor Yellow
try {
    # Tester avec un SQL minimal
    $testBody = @{
        sql = "SELECT 1 as test;"
    } | ConvertTo-Json
    
    $testResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $testBody `
        -ContentType "application/json" `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    Write-Host "   ✅ Endpoint /admin/migrate-sql disponible" -ForegroundColor Green
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Host "   ❌ Endpoint /admin/migrate-sql non trouvé (404)" -ForegroundColor Red
        Write-Host "   💡 Attendez 2-3 minutes que Render redéploie après le push Git" -ForegroundColor Yellow
        exit 1
    } elseif ($statusCode -eq 403) {
        Write-Host "   ⚠️  Accès refusé (403)" -ForegroundColor Yellow
        Write-Host "   💡 Vérifiez que ALLOW_MIGRATION_ENDPOINT=true sur Render" -ForegroundColor Yellow
    } else {
        Write-Host "   ⚠️  Erreur (code $statusCode): $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host ""

# 3. Appliquer le schéma complet
Write-Host "3️⃣  Application du schéma SQL complet..." -ForegroundColor Yellow
Write-Host ""

$schemaFile = Join-Path $PSScriptRoot "..\..\sql\schema.sql"
if (-not (Test-Path $schemaFile)) {
    Write-Host "   ❌ Fichier schema.sql introuvable: $schemaFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $schemaFile -Raw -Encoding UTF8
$sqlLength = $sqlContent.Length
Write-Host "   📋 Fichier SQL: $schemaFile ($sqlLength caractères)" -ForegroundColor Gray

$body = @{
    sql = $sqlContent
} | ConvertTo-Json -Depth 10

try {
    Write-Host "   🚀 Envoi du schéma à l'API..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 600 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host ""
        Write-Host "   ✅ Schéma appliqué avec succès !" -ForegroundColor Green
        if ($response.logs) {
            Write-Host ""
            Write-Host "   📋 Logs:" -ForegroundColor Cyan
            $response.logs | ForEach-Object {
                Write-Host "      $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
        Write-Host "   ⏱️  Durée: $($response.duration)ms" -ForegroundColor Gray
        Write-Host "   📝 Instructions exécutées: $($response.statements_count)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "✅ Base de données initialisée !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Identifiants de connexion:" -ForegroundColor Cyan
        Write-Host "   Email: ymora@free.fr" -ForegroundColor Gray
        Write-Host "   Password: Ym120879" -ForegroundColor Gray
        Write-Host ""
        Write-Host "✅ Vous pouvez maintenant vous connecter !" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ""
        Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
        if ($response.message) {
            Write-Host "      Message: $($response.message)" -ForegroundColor Gray
        }
        if ($response.logs) {
            Write-Host ""
            Write-Host "   📋 Logs:" -ForegroundColor Cyan
            $response.logs | ForEach-Object {
                Write-Host "      $_" -ForegroundColor Gray
            }
        }
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host ""
    Write-Host "   ❌ Erreur (code $statusCode)" -ForegroundColor Red
    Write-Host "      Message: $($_.Exception.Message)" -ForegroundColor Gray
    
    if ($statusCode -eq 403) {
        Write-Host ""
        Write-Host "   💡 Accès refusé - Vérifiez que ALLOW_MIGRATION_ENDPOINT=true sur Render" -ForegroundColor Yellow
    } elseif ($statusCode -eq 500) {
        Write-Host ""
        Write-Host "   💡 Erreur serveur - Vérifiez les logs Render pour plus de détails" -ForegroundColor Yellow
        Write-Host "      Les logs contiennent les détails de l'erreur SQL" -ForegroundColor Gray
    }
    
    exit 1
}

