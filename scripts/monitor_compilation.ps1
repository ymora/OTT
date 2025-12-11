# Script de surveillance de compilation
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$FirmwareId = 77
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SURVEILLANCE COMPILATION FIRMWARE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

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
$tokenEncoded = [System.Web.HttpUtility]::UrlEncode($token)
$sseUrl = "${API_URL}/api.php/firmwares/compile/${FirmwareId}?token=${tokenEncoded}"

Write-Host "URL: $sseUrl" -ForegroundColor Gray
Write-Host ""
Write-Host "Connexion en cours..." -ForegroundColor Yellow
Write-Host ""

$request = [System.Net.HttpWebRequest]::Create($sseUrl)
$request.Method = "GET"
$request.Timeout = -1
$request.ReadWriteTimeout = -1

$response = $request.GetResponse()
$stream = $response.GetResponseStream()
$reader = New-Object System.IO.StreamReader($stream)

Write-Host "[OK] Connexion etablie" -ForegroundColor Green
Write-Host ""
Write-Host "=== MESSAGES DE COMPILATION ===" -ForegroundColor Cyan
Write-Host ""

$messageCount = 0
$startTime = Get-Date
$maxWait = 1800 # 30 minutes max
$compilationComplete = $false
$compilationError = $false
$buffer = ""
$lastMessageTime = Get-Date
$maxSilenceTime = 60 # 60 secondes sans message = vérifier le statut
$statusCheckInterval = 5 # Vérifier le statut toutes les 5 secondes si silence

# Fonction pour vérifier le statut du firmware via API
function CheckFirmwareStatus {
    param([string]$Token, [int]$FwId, [string]$ApiUrl)
    
    try {
        $headers = @{
            "Authorization" = "Bearer $Token"
        }
        
        $firmwaresResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/firmwares" `
            -Method GET `
            -Headers $headers `
            -TimeoutSec 30 `
            -ErrorAction Stop
        
        if ($firmwaresResponse -and $firmwaresResponse.firmwares) {
            $firmware = $firmwaresResponse.firmwares | Where-Object { $_.id -eq $FwId } | Select-Object -First 1
            if ($firmware) {
                return $firmware
            }
        }
    } catch {
        Write-Host "[WARNING] Erreur lors de la vérification du statut: $_" -ForegroundColor Yellow
    }
    return $null
}

while (-not $compilationComplete -and -not $compilationError) {
    $elapsed = (Get-Date) - $startTime
    if ($elapsed.TotalSeconds -gt $maxWait) {
        Write-Host ""
        Write-Host "[TIMEOUT] Arret apres $maxWait secondes" -ForegroundColor Yellow
        break
    }
    
    # Vérifier le statut si pas de message depuis plus de maxSilenceTime secondes
    $timeSinceLastMessage = ((Get-Date) - $lastMessageTime).TotalSeconds
    if ($timeSinceLastMessage -gt $maxSilenceTime) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠️ Pas de message depuis plus de $maxSilenceTime secondes. Vérification du statut..." -ForegroundColor Yellow
        $firmwareStatus = CheckFirmwareStatus -Token $token -FwId $FirmwareId -ApiUrl $API_URL
        if ($firmwareStatus) {
            if ($firmwareStatus.status -eq 'compiled') {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✅ Compilation réussie détectée via API !" -ForegroundColor Green
                $compilationComplete = $true
                break
            } elseif ($firmwareStatus.status -eq 'error') {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ❌ Erreur de compilation détectée via API !" -ForegroundColor Red
                if ($firmwareStatus.error_message) {
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Erreur: $($firmwareStatus.error_message)" -ForegroundColor Red
                }
                $compilationError = $true
                break
            } elseif ($firmwareStatus.status -eq 'compiling') {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⏳ Compilation toujours en cours..." -ForegroundColor Cyan
                $lastMessageTime = Get-Date # Réinitialiser pour éviter de spammer
            }
        }
        Start-Sleep -Seconds $statusCheckInterval
    }
    
    # Lire caractère par caractère
    try {
        $char = $reader.Read()
        
        while ($char -ge 0) {
            $charValue = [char]$char
            $buffer += $charValue
            
            # Si on a une ligne complète (fin de ligne)
            if ($charValue -eq "`n") {
                $line = $buffer.Trim()
                $buffer = ""
                
                if ($line -and $line.Length -gt 0) {
                    $messageCount++
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    
                    # Traiter les messages SSE
                    if ($line.StartsWith('data: ')) {
                        $jsonData = $line.Substring(6).Trim()
                        if ($jsonData) {
                            try {
                                $data = $jsonData | ConvertFrom-Json
                                
                                switch ($data.type) {
                                    'log' {
                                        $color = if ($data.level -eq 'error') { 'Red' } elseif ($data.level -eq 'warning') { 'Yellow' } else { 'White' }
                                        Write-Host "[$timestamp] $($data.message)" -ForegroundColor $color
                                        $lastMessageTime = Get-Date # Mettre à jour le timestamp
                                    }
                                    'progress' {
                                        Write-Host "[$timestamp] 📊 Progression: $($data.progress)%" -ForegroundColor Cyan
                                        $lastMessageTime = Get-Date # Mettre à jour le timestamp
                                    }
                                    'success' {
                                        Write-Host "[$timestamp] ✅ SUCCESS: $($data.message)" -ForegroundColor Green
                                        $compilationComplete = $true
                                        $lastMessageTime = Get-Date
                                    }
                                    'error' {
                                        Write-Host "[$timestamp] ❌ ERROR: $($data.message)" -ForegroundColor Red
                                        $compilationError = $true
                                        $lastMessageTime = Get-Date
                                    }
                                }
                            } catch {
                                Write-Host "[$timestamp] [RAW] $line" -ForegroundColor Gray
                            }
                        }
                    } elseif ($line.Trim().StartsWith(':')) {
                        # Keep-alive - ne pas afficher pour éviter le spam
                        if ($messageCount % 50 -eq 0) {
                            Write-Host "[$timestamp] ... (connexion active)" -ForegroundColor DarkGray
                        }
                    }
                }
            }
            
            # Lire le caractère suivant si disponible
            if ($reader.Peek() -ge 0) {
                $char = $reader.Read()
            } else {
                break
            }
        }
    } catch {
        # Erreur de lecture, continuer
    }
    
    # Si pas de données, attendre un peu
    if ($reader.Peek() -lt 0) {
        Start-Sleep -Milliseconds 100
    }
}

