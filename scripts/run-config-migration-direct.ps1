# Script pour exécuter la migration SQL directement
# Ajoute les colonnes manquantes dans device_configurations

param(
    [string]$API_URL = "http://localhost:3000",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MIGRATION CONFIGURATION DISPOSITIF (SQL Direct)" -ForegroundColor Cyan
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

# Exécuter la migration SQL directement
Write-Host ""
Write-Host "[2/2] Exécution de la migration SQL..." -ForegroundColor Yellow

$migrationSQL = @"
ALTER TABLE device_configurations
ADD COLUMN IF NOT EXISTS airflow_passes INTEGER,
ADD COLUMN IF NOT EXISTS airflow_samples_per_pass INTEGER,
ADD COLUMN IF NOT EXISTS airflow_delay_ms INTEGER,
ADD COLUMN IF NOT EXISTS watchdog_seconds INTEGER,
ADD COLUMN IF NOT EXISTS modem_boot_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS sim_ready_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS network_attach_timeout_ms INTEGER,
ADD COLUMN IF NOT EXISTS modem_max_reboots INTEGER,
ADD COLUMN IF NOT EXISTS apn VARCHAR(64),
ADD COLUMN IF NOT EXISTS sim_pin VARCHAR(8),
ADD COLUMN IF NOT EXISTS ota_primary_url TEXT,
ADD COLUMN IF NOT EXISTS ota_fallback_url TEXT,
ADD COLUMN IF NOT EXISTS ota_md5 VARCHAR(32);
"@

try {
    # Utiliser l'endpoint SQL direct si disponible, sinon utiliser l'endpoint de migration
    $sqlBody = @{
        sql = $migrationSQL
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api.php/admin/sql" -Method POST -Headers $headers -Body ($sqlBody | ConvertTo-Json) -ErrorAction Stop
        Write-Host "  ✅ Migration exécutée via endpoint SQL" -ForegroundColor Green
    } catch {
        # Essayer l'endpoint de migration standard
        Write-Host "  Tentative via endpoint migration standard..." -ForegroundColor Yellow
        $migrationBody = @{
            sql = $migrationSQL
        }
        $response = Invoke-RestMethod -Uri "$API_URL/api.php/admin/migrations/run" -Method POST -Headers $headers -Body ($migrationBody | ConvertTo-Json) -ErrorAction Stop
        Write-Host "  ✅ Migration exécutée via endpoint migration" -ForegroundColor Green
    }
    
    if ($response.success) {
        Write-Host "  ✅ Migration réussie" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Migration partielle ou avertissement" -ForegroundColor Yellow
        if ($response.message) {
            Write-Host "  Message: $($response.message)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  ❌ Erreur migration: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ⚠️  La migration doit être exécutée manuellement en SQL:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host $migrationSQL -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Ou via l'endpoint /api.php/admin/migrations/run-complete" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "✅ Migration terminée" -ForegroundColor Green
Write-Host ""
Write-Host "Relancer le test: .\scripts\test-config-migration.ps1" -ForegroundColor Cyan

