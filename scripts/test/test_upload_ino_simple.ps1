# Script de test simple - Upload et édition fichier .ino
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "Test Upload et Edition Fichier .ino" -ForegroundColor Cyan

# 1. Connexion
Write-Host "`n[1] Connexion..." -ForegroundColor Yellow
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
$loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -ContentType "application/json" -Body $loginBody
$token = $loginResponse.token
Write-Host "[OK] Connecte" -ForegroundColor Green

# 2. Créer fichier test avec version unique (max 20 chars)
Write-Host "`n[2] Creation fichier test..." -ForegroundColor Yellow
$timestamp = Get-Date -Format 'HHmmss'
$testVersion = "3.99.0-t$timestamp"
$testContent = "#define FIRMWARE_VERSION_STR `"$testVersion`"`nvoid setup(){}`nvoid loop(){}"
$testFile = "$env:TEMP\test_firmware_$timestamp.ino"
$testContent | Out-File -FilePath $testFile -Encoding UTF8
Write-Host "[OK] Fichier cree: $testFile (version: $testVersion)" -ForegroundColor Green

# 3. Upload
Write-Host "`n[3] Upload..." -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer $token" }
$fileContent = [System.IO.File]::ReadAllBytes($testFile)
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"firmware_ino`"; filename=`"$(Split-Path $testFile -Leaf)`"",
    "Content-Type: application/octet-stream",
    "",
    [System.Text.Encoding]::GetEncoding("iso-8859-1").GetString($fileContent),
    "--$boundary--"
)
$body = $bodyLines -join $LF
$bodyBytes = [System.Text.Encoding]::GetEncoding("iso-8859-1").GetBytes($body)
$headers["Content-Type"] = "multipart/form-data; boundary=$boundary"
try {
    $uploadResponse = Invoke-WebRequest -Uri "$API_URL/api.php/firmwares/upload-ino" -Method POST -Headers $headers -Body $bodyBytes -ErrorAction Stop
    $uploadJson = $uploadResponse.Content | ConvertFrom-Json
    $firmwareId = $uploadJson.firmware_id
    Write-Host "[OK] Upload reussi! ID: $firmwareId" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        # Version existe déjà, récupérer l'ID existant
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        $errorJson = $responseBody | ConvertFrom-Json
        $firmwareId = $errorJson.existing_firmware.id
        Write-Host "[INFO] Version existe deja, utilisation firmware ID: $firmwareId" -ForegroundColor Yellow
    } else {
        Write-Host "[ERREUR] Upload echoue: $_" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Reponse serveur: $responseBody" -ForegroundColor Yellow
        }
        exit 1
    }
}

# 4. Récupérer contenu
Write-Host "`n[4] Recuperation contenu..." -ForegroundColor Yellow
$getResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/$firmwareId/ino" -Method GET -Headers $headers
$content = $getResponse.content
Write-Host "[OK] Contenu recupere ($($content.Length) chars)" -ForegroundColor Green

# 5. Modifier et sauvegarder
Write-Host "`n[5] Modification et sauvegarde..." -ForegroundColor Yellow
$modified = $content + "`n// Modifié $(Get-Date)"
$updateBody = @{ content = $modified } | ConvertTo-Json
$updateResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/$firmwareId/ino" -Method PUT -ContentType "application/json" -Headers $headers -Body $updateBody
Write-Host "[OK] Modifie et sauvegarde!" -ForegroundColor Green

# 6. Vérifier
Write-Host "`n[6] Verification..." -ForegroundColor Yellow
$verifyResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/$firmwareId/ino" -Method GET -Headers $headers
Write-Host "Contenu recupere: $($verifyResponse.content.Length) chars" -ForegroundColor Gray
Write-Host "Dernieres lignes:" -ForegroundColor Gray
$verifyResponse.content.Split("`n")[-3..-1] | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
if ($verifyResponse.content -match "Modifie") {
    Write-Host "[OK] Modification confirmee!" -ForegroundColor Green
} else {
    Write-Host "[WARN] Modification non trouvee dans le contenu" -ForegroundColor Yellow
    Write-Host "Recherche 'Modifie' dans: $($verifyResponse.content.Substring([Math]::Max(0, $verifyResponse.content.Length - 100)))" -ForegroundColor DarkGray
}

Write-Host "`nTest termine! Firmware ID: $firmwareId" -ForegroundColor Cyan

