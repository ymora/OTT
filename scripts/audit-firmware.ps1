# ===============================================================================
# AUDIT FIRMWARE CIBLÉ - fw_ott_optimized.ino
# ===============================================================================
# Script d'audit spécifique pour le firmware
# Vérifie les points critiques selon les critères de l'audit complet
# ===============================================================================

param(
    [string]$FirmwareFile = "hardware\firmware\fw_ott_optimized\fw_ott_optimized.ino"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  AUDIT FIRMWARE - fw_ott_optimized.ino" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$issues = @()
$warnings = @()
$score = 10.0

# 1. Vérifier l'existence du fichier
$firmwarePath = Join-Path (Get-Location) $FirmwareFile
if (-not (Test-Path $firmwarePath)) {
    Write-Host "  [ERROR] Fichier firmware introuvable: $firmwarePath" -ForegroundColor Red
    $issues += "Fichier firmware principal manquant: fw_ott_optimized.ino"
    $score -= 3.0
    Write-Host ""
    Write-Host "  Score: $score/10" -ForegroundColor Red
    exit 1
}

Write-Host "  [OK] Fichier firmware trouvé: $firmwarePath" -ForegroundColor Green

# 2. Analyser le contenu
try {
    $firmwareContent = Get-Content $firmwarePath -Raw -ErrorAction Stop
    $firmwareLines = (Get-Content $firmwarePath -ErrorAction Stop).Count
    Write-Host "  [OK] Fichier lu: $firmwareLines lignes" -ForegroundColor Green
    
    # 3. Vérifier la version
    if ($firmwareContent -match 'OTT Firmware v(\d+\.\d+)') {
        $firmwareVersion = $matches[1]
        Write-Host "  [OK] Version firmware détectée: v$firmwareVersion" -ForegroundColor Green
    } elseif ($firmwareContent -match 'FIRMWARE_VERSION\s*=\s*["'']?([^"'']\s]+)') {
        $firmwareVersion = $matches[1]
        Write-Host "  [OK] Version firmware détectée: $firmwareVersion" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Version firmware non détectée" -ForegroundColor Yellow
        $warnings += "Version firmware non détectée"
        $score -= 0.5
    }
    
    # 4. Vérifier les dépendances critiques
    Write-Host ""
    Write-Host "  Vérification des dépendances..." -ForegroundColor Cyan
    $requiredIncludes = @(
        "TinyGsmClient.h",
        "ArduinoHttpClient.h",
        "ArduinoJson.h",
        "Preferences.h"
    )
    
    $missingIncludes = @()
    foreach ($include in $requiredIncludes) {
        if ($firmwareContent -match [regex]::Escape($include)) {
            Write-Host "    [OK] $include" -ForegroundColor Green
        } else {
            Write-Host "    [ERROR] $include MANQUANT" -ForegroundColor Red
            $missingIncludes += $include
        }
    }
    
    if ($missingIncludes.Count -gt 0) {
        $issues += "Dépendances manquantes: $($missingIncludes -join ', ')"
        $score -= 1.0
    }
    
    # 5. Vérifier la configuration modem
    Write-Host ""
    Write-Host "  Vérification configuration modem..." -ForegroundColor Cyan
    if ($firmwareContent -match 'TINY_GSM_MODEM_SIM7600') {
        Write-Host "    [OK] Configuration modem SIM7600 détectée (compatible A7670G)" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] Configuration modem non détectée ou différente" -ForegroundColor Yellow
        $warnings += "Configuration modem non standard"
        $score -= 0.5
    }
    
    # 6. Vérifier les fonctions critiques ajoutées récemment
    Write-Host ""
    Write-Host "  Vérification des fonctions critiques..." -ForegroundColor Cyan
    
    $criticalFunctions = @(
        @{ Name = "saveNetworkParams"; Description = "Sauvegarde paramètres réseau"; Type = "void" },
        @{ Name = "checkEpsStatus"; Description = "Vérification état EPS (LTE)"; Type = "bool" },
        @{ Name = "detectSimOperatorFromIccid"; Description = "Détection opérateur SIM"; Type = "String" },
        @{ Name = "getRecommendedApnForOperator"; Description = "APN recommandé par opérateur"; Type = "String" },
        @{ Name = "attachNetworkWithRetry"; Description = "Attachement réseau avec retry"; Type = "bool" }
    )
    
    foreach ($func in $criticalFunctions) {
        # Chercher les prototypes (déclarations) - peut être sur plusieurs lignes
        $prototypePattern = "$($func.Type)\s+$($func.Name)\s*\("
        $hasPrototype = $firmwareContent -match $prototypePattern
        
        # Chercher les implémentations (définitions) - peut être sur plusieurs lignes
        $implPattern = "$($func.Type)\s+$($func.Name)\s*\("
        $hasImplementation = $false
        
        # Chercher avec multiline pour trouver les définitions
        $lines = $firmwareContent -split "`n"
        foreach ($line in $lines) {
            if ($line -match "^\s*$($func.Type)\s+$($func.Name)\s*\(") {
                $hasImplementation = $true
                break
            }
        }
        
        if ($hasPrototype -and $hasImplementation) {
            Write-Host "    [OK] $($func.Name) - $($func.Description)" -ForegroundColor Green
        } elseif ($hasPrototype -and -not $hasImplementation) {
            Write-Host "    [ERROR] $($func.Name) déclarée mais non implémentée" -ForegroundColor Red
            $issues += "$($func.Name) déclarée mais non implémentée"
            $score -= 1.0
        } elseif (-not $hasPrototype -and $hasImplementation) {
            Write-Host "    [WARN] $($func.Name) implémentée mais pas de prototype" -ForegroundColor Yellow
            $warnings += "$($func.Name) implémentée mais pas de prototype"
            $score -= 0.3
        } else {
            Write-Host "    [WARN] $($func.Name) non trouvée" -ForegroundColor Yellow
            $warnings += "$($func.Name) non trouvée"
            $score -= 0.5
        }
    }
    
    # 7. Vérifier les appels aux fonctions (pas de code mort)
    Write-Host ""
    Write-Host "  Vérification utilisation des fonctions..." -ForegroundColor Cyan
    
    $functionUsage = @{
        "saveNetworkParams" = ($firmwareContent | Select-String -Pattern "saveNetworkParams\(" -AllMatches).Matches.Count
        "checkEpsStatus" = ($firmwareContent | Select-String -Pattern "checkEpsStatus\(" -AllMatches).Matches.Count
        "detectSimOperatorFromIccid" = ($firmwareContent | Select-String -Pattern "detectSimOperatorFromIccid\(" -AllMatches).Matches.Count
    }
    
    foreach ($func in $functionUsage.Keys) {
        $count = $functionUsage[$func]
        if ($count -gt 0) {
            Write-Host "    [OK] $func utilisé $count fois" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] $func déclarée mais jamais utilisée (code mort)" -ForegroundColor Yellow
            $warnings += "$func jamais utilisée"
            $score -= 0.3
        }
    }
    
    # 8. Vérifier la duplication de code (CEREG)
    Write-Host ""
    Write-Host "  Vérification duplication de code..." -ForegroundColor Cyan
    $ceregCalls = ($firmwareContent | Select-String -Pattern 'modem\.sendAT\(GF\("\+CEREG\?"\)\)' -AllMatches).Matches.Count
    if ($ceregCalls -gt 1) {
        Write-Host "    [WARN] Code dupliqué détecté: $ceregCalls appels directs à +CEREG? (devrait utiliser checkEpsStatus)" -ForegroundColor Yellow
        $warnings += "Code dupliqué: $ceregCalls appels directs à +CEREG? au lieu de checkEpsStatus()"
        $score -= 0.5
    } else {
        Write-Host "    [OK] Pas de duplication détectée pour +CEREG?" -ForegroundColor Green
    }
    
    # 9. Vérifier la complexité (nombre de lignes)
    Write-Host ""
    Write-Host "  Vérification complexité..." -ForegroundColor Cyan
    if ($firmwareLines -gt 500) {
        Write-Host "    [WARN] Fichier volumineux: $firmwareLines lignes (recommandé: < 500)" -ForegroundColor Yellow
        $warnings += "Fichier volumineux: $firmwareLines lignes"
        $score -= 0.3
    } else {
        Write-Host "    [OK] Taille acceptable: $firmwareLines lignes" -ForegroundColor Green
    }
    
    # 10. Vérifier les prototypes manquants
    Write-Host ""
    Write-Host "  Vérification prototypes..." -ForegroundColor Cyan
    $functionsNeedingPrototypes = @(
        @{ Name = "detectSimOperatorFromIccid"; Type = "String" },
        @{ Name = "saveNetworkParams"; Type = "void" },
        @{ Name = "checkEpsStatus"; Type = "bool" }
    )
    foreach ($func in $functionsNeedingPrototypes) {
        # Chercher le prototype dans la section des prototypes (avant les implémentations)
        $prototypePattern = "$($func.Type)\s+$($func.Name)\s*\("
        $hasPrototype = $false
        
        # Chercher dans les premières lignes (section prototypes généralement au début)
        $lines = $firmwareContent -split "`n"
        $prototypeSection = $lines[0..500] -join "`n"  # Chercher dans les 500 premières lignes
        if ($prototypeSection -match $prototypePattern) {
            $hasPrototype = $true
        }
        
        if ($hasPrototype) {
            Write-Host "    [OK] Prototype trouvé pour $($func.Name)" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] Prototype non trouvé pour $($func.Name) (peut être dans une autre section)" -ForegroundColor Yellow
            $warnings += "Prototype non trouvé pour $($func.Name)"
            $score -= 0.2
        }
    }
    
    # 11. Vérifier les envois automatiques après connexion réseau
    Write-Host ""
    Write-Host "  Vérification envois automatiques..." -ForegroundColor Cyan
    $autoSendPatterns = @(
        @{ Pattern = "NETWORK_READY"; Description = "Envoi après connexion réseau" },
        @{ Pattern = "NETWORK_RECONNECT"; Description = "Envoi après reconnexion" },
        @{ Pattern = "BOOT"; Description = "Envoi au boot" }
    )
    
    foreach ($pattern in $autoSendPatterns) {
        if ($firmwareContent -match [regex]::Escape($pattern.Pattern)) {
            Write-Host "    [OK] $($pattern.Description) détecté" -ForegroundColor Green
        } else {
            Write-Host "    [WARN] $($pattern.Description) non détecté" -ForegroundColor Yellow
            $warnings += "$($pattern.Description) non détecté"
            $score -= 0.2
        }
    }
    
    # 12. Vérifier la détection automatique des opérateurs français
    Write-Host ""
    Write-Host "  Vérification détection opérateurs..." -ForegroundColor Cyan
    $operators = @("20801", "20810", "20815", "20820")  # Orange, SFR, Free, Bouygues
    $operatorDetected = $false
    foreach ($op in $operators) {
        if ($firmwareContent -match [regex]::Escape($op)) {
            $operatorDetected = $true
            break
        }
    }
    
    if ($operatorDetected) {
        Write-Host "    [OK] Détection opérateurs français présente" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] Détection opérateurs français non trouvée" -ForegroundColor Yellow
        $warnings += "Détection opérateurs français non trouvée"
        $score -= 0.3
    }
    
    # Vérifier la gestion du roaming Free
    if ($firmwareContent -match "isFreeSim|Free.*roaming|Carte Free") {
        Write-Host "    [OK] Gestion roaming Free détectée" -ForegroundColor Green
    } else {
        Write-Host "    [WARN] Gestion roaming Free non détectée" -ForegroundColor Yellow
        $warnings += "Gestion roaming Free non détectée"
        $score -= 0.3
    }
    
} catch {
    Write-Host "  [ERROR] Erreur lors de l'analyse: $($_.Exception.Message)" -ForegroundColor Red
    $issues += "Erreur analyse firmware: $($_.Exception.Message)"
    $score -= 2.0
}

# Score final
$scoreFinal = [Math]::Max(0, [Math]::Round($score, 1))

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  RÉSULTATS" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

if ($scoreFinal -ge 9.0) {
    Write-Host "  Score: $scoreFinal/10 - EXCELLENT" -ForegroundColor Green
} elseif ($scoreFinal -ge 7.0) {
    Write-Host "  Score: $scoreFinal/10 - ACCEPTABLE" -ForegroundColor Yellow
} else {
    Write-Host "  Score: $scoreFinal/10 - PROBLÉMATIQUE" -ForegroundColor Red
}

if ($issues.Count -gt 0) {
    Write-Host ""
    Write-Host "  PROBLÈMES DÉTECTÉS:" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "    - $issue" -ForegroundColor Red
    }
}

if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "  AVERTISSEMENTS:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "    - $warning" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan

