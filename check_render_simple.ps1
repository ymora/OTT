# Script simple pour vérifier la base Render
Write-Host "🔍 Vérification Base Render - OTT Dashboard" -ForegroundColor Cyan
Write-Host ""

$API_URL = "https://ott-jbln.onrender.com"

# Demander les credentials à l'utilisateur
Write-Host "📝 Credentials requis pour l'API Render" -ForegroundColor Yellow
$email = Read-Host "Email admin"
$password = Read-Host "Mot de passe" -AsSecureString
$passwordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($password))

# Login
Write-Host "`n1️⃣ Connexion..." -ForegroundColor Yellow
$loginBody = @{
    email = $email
    password = $passwordPlain
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -ErrorAction Stop
    $token = $loginResponse.token
    Write-Host "✅ Connecté !" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur connexion:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
    exit 1
}

# Récupérer les dispositifs
Write-Host "`n2️⃣ Récupération des dispositifs..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $devicesResponse = Invoke-RestMethod -Uri "$API_URL/api.php/devices" -Method GET -Headers $headers -ErrorAction Stop
    $devices = $devicesResponse.devices
    Write-Host "✅ $($devices.Count) dispositifs dans Render" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Afficher tous les dispositifs
Write-Host "`n📱 LISTE COMPLÈTE DES DISPOSITIFS:" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Gray

foreach ($device in $devices) {
    Write-Host "`n  ID: $($device.id)" -ForegroundColor White
    Write-Host "  Nom: $($device.device_name)" -ForegroundColor Yellow
    Write-Host "  ICCID: $($device.sim_iccid)" -ForegroundColor Cyan
    Write-Host "  Serial: $($device.device_serial)" -ForegroundColor Magenta
    Write-Host "  Status: $($device.status)" -ForegroundColor Green
    Write-Host "  Patient: $($device.patient_id ?? 'Non assigné')" -ForegroundColor Gray
    Write-Host "  Firmware: $($device.firmware_version ?? 'N/A')" -ForegroundColor Gray
    Write-Host "  Créé: $($device.created_at)" -ForegroundColor DarkGray
    Write-Host ("  " + ("-" * 76)) -ForegroundColor DarkGray
}

# Chercher OTT-8837
Write-Host "`n3️⃣ Recherche OTT-8837..." -ForegroundColor Yellow
$ott8837 = $devices | Where-Object { 
    ($_.device_name -like "*8837*") -or 
    ($_.sim_iccid -like "*8837*") -or 
    ($_.device_serial -like "*8837*") 
}

if ($ott8837) {
    Write-Host "`n✅ OTT-8837 TROUVÉ !" -ForegroundColor Green
    Write-Host ("=" * 80) -ForegroundColor Green
    $ott8837 | ForEach-Object {
        Write-Host "  ID: $($_.id)" -ForegroundColor White
        Write-Host "  Nom: $($_.device_name)" -ForegroundColor Yellow
        Write-Host "  ICCID: $($_.sim_iccid)" -ForegroundColor Cyan
        Write-Host "  Serial: $($_.device_serial)" -ForegroundColor Magenta
        Write-Host "  Status: $($_.status)" -ForegroundColor Green
    }
    Write-Host ("=" * 80) -ForegroundColor Green
} else {
    Write-Host "`n❌ OTT-8837 NON TROUVÉ EN BASE RENDER !" -ForegroundColor Red
    Write-Host "   Le dispositif USB n'a jamais été créé en base." -ForegroundColor Yellow
    Write-Host "   Vérifiez les logs de la console dans l'application Next.js." -ForegroundColor Yellow
}

# Récupérer aussi les patients et users pour vérifier la cohérence
Write-Host "`n4️⃣ Vérification autres tables..." -ForegroundColor Yellow
try {
    $patientsResponse = Invoke-RestMethod -Uri "$API_URL/api.php/patients" -Method GET -Headers $headers -ErrorAction Stop
    $patients = $patientsResponse.patients
    Write-Host "✅ $($patients.Count) patients" -ForegroundColor Green
    
    $usersResponse = Invoke-RestMethod -Uri "$API_URL/api.php/users" -Method GET -Headers $headers -ErrorAction Stop
    $users = $usersResponse.users
    Write-Host "✅ $($users.Count) utilisateurs" -ForegroundColor Green
    
    $alertsResponse = Invoke-RestMethod -Uri "$API_URL/api.php/alerts" -Method GET -Headers $headers -ErrorAction Stop
    $alerts = $alertsResponse.alerts
    Write-Host "✅ $($alerts.Count) alertes" -ForegroundColor Green
} catch {
    Write-Host "⚠️ Erreur récupération autres tables" -ForegroundColor Yellow
}

Write-Host "`n✅ Diagnostic terminé" -ForegroundColor Green
Write-Host ""

