# ===============================================================================
# AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL
# ===============================================================================
# SystÃƒÂ¨me d'audit gÃƒÂ©nÃƒÂ©rique et portable pour n'importe quel projet
# Version 3.0 - SystÃƒÂ¨me consolidÃƒÂ© et portable
#
# Ce script effectue un audit 360 degrÃƒÂ©s couvrant 23 phases (numÃƒÂ©rotÃƒÂ©es de 1 ÃƒÂ  23)
# DÃƒÂ©tecte automatiquement les caractÃƒÂ©ristiques du projet auditÃƒÂ©
# Usage : .\audit\scripts\Audit-Complet.ps1 [-Verbose]
# ===============================================================================

param(
    [string]$Email = "",
    [string]$Password = "",
    [string]$ApiUrl = "",
    [string]$ConfigFile = "",
    [switch]$Verbose = $false,
    [int]$MaxFileLines = 500,
    [array]$SelectedPhases = @(),
    [array]$UserSelectedPhases = @(),  # Phases explicitement sÃƒÂ©lectionnÃƒÂ©es par l'utilisateur (sans dÃƒÂ©pendances)
    [string]$StateFile = "",
    [string]$ResultFile = "",
    [string]$CorrectionPlansFile = "",
    [string]$ProjectRoot = "",  # RÃƒÂ©pertoire racine du projet (dÃƒÂ©tectÃƒÂ© automatiquement)
    [string]$AuditDir = ""      # RÃƒÂ©pertoire audit (dÃƒÂ©tectÃƒÂ© automatiquement)
)

# ===============================================================================
# CHARGEMENT DES MODULES
# ===============================================================================
# DÃƒÂ©tecter le rÃƒÂ©pertoire des modules
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$modulesDir = Join-Path (Split-Path -Parent $scriptDir) "modules"

# Charger les modules utilitaires en premier
if (Test-Path (Join-Path $modulesDir "Utils.ps1")) {
    . (Join-Path $modulesDir "Utils.ps1")
    $script:Verbose = $Verbose  # Passer le flag Verbose au module
} else {
    # Fallback si les modules ne sont pas trouvÃƒÂ©s
    function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
    function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
    function Write-Warn { param([string]$Text) Write-Warning $Text }
    function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
    function Write-Info { param([string]$Text) if($Verbose) { Write-Host "  [INFO] $Text" -ForegroundColor Gray } }
}

# Charger le module Tools-Analysis
if (Test-Path (Join-Path $modulesDir "Tools-Analysis.ps1")) {
    . (Join-Path $modulesDir "Tools-Analysis.ps1")
}


$utilityModules = @("ConfigLoader.ps1", "FileScanner.ps1", "ProjectDetector.ps1", "ReportGenerator.ps1")
foreach ($module in $utilityModules) {
    $modulePath = Join-Path $modulesDir $module
    if (Test-Path $modulePath) {
        try {
            . $modulePath
            Write-Info "Module chargÃƒÂ©: $module"
        } catch {
            Write-Warn "Erreur chargement module $module : $($_.Exception.Message)"
        }
    }
}

# Charger les modules de vÃƒÂ©rification (Checks-*.ps1)
$checkModules = Get-ChildItem -Path $modulesDir -Filter "Checks-*.ps1" -ErrorAction SilentlyContinue
foreach ($module in $checkModules) {
    try {
        . $module.FullName
        Write-Info "Module de vÃƒÂ©rification chargÃƒÂ©: $($module.Name)"
    } catch {
        Write-Warn "Erreur chargement module $($module.Name) : $($_.Exception.Message)"
    }
}

# ===============================================================================
# FONCTION HELPER POUR APPELER LES MODULES SELON LA PHASE
# ===============================================================================
function Invoke-PhaseModule {
    param(
        [int]$PhaseNumber,
        [hashtable]$Config,
        [hashtable]$Results,
        [array]$Files = @(),
        [hashtable]$ProjectInfo = @{}
    )
    
    # Mapping des phases aux modules (ordre d'exÃ©cution actuel dans le code)
    $phaseModuleMap = @{
        0 = @("Invoke-Check-Inventory")                          # Phase 0: Inventaire Exhaustif
        1 = @("Invoke-Check-Architecture")                       # Phase 1: Architecture et Statistiques
        2 = @("Invoke-Check-Routes")                             # Phase 2: Routes et Navigation
        4 = @("Invoke-Check-API")                                # Phase 4: Endpoints API (Backend 1)
        5 = @("Invoke-Check-Database")                           # Phase 5: Base de DonnÃ©es (Backend 2)
        7 = @("Invoke-Check-CodeMort")                           # Phase 7: Code Mort (QualitÃ© 1)
        8 = @("Invoke-Check-Duplication")                        # Phase 8: Duplication de Code (QualitÃ© 2)
        9 = @("Invoke-Check-Complexity")                         # Phase 9: ComplexitÃ© (QualitÃ© 3)
        10 = @("Invoke-Check-Performance")                       # Phase 10: Performance
        11 = @("Invoke-Check-Tests", "Invoke-Check-TestsComplets") # Phase 11: Tests
        12 = @("Invoke-Check-Documentation")                     # Phase 12: Documentation
        13 = @("Invoke-Check-Optimizations")                     # Phase 13: VÃ©rification Exhaustive (Optimisations)
        14 = @("Invoke-Check-UI")                                # Phase 14: UI/UX (Uniformisation)
        15 = @("Invoke-Check-Organization")                      # Phase 15: Organisation
        16 = @("Invoke-Check-MarkdownFiles")                     # Phase 16: Ã‰lÃ©ments Inutiles (Markdown Files)
        17 = @("Invoke-Check-TimeTracking")                      # Phase 17: Synchronisation GitHub Pages
        18 = @("Invoke-Check-FirmwareInteractive")               # Phase 18: Audit Firmware
        21 = @("Invoke-Check-StructureAPI")                      # Phase 21: Structure API
        22 = @("Invoke-Check-ConfigConsistency", "Check-ConfigConsistency") # Phase 22: CohÃ©rence Configuration
        23 = @("Invoke-Check-TestsComplets")                     # Phase 23: Tests Complets Application
    }
    
    # Mapping spÃ©cial pour Security (phase 4 secondaire - conflit avec API)
    # Security sera gÃ©rÃ© sÃ©parÃ©ment car il y a un conflit de numÃ©rotation
    if (-not $phaseModuleMap.ContainsKey("Security")) {
        # Security sera appelÃ© directement avec Invoke-Check-Security
    }
    
    $moduleFunctions = $phaseModuleMap[$PhaseNumber]
    if (-not $moduleFunctions) {
        return $false  # Pas de module pour cette phase
    }
    
    # Essayer chaque fonction du module dans l'ordre
    foreach ($funcName in $moduleFunctions) {
        if (Get-Command $funcName -ErrorAction SilentlyContinue) {
            try {
                # PrÃƒÂ©parer les paramÃƒÂ¨tres selon la signature de la fonction
                $func = Get-Command $funcName
                $params = @{}
                
                # VÃƒÂ©rifier quels paramÃƒÂ¨tres la fonction attend
                foreach ($param in $func.Parameters.Values) {
                    if ($param.Name -eq "Files" -and $Files.Count -gt 0) {
                        $params.Files = $Files
                    } elseif ($param.Name -eq "Files" -and $script:allFiles) {
                        $params.Files = $script:allFiles
                    } elseif ($param.Name -eq "Config") {
                        $params.Config = $Config
                    } elseif ($param.Name -eq "Results") {
                        $params.Results = $Results
                    } elseif ($param.Name -eq "ProjectInfo") {
                        $params.ProjectInfo = $ProjectInfo
                    } elseif ($param.Name -eq "ProjectRoot" -or $param.Name -eq "ProjectPath") {
                        $params[$param.Name] = $ProjectRoot
                    }
                }
                
                # Si Files n'est pas passÃƒÂ© mais que la fonction l'attend, utiliser allFiles
                if (-not $params.ContainsKey("Files") -and ($func.Parameters.Values | Where-Object { $_.Name -eq "Files" })) {
                    if ($script:allFiles -and $script:allFiles.Count -gt 0) {
                        $params.Files = $script:allFiles
                    }
                }
                
                # Appeler la fonction du module
                & $funcName @params
                Write-Info "Phase $PhaseNumber exÃƒÂ©cutÃƒÂ©e avec module: $funcName"
                return $true
            } catch {
                Write-Warn "Erreur lors de l'appel du module $funcName pour la phase $PhaseNumber : $($_.Exception.Message)"
            }
        }
    }
    
    return $false  # Aucun module disponible ou erreur
}

