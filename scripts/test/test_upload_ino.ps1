# ================================================================================
# Script de test - Upload et édition fichier .ino
# ================================================================================
# Teste l'upload d'un fichier .ino et sa récupération/édition via l'API
# ================================================================================

param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [string]$InoFile = ""
)

Write-Host "🧪 Test Upload et Édition Fichier .ino" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Étape 1: Connexion pour obtenir le token
Write-Host "📝 Étape 1: Connexion..." -ForegroundColor Yellow
$loginBody = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody `
        -ErrorAction Stop

    if (-not $loginResponse.success) {
        Write-Host "❌ Erreur de connexion: $($loginResponse.error)" -ForegroundColor Red
        exit 1
    }

    $token = $loginResponse.token
    Write-Host "✅ Connexion réussie" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Erreur lors de la connexion: $_" -ForegroundColor Red
    exit 1
}

# Étape 2: Créer un fichier .ino de test si non fourni
if ([string]::IsNullOrEmpty($InoFile) -or -not (Test-Path $InoFile)) {
    Write-Host "📝 Étape 2: Création fichier .ino de test..." -ForegroundColor Yellow
    
    $testInoContent = "// Test Firmware OTT`n// Version de test pour upload`n`n#define FIRMWARE_VERSION_STR `"3.99.0-test`"`n`nvoid setup() {`n    Serial.begin(115200);`n    Serial.println(`"OTT Firmware Test`");`n}`n`nvoid loop() {`n    delay(1000);`n    Serial.println(`"Test loop`");`n}"

    $testInoPath = "$PSScriptRoot\test_firmware_$(Get-Date -Format 'yyyyMMdd_HHmmss').ino"
    $testInoContent | Out-File -FilePath $testInoPath -Encoding UTF8
    $InoFile = $testInoPath
    Write-Host "✅ Fichier de test créé: $InoFile" -ForegroundColor Green
    Write-Host ""
}

# Étape 3: Upload du fichier .ino
Write-Host "📤 Étape 3: Upload du fichier .ino..." -ForegroundColor Yellow
Write-Host "   Fichier: $InoFile" -ForegroundColor Gray

try {
    # Utiliser Invoke-WebRequest avec -InFile pour l'upload multipart
    $fileName = [System.IO.Path]::GetFileName($InoFile)
    
    $form = @{
        firmware_ino = Get-Item -Path $InoFile
    }
    
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    # Utiliser Invoke-WebRequest pour l'upload multipart (gère automatiquement le multipart/form-data)
    $uploadResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/upload-ino" `
        -Method POST `
        -Headers $headers `
        -Form $form `
        -ErrorAction Stop
    
    if (-not $uploadResponse.success) {
        Write-Host "❌ Erreur lors de l'upload: $($uploadResponse.error)" -ForegroundColor Red
        if ($uploadResponse.existing_firmware) {
            Write-Host "   Version existe déjà: v$($uploadResponse.existing_firmware.version)" -ForegroundColor Yellow
        }
        exit 1
    }
    
    $firmwareId = $uploadResponse.firmware_id
    $version = $uploadResponse.version
    Write-Host "✅ Upload réussi!" -ForegroundColor Green
    Write-Host "   Firmware ID: $firmwareId" -ForegroundColor Gray
    Write-Host "   Version: v$version" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Erreur lors de l'upload: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Réponse serveur: $responseBody" -ForegroundColor Yellow
    }
    exit 1
}

# Étape 4: Récupérer la liste des firmwares
Write-Host "📋 Étape 4: Récupération liste des firmwares..." -ForegroundColor Yellow

try {
    $firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
        -Method GET `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -ErrorAction Stop
    
    if (-not $firmwaresResponse.success) {
        Write-Host "❌ Erreur lors de la récupération: $($firmwaresResponse.error)" -ForegroundColor Red
        exit 1
    }
    
    $firmware = $firmwaresResponse.firmwares.firmwares | Where-Object { $_.id -eq $firmwareId } | Select-Object -First 1
    
    if (-not $firmware) {
        Write-Host "⚠️ Firmware $firmwareId non trouvé dans la liste" -ForegroundColor Yellow
    } else {
        Write-Host "✅ Firmware trouvé dans la liste" -ForegroundColor Green
        Write-Host "   Version: v$($firmware.version)" -ForegroundColor Gray
        Write-Host "   Statut: $($firmware.status)" -ForegroundColor Gray
        Write-Host ""
    }
} catch {
    Write-Host "❌ Erreur lors de la récupération: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Réponse serveur: $responseBody" -ForegroundColor Yellow
    }
}

# Étape 5: Récupérer le contenu .ino pour édition
Write-Host "📖 Étape 5: Récupération contenu .ino pour édition..." -ForegroundColor Yellow

try {
    $getInoResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/$firmwareId/ino" `
        -Method GET `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -ErrorAction Stop
    
    if (-not $getInoResponse.success) {
        Write-Host "❌ Erreur lors de la récupération: $($getInoResponse.error)" -ForegroundColor Red
        exit 1
    }
    
    $inoContent = $getInoResponse.content
    Write-Host "✅ Contenu .ino récupéré" -ForegroundColor Green
    Write-Host "   Taille: $($inoContent.Length) caractères" -ForegroundColor Gray
    Write-Host "   Premières lignes:" -ForegroundColor Gray
    $inoContent.Split("`n")[0..4] | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
    Write-Host ""
} catch {
    Write-Host "❌ Erreur lors de la récupération: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Réponse serveur: $responseBody" -ForegroundColor Yellow
    }
    exit 1
}

# Étape 6: Modifier le contenu et le mettre à jour
Write-Host "✏️ Étape 6: Modification et mise à jour du contenu .ino..." -ForegroundColor Yellow

try {
    # Ajouter un commentaire à la fin
    $modifiedContent = $inoContent + "`n`n// Modifié via script de test - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    
    $updateBody = @{
        content = $modifiedContent
    } | ConvertTo-Json
    
    $updateResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/$firmwareId/ino" `
        -Method PUT `
        -ContentType "application/json" `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -Body $updateBody `
        -ErrorAction Stop
    
    if (-not $updateResponse.success) {
        Write-Host "❌ Erreur lors de la mise à jour: $($updateResponse.error)" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Contenu .ino mis à jour avec succès!" -ForegroundColor Green
    Write-Host "   Version: v$($updateResponse.version)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Erreur lors de la mise à jour: $_" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Réponse serveur: $responseBody" -ForegroundColor Yellow
    }
    exit 1
}

# Étape 7: Vérifier que la modification a été sauvegardée
Write-Host "🔍 Étape 7: Vérification que la modification a été sauvegardée..." -ForegroundColor Yellow

try {
    $verifyResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/$firmwareId/ino" `
        -Method GET `
        -Headers @{ "Authorization" = "Bearer $token" } `
        -ErrorAction Stop
    
    if ($verifyResponse.content -match "Modifié via script de test") {
        Write-Host "✅ Modification confirmée!" -ForegroundColor Green
        Write-Host "   Le contenu modifié est bien présent dans la base de données" -ForegroundColor Gray
    } else {
        Write-Host "⚠️ La modification n'a pas été trouvée dans le contenu récupéré" -ForegroundColor Yellow
    }
    Write-Host ""
} catch {
    Write-Host "❌ Erreur lors de la vérification: $_" -ForegroundColor Red
}

# Résumé
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Test terminé avec succès!" -ForegroundColor Green
Write-Host "   Firmware ID: $firmwareId" -ForegroundColor Gray
Write-Host "   Version: v$version" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Vous pouvez maintenant tester l'édition via l'interface web" -ForegroundColor Cyan

