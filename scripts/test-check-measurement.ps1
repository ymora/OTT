# Script pour vérifier si une mesure a été enregistrée après l'envoi
# Usage: .\scripts\test-check-measurement.ps1

param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [int]$DeviceId = 4030
)

Write-Host "=== VERIFICATION MESURE ENREGISTREE ===" -ForegroundColor Cyan
Write-Host ""

# Option 1: Vérifier via l'endpoint de diagnostic
$diagnosticEndpoint = "$API_URL/api.php/admin/diagnostic/measurements"

Write-Host "1. Test endpoint diagnostic (necessite auth admin)..." -ForegroundColor Yellow
Write-Host "   Endpoint: $diagnosticEndpoint" -ForegroundColor Gray
Write-Host ""

# Option 2: Vérifier via l'endpoint history du dispositif
$historyEndpoint = "$API_URL/api.php/devices/$DeviceId/history"

Write-Host "2. Test endpoint history du dispositif..." -ForegroundColor Yellow
Write-Host "   Endpoint: $historyEndpoint" -ForegroundColor Gray
Write-Host ""

Write-Host "Envoi de la requete..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri $historyEndpoint -Method GET -Headers @{"Content-Type" = "application/json"} -ErrorAction Stop
    
    Write-Host "SUCCES!" -ForegroundColor Green
    Write-Host ""
    
    if ($response.success) {
        $measurements = $response.measurements
        $count = $measurements.Count
        
        Write-Host "Nombre de mesures trouvees: $count" -ForegroundColor Cyan
        Write-Host ""
        
        if ($count -gt 0) {
            Write-Host "Dernieres 5 mesures:" -ForegroundColor Yellow
            $measurements | Select-Object -First 5 | ForEach-Object {
                $timestamp = $_.timestamp
                $flowrate = $_.flowrate
                $battery = $_.battery
                $rssi = $_.signal_strength
                Write-Host "  - $timestamp | Flow: $flowrate L/min | Bat: $battery% | RSSI: $rssi" -ForegroundColor Gray
            }
            Write-Host ""
            Write-Host "Mesure la plus recente:" -ForegroundColor Green
            $latest = $measurements[0]
            Write-Host "  Timestamp: $($latest.timestamp)" -ForegroundColor Gray
            Write-Host "  Flowrate: $($latest.flowrate) L/min" -ForegroundColor Gray
            Write-Host "  Battery: $($latest.battery)%" -ForegroundColor Gray
            Write-Host "  RSSI: $($latest.signal_strength) dBm" -ForegroundColor Gray
            Write-Host "  Status: $($latest.device_status)" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Mesures trouvees dans la base de donnees!" -ForegroundColor Green
        } else {
            Write-Host "AUCUNE MESURE trouvee!" -ForegroundColor Red
            Write-Host ""
            Write-Host "Cela signifie que:" -ForegroundColor Yellow
            Write-Host "  - L'API a retourne success: true" -ForegroundColor Gray
            Write-Host "  - Mais la mesure n'a pas ete enregistree en BDD" -ForegroundColor Gray
            Write-Host "  - Verifiez les logs du serveur pour l'erreur d'insertion" -ForegroundColor Gray
        }
    } else {
        Write-Host "ERREUR dans la reponse:" -ForegroundColor Red
        Write-Host $response.error -ForegroundColor Red
    }
    
} catch {
    Write-Host "ERREUR!" -ForegroundColor Red
    Write-Host ""
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Code HTTP: $statusCode" -ForegroundColor Red
        
        if ($statusCode -eq 401) {
            Write-Host ""
            Write-Host "Authentification requise. Utilisez l'endpoint de diagnostic avec token admin." -ForegroundColor Yellow
        }
    }
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
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
            # Ignorer
        }
    }
}

Write-Host ""
Write-Host "=== FIN ===" -ForegroundColor Cyan

