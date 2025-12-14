# ===============================================================================
# AUDIT D'UN SEUL FICHIER - UTILISE TOUS LES MODULES D'AUDIT
# ===============================================================================
# Audit complet d'un fichier spécifique en réutilisant tous les modules d'audit
# Plus efficace que d'avoir des scripts séparés par type de fichier
# Usage: .\audit\scripts\Audit-SingleFile.ps1 -FilePath "path/to/file.ext"
# ===============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$FilePath,
    
    [string]$ProjectRoot = "",
    [switch]$ShowVerbose = $false,  # Renommé pour éviter conflit avec modules
    [switch]$AllChecks = $true  # Par défaut, exécuter toutes les vérifications pertinentes
)

# Importer les fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) if($ShowVerbose) { Write-Host "  [INFO] $Text" -ForegroundColor Gray } }

# Détecter le répertoire racine si non spécifié
if ([string]::IsNullOrEmpty($ProjectRoot)) {
    $currentPath = Get-Location
    $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
    $auditDir = Split-Path -Parent $scriptRoot
    
    # Chercher le projet
    $searchPath = $currentPath
    $found = $false
    $maxDepth = 5
    $depth = 0
    
    while ($depth -lt $maxDepth -and -not $found) {
        $indicators = @("package.json", "composer.json", "api.php", "next.config.js")
        foreach ($indicator in $indicators) {
            if (Test-Path (Join-Path $searchPath $indicator)) {
                $ProjectRoot = $searchPath
                $found = $true
                break
            }
        }
        if (-not $found) {
            $parent = Split-Path -Parent $searchPath
            if ($parent -eq $searchPath) { break }
            $searchPath = $parent
            $depth++
        }
    }
    
    if (-not $found) {
        $ProjectRoot = $currentPath
    }
}

# Résoudre le chemin du fichier
$originalFilePath = $FilePath
if (-not [System.IO.Path]::IsPathRooted($FilePath)) {
    # Chemin relatif - résoudre par rapport au projet
    $FilePath = Join-Path $ProjectRoot $FilePath
} else {
    # Chemin absolu - vérifier qu'il existe
    if (-not (Test-Path $FilePath)) {
        Write-Err "Fichier introuvable (chemin absolu): $FilePath"
        exit 1
    }
}

# Vérifier que le fichier existe
if (-not (Test-Path $FilePath)) {
    Write-Err "Fichier introuvable: $originalFilePath (résolu: $FilePath)"
    Write-Err "Répertoire projet: $ProjectRoot"
    exit 1
}

$fileInfo = Get-Item $FilePath
$fileExt = $fileInfo.Extension.ToLower()
$fileName = $fileInfo.Name

Write-Section "Audit Complet: $fileName"
Write-Info "Chemin: $FilePath"
Write-Info "Taille: $($fileInfo.Length) bytes"
Write-Info "Extension: $fileExt"

# Lire le contenu
$content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
if (-not $content) {
    Write-Err "Impossible de lire le fichier"
    exit 1
}

$lines = Get-Content $FilePath
$lineCount = $lines.Count
Write-Info "Lignes: $lineCount"

# Charger la configuration d'audit
$AUDIT_DIR = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$MODULES_DIR = Join-Path $AUDIT_DIR "modules"
$CONFIG_DIR = Join-Path $AUDIT_DIR "config"
$configFile = Join-Path $CONFIG_DIR "audit.config.ps1"

$config = @{
    Checks = @{
        Duplication = @{ Enabled = $true; Threshold = 3 }
        DeadCode = @{ Enabled = $true }
        Complexity = @{ Enabled = $true; MaxLines = 500; MaxComplexity = 10 }
        Security = @{ Enabled = $true }
        Optimizations = @{ Enabled = $true }
        Documentation = @{ Enabled = $true }
    }
}

# Charger la config si elle existe
if (Test-Path $configFile) {
    try {
        $loadedConfig = & $configFile
        if ($loadedConfig) {
            $config = $loadedConfig
        }
    } catch {
        Write-Warn "Impossible de charger la configuration, utilisation des valeurs par défaut"
    }
}

# Résultats globaux
$results = @{
    File = $FilePath
    FileName = $fileName
    Extension = $fileExt
    Lines = $lineCount
    Size = $fileInfo.Length
    Checks = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Score = 10.0
}

