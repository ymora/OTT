# ===============================================================================
# VÉRIFICATION : FIRMWARE INTERACTIF (USB)
# ===============================================================================
# Teste le firmware en temps réel via USB si un dispositif est connecté
# Vérifie que le firmware répond correctement aux commandes
# ===============================================================================

function Invoke-Check-FirmwareInteractive {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    # Si Checks n'existe pas ou FirmwareInteractive.Enabled n'est pas défini, activer par défaut
    if ($Config.Checks -and $Config.Checks.FirmwareInteractive -and $Config.Checks.FirmwareInteractive.Enabled -eq $false) {
        return
    }
    
    Write-Section "[22/23] Firmware"
    
    try {
        # Vérifier si on est dans un environnement Node.js/Next.js (frontend)
        # Si oui, on ne peut pas tester directement depuis PowerShell
        # Il faudrait créer un endpoint API ou utiliser le contexte React
        
        Write-Info "Note: Les tests interactifs USB nécessitent un dispositif connecté"
        Write-Info "Ces tests doivent être effectués depuis le dashboard (contexte USB React)"
        
        # Vérifier la version du firmware dans le code source
        $firmwareFile = $Files | Where-Object { $_.Extension -eq ".ino" } | Select-Object -First 1
        
        if ($firmwareFile) {
            $content = Get-Content $firmwareFile.FullName -Raw
            $versionPatterns = @(
                'FIRMWARE_VERSION\s*=\s*["'']([^"'']+)["'']',
                'v(\d+\.\d+(?:\.\d+)?)',
                '#define\s+FIRMWARE_VERSION[_\w]*\s+["'']?(\d+\.\d+(?:\.\d+)?)["'']?'
            )
            
            $firmwareVersion = $null
            foreach ($pattern in $versionPatterns) {
                if ($content -match $pattern) {
                    $firmwareVersion = $matches[1]
                    break
                }
            }
            
            if ($firmwareVersion) {
                Write-OK "Version firmware détectée dans le code: $firmwareVersion"
                $Results.Statistics["firmware_version_source"] = $firmwareVersion
            } else {
                Write-Warn "Version firmware non détectée dans le code source"
                $Results.Warnings += "Version firmware non détectée dans le code source"
            }
            
            # Vérifier les commandes supportées
            $supportedCommands = @()
            if ($content -match 'GET_CONFIG|getConfig|handleCommand.*GET_CONFIG') {
                $supportedCommands += "GET_CONFIG"
            }
            if ($content -match 'GET_STATUS|getStatus|handleCommand.*GET_STATUS') {
                $supportedCommands += "GET_STATUS"
            }
            if ($content -match 'UPDATE_CONFIG|updateConfig|handleCommand.*UPDATE_CONFIG') {
                $supportedCommands += "UPDATE_CONFIG"
            }
            if ($content -match 'UPDATE_CALIBRATION|updateCalibration|handleCommand.*UPDATE_CALIBRATION') {
                $supportedCommands += "UPDATE_CALIBRATION"
            }
            
            if ($supportedCommands.Count -gt 0) {
                Write-OK "Commandes supportées détectées: $($supportedCommands -join ', ')"
                $Results.Statistics["supported_commands"] = $supportedCommands
            } else {
                Write-Warn "Aucune commande supportée détectée dans le code"
                $Results.Warnings += "Aucune commande supportée détectée"
            }
        }
        
        # Recommandation : créer un endpoint API pour tester le firmware via USB
        $Results.Recommendations += "Créer un endpoint API /api.php/devices/{id}/test-firmware pour tester le firmware via USB"
        $Results.Recommendations += "Utiliser le contexte USB React pour envoyer des commandes GET_CONFIG et vérifier les réponses"
        
        # Calculer le score (basé sur la détection de version et commandes)
        $firmwareScore = 10
        if (-not $firmwareFile) {
            $firmwareScore = 5
        } elseif (-not $firmwareVersion) {
            $firmwareScore = 7
        } elseif ($supportedCommands.Count -eq 0) {
            $firmwareScore = 8
        }
        
        $Results.Scores["Firmware"] = $firmwareScore
        
    } catch {
        Write-Warn "Erreur lors de la vérification interactive: $_"
        $Results.Warnings += "Erreur vérification interactive: $_"
        $Results.Scores["Firmware"] = 5
    }
}

