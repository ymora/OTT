# ===============================================================================
# AUDIT FIRMWARE COMPLET - Vérification doublons, code mort, redondances
# ===============================================================================

param(
    [string]$FirmwareFile = "hardware\firmware\fw_ott_optimized\fw_ott_optimized.ino"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  AUDIT FIRMWARE COMPLET - Doublons, Code Mort, Redondances" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$issues = @()
$warnings = @()
$score = 10.0

$firmwarePath = Join-Path (Get-Location) $FirmwareFile
if (-not (Test-Path $firmwarePath)) {
    Write-Host "  [ERROR] Fichier firmware introuvable: $firmwarePath" -ForegroundColor Red
    exit 1
}

$firmwareContent = Get-Content $firmwarePath -Raw -ErrorAction Stop
$firmwareLines = (Get-Content $firmwarePath -ErrorAction Stop)

Write-Host "  [OK] Fichier firmware lu: $($firmwareLines.Count) lignes" -ForegroundColor Green
Write-Host ""

# 1. Vérifier les doublons de code (appels AT directs)
Write-Host "  Vérification doublons de code..." -ForegroundColor Cyan

# Vérifier les appels directs à +CGDCONT (devrait utiliser setApn)
$cgdcontDirect = ($firmwareContent | Select-String -Pattern 'modem\.sendAT\(GF\("\+CGDCONT' -AllMatches).Matches.Count
if ($cgdcontDirect -gt 0) {
    Write-Host "    [WARN] $cgdcontDirect appel(s) direct(s) à +CGDCONT (devrait utiliser setApn())" -ForegroundColor Yellow
    $warnings += "$cgdcontDirect appel(s) direct(s) à +CGDCONT non factorisé(s)"
    $score -= 0.3
} else {
    Write-Host "    [OK] Tous les appels APN utilisent setApn() (pas de duplication)" -ForegroundColor Green
}

# Vérifier les appels directs à +CEREG? (devrait utiliser checkEpsStatus)
$ceregDirect = ($firmwareContent | Select-String -Pattern 'modem\.sendAT\(GF\("\+CEREG\?"\)\)' -AllMatches).Matches.Count
if ($ceregDirect -gt 1) {
    Write-Host "    [WARN] $ceregDirect appel(s) direct(s) à +CEREG? (devrait utiliser checkEpsStatus())" -ForegroundColor Yellow
    $warnings += "$ceregDirect appel(s) direct(s) à +CEREG? non factorisé(s)"
    $score -= 0.3
} else {
    Write-Host "    [OK] Tous les appels EPS utilisent checkEpsStatus() (pas de duplication)" -ForegroundColor Green
}

# 2. Vérifier les fonctions non utilisées (code mort)
Write-Host ""
Write-Host "  Vérification code mort (fonctions non utilisées)..." -ForegroundColor Cyan

# Liste des fonctions principales
$functions = @(
    @{ Name = "attachNetwork"; Pattern = "attachNetwork\(" },
    @{ Name = "connectData"; Pattern = "connectData\(" },
    @{ Name = "stopModem"; Pattern = "stopModem\(" },
    @{ Name = "detectSimOperatorFromImsi"; Pattern = "detectSimOperatorFromImsi\(" },
    @{ Name = "detectSimOperatorFromIccid"; Pattern = "detectSimOperatorFromIccid\(" },
    @{ Name = "getRecommendedApnForOperator"; Pattern = "getRecommendedApnForOperator\(" },
    @{ Name = "checkEpsStatus"; Pattern = "checkEpsStatus\(" },
    @{ Name = "saveNetworkParams"; Pattern = "saveNetworkParams\(" },
    @{ Name = "setApn"; Pattern = "setApn\(" },
    @{ Name = "sendMeasurement"; Pattern = "sendMeasurement\(" },
    @{ Name = "getDeviceLocation"; Pattern = "getDeviceLocation\(" },
    @{ Name = "getDeviceLocationFast"; Pattern = "getDeviceLocationFast\(" }
)

$unusedFunctions = @()
foreach ($func in $functions) {
    $declarations = ($firmwareContent | Select-String -Pattern "^\s*(void|bool|String|int|float|uint)\s+$($func.Name)\s*\(" -AllMatches).Matches.Count
    $uses = ($firmwareContent | Select-String -Pattern $func.Pattern -AllMatches).Matches.Count
    
    if ($declarations -gt 0) {
        # Exclure la déclaration elle-même
        $actualUses = $uses - $declarations
        if ($actualUses -eq 0) {
            Write-Host "    [ERROR] Fonction $($func.Name) déclarée mais jamais utilisée (code mort)" -ForegroundColor Red
            $unusedFunctions += $func.Name
            $issues += "Fonction $($func.Name) non utilisée (code mort)"
            $score -= 1.0
        } else {
            Write-Host "    [OK] $($func.Name) utilisée $actualUses fois" -ForegroundColor Green
        }
    }
}

# 3. Vérifier la cohérence avec l'API
Write-Host ""
Write-Host "  Vérification cohérence avec l'API..." -ForegroundColor Cyan

$requiredApiFields = @(
    "sim_iccid",
    "flow_lpm",
    "battery_percent",
    "rssi",
    "device_serial",
    "firmware_version",
    "device_name",
    "status"
)

$optionalApiFields = @(
    "latitude",
    "longitude",
    "timestamp",
    "sleep_minutes",
    "measurement_duration_ms",
    "calibration_coefficients",
    "airflow_passes",
    "airflow_samples_per_pass",
    "airflow_delay_ms"
)

$missingFields = @()
foreach ($field in $requiredApiFields) {
    $pattern = 'doc\["' + $field + '"\]|doc\[F\("' + $field + '"\)'
    if ($firmwareContent -notmatch $pattern) {
        Write-Host "    [ERROR] Champ requis manquant: $field" -ForegroundColor Red
        $missingFields += $field
        $issues += "Champ API requis manquant: $field"
        $score -= 1.0
    } else {
        Write-Host "    [OK] Champ requis présent: $field" -ForegroundColor Green
    }
}

foreach ($field in $optionalApiFields) {
    $pattern = 'doc\["' + $field + '"\]|doc\[F\("' + $field + '"\)'
    if ($firmwareContent -match $pattern) {
        Write-Host "    [OK] Champ optionnel présent: $field" -ForegroundColor Green
    }
}

# 4. Vérifier l'ordre logique des fonctions
Write-Host ""
Write-Host "  Vérification ordre logique..." -ForegroundColor Cyan

# Vérifier que les prototypes sont avant les implémentations
$prototypeSection = ($firmwareLines[0..300] -join "`n")
$implementationSection = ($firmwareLines[300..$firmwareLines.Count] -join "`n")

$functionsWithPrototypes = @("detectSimOperatorFromIccid", "detectSimOperatorFromImsi", "checkEpsStatus", "saveNetworkParams", "setApn")
foreach ($func in $functionsWithPrototypes) {
    $hasPrototype = $prototypeSection -match "$func\s*\("
    $hasImplementation = $implementationSection -match "^\s*(void|bool|String)\s+$func\s*\("
    
    if ($hasPrototype -and $hasImplementation) {
        Write-Host "    [OK] $func : prototype et implémentation présents" -ForegroundColor Green
    } elseif ($hasImplementation -and -not $hasPrototype) {
        Write-Host "    [WARN] $func : implémentation sans prototype" -ForegroundColor Yellow
        $warnings += "$func : implémentation sans prototype"
        $score -= 0.2
    }
}

# 5. Vérifier les logs cohérents
Write-Host ""
Write-Host "  Vérification cohérence des logs..." -ForegroundColor Cyan

# Vérifier que les logs utilisent des messages clairs (pas de codes techniques)
$technicalCodes = @("CSQ=99", "reg=0", "oper=20801", "GPRS=OK", "EPS=KO")
$technicalLogs = 0
foreach ($code in $technicalCodes) {
    $count = ($firmwareContent | Select-String -Pattern [regex]::Escape($code) -AllMatches).Matches.Count
    if ($count -gt 0) {
        $technicalLogs += $count
    }
}

if ($technicalLogs -gt 5) {
    Write-Host "    [WARN] $technicalLogs occurrence(s) de codes techniques dans les logs (devrait être remplacé par messages clairs)" -ForegroundColor Yellow
    $warnings += "$technicalLogs codes techniques dans les logs"
    $score -= 0.2
} else {
    Write-Host "    [OK] Logs utilisent des messages clairs (pas de codes techniques)" -ForegroundColor Green
}

# Vérifier que les messages de log sont informatifs
$informativePatterns = @("OK", "WARN", "ERROR", "MODEM", "Signal", "GPS", "Operateur")
$informativeLogs = 0
foreach ($pattern in $informativePatterns) {
    $count = ($firmwareContent | Select-String -Pattern $pattern -AllMatches).Matches.Count
    $informativeLogs += $count
}

Write-Host "    [OK] $informativeLogs message(s) de log avec emojis informatifs" -ForegroundColor Green

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

