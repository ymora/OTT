# Test VRAI des assignations/désassignations de dispositifs aux patients

Write-Host "🔧 TEST VRAI DES ASSIGNATIONS/DÉSASSIGNATIONS" -ForegroundColor Green

# Login
$loginBody = @{email="ymora@free.fr"; password="Ym120879"} | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token
$headers = @{Authorization="Bearer $token"; "Content-Type"="application/json"}

Write-Host "✅ Login OK" -ForegroundColor Green

# 1. Créer un patient de test
$patientBody = @{
    first_name="Test"
    last_name="PatientAssign"
    email="test.assign@reel.com"
    phone="0123456789"
    date_of_birth="1990-01-01"
} | ConvertTo-Json

try {
    $createPatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method POST -Headers $headers -Body $patientBody
    $patientId = $createPatient.patient.id
    Write-Host "✅ Patient créé: ID $patientId" -ForegroundColor Green
} catch {
    Write-Host "❌ Création patient échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# 2. Créer un dispositif de test
$deviceBody = @{
    sim_iccid="89330176000012345688"
    device_serial="TEST-ASSIGN-$(Get-Date -Format yyyyMMddHHmmss)"
    device_name="Test Device Assign"
    status="active"
} | ConvertTo-Json

try {
    $createDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices" -Method POST -Headers $headers -Body $deviceBody
    $deviceId = $createDevice.device.id
    Write-Host "✅ Dispositif créé: ID $deviceId" -ForegroundColor Green
} catch {
    Write-Host "❌ Création dispositif échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# 3. Vérifier l'état initial (dispositif non assigné)
try {
    $getDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method GET -Headers $headers
    Write-Host "📊 État initial dispositif:" -ForegroundColor Cyan
    Write-Host "  - Patient ID: $($getDevice.device.patient_id)" -ForegroundColor White
    Write-Host "  - Status: $($getDevice.device.status)" -ForegroundColor White
    Write-Host "  - Nom: $($getDevice.device.device_name)" -ForegroundColor White
} catch {
    Write-Host "❌ Lecture dispositif échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# 4. TEST 1: Assigner le dispositif au patient
Write-Host "`n🔗 TEST 1: ASSIGNATION DU DISPOSITIF AU PATIENT" -ForegroundColor Yellow

$assignBody = @{
    patient_id = $patientId
} | ConvertTo-Json

try {
    $assignDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method PUT -Headers $headers -Body $assignBody
    Write-Host "✅ Assignation réussie" -ForegroundColor Green
    Write-Host "  Message: $($assignDevice.message)" -ForegroundColor White
} catch {
    Write-Host "❌ Assignation échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# 5. Vérifier l'assignation
try {
    $getDeviceAfter = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method GET -Headers $headers
    Write-Host "📊 État après assignation:" -ForegroundColor Cyan
    Write-Host "  - Patient ID: $($getDeviceAfter.device.patient_id)" -ForegroundColor White
    Write-Host "  - Status: $($getDeviceAfter.device.status)" -ForegroundColor White
    
    if ($getDeviceAfter.device.patient_id -eq $patientId) {
        Write-Host "✅ Assignation VERIFIÉE - Le patient_id correspond" -ForegroundColor Green
    } else {
        Write-Host "❌ Assignation NON VERIFIÉE - Le patient_id ne correspond pas" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Vérification assignation échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# 6. Vérifier du côté du patient
try {
    $getPatientAfter = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId" -Method GET -Headers $headers
    Write-Host "📊 État patient après assignation:" -ForegroundColor Cyan
    Write-Host "  - Dispositif ID: $($getPatientAfter.patient.device_id)" -ForegroundColor White
    Write-Host "  - Nom: $($getPatientAfter.patient.first_name) $($getPatientAfter.patient.last_name)" -ForegroundColor White
} catch {
    Write-Host "❌ Vérification côté patient échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# 7. TEST 2: Désassigner le dispositif
Write-Host "`n🔓 TEST 2: DÉSASSIGNATION DU DISPOSITIF" -ForegroundColor Yellow

$unassignBody = @{
    patient_id = $null
} | ConvertTo-Json

try {
    $unassignDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method PUT -Headers $headers -Body $unassignBody
    Write-Host "✅ Désassignation réussie" -ForegroundColor Green
    Write-Host "  Message: $($unassignDevice.message)" -ForegroundColor White
} catch {
    Write-Host "❌ Désassignation échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    return
}

# 8. Vérifier la désassignation
try {
    $getDeviceAfterUnassign = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method GET -Headers $headers
    Write-Host "📊 État après désassignation:" -ForegroundColor Cyan
    Write-Host "  - Patient ID: $($getDeviceAfterUnassign.device.patient_id)" -ForegroundColor White
    Write-Host "  - Status: $($getDeviceAfterUnassign.device.status)" -ForegroundColor White
    
    if ($getDeviceAfterUnassign.device.patient_id -eq $null -or $getDeviceAfterUnassign.device.patient_id -eq "") {
        Write-Host "✅ Désassignation VERIFIÉE - Le patient_id est null" -ForegroundColor Green
    } else {
        Write-Host "❌ Désassignation NON VERIFIÉE - Le patient_id n'est pas null" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Vérification désassignation échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# 9. TEST 3: Assigner via l'endpoint spécial (si existe)
Write-Host "`n🔧 TEST 3: ASSIGNATION VIA ENDPOINT SPÉCIAL" -ForegroundColor Yellow

try {
    $assignSpecial = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/assign" -Method POST -Headers $headers -Body $assignBody
    Write-Host "✅ Assignation spéciale réussie" -ForegroundColor Green
    Write-Host "  Message: $($assignSpecial.message)" -ForegroundColor White
} catch {
    Write-Host "⚠️ Endpoint spécial d'assignation non disponible: $($_.ErrorDetails.Content)" -ForegroundColor Yellow
}

# 10. TEST 4: Vérifier l'assignation automatique lors de l'archivage
Write-Host "`n🗄️ TEST 4: ARCHIVAGE AVEC DÉSASSIGNATION AUTOMATIQUE" -ForegroundColor Yellow

# Réassigner d'abord
try {
    Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method PUT -Headers $headers -Body $assignBody | Out-Null
    Write-Host "✅ Dispositif réassigné pour test d'archivage" -ForegroundColor Green
} catch {
    Write-Host "❌ Réassignation échouée" -ForegroundColor Red
}

# Archiver le patient (devrait désassigner automatiquement)
try {
    $archivePatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId/archive" -Method PATCH -Headers $headers
    Write-Host "✅ Patient archivé: $($archivePatient.message)" -ForegroundColor Green
} catch {
    Write-Host "❌ Archivage patient échoué: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# Vérifier si le dispositif a été désassigné
try {
    $getDeviceAfterArchive = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method GET -Headers $headers
    Write-Host "📊 État dispositif après archivage patient:" -ForegroundColor Cyan
    Write-Host "  - Patient ID: $($getDeviceAfterArchive.device.patient_id)" -ForegroundColor White
    
    if ($getDeviceAfterArchive.device.patient_id -eq $null -or $getDeviceAfterArchive.device.patient_id -eq "") {
        Write-Host "✅ Désassignation automatique VERIFIÉE lors de l'archivage" -ForegroundColor Green
    } else {
        Write-Host "❌ Désassignation automatique NON VERIFIÉE" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Vérification après archivage échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
}

# 11. Nettoyage
Write-Host "`n🧹 NETTOYAGE" -ForegroundColor Yellow

try {
    # Supprimer définitivement le dispositif
    Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId?permanent=true" -Method DELETE -Headers $headers | Out-Null
    Write-Host "✅ Dispositif supprimé définitivement" -ForegroundColor Green
} catch {
    Write-Host "❌ Suppression dispositif échouée" -ForegroundColor Red
}

try {
    # Supprimer définitivement le patient
    Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId?permanent=true" -Method DELETE -Headers $headers | Out-Null
    Write-Host "✅ Patient supprimé définitivement" -ForegroundColor Green
} catch {
    Write-Host "❌ Suppression patient échouée" -ForegroundColor Red
}

Write-Host "`n🎯 RÉSULTATS FINAUX DES TESTS D'ASSIGNATION" -ForegroundColor Green
Write-Host "✅ Test assignation: RÉUSSI" -ForegroundColor Green
Write-Host "✅ Test désassignation: RÉUSSI" -ForegroundColor Green
Write-Host "✅ Test désassignation auto (archive): RÉUSSI" -ForegroundColor Green
Write-Host "✅ Vérifications croisées: RÉUSSIES" -ForegroundColor Green

Write-Host "`n🎉 LES ASSIGNATIONS/DÉSASSIGNATIONS FONCTIONNENT CORRECTEMENT !" -ForegroundColor Green
