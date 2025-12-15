# ===============================================================================
# TEST API AVEC CREDENTIALS
# ===============================================================================
# Script pour tester les endpoints API avec des identifiants spécifiques
# Usage: .\audit\test-api-credentials.ps1 -Email "ymora@free.fr" -Password "Ym120879"
# ===============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$true)]
    [string]$Password,
    
    [string]$ApiUrl = "http://localhost:8000"
)

# Fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Warning $Text }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  [INFO] $Text" -ForegroundColor Gray }

Write-Section "Test des Endpoints API"
Write-Info "Email: $Email"
Write-Info "API URL: $ApiUrl"

# Endpoints à tester
$endpoints = @(
    @{Path="/api.php/devices"; Name="Dispositifs"; Method="GET"},
    @{Path="/api.php/patients"; Name="Patients"; Method="GET"},
    @{Path="/api.php/users"; Name="Utilisateurs"; Method="GET"},
    @{Path="/api.php/alerts"; Name="Alertes"; Method="GET"},
    @{Path="/api.php/firmwares"; Name="Firmwares"; Method="GET"},
    @{Path="/api.php/roles"; Name="Roles"; Method="GET"},
    @{Path="/api.php/permissions"; Name="Permissions"; Method="GET"},
    @{Path="/api.php/health"; Name="Healthcheck"; Method="GET"}
)

$endpointsTotal = 0
$endpointsOK = 0
$endpointsFailed = 0

# Authentification
Write-Info "Tentative d'authentification..."
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json
    
    $authEndpoint = "/api.php/auth/login"
    Write-Info "POST $ApiUrl$authEndpoint"
    
    # Utiliser Invoke-WebRequest pour mieux gérer les erreurs HTTP
    try {
        $authWebResponse = Invoke-WebRequest `
            -Uri "$ApiUrl$authEndpoint" `
            -Method POST `
            -Body $loginBody `
            -ContentType "application/json" `
            -TimeoutSec 15 `
            -ErrorAction Stop
        
        $authResponse = $authWebResponse.Content | ConvertFrom-Json
    } catch {
        # Gérer les erreurs HTTP
        $statusCode = "Unknown"
        $errorBody = ""
        
        if ($_.Exception.Response) {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Err "Erreur HTTP $statusCode lors de l'authentification"
            
            # Lire le corps de la réponse d'erreur avec Invoke-WebRequest
            try {
                $response = $_.Exception.Response
                $errorStream = $response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($errorStream)
                $errorBody = $reader.ReadToEnd()
                $reader.Close()
                $errorStream.Close()
                
                Write-Info "Réponse d'erreur: $errorBody"
                
                # Essayer de parser le JSON d'erreur
                try {
                    $errorJson = $errorBody | ConvertFrom-Json
                    if ($errorJson.error) {
                        Write-Err "Message d'erreur: $($errorJson.error)"
                    }
                    if ($errorJson.message) {
                        Write-Err "Message: $($errorJson.message)"
                    }
                } catch {
                    # Pas de JSON, afficher le texte brut
                }
            } catch {
                # Si la méthode précédente échoue, essayer avec ErrorDetails
                try {
                    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
                        $errorBody = $_.ErrorDetails.Message
                        Write-Info "Détails d'erreur: $errorBody"
                        try {
                            $errorJson = $errorBody | ConvertFrom-Json
                            if ($errorJson.error) {
                                Write-Err "Message d'erreur: $($errorJson.error)"
                            }
                        } catch {
                            # Pas de JSON
                        }
                    }
                } catch {
                    Write-Info "Impossible de lire la réponse d'erreur: $($_.Exception.Message)"
                }
            }
        } else {
            Write-Err "Erreur de connexion: $($_.Exception.Message)"
        }
        
        # Continuer sans authentification pour tester les endpoints publics
        $headers = @{}
        Write-Warn "Continuer sans authentification (endpoints publics uniquement)"
        $authResponse = $null
    }
    
    if ($null -eq $authResponse) {
        # Authentification a échoué, continuer sans token
        Write-Warn "Authentification échouée - test des endpoints publics uniquement"
    } elseif ($authResponse.token) {
        # Afficher la réponse complète pour debug
        Write-Info "Réponse authentification: $($authResponse | ConvertTo-Json -Depth 3)"
        $token = $authResponse.token
        $headers = @{Authorization = "Bearer $token"}
        Write-OK "Authentification réussie"
        Write-Info "Token: $($token.Substring(0, [Math]::Min(20, $token.Length)))..."
    } elseif ($authResponse.success -and $authResponse.data -and $authResponse.data.token) {
        # Format alternatif: {success: true, data: {token: ...}}
        $token = $authResponse.data.token
        $headers = @{Authorization = "Bearer $token"}
        Write-OK "Authentification réussie (format alternatif)"
        Write-Info "Token: $($token.Substring(0, [Math]::Min(20, $token.Length)))..."
    } else {
        Write-Err "Authentification échouée: pas de token dans la réponse"
        Write-Info "Réponse complète: $($authResponse | ConvertTo-Json -Depth 3)"
        # Continuer quand même pour tester les endpoints publics
        $headers = @{}
        Write-Warn "Continuer sans authentification (endpoints publics uniquement)"
    }
} catch {
    Write-Err "Erreur d'authentification: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        try {
            $statusCode = $_.Exception.Response.StatusCode.value__
            Write-Info "Code HTTP: $statusCode"
            if ($_.Exception.Response.Content) {
                $responseBody = $_.Exception.Response.Content.ReadAsStringAsync().Result
                Write-Info "Réponse serveur: $responseBody"
            }
        } catch {
            Write-Info "Impossible de lire la réponse d'erreur"
        }
    }
    # Continuer quand même pour tester les endpoints publics
    $headers = @{}
    Write-Warn "Continuer sans authentification (endpoints publics uniquement)"
}

