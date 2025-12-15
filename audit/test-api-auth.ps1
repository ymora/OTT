# Script de test pour vérifier l'authentification de tous les endpoints API
# Usage: .\audit\test-api-auth.ps1 -Email "ymora@free.fr" -Password "Ym120879" -ApiUrl "http://localhost:8000"

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    [Parameter(Mandatory=$true)]
    [string]$Password,
    [string]$ApiUrl = "http://localhost:8000"
)

Write-Host "🔍 Test d'authentification des endpoints API" -ForegroundColor Cyan
Write-Host "API URL: $ApiUrl" -ForegroundColor Gray
Write-Host ""

# Authentification
Write-Host "🔐 Authentification..." -ForegroundColor Yellow
try {
    $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $token = $authResponse.token
    $authHeaders = @{Authorization = "Bearer $token"}
    Write-Host "✅ Authentification réussie" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Erreur d'authentification: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Liste des endpoints à tester
$endpoints = @(
    # Endpoints qui DEVRAIENT nécessiter une authentification
    @{Path="/api.php/devices"; Method="GET"; Name="Liste dispositifs"; ShouldAuth=$true},
    @{Path="/api.php/devices/1"; Method="GET"; Name="Détail dispositif"; ShouldAuth=$true},
    @{Path="/api.php/patients"; Method="GET"; Name="Liste patients"; ShouldAuth=$true},
    @{Path="/api.php/alerts"; Method="GET"; Name="Liste alertes"; ShouldAuth=$true},
    @{Path="/api.php/measurements/latest"; Method="GET"; Name="Dernières mesures"; ShouldAuth=$true},
    @{Path="/api.php/reports/overview"; Method="GET"; Name="Rapport overview"; ShouldAuth=$true},
    @{Path="/api.php/users"; Method="GET"; Name="Liste utilisateurs"; ShouldAuth=$true},
    @{Path="/api.php/roles"; Method="GET"; Name="Liste rôles"; ShouldAuth=$true},
    @{Path="/api.php/permissions"; Method="GET"; Name="Liste permissions"; ShouldAuth=$true},
    @{Path="/api.php/firmwares"; Method="GET"; Name="Liste firmwares"; ShouldAuth=$true},
    @{Path="/api.php/audit"; Method="GET"; Name="Logs audit"; ShouldAuth=$true},
    @{Path="/api.php/logs"; Method="GET"; Name="Logs système"; ShouldAuth=$true},
    @{Path="/api.php/notifications/preferences"; Method="GET"; Name="Préférences notifications"; ShouldAuth=$true},
    @{Path="/api.php/notifications/queue"; Method="GET"; Name="Queue notifications"; ShouldAuth=$true},
    
    # Endpoints qui NE DEVRAIENT PAS nécessiter d'authentification (IoT devices)
    @{Path="/api.php/devices/measurements"; Method="POST"; Name="POST mesure (IoT)"; ShouldAuth=$false; Body=@{sim_iccid="TEST123"; flow_lpm=1.5; battery_percent=85}},
    @{Path="/api.php/devices/TEST123/commands/pending"; Method="GET"; Name="Commandes pending (IoT)"; ShouldAuth=$false},
    @{Path="/api.php/devices/TEST123/config"; Method="GET"; Name="Config dispositif (IoT)"; ShouldAuth=$false},
    @{Path="/api.php/health"; Method="GET"; Name="Health check"; ShouldAuth=$false},
    
    # Endpoints d'authentification (pas besoin d'auth)
    @{Path="/api.php/auth/login"; Method="POST"; Name="Login"; ShouldAuth=$false; Body=@{email=$Email; password=$Password}}
)

$results = @()
$total = $endpoints.Count
$current = 0

foreach ($endpoint in $endpoints) {
    $current++
    $progress = [math]::Round(($current / $total) * 100, 0)
    Write-Progress -Activity "Test des endpoints" -Status "$($endpoint.Name)" -PercentComplete $progress
    
    $url = "$ApiUrl$($endpoint.Path)"
    $method = $endpoint.Method
    $name = $endpoint.Name
    $shouldAuth = $endpoint.ShouldAuth
    
    # Test SANS authentification
    try {
        $params = @{
            Uri = $url
            Method = $method
            TimeoutSec = 5
            ErrorAction = "Stop"
        }
        
        if ($endpoint.Body) {
            $params.Body = ($endpoint.Body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }
        
        $responseWithoutAuth = Invoke-WebRequest @params -UseBasicParsing
        $statusWithoutAuth = $responseWithoutAuth.StatusCode
        $hasAuthWithoutToken = $false
    } catch {
        $statusWithoutAuth = $_.Exception.Response.StatusCode.value__
        $hasAuthWithoutToken = ($statusWithoutAuth -eq 401)
    }
    
    # Test AVEC authentification
    try {
        $params = @{
            Uri = $url
            Method = $method
            Headers = $authHeaders
            TimeoutSec = 5
            ErrorAction = "Stop"
        }
        
        if ($endpoint.Body) {
            $params.Body = ($endpoint.Body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }
        
        $responseWithAuth = Invoke-WebRequest @params -UseBasicParsing
        $statusWithAuth = $responseWithAuth.StatusCode
        $worksWithAuth = ($statusWithAuth -ge 200 -and $statusWithAuth -lt 300)
    } catch {
        $statusWithAuth = $_.Exception.Response.StatusCode.value__
        $worksWithAuth = $false
    }
    
    # Analyser le résultat
    $issue = $null
    if ($shouldAuth) {
        # Endpoint qui DEVRAIT nécessiter une auth
        if (-not $hasAuthWithoutToken) {
            $issue = "❌ VULNÉRABILITÉ: Endpoint accessible sans authentification (devrait retourner 401)"
        } elseif (-not $worksWithAuth) {
            $issue = "⚠️ Endpoint nécessite auth mais ne fonctionne pas avec token valide"
        } else {
            $issue = "✅ OK: Authentification requise et fonctionne"
        }
    } else {
        # Endpoint qui NE DEVRAIT PAS nécessiter d'auth
        if ($hasAuthWithoutToken) {
            $issue = "⚠️ Endpoint bloque sans auth alors qu'il devrait être accessible (IoT device)"
        } elseif (-not $worksWithAuth) {
            $issue = "⚠️ Endpoint ne fonctionne ni avec ni sans auth"
        } else {
            $issue = "✅ OK: Accessible sans auth (comme prévu pour IoT)"
        }
    }
    
    $results += [PSCustomObject]@{
        Name = $name
        Path = $endpoint.Path
        Method = $method
        ShouldAuth = $shouldAuth
        StatusWithoutAuth = $statusWithoutAuth
        StatusWithAuth = $statusWithAuth
        Issue = $issue
    }
    
    Write-Host "$issue - $name ($method $($endpoint.Path))" -ForegroundColor $(if ($issue -like "❌*") { "Red" } elseif ($issue -like "⚠️*") { "Yellow" } else { "Green" })
}

Write-Progress -Activity "Test des endpoints" -Completed

Write-Host ""
Write-Host "📊 Résumé des résultats:" -ForegroundColor Cyan
Write-Host ""

$vulnerabilities = $results | Where-Object { $_.Issue -like "❌*" }
$warnings = $results | Where-Object { $_.Issue -like "⚠️*" }
$ok = $results | Where-Object { $_.Issue -like "✅*" }

Write-Host "❌ Vulnérabilités (endpoints accessibles sans auth): $($vulnerabilities.Count)" -ForegroundColor Red
$vulnerabilities | ForEach-Object {
    Write-Host "   - $($_.Name) ($($_.Method) $($_.Path))" -ForegroundColor Red
}

Write-Host ""
Write-Host "⚠️ Avertissements: $($warnings.Count)" -ForegroundColor Yellow
$warnings | ForEach-Object {
    Write-Host "   - $($_.Name) ($($_.Method) $($_.Path)): $($_.Issue)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Endpoints OK: $($ok.Count)" -ForegroundColor Green

Write-Host ""
Write-Host "💡 Commande F12 pour obtenir le token:" -ForegroundColor Cyan
Write-Host "   localStorage.getItem('authToken')" -ForegroundColor White
Write-Host ""
Write-Host "   Ou dans la console:" -ForegroundColor Gray
Write-Host "   JSON.parse(localStorage.getItem('authToken'))" -ForegroundColor White

