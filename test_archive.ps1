# Test d'archivage API
$body = @{
    email = "ymora@free.fr"
    password = "Ym120879"
} | ConvertTo-Json

try {
    # Login
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $body
    Write-Host "✅ Login réussi"
    
    $headers = @{
        "Authorization" = "Bearer $($response.token)"
        "Content-Type" = "application/json"
    }
    
    # Test archivage patient ID 3
    Write-Host "🏥 Test archivage patient..."
    try {
        $archiveResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/3/archive" -Method PATCH -Headers $headers
        Write-Host "✅ Archivage patient: $($archiveResponse.message)"
    } catch {
        Write-Host "❌ Archivage patient échoué: $($_.ErrorDetails.Content)"
    }
    
    # Test restauration patient ID 3
    Write-Host "🔄 Test restauration patient..."
    try {
        $restoreResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/3/restore" -Method PATCH -Headers $headers
        Write-Host "✅ Restauration patient: $($restoreResponse.message)"
    } catch {
        Write-Host "❌ Restauration patient échoué: $($_.ErrorDetails.Content)"
    }
    
    # Test création et archivage dispositif
    Write-Host "📱 Test dispositif..."
    $deviceBody = @{
        sim_iccid = "89330176000012345678"
        device_serial = "TEST-DEVICE-$(Get-Date -Format yyyyMMddHHmmss)"
        device_name = "Test Device"
    } | ConvertTo-Json
    
    try {
        $createDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices" -Method POST -Headers $headers -Body $deviceBody
        $deviceId = $createDevice.device.id
        Write-Host "✅ Dispositif créé: $deviceId"
        
        # Archivage dispositif
        $archiveDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/archive" -Method PATCH -Headers $headers
        Write-Host "✅ Archivage dispositif: $($archiveDevice.message)"
        
        # Restauration dispositif
        $restoreDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/restore" -Method PATCH -Headers $headers
        Write-Host "✅ Restauration dispositif: $($restoreDevice.message)"
        
    } catch {
        Write-Host "❌ Test dispositif échoué: $($_.ErrorDetails.Content)"
    }
    
} catch {
    Write-Host "❌ Erreur login: $($_.Exception.Message)"
}
