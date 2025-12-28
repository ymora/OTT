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
    
    Write-Section "[7/23] Endpoints API - Tests Fonctionnels"
    
    $apiScore = 0
    $endpointsTotal = 0
    $endpointsOK = 0
    $script:apiAuthFailed = $false
    
    try {
        $ApiUrl = if ($Config.API -and $Config.API.BaseUrl) { $Config.API.BaseUrl } else { $null }
        $Email = if ($Config.API -and $Config.API.Credentials -and $Config.API.Credentials.Email) { $Config.API.Credentials.Email } else { $null }
        $Password = if ($Config.API -and $Config.API.Credentials -and $Config.API.Credentials.Password) { $Config.API.Credentials.Password } else { $null }
        
        Write-Info "Connexion API..."
        Write-Info "URL API: $ApiUrl"
        Write-Info "Email: $Email"
        
        # Vérifier si Docker est démarré (si l'URL est localhost:8000)
        if ($ApiUrl -match "localhost:8000" -or $ApiUrl -match "127\.0\.0\.1:8000") {
            Write-Info "Vérification Docker (API locale)..."
            try {
                $dockerPs = docker ps --filter "name=ott-api" --format "{{.Names}}" 2>$null
                if ($dockerPs -match "ott-api") {
                    Write-OK "Conteneur Docker ott-api détecté"
                } else {
                    Write-Warn "Conteneur Docker ott-api non détecté"
                    Write-Info "  💡 Pour démarrer Docker: docker-compose up -d"
                    Write-Info "  💡 Ou utilisez: .\scripts\dev\start_docker.ps1"
                }
            } catch {
                Write-Info "  Docker CLI non disponible ou erreur de vérification"
            }
        }
        
        if ([string]::IsNullOrEmpty($ApiUrl)) {
            Write-Warn "URL API non configurée - Impossible de tester l'API"
            Write-Info "  💡 Configurez API_URL ou audit.config.ps1 avec Api.BaseUrl"
            $script:apiAuthFailed = $true
            $apiScore = 5
            $Results.Scores["API"] = $apiScore
            return
        }
        
        if ([string]::IsNullOrEmpty($Email) -or [string]::IsNullOrEmpty($Password)) {
            Write-Warn "Credentials non configurés - Impossible de tester l'API"
            Write-Info "  💡 Configurez AUDIT_EMAIL/AUDIT_PASSWORD ou audit.config.ps1 avec Credentials"
            $script:apiAuthFailed = $true
            $apiScore = 5
            $Results.Scores["API"] = $apiScore
            return
        }
        
        $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
        
        $authEndpoint = if ($Config.API -and $Config.API.AuthEndpoint) { $Config.API.AuthEndpoint } else { "/api.php/auth/login" }
        $fullAuthUrl = "$ApiUrl$authEndpoint"
        Write-Info "Endpoint authentification: $fullAuthUrl"
        
        try {
            $authResponse = Invoke-RestMethod -Uri $fullAuthUrl -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15 -ErrorAction Stop
            $script:authToken = $authResponse.token
            if ([string]::IsNullOrEmpty($script:authToken)) {
                throw "Token non reçu dans la réponse"
            }
            $script:authHeaders = @{Authorization = "Bearer $script:authToken"}
            Write-OK "Authentification reussie"
            
            # Utiliser la configuration ou valeurs par défaut
            if ($Config.API -and $Config.API.Endpoints) {
                $endpoints = $Config.API.Endpoints
            } else {
                $endpoints = @(
                    @{Path="/api.php/devices"; Name="Dispositifs"},
                    @{Path="/api.php/patients"; Name="Patients"},
                    @{Path="/api.php/users"; Name="Utilisateurs"},
                    @{Path="/api.php/alerts"; Name="Alertes"},
                    @{Path="/api.php/firmwares"; Name="Firmwares"},
                    @{Path="/api.php/roles"; Name="Roles"},
                    @{Path="/api.php/permissions"; Name="Permissions"},
                    @{Path="/api.php/health"; Name="Healthcheck"}
                )
            }
            
            foreach ($endpoint in $endpoints) {
                $endpointsTotal++
                try {
                    $result = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Headers $script:authHeaders -TimeoutSec 10 -ErrorAction Stop
                    Write-OK $endpoint.Name
                    $endpointsOK++
                } catch {
                    Write-Err "$($endpoint.Name) - Erreur: $($_.Exception.Message)"
                }
            }
            
            if ($endpointsTotal -gt 0) {
                $apiScore = [math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
            } else {
                $apiScore = 10
            }
            
        } catch {
            $errorMsg = $_.Exception.Message
            if ($_.Exception.Response) {
                try {
                    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                    $responseBody = $reader.ReadToEnd()
                    $reader.Close()
                    if ($responseBody) {
                        $errorMsg = "$errorMsg - Réponse: $responseBody"
                    }
                } catch {
                    # Ignorer les erreurs de lecture de la réponse
                }
            }
            Write-Warn "Echec authentification: $errorMsg"
            Write-Info "URL testée: $fullAuthUrl"
            if ($ApiUrl -match "localhost:8000" -or $ApiUrl -match "127\.0\.0\.1:8000") {
                Write-Info "💡 L'API est sur Docker - Vérifiez que Docker est démarré:"
                Write-Info "   • docker-compose up -d"
                Write-Info "   • Ou: .\scripts\dev\start_docker.ps1"
                Write-Info "   • Vérifier: docker ps | findstr ott-api"
            } else {
                Write-Info "L'audit continue - Vérifiez que le serveur API est démarré et accessible"
            }
            $script:apiAuthFailed = $true
            $apiScore = 5
        }
        
    } catch {
        Write-Warn "Echec connexion API: $($_.Exception.Message)"
        if ($ApiUrl -match "localhost:8000" -or $ApiUrl -match "127\.0\.0\.1:8000") {
            Write-Info "💡 L'API est sur Docker - Vérifiez que Docker est démarré:"
            Write-Info "   • docker-compose up -d"
            Write-Info "   • Ou: .\scripts\dev\start_docker.ps1"
            Write-Info "   • Vérifier: docker ps | findstr ott-api"
        } else {
            Write-Info "L'audit continue - Vérifiez que le serveur API est démarré et accessible"
        }
        $script:apiAuthFailed = $true
        $apiScore = 5
    }
    
    $Results.Scores["API"] = $apiScore
    
    # Stocker les variables globales pour les autres phases
    if ($script:authHeaders) {
        $Results.API = @{
            AuthHeaders = $script:authHeaders
            AuthToken = $script:authToken
            ApiUrl = $ApiUrl
            EndpointsOK = $endpointsOK
            EndpointsTotal = $endpointsTotal
        }
    }
}