# Fermer proprement les ressources
if ($reader) { try { $reader.Close() } catch {} }
if ($stream) { try { $stream.Close() } catch {} }
if ($response) { try { $response.Close() } catch {} }

Write-Host ""
Write-Host "=== VERIFICATION FINALE DU STATUT ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier une dernière fois le statut du firmware pour confirmer
$finalStatus = CheckFirmwareStatus -Token $token -FwId $FirmwareId -ApiUrl $API_URL
if ($finalStatus) {
    Write-Host "Version: $($finalStatus.version)" -ForegroundColor Gray
    Write-Host "Status: $($finalStatus.status)" -ForegroundColor $(if($finalStatus.status -eq 'compiled'){'Green'}elseif($finalStatus.status -eq 'error'){'Red'}else{'Yellow'})
    
    if ($finalStatus.status -eq 'compiled') {
        Write-Host ""
        Write-Host "✅ Détails du firmware compilé:" -ForegroundColor Green
        if ($finalStatus.file_path) {
            Write-Host "   Fichier: $($finalStatus.file_path)" -ForegroundColor Gray
        }
        if ($finalStatus.file_size) {
            $sizeMB = [math]::Round($finalStatus.file_size / 1MB, 2)
            Write-Host "   Taille: $($finalStatus.file_size) bytes ($sizeMB MB)" -ForegroundColor Gray
        }
        if ($finalStatus.checksum) {
            Write-Host "   Checksum SHA256: $($finalStatus.checksum)" -ForegroundColor Gray
        }
        $compilationComplete = $true
    } elseif ($finalStatus.status -eq 'error') {
        Write-Host ""
        Write-Host "❌ Erreur de compilation:" -ForegroundColor Red
        if ($finalStatus.error_message) {
            Write-Host "   $($finalStatus.error_message)" -ForegroundColor Red
        }
        $compilationError = $true
    }
}

Write-Host ""
Write-Host "=== FIN ===" -ForegroundColor Cyan
$duration = (Get-Date) - $startTime
Write-Host "Messages recus: $messageCount" -ForegroundColor Gray
Write-Host "Duree totale: $([int]$duration.TotalSeconds) secondes ($([math]::Round($duration.TotalMinutes, 1)) minutes)" -ForegroundColor Gray

if ($compilationComplete) {
    Write-Host ""
    Write-Host "[SUCCESS] ✅ Compilation terminee avec succes !" -ForegroundColor Green
    exit 0
} elseif ($compilationError) {
    Write-Host ""
    Write-Host "[ERROR] ❌ Compilation echouee" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[WARNING] ⚠️ Compilation interrompue ou timeout" -ForegroundColor Yellow
    exit 1
}

