# Script simple pour voir TOUS les messages SSE
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$FirmwareId = 77
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST SSE SIMPLE - AFFICHAGE COMPLET" -ForegroundColor Cyan
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
Write-Host "=== MESSAGES RECUS ===" -ForegroundColor Cyan
Write-Host ""

$messageCount = 0
$startTime = Get-Date
$maxWait = 120 # 2 minutes max

while ($true) {
    $elapsed = (Get-Date) - $startTime
    if ($elapsed.TotalSeconds -gt $maxWait) {
        Write-Host ""
        Write-Host "[TIMEOUT] Arret apres $maxWait secondes" -ForegroundColor Yellow
        break
    }
    
    if ($reader.Peek() -ge 0) {
        $line = $reader.ReadLine()
        if ($line) {
            $messageCount++
            $timestamp = Get-Date -Format "HH:mm:ss.fff"
            
            # Afficher TOUTE la ligne brute
            Write-Host "[$timestamp] [$messageCount] $line" -ForegroundColor White
            
            # Si c'est un message data:, afficher aussi le JSON parsé
            if ($line.StartsWith('data: ')) {
                $jsonData = $line.Substring(6).Trim()
                if ($jsonData) {
                    try {
                        $data = $jsonData | ConvertFrom-Json
                        Write-Host "   -> Type: $($data.type)" -ForegroundColor Cyan
                        if ($data.PSObject.Properties.Name -contains 'level') {
                            Write-Host "   -> Level: $($data.level)" -ForegroundColor Gray
                        }
                        if ($data.PSObject.Properties.Name -contains 'message') {
                            Write-Host "   -> Message: $($data.message)" -ForegroundColor Yellow
                        }
                        if ($data.PSObject.Properties.Name -contains 'progress') {
                            Write-Host "   -> Progress: $($data.progress)%" -ForegroundColor Green
                        }
                    } catch {
                        Write-Host "   -> [ERREUR PARSING JSON] $($_.Exception.Message)" -ForegroundColor Red
                        Write-Host "   -> JSON brut: $jsonData" -ForegroundColor DarkGray
                    }
                }
            } elseif ($line.Trim().StartsWith(':')) {
                Write-Host "   -> [KEEP-ALIVE]" -ForegroundColor DarkGray
            }
            Write-Host ""
        }
    } else {
        Start-Sleep -Milliseconds 100
    }
}

$reader.Close()
$stream.Close()
$response.Close()

Write-Host ""
Write-Host "=== FIN ===" -ForegroundColor Cyan
Write-Host "Messages recus: $messageCount" -ForegroundColor Gray
Write-Host "Duree: $([int]$elapsed.TotalSeconds) secondes" -ForegroundColor Gray