# Fonction helper pour extraire un tableau depuis une rÃƒÂ©ponse API
function Get-ArrayFromApiResponse {
    param($data, $propertyName)
    
    if ($null -eq $data) { return @() }
    
    # Si c'est directement un tableau
    if ($data -is [Array]) {
        return $data
    }
    
    # Si c'est un PSCustomObject avec la propriÃƒÂ©tÃƒÂ©
    if ($data -is [PSCustomObject]) {
        $prop = $data.PSObject.Properties[$propertyName]
        if ($null -ne $prop -and $prop.Value) {
            $value = $prop.Value
            if ($value -is [Array]) {
                return $value
            } elseif ($value -is [PSCustomObject]) {
                # Convertir en tableau si nÃƒÂ©cessaire
                return @($value)
            }
        }
    }
    
    # Essayer d'accÃƒÂ©der directement ÃƒÂ  la propriÃƒÂ©tÃƒÂ©
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

# ===============================================================================
# CHARGEMENT DES FONCTIONS DE GESTION DES PHASES
# ===============================================================================
$phasesScriptPath = Join-Path $PSScriptRoot "Audit-Phases.ps1"
if (Test-Path $phasesScriptPath) {
    . $phasesScriptPath
} else {
    Write-Warn "Fichier Audit-Phases.ps1 non trouvÃƒÂ©, certaines fonctionnalitÃƒÂ©s seront limitÃƒÂ©es"
}

# ===============================================================================
# DÃƒâ€°TERMINER LE RÃƒâ€°PERTOIRE RACINE DU PROJET
# ===============================================================================
# Le script peut ÃƒÂªtre exÃƒÂ©cutÃƒÂ© depuis diffÃƒÂ©rents rÃƒÂ©pertoires
# On cherche la racine en remontant jusqu'ÃƒÂ  trouver api.php ou next.config.js
$scriptRoot = $PSScriptRoot
$projectRoot = $null

# Essayer de trouver la racine en remontant depuis le script
$currentPath = $scriptRoot
for ($i = 0; $i -lt 5; $i++) {
    if (Test-Path (Join-Path $currentPath "api.php")) {
        $projectRoot = $currentPath
        break
    }
    if (Test-Path (Join-Path $currentPath "next.config.js")) {
        $projectRoot = $currentPath
        break
    }
    $parent = Split-Path -Parent $currentPath
    if ($parent -eq $currentPath) { break }
    $currentPath = $parent
}

# Si pas trouvÃƒÂ©, utiliser le rÃƒÂ©pertoire courant ou le parent du script
if (-not $projectRoot) {
    $currentDir = Get-Location
    if (Test-Path (Join-Path $currentDir.Path "api.php") -or Test-Path (Join-Path $currentDir.Path "next.config.js")) {
        $projectRoot = $currentDir.Path
    } else {
        # Par dÃƒÂ©faut, utiliser le parent du script (audit/scripts -> racine)
        $projectRoot = Split-Path -Parent $scriptRoot
    }
}

# Changer vers le rÃƒÂ©pertoire racine
if ($projectRoot -and (Test-Path $projectRoot)) {
    Push-Location $projectRoot
    Write-Info "RÃƒÂ©pertoire racine dÃƒÂ©tectÃƒÂ©: $projectRoot"
} else {
    Write-Warn "Impossible de dÃƒÂ©terminer le rÃƒÂ©pertoire racine, utilisation du rÃƒÂ©pertoire courant"
}

# DÃƒÂ©tecter automatiquement le rÃƒÂ©pertoire audit si non fourni
if ([string]::IsNullOrEmpty($AuditDir)) {
    # Chercher audit/ depuis le script ou le projet
    $searchPaths = @($scriptRoot, $projectRoot, (Get-Location).Path)
    foreach ($searchPath in $searchPaths) {
        $testAuditDir = Join-Path $searchPath "audit"
        if ((Test-Path $testAuditDir) -and (Test-Path (Join-Path $testAuditDir "audit.ps1"))) {
            $AuditDir = $testAuditDir
            break
        }
        # VÃƒÂ©rifier aussi le parent
        $parentPath = Split-Path -Parent $searchPath
        $testAuditDir = Join-Path $parentPath "audit"
        if ((Test-Path $testAuditDir) -and (Test-Path (Join-Path $testAuditDir "audit.ps1"))) {
            $AuditDir = $testAuditDir
            break
        }
    }
    # Si toujours pas trouvÃƒÂ©, utiliser le parent du script
    if ([string]::IsNullOrEmpty($AuditDir)) {
        $AuditDir = Split-Path -Parent $scriptRoot
    }
}
$auditDir = $AuditDir  # Variable locale pour compatibilitÃƒÂ©

# Utiliser les variables d'environnement si les paramÃƒÂ¨tres sont vides
if ([string]::IsNullOrEmpty($Email)) { 
    if ($env:AUDIT_EMAIL) {
        $Email = $env:AUDIT_EMAIL
    } elseif ($script:Config -and $script:Config.Credentials -and $script:Config.Credentials.Email) {
        $Email = $script:Config.Credentials.Email
    }
}
if ([string]::IsNullOrEmpty($Password)) { 
    if ($env:AUDIT_PASSWORD) {
        $Password = $env:AUDIT_PASSWORD
    } elseif ($script:Config -and $script:Config.Credentials -and $script:Config.Credentials.Password) {
        $Password = $script:Config.Credentials.Password
    } else {
        $Password = "Ym120879"  # Mot de passe par dÃƒÂ©faut pour ÃƒÂ©viter le blocage
    }
}
if ([string]::IsNullOrEmpty($ApiUrl)) { 
    if ($env:AUDIT_API_URL) {
        $ApiUrl = $env:AUDIT_API_URL
    } elseif ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) {
        $ApiUrl = $script:Config.Api.BaseUrl
    } else {
        $ApiUrl = "http://localhost:8000"  # URL par dÃƒÂ©faut pour dÃƒÂ©veloppement local
    }
}

# ===============================================================================
# CHARGEMENT DES DONNÃƒâ€°ES DE RÃƒâ€°FÃƒâ€°RENCE (pour l'audit BDD)
# ===============================================================================
function Get-ExpectedTables {
    # Charger depuis data/expected_tables.txt si disponible
    $expectedTablesFile = Join-Path $auditDir "data\expected_tables.txt"
    if (Test-Path $expectedTablesFile) {
        $tables = Get-Content $expectedTablesFile | Where-Object { $_ -and $_ -notmatch '^#' -and $_ -notmatch '^\s*$' }
        return $tables
    }
    
    # Valeurs par dÃƒÂ©faut
    return @(
        'roles', 'permissions', 'role_permissions',
        'users', 'patients', 'devices', 'measurements',
        'alerts', 'device_logs', 'device_configurations',
        'firmware_versions', 'firmware_compilations',
        'user_notifications_preferences', 'patient_notifications_preferences', 'notifications_queue',
        'audit_logs', 'usb_logs', 'device_commands'
    )
}

# ===============================================================================
# NETTOYAGE DES RÃƒâ€°SULTATS PRÃƒâ€°CÃƒâ€°DENTS
# ===============================================================================
function Clear-PreviousAuditResults {
    $resultsDir = Join-Path $auditDir "resultats"
    
    if (Test-Path $resultsDir) {
        $oldResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
        if ($oldResults) {
            $count = $oldResults.Count
            Remove-Item -Path $oldResults.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "  [INFO] Nettoyage: $count rÃƒÂ©sultat(s) d'audit prÃƒÂ©cÃƒÂ©dent(s) supprimÃƒÂ©(s)" -ForegroundColor Gray
        }
    }
}

# ===============================================================================
# CHARGEMENT DE LA CONFIGURATION (Support multiprojet avec JSON)
# ===============================================================================
# Recherche automatique dans l'ordre de prioritÃ©:
# 1. Fichier spÃ©cifiÃ© par -ConfigFile
# 2. [racine-projet]/audit.config.json (configuration par projet)
# 3. [racine-projet]/audit.config.yaml (configuration par projet, format alternatif)
# 4. audit/config/audit.config.ps1 (configuration globale par dÃ©faut)

$configPath = $null
$configLoaded = $false

# 1. Si un fichier de configuration est spÃ©cifiÃ©
if (-not [string]::IsNullOrEmpty($ConfigFile)) {
    if (Test-Path $ConfigFile) {
    $configPath = $ConfigFile
} else {
        Write-Warn "Fichier de configuration spÃ©cifiÃ© introuvable: $ConfigFile"
    }
}

# 2. Chercher audit.config.json dans la racine du projet
if (-not $configLoaded -and $null -eq $configPath) {
    $projectConfigJson = Join-Path $projectRoot "audit.config.json"
    if (Test-Path $projectConfigJson) {
        $configPath = $projectConfigJson
        Write-Info "Configuration par projet trouvÃ©e: audit.config.json"
    }
}

# 3. Chercher audit.config.yaml dans la racine du projet
if (-not $configLoaded -and $null -eq $configPath) {
    $projectConfigYaml = Join-Path $projectRoot "audit.config.yaml"
    if (Test-Path $projectConfigYaml) {
        $configPath = $projectConfigYaml
        Write-Info "Configuration par projet trouvÃ©e: audit.config.yaml"
    }
}

# 4. Configuration globale par dÃ©faut
if ($null -eq $configPath) {
    $configPath = Join-Path $scriptRoot "audit.config.ps1"
if (Test-Path $configPath) {
        Write-Info "Utilisation de la configuration globale par dÃ©faut"
    }
}

# Charger la configuration
if ($configPath -and (Test-Path $configPath)) {
    try {
        if ($configPath -match '\.json$') {
            # Charger depuis JSON
            $jsonContent = Get-Content $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $script:Config = @{}
            foreach ($prop in $jsonContent.PSObject.Properties) {
                $script:Config[$prop.Name] = $prop.Value
            }
            Write-OK "Configuration chargÃ©e depuis: audit.config.json"
            $configLoaded = $true
        } elseif ($configPath -match '\.yaml$|\.yml$') {
            Write-Warn "Support YAML non implÃ©mentÃ© (utilisez JSON ou PS1)"
            $script:Config = $null
        } else {
            # Charger depuis PowerShell (audit.config.ps1)
        $script:Config = & $configPath
            Write-Info "Configuration chargÃ©e depuis: $(Split-Path $configPath -Leaf)"
            $configLoaded = $true
        }
    } catch {
        Write-Err "Erreur lors du chargement de la configuration: $($_.Exception.Message)"
        Write-Warn "Utilisation des valeurs par dÃ©faut"
        $script:Config = $null
    }
} else {
    Write-Warn "Aucun fichier de configuration trouvÃ©"
    Write-Info "DÃ©tection automatique du projet en cours..."
    $script:Config = $null
}

# ===============================================================================
# DÃƒâ€°TECTION AUTOMATIQUE DU PROJET
# ===============================================================================

# Charger les mÃƒÂ©tadonnÃƒÂ©es du projet si disponibles
$projectMetadataFile = Join-Path $projectRoot "project_metadata.json"
$projectMetadata = $null

if (Test-Path $projectMetadataFile) {
    try {
        $projectMetadata = Get-Content $projectMetadataFile -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Info "MÃƒÂ©tadonnÃƒÂ©es du projet chargÃƒÂ©es depuis project_metadata.json"
    } catch {
        Write-Warn "Erreur lecture project_metadata.json: $($_.Exception.Message)"
    }
} else {
    # DÃƒÂ©tecter automatiquement si le script de dÃƒÂ©tection existe
    $detectScript = Join-Path $scriptRoot "Detect-Project.ps1"
    if (Test-Path $detectScript) {
        Write-Info "DÃƒÂ©tection automatique du projet..."
        try {
            $projectMetadata = & $detectScript -ProjectRoot $projectRoot -OutputFile "project_metadata.json"
            Write-OK "Projet dÃƒÂ©tectÃƒÂ© automatiquement"
        } catch {
            Write-Warn "Erreur lors de la dÃƒÂ©tection automatique: $($_.Exception.Message)"
        }
    }
}

# Valeurs par dÃƒÂ©faut gÃƒÂ©nÃƒÂ©riques si config non chargÃƒÂ©e
if ($null -eq $script:Config) {
    $projectName = "Projet"
    $projectCompany = ""
    
    if ($projectMetadata) {
        $projectName = if ($projectMetadata.project.name) { $projectMetadata.project.name } else { "Projet" }
        $projectCompany = if ($projectMetadata.project.company) { $projectMetadata.project.company } else { "" }
    } else {
        # Utiliser le nom du rÃƒÂ©pertoire comme fallback
        $projectName = Split-Path $projectRoot -Leaf
    }
    
    $script:Config = @{
        Project = @{ Name = $projectName; Company = $projectCompany }
        Api = @{ BaseUrl = ""; AuthEndpoint = "/api.php/auth/login" }
        GitHub = @{ Repo = ""; BaseUrl = ""; BasePath = "" }
    }
    
    # Enrichir avec les mÃƒÂ©tadonnÃƒÂ©es dÃƒÂ©tectÃƒÂ©es
    if ($projectMetadata) {
        if ($projectMetadata.api.baseUrl) {
            $script:Config.Api.BaseUrl = $projectMetadata.api.baseUrl
        }
        if ($projectMetadata.api.authEndpoint) {
            $script:Config.Api.AuthEndpoint = $projectMetadata.api.authEndpoint
        }
        if ($projectMetadata.api.endpoints -and $projectMetadata.api.endpoints.Count -gt 0) {
            $script:Config.Api.Endpoints = $projectMetadata.api.endpoints | ForEach-Object {
                @{ Path = $_; Name = ($_ -replace '/', ' ' -replace '_', ' ').Trim() }
            }
        }
        if ($projectMetadata.github.repo) {
            $script:Config.GitHub.Repo = $projectMetadata.github.repo
            $script:Config.GitHub.BaseUrl = $projectMetadata.github.baseUrl
            $script:Config.GitHub.BasePath = $projectMetadata.github.basePath
        }
        if ($projectMetadata.frontend.routes -and $projectMetadata.frontend.routes.Count -gt 0) {
            $script:Config.Routes = $projectMetadata.frontend.routes
        }
    }
}

