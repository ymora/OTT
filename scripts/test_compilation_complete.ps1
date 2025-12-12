#requires -Version 7.0
<#
.SYNOPSIS
  Script de test complet de la compilation firmware depuis le dashboard

.DESCRIPTION
  Ce script simule exactement ce qui se passe quand un utilisateur clique sur le bouton
  de compilation dans le dashboard. Il va :
  1. S'authentifier
  2. Lister les firmwares disponibles
  3. Prendre le premier firmware .ino disponible
  4. Lancer la compilation
  5. Surveiller la compilation en temps réel via SSE
  6. Vérifier le statut final

.PARAMETER API_URL
  URL de l'API (par défaut : https://ott-jbln.onrender.com)

.PARAMETER Email
  Email de connexion

.PARAMETER Password
  Mot de passe

.PARAMETER FirmwareId
  ID du firmware à compiler (optionnel, prendra le premier disponible si non spécifié)

.EXAMPLE
  .\scripts\test_compilation_complete.ps1
  Lance un test de compilation complet

.EXAMPLE
  .\scripts\test_compilation_complete.ps1 -FirmwareId 77
  Compile un firmware spécifique
#>

param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$FirmwareId = 0
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Fonction pour afficher les titres
function Write-Title {
    param([string]$Text)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

# Fonction pour vérifier le statut du firmware via API
function Get-FirmwareStatus {
    param(
        [string]$Token,
        [int]$FwId,
        [string]$ApiUrl
    )
    
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

# Fonction pour afficher les détails d'un firmware
function Show-FirmwareDetails {
    param($Firmware)
    
    Write-Host "ID: $($Firmware.id)" -ForegroundColor Gray
    Write-Host "Version: $($Firmware.version)" -ForegroundColor White
    Write-Host "Status: $($Firmware.status)" -ForegroundColor $(
        switch ($Firmware.status) {
            'compiled' { 'Green' }
            'error' { 'Red' }
            'compiling' { 'Yellow' }
            'pending_compilation' { 'Cyan' }
            default { 'Gray' }
        }
    )
    if ($Firmware.file_path) {
        Write-Host "Fichier: $($Firmware.file_path)" -ForegroundColor Gray
    }
    if ($Firmware.file_size) {
        Write-Host "Taille: $($Firmware.file_size) bytes" -ForegroundColor Gray
    }
    if ($Firmware.PSObject.Properties['error_message'] -and $Firmware.error_message) {
        Write-Host "Erreur: $($Firmware.error_message)" -ForegroundColor Red
    }
}

# ============================================================================
# ÉTAPE 1: AUTHENTIFICATION
# ============================================================================
Write-Title "ÉTAPE 1: AUTHENTIFICATION"

try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json
    
    Write-Host "Connexion à l'API..." -ForegroundColor Yellow
    Write-Host "URL: $API_URL" -ForegroundColor Gray
    Write-Host "Email: $Email" -ForegroundColor Gray
    
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -TimeoutSec 30
    
    $token = $loginResponse.token
    
    if (-not $token) {
        throw "Token non reçu dans la réponse"
    }
    
    Write-Host "✅ Authentification réussie" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor DarkGray
} catch {
    Write-Host "❌ Erreur d'authentification: $_" -ForegroundColor Red
    exit 1
}

# ============================================================================
# ÉTAPE 2: RÉCUPÉRATION DES FIRMWARES
# ============================================================================
Write-Title "ÉTAPE 2: RÉCUPÉRATION DES FIRMWARES"

try {
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    Write-Host "Récupération de la liste des firmwares..." -ForegroundColor Yellow
    
    $firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30
    
    if (-not $firmwaresResponse.success) {
        throw "Erreur API: $($firmwaresResponse.error)"
    }
    
    $allFirmwares = $firmwaresResponse.firmwares
    Write-Host "✅ $($allFirmwares.Count) firmwares trouvés" -ForegroundColor Green
    
    # Filtrer les firmwares .ino disponibles pour compilation
    $inoFirmwares = $allFirmwares | Where-Object {
        $_.status -eq 'pending_compilation' -or
        ($_.file_path -and $_.file_path.EndsWith('.ino'))
    }
    
    Write-Host "📦 $($inoFirmwares.Count) firmwares .ino disponibles pour compilation" -ForegroundColor Cyan
    
    if ($inoFirmwares.Count -eq 0) {
        throw "Aucun firmware .ino disponible pour la compilation"
    }
    
    # Afficher la liste
    Write-Host ""
    Write-Host "Liste des firmwares .ino:" -ForegroundColor White
    foreach ($fw in $inoFirmwares) {
        Write-Host "  - ID $($fw.id): v$($fw.version) [$($fw.status)]" -ForegroundColor Gray
    }
    
} catch {
    Write-Host "❌ Erreur lors de la récupération des firmwares: $_" -ForegroundColor Red
    exit 1
}

# ============================================================================
# ÉTAPE 3: SÉLECTION DU FIRMWARE À COMPILER
# ============================================================================
Write-Title "ÉTAPE 3: SÉLECTION DU FIRMWARE"

if ($FirmwareId -eq 0) {
    # Prendre le premier firmware disponible
    $selectedFirmware = $inoFirmwares | Select-Object -First 1
    $FirmwareId = $selectedFirmware.id
    Write-Host "Aucun firmware spécifié, sélection automatique du premier disponible" -ForegroundColor Yellow
} else {
    # Vérifier que le firmware existe
    $selectedFirmware = $inoFirmwares | Where-Object { $_.id -eq $FirmwareId } | Select-Object -First 1
    if (-not $selectedFirmware) {
        Write-Host "❌ Firmware ID $FirmwareId non trouvé ou non compilable" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Firmware sélectionné pour compilation:" -ForegroundColor White
Show-FirmwareDetails -Firmware $selectedFirmware

# ============================================================================
# ÉTAPE 4: LANCEMENT DE LA COMPILATION
# ============================================================================
Write-Title "ÉTAPE 4: LANCEMENT DE LA COMPILATION"

Write-Host "Démarrage de la compilation du firmware ID $FirmwareId..." -ForegroundColor Yellow

# Encoder le token pour l'URL
Add-Type -AssemblyName System.Web
$tokenEncoded = [System.Web.HttpUtility]::UrlEncode($token)
$sseUrl = "$API_URL/api.php/firmwares/compile/${FirmwareId}?token=${tokenEncoded}"

Write-Host "URL SSE: $sseUrl" -ForegroundColor DarkGray

try {
    # Créer la requête HTTP pour SSE
    $request = [System.Net.HttpWebRequest]::Create($sseUrl)
    $request.Method = "GET"
    $request.Timeout = -1  # Pas de timeout pour SSE
    $request.ReadWriteTimeout = -1
    
    Write-Host "Connexion au flux SSE..." -ForegroundColor Yellow
    
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "✅ Connexion SSE établie" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Erreur lors de la connexion SSE: $_" -ForegroundColor Red
    exit 1
}

# ============================================================================
# ÉTAPE 5: SURVEILLANCE DE LA COMPILATION
# ============================================================================
Write-Title "ÉTAPE 5: SURVEILLANCE EN TEMPS RÉEL"

$messageCount = 0
$startTime = Get-Date
$maxWait = 1800  # 30 minutes max
$compilationComplete = $false
$compilationError = $false
$buffer = ""
$lastMessageTime = Get-Date
$maxSilenceTime = 60  # 60 secondes sans message
$statusCheckInterval = 30  # Vérifier toutes les 30 secondes en arrière-plan
$lastStatusCheck = Get-Date

Write-Host "Écoute des messages de compilation..." -ForegroundColor Cyan
Write-Host "(Timeout: ${maxWait}s | Vérification statut si silence > ${maxSilenceTime}s)" -ForegroundColor DarkGray
Write-Host ""

while (-not $compilationComplete -and -not $compilationError) {
    $elapsed = (Get-Date) - $startTime
    if ($elapsed.TotalSeconds -gt $maxWait) {
        Write-Host ""
        Write-Host "[TIMEOUT] Arrêt après $maxWait secondes" -ForegroundColor Red
        break
    }
    
    # Vérification périodique du statut en arrière-plan
    $timeSinceLastCheck = ((Get-Date) - $lastStatusCheck).TotalSeconds
    if ($timeSinceLastCheck -gt $statusCheckInterval) {
        $lastStatusCheck = Get-Date
        $currentStatus = Get-FirmwareStatus -Token $token -FwId $FirmwareId -ApiUrl $API_URL
        
        if ($currentStatus) {
            if ($currentStatus.status -eq 'compiled') {
                Write-Host ""
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✅ SUCCÈS détecté via vérification périodique!" -ForegroundColor Green
                $compilationComplete = $true
                break
            } elseif ($currentStatus.status -eq 'error') {
                Write-Host ""
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ❌ ERREUR détectée via vérification périodique!" -ForegroundColor Red
                if ($currentStatus.error_message) {
                    Write-Host "Erreur: $($currentStatus.error_message)" -ForegroundColor Red
                }
                $compilationError = $true
                break
            }
        }
    }
    
    # Vérifier le silence (pas de message depuis longtemps)
    $timeSinceLastMessage = ((Get-Date) - $lastMessageTime).TotalSeconds
    if ($timeSinceLastMessage -gt $maxSilenceTime) {
        Write-Host ""
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ⚠️ Pas de message depuis ${maxSilenceTime}s, vérification..." -ForegroundColor Yellow
        
        $currentStatus = Get-FirmwareStatus -Token $token -FwId $FirmwareId -ApiUrl $API_URL
        if ($currentStatus) {
            if ($currentStatus.status -eq 'compiled') {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ✅ SUCCÈS: Compilation terminée!" -ForegroundColor Green
                $compilationComplete = $true
                break
            } elseif ($currentStatus.status -eq 'error') {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ❌ ERREUR: Compilation échouée!" -ForegroundColor Red
                if ($currentStatus.error_message) {
                    Write-Host "Erreur: $($currentStatus.error_message)" -ForegroundColor Red
                }
                $compilationError = $true
                break
            } elseif ($currentStatus.status -eq 'compiling') {
                Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ℹ️ Compilation toujours en cours..." -ForegroundColor Cyan
                $lastMessageTime = Get-Date  # Réinitialiser
            }
        }
    }
    
    # Lire les messages SSE
    try {
        $char = $reader.Read()
        
        while ($char -ge 0) {
            $charValue = [char]$char
            $buffer += $charValue
            
            # Ligne complète reçue
            if ($charValue -eq "`n") {
                $line = $buffer.Trim()
                $buffer = ""
                
                if ($line -and $line.Length -gt 0) {
                    $messageCount++
                    $timestamp = Get-Date -Format "HH:mm:ss"
                    
                    # Traiter les messages SSE (data: ...)
                    if ($line.StartsWith('data: ')) {
                        $jsonData = $line.Substring(6).Trim()
                        if ($jsonData) {
                            try {
                                $data = $jsonData | ConvertFrom-Json
                                
                                switch ($data.type) {
                                    'log' {
                                        $color = switch ($data.level) {
                                            'error' { 'Red' }
                                            'warning' { 'Yellow' }
                                            'info' { 'White' }
                                            default { 'Gray' }
                                        }
                                        Write-Host "[$timestamp] $($data.message)" -ForegroundColor $color
                                        $lastMessageTime = Get-Date
                                    }
                                    'progress' {
                                        Write-Host "[$timestamp] 📊 $($data.progress)%" -ForegroundColor Cyan
                                        $lastMessageTime = Get-Date
                                    }
                                    'success' {
                                        Write-Host "[$timestamp] ✅ $($data.message)" -ForegroundColor Green
                                        $compilationComplete = $true
                                        $lastMessageTime = Get-Date
                                    }
                                    'error' {
                                        Write-Host "[$timestamp] ❌ $($data.message)" -ForegroundColor Red
                                        $compilationError = $true
                                        $lastMessageTime = Get-Date
                                    }
                                    default {
                                        Write-Host "[$timestamp] [?] $($data | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
                                    }
                                }
                            } catch {
                                Write-Host "[$timestamp] [RAW] $line" -ForegroundColor DarkGray
                            }
                        }
                    } elseif ($line.Trim().StartsWith(':')) {
                        # Keep-alive - ne pas afficher pour éviter le spam
                        # Afficher un indicateur toutes les 50 keep-alive
                        if ($messageCount % 50 -eq 0) {
                            Write-Host "[$timestamp] ... (connexion active, $messageCount messages)" -ForegroundColor DarkGray
                        }
                        $lastMessageTime = Get-Date  # Considérer keep-alive comme message
                    } else {
                        # Message non formaté
                        if ($line.Length -lt 200) {
                            Write-Host "[$timestamp] [AUTRE] $line" -ForegroundColor DarkGray
                        }
                    }
                }
            }
            
            # Lire le caractère suivant
            if ($reader.Peek() -ge 0) {
                $char = $reader.Read()
            } else {
                break
            }
        }
    } catch {
        # Erreur de lecture, continuer
    }
    
    # Attendre un peu si pas de données
    if ($reader.Peek() -lt 0) {
        Start-Sleep -Milliseconds 100
    }
}

# Fermer les ressources
if ($reader) { try { $reader.Close() } catch {} }
if ($stream) { try { $stream.Close() } catch {} }
if ($response) { try { $response.Close() } catch {} }

# ============================================================================
# ÉTAPE 6: VÉRIFICATION FINALE
# ============================================================================
Write-Title "ÉTAPE 6: VÉRIFICATION FINALE"

Write-Host "Récupération du statut final du firmware..." -ForegroundColor Yellow

$finalStatus = Get-FirmwareStatus -Token $token -FwId $FirmwareId -ApiUrl $API_URL

if ($finalStatus) {
    Write-Host ""
    Write-Host "Statut final:" -ForegroundColor White
    Show-FirmwareDetails -Firmware $finalStatus
    
    if ($finalStatus.status -eq 'compiled') {
        Write-Host ""
        Write-Host "✅ COMPILATION RÉUSSIE !" -ForegroundColor Green
        
        if ($finalStatus.file_size) {
            $sizeInMB = [math]::Round($finalStatus.file_size / 1MB, 2)
            Write-Host "   Taille: $sizeInMB MB" -ForegroundColor Gray
        }
        if ($finalStatus.checksum) {
            Write-Host "   Checksum: $($finalStatus.checksum)" -ForegroundColor Gray
        }
        
        $compilationComplete = $true
    } elseif ($finalStatus.status -eq 'error') {
        Write-Host ""
        Write-Host "❌ COMPILATION ÉCHOUÉE" -ForegroundColor Red
        $compilationError = $true
    } elseif ($finalStatus.status -eq 'compiling') {
        Write-Host ""
        Write-Host "⚠️ COMPILATION TOUJOURS EN COURS" -ForegroundColor Yellow
        Write-Host "La compilation continue en arrière-plan sur le serveur" -ForegroundColor Gray
    }
} else {
    Write-Host "❌ Impossible de récupérer le statut final" -ForegroundColor Red
}

# ============================================================================
# RÉSUMÉ
# ============================================================================
Write-Title "RÉSUMÉ"

$duration = (Get-Date) - $startTime
Write-Host "Firmware ID: $FirmwareId" -ForegroundColor Gray
Write-Host "Messages reçus: $messageCount" -ForegroundColor Gray
Write-Host "Durée totale: $([math]::Round($duration.TotalSeconds, 1))s ($([math]::Round($duration.TotalMinutes, 1)) min)" -ForegroundColor Gray

Write-Host ""

if ($compilationComplete) {
    Write-Host "🎉 TEST RÉUSSI: La compilation s'est terminée avec succès" -ForegroundColor Green
    exit 0
} elseif ($compilationError) {
    Write-Host "⚠️ TEST ÉCHOUÉ: La compilation a rencontré une erreur" -ForegroundColor Red
    exit 1
} else {
    Write-Host "⚠️ TEST INCOMPLET: La compilation n'a pas terminé dans le temps imparti" -ForegroundColor Yellow
    exit 2
}

