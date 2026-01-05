# ===============================================================================
# VÉRIFICATION : BASE DE DONNÉES
# ===============================================================================

function Invoke-Check-Database {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-PhaseSection -PhaseNumber 5 -Title "Base de Données"
    
    $aiContext = @()  # Contexte pour l'IA
    
    try {
        $ApiUrl = if ($Config.API -and $Config.API.BaseUrl) { $Config.API.BaseUrl } else { $null }
        
        # Récupérer les headers d'authentification depuis Results si disponibles
        $authHeaders = $null
        if ($Results.API -and $Results.API.AuthHeaders) {
            $authHeaders = $Results.API.AuthHeaders
        }
        
        # Si l'authentification a réussi dans la phase 4, continuer
        if ($Results.Scores["API"] -gt 0 -and $authHeaders) {
            try {
                # Récupérer les données avec gestion d'erreur améliorée
                $devicesData = Invoke-RestMethod -Uri "$ApiUrl/api.php/devices" -Headers $authHeaders -TimeoutSec 10 -ErrorAction Stop
                $patientsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/patients" -Headers $authHeaders -TimeoutSec 10 -ErrorAction Stop
                $usersData = Invoke-RestMethod -Uri "$ApiUrl/api.php/users" -Headers $authHeaders -TimeoutSec 10 -ErrorAction Stop
                $alertsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/alerts" -Headers $authHeaders -TimeoutSec 10 -ErrorAction Stop
                
                # Extraire les données avec gestion robuste de la structure
                $devices = Get-ArrayFromApiResponse -data $devicesData -propertyName "devices"
                $patients = Get-ArrayFromApiResponse -data $patientsData -propertyName "patients"
                $users = Get-ArrayFromApiResponse -data $usersData -propertyName "users"
                $alerts = Get-ArrayFromApiResponse -data $alertsData -propertyName "alerts"
                
                Write-Host "  Dispositifs   : $($devices.Count)" -ForegroundColor White
                Write-Host "  Patients      : $($patients.Count)" -ForegroundColor White
                Write-Host "  Utilisateurs  : $($users.Count)" -ForegroundColor White
                Write-Host "  Alertes       : $($alerts.Count)" -ForegroundColor White
                
                # Dispositifs non assignes
                $unassigned = @($devices | Where-Object { -not $_.patient_id }).Count
                if ($unassigned -gt 0) {
                    Write-Warn "$unassigned dispositifs non assignes"
                    $Results.Recommendations += "Assigner les $unassigned dispositifs"
                    $aiContext += @{
                        Category = "Intégrité Base de Données"
                        Type = "Dispositifs non assignés"
                        Count = $unassigned
                        Severity = "medium"
                        NeedsAICheck = $true
                        Question = "$unassigned dispositif(s) ne sont pas assignés à un patient. Est-ce normal (dispositifs en stock) ou doivent-ils être assignés ?"
                        Recommendation = "Vérifier et assigner les dispositifs orphelins aux patients appropriés"
                    }
                }
                
                # Alertes non resolues
                $unresolvedAlerts = @($alerts | Where-Object { $_.status -eq 'unresolved' }).Count
                if ($unresolvedAlerts -gt 5) {
                    Write-Warn "$unresolvedAlerts alertes non resolues"
                    $aiContext += @{
                        Category = "Intégrité Base de Données"
                        Type = "Alertes non résolues"
                        Count = $unresolvedAlerts
                        Severity = "high"
                        NeedsAICheck = $true
                        Question = "$unresolvedAlerts alerte(s) non résolue(s) détectée(s). Doivent-elles être traitées ou sont-elles obsolètes ?"
                        Recommendation = "Examiner et résoudre ou archiver les alertes non résolues"
                    }
                }
                
                Write-OK "Base de donnees coherente"
                $Results.Scores["Database"] = 9
            } catch {
                Write-Warn "Erreur donnees BDD: $($_.Exception.Message)"
                $Results.Scores["Database"] = 7
                $aiContext += @{
                    Category = "Base de Données"
                    Type = "Erreur récupération données"
                    Error = $_.Exception.Message
                    Severity = "high"
                    NeedsAICheck = $true
                    Question = "Erreur lors de la récupération des données BDD via l'API. L'API est-elle accessible et les endpoints fonctionnent-ils correctement ?"
                }
            }
        } else {
            Write-Warn "Analyse BDD ignoree (API non accessible)"
            $Results.Scores["Database"] = 5
            $aiContext += @{
                Category = "Base de Données"
                Type = "API non accessible"
                Severity = "medium"
                NeedsAICheck = $true
                Question = "L'analyse de la base de données nécessite une API accessible. L'API doit-elle être démarrée pour l'audit ou peut-on ignorer cette vérification ?"
            }
        }
    } catch {
        Write-Err "Erreur BDD: $($_.Exception.Message)"
        $Results.Scores["Database"] = 5
        $aiContext += @{
            Category = "Base de Données"
            Type = "Erreur critique"
            Error = $_.Exception.Message
            Severity = "critical"
            NeedsAICheck = $true
            Question = "Erreur critique lors de l'analyse de la base de données. Quelle est la cause et comment la corriger ?"
        }
    }
    
    # Sauvegarder le contexte pour l'IA
    if ($aiContext.Count -gt 0) {
        if (-not $Results.AIContext) {
            $Results.AIContext = @{}
        }
        $Results.AIContext["Database"] = @{
            Questions = $aiContext
            DatabaseScore = $Results.Scores["Database"]
        }
    }
}

# Fonction helper pour extraire un tableau depuis une réponse API (si pas déjà disponible)
if (-not (Get-Command Get-ArrayFromApiResponse -ErrorAction SilentlyContinue)) {
    function Get-ArrayFromApiResponse {
        param($data, $propertyName)
        
        if ($null -eq $data) { return @() }
        
        # Si c'est directement un tableau
        if ($data -is [Array]) {
            return $data
        }
        
        # Si c'est un PSCustomObject avec la propriété
        if ($data -is [PSCustomObject]) {
            $prop = $data.PSObject.Properties[$propertyName]
            if ($null -ne $prop -and $prop.Value) {
                $value = $prop.Value
                if ($value -is [Array]) {
                    return $value
                } elseif ($value -is [PSCustomObject]) {
                    return @($value)
                }
            }
        }
        
        # Essayer d'accéder directement à la propriété
        try {
            $value = $data.$propertyName
            if ($null -ne $value) {
                if ($value -is [Array]) {
                    return $value
                } else {
                    return @($value)
                }
            }
        } catch {
            # Ignorer les erreurs
        }
        
        return @()
    }
}

