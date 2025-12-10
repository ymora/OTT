# Script de test pour la compilation SSE
param(
    [string]$FirmwareId = "",
    [string]$Token = "",
    [string]$ApiUrl = "http://localhost:8000/api.php"
)

Write-Host "=== Test Compilation SSE ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($FirmwareId) -or [string]::IsNullOrEmpty($Token)) {
    Write-Host "Usage: .\test_compile_sse.ps1 -FirmwareId <id> -Token <token> [-ApiUrl <url>]" -ForegroundColor Yellow
    exit 1
}

$url = "$ApiUrl/firmwares/compile/$FirmwareId?token=$([System.Web.HttpUtility]::UrlEncode($Token))"
Write-Host "URL: $url" -ForegroundColor Gray
Write-Host ""

# Utiliser System.Net.HttpWebRequest pour lire le stream SSE
try {
    $request = [System.Net.HttpWebRequest]::Create($url)
    $request.Method = "GET"
    $request.Accept = "text/event-stream"
    $request.Timeout = 30000
    
    Write-Host "Connexion à l'endpoint SSE..." -ForegroundColor Yellow
    
    $response = $request.GetResponse()
    $stream = $response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    
    Write-Host "✅ Connexion établie" -ForegroundColor Green
    Write-Host "Lecture des messages SSE (timeout: 30s)..." -ForegroundColor Yellow
    Write-Host ""
    
    $messageCount = 0
    $startTime = Get-Date
    $timeout = 30
    
    while ($true) {
        $elapsed = (Get-Date) - $startTime
        if ($elapsed.TotalSeconds -gt $timeout) {
            Write-Host "`n⏱️ Timeout après $timeout secondes" -ForegroundColor Yellow
            break
        }
        
        if ($reader.EndOfStream) {
            Write-Host "`n📡 Fin du stream" -ForegroundColor Yellow
            break
        }
        
        $line = $reader.ReadLine()
        
        if ($null -eq $line) {
            Start-Sleep -Milliseconds 100
            continue
        }
        
        if ($line.Trim() -eq "" -or $line.StartsWith(":")) {
            # Keep-alive ou ligne vide
            continue
        }
        
        if ($line.StartsWith("data: ")) {
            $messageCount++
            $data = $line.Substring(6) # Enlever "data: "
            Write-Host "[$messageCount] $data" -ForegroundColor Cyan
            
            try {
                $json = $data | ConvertFrom-Json
                if ($json.type -eq "error") {
                    Write-Host "   ❌ ERREUR: $($json.message)" -ForegroundColor Red
                    break
                } elseif ($json.type -eq "success") {
                    Write-Host "   ✅ SUCCÈS: $($json.message)" -ForegroundColor Green
                    break
                } elseif ($json.type -eq "log") {
                    $level = $json.level
                    $color = switch ($level) {
                        "error" { "Red" }
                        "warning" { "Yellow" }
                        default { "White" }
                    }
                    Write-Host "   📝 [$level] $($json.message)" -ForegroundColor $color
                } elseif ($json.type -eq "progress") {
                    Write-Host "   📊 Progression: $($json.progress)%" -ForegroundColor Magenta
                }
            } catch {
                Write-Host "   ⚠️ Erreur parsing JSON: $data" -ForegroundColor Yellow
            }
        }
    }
    
    $reader.Close()
    $stream.Close()
    $response.Close()
    
    Write-Host ""
    Write-Host "=== Résumé ===" -ForegroundColor Cyan
    Write-Host "Messages reçus: $messageCount" -ForegroundColor White
    
    if ($messageCount -eq 0) {
        Write-Host "⚠️ Aucun message reçu - vérifiez les logs serveur" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "   Status Code: $statusCode" -ForegroundColor Red
        
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $errorReader = New-Object System.IO.StreamReader($errorStream)
            $errorBody = $errorReader.ReadToEnd()
            Write-Host "   Réponse: $errorBody" -ForegroundColor Red
        } catch {
            Write-Host "   (Impossible de lire la réponse d'erreur)" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Pour voir les logs serveur, vérifiez:" -ForegroundColor Yellow
Write-Host "  - Les logs PHP (error_log)" -ForegroundColor Gray
Write-Host "  - Les logs du serveur web" -ForegroundColor Gray

