# Script pour exécuter la migration de configuration manuellement
# Ajoute les colonnes manquantes dans device_configurations

param(
    [string]$API_URL = "http://localhost:3000",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MIGRATION CONFIGURATION DISPOSITIF" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Connexion
Write-Host "[1/2] Connexion à l'API..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -ContentType "application/json" -Body (@{
        email = $Email
        password = $Password
    } | ConvertTo-Json) -ErrorAction Stop
    
    $token = $loginResponse.token
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    Write-Host "  ✅ Connexion réussie" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur connexion: $_" -ForegroundColor Red
    exit 1
}

# Exécuter la migration
Write-Host ""
Write-Host "[2/2] Exécution de la migration..." -ForegroundColor Yellow
try {
    $migrationResponse = Invoke-RestMethod -Uri "$API_URL/api.php/admin/migrate-complete" -Method POST -Headers $headers -ErrorAction Stop
    
    if ($migrationResponse.success) {
        Write-Host "  ✅ Migration exécutée avec succès" -ForegroundColor Green
        Write-Host ""
        Write-Host "  Logs:" -ForegroundColor Cyan
        if ($migrationResponse.logs) {
            foreach ($log in $migrationResponse.logs) {
                Write-Host "    $log" -ForegroundColor Gray
            }
        }
        if ($migrationResponse.verification) {
            Write-Host ""
            Write-Host "  Vérification:" -ForegroundColor Cyan
            $migrationResponse.verification.PSObject.Properties | ForEach-Object {
                Write-Host "    $($_.Name): $($_.Value)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "  ❌ Erreur lors de la migration" -ForegroundColor Red
        if ($migrationResponse.error) {
            Write-Host "  Erreur: $($migrationResponse.error)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "  ❌ Erreur migration: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Réponse: $responseBody" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "✅ Migration terminée" -ForegroundColor Green

