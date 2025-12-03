# Test de vérification dispositif OTT-8837 sur Render
Write-Host "🔍 Vérification dispositif OTT-8837 sur Render..." -ForegroundColor Cyan

$API_URL = "https://ott-jbln.onrender.com"

# 1. Login
Write-Host "`n1️⃣ Connexion à l'API..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@happlyz.com"
    password = "admin"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "✅ Connecté avec succès" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur connexion: $_" -ForegroundColor Red
    exit 1
}

# 2. Récupérer tous les dispositifs
Write-Host "`n2️⃣ Récupération des dispositifs..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $devicesResponse = Invoke-RestMethod -Uri "$API_URL/api.php/devices" -Method GET -Headers $headers
    $devices = $devicesResponse.devices
    Write-Host "✅ $($devices.Count) dispositifs en BDD" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur récupération: $_" -ForegroundColor Red
    exit 1
}

# 3. Chercher OTT-8837
Write-Host "`n3️⃣ Recherche OTT-8837..." -ForegroundColor Yellow
$found = $devices | Where-Object { 
    ($_.device_name -like "*8837*") -or 
    ($_.sim_iccid -like "*8837*") -or 
    ($_.device_serial -like "*8837*") 
}

if ($found) {
    Write-Host "✅ DISPOSITIF TROUVÉ !" -ForegroundColor Green
    $found | ForEach-Object {
        Write-Host "`n📱 Dispositif:" -ForegroundColor Cyan
        Write-Host "   ID: $($_.id)" -ForegroundColor White
        Write-Host "   Nom: $($_.device_name)" -ForegroundColor White
        Write-Host "   ICCID: $($_.sim_iccid)" -ForegroundColor White
        Write-Host "   Serial: $($_.device_serial)" -ForegroundColor White
        Write-Host "   Status: $($_.status)" -ForegroundColor White
        Write-Host "   Patient: $($_.patient_id ?? 'Non assigné')" -ForegroundColor White
        Write-Host "   Firmware: $($_.firmware_version)" -ForegroundColor White
    }
} else {
    Write-Host "❌ DISPOSITIF OTT-8837 NON TROUVÉ EN BASE !" -ForegroundColor Red
    Write-Host "`n📋 Les 5 derniers dispositifs:" -ForegroundColor Yellow
    $devices | Select-Object -Last 5 | ForEach-Object {
        Write-Host "   $($_.id): $($_.device_name) | ICCID: $($_.sim_iccid)" -ForegroundColor Gray
    }
}

Write-Host "`n✅ Test terminé" -ForegroundColor Green

