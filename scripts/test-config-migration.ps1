# Script de test pour vérifier la migration de configuration
# Vérifie que tous les paramètres sont sauvegardés et rechargés correctement

param(
    [string]$API_URL = "http://localhost:3000",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST MIGRATION CONFIGURATION DISPOSITIF" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Connexion et récupération du token
Write-Host "[1/5] Connexion à l'API..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -ContentType "application/json" -Body (@{
        email = $Email
        password = $Password
    } | ConvertTo-Json) -ErrorAction Stop
    
    $token = $loginResponse.token
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    Write-Host "  ✅ Connexion réussie" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur connexion: $_" -ForegroundColor Red
    exit 1
}

# 2. Récupérer un dispositif pour tester
Write-Host ""
Write-Host "[2/5] Récupération d'un dispositif..." -ForegroundColor Yellow
try {
    $devicesResponse = Invoke-RestMethod -Uri "$API_URL/api.php/devices" -Method GET -Headers $headers -ErrorAction Stop
    $devices = $devicesResponse.devices
    
    if ($devices.Count -eq 0) {
        Write-Host "  ⚠️  Aucun dispositif trouvé - création d'un dispositif de test..." -ForegroundColor Yellow
        
        # Créer un dispositif de test
        $testDevice = @{
            device_name = "TEST-CONFIG-$(Get-Date -Format 'yyyyMMddHHmmss')"
            sim_iccid = "89330123456789012345"
            device_serial = "OTT-TEST-001"
            status = "inactive"
        }
        
        $createResponse = Invoke-RestMethod -Uri "$API_URL/api.php/devices" -Method POST -Headers $headers -Body ($testDevice | ConvertTo-Json) -ErrorAction Stop
        $deviceId = $createResponse.device.id
        Write-Host "  ✅ Dispositif de test créé (ID: $deviceId)" -ForegroundColor Green
    } else {
        $deviceId = $devices[0].id
        Write-Host "  ✅ Dispositif trouvé (ID: $deviceId, Nom: $($devices[0].device_name))" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ Erreur récupération dispositif: $_" -ForegroundColor Red
    exit 1
}

# 3. Vérifier la structure de la table (via GET config)
Write-Host ""
Write-Host "[3/5] Vérification structure table (GET config)..." -ForegroundColor Yellow
try {
    $getConfigResponse = Invoke-RestMethod -Uri "$API_URL/api.php/devices/$deviceId/config" -Method GET -Headers $headers -ErrorAction Stop
    $config = $getConfigResponse.config
    
    Write-Host "  ✅ Configuration récupérée" -ForegroundColor Green
    
    # Liste des champs attendus
    $expectedFields = @(
        'sleep_minutes',
        'measurement_duration_ms',
        'send_every_n_wakeups',
        'calibration_coefficients',
        'gps_enabled',
        'airflow_passes',
        'airflow_samples_per_pass',
        'airflow_delay_ms',
        'watchdog_seconds',
        'modem_boot_timeout_ms',
        'sim_ready_timeout_ms',
        'network_attach_timeout_ms',
        'modem_max_reboots',
        'apn',
        'sim_pin',
        'ota_primary_url',
        'ota_fallback_url',
        'ota_md5'
    )
    
    Write-Host ""
    Write-Host "  Champs présents dans la réponse:" -ForegroundColor Cyan
    $missingFields = @()
    foreach ($field in $expectedFields) {
        if ($config.PSObject.Properties.Name -contains $field) {
            $value = $config.$field
            if ($null -eq $value -or $value -eq '') {
                Write-Host "    ✅ $field : NULL/vide (OK)" -ForegroundColor Gray
            } else {
                Write-Host "    ✅ $field : $value" -ForegroundColor Green
            }
        } else {
            Write-Host "    ❌ $field : MANQUANT" -ForegroundColor Red
            $missingFields += $field
        }
    }
    
    if ($missingFields.Count -gt 0) {
        Write-Host ""
        Write-Host "  ❌ $($missingFields.Count) champ(s) manquant(s): $($missingFields -join ', ')" -ForegroundColor Red
    } else {
        Write-Host ""
        Write-Host "  ✅ Tous les champs sont présents dans la réponse" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ Erreur récupération config: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Réponse: $responseBody" -ForegroundColor Red
    }
    exit 1
}

# 4. Tester la sauvegarde de TOUS les paramètres
Write-Host ""
Write-Host "[4/5] Test sauvegarde complète (PUT config)..." -ForegroundColor Yellow
try {
    # Préparer une configuration complète avec tous les paramètres
    $testConfig = @{
        sleep_minutes = 30
        measurement_duration_ms = 5000
        send_every_n_wakeups = 2
        calibration_coefficients = @(0.1, 1.2, 0.3)
        gps_enabled = $true
        airflow_passes = 3
        airflow_samples_per_pass = 10
        airflow_delay_ms = 100
        watchdog_seconds = 300
        modem_boot_timeout_ms = 30000
        sim_ready_timeout_ms = 10000
        network_attach_timeout_ms = 60000
        modem_max_reboots = 3
        apn = "free"
        sim_pin = "1234"
        ota_primary_url = "https://example.com/ota/primary"
        ota_fallback_url = "https://example.com/ota/fallback"
        ota_md5 = "abc123def456"
    }
    
    Write-Host "  Envoi de la configuration complète..." -ForegroundColor Cyan
    $putResponse = Invoke-RestMethod -Uri "$API_URL/api.php/devices/$deviceId/config" -Method PUT -Headers $headers -Body ($testConfig | ConvertTo-Json) -ErrorAction Stop
    
    if ($putResponse.success) {
        Write-Host "  ✅ Configuration sauvegardée avec succès" -ForegroundColor Green
        if ($putResponse.command_created) {
            Write-Host "  ✅ Commande UPDATE_CONFIG créée pour le firmware" -ForegroundColor Green
        }
    } else {
        Write-Host "  ❌ Erreur lors de la sauvegarde" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ Erreur sauvegarde config: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Réponse: $responseBody" -ForegroundColor Red
    }
    exit 1
}

# 5. Vérifier que les paramètres sont bien rechargés
Write-Host ""
Write-Host "[5/5] Vérification rechargement (GET config après PUT)..." -ForegroundColor Yellow
try {
    # Attendre un peu pour que la BDD soit à jour
    Start-Sleep -Seconds 1
    
    $getConfigResponse2 = Invoke-RestMethod -Uri "$API_URL/api.php/devices/$deviceId/config" -Method GET -Headers $headers -ErrorAction Stop
    $config2 = $getConfigResponse2.config
    
    Write-Host "  ✅ Configuration rechargée" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Vérification des valeurs sauvegardées:" -ForegroundColor Cyan
    
    $errors = @()
    foreach ($key in $testConfig.Keys) {
        $expected = $testConfig[$key]
        $actual = $config2.$key
        
        # Gestion des types spéciaux
        if ($key -eq 'calibration_coefficients') {
            $actualArray = if ($actual -is [array]) { $actual } else { @($actual) }
            $expectedArray = $expected
            $allMatch = $true
            for ($i = 0; $i -lt $actualArray.Count; $i++) {
                if ([Math]::Abs($actualArray[$i] - $expectedArray[$i]) -ge 0.01) {
                    $allMatch = $false
                    break
                }
            }
            $match = ($actualArray.Count -eq $expectedArray.Count) -and $allMatch
            if ($match) {
                Write-Host "    ✅ $key : $($actualArray -join ', ') (OK)" -ForegroundColor Green
            } else {
                Write-Host "    ❌ $key : attendu $($expectedArray -join ', '), obtenu $($actualArray -join ', ')" -ForegroundColor Red
                $errors += $key
            }
        } elseif ($key -eq 'gps_enabled') {
            if ([bool]$actual -eq [bool]$expected) {
                Write-Host "    ✅ $key : $actual (OK)" -ForegroundColor Green
            } else {
                Write-Host "    ❌ $key : attendu $expected, obtenu $actual" -ForegroundColor Red
                $errors += $key
            }
        } else {
            if ($actual -eq $expected) {
                Write-Host "    ✅ $key : $actual (OK)" -ForegroundColor Green
            } else {
                Write-Host "    ❌ $key : attendu $expected, obtenu $actual" -ForegroundColor Red
                $errors += $key
            }
        }
    }
    
    if ($errors.Count -gt 0) {
        Write-Host ""
        Write-Host "  ❌ $($errors.Count) valeur(s) incorrecte(s): $($errors -join ', ')" -ForegroundColor Red
    } else {
        Write-Host ""
        Write-Host "  ✅ Toutes les valeurs sont correctement sauvegardées et rechargées" -ForegroundColor Green
    }
} catch {
    Write-Host "  ❌ Erreur rechargement config: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "  Réponse: $responseBody" -ForegroundColor Red
    }
    exit 1
}

# Résumé final
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RÉSUMÉ DES TESTS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($missingFields.Count -eq 0 -and $errors.Count -eq 0) {
    Write-Host "✅ TOUS LES TESTS SONT PASSÉS" -ForegroundColor Green
    Write-Host ""
    Write-Host "La migration fonctionne correctement :" -ForegroundColor Green
    Write-Host "  - Toutes les colonnes existent en BDD" -ForegroundColor Green
    Write-Host "  - Tous les paramètres sont sauvegardés" -ForegroundColor Green
    Write-Host "  - Tous les paramètres sont rechargés correctement" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ CERTAINS TESTS ONT ÉCHOUÉ" -ForegroundColor Red
    if ($missingFields.Count -gt 0) {
        Write-Host "  - Colonnes manquantes: $($missingFields -join ', ')" -ForegroundColor Red
    }
    if ($errors.Count -gt 0) {
        Write-Host "  - Valeurs incorrectes: $($errors -join ', ')" -ForegroundColor Red
    }
    exit 1
}

