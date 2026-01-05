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
    
    Write-PhaseSection -PhaseNumber 5 -Title "Endpoints API"
    
    $apiScore = 0
    $endpointsTotal = 0
    $endpointsOK = 0
    $script:apiAuthFailed = $false
    $aiContext = @()  # Contexte pour l'IA
    
    try {
        # Support pour Config.Api (audit.config.ps1) et Config.API (normalisé)
        $apiConfig = if ($Config.Api) { $Config.Api } elseif ($Config.API) { $Config.API } else { $null }
        $ApiUrl = if ($apiConfig -and $apiConfig.BaseUrl) { $apiConfig.BaseUrl } else { $null }
        
        # Credentials peut être dans Api/API ou au niveau racine
        $credentialsConfig = if ($apiConfig -and $apiConfig.Credentials) { 
            $apiConfig.Credentials 
        } elseif ($Config.Credentials) { 
            $Config.Credentials 
        } else { 
            $null 
        }
        $Email = if ($credentialsConfig -and $credentialsConfig.Email) { $credentialsConfig.Email } else { $null }
        $Password = if ($credentialsConfig -and $credentialsConfig.Password) { $credentialsConfig.Password } else { $null }
        
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
            $aiContext += @{
                Category = "Configuration API"
                Type = "URL API non configurée"
                Severity = "high"
                NeedsAICheck = $true
                Question = "L'URL de l'API doit-elle être configurée dans audit.config.ps1 ou via variable d'environnement API_URL ?"
                Recommendation = "Configurer Api.BaseUrl dans audit.config.ps1 ou définir API_URL"
            }
            $Results.Scores["API"] = $apiScore
            return
        }
        
        if ([string]::IsNullOrEmpty($Email) -or [string]::IsNullOrEmpty($Password)) {
            Write-Warn "Credentials non configurés - Impossible de tester l'API"
            Write-Info "  💡 Configurez AUDIT_API_EMAIL/AUDIT_API_PASSWORD (ou AUDIT_EMAIL/AUDIT_PASSWORD) ou audit.config.ps1 avec Credentials"
            $script:apiAuthFailed = $true
            $apiScore = 5
            $aiContext += @{
                Category = "Configuration API"
                Type = "Credentials non configurés"
                Severity = "high"
                NeedsAICheck = $true
                Question = "Les credentials API doivent-ils être configurés pour les tests d'audit ou peut-on tester sans authentification ?"
                Recommendation = "Configurer Credentials.Email et Credentials.Password dans audit.config.ps1"
            }
            $Results.Scores["API"] = $apiScore
            return
        }
        
        # Test de connectivité rapide avant d'essayer l'authentification
        Write-Info "Test de connectivité rapide (1s max)..."
        $apiMode = "inconnu"
        
        # Détecter le mode (Docker ou Render)
        if ($ApiUrl -match "localhost:8000|127\.0\.0\.1:8000") {
            $apiMode = "Docker"
        } elseif ($ApiUrl -match "render\.com|onrender\.com") {
            $apiMode = "Render"
        }
        
        try {
            $testUrl = "$ApiUrl/api.php/health"
            # Timeout très court pour éviter les blocages
            $null = Invoke-WebRequest -Uri $testUrl -Method GET -TimeoutSec 1 -UseBasicParsing -ErrorAction Stop
            Write-OK "API accessible ($apiMode)"
        } catch {
            # Si l'API n'est pas accessible, signaler clairement et passer
            Write-Warn "API non accessible - $apiMode non démarré ou inaccessible"
            if ($apiMode -eq "Docker") {
                Write-Info "  💡 Pour démarrer Docker: docker-compose up -d"
                Write-Info "  💡 Ou: .\scripts\dev\start_docker.ps1"
                Write-Info "  💡 Vérifier: docker ps | findstr ott-api"
            } elseif ($apiMode -eq "Render") {
                Write-Info "  💡 Vérifiez que le service Render est actif"
                Write-Info "  💡 URL testée: $ApiUrl"
            } else {
                Write-Info "  💡 Vérifiez que l'API est démarrée et accessible"
                Write-Info "  💡 URL testée: $ApiUrl"
            }
            Write-Info "  ⏭️  L'audit continue sans tester les endpoints API (score: 5/10)"
            $script:apiAuthFailed = $true
            $apiScore = 5
            $Results.Scores["API"] = $apiScore
            return
        }
        
        $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
        
        $authEndpoint = if ($apiConfig -and $apiConfig.AuthEndpoint) { $apiConfig.AuthEndpoint } else { "/api.php/auth/login" }
        $fullAuthUrl = "$ApiUrl$authEndpoint"
        Write-Info "Endpoint authentification: $fullAuthUrl"
        
        try {
            # Timeout réduit à 5 secondes pour éviter les blocages
            $authResponse = Invoke-RestMethod -Uri $fullAuthUrl -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 5 -ErrorAction Stop
            $script:authToken = $authResponse.token
            if ([string]::IsNullOrEmpty($script:authToken)) {
                throw "Token non reçu dans la réponse"
            }
            $script:authHeaders = @{Authorization = "Bearer $script:authToken"}
            Write-OK "Authentification reussie"
            
            # Utiliser la configuration ou valeurs par défaut
            if ($apiConfig -and $apiConfig.Endpoints) {
                $endpoints = $apiConfig.Endpoints
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
            
            Write-Info "Test de $($endpoints.Count) endpoint(s) (timeout 3s chacun)..."
            foreach ($endpoint in $endpoints) {
                $endpointsTotal++
                try {
                    # Timeout très court (3s) pour éviter les blocages
                    $null = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Headers $script:authHeaders -TimeoutSec 3 -ErrorAction Stop
                    Write-OK $endpoint.Name
                    $endpointsOK++
                } catch {
                    $errorMsg = $_.Exception.Message
                    # Raccourcir les messages d'erreur trop longs
                    if ($errorMsg.Length -gt 80) {
                        $errorMsg = $errorMsg.Substring(0, 80) + "..."
                    }
                    Write-Warn "$($endpoint.Name) - $errorMsg"
                    $aiContext += @{
                        Category = "Endpoints API"
                        Type = "Endpoint en échec"
                        Endpoint = $endpoint.Path
                        EndpointName = $endpoint.Name
                        Error = $errorMsg
                        Severity = "medium"
                        NeedsAICheck = $true
                        Question = "L'endpoint '$($endpoint.Path)' échoue. Est-ce normal (permissions, endpoint désactivé) ou y a-t-il un problème à corriger ?"
                    }
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
        Write-Warn "Échec connexion API: $($_.Exception.Message)"
        
        # Détecter le mode pour afficher le message approprié
        if ($ApiUrl -and ($ApiUrl -match "localhost:8000|127\.0\.0\.1:8000")) {
            Write-Info "💡 Docker non démarré ou API non accessible"
            Write-Info "   • Démarrer: docker-compose up -d"
            Write-Info "   • Ou: .\scripts\dev\start_docker.ps1"
            Write-Info "   • Vérifier: docker ps | findstr ott-api"
        } elseif ($ApiUrl -and ($ApiUrl -match "render\.com|onrender\.com")) {
            Write-Info "💡 Render non accessible ou service arrêté"
            Write-Info "   • Vérifiez le statut sur https://dashboard.render.com"
        } else {
            Write-Info "💡 API non accessible - Vérifiez que le serveur est démarré"
        }
        Write-Info "⏭️  L'audit continue (score: 5/10)"
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
    
    # Sauvegarder le contexte pour l'IA
    if ($aiContext.Count -gt 0) {
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext["API"] = @{
            Questions = $aiContext
            EndpointsOK = $endpointsOK
            EndpointsTotal = $endpointsTotal
            ApiScore = $apiScore
        }
    }
}

