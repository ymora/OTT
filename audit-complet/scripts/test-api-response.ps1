# Test rapide pour vérifier la structure des réponses API

param(
    [string]$Email = $env:AUDIT_EMAIL ?? "ymora@free.fr",
    [string]$Password = $env:AUDIT_PASSWORD ?? "",
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

# Authentification
$loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
try {
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $token = $authResponse.token
    $headers = @{Authorization = "Bearer $token"}
    Write-Host "✅ Authentification réussie" -ForegroundColor Green
    
    # Tester devices
    Write-Host "`n=== TEST DEVICES ===" -ForegroundColor Cyan
    $devicesData = Invoke-RestMethod -Uri "$ApiUrl/api.php/devices" -Headers $headers -TimeoutSec 10
    Write-Host "Type: $($devicesData.GetType().Name)" -ForegroundColor Yellow
    Write-Host "Propriétés: $($devicesData.PSObject.Properties.Name -join ', ')" -ForegroundColor Yellow
    
    if ($devicesData.devices) {
        Write-Host "✅ devices trouvé: $($devicesData.devices.Count) éléments" -ForegroundColor Green
    } else {
        Write-Host "❌ devices non trouvé" -ForegroundColor Red
    }
    
    # Tester patients
    Write-Host "`n=== TEST PATIENTS ===" -ForegroundColor Cyan
    $patientsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/patients" -Headers $headers -TimeoutSec 10
    Write-Host "Type: $($patientsData.GetType().Name)" -ForegroundColor Yellow
    Write-Host "Propriétés: $($patientsData.PSObject.Properties.Name -join ', ')" -ForegroundColor Yellow
    
    if ($patientsData.patients) {
        Write-Host "✅ patients trouvé: $($patientsData.patients.Count) éléments" -ForegroundColor Green
    } else {
        Write-Host "❌ patients non trouvé" -ForegroundColor Red
    }
    
    # Afficher un exemple de structure
    Write-Host "`n=== EXEMPLE STRUCTURE ===" -ForegroundColor Cyan
    Write-Host "Devices (premiers 100 caractères):" -ForegroundColor Yellow
    ($devicesData | ConvertTo-Json -Depth 2).Substring(0, [Math]::Min(100, ($devicesData | ConvertTo-Json -Depth 2).Length))
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

