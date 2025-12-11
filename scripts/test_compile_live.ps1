# Script de test en live - surveille et corrige en temps reel
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$FirmwareId = 0
)

$ErrorActionPreference = "Continue"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST LIVE DE COMPILATION FIRMWARE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Authentification
Write-Host "[1] Authentification..." -ForegroundColor Yellow
$token = $null
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

    if ($loginResponse.success -and $loginResponse.token) {
        $token = $loginResponse.token
        Write-Host "[OK] Connexion reussie" -ForegroundColor Green
    } else {
        Write-Host "[ERREUR] Echec de la connexion: $($loginResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERREUR] Erreur lors de la connexion: $_" -ForegroundColor Red
    exit 1
}

# 2. Recuperer les firmwares
Write-Host ""
Write-Host "[2] Recuperation des firmwares..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30 `
        -ErrorAction Stop

    $firmwares = $firmwaresResponse.firmwares
    if (-not $firmwares -or $firmwares.Count -eq 0) {
        Write-Host "[ERREUR] Aucun firmware trouve" -ForegroundColor Red
        exit 1
    }

    Write-Host "[OK] Firmwares trouves: $($firmwares.Count)" -ForegroundColor Green
    foreach ($fw in $firmwares) {
        Write-Host "   - ID: $($fw.id), Version: $($fw.version), Status: $($fw.status)" -ForegroundColor Gray
    }

    $selectedFirmware = if ($FirmwareId -gt 0) {
        $firmwares | Where-Object { $_.id -eq $FirmwareId } | Select-Object -First 1
    } else {
        $firmwares[0]
    }

    if (-not $selectedFirmware) {
        Write-Host "[ERREUR] Firmware non trouve" -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host "[OK] Firmware selectionne: ID=$($selectedFirmware.id), Version=$($selectedFirmware.version)" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] Erreur: $_" -ForegroundColor Red
    exit 1
}

# 3. Test SSE en live
Write-Host ""
Write-Host "[3] Test SSE en live..." -ForegroundColor Yellow
$firmwareId = $selectedFirmware.id
$tokenEncoded = [System.Web.HttpUtility]::UrlEncode($token)
$sseUrl = "${API_URL}/api.php/firmwares/compile/${firmwareId}?token=${tokenEncoded}"

Write-Host "   URL: $sseUrl" -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date
$lastMessageTime = $startTime
$messageCount = 0
$compilationComplete = $false
$compilationError = $false