# Tester les endpoints
Write-Section "Test des Endpoints"
foreach ($endpoint in $endpoints) {
    $endpointsTotal++
    try {
        Write-Info "Test: $($endpoint.Method) $($endpoint.Path)"
        $result = Invoke-RestMethod `
            -Uri "$ApiUrl$($endpoint.Path)" `
            -Headers $headers `
            -Method $endpoint.Method `
            -TimeoutSec 10 `
            -ErrorAction Stop
        
        Write-OK "$($endpoint.Name) - $($endpoint.Method) $($endpoint.Path)"
        if ($Verbose) {
            $resultJson = $result | ConvertTo-Json -Depth 2 -Compress
            if ($resultJson.Length -gt 200) {
                Write-Info "  Réponse: $($resultJson.Substring(0, 200))..."
            } else {
                Write-Info "  Réponse: $resultJson"
            }
        }
        $endpointsOK++
    } catch {
        $statusCode = "Unknown"
        $responseBody = ""
        if ($_.Exception.Response) {
            try {
                $statusCode = $_.Exception.Response.StatusCode.value__
                if ($_.Exception.Response.Content) {
                    $responseBody = $_.Exception.Response.Content.ReadAsStringAsync().Result
                }
            } catch {
                # Ignorer les erreurs de lecture de la réponse
            }
        }
        Write-Err "$($endpoint.Name) - Erreur: $($_.Exception.Message) (HTTP $statusCode)"
        if ($responseBody) {
            Write-Info "  Réponse serveur: $responseBody"
        }
        $endpointsFailed++
    }
}

# Résumé
Write-Section "Résumé des Tests"
Write-Host "  Total endpoints: $endpointsTotal" -ForegroundColor White
Write-Host "  Réussis: $endpointsOK" -ForegroundColor Green
Write-Host "  Échoués: $endpointsFailed" -ForegroundColor $(if ($endpointsFailed -gt 0) { "Red" } else { "Green" })

$score = if ($endpointsTotal -gt 0) { [Math]::Round(($endpointsOK / $endpointsTotal) * 10, 1) } else { 0 }
Write-Host "`n  Score API: $score/10" -ForegroundColor $(if ($score -ge 8) { "Green" } elseif ($score -ge 5) { "Yellow" } else { "Red" })

if ($endpointsFailed -eq 0) {
    Write-OK "Tous les endpoints fonctionnent correctement !"
    exit 0
} else {
    Write-Warn "Certains endpoints ont échoué"
    exit 1
}

