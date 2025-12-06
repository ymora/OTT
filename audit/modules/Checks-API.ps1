# ===============================================================================
# VÉRIFICATION : API
# ===============================================================================

function Invoke-Check-API {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-Section "[6/13] Endpoints API - Tests Fonctionnels"
    
    try {
        if (-not $Config.API.BaseUrl) {
            Write-Warn "API non configurée - tests ignorés"
            $Results.Scores["API"] = 5
            return
        }
        
        $endpointsTotal = 0
        $endpointsOK = 0
        
        # Authentification si nécessaire
        $headers = @{}
        if ($Config.API.Auth) {
            try {
                $loginBody = @{
                    email = $Config.API.Credentials.Email
                    password = $Config.API.Credentials.Password
                } | ConvertTo-Json
                
                $authResponse = Invoke-RestMethod `
                    -Uri "$($Config.API.BaseUrl)$($Config.API.Auth.Endpoint)" `
                    -Method POST `
                    -Body $loginBody `
                    -ContentType "application/json" `
                    -TimeoutSec 15
                
                if ($authResponse.token) {
                    $headers = @{Authorization = "Bearer $($authResponse.token)"}
                    Write-OK "Authentification réussie"
                }
            } catch {
                Write-Warn "Échec authentification - tests API ignorés"
                $Results.Scores["API"] = 5
                return
            }
        }
        
        # Tester les endpoints
        if ($Config.API.EndpointsToTest) {
            foreach ($endpoint in $Config.API.EndpointsToTest) {
                $endpointsTotal++
                try {
                    $result = Invoke-RestMethod `
                        -Uri "$($Config.API.BaseUrl)$($endpoint.Path)" `
                        -Headers $headers `
                        -Method $endpoint.Method `
                        -TimeoutSec 10
                    
                    Write-OK "$($endpoint.Name) - $($endpoint.Method) $($endpoint.Path)"
                    $endpointsOK++
                } catch {
                    Write-Err "$($endpoint.Name) - Erreur: $($_.Exception.Message)"
                }
            }
        }
        
        if ($endpointsTotal -gt 0) {
            $apiScore = [Math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
            $Results.Scores["API"] = $apiScore
        } else {
            $Results.Scores["API"] = 5
        }
    } catch {
        Write-Err "Erreur tests API: $($_.Exception.Message)"
        $Results.Scores["API"] = 0
    }
}