try {
    $request = [System.Net.HttpWebRequest]::Create($sseUrl)
    $request.Method = "GET"
    $request.Timeout = -1  # Pas de timeout
    $request.ReadWriteTimeout = -1  # Pas de timeout
    
    Write-Host "[SSE] Connexion en cours..." -ForegroundColor Cyan
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "[OK] Connexion SSE etablie" -ForegroundColor Green
    Write-Host ""
    
    $lastHeartbeat = $startTime
    $lastStatusCheck = $startTime
    $buffer = ""
    
    while (-not $compilationComplete -and -not $compilationError) {
        $elapsed = (Get-Date) - $startTime
        $currentTime = Get-Date
        
        # Verifier le statut toutes les 30 secondes en arriere-plan
        if (($currentTime - $lastStatusCheck).TotalSeconds -gt 30) {
            $lastStatusCheck = $currentTime
            try {
                $statusResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
                    -Method GET `
                    -Headers $headers `
                    -TimeoutSec 15 `
                    -ErrorAction SilentlyContinue
                
                if ($statusResponse -and $statusResponse.firmwares) {
                    $firmware = $statusResponse.firmwares | Where-Object { $_.id -eq $firmwareId } | Select-Object -First 1
                    if ($firmware) {
                        if ($firmware.status -eq 'compiled' -and -not $compilationComplete) {
                            Write-Host "[SUCCESS] Compilation reussie (detectee par verification) !" -ForegroundColor Green
                            $compilationComplete = $true
                            break
                        } elseif ($firmware.status -eq 'error' -and -not $compilationError) {
                            Write-Host "[ERROR] Compilation echouee: $($firmware.error_message)" -ForegroundColor Red
                            $compilationError = $true
                            break
                        }
                    }
                }
            } catch {
                # Ignorer les erreurs de verification
            }
        }
        
        # Lire les donnees SSE de maniere non-bloquante
        try {
            # Utiliser ReadLine qui est plus fiable que Read caractere par caractere
            if ($reader.Peek() -ge 0) {
                $line = $reader.ReadLine()
                if ($line) {
                    $messageCount++
                    $lastMessageTime = $currentTime
                    
                    # Traiter les lignes SSE
                    if ($line.StartsWith('data: ')) {
                        $jsonData = $line.Substring(6).Trim()
                        if ($jsonData) {
                            try {
                                $data = $jsonData | ConvertFrom-Json
                                $timestamp = Get-Date -Format "HH:mm:ss"
                                
                                switch ($data.type) {
                                    'log' {
                                        $color = if ($data.level -eq 'error') { 'Red' } elseif ($data.level -eq 'warning') { 'Yellow' } else { 'White' }
                                        Write-Host "[$timestamp] $($data.message)" -ForegroundColor $color
                                    }
                                    'progress' {
                                        Write-Host "[$timestamp] Progression: $($data.progress)%" -ForegroundColor Cyan
                                    }
                                    'success' {
                                        Write-Host "[$timestamp] SUCCESS: $($data.message)" -ForegroundColor Green
                                        $compilationComplete = $true
                                    }
                                    'error' {
                                        Write-Host "[$timestamp] ERROR: $($data.message)" -ForegroundColor Red
                                        $compilationError = $true
                                    }
                                }
                            } catch {
                                # Afficher la ligne brute si le parsing echoue
                                Write-Host "[$timestamp] [RAW] $line" -ForegroundColor Gray
                            }
                        }
                    } elseif ($line.Trim().StartsWith(':')) {
                        # Keep-alive, mettre a jour le timestamp
                        $lastMessageTime = $currentTime
                        # Afficher un point pour montrer que la connexion est active
                        if ($messageCount % 10 -eq 0) {
                            Write-Host "." -NoNewline -ForegroundColor Gray
                        }
                    } elseif ($line.Trim() -ne '') {
                        # Ligne inconnue, afficher pour debug
                        Write-Host "[$timestamp] [UNKNOWN] $line" -ForegroundColor DarkGray
                    }
                }
            } else {
                # Pas de donnees disponibles, attendre un peu
                Start-Sleep -Milliseconds 200
            }
        } catch {
            # Erreur de lecture, continuer
            $errorMsg = $_.Exception.Message
            if (-not $errorMsg -like "*timeout*" -and -not $errorMsg -like "*closed*") {
                Write-Host "[WARNING] Erreur de lecture: $errorMsg" -ForegroundColor Yellow
            }
            Start-Sleep -Milliseconds 500
        }
        
        # Afficher un heartbeat toutes les 60 secondes pour montrer que le script est actif
        if (($currentTime - $lastHeartbeat).TotalSeconds -gt 60) {
            $lastHeartbeat = $currentTime
            $minutes = [int]($elapsed.TotalMinutes)
            $seconds = [int]($elapsed.TotalSeconds % 60)
            Write-Host "[INFO] En cours... (${minutes}m ${seconds}s, $messageCount messages)" -ForegroundColor Gray
        }
        
        # Timeout de securite: 30 minutes maximum
        if ($elapsed.TotalMinutes -gt 30) {
            Write-Host "[WARNING] Timeout de securite atteint (30 minutes)" -ForegroundColor Yellow
            Write-Host "   Verification du statut final..." -ForegroundColor Yellow
            break
        }
    }
    
    # Fermer proprement
    if ($reader) {
        try { $reader.Close() } catch {}
    }
    if ($stream) {
        try { $stream.Close() } catch {}
    }
    if ($response) {
        try { $response.Close() } catch {}
    }
    
} catch {
    Write-Host "[ERREUR] Erreur SSE: $_" -ForegroundColor Red
    Write-Host "   Type: $($_.Exception.GetType().Name)" -ForegroundColor Gray
    Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Gray
    Write-Host "   La compilation peut continuer en arriere-plan..." -ForegroundColor Yellow
}

# Verifier le statut final (toujours, meme si erreur)
Write-Host ""
Write-Host "[INFO] Verification du statut final..." -ForegroundColor Cyan
$maxRetries = 5
$retryCount = 0

while ($retryCount -lt $maxRetries -and -not $compilationComplete -and -not $compilationError) {
    $retryCount++
    try {
        $statusResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
            -Method GET `
            -Headers $headers `
            -TimeoutSec 15 `
            -ErrorAction Stop
        
        if ($statusResponse -and $statusResponse.firmwares) {
            $firmware = $statusResponse.firmwares | Where-Object { $_.id -eq $firmwareId } | Select-Object -First 1
            if ($firmware) {
                Write-Host "   Status: $($firmware.status)" -ForegroundColor Gray
                if ($firmware.status -eq 'compiled') {
                    Write-Host "[SUCCESS] Compilation reussie !" -ForegroundColor Green
                    $compilationComplete = $true
                    break
                } elseif ($firmware.status -eq 'error') {
                    Write-Host "[ERROR] Compilation echouee: $($firmware.error_message)" -ForegroundColor Red
                    $compilationError = $true
                    break
                } elseif ($firmware.status -eq 'compiling') {
                    Write-Host "   La compilation est toujours en cours..." -ForegroundColor Yellow
                    if ($retryCount -lt $maxRetries) {
                        Write-Host "   Nouvelle verification dans 30 secondes..." -ForegroundColor Gray
                        Start-Sleep -Seconds 30
                    }
                }
            }
        }
    } catch {
        Write-Host "   [WARNING] Erreur verification (tentative $retryCount/$maxRetries): $_" -ForegroundColor Yellow
        if ($retryCount -lt $maxRetries) {
            Start-Sleep -Seconds 10
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
$duration = (Get-Date) - $startTime
Write-Host "Duree totale: $([int]$duration.TotalSeconds) secondes" -ForegroundColor Gray
Write-Host "Messages recus: $messageCount" -ForegroundColor Gray

if ($compilationComplete) {
    Write-Host "[SUCCESS] Compilation terminee avec succes !" -ForegroundColor Green
    exit 0
} elseif ($compilationError) {
    Write-Host "[ERROR] Compilation echouee" -ForegroundColor Red
    exit 1
} else {
    Write-Host "[WARNING] Compilation interrompue" -ForegroundColor Yellow
    exit 1
}

