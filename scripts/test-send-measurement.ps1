# Script de test pour simuler l'envoi d'une mesure comme le fait le dispositif
# Usage: .\scripts\test-send-measurement.ps1

param(
    [string]$ICCID = "8933150821051278837",
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [float]$FlowLpm = 2.5,
    [int]$Battery = 85,
    [int]$RSSI = -75,
    [string]$Status = "EVENT",
    [string]$FirmwareVersion = "v3.0"
)

Write-Host "=== TEST ENVOI MESURE (Simulation Dispositif) ===" -ForegroundColor Cyan
Write-Host ""

# Construire le payload JSON comme le firmware
$payload = @{
    sim_iccid = $ICCID
    flow_lpm = $FlowLpm
    battery_percent = $Battery
    rssi = $RSSI
    status = $Status
    firmware_version = $FirmwareVersion
    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json -Compress

Write-Host "Payload JSON:" -ForegroundColor Yellow
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

# Envoyer la requête
Write-Host "Envoi de la requete..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headers -Body $payload -ContentType "application/json" -ErrorAction Stop
    
    Write-Host "SUCCES!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Reponse de l'API:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($response.success) {
        Write-Host ""
        Write-Host "Mesure enregistree avec succes!" -ForegroundColor Green
        Write-Host "   Device ID: $($response.device_id)" -ForegroundColor Gray
        if ($response.device_auto_registered) {
            Write-Host "   Dispositif cree automatiquement" -ForegroundColor Yellow
        }
        if ($response.commands) {
            Write-Host "   Commandes en attente: $($response.commands.Count)" -ForegroundColor Gray
        }
    }
    
} catch {
    Write-Host "ERREUR!" -ForegroundColor Red
    Write-Host ""
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Code HTTP: $statusCode" -ForegroundColor Red
    }
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    # Essayer de lire le body de l'erreur
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $responseBody = $reader.ReadToEnd()
            Write-Host ""
            Write-Host "Reponse d'erreur:" -ForegroundColor Red
            Write-Host $responseBody
        } catch {
            # Ignorer si on ne peut pas lire le body
        }
    }
    
    Write-Host ""
    Write-Host "Verifiez:" -ForegroundColor Yellow
    Write-Host "   - Que l'API est accessible: $API_URL" -ForegroundColor Gray
    Write-Host "   - Que l'ICCID est correct: $ICCID" -ForegroundColor Gray
    Write-Host "   - Les logs du serveur pour plus de details" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== FIN DU TEST ===" -ForegroundColor Cyan