# Créer un tableau avec un seul fichier pour les modules
$singleFile = @($fileInfo)

# ===============================================================================
# VÉRIFICATIONS GÉNÉRIQUES (tous types de fichiers)
# ===============================================================================

Write-Section "Vérifications Générales"

# 1. Taille du fichier
if ($lineCount -gt 5000) {
    Write-Warn "Fichier très volumineux ($lineCount lignes)"
    $results.Warnings += "Fichier très volumineux - considérer la modularisation"
    $results.Score -= 0.5
} elseif ($lineCount -gt 3000) {
    Write-Info "Fichier volumineux ($lineCount lignes)"
} else {
    Write-OK "Taille du fichier acceptable ($lineCount lignes)"
}

# 2. Commentaires
$commentMatches = [regex]::Matches($content, '/\*[\s\S]*?\*/|//[^\r\n]*')
$commentLines = 0
foreach ($match in $commentMatches) {
    $commentLines += ($match.Value -split "`n").Count
}
$commentRatio = if ($lineCount -gt 0) { ($commentLines / $lineCount) * 100 } else { 0 }

if ($commentRatio -lt 5 -and $lineCount -gt 500) {
    Write-Warn "Ratio de commentaires faible ($([math]::Round($commentRatio, 1))%)"
    $results.Warnings += "Documentation insuffisante (ratio < 5%)"
    $results.Score -= 0.5
} else {
    Write-OK "Commentaires présents ($([math]::Round($commentRatio, 1))%)"
}

# ===============================================================================
# VÉRIFICATIONS SPÉCIFIQUES PAR TYPE DE FICHIER
# ===============================================================================

# Charger les modules pertinents selon le type de fichier
$modulesToLoad = @()