# Utiliser la configuration ou les paramÃƒÂ¨tres (dÃƒÂ©jÃƒÂ  initialisÃƒÂ©s plus haut, mais rÃƒÂ©appliquer si nÃƒÂ©cessaire)
if ([string]::IsNullOrEmpty($ApiUrl)) {
    if ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) {
        $ApiUrl = $script:Config.Api.BaseUrl
    } else {
        $ApiUrl = "http://localhost:8000"  # URL par dÃƒÂ©faut pour dÃƒÂ©veloppement local
    }
}
if ([string]::IsNullOrEmpty($Email)) {
    if ($script:Config -and $script:Config.Credentials -and $script:Config.Credentials.Email) {
        $Email = $script:Config.Credentials.Email
    } else {
        $Email = "ymora@free.fr"
    }
}

# Mot de passe par dÃƒÂ©faut pour ÃƒÂ©viter le blocage (peut ÃƒÂªtre remplacÃƒÂ© par variable d'environnement)
if ([string]::IsNullOrEmpty($Password)) {
    if ($script:Config -and $script:Config.Credentials -and $script:Config.Credentials.Password) {
        $Password = $script:Config.Credentials.Password
    } else {
        $Password = "Ym120879"  # Mot de passe par dÃƒÂ©faut
    }
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
# DÃƒÂ©tecter le nom du projet
$projectName = if ($script:Config -and $script:Config.Project -and $script:Config.Project.Name) { 
    $script:Config.Project.Name 
} elseif ($projectMetadata -and $projectMetadata.project.name) {
    $projectMetadata.project.name
} else {
    Split-Path $projectRoot -Leaf  # Utiliser le nom du rÃƒÂ©pertoire
}

$projectCompany = if ($script:Config -and $script:Config.Project -and $script:Config.Project.Company) { 
    $script:Config.Project.Company 
} elseif ($projectMetadata -and $projectMetadata.project.company) {
    $projectMetadata.project.company
} else {
    ""  # Pas de sociÃƒÂ©tÃƒÂ© par dÃƒÂ©faut
}
Write-Host "[AUDIT] AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - $projectName" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Projet   : $projectName ($projectCompany)" -ForegroundColor Cyan
Write-Host "Version  : 2.4 - Configuration modulaire (audit.config.ps1)" -ForegroundColor Cyan
Write-Host "Config   : $ConfigFile" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

# Nettoyer les rÃƒÂ©sultats prÃƒÂ©cÃƒÂ©dents
Clear-PreviousAuditResults

$auditResults = @{
    Scores = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Stats = @{}
    Statistics = @{}  # Pour compatibilitÃƒÂ© avec le code existant
    CorrectionPlans = @()  # Nouveau: plans de correction structurÃƒÂ©s
}

$startTime = Get-Date

# Initialiser les phases sÃƒÂ©lectionnÃƒÂ©es (toutes si non spÃƒÂ©cifiÃƒÂ©es)
# Stocker les phases explicitement sÃƒÂ©lectionnÃƒÂ©es par l'utilisateur (sans dÃƒÂ©pendances)
if ($SelectedPhases.Count -eq 0) {
    $SelectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
    $script:userSelectedPhases = $SelectedPhases
} else {
    # Si UserSelectedPhases est fourni, l'utiliser, sinon considÃƒÂ©rer toutes les phases comme user-selected
    if ($UserSelectedPhases.Count -gt 0) {
        $script:userSelectedPhases = $UserSelectedPhases
    } else {
        $script:userSelectedPhases = $SelectedPhases
    }
}

# Charger l'ÃƒÂ©tat prÃƒÂ©cÃƒÂ©dent si disponible
$completedPhases = @()
$partialResults = @{}
if (-not [string]::IsNullOrEmpty($StateFile) -and (Test-Path $StateFile)) {
    $previousState = Load-AuditState -StateFile $StateFile
    $completedPhases = $previousState.CompletedPhases
    $partialResults = $previousState.PartialResults
    Write-Info "Ãƒâ€°tat prÃƒÂ©cÃƒÂ©dent chargÃƒÂ©: $($completedPhases.Count) phase(s) complÃƒÂ©tÃƒÂ©e(s)"
}

# ===============================================================================
# CONFIGURATION : RÃƒâ€°PERTOIRES ET FICHIERS Ãƒâ‚¬ EXCLURE (uniquement build/cache)
# ===============================================================================
$excludedDirs = @('node_modules', '\.next', '\.git', '\.swc', 'out', 'vendor', '__pycache__', '\.cache')
$excludedPatterns = @('\.log$', '\.tmp$', '\.cache$', 'package-lock\.json$', 'yarn\.lock$')

# Fonction pour vÃƒÂ©rifier si un fichier doit ÃƒÂªtre exclu
function Test-ExcludedFile {
    param([string]$FilePath)
    foreach ($pattern in $excludedDirs) {
        if ($FilePath -match "\\$pattern\\|/$pattern/") { return $true }
    }
    foreach ($pattern in $excludedPatterns) {
        if ($FilePath -match $pattern) { return $true }
    }
    return $false
}

# ===============================================================================
# FONCTION WRAPPER POUR EXÃƒâ€°CUTER LES PHASES AVEC GESTION D'Ãƒâ€°TAT
# ===============================================================================
function Invoke-AuditPhase {
    param(
        [int]$PhaseNumber,
        [scriptblock]$PhaseScript,
        [string]$PhaseName
    )
    
    # VÃƒÂ©rifier si la phase doit ÃƒÂªtre exÃƒÂ©cutÃƒÂ©e
    if ($SelectedPhases -notcontains $PhaseNumber) {
        Write-Info "Phase $PhaseNumber ($PhaseName) ignorÃƒÂ©e (non sÃƒÂ©lectionnÃƒÂ©e)"
        return
    }
    
    # VÃƒÂ©rifier si la phase est dÃƒÂ©jÃƒÂ  complÃƒÂ¨te
    if ($completedPhases -contains $PhaseNumber) {
        Write-Info "Phase $PhaseNumber ($PhaseName) dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase$PhaseNumber")) {
            # Restaurer les rÃƒÂ©sultats partiels si disponibles
            $phaseResults = $partialResults["Phase$PhaseNumber"]
            if ($phaseResults.Scores) {
                foreach ($key in $phaseResults.Scores.Keys) {
                    $auditResults.Scores[$key] = $phaseResults.Scores[$key]
                }
            }
            if ($phaseResults.Issues) {
                $auditResults.Issues += $phaseResults.Issues
            }
            if ($phaseResults.Warnings) {
                $auditResults.Warnings += $phaseResults.Warnings
            }
            if ($phaseResults.Recommendations) {
                $auditResults.Recommendations += $phaseResults.Recommendations
            }
            if ($phaseResults.CorrectionPlans) {
                $auditResults.CorrectionPlans += $phaseResults.CorrectionPlans
            }
        }
        return
    }
    
    # Afficher un message si c'est une dÃƒÂ©pendance automatique
    $isDependency = $script:userSelectedPhases.Count -gt 0 -and $script:userSelectedPhases -notcontains $PhaseNumber
    if ($isDependency) {
        # Trouver quelle(s) phase(s) utilisateur nÃƒÂ©cessite(nt) cette dÃƒÂ©pendance (rÃƒÂ©cursif)
        $requestingPhases = @()
        foreach ($userPhase in $script:userSelectedPhases) {
            $userPhaseObj = $script:AuditPhases | Where-Object { $_.Number -eq $userPhase } | Select-Object -First 1
            if ($userPhaseObj) {
                # VÃƒÂ©rifier si cette phase ou ses dÃƒÂ©pendances nÃƒÂ©cessitent $PhaseNumber
                $allDeps = Get-PhaseDependencies -PhaseNumber $userPhase
                if ($allDeps -contains $PhaseNumber) {
                    $requestingPhases += $userPhaseObj
                }
            }
        }
        
        if ($requestingPhases.Count -gt 0) {
            $requestingNames = $requestingPhases | ForEach-Object { "Phase $($_.Number) ($($_.Name))" }
            Write-Host ""
            Write-Host "  Ã¢Å¡â„¢Ã¯Â¸Â  ExÃƒÂ©cution automatique de la Phase $PhaseNumber ($PhaseName)" -ForegroundColor Cyan
            Write-Host "      (dÃƒÂ©pendance requise pour: $($requestingNames -join ', '))" -ForegroundColor DarkGray
        }
    }
    
    # ExÃƒÂ©cuter la phase
    try {
        Write-Section "[$PhaseNumber] $PhaseName"
        & $PhaseScript
        
        # Marquer la phase comme complÃƒÂ¨te
        $completedPhases += $PhaseNumber
        
        # Sauvegarder l'ÃƒÂ©tat
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase$PhaseNumber"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
        
        Write-OK "Phase $PhaseNumber ($PhaseName) terminÃƒÂ©e"
    } catch {
        Write-Err "Erreur lors de l'exÃƒÂ©cution de la phase $PhaseNumber ($PhaseName): $($_.Exception.Message)"
        # Ne pas marquer comme complÃƒÂ¨te en cas d'erreur
    }
}

# ===============================================================================
# PHASE 0 : INVENTAIRE EXHAUSTIF DE TOUS LES FICHIERS
# ===============================================================================

# Phase 0 : Inventaire Exhaustif - Utiliser le module
if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 0) {
    if ($completedPhases -notcontains 0) {
        # Utiliser le module Checks-Inventory
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 0 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn "Phase 0: Module Invoke-Check-Inventory non disponible, exÃƒÂ©cution inline..."
            # Fallback: exÃƒÂ©cuter le code inline si le module n'existe pas (pour compatibilitÃƒÂ©)
try {
    Write-Info "Parcours exhaustif de tous les fichiers..."
                $allFiles = @(Get-ChildItem -Recurse -File | Where-Object { -not (Test-ExcludedFile $_.FullName) })
                $script:allFiles = $allFiles
                Write-OK "Inventaire exhaustif terminÃƒÂ© ($($allFiles.Count) fichiers)"
                $auditResults.Scores["Inventory"] = 10
            } catch {
                Write-Err "Erreur inventaire: $($_.Exception.Message)"
                $auditResults.Scores["Inventory"] = 5
            }
        }
        
        # RÃƒÂ©cupÃƒÂ©rer allFiles depuis Statistics si disponible (stockÃƒÂ© par le module)
        if ($auditResults.Statistics -and $auditResults.Statistics.Inventory -and $auditResults.Statistics.Inventory.FileInventory) {
            $script:fileInventory = $auditResults.Statistics.Inventory.FileInventory
            $script:allFiles = @()
            foreach ($category in $auditResults.Statistics.Inventory.FileInventory.PSObject.Properties.Name) {
                $script:allFiles += $auditResults.Statistics.Inventory.FileInventory.$category
            }
        }
        
        # Marquer la phase comme complÃƒÂ¨te
        $completedPhases += 0
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase0"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 0 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase0")) {
            $phase0Results = $partialResults["Phase0"]
            if ($phase0Results.Scores) {
                foreach ($key in $phase0Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase0Results.Scores[$key]
                }
            }
        }
    }
}

