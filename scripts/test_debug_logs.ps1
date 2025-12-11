# Script pour tester les logs de diagnostic
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$FirmwareId = 77
)

Write-Host "[TEST] Diagnostic compilation firmware" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Authentification
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -TimeoutSec 30 `
        -ErrorAction Stop

    if (-not $loginResponse.success -or -not $loginResponse.token) {
        Write-Host "[ERREUR] Echec de la connexion" -ForegroundColor Red
        exit 1
    }

    $token = $loginResponse.token
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    Write-Host "[OK] Connexion reussie" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERREUR] Erreur lors de la connexion: $_" -ForegroundColor Red
    exit 1
}

# Récupérer les logs de diagnostic
Write-Host "[INFO] Recuperation des logs de diagnostic pour firmware ID $FirmwareId..." -ForegroundColor Yellow
try {
    $debugResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares/debug-logs/$FirmwareId" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30 `
        -ErrorAction Stop

    if ($debugResponse.success) {
        Write-Host "[OK] Logs de diagnostic recuperes" -ForegroundColor Green
        Write-Host ""
        Write-Host "=== INFORMATIONS FIRMWARE ===" -ForegroundColor Cyan
        Write-Host "ID: $($debugResponse.debug.firmware.id)" -ForegroundColor Gray
        Write-Host "Version: $($debugResponse.debug.firmware.version)" -ForegroundColor Gray
        Write-Host "Status: $($debugResponse.debug.firmware.status)" -ForegroundColor Gray
        if ($debugResponse.debug.firmware.error_message) {
            Write-Host "Erreur: $($debugResponse.debug.firmware.error_message)" -ForegroundColor Red
        }
        Write-Host ""
        
        Write-Host "=== ARDUINO-CLI ===" -ForegroundColor Cyan
        if ($debugResponse.debug.arduino_cli.found) {
            Write-Host "Trouve: OUI" -ForegroundColor Green
            Write-Host "Chemin: $($debugResponse.debug.arduino_cli.path)" -ForegroundColor Gray
            Write-Host "Executable: $($debugResponse.debug.arduino_cli.executable)" -ForegroundColor Gray
            Write-Host "Lisible: $($debugResponse.debug.arduino_cli.readable)" -ForegroundColor Gray
            if ($debugResponse.debug.arduino_cli.version) {
                Write-Host "Version: $($debugResponse.debug.arduino_cli.version)" -ForegroundColor Gray
            }
        } else {
            Write-Host "Trouve: NON" -ForegroundColor Red
            Write-Host "   arduino-cli n'est pas disponible" -ForegroundColor Yellow
        }
        Write-Host ""
        
        Write-Host "=== FICHIER FIRMWARE ===" -ForegroundColor Cyan
        if ($debugResponse.debug.firmware_file) {
            Write-Host "File path: $($debugResponse.debug.firmware_file.file_path)" -ForegroundColor Gray
            Write-Host "Has ino_content (DB): $($debugResponse.debug.firmware_file.has_ino_content)" -ForegroundColor Gray
            Write-Host "Taille ino_content: $($debugResponse.debug.firmware_file.ino_content_size) bytes" -ForegroundColor Gray
            if ($debugResponse.debug.firmware_file.disk_path) {
                Write-Host "Chemin disque: $($debugResponse.debug.firmware_file.disk_path)" -ForegroundColor Gray
                Write-Host "Existe sur disque: $($debugResponse.debug.firmware_file.exists)" -ForegroundColor $(if($debugResponse.debug.firmware_file.exists){"Green"}else{"Red"})
                if ($debugResponse.debug.firmware_file.exists) {
                    Write-Host "Lisible: $($debugResponse.debug.firmware_file.readable)" -ForegroundColor Gray
                    Write-Host "Taille: $($debugResponse.debug.firmware_file.size) bytes" -ForegroundColor Gray
                }
            }
        }
        Write-Host ""
        
        Write-Host "=== SYSTEME ===" -ForegroundColor Cyan
        Write-Host "PHP: $($debugResponse.debug.system.php_version)" -ForegroundColor Gray
        Write-Host "OS: $($debugResponse.debug.system.os)" -ForegroundColor Gray
        Write-Host "Root dir: $($debugResponse.debug.environment.root_dir)" -ForegroundColor Gray
        Write-Host "Temp dir: $($debugResponse.debug.environment.temp_dir)" -ForegroundColor Gray
        Write-Host ""
        
    } else {
        Write-Host "[ERREUR] Echec de la recuperation des logs" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERREUR] Erreur lors de la recuperation des logs: $_" -ForegroundColor Red
    Write-Host "   Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Gray
}