switch ($fileExt) {
    ".ino" {
        Write-Section "Vérifications Firmware (Arduino/ESP32)"
        
        # Vérifier setup() et loop()
        $hasSetup = $content -match 'void\s+setup\s*\('
        $hasLoop = $content -match 'void\s+loop\s*\('
        
        if (-not $hasSetup) {
            Write-Err "Fonction setup() manquante"
            $results.Issues += "Fonction setup() manquante"
            $results.Score -= 2
        } else {
            Write-OK "Fonction setup() présente"
        }
        
        if (-not $hasLoop) {
            Write-Warn "Fonction loop() manquante (peut être intentionnel)"
            $results.Warnings += "Fonction loop() manquante"
            $results.Score -= 0.5
        } else {
            Write-OK "Fonction loop() présente"
        }
        
        # Vérifier les includes
        $includes = [regex]::Matches($content, '#include\s+[<"]([^>"]+)[>"]')
        if ($includes.Count -eq 0) {
            Write-Warn "Aucun #include trouvé"
            $results.Warnings += "Aucun #include trouvé"
            $results.Score -= 1
        } else {
            Write-OK "$($includes.Count) include(s) trouvé(s)"
            foreach ($include in $includes) {
                Write-Info "  - $($include.Groups[1].Value)"
            }
        }
        
        # Vérifications ESP32 spécifiques
        $hasFreeRTOS = $content -match 'freertos|FreeRTOS|xTaskCreate|vTaskDelay'
        $hasNVS = $content -match 'Preferences|nvs_|NVS'
        $hasDeepSleep = $content -match 'esp_deep_sleep|goToSleep|deep.*sleep'
        
        if ($hasFreeRTOS) { Write-OK "Utilisation de FreeRTOS détectée" } else { Write-Info "FreeRTOS non utilisé (peut être intentionnel)" }
        if ($hasNVS) { Write-OK "Utilisation de NVS/Preferences détectée" } else { Write-Info "NVS/Preferences non utilisé" }
        if ($hasDeepSleep) { Write-OK "Mode deep sleep détecté (économie d'énergie)" } else { Write-Info "Deep sleep non utilisé (peut être intentionnel)" }
        
        # Vérifier les variables globales (détection améliorée)
        $globalVars = [regex]::Matches($content, '^(int|float|double|String|char|bool|byte|uint\d+|static|const)\s+\w+', [System.Text.RegularExpressions.RegexOptions]::Multiline)
        Write-Info "$($globalVars.Count) variable(s) globale(s) détectée(s)"
        
        # Vérifier les fonctions personnalisées
        $customFunctions = [regex]::Matches($content, '^\w+\s+\w+\s*\([^)]*\)\s*\{', [System.Text.RegularExpressions.RegexOptions]::Multiline)
        $customCount = 0
        foreach ($func in $customFunctions) {
            if ($func.Value -notmatch '^(void|int|float|double|String|char|bool|byte|uint\d+)\s+(setup|loop)\s*\(') {
                $customCount++
            }
        }
        Write-Info "$customCount fonction(s) personnalisée(s) détectée(s)"
        
        # Détection de doublons de fonctions (détection basique)
        Write-Section "Détection de redondances"
        $functionNames = @()
        $duplicateFunctions = @()
        foreach ($func in $customFunctions) {
            if ($func.Value -match '^\w+\s+(\w+)\s*\(') {
                $funcName = $matches[1]
                if ($functionNames -contains $funcName) {
                    if ($duplicateFunctions -notcontains $funcName) {
                        $duplicateFunctions += $funcName
                    }
                } else {
                    $functionNames += $funcName
                }
            }
        }
        if ($duplicateFunctions.Count -gt 0) {
            Write-Warn "Fonctions potentiellement dupliquées détectées: $($duplicateFunctions -join ', ')"
            $results.Warnings += "Fonctions dupliquées potentielles: $($duplicateFunctions -join ', ')"
            $results.Score -= 0.5
        } else {
            Write-OK "Aucune fonction dupliquée détectée"
        }
        
        # Vérifier les includes manquants ou problématiques
        $includeIssues = @()
        $commonIncludes = @("Arduino.h", "TinyGsmClient.h", "ArduinoJson.h", "Preferences.h", "Update.h")
        foreach ($include in $includes) {
            $includeName = $include.Groups[1].Value
            # Vérifier si c'est un include système qui pourrait manquer
            if ($includeName -match '^<.*>$' -and $includeName -notmatch 'Arduino|ESP32|freertos') {
                # Include système non standard - juste informatif
                Write-Info "  Include système: $includeName"
            }
        }
        if ($includeIssues.Count -gt 0) {
            foreach ($issue in $includeIssues) {
                Write-Warn $issue
                $results.Warnings += $issue
            }
        }
        
        # Vérifier les problèmes de sécurité courants
        Write-Section "Sécurité Firmware"
        $securityIssues = @()
        
        # Vérifier les mots de passe/PIN en dur
        if ($content -match 'password\s*=\s*["''][^"''\s]+["'']|PIN\s*=\s*["''][^"''\s]+["'']') {
            $securityIssues += "Mots de passe/PIN potentiellement en dur détectés"
        }
        
        # Vérifier les URLs en dur (peuvent être OK pour firmware)
        $hardcodedUrls = [regex]::Matches($content, 'https?://[^\s"'';]+')
        if ($hardcodedUrls.Count -gt 5) {
            Write-Info "Plusieurs URLs détectées ($($hardcodedUrls.Count)) - vérifier si configuration nécessaire"
        }
        
        # Vérifier l'utilisation de String() au lieu de F() ou constantes (optimisation RAM)
        $stringAllocations = [regex]::Matches($content, 'String\s*\(\s*["'']')
        if ($stringAllocations.Count -gt 20) {
            Write-Warn "Nombreuses allocations String() détectées ($($stringAllocations.Count)) - considérer F() ou constantes pour économiser RAM"
            $results.Warnings += "Optimisation RAM: $($stringAllocations.Count) allocations String() détectées"
            $results.Score -= 0.5
        }
        
        if ($securityIssues.Count -gt 0) {
            foreach ($issue in $securityIssues) {
                Write-Warn $issue
                $results.Warnings += $issue
                $results.Score -= 1
            }
        } else {
            Write-OK "Aucun problème de sécurité majeur détecté"
        }
        
        # Vérifier la version du firmware dans le code source
        $versionPatterns = @(
            'FIRMWARE_VERSION[_\w]*\s*=\s*["'']([^"'']+)["'']',
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
            if (-not $results.Statistics) {
                $results.Statistics = @{}
            }
            $results.Statistics["firmware_version_source"] = $firmwareVersion
        } else {
            Write-Warn "Version firmware non détectée dans le code source"
            $results.Warnings += "Version firmware non détectée dans le code source"
        }
        
        # Vérifier les commandes supportées dans le code
        $supportedCommands = @()
        if ($content -match 'GET_CONFIG|getConfig|handleCommand.*GET_CONFIG|handleSerialCommand.*GET_CONFIG') {
            $supportedCommands += "GET_CONFIG"
        }
        if ($content -match 'GET_STATUS|getStatus|handleCommand.*GET_STATUS|handleSerialCommand.*GET_STATUS') {
            $supportedCommands += "GET_STATUS"
        }
        if ($content -match 'UPDATE_CONFIG|updateConfig|handleCommand.*UPDATE_CONFIG') {
            $supportedCommands += "UPDATE_CONFIG"
        }
        if ($content -match 'UPDATE_CALIBRATION|updateCalibration|handleCommand.*UPDATE_CALIBRATION') {
            $supportedCommands += "UPDATE_CALIBRATION"
        }
        
        if ($supportedCommands.Count -gt 0) {
            Write-OK "Commandes supportées détectées dans le code: $($supportedCommands -join ', ')"
            if (-not $results.Statistics) {
                $results.Statistics = @{}
            }
            $results.Statistics["supported_commands"] = $supportedCommands
            $results.Recommendations += "Tester ces commandes via USB si un dispositif est connecté (utiliser le composant FirmwareInteractiveTest)"
        } else {
            Write-Warn "Aucune commande supportée détectée dans le code"
            $results.Warnings += "Aucune commande supportée détectée"
        }
        
        # Modules pertinents pour firmware
        $modulesToLoad = @("Checks-Duplication", "Checks-Complexity", "Checks-Optimizations", "Checks-Security")
    }
    
    ".js" { 
        $modulesToLoad = @("Checks-Duplication", "Checks-CodeMort", "Checks-Complexity", "Checks-Security", "Checks-Optimizations", "Checks-Performance")
    }
    
    ".jsx" { 
        $modulesToLoad = @("Checks-Duplication", "Checks-CodeMort", "Checks-Complexity", "Checks-Security", "Checks-Optimizations", "Checks-Performance", "Checks-UI")
    }
    
    ".php" { 
        $modulesToLoad = @("Checks-Duplication", "Checks-Complexity", "Checks-Security", "Checks-Optimizations")
    }
    
    ".ts" { 
        $modulesToLoad = @("Checks-Duplication", "Checks-CodeMort", "Checks-Complexity", "Checks-Security", "Checks-Optimizations")
    }
    
    ".tsx" { 
        $modulesToLoad = @("Checks-Duplication", "Checks-CodeMort", "Checks-Complexity", "Checks-Security", "Checks-Optimizations", "Checks-UI")
    }
    
    default {
        Write-Info "Type de fichier non spécifique, vérifications génériques uniquement"
        $modulesToLoad = @("Checks-Duplication", "Checks-Complexity", "Checks-Security")
    }
}

