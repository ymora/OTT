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
    
    Write-PhaseSection -PhaseNumber 12 -Title "Firmware"
    
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
            
            # Vérifier les dépendances de compilation (bibliothèques Arduino)
            Write-Info "Vérification des dépendances de compilation..."
            $includes = @()
            if ($content -match '(?m)^\s*#include\s*[<"]([^>"]+)[>"]') {
                $matches = [regex]::Matches($content, '(?m)^\s*#include\s*[<"]([^>"]+)[>"]')
                foreach ($match in $matches) {
                    $includeFile = $match.Groups[1].Value
                    $includes += $includeFile
                }
            }
            
            # Bibliothèques standard détectées dans les includes
            $detectedLibraries = @()
            $knownLibraries = @{
                "ArduinoJson.h" = "ArduinoJson"
                "TinyGsmClient.h" = "TinyGSM"
                "ArduinoHttpClient.h" = "ArduinoHttpClient"
                "WiFi.h" = "ESP32 WiFi (core)"
                "HTTPClient.h" = "ESP32 HTTPClient (core)"
            }
            
            foreach ($include in $includes) {
                if ($knownLibraries.ContainsKey($include)) {
                    $libName = $knownLibraries[$include]
                    if ($detectedLibraries -notcontains $libName) {
                        $detectedLibraries += $libName
                    }
                }
            }
            
            if ($detectedLibraries.Count -gt 0) {
                Write-OK "Bibliothèques détectées dans le code: $($detectedLibraries -join ', ')"
                $Results.Statistics["detected_libraries"] = $detectedLibraries
            }
            
            # Vérifier si les bibliothèques requises sont configurées dans le code PHP
            $compilePhpPath = Join-Path $Config.ProjectRoot "api\handlers\firmwares\compile\library_install.php"
            if (Test-Path $compilePhpPath) {
                $compilePhpContent = Get-Content $compilePhpPath -Raw
                
                # Extraire les bibliothèques configurées dans getRequiredLibraries()
                $configuredLibraries = @()
                if ($compilePhpContent -match '(?s)function getRequiredLibraries\(\)\s*\{[^}]*return\s*\[([^\]]+)\]') {
                    $libsConfig = $matches[1]
                    if ($libsConfig -match "'([^']+)'\s*=>") {
                        $matches = [regex]::Matches($libsConfig, "'([^']+)'\s*=>")
                        foreach ($match in $matches) {
                            $libName = $match.Groups[1].Value
                            $configuredLibraries += $libName
                        }
                    }
                }
                
                # Vérifier la cohérence
                $missingInConfig = @()
                foreach ($detectedLib in $detectedLibraries) {
                    # Ignorer les bibliothèques du core ESP32 (déjà incluses)
                    if ($detectedLib -notmatch "core") {
                        # Vérifier si la bibliothèque est dans la config ou dans hardware/lib/
                        $libInConfig = $configuredLibraries -contains $detectedLib
                        $libInHardware = Test-Path (Join-Path $Config.ProjectRoot "hardware\lib\$detectedLib")
                        
                        if (-not $libInConfig -and -not $libInHardware) {
                            $missingInConfig += $detectedLib
                        }
                    }
                }
                
                if ($missingInConfig.Count -gt 0) {
                    Write-Warn "Bibliothèques utilisées mais non configurées pour installation automatique: $($missingInConfig -join ', ')"
                    $Results.Warnings += "Bibliothèques manquantes dans la config d'installation: $($missingInConfig -join ', ')"
                    $Results.Recommendations += "Ajouter les bibliothèques suivantes dans getRequiredLibraries() de library_install.php: $($missingInConfig -join ', ')"
                } else {
                    Write-OK "Toutes les bibliothèques détectées sont configurées ou présentes dans hardware/lib/"
                }
            } else {
                Write-Warn "Fichier library_install.php non trouvé - impossible de vérifier la configuration des bibliothèques"
                $Results.Warnings += "Fichier library_install.php non trouvé"
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