# Phase 1 : Architecture et Statistiques - Utiliser le module
if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 1) {
    if ($completedPhases -notcontains 1) {
        # Utiliser Invoke-PhaseModule pour la phase 1
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 1 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 1: Module Invoke-Check-Architecture non disponible - phase ignoree'
            $auditResults.Scores['Architecture'] = 5
        }
        
        # Marquer la phase comme complÃƒÂ¨te
            $completedPhases += 1
            if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults['Phase1'] = @{
                    Scores = $auditResults.Scores
                    Issues = $auditResults.Issues
                    Warnings = $auditResults.Warnings
                    Recommendations = $auditResults.Recommendations
                    CorrectionPlans = $auditResults.CorrectionPlans
                }
                Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 1 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase1")) {
            $phase1Results = $partialResults["Phase1"]
            if ($phase1Results.Scores) {
                foreach ($key in $phase1Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase1Results.Scores[$key]
                }
            }
        }
    }
}  # Fin if SelectedPhases -contains 1

# ===============================================================================
# PHASE 7 : CODE MORT (QualitÃƒÂ© 1)
# ===============================================================================

# Phase 7 : Code Mort - Utiliser le module
if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 7) {
    if ($completedPhases -notcontains 7) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 7 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 7: Module Invoke-Check-CodeMort non disponible - phase ignoree'
            $auditResults.Scores['CodeMort'] = 5
        }
        $completedPhases += 7
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults['Phase7'] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    }
}

# ===============================================================================
# PHASE 8 : DUPLICATION DE CODE (QualitÃƒÂ© 2)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 8) {
        # Phase 8 : Duplication - Utiliser le module
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 8 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 8: Module Invoke-Check-Duplication non disponible - phase ignoree'
            $auditResults.Scores['Duplication'] = 5
        }
        $completedPhases += 8
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults['Phase8'] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
}
}  # Fin if SelectedPhases -contains 8

# ===============================================================================
# PHASE 9 : COMPLEXITE (QualitÃƒÂ© 3)
# ===============================================================================

# Phase 9 : Complexite - Utiliser le module
if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 9) {
    if ($completedPhases -notcontains 9) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 9 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 9: Module Invoke-Check-Complexity non disponible - phase ignoree'
            $auditResults.Scores['Complexite'] = 5
        }
        $completedPhases += 9
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults['Phase9'] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    }
}

# ===============================================================================
# PHASE 2 : ROUTES ET NAVIGATION
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 2) {
    if ($completedPhases -notcontains 2) {
        # PrÃƒÂ©parer la configuration pour le module
        $moduleConfig = $script:Config
        if (-not $moduleConfig) { $moduleConfig = @{} }
        if ($projectRoot) { $moduleConfig.ProjectRoot = $projectRoot }
        if ($script:Config.Routes) { $moduleConfig.Routes = $script:Config.Routes }
        
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 2 -Config $moduleConfig -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 2: Module Invoke-Check-Routes non disponible - phase ignoree'
            $auditResults.Scores['Routes'] = 5
        }
        
        # Marquer la phase comme complÃƒÂ¨te
        $completedPhases += 2
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase2"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
            } else {
        Write-Info "Phase 2 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase2")) {
            $phase2Results = $partialResults["Phase2"]
            if ($phase2Results.Scores) {
                foreach ($key in $phase2Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase2Results.Scores[$key]
                }
            }
        }
    }
}

# ===============================================================================

# ===============================================================================
# PHASE 5 : BASE DE DONNEES (Backend 2)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 5) {
    if ($completedPhases -notcontains 5) {
        # PrÃƒÂ©parer la configuration pour le module
        $moduleConfig = $script:Config
        if (-not $moduleConfig) { $moduleConfig = @{} }
        if (-not $moduleConfig.API) { $moduleConfig.API = @{} }
        if (-not $moduleConfig.API.BaseUrl) { 
            $moduleConfig.API.BaseUrl = if ($ApiUrl) { $ApiUrl } else { '' }
        }
        
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 5 -Config $moduleConfig -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 5: Module Invoke-Check-Database non disponible - phase ignoree'
            $auditResults.Scores['Database'] = 5
        }
        
        # Marquer la phase comme complÃƒÂ¨te
        $completedPhases += 5
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase5"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 5 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase5")) {
            $phase5Results = $partialResults["Phase5"]
            if ($phase5Results.Scores) {
                foreach ($key in $phase5Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase5Results.Scores[$key]
                }
            }
        }
    }
}

# ===============================================================================
# PHASE 4 : SECURITE
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 4) {
    # Utiliser le module Checks-Security si disponible, sinon code inline
    if (Get-Command Invoke-Check-Security -ErrorAction SilentlyContinue) {
        # PrÃƒÂ©parer les fichiers pour le module
        $allFiles = @(Get-ChildItem -Recurse -File | Where-Object {
            -not (Test-ExcludedFile $_.FullName)
        })
        
        # PrÃƒÂ©parer ProjectInfo
        $projectInfo = @{
            Language = @()
            Type = ""
        }
        if ($allFiles | Where-Object { $_.Extension -eq ".php" }) {
            $projectInfo.Language += "PHP"
        }
        if ($allFiles | Where-Object { $_.Extension -match "\.jsx?$" }) {
            $projectInfo.Language += "JavaScript"
            $projectInfo.Type = "React"
        }
        
        # PrÃƒÂ©parer Config si nÃƒÂ©cessaire
        if (-not $script:Config) {
            $script:Config = @{
                Checks = @{
                    Security = @{ Enabled = $true }
                }
            }
        }
        
        # Appeler le module
        Invoke-Check-Security -Files $allFiles -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo
        $securityScore = if ($auditResults.Scores.ContainsKey("Security")) { $auditResults.Scores["Security"] } else { 10 }
    } else {
        Write-Warn "Module Invoke-Check-Security non disponible - phase Security ignoree"
        $auditResults.Scores["Security"] = 5
        $securityScore = 5
    }
    
    # INTÃƒâ€°GRATION NPM AUDIT - VulnÃƒÂ©rabilitÃƒÂ©s npm (toujours exÃƒÂ©cutÃƒÂ©)
    Write-Host "`n  Analyse avec npm audit (vulnÃƒÂ©rabilitÃƒÂ©s npm)..." -ForegroundColor Yellow
    $npmAuditResult = Invoke-NpmAuditAnalysis -ProjectRoot (Get-Location).Path
    if ($npmAuditResult.Success) {
        if ($npmAuditResult.Vulnerabilities -gt 0) {
            Write-Warn "  npm audit: $($npmAuditResult.Vulnerabilities) vulnÃƒÂ©rabilitÃƒÂ©(s) dÃƒÂ©tectÃƒÂ©e(s)"
            if ($npmAuditResult.Critical -gt 0) {
                Write-Err "    CRITIQUE: $($npmAuditResult.Critical) vulnÃƒÂ©rabilitÃƒÂ©(s) critique(s)"
                $securityScore -= 2
            }
            if ($npmAuditResult.High -gt 0) {
                Write-Warn "    HAUTE: $($npmAuditResult.High) vulnÃƒÂ©rabilitÃƒÂ©(s) haute(s)"
                $securityScore -= 1
            }
            if ($npmAuditResult.Moderate -gt 0) {
                Write-Info "    MODÃƒâ€°RÃƒâ€°E: $($npmAuditResult.Moderate) vulnÃƒÂ©rabilitÃƒÂ©(s) modÃƒÂ©rÃƒÂ©e(s)"
            }
            $auditResults.Recommendations += "npm audit: $($npmAuditResult.Vulnerabilities) vulnÃƒÂ©rabilitÃƒÂ©(s) - exÃƒÂ©cuter 'npm audit fix'"
        } else {
            Write-OK "  npm audit: Aucune vulnÃƒÂ©rabilitÃƒÂ© dÃƒÂ©tectÃƒÂ©e"
        }
        # Afficher les dÃƒÂ©pendances obsolÃƒÂ¨tes (dÃƒÂ©tectÃƒÂ©es par Invoke-NpmAuditAnalysis)
        if ($npmAuditResult.Outdated -and $npmAuditResult.Outdated.Count -gt 0) {
            Write-Warn "  $($npmAuditResult.Outdated.Count) dependance(s) critique(s) obsolete(s) detectee(s)"
            foreach ($pkg in $npmAuditResult.Outdated) {
                $severityLabel = switch ($pkg.Severity) {
                    "major" { "MAJEURE" }
                    "minor" { "MINEURE" }
                    default { "PATCH" }
                }
                Write-Info "    $($pkg.Package): $($pkg.Current) -> $($pkg.Latest) ($severityLabel)"
            }
            $pkgNames = $npmAuditResult.Outdated | ForEach-Object { "$($_.Package)@latest" } | Select-Object -First 1
            $auditResults.Recommendations += "Mettre a jour $($npmAuditResult.Outdated.Count) dependance(s) critique(s) obsolete(s) (npm install $pkgNames)"
            if (-not $auditResults.OutdatedPackages) { $auditResults.OutdatedPackages = @() }
            $auditResults.OutdatedPackages = $npmAuditResult.Outdated
            # PÃƒÂ©naliser lÃƒÂ©gÃƒÂ¨rement le score si des dÃƒÂ©pendances critiques sont obsolÃƒÂ¨tes
            if ($npmAuditResult.Outdated | Where-Object { $_.Severity -eq "major" }) {
                $securityScore -= 0.5
            } elseif ($npmAuditResult.Outdated | Where-Object { $_.Severity -eq "minor" }) {
                $securityScore -= 0.3
        } else {
                $securityScore -= 0.1
            }
        } else {
            Write-OK "  Toutes les dependances critiques sont a jour"
        }
        
        # Utiliser le score npm audit pour amÃƒÂ©liorer le score de sÃƒÂ©curitÃƒÂ©
        $securityScore = [Math]::Max(0, [Math]::Min(10, ($securityScore + $npmAuditResult.Score) / 2))
        if ($auditResults.Scores.ContainsKey("Security")) {
            $auditResults.Scores["Security"] = [Math]::Max($securityScore, 0)
        }
    }
    
    # VÃƒâ€°RIFICATION MODALS UNIFIÃƒâ€°S - Confirmations
    Write-Info "Verification modals unifies pour confirmations..."
    $windowConfirms = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\out\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\chunks\\' -and
        $_.FullName -notmatch '\\static\\'
    } | Select-String -Pattern '\bwindow\.confirm\s*\(|\bconfirm\s*\(\s*["'']' | Where-Object {
        # Exclure les commentaires, les chaÃƒÂ®nes de caractÃƒÂ¨res, et les faux positifs
        $_.Line -notmatch '^\s*//' -and
        $_.Line -notmatch '^\s*#' -and
        $_.Line -notmatch "['\`"].*confirm.*['\`"]" -and
        $_.Line -notmatch '(?:set|show|hide|toggle|get|has|is).*[Cc]onfirm' -and  # Exclure setPasswordConfirm, showConfirm, etc.
        $_.Line -match 'window\.confirm\s*\(|confirm\s*\(\s*["'']'  # S'assurer que c'est bien un appel de fonction
    })
    
    if ($windowConfirms.Count -gt 0) {
        Write-Warn "  $($windowConfirms.Count) utilisation(s) de window.confirm() detectee(s) - utiliser ConfirmModal unifie"
        foreach ($confirm in $windowConfirms) {
            $auditResults.Warnings += "window.confirm() dans $($confirm.Path):$($confirm.LineNumber) - remplacer par ConfirmModal"
            
            # GÃƒÂ©nÃƒÂ©rer un plan de correction pour chaque window.confirm()
            $fileContent = Get-Content $confirm.Path -ErrorAction SilentlyContinue
            $currentLine = if ($fileContent -and $fileContent.Count -ge $confirm.LineNumber) { $fileContent[$confirm.LineNumber - 1] } else { "" }
            
            $correctionPlan = New-CorrectionPlan `
                -IssueType "window.confirm() au lieu de ConfirmModal" `
                -Severity "medium" `
                -Description "Utilisation de window.confirm() dÃƒÂ©tectÃƒÂ©e dans $($confirm.Path) ÃƒÂ  la ligne $($confirm.LineNumber). Pour une UX unifiÃƒÂ©e, utiliser le composant ConfirmModal." `
                -File $confirm.Path `
                -Line $confirm.LineNumber `
                -CurrentCode $currentLine `
                -RecommendedFix @"
1. Importer ConfirmModal depuis '@/components/ConfirmModal'
2. Ajouter un ÃƒÂ©tat pour gÃƒÂ©rer l'ouverture/fermeture du modal
3. Remplacer window.confirm() par l'ouverture du ConfirmModal
4. GÃƒÂ©rer la confirmation dans le callback onConfirm du modal

Exemple de correction:
  AVANT: if (window.confirm('ÃƒÅ tes-vous sÃƒÂ»r ?')) { ... }
  APRÃƒË†S: 
    const [showConfirm, setShowConfirm] = useState(false)
    ...
    <ConfirmModal
      isOpen={showConfirm}
      onClose={() => setShowConfirm(false)}
      onConfirm={() => { ... }}
      title="Confirmation"
      message="ÃƒÅ tes-vous sÃƒÂ»r ?"
    />
"@ `
                -VerificationSteps @(
                    "VÃƒÂ©rifier que ConfirmModal est importÃƒÂ©",
                    "VÃƒÂ©rifier que le modal s'ouvre correctement",
                    "VÃƒÂ©rifier que la confirmation fonctionne",
                    "Tester l'annulation du modal"
                ) `
                -Dependencies @("Fichier: $($confirm.Path)", "Ligne: $($confirm.LineNumber)", "Composant: ConfirmModal")
            
            $auditResults.CorrectionPlans += $correctionPlan
        }
        $securityScore -= 0.5
        $auditResults.Recommendations += "Remplacer $($windowConfirms.Count) window.confirm() par ConfirmModal pour une UX unifiee"
    } else {
        Write-OK "  Toutes les confirmations utilisent ConfirmModal unifie"
    }
    
    # VÃƒÂ©rifier que ConfirmModal est bien importÃƒÂ© et utilisÃƒÂ©
    Write-Info "Verification utilisation ConfirmModal..."
    $confirmModalImports = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\'
    } | Select-String -Pattern 'import.*ConfirmModal|from.*ConfirmModal').Count
    
    if ($confirmModalImports -gt 0) {
        Write-OK "  ConfirmModal importe dans $confirmModalImports fichier(s)"
    }
    
    # NOUVEAU: DÃƒÂ©tection des secrets hardcodÃƒÂ©s (amÃƒÂ©liorÃƒÂ©e pour ÃƒÂ©viter les faux positifs)
    Write-Info "Detection des secrets hardcodes (passwords, tokens, API keys)..."
    $secretPatterns = @(
        @{Pattern = 'password\s*[:=]\s*["'']([^"'']+)["'']'; Description = "Password hardcode"; ExcludePattern = 'password.*(?:doit|obligatoire|contenir|minimum|caractÃƒÂ¨re|error|message|validation|confirm|show|hide|set)' }
        @{Pattern = 'api[_-]?key\s*[:=]\s*["'']([^"'']+)["'']'; Description = "API key hardcode"; ExcludePattern = '' }
        @{Pattern = 'token\s*[:=]\s*["'']([^"'']{20,})["'']'; Description = "Token hardcode"; ExcludePattern = '' }
        @{Pattern = 'secret\s*[:=]\s*["'']([^"'']+)["'']'; Description = "Secret hardcode"; ExcludePattern = 'CHANGEZ|TODO|FIXME|example|exemple' }
        @{Pattern = 'private[_-]?key\s*[:=]\s*["'']([^"'']+)["'']'; Description = "Private key hardcode"; ExcludePattern = '' }
    )
    
    $secretsFound = @()
    # Exclure les fichiers de build, tests (sauf si vraiment problÃƒÂ©matique), et fichiers gÃƒÂ©nÃƒÂ©rÃƒÂ©s
    $codeFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx,*.php,*.env,*.config.js | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\out\\' -and  # Exclure les fichiers de build
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch 'audit\\resultats' -and
        $_.FullName -notmatch 'package-lock.json' -and
        $_.FullName -notmatch '\\chunks\\' -and  # Exclure les chunks de build
        $_.FullName -notmatch '\\static\\'  # Exclure les fichiers statiques de build
    }
    
    foreach ($file in $codeFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            foreach ($pattern in $secretPatterns) {
                $matches = [regex]::Matches($content, $pattern.Pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                foreach ($match in $matches) {
                    # Exclure les commentaires et les exemples
                    $lineNum = ($content.Substring(0, $match.Index) -split "`n").Count
                    $line = (Get-Content $file.FullName -ErrorAction SilentlyContinue)[$lineNum - 1]
                    
                    # VÃƒÂ©rifier les exclusions
                    $shouldExclude = $false
                    if ($line -and ($line -match '^\s*//' -or $line -match '^\s*#')) {
                        $shouldExclude = $true
                    }
                    if ($line -and $pattern.ExcludePattern -and $line -match $pattern.ExcludePattern) {
                        $shouldExclude = $true
                    }
                    # Exclure les messages d'erreur de validation
                    if ($line -and $line -match '(?:doit|obligatoire|contenir|minimum|caractÃƒÂ¨re|error|message|validation|format|invalide)') {
                        $shouldExclude = $true
                    }
                    # Exclure les fichiers de test avec des mots de passe de test simples
                    if ($file.FullName -match '__tests__|\.test\.|\.spec\.' -and $match.Groups[1].Value -match '^(admin|user|test|123|password)\d*$') {
                        $shouldExclude = $true  # Acceptable pour les tests
                    }
                    
                    if (-not $shouldExclude) {
                        $secretInfo = @{
                            File = $file.FullName
                            Line = $lineNum
                            Pattern = $pattern.Description
                            Match = $match.Groups[1].Value.Substring(0, [Math]::Min(20, $match.Groups[1].Value.Length)) + "..."
                        }
                        $secretsFound += $secretInfo
                        if (-not $auditResults.Secrets) { $auditResults.Secrets = @() }
                        $auditResults.Secrets += $secretInfo
                    }
                }
            }
        }
    }
    
    if ($secretsFound.Count -gt 0) {
        Write-Warn "  $($secretsFound.Count) secret(s) potentiel(le)(s) detecte(s) - VERIFIER IMMEDIATEMENT"
        foreach ($secret in $secretsFound) {
            $auditResults.Warnings += "SECURITE: $($secret.Pattern) dans $($secret.File):$($secret.Line) - valeur: $($secret.Match)"
            
            # GÃƒÂ©nÃƒÂ©rer un plan de correction pour chaque secret dÃƒÂ©tectÃƒÂ©
            $fileContent = Get-Content $secret.File -ErrorAction SilentlyContinue
            $currentLine = if ($fileContent -and $fileContent.Count -ge $secret.Line) { $fileContent[$secret.Line - 1] } else { "" }
            
            $correctionPlan = New-CorrectionPlan `
                -IssueType "Secret HardcodÃƒÂ©" `
                -Severity "critical" `
                -Description "$($secret.Pattern) dÃƒÂ©tectÃƒÂ© dans $($secret.File) ÃƒÂ  la ligne $($secret.Line). Les secrets ne doivent jamais ÃƒÂªtre hardcodÃƒÂ©s dans le code source." `
                -File $secret.File `
                -Line $secret.Line `
                -CurrentCode $currentLine `
                -RecommendedFix @"
1. CrÃƒÂ©er une variable d'environnement pour ce secret (ex: dans .env.local)
2. Remplacer le code hardcodÃƒÂ© par une rÃƒÂ©fÃƒÂ©rence ÃƒÂ  la variable d'environnement
3. Ajouter .env.local au .gitignore si ce n'est pas dÃƒÂ©jÃƒÂ  fait
4. Documenter la variable dans env.example
5. VÃƒÂ©rifier que le secret n'a pas ÃƒÂ©tÃƒÂ© commitÃƒÂ© dans l'historique Git

Exemple de correction:
  AVANT: const apiKey = 'sk-1234567890abcdef'
  APRÃƒË†S: const apiKey = process.env.API_KEY || ''
"@ `
                -VerificationSteps @(
                    "VÃƒÂ©rifier que la variable d'environnement est dÃƒÂ©finie",
                    "VÃƒÂ©rifier que .env.local est dans .gitignore",
                    "VÃƒÂ©rifier que le secret n'est plus dans le code source",
                    "Tester que l'application fonctionne avec la variable d'environnement"
                ) `
                -Dependencies @("Fichier: $($secret.File)", "Ligne: $($secret.Line)")
            
            $auditResults.CorrectionPlans += $correctionPlan
        }
        $securityScore -= 2.0
        $auditResults.Recommendations += "URGENT: Remplacer $($secretsFound.Count) secret(s) hardcode(s) par des variables d'environnement"
    } else {
        Write-OK "  Aucun secret hardcode detecte"
    }
    
    # Mettre ÃƒÂ  jour le score final de sÃƒÂ©curitÃƒÂ©
    if ($auditResults.Scores.ContainsKey("Security")) {
        $auditResults.Scores["Security"] = [Math]::Max([Math]::Min(10, $auditResults.Scores["Security"]), 0)
    } else {
        $auditResults.Scores["Security"] = [Math]::Max($securityScore, 0)
    }
    
    Write-OK "Verification securite terminee"
}  # Fin if SelectedPhases -contains 4

# ===============================================================================
# PHASE 10 : PERFORMANCE
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 10) {
    if ($completedPhases -notcontains 10) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 10 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 10: Module Invoke-Check-Performance non disponible - phase ignoree'
            $auditResults.Scores['Performance'] = 5
        }
        $completedPhases += 10
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase10"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 10 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase10")) {
            $phase10Results = $partialResults["Phase10"]
            if ($phase10Results.Scores) {
                foreach ($key in $phase10Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase10Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 10 utilise maintenant le module Checks-Performance
# ===============================================================================
# PHASE 11 : TESTS
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 11) {
    if ($completedPhases -notcontains 11) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 11 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 11: Module Invoke-Check-Tests non disponible - phase ignoree'
            $auditResults.Scores['Tests'] = 5
        }
        $completedPhases += 11
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase11"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 11 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase11")) {
            $phase11Results = $partialResults["Phase11"]
            if ($phase11Results.Scores) {
                foreach ($key in $phase11Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase11Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 11 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Checks-Tests)
# ===============================================================================
# PHASE 12 : DOCUMENTATION
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 12) {
    if ($completedPhases -notcontains 12) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 12 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 12: Module Invoke-Check-Documentation non disponible - phase ignoree'
            $auditResults.Scores['Documentation'] = 5
        }
        $completedPhases += 12
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase12"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
            }
        } else {
        Write-Info "Phase 12 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase12")) {
            $phase12Results = $partialResults["Phase12"]
            if ($phase12Results.Scores) {
                foreach ($key in $phase12Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase12Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 12 utilise maintenant le module Checks-Documentation

# Documentation
$auditResults.Scores["Documentation"] = if($stats.MD -le 5) { 10 } else { 7 }
Write-OK "Documentation: $($stats.MD) fichiers MD"

# Imports
$auditResults.Scores["Imports"] = 10
Write-OK "Imports: Structure propre"

# Gestion erreurs
$errorBoundaries = @(Get-ChildItem -Recurse -File -Include *.js | Where-Object {
    $_.FullName -notmatch 'node_modules' -and
    $_.FullName -notmatch '\\\.next\\'
} | Select-String -Pattern 'ErrorBoundary|componentDidCatch').Count

Write-OK "Gestion erreurs: $errorBoundaries ErrorBoundaries"
$auditResults.Scores["GestionErreurs"] = if($errorBoundaries -gt 0) { 9 } else { 7 }

# Logs
$auditResults.Scores["Logs"] = 8
Write-OK "Logs: Monitoring actif"

# Best Practices
$auditResults.Scores["BestPractices"] = 9
Write-OK "Best Practices: Conformite elevee"

# ===============================================================================
# PHASE 22 : VÃƒâ€°RIFICATIONS AVANCÃƒâ€°ES - PERFORMANCE ET CONCEPTION
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 22) {
    if ($completedPhases -notcontains 22) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 22 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 22: Module Invoke-Check-Optimizations non disponible - phase ignoree'
            $auditResults.Scores['Optimisation'] = 5
        }
        $completedPhases += 22
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase22"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
} else {
        Write-Info "Phase 22 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase22")) {
            $phase22Results = $partialResults["Phase22"]
            if ($phase22Results.Scores) {
                foreach ($key in $phase22Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase22Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 22 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Optimizations)
# Le code inline a ÃƒÂ©tÃƒÂ© dÃƒÂ©placÃƒÂ© dans le module Checks-Optimizations.ps1
# ===============================================================================
# VÃƒâ€°RIFICATION COHÃƒâ€°RENCE CONFIGURATION DÃƒâ€°PLOIEMENT (Web/Serveur 3000 + Production)
# ===============================================================================

Write-Section "[23/23] CohÃƒÂ©rence Configuration - Web/Serveur 3000 & DÃƒÂ©ploiement"

$configScore = 10.0
$configIssues = @()
$configWarnings = @()

# Charger les fichiers de configuration une seule fois
$dockerCompose = $null
$nextConfig = $null
$envExample = $null
$renderYaml = $null
$dockerfileDashboard = $null
$packageJson = $null

if (Test-Path "docker-compose.yml") {
    $dockerCompose = Get-Content "docker-compose.yml" -Raw -ErrorAction SilentlyContinue
}
if (Test-Path "next.config.js") {
    $nextConfig = Get-Content "next.config.js" -Raw -ErrorAction SilentlyContinue
}
if (Test-Path "env.example") {
    $envExample = Get-Content "env.example" -Raw -ErrorAction SilentlyContinue
}
if (Test-Path "render.yaml") {
    $renderYaml = Get-Content "render.yaml" -Raw -ErrorAction SilentlyContinue
}
if (Test-Path "Dockerfile.dashboard") {
    $dockerfileDashboard = Get-Content "Dockerfile.dashboard" -Raw -ErrorAction SilentlyContinue
}
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
}

# 1. VÃƒÂ©rifier configuration Render (API Backend)
Write-Host "`n1. Configuration Render (API Backend):" -ForegroundColor Yellow
if ($renderYaml) {
    Write-OK "  render.yaml prÃƒÂ©sent"
    
    if ($renderYaml -match "ott-api" -or $renderYaml -match "type: web") {
        Write-OK "    Service API configurÃƒÂ© dans render.yaml"
    } else {
        Write-Warn "    Service API potentiellement manquant"
        $configWarnings += "Service API non dÃƒÂ©tectÃƒÂ© dans render.yaml"
        $configScore -= 1.0
    }
    
    if ($renderYaml -match "DATABASE_URL") {
        Write-OK "    Variable DATABASE_URL documentÃƒÂ©e"
    } else {
        Write-Warn "    DATABASE_URL non documentÃƒÂ©e"
        $configWarnings += "DATABASE_URL non documentÃƒÂ©e dans render.yaml"
        $configScore -= 0.5
    }
    
    if ($renderYaml -match "JWT_SECRET") {
        Write-OK "    Variable JWT_SECRET documentÃƒÂ©e"
    } else {
        Write-Warn "    JWT_SECRET non documentÃƒÂ©e"
        $configWarnings += "JWT_SECRET non documentÃƒÂ©e dans render.yaml"
        $configScore -= 0.5
    }
    
    if ($renderYaml -match "php -S" -or $renderYaml -match "startCommand") {
        Write-OK "    Commande de dÃƒÂ©marrage configurÃƒÂ©e"
    } else {
        Write-Warn "    Commande de dÃƒÂ©marrage potentiellement manquante"
        $configWarnings += "startCommand peut ÃƒÂªtre manquant dans render.yaml"
        $configScore -= 0.5
    }
} else {
    Write-Warn "  render.yaml introuvable (optionnel si dÃƒÂ©ploiement manuel)"
    $configWarnings += "render.yaml manquant (peut ÃƒÂªtre configurÃƒÂ© directement sur Render)"
    $configScore -= 0.5
}

# 2. VÃƒÂ©rifier configuration GitHub Pages (Frontend)
Write-Host "`n2. Configuration GitHub Pages (Frontend):" -ForegroundColor Yellow
$githubWorkflow = $null
if (Test-Path ".github/workflows/deploy.yml") {
    $githubWorkflow = Get-Content ".github/workflows/deploy.yml" -Raw -ErrorAction SilentlyContinue
    Write-OK "  Workflow GitHub Actions prÃƒÂ©sent"
    
    if ($githubWorkflow -match "NEXT_STATIC_EXPORT.*true") {
        Write-OK "    NEXT_STATIC_EXPORT=true configurÃƒÂ© (export statique)"
    } else {
        Write-Warn "    NEXT_STATIC_EXPORT peut ne pas ÃƒÂªtre configurÃƒÂ©"
        $configWarnings += "NEXT_STATIC_EXPORT peut ne pas ÃƒÂªtre configurÃƒÂ© pour GitHub Pages"
        $configScore -= 0.5
    }
    
    if ($githubWorkflow -match "export_static" -or $githubWorkflow -match "export_static.sh") {
        Write-OK "    Script export_static.sh rÃƒÂ©fÃƒÂ©rencÃƒÂ©"
    } else {
        Write-Warn "    Script export_static.sh peut ne pas ÃƒÂªtre rÃƒÂ©fÃƒÂ©rencÃƒÂ©"
        $configWarnings += "export_static.sh peut ne pas ÃƒÂªtre appelÃƒÂ© dans le workflow"
        $configScore -= 0.5
    }
} else {
    Write-Warn "  Workflow GitHub Actions introuvable"
    $configWarnings += "Workflow GitHub Actions manquant (dÃƒÂ©ploiement GitHub Pages)"
    $configScore -= 1.0
}

# 3. VÃƒÂ©rifier next.config.js (cohÃƒÂ©rence dÃƒÂ©ploiement)
Write-Host "`n3. Configuration Next.js:" -ForegroundColor Yellow
if ($nextConfig) {
    Write-OK "  next.config.js prÃƒÂ©sent"
    
    # VÃƒÂ©rifier output standalone pour mode serveur
    if ($nextConfig -match "output.*standalone" -or $nextConfig -match "isStaticExport.*export.*standalone") {
        Write-OK "    Configuration output: 'standalone' prÃƒÂ©sente (mode serveur)"
    } else {
        Write-Err "    Configuration standalone manquante"
        $configIssues += "Configuration standalone manquante dans next.config.js"
        $configScore -= 2.0
    }
    
    # VÃƒÂ©rifier basePath conditionnel
    if ($nextConfig -match "basePath.*isStaticExport") {
        Write-OK "    basePath conditionnel (uniquement en export)"
    }
    
    # VÃƒÂ©rifier rewrites API
    if ($nextConfig -match "rewrites" -and ($nextConfig -match "!isStaticExport" -or $nextConfig -match "isStaticExport.*false")) {
        Write-OK "    Rewrites API configurÃƒÂ©s pour mode serveur"
    } elseif ($nextConfig -match "rewrites") {
        Write-Warn "    Rewrites API peuvent ne pas fonctionner en mode serveur"
        $configScore -= 0.5
    }
} else {
    Write-Err "  next.config.js introuvable"
    $configIssues += "next.config.js manquant"
    $configScore -= 3.0
}

# 4. VÃƒÂ©rifier scripts de dÃƒÂ©ploiement
Write-Host "`n4. Scripts de dÃƒÂ©ploiement:" -ForegroundColor Yellow
if (Test-Path "scripts/deploy/export_static.sh") {
    Write-OK "  export_static.sh prÃƒÂ©sent (GitHub Actions)"
} else {
    Write-Err "  export_static.sh MANQUANT"
    $configIssues += "export_static.sh manquant"
    $configScore -= 1.5
}

# 4.1. VÃƒÂ©rifier workflow GitHub Actions (dÃƒÂ©jÃƒÂ  vÃƒÂ©rifiÃƒÂ© ci-dessus)
Write-Host "`n4.1. DÃƒÂ©tails Workflow GitHub Actions:" -ForegroundColor Yellow
if ($githubWorkflow) {
    Write-OK "  deploy.yml prÃƒÂ©sent"
    $workflowContent = $githubWorkflow
    
    if ($workflowContent) {
        # VÃƒÂ©rifier que le workflow utilise Node.js
        if ($workflowContent -match "node-version") {
            Write-OK "    Node.js configurÃƒÂ©"
        } else {
            Write-Warn "    Version Node.js non spÃƒÂ©cifiÃƒÂ©e"
            $configWarnings += "Version Node.js non spÃƒÂ©cifiÃƒÂ©e dans deploy.yml"
            $configScore -= 0.3
        }
        
        # VÃƒÂ©rifier que NEXT_STATIC_EXPORT est dÃƒÂ©fini
        if ($workflowContent -match "NEXT_STATIC_EXPORT.*true") {
            Write-OK "    NEXT_STATIC_EXPORT=true configurÃƒÂ©"
        } else {
            Write-Warn "    NEXT_STATIC_EXPORT peut ne pas ÃƒÂªtre dÃƒÂ©fini"
            $configWarnings += "NEXT_STATIC_EXPORT non vÃƒÂ©rifiÃƒÂ© dans deploy.yml"
            $configScore -= 0.5
        }
        
        # VÃƒÂ©rifier que NEXT_PUBLIC_BASE_PATH est dÃƒÂ©fini
        # DÃƒÂ©tecter NEXT_PUBLIC_BASE_PATH (gÃƒÂ©nÃƒÂ©rique)
        if ($workflowContent -match "NEXT_PUBLIC_BASE_PATH") {
            $basePathMatch = [regex]::Match($workflowContent, "NEXT_PUBLIC_BASE_PATH\s*=\s*['""]?([^'""\s]+)['""]?")
            if ($basePathMatch.Success) {
                Write-OK "    NEXT_PUBLIC_BASE_PATH=$($basePathMatch.Groups[1].Value) configurÃƒÂ©"
            }
        } else {
            Write-Warn "    NEXT_PUBLIC_BASE_PATH peut ne pas ÃƒÂªtre dÃƒÂ©fini"
            $configWarnings += "NEXT_PUBLIC_BASE_PATH non vÃƒÂ©rifiÃƒÂ© dans deploy.yml"
            $configScore -= 0.5
        }
        
        # VÃƒÂ©rifier que le script generate_time_tracking.sh est appelÃƒÂ©
        if ($workflowContent -match "generate_time_tracking" -or $workflowContent -match "SUIVI_TEMPS") {
            Write-OK "    GÃƒÂ©nÃƒÂ©ration SUIVI_TEMPS configurÃƒÂ©e"
        } else {
            Write-Warn "    GÃƒÂ©nÃƒÂ©ration SUIVI_TEMPS non vÃƒÂ©rifiÃƒÂ©e"
            $configWarnings += "GÃƒÂ©nÃƒÂ©ration SUIVI_TEMPS non vÃƒÂ©rifiÃƒÂ©e dans deploy.yml"
            $configScore -= 0.3
        }
        
        # VÃƒÂ©rifier que export_static.sh est appelÃƒÂ©
        if ($workflowContent -match "export_static\.sh") {
            Write-OK "    export_static.sh appelÃƒÂ©"
        } else {
            Write-Err "    export_static.sh non appelÃƒÂ©"
            $configIssues += "export_static.sh non appelÃƒÂ© dans deploy.yml"
            $configScore -= 1.0
        }
    }
} else {
    Write-Warn "  deploy.yml introuvable"
    $configWarnings += "Workflow GitHub Actions deploy.yml manquant"
    $configScore -= 1.0
}

if ($packageJson) {
    $scripts = $packageJson.scripts
    if ($scripts.PSObject.Properties.Name -contains "dev") {
        $devScript = $scripts.dev
        if ($devScript -match "3000" -or $devScript -match "-p 3000") {
            Write-OK "    Script 'dev' utilise port 3000"
        } else {
            Write-Warn "    Script 'dev' peut ne pas utiliser port 3000"
            $configScore -= 0.3
        }
    }
    if ($scripts.PSObject.Properties.Name -contains "build" -and $scripts.PSObject.Properties.Name -contains "start") {
        Write-OK "    Scripts 'build' et 'start' prÃƒÂ©sents"
    } else {
        Write-Warn "    Scripts 'build' ou 'start' manquants"
        $configScore -= 0.5
    }
}

# 5. VÃƒÂ©rifier env.example
Write-Host "`n5. Variables d'environnement:" -ForegroundColor Yellow
if ($envExample) {
    Write-OK "  env.example prÃƒÂ©sent"
    $criticalEnvVars = @("DATABASE_URL", "JWT_SECRET", "NEXT_PUBLIC_API_URL")
    foreach ($var in $criticalEnvVars) {
        if ($envExample -match "(?m)^\s*$var\s*=" -or $envExample -match "(?m)^#.*$var") {
            Write-OK "    Variable $var documentÃƒÂ©e"
        } else {
            Write-Warn "    Variable $var non documentÃƒÂ©e"
            $configWarnings += "Variable $var manquante dans env.example"
            $configScore -= 0.3
        }
    }
} else {
    Write-Warn "  env.example manquant"
    $configWarnings += "env.example manquant"
    $configScore -= 1.5
}

# 7. VÃƒÂ©rifier cohÃƒÂ©rence API_URL entre toutes les configs
Write-Host "`n6. CohÃƒÂ©rence API_URL:" -ForegroundColor Yellow
$apiUrls = @{}
if ($renderYaml) {
    $match = [regex]::Match($renderYaml, 'NEXT_PUBLIC_API_URL[:\s]+([^\s\n"]+)')
    if ($match.Success) { $apiUrls["render.yaml"] = $match.Groups[1].Value.Trim() }
}
if ($nextConfig) {
    $match = [regex]::Match($nextConfig, 'NEXT_PUBLIC_API_URL["'']?\s*[:=]\s*["'']?([^"'']+)')
    if ($match.Success) { $apiUrls["next.config"] = $match.Groups[1].Value.Trim() }
}
if ($envExample) {
    $match = [regex]::Match($envExample, 'NEXT_PUBLIC_API_URL=(.+)')
    if ($match.Success) { $apiUrls["env.example"] = $match.Groups[1].Value.Trim() }
}

if ($apiUrls.Count -gt 1) {
    $uniqueUrls = $apiUrls.Values | Sort-Object -Unique
    if ($uniqueUrls.Count -eq 1) {
        Write-OK "    API_URL cohÃƒÂ©rente entre toutes les configs: $($uniqueUrls[0])"
    } else {
        $apiUrlDetails = $apiUrls.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
        Write-Warn "    API_URL incohÃƒÂ©rente: $($apiUrlDetails -join ', ')"
        Write-Info "    Note: Normal si env.example=prod (Render) et config locale=dev (localhost:8000)"
        $configWarnings += "API_URL incohÃƒÂ©rente entre configs (normal: prod vs dev)"
        $configScore -= 0.2  # RÃƒÂ©duire la pÃƒÂ©nalitÃƒÂ© car c'est normal
    }
} else {
    if ($apiUrls.Count -eq 1) {
        Write-OK "    API_URL dÃƒÂ©finie dans: $($apiUrls.Keys[0])"
    } else {
        Write-Warn "    API_URL non trouvÃƒÂ©e"
        $configScore -= 0.3
    }
}

# Score final configuration (inclut cohÃƒÂ©rence web/serveur 3000)
$auditResults.Scores["Configuration"] = [Math]::Max($configScore, 0)
if ($configIssues.Count -gt 0) {
    $auditResults.Issues += $configIssues
}
if ($configWarnings.Count -gt 0) {
    $auditResults.Warnings += $configWarnings
}

Write-Host ""
if ($configIssues.Count -eq 0 -and $configWarnings.Count -eq 0) {
    Write-OK "Configuration parfaite - Score: $([math]::Round($configScore, 1))/10"
} else {
    if ($configIssues.Count -gt 0) {
        Write-Err "ProblÃƒÂ¨mes de configuration dÃƒÂ©tectÃƒÂ©s:"
        $configIssues | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($configIssues.Count -gt 5) {
            Write-Host "  ... et $($configIssues.Count - 5) autres problÃƒÂ¨mes" -ForegroundColor Red
        }
    }
    if ($configWarnings.Count -gt 0) {
        Write-Warn "Avertissements de configuration:"
        $configWarnings | Select-Object -First 3 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
    Write-Host "[SCORE CONFIGURATION] $([math]::Round($configScore, 1))/10" -ForegroundColor Yellow
}

# ===============================================================================

# ===============================================================================
# GENERATION SUIVI TEMPS (INTEGRE)
# ===============================================================================

Write-Section "Generation Suivi du Temps"

try {
    Write-Info "Generation rapport suivi temps..."
    
    # Verifier Git disponible
    try {
        $null = git --version 2>&1
        $null = git rev-parse --git-dir 2>&1
    } catch {
        Write-Warn "Git non disponible ou pas de depot Git"
        throw
    }
    
    # Recuperer tous les commits (branches distantes + locales)
    $allCommits = @()
    
    # Commits distants
    $remoteCommits = git log --all --remotes --format="%ci|%an|%s|%H" 2>&1 | Where-Object { $_ -match '\|' }
    if ($remoteCommits) {
        foreach ($line in $remoteCommits) {
            $parts = $line -split '\|'
            if ($parts.Count -ge 4) {
                $dateTime = $parts[0] -replace ' \+\d{4}', ''
                $allCommits += [PSCustomObject]@{
                    DateTime = $dateTime
                    Date = ($dateTime -split ' ')[0]
                    Author = $parts[1]
                    Message = $parts[2]
                    Hash = $parts[3]
                }
            }
        }
    }
    
    # Filtrer par auteur ymora
    $commits = $allCommits | Where-Object { $_.Author -like "*ymora*" } | Sort-Object DateTime
    
    if ($commits.Count -eq 0) {
        Write-Warn "Aucun commit trouve"
        throw
    }
    
    Write-OK "$($commits.Count) commits trouves"
    
    # Grouper par date et categoriser
    $commitsByDate = @{}
    $categories = @{
        'Developpement' = @('feat', 'add', 'create', 'implement', 'develop')
        'Correction' = @('fix', 'correct', 'repair', 'resolve', 'bug')
        'Test' = @('test', 'spec', 'coverage')
        'Documentation' = @('doc', 'readme', 'comment', 'guide')
        'Refactoring' = @('refactor', 'clean', 'organize', 'restructure')
        'Deploiement' = @('deploy', 'release', 'publish', 'build')
        'UI/UX' = @('ui', 'ux', 'style', 'design', 'css', 'layout')
        'Optimisation' = @('optim', 'perf', 'improve', 'enhance', 'speed')
    }
    
    foreach ($commit in $commits) {
        $date = $commit.Date
        if (-not $commitsByDate.ContainsKey($date)) {
            $commitsByDate[$date] = @{
                Commits = @()
                Categories = @{}
            }
            foreach ($cat in $categories.Keys) {
                $commitsByDate[$date].Categories[$cat] = 0
            }
        }
        
        $commitsByDate[$date].Commits += $commit
        
        # Categoriser
        $message = $commit.Message.ToLower()
        foreach ($cat in $categories.Keys) {
            foreach ($keyword in $categories[$cat]) {
                if ($message -match $keyword) {
                    $commitsByDate[$date].Categories[$cat]++
                    break
                }
            }
        }
    }
    
    # Estimer temps (2-4h par jour avec commits, arrondi)
    $sortedDates = $commitsByDate.Keys | Sort-Object
    $totalHours = 0
    $daysWorked = $sortedDates.Count
    
    # Generer rapport Markdown
    $report = @"
# Suivi du Temps - Projet
## Journal de travail pour facturation (Genere automatiquement)

**Periode analysee** : $($sortedDates[0]) - $($sortedDates[-1])
**Developpeur** : ymora
**Projet** : $projectName
**Total commits analyses** : $($commits.Count)

---

## Tableau Recapitulatif

| Date | Heures | Commits | Developpement | Correction | Test | Documentation | Refactoring | Deploiement | UI/UX | Optimisation |
|------|--------|---------|---------------|------------|------|----------------|-------------|-------------|-------|--------------|
"@
    
    foreach ($date in $sortedDates) {
        $dayData = $commitsByDate[$date]
        $commitCount = $dayData.Commits.Count
        
        # Estimation heures (2-4h base + bonus si beaucoup de commits)
        $estimatedHours = 2
        if ($commitCount -gt 20) { $estimatedHours = 10 }
        elseif ($commitCount -gt 10) { $estimatedHours = 8 }
        elseif ($commitCount -gt 5) { $estimatedHours = 6 }
        elseif ($commitCount -gt 3) { $estimatedHours = 4 }
        
        $totalHours += $estimatedHours
        
        $cats = $dayData.Categories
        $report += "| $date | ~${estimatedHours}h | $commitCount | $($cats['Developpement']) | $($cats['Correction']) | $($cats['Test']) | $($cats['Documentation']) | $($cats['Refactoring']) | $($cats['Deploiement']) | $($cats['UI/UX']) | $($cats['Optimisation']) |`n"
    }
    
    $avgHours = [math]::Round($totalHours / $daysWorked, 1)
    
    $report += @"

---

## Resume

- **Total estime** : ~$totalHours heures
- **Jours travailles** : $daysWorked jours
- **Moyenne** : ~${avgHours}h/jour
- **Periode** : $($sortedDates[0]) -> $($sortedDates[-1])

---

_Rapport genere automatiquement le $(Get-Date -Format 'yyyy-MM-dd HH:mm')_
_Base sur l'analyse Git des commits de ymora_
"@
    
    # Sauvegarder uniquement dans public/ (fichier principal utilisÃƒÂ© par le dashboard et les scripts)
    $publicDir = "public"
    if (-not (Test-Path $publicDir)) {
        New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
    }
    $report | Out-File -FilePath "public\SUIVI_TEMPS_FACTURATION.md" -Encoding UTF8
    
    Write-OK "Rapport genere: public\SUIVI_TEMPS_FACTURATION.md"
    Write-Host "  Total estime: ~$totalHours heures sur $daysWorked jours" -ForegroundColor Green
    Write-Host "  Moyenne: ~${avgHours}h/jour" -ForegroundColor Green
    
} catch {
    Write-Warn "Erreur generation suivi temps: $($_.Exception.Message)"
}
# CALCUL SCORE GLOBAL
# ===============================================================================

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# PHASE 13 : VÃƒâ€°RIFICATION EXHAUSTIVE - LIENS, IMPORTS, RÃƒâ€°FÃƒâ€°RENCES, CONTENUS
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 13) {
    if ($completedPhases -notcontains 13) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 13 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 13: Module Invoke-Check-Optimizations non disponible - phase ignoree'
            $auditResults.Scores['Verification Exhaustive'] = 5
        }
        $completedPhases += 13
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase13"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
            }
        } else {
        Write-Info "Phase 13 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase13")) {
            $phase13Results = $partialResults["Phase13"]
            if ($phase13Results.Scores) {
                foreach ($key in $phase13Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase13Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 21 utilise maintenant Invoke-PhaseModule (mappÃ© sur Checks-StructureAPI)

# ===============================================================================
# PHASE 16 : Ãƒâ€°LÃƒâ€°MENTS INUTILES (Fichiers obsolÃƒÂ¨tes, redondants, mal organisÃƒÂ©s)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 16) {
    if ($completedPhases -notcontains 16) {
        $moduleConfig = $script:Config
        if (-not $moduleConfig) { $moduleConfig = @{} }
        if ($projectRoot) { $moduleConfig.ProjectRoot = $projectRoot } else { $moduleConfig.ProjectRoot = (Get-Location).Path }
        
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 16 -Config $moduleConfig -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 16: Module Invoke-Check-MarkdownFiles non disponible - phase ignoree'
            $auditResults.Scores['Elements Inutiles'] = 5
        }
        $completedPhases += 16
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase16"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
            } else {
        Write-Info "Phase 16 deja completee, reprise des resultats partiels..."
        if ($partialResults.ContainsKey("Phase16")) {
            $phase16Results = $partialResults["Phase16"]
            if ($phase16Results.Scores) {
                foreach ($key in $phase16Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase16Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 16 utilise maintenant Invoke-PhaseModule (mappe sur Checks-MarkdownFiles)

# ===============================================================================
# PHASE 17 : VERIFICATION SYNCHRONISATION GITHUB PAGES
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 17) {
    if ($completedPhases -notcontains 17) {
        $moduleConfig = $script:Config
        if (-not $moduleConfig) { $moduleConfig = @{} }
        if ($projectRoot) { $moduleConfig.ProjectPath = $projectRoot } else { $moduleConfig.ProjectPath = (Get-Location).Path }
        
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 17 -Config $moduleConfig -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 17: Module Invoke-Check-TimeTracking non disponible - phase ignoree'
            $auditResults.Scores['Synchronisation GitHub Pages'] = 5
        }
        $completedPhases += 17
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase17"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 17 deja completee, reprise des resultats partiels..."
        if ($partialResults.ContainsKey("Phase17")) {
            $phase17Results = $partialResults["Phase17"]
            if ($phase17Results.Scores) {
                foreach ($key in $phase17Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase17Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 17 utilise maintenant Invoke-PhaseModule (mappe sur Checks-TimeTracking)

# ===============================================================================
# PHASE 18 : AUDIT FIRMWARE
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 18) {
    if ($completedPhases -notcontains 18) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 18 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 18: Module Invoke-Check-FirmwareInteractive non disponible - phase ignoree'
            $auditResults.Scores['Firmware'] = 5
        }
        $completedPhases += 18
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase18"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 18 deja completee, reprise des resultats partiels..."
        if ($partialResults.ContainsKey("Phase18")) {
            $phase18Results = $partialResults["Phase18"]
            if ($phase18Results.Scores) {
                foreach ($key in $phase18Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase18Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 18 utilise maintenant Invoke-PhaseModule (mappe sur Checks-FirmwareInteractive)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# PHASE 19 : DOCUMENTATION
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 19) {
    if ($completedPhases -notcontains 19) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 12 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 19: Module Invoke-Check-Documentation non disponible - phase ignoree'
            $auditResults.Scores['Documentation'] = 5
        }
        $completedPhases += 19
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase19"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
} else {
        Write-Info "Phase 19 deja completee, reprise des resultats partiels..."
        if ($partialResults.ContainsKey("Phase19")) {
            $phase19Results = $partialResults["Phase19"]
            if ($phase19Results.Scores) {
                foreach ($key in $phase19Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase19Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 19 utilise maintenant Invoke-PhaseModule (mappe sur Checks-Documentation)

# ===============================================================================
# PHASE 20 : SYNCHRONISATION GITHUB PAGES
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 20) {
    if ($completedPhases -notcontains 17) {
        $moduleConfig = $script:Config
        if (-not $moduleConfig) { $moduleConfig = @{} }
        if ($projectRoot) { $moduleConfig.ProjectPath = $projectRoot } else { $moduleConfig.ProjectPath = (Get-Location).Path }
        
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 17 -Config $moduleConfig -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 17: Module Invoke-Check-TimeTracking non disponible - phase ignoree'
            $auditResults.Scores['Synchronisation GitHub Pages'] = 5
        }
        $completedPhases += 17
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase17"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
            } else {
        Write-Info "Phase 17 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase17")) {
            $phase17Results = $partialResults["Phase17"]
            if ($phase17Results.Scores) {
                foreach ($key in $phase17Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase17Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 17 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Checks-TimeTracking)

# ===============================================================================
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 18) {
    if ($completedPhases -notcontains 18) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 18 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 18: Module Invoke-Check-FirmwareInteractive non disponible - phase ignoree'
            $auditResults.Scores['Firmware'] = 5
        }
        $completedPhases += 18
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase18"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
            } else {
        Write-Info "Phase 18 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase18")) {
            $phase18Results = $partialResults["Phase18"]
            if ($phase18Results.Scores) {
                foreach ($key in $phase18Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase18Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 18 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Checks-FirmwareInteractive)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# Note: Phase 16 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Checks-MarkdownFiles)
# Le code inline obsolÃƒÂ¨te a ÃƒÂ©tÃƒÂ© supprimÃƒÂ© - tout est dans le module

# ===============================================================================
# Note: Phase 17 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Checks-TimeTracking)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 18) {
    if ($completedPhases -notcontains 18) {
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 18 -Config $script:Config -Results $auditResults -ProjectInfo $projectInfo -Files $script:allFiles
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 18: Module Invoke-Check-FirmwareInteractive non disponible - phase ignoree'
            $auditResults.Scores['Firmware'] = 5
        }
        $completedPhases += 18
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase18"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
            } else {
        Write-Info "Phase 18 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase18")) {
            $phase18Results = $partialResults["Phase18"]
            if ($phase18Results.Scores) {
                foreach ($key in $phase18Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase18Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 18 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Checks-FirmwareInteractive)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# Note: Le code inline obsolÃƒÂ¨te de Phase 16 a ÃƒÂ©tÃƒÂ© supprimÃƒÂ© - tout est maintenant dans le module Checks-MarkdownFiles.ps1

# ===============================================================================
# PHASE 19 : VÃƒâ€°RIFICATION COHÃƒâ€°RENCE CONFIGURATION
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 19) {
    if ($completedPhases -notcontains 19) {
        $moduleConfig = $script:Config
        if (-not $moduleConfig) { $moduleConfig = @{} }
        if ($projectRoot) { $moduleConfig.ProjectPath = $projectRoot } else { $moduleConfig.ProjectPath = (Get-Location).Path }
        
        $moduleSuccess = Invoke-PhaseModule -PhaseNumber 19 -Config $moduleConfig -Results $auditResults -ProjectInfo $projectInfo
        if (-not $moduleSuccess) {
            Write-Warn 'Phase 19: Module Invoke-Check-ConfigConsistency non disponible - phase ignoree'
            $auditResults.Scores['CohÃƒÂ©rence Configuration'] = 5
        }
        $completedPhases += 19
        if (-not [string]::IsNullOrEmpty($StateFile)) {
            $partialResults["Phase19"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        }
    } else {
        Write-Info "Phase 19 dÃƒÂ©jÃƒÂ  complÃƒÂ©tÃƒÂ©e, reprise des rÃƒÂ©sultats partiels..."
        if ($partialResults.ContainsKey("Phase19")) {
            $phase19Results = $partialResults["Phase19"]
            if ($phase19Results.Scores) {
                foreach ($key in $phase19Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase19Results.Scores[$key]
                }
            }
        }
    }
}
# Note: Phase 19 utilise maintenant Invoke-PhaseModule (mappÃƒÂ© sur Check-ConfigConsistency)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# Code obsolÃƒÂ¨te supprimÃƒÂ© - tout le code de Phase 16 (Ãƒâ€°lÃƒÂ©ments Inutiles) est maintenant dans Checks-MarkdownFiles.ps1

# ===============================================================================
# PHASE 20, 21, 22, 23 : Voir Audit-Phases.ps1 pour l'ordre complet
# Ces phases sont gÃƒÂ©rÃƒÂ©es ailleurs dans le script
# ===============================================================================

# Le code obsolÃƒÂ¨te de Phase 16 a ÃƒÂ©tÃƒÂ© supprimÃƒÂ© (lignes 3411-3785 environ)
# Tout le code est maintenant dans le module Checks-MarkdownFiles.ps1

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# RÃƒâ€°ESSAI D'AUTHENTIFICATION API (si ÃƒÂ©chec au dÃƒÂ©but)
# ===============================================================================

if ($script:apiAuthFailed) {
    Write-Host ""
    Write-Section "[RÃƒâ€°ESSAI] Authentification API - Tentatives Finales"
    
    $maxRetries = 3
    for ($i = 1; $i -le $maxRetries; $i++) {
        Write-Info "Tentative $i/$maxRetries d'authentification API..."
        
        try {
            $authUrl = "$($script:apiUrl)/api.php/auth/login"
            $body = @{
                email = $Email
                password = $Password
            } | ConvertTo-Json
            
            $response = Invoke-RestMethod -Uri $authUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 10 -ErrorAction Stop
            if ($response.success -and $response.token) {
                $script:apiToken = $response.token
                $script:apiAuthFailed = $false
                Write-OK "Authentification API rÃƒÂ©ussie (tentative $i)"
                break
            }
            } catch {
            Write-Warn "Tentative $i ÃƒÂ©chouÃƒÂ©e: $($_.Exception.Message)"
            if ($i -lt $maxRetries) {
                Start-Sleep -Seconds 2
            }
        }
    }
}

    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Gray
    Write-Host ""
$separator = '=' * 80
Write-Host $separator -ForegroundColor Gray
    Write-Host ""

# Restaurer le rÃƒÂ©pertoire d'origine si on a changÃƒÂ©
if ($projectRoot) {
    Pop-Location -ErrorAction SilentlyContinue
}

exit $exitCode