# ===============================================================================
# CHARGER ET EXÉCUTER LES MODULES D'AUDIT
# ===============================================================================

if ($AllChecks -and $modulesToLoad.Count -gt 0) {
    Write-Section "Vérifications Avancées (Modules d'Audit)"
    
    foreach ($moduleName in $modulesToLoad) {
        $modulePath = Join-Path $MODULES_DIR "$moduleName.ps1"
        
        if (Test-Path $modulePath) {
            try {
                Write-Info "Chargement module: $moduleName"
                
                # Charger d'abord Utils.ps1 si nécessaire (contient Write-Section, etc.)
                $utilsPath = Join-Path $MODULES_DIR "Utils.ps1"
                if (Test-Path $utilsPath) {
                    # Vérifier si les fonctions existent déjà (éviter les doublons)
                    if (-not (Get-Command "Write-Section" -ErrorAction SilentlyContinue)) {
                        # Charger Utils.ps1 directement (pas de scriptblock pour que les fonctions soient disponibles)
                        # Créer une copie temporaire avec $ShowVerbose au lieu de $script:Verbose
                        $utilsContent = Get-Content $utilsPath -Raw
                        $utilsContent = $utilsContent -replace '\$script:Verbose', '$ShowVerbose'
                        # Exécuter dans le scope actuel
                        Invoke-Expression $utilsContent
                    }
                }
                
                # Charger le module directement (pas de scriptblock pour que les fonctions soient disponibles)
                . $modulePath
                
                # Appeler la fonction du module
                $functionName = "Invoke-Check-$($moduleName.Replace('Checks-', ''))"
                
                if (Get-Command $functionName -ErrorAction SilentlyContinue) {
                    Write-Info "Exécution: $functionName"
                    
                    $moduleResults = @{
                        Issues = @()
                        Warnings = @()
                        Score = 10.0
                        Scores = @{}
                    }
                    
                    # Créer un ProjectInfo complet pour les modules qui en ont besoin
                    $detectedLanguage = switch ($fileExt) {
                        ".ino" { "Arduino" }
                        ".js" { "JavaScript" }
                        ".jsx" { "JavaScript" }
                        ".ts" { "TypeScript" }
                        ".tsx" { "TypeScript" }
                        ".php" { "PHP" }
                        default { "Unknown" }
                    }
                    
                    $projectInfo = @{
                        RootPath = $ProjectRoot
                        Files = $singleFile
                        FileCount = 1
                        Language = @($detectedLanguage)
                    }
                    
                    # Appeler avec un seul fichier (certains modules nécessitent ProjectInfo)
                    try {
                        & $functionName -Files $singleFile -Config $config -Results $moduleResults -ProjectInfo $projectInfo
                    } catch {
                        # Si ProjectInfo n'est pas accepté, essayer sans
                        try {
                            & $functionName -Files $singleFile -Config $config -Results $moduleResults
                        } catch {
                            Write-Warn "Erreur appel $functionName : $_"
                        }
                    }
                    
                    # Agréger les résultats
                    if ($moduleResults.Issues.Count -gt 0) {
                        $results.Issues += $moduleResults.Issues
                        $results.Score -= ($moduleResults.Issues.Count * 0.5)
                    }
                    if ($moduleResults.Warnings.Count -gt 0) {
                        $results.Warnings += $moduleResults.Warnings
                        $results.Score -= ($moduleResults.Warnings.Count * 0.2)
                    }
                    
                    $results.Checks[$moduleName] = $moduleResults
                } else {
                    Write-Warn "Fonction $functionName non trouvée dans le module (peut nécessiter Write-Section depuis Utils.ps1)"
                }
            } catch {
                Write-Warn "Erreur lors du chargement du module $moduleName : $_"
            }
        } else {
            Write-Warn "Module $moduleName non trouvé: $modulePath"
        }
    }
}

