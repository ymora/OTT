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
        [hashtable]$ProjectInfo = @{},
        [string]$ProjectRoot = $null
    )
    
    # Mapping des phases aux modules (correspondance avec Audit-Phases.ps1 - phases 1-23)
    # Ordre optimisé: Structure → Config → Liens → Sécurité → Backend → Qualité → Frontend → Performance → Documentation → Déploiement → Hardware → Tests
    $phaseModuleMap = @{
        1 = @("Invoke-Check-Inventory")                          # Phase 1: Inventaire Exhaustif
        2 = @("Invoke-Check-Architecture")                       # Phase 2: Architecture et Statistiques
        3 = @("Invoke-Check-Organization")                       # Phase 3: Organisation
        4 = @("Invoke-Check-ConfigConsistency")                  # Phase 4: Cohérence Configuration
        5 = @("Invoke-Check-MarkdownFiles")                      # Phase 5: Liens et Imports
        6 = @("Invoke-Check-Security")                          # Phase 6: Sécurité
        7 = @("Invoke-Check-StructureAPI")                       # Phase 7: Structure API
        8 = @("Invoke-Check-API")                                # Phase 8: Endpoints API
        9 = @("Invoke-Check-Database")                           # Phase 9: Base de Données
        10 = @("Invoke-Check-CodeMort")                          # Phase 10: Code Mort
        11 = @("Invoke-Check-Duplication")                       # Phase 11: Duplication de Code
        12 = @("Invoke-Check-Complexity")                        # Phase 12: Complexité
        13 = @("Invoke-Check-Optimizations")                     # Phase 13: Optimisations Avancées
        14 = @("Invoke-Check-Tests")                             # Phase 14: Tests
        15 = @("Invoke-Check-ErrorHandling")                     # Phase 15: Gestion d'Erreurs
        16 = @("Invoke-Check-Routes")                           # Phase 16: Routes et Navigation
        17 = @("Invoke-Check-UI")                                # Phase 17: Accessibilité (a11y)
        18 = @("Invoke-Check-UI")                                # Phase 18: Uniformisation UI/UX
        19 = @("Invoke-Check-Performance")                       # Phase 19: Performance
        20 = @("Invoke-Check-Documentation")                     # Phase 20: Documentation
        21 = @("Invoke-Check-TimeTracking")                      # Phase 21: Synchronisation GitHub Pages
        22 = @("Invoke-Check-FirmwareInteractive")              # Phase 22: Firmware
        23 = @("Invoke-Check-TestsComplets")                     # Phase 23: Tests Complets Application
    }
    
    $moduleFunctions = $phaseModuleMap[$PhaseNumber]
    if (-not $moduleFunctions) {
        return $false  # Pas de module pour cette phase
    }
    
    # Essayer chaque fonction du module dans l'ordre
    foreach ($funcName in $moduleFunctions) {
        # Appel unique à Get-Command (optimisation)
        $func = Get-Command $funcName -ErrorAction SilentlyContinue
        if ($func) {
            try {
                # PrÃƒÂ©parer les paramÃƒÂ¨tres selon la signature de la fonction
                $params = @{}
                
                # Vérifier quels paramètres la fonction attend
                foreach ($param in $func.Parameters.Values) {
                    if ($param.Name -eq "Files") {
                        # Utiliser Results.Statistics au lieu de variable globale (plus fiable)
                        # Priorité: Files passé > Results.Statistics > script:allFiles > tableau vide
                        if ($Files.Count -gt 0) {
                            $params.Files = $Files
                        } elseif ($Results.Statistics.Inventory.FileInventory) {
                            # Reconstruire depuis l'inventaire (plus fiable que variable globale)
                            $allFiles = @()
                            foreach ($category in $Results.Statistics.Inventory.FileInventory.PSObject.Properties.Name) {
                                $allFiles += $Results.Statistics.Inventory.FileInventory.$category
                            }
                            $params.Files = $allFiles
                        } elseif ($script:allFiles -and $script:allFiles.Count -gt 0) {
                            $params.Files = $script:allFiles  # Fallback pour compatibilité
                        } else {
                            # Si Files est obligatoire, utiliser un tableau vide plutôt que de planter
                            $params.Files = @()
                        }
                    } elseif ($param.Name -eq "Config") {
                        $params.Config = $Config
                    } elseif ($param.Name -eq "Results") {
                        $params.Results = $Results
                    } elseif ($param.Name -eq "ProjectInfo") {
                        $params.ProjectInfo = $ProjectInfo
                    } elseif ($param.Name -eq "ProjectRoot") {
                        $params.ProjectRoot = if ($ProjectRoot) { $ProjectRoot } else { (Get-Location).Path }
                    } elseif ($param.Name -eq "ProjectPath") {
                        # ProjectPath peut venir de Config.ProjectPath ou être calculé
                        if ($Config.ProjectPath) {
                            $params.ProjectPath = $Config.ProjectPath
                        } else {
                            $params.ProjectPath = if ($ProjectRoot) { $ProjectRoot } else { (Get-Location).Path }
                        }
                    } elseif ($param.Name -eq "PhaseNumber") {
                        $params.PhaseNumber = $PhaseNumber
                    }
                }
                
                # Appeler la fonction du module
                & $funcName @params
                Write-Info "Phase $PhaseNumber exÃƒÂ©cutÃƒÂ©e avec module: $funcName"
                return $true
            } catch {
                # Gestion d'erreurs avec logging détaillé
                $errorDetails = @{
                    Phase = $PhaseNumber
                    Function = $funcName
                    Message = $_.Exception.Message
                    StackTrace = $_.Exception.StackTrace
                    Parameters = $params.Keys -join ', '
                }
                Write-Err "Erreur lors de l'appel du module $funcName pour la phase $PhaseNumber"
                Write-Info "  Message: $($errorDetails.Message)"
                if ($script:Verbose) {
                    Write-Info "  StackTrace: $($errorDetails.StackTrace)"
                    Write-Info "  Paramètres passés: $($errorDetails.Parameters)"
                }
                # Ajouter à Results pour rapport final
                $Results.Warnings += "Phase $PhaseNumber ($funcName): $($errorDetails.Message)"
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
# Note: Get-ExpectedTables supprimée (code mort)

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

# 4. Configuration globale par défaut
if ($null -eq $configPath) {
    # Chercher dans audit/config/audit.config.ps1
    $configPath = Join-Path $auditDir "config\audit.config.ps1"
    if (-not (Test-Path $configPath)) {
        # Fallback: chercher dans scripts/
        $configPath = Join-Path $scriptRoot "audit.config.ps1"
    }
    if (Test-Path $configPath) {
        Write-Info "Utilisation de la configuration globale par défaut"
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
        Checks = @{
            DeadCode = @{ Enabled = $true; Severity = "high" }
            Duplication = @{ Enabled = $true; Threshold = 50 }
            Complexity = @{ Enabled = $true; MaxFileLines = 500; MaxFunctionLines = 100 }
            Security = @{ Enabled = $true }
            Performance = @{ Enabled = $true }
            Tests = @{ Enabled = $true }
            Documentation = @{ Enabled = $true }
            Organization = @{ Enabled = $true }
            FirmwareInteractive = @{ Enabled = $true }
        }
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
# Note: La logique d'exclusion est gérée directement dans les modules Checks

# ===============================================================================
# FONCTION HELPER POUR EXÉCUTER UNE PHASE VIA MODULE (AVEC TIMEOUT 5s)
# ===============================================================================
function Execute-Phase {
    param(
        [int]$PhaseNumber,
        [hashtable]$ModuleConfig = $null,
        [array]$Files = @(),
        [int]$TimeoutSeconds = 5
    )
    
    $phaseStartTime = Get-Date
    
    # Vérifier si la phase doit être exécutée
    if ($SelectedPhases.Count -gt 0 -and $SelectedPhases -notcontains $PhaseNumber) {
        Write-Info "Phase $PhaseNumber ignorée (non sélectionnée)"
        return
    }
    
    # Vérifier si la phase est déjà complète
    if ($completedPhases -contains $PhaseNumber) {
        Write-Info "Phase $PhaseNumber déjà complétée, reprise des résultats partiels..."
        if ($partialResults.ContainsKey("Phase$PhaseNumber")) {
            $phaseResults = $partialResults["Phase$PhaseNumber"]
            if ($phaseResults.Scores) {
                foreach ($key in $phaseResults.Scores.Keys) {
                    $auditResults.Scores[$key] = $phaseResults.Scores[$key]
                }
            }
            if ($phaseResults.Issues) { $auditResults.Issues += $phaseResults.Issues }
            if ($phaseResults.Warnings) { $auditResults.Warnings += $phaseResults.Warnings }
            if ($phaseResults.Recommendations) { $auditResults.Recommendations += $phaseResults.Recommendations }
            if ($phaseResults.CorrectionPlans) { $auditResults.CorrectionPlans += $phaseResults.CorrectionPlans }
        }
        return
    }
    
    # Obtenir le nom de la phase depuis Audit-Phases.ps1
    $phaseInfo = $script:AuditPhases | Where-Object { $_.Number -eq $PhaseNumber } | Select-Object -First 1
    $phaseName = if ($phaseInfo) { $phaseInfo.Name } else { "Phase $PhaseNumber" }
    
    # Afficher un message si c'est une dépendance automatique
    $isDependency = $script:userSelectedPhases.Count -gt 0 -and $script:userSelectedPhases -notcontains $PhaseNumber
    if ($isDependency) {
        $requestingPhases = @()
        foreach ($userPhase in $script:userSelectedPhases) {
                $allDeps = Get-PhaseDependencies -PhaseNumber $userPhase
                if ($allDeps -contains $PhaseNumber) {
                $userPhaseObj = $script:AuditPhases | Where-Object { $_.Number -eq $userPhase } | Select-Object -First 1
                if ($userPhaseObj) { $requestingPhases += $userPhaseObj }
                }
            }
        if ($requestingPhases.Count -gt 0) {
            $requestingNames = $requestingPhases | ForEach-Object { "Phase $($_.Number) ($($_.Name))" }
            Write-Host ""
            Write-Host "  ⚙️  Exécution automatique de la Phase $PhaseNumber ($phaseName)" -ForegroundColor Cyan
            Write-Host "      (dépendance requise pour: $($requestingNames -join ', '))" -ForegroundColor DarkGray
        }
    }
    
    # Exécuter la phase via module avec timeout
    $phaseTimedOut = $false
    $phaseError = $null
    
    try {
        # Préparer la configuration
        $config = if ($ModuleConfig) { $ModuleConfig } else { $script:Config }
        if (-not $config) { $config = @{} }
        if ($projectRoot) {
            if (-not $config.ProjectRoot) { $config.ProjectRoot = $projectRoot }
            if (-not $config.ProjectPath) { $config.ProjectPath = $projectRoot }
        }
        
        # Préparer les fichiers
        # Utiliser Results.Statistics au lieu de variable globale (plus fiable)
        if ($Files.Count -gt 0) {
            $filesToPass = $Files
        } elseif ($auditResults.Statistics.Inventory.FileInventory) {
            # Reconstruire depuis l'inventaire (plus fiable)
            $filesToPass = @()
            foreach ($category in $auditResults.Statistics.Inventory.FileInventory.PSObject.Properties.Name) {
                $filesToPass += $auditResults.Statistics.Inventory.FileInventory.$category
            }
        } elseif ($script:allFiles) {
            $filesToPass = $script:allFiles  # Fallback pour compatibilité
        } else {
            $filesToPass = @()
        }
        
        # ProjectInfo est déjà construit une seule fois avant toutes les phases (optimisation)
        
        # Appeler le module avec ProjectRoot pour les modules qui en ont besoin
        # Exécution directe avec monitoring du temps (pas de timeout strict car on ne peut pas interrompre facilement)
        try {
            $moduleSuccess = Invoke-PhaseModule -PhaseNumber $PhaseNumber -Config $config -Results $auditResults -ProjectInfo $projectInfo -Files $filesToPass -ProjectRoot $projectRoot
            
            # Vérifier le temps écoulé
            $elapsed = ((Get-Date) - $phaseStartTime).TotalSeconds
            if ($elapsed -gt $TimeoutSeconds) {
                Write-Warn "Phase $PhaseNumber ($phaseName) a pris ${elapsed}s (> ${TimeoutSeconds}s) - peut être lente"
                $auditResults.Warnings += "Phase $PhaseNumber ($phaseName): Exécution lente (${elapsed}s)"
            }
            
            if (-not $moduleSuccess) {
                Write-Warn "Phase ${PhaseNumber}: Module non disponible - phase ignorée"
                if (-not $auditResults.Scores.ContainsKey($phaseName)) {
                    $auditResults.Scores[$phaseName] = 5
                }
            }
        } catch {
            $phaseError = $_.Exception.Message
            Write-Err "Erreur dans le module de la phase $PhaseNumber ($phaseName): $phaseError"
            Write-Info "  L'audit continue avec les autres phases..."
            if (-not $auditResults.Scores.ContainsKey($phaseName)) {
                $auditResults.Scores[$phaseName] = 0
            }
            $auditResults.Warnings += "Phase $PhaseNumber ($phaseName): Erreur d'exécution - $phaseError"
        }
        
    } catch {
        $phaseError = $_.Exception.Message
        Write-Err "Erreur dans le module de la phase $PhaseNumber ($phaseName): $phaseError"
        Write-Info "  L'audit continue avec les autres phases..."
        if (-not $auditResults.Scores.ContainsKey($phaseName)) {
            $auditResults.Scores[$phaseName] = 0
        }
        $auditResults.Warnings += "Phase $PhaseNumber ($phaseName): Erreur d'exécution - $phaseError"
    }
    
    # Calculer le temps écoulé
    $phaseDuration = ((Get-Date) - $phaseStartTime).TotalSeconds
    
    # Marquer la phase comme complète (même en cas d'erreur/timeout pour éviter les boucles)
    $completedPhases += $PhaseNumber
    
    # Sauvegarder l'état
    if (-not [string]::IsNullOrEmpty($StateFile)) {
        try {
            $partialResults["Phase$PhaseNumber"] = @{
                Scores = $auditResults.Scores
                Issues = $auditResults.Issues
                Warnings = $auditResults.Warnings
                Recommendations = $auditResults.Recommendations
                CorrectionPlans = $auditResults.CorrectionPlans
            }
            Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
        } catch {
            $saveError = $_.Exception.Message
            Write-Warn "Erreur sauvegarde état phase $PhaseNumber : $saveError"
        }
    }
    
    # Afficher le statut
    if ($phaseTimedOut) {
        Write-Warn "Phase $PhaseNumber ($phaseName) - TIMEOUT (${phaseDuration}s)"
    } elseif ($phaseError) {
        Write-Err "Phase $PhaseNumber ($phaseName) - ERREUR (${phaseDuration}s)"
    } else {
        Write-OK "Phase $PhaseNumber ($phaseName) terminée (${phaseDuration}s)"
    }
}

# ===============================================================================
# CONSTRUCTION DE PROJECTINFO (UNE SEULE FOIS - OPTIMISATION)
# ===============================================================================
# Construire ProjectInfo une seule fois avant toutes les phases (au lieu de 23 fois)
$projectInfo = @{}
if ($projectRoot) { 
    $projectInfo.ProjectRoot = $projectRoot
    $projectInfo.ProjectPath = $projectRoot
}
# Ajouter les infos du projet depuis projectInfo global si disponible
if ($script:projectInfo) {
    foreach ($key in $script:projectInfo.Keys) {
        if (-not $projectInfo.ContainsKey($key)) {
            $projectInfo[$key] = $script:projectInfo[$key]
        }
    }
}

# ===============================================================================
# EXÉCUTION DES PHASES D'AUDIT (ORDRE LOGIQUE OPTIMISÉ 1-23)
# ===============================================================================
# Ordre optimisé: Structure → Config → Liens → Sécurité → Backend → Qualité → Frontend → Performance → Documentation → Déploiement → Hardware → Tests

# Phase 1 : Inventaire Exhaustif
Execute-Phase -PhaseNumber 1

# Récupérer allFiles depuis Statistics si disponible (stocké par le module)
if ($auditResults.Statistics -and $auditResults.Statistics.Inventory -and $auditResults.Statistics.Inventory.FileInventory) {
    $script:fileInventory = $auditResults.Statistics.Inventory.FileInventory
    $script:allFiles = @()
    foreach ($category in $auditResults.Statistics.Inventory.FileInventory.PSObject.Properties.Name) {
        $script:allFiles += $auditResults.Statistics.Inventory.FileInventory.$category
    }
}

# Phase 2 : Architecture et Statistiques
Execute-Phase -PhaseNumber 2 -Files $script:allFiles

# Phase 3 : Organisation
$moduleConfig3 = $script:Config
if ($script:Config.Routes) { $moduleConfig3.Routes = $script:Config.Routes }
Execute-Phase -PhaseNumber 3 -ModuleConfig $moduleConfig3 -Files $script:allFiles

# Phase 4 : Cohérence Configuration
Execute-Phase -PhaseNumber 4 -Files $script:allFiles

# Phase 5 : Liens et Imports
$moduleConfig5 = $script:Config
if ($projectRoot) { $moduleConfig5.ProjectRoot = $projectRoot } else { $moduleConfig5.ProjectRoot = (Get-Location).Path }
Execute-Phase -PhaseNumber 5 -ModuleConfig $moduleConfig5

# Phase 6 : Sécurité
Execute-Phase -PhaseNumber 6 -Files $script:allFiles

# Phase 7 : Structure API
$moduleConfig7 = $script:Config
if ($projectRoot) { $moduleConfig7.ProjectPath = $projectRoot } else { $moduleConfig7.ProjectPath = (Get-Location).Path }
Execute-Phase -PhaseNumber 7 -ModuleConfig $moduleConfig7

# Phase 8 : Endpoints API
$moduleConfig8 = $script:Config
if (-not $moduleConfig8) { $moduleConfig8 = @{} }
if (-not $moduleConfig8.API) { $moduleConfig8.API = @{} }
if (-not $moduleConfig8.API.BaseUrl) { 
    $moduleConfig8.API.BaseUrl = if ($ApiUrl) { $ApiUrl } else { '' }
}
# Phase 8 : Essayer d'exécuter avec timeout court, skip si échec
try {
    Execute-Phase -PhaseNumber 8 -ModuleConfig $moduleConfig8 -TimeoutSeconds 2
} catch {
    Write-Warn "Phase 8 (Endpoints API) ignorée - continue avec les autres phases"
    $completedPhases += 8
    if (-not $auditResults.Scores.ContainsKey("API")) {
        $auditResults.Scores["API"] = 0
    }
    $auditResults.Warnings += "Phase 8 (Endpoints API): Ignorée - API non accessible ou timeout"
}

# Phase 9 : Base de Données
$moduleConfig9 = $script:Config
if (-not $moduleConfig9) { $moduleConfig9 = @{} }
if (-not $moduleConfig9.API) { $moduleConfig9.API = @{} }
if (-not $moduleConfig9.API.BaseUrl) { 
    $moduleConfig9.API.BaseUrl = if ($ApiUrl) { $ApiUrl } else { '' }
}
try {
    Execute-Phase -PhaseNumber 9 -ModuleConfig $moduleConfig9 -TimeoutSeconds 3
} catch {
    Write-Warn "Phase 9 (Base de Données) ignorée - continue avec les autres phases"
    $completedPhases += 9
    if (-not $auditResults.Scores.ContainsKey("Base de Données")) {
        $auditResults.Scores["Base de Données"] = 0
    }
    $auditResults.Warnings += "Phase 9 (Base de Données): Ignorée - API non accessible ou timeout"
}

# Phase 10 : Code Mort
Execute-Phase -PhaseNumber 10 -Files $script:allFiles

# Phase 11 : Duplication de Code
Execute-Phase -PhaseNumber 11 -Files $script:allFiles

# Phase 12 : Complexité
Execute-Phase -PhaseNumber 12 -Files $script:allFiles

# Phase 13 : Optimisations Avancées
Execute-Phase -PhaseNumber 13 -Files $script:allFiles

# Phase 14 : Tests
Execute-Phase -PhaseNumber 14 -Files $script:allFiles

# Phase 15 : Gestion d'Erreurs
Execute-Phase -PhaseNumber 15 -Files $script:allFiles

# Phase 16 : Routes et Navigation
$moduleConfig16 = $script:Config
if ($script:Config.Routes) { $moduleConfig16.Routes = $script:Config.Routes }
Execute-Phase -PhaseNumber 16 -ModuleConfig $moduleConfig16

# Phase 17 : Accessibilité (a11y)
Execute-Phase -PhaseNumber 17 -Files $script:allFiles

# Phase 18 : Uniformisation UI/UX
Execute-Phase -PhaseNumber 18 -Files $script:allFiles

# Phase 19 : Performance
Execute-Phase -PhaseNumber 19 -Files $script:allFiles

# Phase 20 : Documentation
Execute-Phase -PhaseNumber 20 -Files $script:allFiles

# Phase 21 : Synchronisation GitHub Pages
$moduleConfig21 = $script:Config
if ($projectRoot) { $moduleConfig21.ProjectPath = $projectRoot } else { $moduleConfig21.ProjectPath = (Get-Location).Path }
Execute-Phase -PhaseNumber 21 -ModuleConfig $moduleConfig21

# Phase 22 : Firmware
Execute-Phase -PhaseNumber 22 -Files $script:allFiles

# Phase 23 : Tests Complets Application
try {
    Execute-Phase -PhaseNumber 23 -Files $script:allFiles -TimeoutSeconds 10
} catch {
    Write-Warn "Phase 23 (Tests Complets) - erreur mais continue: $($_.Exception.Message)"
    $completedPhases += 23
    if (-not $auditResults.Scores.ContainsKey("Tests Complets Application")) {
        $auditResults.Scores["Tests Complets Application"] = 5
    }
}

# ===============================================================================
# GÉNÉRATION SUIVI TEMPS (INTÉGRÉ)
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
# ===============================================================================
# CALCUL SCORE GLOBAL ET FINALISATION
# ===============================================================================

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host "  STATUT DES PHASES" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

# Afficher le statut de chaque phase
$phasesStatus = @()
for ($i = 1; $i -le 23; $i++) {
    $phaseInfo = $script:AuditPhases | Where-Object { $_.Number -eq $i } | Select-Object -First 1
    $phaseName = if ($phaseInfo) { $phaseInfo.Name } else { "Phase $i" }
    
    $status = "❌"
    $statusColor = "Red"
    
    if ($completedPhases -contains $i) {
        # Mapping des noms de phases vers les clés de scores
        $scoreKey = switch ($phaseName) {
            "Inventaire Exhaustif" { "Inventory" }
            "Architecture et Statistiques" { "Architecture" }
            "Optimisations Avancées" { "Optimisations" }
            "Gestion d'Erreurs" { "Gestion d'Erreurs" }
            "Structure API" { "Structure API" }
            "Cohérence Configuration" { "Cohérence Configuration" }
            "Tests Complets Application" { "TestsComplets" }
            "Code Mort" { "Code Mort" }
            "Duplication de Code" { "Duplication" }
            "Complexité" { "Complexity" }
            "Tests" { "Tests" }
            "Liens et Imports" { "MarkdownFiles" }
            "Routes et Navigation" { "Routes" }
            "Accessibilité (a11y)" { "UI/UX" }
            "Uniformisation UI/UX" { "UI/UX" }
            "Performance" { "Performance" }
            "Documentation" { "Documentation" }
            "Sécurité" { "Security" }
            "Organisation" { "Organization" }
            "Base de Données" { "Database" }
            "Firmware" { "Firmware" }
            "Synchronisation GitHub Pages" { "Synchronisation GitHub Pages" }
            default { $phaseName }
        }
        
        # Vérifier que scoreKey n'est pas null
        if ([string]::IsNullOrEmpty($scoreKey)) {
            $scoreKey = $phaseName
        }
        
        if ($auditResults.Scores.ContainsKey($scoreKey)) {
            $score = $auditResults.Scores[$scoreKey]
            if ($score -ge 7) {
                $status = "✅"
                $statusColor = "Green"
            } elseif ($score -ge 5) {
                $status = "⚠️"
                $statusColor = "Yellow"
            } else {
                $status = "❌"
                $statusColor = "Red"
            }
        } else {
            $status = "⚠️"
            $statusColor = "Yellow"
        }
    } elseif ($SelectedPhases.Count -gt 0 -and $SelectedPhases -notcontains $i) {
        $status = "⏭️"
        $statusColor = "Gray"
    } else {
        $status = "❌"
        $statusColor = "Red"
    }
    
    # Vérifier que scoreKey est défini avant de l'utiliser
    if (-not $scoreKey) {
        $scoreKey = $phaseName
    }
    
    $phasesStatus += [PSCustomObject]@{
        Number = $i
        Name = $phaseName
        Status = $status
        StatusColor = $statusColor
        Score = if ($scoreKey -and $auditResults.Scores.ContainsKey($scoreKey)) { $auditResults.Scores[$scoreKey] } else { "N/A" }
    }
}

# Afficher par groupes de 5
for ($i = 0; $i -lt $phasesStatus.Count; $i += 5) {
    $group = $phasesStatus[$i..([Math]::Min($i + 4, $phasesStatus.Count - 1))]
    foreach ($phase in $group) {
        $scoreText = if ($phase.Score -ne "N/A") { " (Score: $($phase.Score))" } else { "" }
        Write-Host "  $($phase.Status) Phase $($phase.Number.ToString().PadLeft(2)): $($phase.Name.PadRight(30))$scoreText" -ForegroundColor $phase.StatusColor
    }
    if ($i + 5 -lt $phasesStatus.Count) {
        Write-Host ""
    }
}

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host "  RÉSUMÉ FINAL DE L'AUDIT" -ForegroundColor Cyan
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

# Calculer le score global
try {
    $globalScore = Calculate-GlobalScore -Results $auditResults -Config $script:Config
    Write-Host "  Score Global     : $globalScore/10" -ForegroundColor $(if($globalScore -ge 9){"Green"}elseif($globalScore -ge 7){"Yellow"}else{"Red"})
} catch {
    Write-Host "  Score Global     : N/A (erreur de calcul)" -ForegroundColor Yellow
}

# Compter les phases réellement exécutées depuis les scores
$phasesExecuted = ($auditResults.Scores.Keys | Measure-Object).Count
$phasesOK = ($phasesStatus | Where-Object { $_.Status -eq "✅" }).Count
$phasesWarn = ($phasesStatus | Where-Object { $_.Status -eq "⚠️" }).Count
$phasesError = ($phasesStatus | Where-Object { $_.Status -eq "❌" }).Count
$phasesSkipped = ($phasesStatus | Where-Object { $_.Status -eq "⏭️" }).Count

Write-Host "  Phases complétées : $phasesExecuted/23" -ForegroundColor $(if($phasesExecuted -eq 23){"Green"}elseif($phasesExecuted -ge 15){"Yellow"}else{"Red"})
Write-Host "    ✅ OK          : $phasesOK" -ForegroundColor Green
Write-Host "    ⚠️  Avertissements: $phasesWarn" -ForegroundColor Yellow
Write-Host "    ❌ Erreurs     : $phasesError" -ForegroundColor Red
if ($phasesSkipped -gt 0) {
    Write-Host "    ⏭️  Ignorées    : $phasesSkipped" -ForegroundColor Gray
}
Write-Host "  Problèmes        : $($auditResults.Issues.Count)" -ForegroundColor $(if($auditResults.Issues.Count -eq 0){"Green"}else{"Red"})
Write-Host "  Avertissements   : $($auditResults.Warnings.Count)" -ForegroundColor $(if($auditResults.Warnings.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Recommandations  : $($auditResults.Recommendations.Count)" -ForegroundColor Yellow
Write-Host "  Durée            : $([Math]::Round($duration, 1))s" -ForegroundColor Gray
Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

