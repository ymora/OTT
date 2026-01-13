# Script de test API simple
$body = @{
    email = "ymora@free.fr"
    password = "Ym120879"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $body
    Write-Host "✅ Login réussi"
    Write-Host "Token: $($response.token)"
    
    # Test création patient
    $patientBody = @{
        first_name = "Test"
        last_name = "Patient"
        email = "test.patient@example.com"
        phone = "0123456789"
    } | ConvertTo-Json
    
    $headers = @{
        "Authorization" = "Bearer $($response.token)"
        "Content-Type" = "application/json"
    }
    
    $patientResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method POST -Headers $headers -Body $patientBody
    Write-Host "✅ Patient créé: $($patientResponse.patient.id)"
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)"
    Write-Host "Response: $($_.ErrorDetails.Content)"
}
