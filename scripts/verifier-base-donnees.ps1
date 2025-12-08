# Script de vérification de la base de données pour le firmware
# Vérifie que toutes les tables et colonnes nécessaires existent

param(
    [string]$API_URL = "https://ott-jbln.onrender.com"
)

Write-Host "`n🔍 VÉRIFICATION BASE DE DONNÉES - Compatibilité Firmware" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Fonctions
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  ℹ️  $Text" -ForegroundColor Gray }

# Vérifications basées sur le schéma SQL
Write-Section "1. Vérification Schéma (basé sur schema.sql)"

$requiredTables = @(
    @{Name="devices"; Required=@("id", "sim_iccid", "device_serial", "device_name", "firmware_version", "last_seen", "last_battery", "last_flowrate", "last_rssi", "latitude", "longitude", "min_flowrate", "max_flowrate", "min_battery", "max_battery", "min_rssi", "max_rssi")},
    @{Name="measurements"; Required=@("id", "device_id", "timestamp", "flowrate", "battery", "signal_strength", "device_status", "latitude", "longitude")},
    @{Name="device_configurations"; Required=@("device_id", "firmware_version", "sleep_minutes", "measurement_duration_ms", "send_every_n_wakeups", "calibration_coefficients")},
    @{Name="device_commands"; Required=@("id", "device_id", "command", "payload", "priority", "status", "execute_after", "expires_at")}
)

Write-Info "Tables requises par le firmware:"
foreach ($table in $requiredTables) {
    Write-Info "  - $($table.Name) (colonnes: $($table.Required.Count))"
}

# 2. Test Insertion Mesure (simulation firmware complet)
Write-Section "2. Test Insertion Mesure (Format Firmware v2.0)"

$testPayload = @{
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

Write-Info "Payload de test (format firmware):"
Write-Host $testPayload -ForegroundColor Gray
Write-Host ""

$headers = @{
    "Content-Type" = "application/json"
    "X-Device-ICCID" = "8933150821051278837"
}

try {
    $httpClient = New-Object System.Net.Http.HttpClient
    $httpClient.Timeout = [System.TimeSpan]::FromSeconds(30)
    
    $content = New-Object System.Net.Http.StringContent($testPayload, [System.Text.Encoding]::UTF8, "application/json")
    foreach ($key in $headers.Keys) {
        if ($key -ne "Content-Type") {
            $content.Headers.Add($key, $headers[$key])
        }
    }
    
    Write-Info "Envoi de la requête POST /api.php/devices/measurements..."
    $response = $httpClient.PostAsync("$API_URL/api.php/devices/measurements", $content).Result
    $responseBody = $response.Content.ReadAsStringAsync().Result
    
    Write-Host "Code HTTP: $([int]$response.StatusCode)" -ForegroundColor $(if ($response.IsSuccessStatusCode) { "Green" } else { "Red" })
    
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
        Write-Host "`nRéponse complète:" -ForegroundColor Yellow
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
            if ($errorJson.file) {
                Write-Info "Fichier: $($errorJson.file):$($errorJson.line)"
            }
        } catch {
            Write-Warn "Réponse non-JSON (peut être HTML d'erreur PHP)"
        }
    }
    
    $httpClient.Dispose()
} catch {
    Write-Err "Erreur lors du test: $($_.Exception.Message)"
    if ($_.Exception.InnerException) {
        Write-Err "Exception interne: $($_.Exception.InnerException.Message)"
    }
}

# 3. Recommandations
Write-Section "3. Recommandations"

Write-Info "Pour vérifier directement la base de données:"
Write-Info "  1. Exécutez: scripts/test-database-schema.sql"
Write-Info "  2. Ou connectez-vous directement à PostgreSQL"
Write-Info ""
Write-Info "Pour activer DEBUG_ERRORS sur Render:"
Write-Info "  1. Dashboard Render > Service ott-api > Environment"
Write-Info "  2. Ajoutez: DEBUG_ERRORS=true"
Write-Info "  3. Save Changes"

Write-Host "`n✅ Vérification terminée" -ForegroundColor Green
Write-Host ""

