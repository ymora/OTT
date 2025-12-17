# Script pour appliquer le schéma SQL en envoyant le contenu directement à l'API
# Usage: .\scripts\db\apply_schema_direct_sql.ps1 -ApiUrl 'https://ott-jbln.onrender.com'

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com",
    [string]$SchemaFile = "schema.sql"
)

Write-Host "🔧 Application du schéma SQL directement (contenu dans le body)" -ForegroundColor Cyan
Write-Host ""

# Construire le chemin du fichier SQL
$sqlFile = Join-Path $PSScriptRoot "..\..\sql\$SchemaFile"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ Fichier introuvable: $sqlFile" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Fichier SQL: $sqlFile" -ForegroundColor Gray
Write-Host "🌐 API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""

# Lire le contenu du fichier SQL
Write-Host "📖 Lecture du fichier SQL..." -ForegroundColor Yellow
$sqlContent = Get-Content $sqlFile -Raw -Encoding UTF8
$sqlLength = $sqlContent.Length
Write-Host "✅ Fichier lu ($sqlLength caractères)" -ForegroundColor Green
Write-Host ""

# Envoyer le SQL directement dans le body
Write-Host "🚀 Envoi du SQL à l'API..." -ForegroundColor Yellow

try {
    $body = @{
        sql = $sqlContent
    } | ConvertTo-Json -Depth 10
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 300 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host "✅ Schéma appliqué avec succès !" -ForegroundColor Green
        Write-Host ""
        if ($response.logs) {
            Write-Host "📋 Logs:" -ForegroundColor Cyan
            $response.logs | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
        Write-Host "⏱️  Durée: $($response.duration)ms" -ForegroundColor Gray
        Write-Host "📝 Instructions exécutées: $($response.statements_count)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "📋 Identifiants de connexion:" -ForegroundColor Cyan
        Write-Host "   Email: ymora@free.fr" -ForegroundColor Gray
        Write-Host "   Password: Ym120879" -ForegroundColor Gray
        Write-Host ""
        Write-Host "✅ Vous pouvez maintenant vous connecter !" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "❌ Erreur: $($response.error)" -ForegroundColor Red
        if ($response.message) {
            Write-Host "   Message: $($response.message)" -ForegroundColor Gray
        }
        if ($response.logs) {
            Write-Host ""
            Write-Host "📋 Logs:" -ForegroundColor Cyan
            $response.logs | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "❌ Erreur (code $statusCode)" -ForegroundColor Red
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Gray
    
    if ($statusCode -eq 403) {
        Write-Host ""
        Write-Host "💡 Accès refusé - Vérifiez que ALLOW_MIGRATION_ENDPOINT=true sur Render" -ForegroundColor Yellow
    } elseif ($statusCode -eq 500) {
        Write-Host ""
        Write-Host "💡 Erreur serveur - Vérifiez les logs Render pour plus de détails" -ForegroundColor Yellow
    }
    
    exit 1
}