# ===============================================================================
# RÉSULTATS FINAUX
# ===============================================================================

$results.Score = [Math]::Max(0, [Math]::Min(10, $results.Score))

Write-Section "Résultats Finaux"
Write-Host "  Score: $([math]::Round($results.Score, 1))/10" -ForegroundColor $(if ($results.Score -ge 8) { "Green" } elseif ($results.Score -ge 6) { "Yellow" } else { "Red" })
Write-Host "  Fichier: $fileName" -ForegroundColor White
Write-Host "  Lignes: $lineCount" -ForegroundColor White
Write-Host "  Taille: $($fileInfo.Length) bytes" -ForegroundColor White
Write-Host "  Modules exécutés: $($modulesToLoad.Count)" -ForegroundColor White

if ($results.Issues.Count -gt 0) {
    Write-Host "`n  Problèmes ($($results.Issues.Count)):" -ForegroundColor Red
    foreach ($issue in $results.Issues) {
        Write-Host "    - $issue" -ForegroundColor Red
    }
}

if ($results.Warnings.Count -gt 0) {
    Write-Host "`n  Avertissements ($($results.Warnings.Count)):" -ForegroundColor Yellow
    foreach ($warning in $results.Warnings) {
        Write-Host "    - $warning" -ForegroundColor Yellow
    }
}

if ($results.Recommendations.Count -gt 0) {
    Write-Host "`n  Recommandations:" -ForegroundColor Cyan
    foreach ($rec in $results.Recommendations) {
        Write-Host "    - $rec" -ForegroundColor Cyan
    }
}

# Retourner les résultats
return $results

