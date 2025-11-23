# Script PowerShell pour tester l'API de compilation firmware
# Usage: .\scripts\test_compile_api.ps1 -FirmwareId <id> -Token <token>

param(
    [Parameter(Mandatory=$true)]
    [int]$FirmwareId,
    
    [Parameter(Mandatory=$false)]
    [string]$Token,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🧪 TEST API COMPILATION FIRMWARE (PowerShell)" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Vérifier si le token est fourni
if (-not $Token) {
    Write-Host "⚠️  Token non fourni!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour obtenir votre token:" -ForegroundColor White
    Write-Host "  1. Ouvrez https://ymora.github.io/OTT/" -ForegroundColor Gray
    Write-Host "  2. F12 → Application → Local Storage" -ForegroundColor Gray
    Write-Host "  3. Copiez la valeur de 'ott_token'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Ou utilisez: .\scripts\test_compile_api.ps1 -FirmwareId $FirmwareId -Token 'votre_token'" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "📦 Firmware ID: $FirmwareId" -ForegroundColor White
Write-Host "🌐 API URL: $ApiUrl" -ForegroundColor White
Write-Host "🔑 Token: $($Token.Substring(0, [Math]::Min(50, $Token.Length)))... ($($Token.Length) caractères)" -ForegroundColor White
Write-Host "⏰ Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host ""

# Construire l'URL SSE (encoder le token pour URL)
$encodedToken = [System.Uri]::EscapeDataString($Token)
$sseUrl = "$ApiUrl/api.php/firmwares/compile/$FirmwareId" + "?token=$encodedToken"

Write-Host "🔗 URL SSE: $($sseUrl.Substring(0, [Math]::Min(100, $sseUrl.Length)))..." -ForegroundColor Gray
Write-Host ""

# Test 1: Vérifier que le serveur est accessible
Write-Host "📡 TEST 1: Vérification accessibilité serveur..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-WebRequest -Uri "$ApiUrl/api.php/health" -Method GET -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "   ✅ Serveur accessible (Status: $($healthCheck.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Serveur peut être lent ou inaccessible: $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

# Test 2: Tester l'endpoint SSE
Write-Host "📡 TEST 2: Test endpoint SSE avec token..." -ForegroundColor Yellow
Write-Host ""

$connectionStartTime = Get-Date
$firstMessageTime = $null
$messagesReceived = @()
$errorOccurred = $false

try {
    # Créer une requête HTTP pour SSE
    $request = [System.Net.HttpWebRequest]::Create($sseUrl)
    $request.Method = "GET"
    $request.Accept = "text/event-stream"
    $request.Headers.Add("Cache-Control", "no-cache")
    $request.Timeout = 10000  # 10 secondes
    
    Write-Host "   🔌 Connexion en cours..." -ForegroundColor Cyan
    
    # Obtenir la réponse
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "   ✅ Connexion établie!" -ForegroundColor Green
    Write-Host "   Status Code: $($response.StatusCode)" -ForegroundColor White
    Write-Host "   Content-Type: $($response.ContentType)" -ForegroundColor White
    Write-Host ""
    
    # Lire les messages SSE
    $buffer = ""
    $timeout = (Get-Date).AddSeconds(10)  # Timeout après 10 secondes
    
    while ((Get-Date) -lt $timeout) {
        if ($reader.Peek() -ge 0) {
            $line = $reader.ReadLine()
            
            if ($null -eq $firstMessageTime) {
                $firstMessageTime = Get-Date
                $timeToFirstMessage = ($firstMessageTime - $connectionStartTime).TotalMilliseconds
                Write-Host "   ⏱️  Premier message après $([Math]::Round($timeToFirstMessage)) ms" -ForegroundColor Cyan
                
                if ($timeToFirstMessage -gt 100) {
                    Write-Host "   ⚠️  Message reçu après 100ms (connexion peut être lente)" -ForegroundColor Yellow
                }
            }
            
            $buffer += $line + "`n"
            
            # Traiter les messages SSE (séparés par deux retours à la ligne)
            if ($buffer -match "`n`n") {
                $messages = $buffer -split "`n`n"
                $buffer = $messages[-1]  # Garder le dernier message incomplet
                
                foreach ($msg in $messages[0..($messages.Length-2)]) {
                    if ($msg.Trim() -and -not $msg.Trim().StartsWith(":")) {
                        $messagesReceived += $msg
                        
                        # Parser le message SSE
                        $lines = $msg -split "`n"
                        foreach ($line in $lines) {
                            if ($line.StartsWith("data: ")) {
                                $jsonData = $line.Substring(6)
                                try {
                                    $data = $jsonData | ConvertFrom-Json
                                    Write-Host "   📨 Message reçu ($($data.type)): $($data.message)" -ForegroundColor Green
                                    
                                    if ($data.type -eq "error") {
                                        $errorOccurred = $true
                                        if ($data.message -match "Unauthorized|token|expir") {
                                            Write-Host "   🔐 ERREUR D'AUTHENTIFICATION DÉTECTÉE!" -ForegroundColor Red
                                        }
                                    }
                                    elseif ($data.type -eq "log") {
                                        Write-Host "      $($data.message)" -ForegroundColor Gray
                                    }
                                    elseif ($data.type -eq "progress") {
                                        Write-Host "      Progression: $($data.progress)%" -ForegroundColor Cyan
                                    }
                                }
                                catch {
                                    Write-Host "   📨 Message brut: $($jsonData.Substring(0, [Math]::Min(100, $jsonData.Length)))" -ForegroundColor Gray
                                }
                            } elseif ($line.StartsWith(":")) {
                                # Keep-alive, ignorer
                            }
                        }
                    }
                }
            }
        } else {
            Start-Sleep -Milliseconds 100
        }
        
        # Vérifier si on a reçu une erreur et arrêter
        if ($errorOccurred -and $messagesReceived.Count -gt 0) {
            break
        }
    }
    
    $reader.Close()
    $stream.Close()
    $response.Close()
    
} catch {
    Write-Host "   ❌ Erreur lors de la connexion: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Type: $($_.Exception.GetType().Name)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        Write-Host "   Status Code: $statusCode" -ForegroundColor Red
        
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $errorReader = New-Object System.IO.StreamReader($errorStream)
            $errorContent = $errorReader.ReadToEnd()
            Write-Host "   Réponse: $errorContent" -ForegroundColor Red
        } catch {
            # Ignorer
        }
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "📊 RÉSULTATS" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

if ($firstMessageTime) {
    $totalTime = ($firstMessageTime - $connectionStartTime).TotalMilliseconds
    Write-Host "⏱️  Temps jusqu'au premier message: $([Math]::Round($totalTime)) ms" -ForegroundColor White
}

Write-Host "📨 Messages reçus: $($messagesReceived.Count)" -ForegroundColor White

if ($messagesReceived.Count -eq 0) {
    Write-Host "   ⚠️  Aucun message reçu - connexion peut s'être fermée trop rapidement" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ Endpoint SSE fonctionne" -ForegroundColor Green
}

if ($errorOccurred) {
    Write-Host ""
    Write-Host "❌ ERREUR DÉTECTÉE DANS LES MESSAGES" -ForegroundColor Red
    Write-Host "   Vérifiez votre token et votre authentification" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "✅ Test terminé sans erreur critique" -ForegroundColor Green
}

Write-Host ""

