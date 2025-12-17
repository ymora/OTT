# Script simple pour appliquer le schéma SQL complet
# Usage: .\scripts\db\apply_schema_simple.ps1

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🚀 Application du schéma SQL" -ForegroundColor Cyan
Write-Host ""

$schemaFile = Join-Path $PSScriptRoot "..\..\sql\schema.sql"
if (-not (Test-Path $schemaFile)) {
    Write-Host "❌ Fichier introuvable: $schemaFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $schemaFile -Raw -Encoding UTF8
# Normaliser les retours à la ligne
$sqlContent = $sqlContent -replace "`r`n", "`n" -replace "`r", "`n"

Write-Host "📋 Fichier SQL: $schemaFile" -ForegroundColor Gray
Write-Host "🌐 API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""

$body = @{
    sql = $sqlContent
} | ConvertTo-Json -Depth 10

try {
    Write-Host "🚀 Envoi du schéma à l'API..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 600 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host ""
        Write-Host "✅ Schéma appliqué avec succès !" -ForegroundColor Green
        if ($response.logs) {
            Write-Host ""
            Write-Host "📋 Logs:" -ForegroundColor Cyan
            $response.logs | Select-Object -Last 10 | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
        Write-Host "⏱️  Durée: $($response.duration)ms" -ForegroundColor Gray
        Write-Host "📝 Instructions exécutées: $($response.statements_count)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "📋 Identifiants de connexion:" -ForegroundColor Cyan
        Write-Host "   Email: ymora@free.fr" -ForegroundColor White
        Write-Host "   Password: Ym120879" -ForegroundColor White
        Write-Host ""
        Write-Host "✅ Vous pouvez maintenant vous connecter !" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ""
        Write-Host "❌ Erreur: $($response.error)" -ForegroundColor Red
        if ($response.message) {
            Write-Host "   Message: $($response.message)" -ForegroundColor Gray
        }
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host ""
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
