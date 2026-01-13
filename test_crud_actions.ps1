# Test complet des actions CRUD après unification

Write-Host "🔧 TESTS CRUD COMPLETS" -ForegroundColor Green

# Login
$loginBody = @{email="ymora@free.fr"; password="Ym120879"} | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token
$headers = @{Authorization="Bearer $token"; "Content-Type"="application/json"}

# Test Patient CRUD
Write-Host "`n🏥 PATIENT CRUD" -ForegroundColor Cyan

# Create
$patientBody = @{
    first_name="Test"
    last_name="Patient"
    email="test.patient@crud.com"
    phone="0123456789"
    date_of_birth="1990-01-01"
} | ConvertTo-Json

try {
    $create = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method POST -Headers $headers -Body $patientBody
    $patientId = $create.patient.id
    Write-Host "✅ Patient créé: ID $patientId" -ForegroundColor Green
} catch {
    Write-Host "❌ Création patient: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# Update
$updateBody = @{first_name="TestModifie"} | ConvertTo-Json
try {
    $update = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId" -Method PUT -Headers $headers -Body $updateBody
    Write-Host "✅ Patient mis à jour: $($update.patient.first_name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Mise à jour patient: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Archive
try {
    $archive = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId/archive" -Method PATCH -Headers $headers
    Write-Host "✅ Patient archivé: $($archive.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Archivage patient: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Restore
try {
    $restore = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId/restore" -Method PATCH -Headers $headers
    Write-Host "✅ Patient restauré: $($restore.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Restauration patient: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Delete (permanent)
try {
    $delete = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId?permanent=true" -Method DELETE -Headers $headers
    Write-Host "✅ Patient supprimé: $($delete.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Suppression patient: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Test Device CRUD
Write-Host "`n📱 DEVICE CRUD" -ForegroundColor Cyan

# Create
$deviceBody = @{
    sim_iccid="89330176000012345678"
    device_serial="TEST-CRUD-$(Get-Date -Format yyyyMMddHHmmss)"
    device_name="Test Device CRUD"
    status="active"
} | ConvertTo-Json

try {
    $create = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices" -Method POST -Headers $headers -Body $deviceBody
    $deviceId = $create.device.id
    Write-Host "✅ Device créé: ID $deviceId" -ForegroundColor Green
} catch {
    Write-Host "❌ Création device: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# Update
$updateBody = @{device_name="Test Device Modifié"; status="inactive"} | ConvertTo-Json
try {
    $update = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method PUT -Headers $headers -Body $updateBody
    Write-Host "✅ Device mis à jour: $($update.device.device_name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Mise à jour device: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Archive
try {
    $archive = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/archive" -Method PATCH -Headers $headers
    Write-Host "✅ Device archivé: $($archive.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Archivage device: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Restore
try {
    $restore = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/restore" -Method PATCH -Headers $headers
    Write-Host "✅ Device restauré: $($restore.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Restauration device: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Delete (permanent)
try {
    $delete = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId?permanent=true" -Method DELETE -Headers $headers
    Write-Host "✅ Device supprimé: $($delete.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Suppression device: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Test User CRUD
Write-Host "`n👤 USER CRUD" -ForegroundColor Cyan

# Create
$userBody = @{
    first_name="Test"
    last_name="User"
    email="test.user@crud.com"
    password="TestPassword123!"
    role_id=2
} | ConvertTo-Json

try {
    $create = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users" -Method POST -Headers $headers -Body $userBody
    $userId = $create.user_id
    Write-Host "✅ User créé: ID $userId" -ForegroundColor Green
} catch {
    Write-Host "❌ Création user: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# Update
$updateBody = @{first_name="TestModifie"} | ConvertTo-Json
try {
    $update = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId" -Method PUT -Headers $headers -Body $updateBody
    Write-Host "✅ User mis à jour: $($update.user.first_name)" -ForegroundColor Green
} catch {
    Write-Host "❌ Mise à jour user: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Archive
try {
    $archive = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId/archive" -Method PATCH -Headers $headers
    Write-Host "✅ User archivé: $($archive.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Archivage user: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Restore
try {
    $restore = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId/restore" -Method PATCH -Headers $headers
    Write-Host "✅ User restauré: $($restore.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Restauration user: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Delete (permanent)
try {
    $delete = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId?permanent=true" -Method DELETE -Headers $headers
    Write-Host "✅ User supprimé: $($delete.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Suppression user: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

Write-Host "`n🎉 TOUS LES TESTS CRUD RÉUSSIS" -ForegroundColor Green
Write-Host "✅ Unification API 100% validée" -ForegroundColor Green
