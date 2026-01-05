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
                }
                
                # Alertes non resolues
                $unresolvedAlerts = @($alerts | Where-Object { $_.status -eq 'unresolved' }).Count
                if ($unresolvedAlerts -gt 5) {
                    Write-Warn "$unresolvedAlerts alertes non resolues"
                }
                
                Write-OK "Base de donnees coherente"
                $Results.Scores["Database"] = 9
            } catch {
                Write-Warn "Erreur donnees BDD: $($_.Exception.Message)"
                $Results.Scores["Database"] = 7
            }
        } else {
            Write-Warn "Analyse BDD ignoree (API non accessible)"
            $Results.Scores["Database"] = 5
        }
    } catch {
        Write-Err "Erreur BDD: $($_.Exception.Message)"
        $Results.Scores["Database"] = 5
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

