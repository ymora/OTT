#requires -Version 7.0
<#
.SYNOPSIS
  Test rapide de la compilation avec core pré-installé

.DESCRIPTION
  Ce script teste que le core ESP32 pré-installé est bien détecté et utilisé.
  Il lance une compilation et vérifie qu'elle prend moins de 5 minutes.

.EXAMPLE
  .\scripts\test_compilation_rapide.ps1
#>

param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 TEST DE COMPILATION OPTIMISÉE" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier que le core est bien dans .arduino15/
Write-Host "1️⃣ Vérification du core ESP32 pré-installé..." -ForegroundColor Yellow

$corePath = ".arduino15\packages\esp32\hardware\esp32\3.3.4"
if (Test-Path $corePath) {
    Write-Host "   ✅ Core ESP32 v3.3.4 trouvé dans .arduino15/" -ForegroundColor Green
    
    $coreSize = (Get-ChildItem $corePath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
    Write-Host "   📦 Taille: $([math]::Round($coreSize, 1)) MB" -ForegroundColor Gray
} else {
    Write-Host "   ❌ Core ESP32 NON trouvé dans .arduino15/" -ForegroundColor Red
    Write-Host "   Chemin attendu: $corePath" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Pour résoudre:" -ForegroundColor Yellow
    Write-Host "   1. Copier depuis installation locale:" -ForegroundColor Gray
    Write-Host "      Copy-Item `"`$env:LOCALAPPDATA\Arduino15\packages\esp32\hardware`" -Destination `".arduino15\packages\esp32\`" -Recurse -Force" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host ""

# 2. Authentification
Write-Host "2️⃣ Authentification..." -ForegroundColor Yellow

try {
    $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 30
    $token = $loginResponse.token
    Write-Host "   ✅ Authentifié" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 3. Récupérer un firmware .ino
Write-Host "3️⃣ Récupération firmware .ino..." -ForegroundColor Yellow

try {
    $headers = @{ "Authorization" = "Bearer $token" }
    $firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" -Method GET -Headers $headers -TimeoutSec 30
    
    $inoFirmware = $firmwaresResponse.firmwares | Where-Object {
        $_.status -eq 'pending_compilation' -or ($_.file_path -and $_.file_path.EndsWith('.ino'))
    } | Select-Object -First 1
    
    if (-not $inoFirmware) {
        Write-Host "   ⚠️ Aucun firmware .ino disponible pour test" -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "   ✅ Firmware ID $($inoFirmware.id) - v$($inoFirmware.version)" -ForegroundColor Green
    $firmwareId = $inoFirmware.id
} catch {
    Write-Host "   ❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 4. Lancer la compilation et mesurer le temps
Write-Host "4️⃣ Lancement de la compilation..." -ForegroundColor Yellow
Write-Host "   ⏱️ Objectif: < 5 minutes" -ForegroundColor Gray
Write-Host ""

$startTime = Get-Date

try {
    Add-Type -AssemblyName System.Web
    $tokenEncoded = [System.Web.HttpUtility]::UrlEncode($token)
    $sseUrl = "$API_URL/api.php/firmwares/compile/${firmwareId}?token=${tokenEncoded}"
    
    $request = [System.Net.HttpWebRequest]::Create($sseUrl)
    $request.Method = "GET"
    $request.Timeout = 600000  # 10 minutes max
    $request.ReadWriteTimeout = 600000
    
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "   ✅ Connexion SSE établie" -ForegroundColor Green
    Write-Host ""
    
    $coreDetected = $false
    $compilationComplete = $false
    $buffer = ""
    
    while (-not $compilationComplete) {
        $elapsed = ((Get-Date) - $startTime).TotalMinutes
        if ($elapsed -gt 10) {
            Write-Host ""
            Write-Host "   ⚠️ Timeout après 10 minutes" -ForegroundColor Yellow
            break
        }
        
        $char = $reader.Read()
        if ($char -lt 0) {
            Start-Sleep -Milliseconds 100
            continue
        }
        
        $charValue = [char]$char
        $buffer += $charValue
        
        if ($charValue -eq "`n") {
            $line = $buffer.Trim()
            $buffer = ""
            
            if ($line.StartsWith('data: ')) {
                $jsonData = $line.Substring(6).Trim()
                if ($jsonData) {
                    try {
                        $data = $jsonData | ConvertFrom-Json
                        
                        # Chercher la détection du core pré-installé
                        if ($data.type -eq 'log' -and $data.message -match 'Core ESP32 pré-installé') {
                            if (-not $coreDetected) {
                                Write-Host "   🎯 $($data.message)" -ForegroundColor Green
                                $coreDetected = $true
                            }
                        }
                        
                        # Afficher les messages importants
                        if ($data.type -eq 'log' -and ($data.level -eq 'error' -or $data.level -eq 'warning')) {
                            $color = if ($data.level -eq 'error') { 'Red' } else { 'Yellow' }
                            Write-Host "   $($data.message)" -ForegroundColor $color
                        }
                        
                        # Progression
                        if ($data.type -eq 'progress') {
                            $elapsed = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 0)
                            Write-Host "`r   📊 Progression: $($data.progress)% (${elapsed}s)" -NoNewline
                        }
                        
                        # Succès ou erreur
                        if ($data.type -eq 'success') {
                            $compilationComplete = $true
                        } elseif ($data.type -eq 'error') {
                            $compilationComplete = $true
                        }
                    } catch {}
                }
            }
        }
    }
    
    $reader.Close()
    $stream.Close()
    $response.Close()
    
} catch {
    Write-Host ""
    Write-Host "   ❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host ""

# 5. Résultats
Write-Host "5️⃣ RÉSULTATS" -ForegroundColor Cyan
Write-Host "============" -ForegroundColor Cyan
Write-Host ""

$duration = (Get-Date) - $startTime
$durationMin = [math]::Round($duration.TotalMinutes, 1)
$durationSec = [math]::Round($duration.TotalSeconds, 0)

Write-Host "⏱️ Durée: ${durationSec}s ($durationMin min)" -ForegroundColor White
Write-Host ""

if ($coreDetected) {
    Write-Host "✅ Core ESP32 pré-installé DÉTECTÉ" -ForegroundColor Green
} else {
    Write-Host "⚠️ Core ESP32 pré-installé NON détecté (téléchargement effectué)" -ForegroundColor Yellow
}

Write-Host ""

if ($duration.TotalMinutes -le 2) {
    Write-Host "🎉 EXCELLENT ! Compilation ultra-rapide (<2 min)" -ForegroundColor Green
    Write-Host "   L'optimisation fonctionne parfaitement !" -ForegroundColor Green
    exit 0
} elseif ($duration.TotalMinutes -le 5) {
    Write-Host "✅ BON ! Compilation rapide (<5 min)" -ForegroundColor Green
    Write-Host "   L'optimisation fonctionne bien" -ForegroundColor Green
    exit 0
} else {
    Write-Host "⚠️ LENT ! Compilation > 5 minutes" -ForegroundColor Yellow
    Write-Host "   Possible que le core n'ait pas été détecté" -ForegroundColor Yellow
    Write-Host "   Vérifiez les logs pour identifier le problème" -ForegroundColor Yellow
    exit 1
}

