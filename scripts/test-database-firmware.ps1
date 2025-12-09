# Script de test de la base de données pour vérifier la compatibilité avec le firmware
# Usage: .\scripts\test-database-firmware.ps1

param(
    [string]$API_URL = "https://ott-jbln.onrender.com"
)

Write-Host "`n🔍 TEST BASE DE DONNÉES - Compatibilité Firmware" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Fonctions
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  ℹ️  $Text" -ForegroundColor Gray }

# 1. Test Health Check
Write-Section "1. Health Check API"
try {
    $response = Invoke-RestMethod -Uri "$API_URL/api.php/health" -Method GET -ErrorAction Stop
    if ($response.success) {
        Write-OK "API accessible"
        Write-Info "Database: $($response.database.status)"
    } else {
        Write-Err "API retourne success=false"
    }
} catch {
    Write-Err "API non accessible: $($_.Exception.Message)"
    Write-Host "  Arrêt des tests - API non disponible" -ForegroundColor Red
    exit 1
}

# 2. Test Structure Base de Données (via endpoint database-view si disponible)
Write-Section "2. Structure Base de Données"
try {
    # Essayer d'obtenir des infos sur la base via l'API
    $response = Invoke-RestMethod -Uri "$API_URL/api.php/database-view" -Method GET -ErrorAction Stop
    if ($response.success) {
        Write-OK "Endpoint database-view accessible"
        $tables = $response.database_info.tables
        Write-Info "Tables trouvées: $($tables.Count)"
        
        $requiredTables = @("devices", "measurements", "device_configurations", "device_commands")
        foreach ($table in $requiredTables) {
            $found = $tables | Where-Object { $_.name -eq $table }
            if ($found) {
                Write-OK "Table '$table' existe ($($found.row_count) lignes)"
            } else {
                Write-Err "Table '$table' MANQUANTE"
            }
        }
    } else {
        Write-Warn "Endpoint database-view non disponible ou nécessite authentification"
    }
} catch {
    Write-Warn "Impossible d'accéder à database-view: $($_.Exception.Message)"
}

# 3. Test Insertion Mesure (comme le firmware)
Write-Section "3. Test Insertion Mesure (Format Firmware)"
$testMeasurement = @{
    sim_iccid = "8933150821051278837"
    device_serial = "OTT-25-001"
    device_name = "OTT-8837"
    firmware_version = "2.0"
    flow_lpm = 2.5
    battery_percent = 85.5
    rssi = -75
    status = "EVENT"
    mode = "EVENT"
    type = "ota_measurement"
    sleep_minutes = 1440
    measurement_duration_ms = 5
    airflow_passes = 2
    airflow_samples_per_pass = 10
    airflow_delay_ms = 5
    calibration_coefficients = @(0, 1, 0)
    timestamp_ms = [int64]((Get-Date).ToUniversalTime() - (Get-Date "1970-01-01")).TotalMilliseconds
} | ConvertTo-Json -Depth 10

$headers = @{
    "Content-Type" = "application/json"
    "X-Device-ICCID" = "8933150821051278837"
}

try {
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.Timeout = [System.TimeSpan]::FromSeconds(30)
    
    $content = New-Object System.Net.Http.StringContent($testMeasurement, [System.Text.Encoding]::UTF8, "application/json")
    foreach ($key in $headers.Keys) {
        if ($key -ne "Content-Type") {
            $content.Headers.Add($key, $headers[$key])
        }
    }
    
    $response = $httpClient.PostAsync("$API_URL/api.php/devices/measurements", $content).Result
    $responseBody = $response.Content.ReadAsStringAsync().Result
    
    if ($response.IsSuccessStatusCode) {
        Write-OK "Mesure insérée avec succès"
        $responseJson = $responseBody | ConvertFrom-Json
        if ($responseJson.success) {
            Write-OK "Réponse API: success=true"
            Write-Info "Device ID: $($responseJson.device_id)"
            if ($responseJson.device_auto_registered) {
                Write-Info "Dispositif créé automatiquement"
            }
            if ($responseJson.commands) {
                Write-Info "Commandes en attente: $($responseJson.commands.Count)"
            }
        } else {
            Write-Err "Réponse API: success=false"
            Write-Info "Erreur: $($responseJson.error)"
        }
    } else {
        Write-Err "Échec insertion mesure - HTTP $([int]$response.StatusCode)"
        Write-Host "Réponse:" -ForegroundColor Yellow
        Write-Host $responseBody
        
        # Essayer de parser le JSON d'erreur
        try {
            $errorJson = $responseBody | ConvertFrom-Json
            if ($errorJson.error_message) {
                Write-Err "Message d'erreur: $($errorJson.error_message)"
            }
            if ($errorJson.error_code) {
                Write-Info "Code d'erreur: $($errorJson.error_code)"
            }
        } catch {
            Write-Warn "Réponse non-JSON"
        }
    }
    
    $httpClient.Dispose()
} catch {
    Write-Err "Erreur lors du test: $($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Err "Exception interne: $($_.Exception.InnerException.Message)"
    }
}

# 4. Test Récupération Commandes (comme le firmware)
Write-Section "4. Test Récupération Commandes"
try {
    $response = Invoke-RestMethod -Uri "$API_URL/api.php/devices/8933150821051278837/commands/pending" -Method GET -ErrorAction Stop
    if ($response.success) {
        Write-OK "Commandes récupérées avec succès"
        Write-Info "Nombre de commandes: $($response.commands.Count)"
    } else {
        Write-Warn "Aucune commande en attente"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 404) {
        Write-Warn "Dispositif non trouvé (normal si première insertion)"
    } else {
        Write-Err "Erreur récupération commandes: HTTP $statusCode"
    }
}

# 5. Test Colonnes GPS (si migration appliquée)
Write-Section "5. Test Colonnes GPS"
Write-Info "Vérification si les colonnes latitude/longitude existent dans measurements"
Write-Info "Cette vérification nécessite l'accès direct à la base de données"
Write-Warn "Si les colonnes n'existent pas, appliquez: sql/migration_add_gps_to_measurements.sql"

Write-Host "`n✅ Tests terminés" -ForegroundColor Green
Write-Host ""

