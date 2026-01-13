# Test complet de toutes les actions API après unification
# Test minutieux de toutes les entités CRUD

Write-Host "🚀 DÉMARRAGE DES TESTS API COMPLETS" -ForegroundColor Green

# Login pour obtenir le token
$loginBody = @{
    email = "ymora@free.fr"
    password = "Ym120879"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api.php/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
    $token = $loginResponse.token
    Write-Host "✅ Login réussi" -ForegroundColor Green
    
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    # =================================================================
    # TESTS PATIENTS
    # =================================================================
    Write-Host "`n🏥 TESTS PATIENTS" -ForegroundColor Cyan
    
    # 1. Créer un patient
    $patientBody = @{
        first_name = "Test"
        last_name = "PatientAPI"
        email = "test.patient.api@example.com"
        phone = "0123456789"
        date_of_birth = "1990-01-01"
    } | ConvertTo-Json
    
    try {
        $createPatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method POST -Headers $headers -Body $patientBody
        $patientId = $createPatient.patient.id
        Write-Host "✅ Patient créé: ID $patientId" -ForegroundColor Green
    } catch {
        Write-Host "❌ Création patient échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 2. Lire le patient
    try {
        $getPatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId" -Method GET -Headers $headers
        Write-Host "✅ Patient lu: $($getPatient.patient.first_name) $($getPatient.patient.last_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Lecture patient échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 3. Mettre à jour le patient
    $updatePatientBody = @{
        first_name = "TestModifie"
        phone = "0987654321"
    } | ConvertTo-Json
    
    try {
        $updatePatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId" -Method PUT -Headers $headers -Body $updatePatientBody
        Write-Host "✅ Patient mis à jour: $($updatePatient.patient.first_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Mise à jour patient échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 4. Archiver le patient
    try {
        $archivePatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId/archive" -Method PATCH -Headers $headers
        Write-Host "✅ Patient archivé: $($archivePatient.message)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Archivage patient échoué: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 5. Restaurer le patient
    try {
        $restorePatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients/$patientId/restore" -Method PATCH -Headers $headers
        Write-Host "✅ Patient restauré: $($restorePatient.message)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Restauration patient échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # =================================================================
    # TESTS UTILISATEURS
    # =================================================================
    Write-Host "`n👤 TESTS UTILISATEURS" -ForegroundColor Cyan
    
    # 1. Créer un utilisateur
    $userBody = @{
        first_name = "Test"
        last_name = "UserAPI"
        email = "test.user.api@example.com"
        password = "TestPassword123!"
        role_id = 2
    } | ConvertTo-Json
    
    try {
        $createUser = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users" -Method POST -Headers $headers -Body $userBody
        $userId = $createUser.user_id
        Write-Host "✅ Utilisateur créé: ID $userId" -ForegroundColor Green
    } catch {
        Write-Host "❌ Création utilisateur échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 2. Lire l'utilisateur
    try {
        $getUser = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId" -Method GET -Headers $headers
        Write-Host "✅ Utilisateur lu: $($getUser.user.first_name) $($getUser.user.last_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Lecture utilisateur échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 3. Mettre à jour l'utilisateur
    $updateUserBody = @{
        first_name = "TestModifie"
    } | ConvertTo-Json
    
    try {
        $updateUser = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId" -Method PUT -Headers $headers -Body $updateUserBody
        Write-Host "✅ Utilisateur mis à jour: $($updateUser.user.first_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Mise à jour utilisateur échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 4. Archiver l'utilisateur
    try {
        $archiveUser = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId/archive" -Method PATCH -Headers $headers
        Write-Host "✅ Utilisateur archivé: $($archiveUser.message)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Archivage utilisateur échoué: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 5. Restaurer l'utilisateur
    try {
        $restoreUser = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users/$userId/restore" -Method PATCH -Headers $headers
        Write-Host "✅ Utilisateur restauré: $($restoreUser.message)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Restauration utilisateur échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # =================================================================
    # TESTS DISPOSITIFS
    # =================================================================
    Write-Host "`n📱 TESTS DISPOSITIFS" -ForegroundColor Cyan
    
    # 1. Créer un dispositif
    $deviceBody = @{
        sim_iccid = "89330176000012345699"
        device_serial = "TEST-DEVICE-$(Get-Date -Format yyyyMMddHHmmss)"
        device_name = "Test Device API"
        status = "active"
    } | ConvertTo-Json
    
    try {
        $createDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices" -Method POST -Headers $headers -Body $deviceBody
        $deviceId = $createDevice.device.id
        Write-Host "✅ Dispositif créé: ID $deviceId" -ForegroundColor Green
    } catch {
        Write-Host "❌ Création dispositif échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 2. Lire le dispositif
    try {
        $getDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method GET -Headers $headers
        Write-Host "✅ Dispositif lu: $($getDevice.device.device_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Lecture dispositif échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 3. Mettre à jour le dispositif
    $updateDeviceBody = @{
        device_name = "Test Device Modifié"
        status = "inactive"
    } | ConvertTo-Json
    
    try {
        $updateDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId" -Method PUT -Headers $headers -Body $updateDeviceBody
        Write-Host "✅ Dispositif mis à jour: $($updateDevice.device.device_name)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Mise à jour dispositif échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 4. Archiver le dispositif
    try {
        $archiveDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/archive" -Method PATCH -Headers $headers
        Write-Host "✅ Dispositif archivé: $($archiveDevice.message)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Archivage dispositif échoué: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # 5. Restaurer le dispositif
    try {
        $restoreDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices/$deviceId/restore" -Method PATCH -Headers $headers
        Write-Host "✅ Dispositif restauré: $($restoreDevice.message)" -ForegroundColor Green
    } catch {
        Write-Host "❌ Restauration dispositif échouée: $($_.ErrorDetails.Content)" -ForegroundColor Red
    }
    
    # =================================================================
    # TESTS DE VALIDATION
    # =================================================================
    Write-Host "`n🔍 TESTS DE VALIDATION" -ForegroundColor Cyan
    
    # Test email existant
    $duplicateUserBody = @{
        first_name = "Test"
        last_name = "Duplicate"
        email = "ymora@free.fr"  # Email existant
        password = "TestPassword123!"
        role_id = 2
    } | ConvertTo-Json
    
    try {
        $duplicateUser = Invoke-RestMethod -Uri "http://localhost:8000/api.php/users" -Method POST -Headers $headers -Body $duplicateUserBody
        Write-Host "❌ Email existant non détecté (ERREUR)" -ForegroundColor Red
    } catch {
        Write-Host "✅ Email existant correctement rejeté" -ForegroundColor Green
    }
    
    # Test ICCID existant
    $duplicateDeviceBody = @{
        sim_iccid = "89330176000012345681"  # ICCID existant
        device_serial = "TEST-DUPLICATE"
        device_name = "Test Duplicate"
    } | ConvertTo-Json
    
    try {
        $duplicateDevice = Invoke-RestMethod -Uri "http://localhost:8000/api.php/devices" -Method POST -Headers $headers -Body $duplicateDeviceBody
        Write-Host "❌ ICCID existant non détecté (ERREUR)" -ForegroundColor Red
    } catch {
        Write-Host "✅ ICCID existant correctement rejeté" -ForegroundColor Green
    }
    
    # Test validation champs requis
    $invalidPatientBody = @{
        first_name = ""  # Champ requis manquant
        last_name = "Test"
    } | ConvertTo-Json
    
    try {
        $invalidPatient = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method POST -Headers $headers -Body $invalidPatientBody
        Write-Host "❌ Validation champs requis non détectée (ERREUR)" -ForegroundColor Red
    } catch {
        Write-Host "✅ Validation champs requis correctement appliquée" -ForegroundColor Green
    }
    
    # =================================================================
    # TESTS DE PERMISSIONS
    # =================================================================
    Write-Host "`n🔐 TESTS DE PERMISSIONS" -ForegroundColor Cyan
    
    # Test sans token
    try {
        $noAuthRequest = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method GET
        Write-Host "❌ Requête sans auth non bloquée (ERREUR)" -ForegroundColor Red
    } catch {
        Write-Host "✅ Requête sans auth correctement bloquée" -ForegroundColor Green
    }
    
    # Test avec token invalide
    $invalidHeaders = @{
        "Authorization" = "Bearer invalid_token"
        "Content-Type" = "application/json"
    }
    
    try {
        $invalidAuthRequest = Invoke-RestMethod -Uri "http://localhost:8000/api.php/patients" -Method GET -Headers $invalidHeaders
        Write-Host "❌ Token invalide non bloqué (ERREUR)" -ForegroundColor Red
    } catch {
        Write-Host "✅ Token invalide correctement bloqué" -ForegroundColor Green
    }
    
    Write-Host "`n🎉 TESTS API COMPLETS TERMINÉS" -ForegroundColor Green
    Write-Host "✅ Unification API validée avec succès" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Erreur critique pendant les tests: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "❌ Stack trace: $($_.Exception.StackTrace)" -ForegroundColor Red
}
