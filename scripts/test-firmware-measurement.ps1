# Script de test pour simuler EXACTEMENT l'envoi d'une mesure comme le firmware v2.0
# Usage: .\scripts\test-firmware-measurement.ps1

param(
    [string]$ICCID = "8933150821051278837",
    [string]$Serial = "OTT-25-001",
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [float]$FlowLpm = 2.5,
    [float]$Battery = 85.5,
    [int]$RSSI = -75,
    [string]$Status = "EVENT",
    [string]$FirmwareVersion = "2.0"
)

Write-Host "=== TEST ENVOI MESURE (Format Firmware v2.0) ===" -ForegroundColor Cyan
Write-Host ""

# Construire le payload JSON EXACTEMENT comme le firmware
$deviceName = "OTT-" + $ICCID.Substring($ICCID.Length - 4)

$payload = @{
    mode = $Status
    type = "ota_measurement"
    status = $Status
    sim_iccid = $ICCID
    device_serial = $Serial
    firmware_version = $FirmwareVersion
    device_name = $deviceName
    flow_lpm = $FlowLpm
    battery_percent = $Battery
    rssi = $RSSI
    sleep_minutes = 1440
    measurement_duration_ms = 5
    calibration_coefficients = @(0, 1, 0)
    airflow_passes = 2
    airflow_samples_per_pass = 10
    airflow_delay_ms = 5
    timestamp_ms = [int64]((Get-Date).ToUniversalTime() - (Get-Date "1970-01-01")).TotalMilliseconds
} | ConvertTo-Json -Depth 10

Write-Host "Payload JSON (format firmware):" -ForegroundColor Yellow
Write-Host $payload
Write-Host ""

# URL de l'endpoint
$endpoint = "$API_URL/api.php/devices/measurements"

Write-Host "Endpoint: $endpoint" -ForegroundColor Yellow
Write-Host ""

# Headers comme le firmware
$headers = @{
    "Content-Type" = "application/json"
    "X-Device-ICCID" = $ICCID
}

Write-Host "Headers:" -ForegroundColor Yellow
$headers.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }
Write-Host ""

# Envoyer la requête avec gestion d'erreur améliorée
Write-Host "Envoi de la requête..." -ForegroundColor Yellow

# Utiliser HttpClient pour mieux gérer les erreurs
$httpClient = New-Object System.Net.Http.HttpClient
$httpClient.Timeout = [System.TimeSpan]::FromSeconds(30)

try {
    $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
    # Ajouter les headers (sauf Content-Type qui est déjà défini)
    foreach ($key in $headers.Keys) {
        if ($key -ne "Content-Type") {
            $content.Headers.Add($key, $headers[$key])
        }
    }
    
    $response = $httpClient.PostAsync($endpoint, $content).Result
    $responseBody = $response.Content.ReadAsStringAsync().Result
    
    if ($response.IsSuccessStatusCode) {
        Write-Host "✅ SUCCÈS!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Code HTTP: $([int]$response.StatusCode)" -ForegroundColor Green
        Write-Host ""
        Write-Host "Réponse de l'API:" -ForegroundColor Cyan
        $responseJson = $responseBody | ConvertFrom-Json
        $responseJson | ConvertTo-Json -Depth 10 | Write-Host
        
        if ($responseJson.success) {
            Write-Host ""
            Write-Host "✅ Mesure enregistrée avec succès!" -ForegroundColor Green
            Write-Host "   Device ID: $($responseJson.device_id)" -ForegroundColor Gray
            if ($responseJson.device_auto_registered) {
                Write-Host "   ⚠️ Dispositif créé automatiquement" -ForegroundColor Yellow
            }
            if ($responseJson.commands) {
                Write-Host "   📡 Commandes en attente: $($responseJson.commands.Count)" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "❌ ERREUR HTTP!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Code HTTP: $([int]$response.StatusCode)" -ForegroundColor Red
        Write-Host ""
        Write-Host "Réponse d'erreur complète:" -ForegroundColor Red
        Write-Host $responseBody
        Write-Host ""
        
        # Essayer de parser le JSON
        try {
            $errorJson = $responseBody | ConvertFrom-Json
            if ($errorJson.error_message) {
                Write-Host "📋 Message d'erreur détaillé:" -ForegroundColor Yellow
                Write-Host $errorJson.error_message -ForegroundColor Red
            }
            if ($errorJson.error_code) {
                Write-Host "📋 Code d'erreur: $($errorJson.error_code)" -ForegroundColor Yellow
            }
            if ($errorJson.error) {
                Write-Host "📋 Erreur: $($errorJson.error)" -ForegroundColor Yellow
            }
            if ($errorJson.details) {
                Write-Host "📋 Détails: $($errorJson.details)" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "⚠️ Réponse non-JSON (peut être HTML d'erreur PHP)" -ForegroundColor Yellow
        }
    }
    
} catch {
    Write-Host "❌ ERREUR!" -ForegroundColor Red
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.InnerException) {
        Write-Host "Exception interne: $($_.Exception.InnerException.Message)" -ForegroundColor Red
    }
} finally {
    $httpClient.Dispose()
}

Write-Host ""
Write-Host "Vérifiez:" -ForegroundColor Yellow
Write-Host "   - Que l'API est accessible: $API_URL" -ForegroundColor Gray
Write-Host "   - Que l'ICCID est correct: $ICCID" -ForegroundColor Gray
Write-Host "   - Les logs du serveur pour plus de détails" -ForegroundColor Gray

Write-Host ""
Write-Host "=== FIN DU TEST ===" -ForegroundColor Cyan

