# ============================================================================
# Script PowerShell - Appliquer Migration Firmware BYTEA via API
# ============================================================================
# Appelle l'endpoint API /migrate/firmware-blob pour exécuter la migration
# ============================================================================

param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$JWT_TOKEN = $null
)

Write-Host ""
Write-Host "💾 Migration Firmware BYTEA via API" -ForegroundColor Cyan
Write-Host ""

# Si pas de token, demander à l'utilisateur
if (-not $JWT_TOKEN) {
    Write-Host "🔐 Authentification requise" -ForegroundColor Yellow
    Write-Host "   Connectez-vous d'abord sur https://ott-jbln.onrender.com" -ForegroundColor Gray
    Write-Host "   Puis récupérez votre token JWT depuis:" -ForegroundColor Gray
    Write-Host "   - Console navigateur: localStorage.getItem('ott_token')" -ForegroundColor Cyan
    Write-Host ""
    $JWT_TOKEN = Read-Host "Token JWT (ou laissez vide pour essayer sans auth)"
}

Write-Host "📡 Appel de l'API..." -ForegroundColor Cyan
Write-Host "   URL: $API_URL/api.php/migrate/firmware-blob" -ForegroundColor Gray
Write-Host ""

try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($JWT_TOKEN) {
        $headers["Authorization"] = "Bearer $JWT_TOKEN"
    }
    
    $response = Invoke-WebRequest -Uri "$API_URL/api.php/migrate/firmware-blob" `
        -Method POST `
        -Headers $headers `
        -Body "{}" `
        -UseBasicParsing `
        -ErrorAction Stop
    
    $result = $response.Content | ConvertFrom-Json
    
    if ($result.success) {
        Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Résultats:" -ForegroundColor Cyan
        foreach ($res in $result.results) {
            $status = if ($res.status -eq 'success') { "✅" } else { "ℹ️" }
            Write-Host "   $status $($res.command)" -ForegroundColor $(if ($res.status -eq 'success') { "Green" } else { "Gray" })
        }
        Write-Host ""
        Write-Host "📋 Colonnes créées:" -ForegroundColor Cyan
        foreach ($col in $result.columns) {
            Write-Host "   ✅ $($col.column_name) ($($col.data_type))" -ForegroundColor Green
        }
        Write-Host ""
        Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
        Write-Host "   - Les nouveaux uploads .ino seront stockés dans la DB" -ForegroundColor Gray
        Write-Host "   - Les compilations .bin seront stockées dans la DB" -ForegroundColor Gray
        Write-Host "   - Plus de perte de fichiers lors des redéploiements !" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Erreur: $($result.error)" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "❌ Erreur lors de l'appel API:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Réponse: $responseBody" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "💡 Solutions:" -ForegroundColor Yellow
    Write-Host "   1. Vérifiez que vous êtes connecté (token JWT valide)" -ForegroundColor Cyan
    Write-Host "   2. Vérifiez que l'API est accessible: $API_URL/api.php/health" -ForegroundColor Cyan
    Write-Host "   3. Vérifiez que vous avez les droits admin" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

