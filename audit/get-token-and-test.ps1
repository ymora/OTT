# Script pour récupérer le token depuis le navigateur et tester les API
# Usage: .\audit\get-token-and-test.ps1 -ApiUrl "http://localhost:8000"

param(
    [string]$ApiUrl = "http://localhost:8000",
    [string]$Email = "",
    [string]$Password = ""
)

Write-Host "🔍 Récupération du token et test des API" -ForegroundColor Cyan
Write-Host ""

# Si les credentials ne sont pas fournis, demander
if ([string]::IsNullOrEmpty($Email)) {
    $Email = Read-Host "Email"
}
if ([string]::IsNullOrEmpty($Password)) {
    $Password = Read-Host "Password" -AsSecureString
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Password)
    )
}

Write-Host ""
Write-Host "🔐 Authentification..." -ForegroundColor Yellow
try {
    $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $token = $authResponse.token
    
    if ($null -eq $token) {
        Write-Host "❌ Erreur: Token non reçu dans la réponse" -ForegroundColor Red
        Write-Host "Réponse complète:" -ForegroundColor Yellow
        $authResponse | ConvertTo-Json -Depth 5
        exit 1
    }
    
    Write-Host "✅ Authentification réussie" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host ""
    
    # Sauvegarder le token dans un fichier temporaire
    $tokenFile = "audit/token_temp.txt"
    $token | Out-File -FilePath $tokenFile -Encoding UTF8 -NoNewline
    Write-Host "💾 Token sauvegardé dans: $tokenFile" -ForegroundColor Gray
    Write-Host ""
    
    # Tester les endpoints avec le token
    Write-Host "🧪 Test des endpoints API..." -ForegroundColor Cyan
    Write-Host ""
    
    $authHeaders = @{Authorization = "Bearer $token"}
    $endpoints = @(
        @{Path="/api.php/devices"; Method="GET"; Name="Liste dispositifs"},
        @{Path="/api.php/patients"; Method="GET"; Name="Liste patients"},
        @{Path="/api.php/alerts"; Method="GET"; Name="Liste alertes"},
        @{Path="/api.php/users"; Method="GET"; Name="Liste utilisateurs"},
        @{Path="/api.php/firmwares"; Method="GET"; Name="Liste firmwares"},
        @{Path="/api.php/health"; Method="GET"; Name="Health check"}
    )
    
    $results = @()
    foreach ($endpoint in $endpoints) {
        $url = "$ApiUrl$($endpoint.Path)"
        Write-Host "  Testing: $($endpoint.Name)..." -ForegroundColor Yellow -NoNewline
        
        try {
            $response = Invoke-RestMethod -Uri $url -Method $endpoint.Method -Headers $authHeaders -TimeoutSec 10 -ErrorAction Stop
            Write-Host " ✅ OK" -ForegroundColor Green
            $results += [PSCustomObject]@{
                Name = $endpoint.Name
                Path = $endpoint.Path
                Status = "OK"
                HasData = $null -ne $response
            }
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Host " ❌ Erreur ($statusCode)" -ForegroundColor Red
            $results += [PSCustomObject]@{
                Name = $endpoint.Name
                Path = $endpoint.Path
                Status = "ERROR ($statusCode)"
                HasData = $false
            }
        }
    }
    
    Write-Host ""
    Write-Host "📊 Résumé des tests:" -ForegroundColor Cyan
    $results | Format-Table -AutoSize
    
    Write-Host ""
    Write-Host "✅ Token disponible pour les tests d'audit" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Pour utiliser ce token dans l'audit:" -ForegroundColor Cyan
    Write-Host "   Le token est sauvegardé dans: $tokenFile" -ForegroundColor White
    Write-Host "   Vous pouvez l'utiliser avec: .\audit\test-api-auth.ps1 -Token `$(Get-Content $tokenFile)" -ForegroundColor White
    
} catch {
    Write-Host "❌ Erreur d'authentification: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Réponse serveur:" -ForegroundColor Yellow
            Write-Host $responseBody -ForegroundColor Gray
        } catch {
            Write-Host "Impossible de lire la réponse d'erreur" -ForegroundColor Yellow
        }
    }
    exit 1
}

