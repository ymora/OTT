# Vérifier le statut de compilation
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$FirmwareId = 77
)

# Authentification
$loginBody = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
    -Method POST `
    -Body $loginBody `
    -ContentType "application/json" `
    -TimeoutSec 30

$token = $loginResponse.token
$headers = @{
    "Authorization" = "Bearer $token"
}

# Récupérer le statut du firmware
$firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
    -Method GET `
    -Headers $headers `
    -TimeoutSec 30

$firmware = $firmwaresResponse.firmwares | Where-Object { $_.id -eq $FirmwareId } | Select-Object -First 1

if ($firmware) {
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "STATUT COMPILATION FIRMWARE ID $FirmwareId" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Version: $($firmware.version)" -ForegroundColor Gray
    Write-Host "Status: $($firmware.status)" -ForegroundColor $(if($firmware.status -eq 'compiled'){'Green'}elseif($firmware.status -eq 'error'){'Red'}else{'Yellow'})
    
    if ($firmware.error_message) {
        Write-Host "Erreur: $($firmware.error_message)" -ForegroundColor Red
    }
    
    if ($firmware.status -eq 'compiled') {
        Write-Host ""
        Write-Host "✅ COMPILATION REUSSIE !" -ForegroundColor Green
        if ($firmware.file_path) {
            Write-Host "Fichier: $($firmware.file_path)" -ForegroundColor Gray
        }
        if ($firmware.file_size) {
            Write-Host "Taille: $($firmware.file_size) bytes" -ForegroundColor Gray
        }
        if ($firmware.checksum) {
            Write-Host "Checksum: $($firmware.checksum)" -ForegroundColor Gray
        }
    } elseif ($firmware.status -eq 'error') {
        Write-Host ""
        Write-Host "❌ COMPILATION ECHOUE !" -ForegroundColor Red
    } elseif ($firmware.status -eq 'compiling') {
        Write-Host ""
        Write-Host "⏳ COMPILATION EN COURS..." -ForegroundColor Yellow
    }
} else {
    Write-Host "Firmware non trouve" -ForegroundColor Red
}

