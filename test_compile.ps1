# Script de test pour la compilation du firmware
param(
    [string]$FirmwareId = "",
    [string]$Token = "",
    [string]$ApiUrl = "http://localhost:8000/api.php"
)

Write-Host "=== Test Compilation Firmware ===" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($FirmwareId) -or [string]::IsNullOrEmpty($Token)) {
    Write-Host "Usage: .\test_compile.ps1 -FirmwareId <id> -Token <token> [-ApiUrl <url>]" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Exemple:" -ForegroundColor Yellow
    Write-Host "  .\test_compile.ps1 -FirmwareId 1 -Token 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'" -ForegroundColor Gray
    exit 1
}

Write-Host "1. Test de l'endpoint de compilation..." -ForegroundColor Cyan
$url = "$ApiUrl/firmwares/compile/$FirmwareId?token=$([System.Web.HttpUtility]::UrlEncode($Token))"
Write-Host "   URL: $url" -ForegroundColor Gray

try {
    # Test avec Invoke-WebRequest pour voir les headers
    Write-Host "   Envoi requête SSE..." -ForegroundColor Yellow
    
    $response = $null
    $errorOccurred = $false
    
    try {
        # Utiliser Invoke-WebRequest avec -UseBasicParsing pour éviter les problèmes de parsing HTML
        $response = Invoke-WebRequest -Uri $url -Method GET -Headers @{
            "Accept" = "text/event-stream"
            "Cache-Control" = "no-cache"
        } -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
        
        Write-Host "   ✅ Réponse reçue (Status: $($response.StatusCode))" -ForegroundColor Green
        Write-Host "   Content-Type: $($response.Headers['Content-Type'])" -ForegroundColor Gray
        
        # Afficher les premières lignes de la réponse
        $content = $response.Content
        $lines = $content -split "`n" | Select-Object -First 20
        Write-Host "   Premières lignes de la réponse:" -ForegroundColor Yellow
        foreach ($line in $lines) {
            if ($line.Trim() -ne "") {
                Write-Host "     $line" -ForegroundColor Gray
            }
        }
        
    } catch {
        $errorOccurred = $true
        Write-Host "   ❌ Erreur lors de la requête:" -ForegroundColor Red
        Write-Host "      $($_.Exception.Message)" -ForegroundColor Red
        
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Host "      Status Code: $statusCode" -ForegroundColor Red
            
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                Write-Host "      Réponse: $responseBody" -ForegroundColor Red
            } catch {
                Write-Host "      (Impossible de lire la réponse)" -ForegroundColor Yellow
            }
        }
    }
    
} catch {
    Write-Host "   ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Vérification des logs serveur..." -ForegroundColor Cyan
Write-Host "   Vérifiez les logs PHP pour plus de détails" -ForegroundColor Yellow
Write-Host "   Cherchez les lignes avec '[handleCompileFirmware]' ou '[ROUTER]'" -ForegroundColor Yellow

Write-Host ""
Write-Host "3. Test avec curl (si disponible)..." -ForegroundColor Cyan
if (Get-Command curl -ErrorAction SilentlyContinue) {
    Write-Host "   Commande curl:" -ForegroundColor Yellow
    $curlUrl = $url -replace ' ', '%20'
    Write-Host "   curl -N -H 'Accept: text/event-stream' '$curlUrl'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "   Exécution..." -ForegroundColor Yellow
    try {
        curl -N -H "Accept: text/event-stream" "$curlUrl" 2>&1 | Select-Object -First 30
    } catch {
        Write-Host "   ⚠️ Erreur curl: $($_.Exception.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️ curl non disponible" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Test terminé ===" -ForegroundColor Cyan

