# ===============================================================================
# SYSTÈME D'AUDIT OTT v2.0 - ARCHITECTURE RECONÇUE
# ===============================================================================

param(
    [string]$Target = "project",  # project, file, directory
    [string]$Path = "",           # Chemin spécifique pour file/directory
    [string]$Phases = "all",      # all, ou liste: "1,2,3"
    [switch]$Verbose = $false,
    [switch]$Quiet = $false
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
try { & chcp 65001 > $null } catch { }
$global:OutputEncoding = [System.Text.Encoding]::UTF8

# Configuration
$script:Config = @{
    Version = "2.0.0"
    ProjectRoot = ""
    OutputDir = (Join-Path $PSScriptRoot "resultats")
    Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
}

$script:AuditConfig = $null
$script:Results = $null
$script:ProjectInfo = $null
$script:Files = @()

$script:Verbose = [bool]$Verbose

$utilsPath = Join-Path $PSScriptRoot "modules\Utils.ps1"
if (Test-Path $utilsPath) { . $utilsPath }
$fileScannerPath = Join-Path $PSScriptRoot "modules\FileScanner.ps1"
if (Test-Path $fileScannerPath) { . $fileScannerPath }
$projectDetectorPath = Join-Path $PSScriptRoot "modules\ProjectDetector.ps1"
if (Test-Path $projectDetectorPath) { . $projectDetectorPath }

# Définition des phases avec dépendances et ordre logique
$script:AuditPhases = @(
    # PHASE 1: STRUCTURE DE BASE (fondation)
    @{
        Id = 1
        Name = "Inventaire Complet"
        Description = "Analyse de tous les fichiers et répertoires"
        Category = "Structure"
        Dependencies = @()
        Priority = 1
        Modules = @("Checks-Inventory.ps1")
        Target = "project"
    },
    
    # PHASE 2: ARCHITECTURE (dépend de l'inventaire)
    @{
        Id = 2
        Name = "Architecture Projet"
        Description = "Structure, organisation, dépendances"
        Category = "Structure"
        Dependencies = @(1)
        Priority = 2
        Modules = @("Checks-Architecture.ps1", "Checks-Organization.ps1")
        Target = "project"
    },
    
    # PHASE 3: SÉCURITÉ (critique, dépend de la structure)
    @{
        Id = 3
        Name = "Sécurité"
        Description = "Vulnérabilités, secrets, injections"
        Category = "Sécurité"
        Dependencies = @(1, 2)
        Priority = 3
        Modules = @("Checks-Security.ps1")
        Target = "project"
    },
    
    # PHASE 4: CONFIGURATION (cohérence environnement)
    @{
        Id = 4
        Name = "Configuration"
        Description = "Docker, environnement, cohérence"
        Category = "Configuration"
        Dependencies = @(1)
        Priority = 4
        Modules = @("Checks-ConfigConsistency.ps1")
        Target = "project"
    },
    
    # PHASE 5: BACKEND (API et base de données)
    @{
        Id = 5
        Name = "Backend API"
        Description = "Endpoints, handlers, base de données"
        Category = "Backend"
        Dependencies = @(1, 2)
        Priority = 5
        Modules = @("Checks-API.ps1", "Checks-StructureAPI.ps1", "Checks-Database.ps1")
        Target = "project"
    },
    
    # PHASE 6: FRONTEND (interface utilisateur)
    @{
        Id = 6
        Name = "Frontend"
        Description = "Routes, navigation, accessibilité"
        Category = "Frontend"
        Dependencies = @(1, 2)
        Priority = 6
        Modules = @("Checks-Routes.ps1", "Checks-UI.ps1")
        Target = "project"
    },
    
    # PHASE 7: QUALITÉ CODE (analyse statique)
    @{
        Id = 7
        Name = "Qualité Code"
        Description = "Code mort, duplication, complexité"
        Category = "Qualité"
        Dependencies = @(1, 2)
        Priority = 7
        Modules = @("Checks-CodeMort.ps1", "Checks-Duplication.ps1", "Checks-Complexity.ps1")
        Target = "project"
    },
    
    # PHASE 8: PERFORMANCE
    @{
        Id = 8
        Name = "Performance"
        Description = "Optimisations, mémoire, vitesse"
        Category = "Performance"
        Dependencies = @(1, 2, 5, 6)
        Priority = 8
        Modules = @("Checks-Performance.ps1", "Checks-Optimizations.ps1")
        Target = "project"
    },
    
    # PHASE 9: DOCUMENTATION
    @{
        Id = 9
        Name = "Documentation"
        Description = "README, commentaires, guides"
        Category = "Documentation"
        Dependencies = @(1, 2)
        Priority = 9
        Modules = @("Checks-Documentation.ps1", "Checks-MarkdownFiles.ps1")
        Target = "project"
    },
    
    # PHASE 10: TESTS
    @{
        Id = 10
        Name = "Tests"
        Description = "Tests unitaires, intégration, fonctionnels"
        Category = "Tests"
        Dependencies = @(1, 2, 5)
        Priority = 10
        Modules = @("Checks-Tests.ps1", "Checks-FunctionalTests.ps1")
        Target = "project"
    },
    
    # PHASE 11: DÉPLOIEMENT
    @{
        Id = 11
        Name = "Déploiement"
        Description = "CI/CD, GitHub Pages, configuration"
        Category = "Déploiement"
        Dependencies = @(1, 4)
        Priority = 11
        Modules = @()
        Target = "project"
    },
    
    # PHASE 12: HARDWARE/FIRMWARE
    @{
        Id = 12
        Name = "Hardware/Firmware"
        Description = "Arduino, compilation, cohérence"
        Category = "Hardware"
        Dependencies = @(1)
        Priority = 12
        Modules = @("Checks-FirmwareInteractive.ps1")
        Target = "project"
    },
    
    # PHASE 13: IA et Compléments
    @{
        Id = 13
        Name = "IA et Compléments"
        Description = "Tests exhaustifs, IA, suivi temps"
        Category = "IA"
        Dependencies = @(1, 2, 5, 10)
        Priority = 13
        Modules = @("Checks-FunctionalTests.ps1", "Checks-TestsComplets.ps1", "Checks-TimeTracking.ps1", "AI-TestsComplets.ps1")
        Target = "project"
        ProjectSpecific = @("ott")
    }
)

# Fonctions utilitaires
function Write-Log {
    param([string]$Message, [string]$Level = "INFO", [switch]$NoTimestamp)
    
    if ($Quiet) { return }

    if (Get-Command -Name Convert-ToAsciiSafe -ErrorAction SilentlyContinue) {
        $Message = Convert-ToAsciiSafe -Text $Message
    }
    
    $prefix = if (-not $NoTimestamp) { "[$(Get-Date -Format 'HH:mm:ss')]" } else { "" }
    
    switch ($Level) {
        "INFO" { Write-Host "$prefix [INFO] $Message" -ForegroundColor White }
        "SUCCESS" { Write-Host "$prefix [SUCCESS] $Message" -ForegroundColor Green }
        "WARN" { Write-Host "$prefix [WARN] $Message" -ForegroundColor Yellow }
        "ERROR" { Write-Host "$prefix [ERROR] $Message" -ForegroundColor Red }
        "PHASE" { Write-Host "$prefix [PHASE] $Message" -ForegroundColor Cyan }
        "MODULE" { Write-Host "$prefix [MODULE] $Message" -ForegroundColor Magenta }
        "DETAIL" { Write-Host "$prefix [DETAIL] $Message" -ForegroundColor Gray }
        "PROGRESS" { Write-Host "$prefix [⏳] $Message" -ForegroundColor Blue }
        default { Write-Host "$prefix [$Level] $Message" }
    }
}

function Write-PhaseHeader {
    param([int]$PhaseId, [string]$PhaseName, [string]$Description, [int]$ModuleCount)
    Write-Log "=== Phase $PhaseId : $PhaseName ===" "PHASE" -NoTimestamp
    Write-Log "Description: $Description" "DETAIL"
    Write-Log "Modules à exécuter: $ModuleCount" "DETAIL"
    if ($script:ProjectProfile) {
        Write-Log "Projet détecté: $($script:ProjectProfile.Id)" "DETAIL"
    }
}

function Write-ModuleStart {
    param([string]$ModuleName, [string]$ModulePath)
    Write-Log "▶ Démarrage: $ModuleName" "MODULE"
    if ($Verbose) {
        Write-Log "  Chemin: $ModulePath" "DETAIL"
    }
}

function Write-ModuleResult {
    param([string]$ModuleName, [string]$Status, [timespan]$Duration, [int]$Issues = 0)
    $statusIcon = switch ($Status) {
        "SUCCESS" { "✅" }
        "WARNING" { "⚠️" }
        "ERROR" { "❌" }
        "SKIPPED" { "⏭️" }
        default { "❓" }
    }
    $issuesText = if ($Issues -gt 0) { " ($Issues issues)" } else { "" }
    Write-Log "$statusIcon $ModuleName terminé en $([math]::Round($Duration.TotalSeconds, 2))s$issuesText" "MODULE"
}

function Write-PhaseSummary {
    param([int]$PhaseId, [string]$PhaseName, [timespan]$TotalDuration, [hashtable]$Results)
    $successCount = ($Results.Values | Where-Object { $_.Status -eq "SUCCESS" }).Count
    $warningCount = ($Results.Values | Where-Object { $_.Status -eq "WARNING" }).Count
    $errorCount = ($Results.Values | Where-Object { $_.Status -eq "ERROR" }).Count
    
    Write-Log "Phase $PhaseId terminée en $([math]::Round($TotalDuration.TotalSeconds, 2))s" "SUCCESS"
    if ($warningCount -gt 0 -or $errorCount -gt 0) {
        Write-Log "  Résumé: $successCount succès, $warningCount avertissements, $errorCount erreurs" "DETAIL"
    }
    Write-Log "Résultats: $($script:Config.OutputDir)\phase_$PhaseId`_$($script:Config.Timestamp).json" "DETAIL"
}

function Import-AuditDependencies {
    $utilsPath = Join-Path $PSScriptRoot "modules\Utils.ps1"
    if (Test-Path $utilsPath) {
        . $utilsPath
    }

    $fileScannerPath = Join-Path $PSScriptRoot "modules\FileScanner.ps1"
    if (Test-Path $fileScannerPath) {
        . $fileScannerPath
    }

    $projectDetectorPath = Join-Path $PSScriptRoot "modules\ProjectDetector.ps1"
    if (Test-Path $projectDetectorPath) {
        . $projectDetectorPath
    }
}

function Get-ProjectProfile {
    param(
        [Parameter(Mandatory=$true)][string]$ProjectRoot
    )

    $projectsDir = Join-Path $PSScriptRoot "projects"
    if (-not (Test-Path $projectsDir)) { return $null }

    $best = $null
    $bestScore = -1

    $projectFiles = Get-ChildItem -Path $projectsDir -Filter "project.ps1" -Recurse -File -ErrorAction SilentlyContinue
    foreach ($file in $projectFiles) {
        try {
            $profile = . $file.FullName
            if (-not ($profile -is [hashtable])) { continue }
            if (-not $profile.ContainsKey('Id')) { continue }
            if (-not $profile.ContainsKey('Detect')) { continue }

            $detect = $profile.Detect
            $score = 0
            if ($detect -is [scriptblock]) {
                $score = & $detect $ProjectRoot
            }

            if ($score -gt $bestScore) {
                $bestScore = $score
                $best = $profile
                $best.ProjectFile = $file.FullName
            }
        } catch {
        }
    }

    if ($bestScore -le 0) { return $null }
    return $best
}

function Merge-Hashtable {
    param(
        [Parameter(Mandatory=$true)][hashtable]$Base,
        [Parameter(Mandatory=$true)][hashtable]$Override
    )

    $merged = $Base.Clone()
    foreach ($key in $Override.Keys) {
        if ($merged.ContainsKey($key) -and ($merged[$key] -is [hashtable]) -and ($Override[$key] -is [hashtable])) {
            $merged[$key] = Merge-Hashtable -Base $merged[$key] -Override $Override[$key]
        } else {
            $merged[$key] = $Override[$key]
        }
    }
    return $merged
}

function Load-AuditConfig {
    $base = @{
        Exclude = @{
            Directories = @()
            Files = @()
        }
        Checks = @{ }
    }

    $configPath = Join-Path $PSScriptRoot "config\audit.config.ps1"
    if (Test-Path $configPath) {
        try {
            $cfg = . $configPath
            if ($cfg -is [hashtable]) {
                $base = Merge-Hashtable -Base $base -Override $cfg
            }
        } catch {
            Write-Log "Erreur chargement config globale: $($_.Exception.Message)" "WARN"
        }
    }

    $configLocalPath = Join-Path $PSScriptRoot "config\audit.config.local.ps1"
    if (Test-Path $configLocalPath) {
        try {
            $cfgLocal = . $configLocalPath
            if ($cfgLocal -is [hashtable]) {
                $base = Merge-Hashtable -Base $base -Override $cfgLocal
            }
        } catch {
            Write-Log "Erreur chargement config locale: $($_.Exception.Message)" "WARN"
        }
    }

    $profile = Get-ProjectProfile -ProjectRoot $script:Config.ProjectRoot
    if ($profile) {
        $script:ProjectProfile = $profile
        $projectId = $profile.Id
        Write-Log "Projet detecte: $projectId" "SUCCESS"

        $projectConfigPath = Join-Path $PSScriptRoot ("projects\" + $projectId + "\config\audit.config.ps1")
        if (Test-Path $projectConfigPath) {
            try {
                $pcfg = . $projectConfigPath
                if ($pcfg -is [hashtable]) {
                    $base = Merge-Hashtable -Base $base -Override $pcfg
                }
            } catch {
                Write-Log "Erreur chargement config projet ($projectId): $($_.Exception.Message)" "WARN"
            }
        }

        $projectConfigLocalPath = Join-Path $PSScriptRoot ("projects\" + $projectId + "\config\audit.config.local.ps1")
        if (Test-Path $projectConfigLocalPath) {
            try {
                $plocal = . $projectConfigLocalPath
                if ($plocal -is [hashtable]) {
                    $base = Merge-Hashtable -Base $base -Override $plocal
                }
            } catch {
                Write-Log "Erreur chargement config locale projet ($projectId): $($_.Exception.Message)" "WARN"
            }
        }
    }

    return $base
}

function Resolve-AuditModulePath {
    param(
        [Parameter(Mandatory=$true)][string]$Module
    )

    if ($script:ProjectProfile -and $script:ProjectProfile.Id) {
        $projectModulePath = Join-Path $PSScriptRoot ("projects\" + $script:ProjectProfile.Id + "\modules\" + $Module)
        if (Test-Path $projectModulePath) { return $projectModulePath }
    }

    $coreModulePath = Join-Path $PSScriptRoot ("modules\" + $Module)
    return $coreModulePath
}

function Resolve-TargetRoot {
    if ($Target -eq "project") {
        # Par défaut: le projet est le parent du dossier "audit"
        $repoRoot = Split-Path -Parent $PSScriptRoot
        return $repoRoot
    }
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "Le paramètre -Path est requis pour Target=$Target"
    }
    if (-not (Test-Path $Path)) {
        throw "Chemin introuvable: $Path"
    }
    $resolved = (Resolve-Path $Path -ErrorAction Stop).Path
    $item = Get-Item $resolved -ErrorAction Stop
    if ($Target -eq "file") {
        return $item.Directory.FullName
    }
    if ($Target -eq "directory") {
        return $item.FullName
    }
    return (Get-Location).Path
}

function Initialize-AuditContext {
    $script:Verbose = [bool]$Verbose

    $script:AuditConfig = Load-AuditConfig

    if (Get-Command Get-ProjectInfo -ErrorAction SilentlyContinue) {
        try {
            $script:ProjectInfo = Get-ProjectInfo -Path $script:Config.ProjectRoot
        } catch {
            $script:ProjectInfo = @{ }
        }
    } else {
        $script:ProjectInfo = @{ }
    }

    $script:Results = @{
        Scores = @{ }
        Recommendations = @()
        Statistics = @{ }
        API = @{ }
    }

    if ($Target -eq "file") {
        $script:Files = @((Get-Item $Path -ErrorAction Stop))
    } elseif (Get-Command Get-ProjectFiles -ErrorAction SilentlyContinue) {
        $script:Files = @(Get-ProjectFiles -Path $script:Config.ProjectRoot -Config $script:AuditConfig)
    } else {
        $script:Files = @(Get-ChildItem -Path $script:Config.ProjectRoot -Recurse -File -ErrorAction SilentlyContinue)
    }
}

function Invoke-AuditModule {
    param(
        [Parameter(Mandatory=$true)][string]$Module
    )

    $modulePath = Resolve-AuditModulePath -Module $Module
    if (-not (Test-Path $modulePath)) {
        throw "Module introuvable: $Module"
    }

    . $modulePath

    $suffix = ($Module -replace '^Checks-','' -replace '\.ps1$','')
    $functionName = "Invoke-Check-$suffix"
    $cmd = Get-Command $functionName -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Fonction introuvable pour $Module (attendue: $functionName)"
    }

    $invokeParams = @{ }
    if ($cmd.Parameters.ContainsKey('Config')) { $invokeParams.Config = $script:AuditConfig }
    if ($cmd.Parameters.ContainsKey('Results')) { $invokeParams.Results = $script:Results }
    if ($cmd.Parameters.ContainsKey('Files')) { $invokeParams.Files = $script:Files }
    if ($cmd.Parameters.ContainsKey('ProjectPath')) { $invokeParams.ProjectPath = $script:Config.ProjectRoot }
    if ($cmd.Parameters.ContainsKey('ProjectRoot')) { $invokeParams.ProjectRoot = $script:Config.ProjectRoot }
    if ($cmd.Parameters.ContainsKey('ProjectInfo')) { $invokeParams.ProjectInfo = $script:ProjectInfo }

    # Capturer les résultats du module
    $moduleResult = & $functionName @invokeParams
    
    # Retourner un objet structuré avec les statistiques
    if ($moduleResult -is [hashtable]) {
        return @{
            Success = $true
            Errors = if ($moduleResult.ContainsKey('Errors')) { $moduleResult.Errors } else { 0 }
            Warnings = if ($moduleResult.ContainsKey('Warnings')) { $moduleResult.Warnings } else { 0 }
            Issues = if ($moduleResult.ContainsKey('Issues')) { $moduleResult.Issues } else { @() }
            Score = if ($moduleResult.ContainsKey('Score')) { $moduleResult.Score } else { 10 }
            Result = $moduleResult
        }
    } else {
        # Comportement par défaut si le module ne retourne pas de hashtable
        return @{
            Success = $true
            Errors = 0
            Warnings = 0
            Issues = @()
            Score = 10
            Result = $moduleResult
        }
    }
}

function Test-ModuleExists {
    param([string]$ModuleName)
    $modulePath = Resolve-AuditModulePath -Module $ModuleName
    return Test-Path $modulePath
}

function Get-PhaseDependencies {
    param([int]$PhaseId, [hashtable]$Visited = @{ })

    if ($Visited.ContainsKey($PhaseId)) {
        return @()
    }

    $phase = $script:AuditPhases | Where-Object { $_.Id -eq $PhaseId }
    if (-not $phase) {
        return @()
    }

    $Visited[$PhaseId] = $true
    $allDeps = @()

    foreach ($depId in $phase.Dependencies) {
        $allDeps += Get-PhaseDependencies -PhaseId $depId -Visited $Visited
        $allDeps += $depId
    }

    return ($allDeps | Sort-Object -Unique)
}

function Resolve-PhaseExecution {
    param([array]$RequestedPhases)

    $allPhases = @()
    foreach ($phaseId in $RequestedPhases) {
        $deps = Get-PhaseDependencies -PhaseId $phaseId
        foreach ($dep in $deps) {
            if ($allPhases -notcontains $dep) {
                $allPhases += $dep
            }
        }
        if ($allPhases -notcontains $phaseId) {
            $allPhases += $phaseId
        }
    }

    # Filtrer les phases spécifiques projet si non détecté
    $availablePhases = @()
    foreach ($phaseId in $allPhases) {
        $phase = $script:AuditPhases | Where-Object { $_.Id -eq $phaseId }
        if ($phase -and $phase.ProjectSpecific) {
            # Phase spécifique projet : vérifier si le projet détecté est autorisé
            if ($script:ProjectProfile -and $phase.ProjectSpecific -contains $script:ProjectProfile.Id) {
                $availablePhases += $phaseId
            }
            # Sinon, ignorer cette phase
        } else {
            # Phase générique : toujours inclure
            $availablePhases += $phaseId
        }
    }

    # Trier par priorité
    $sortedPhases = @()
    foreach ($phase in $script:AuditPhases | Sort-Object Priority) {
        if ($availablePhases -contains $phase.Id) {
            $sortedPhases += $phase.Id
        }
    }

    return $sortedPhases
}

function Invoke-InteractiveMenu {
    Write-Host "" 
    Write-Host "==============================" -ForegroundColor Cyan
    Write-Host "Menu Audit" -ForegroundColor Cyan
    Write-Host "==============================" -ForegroundColor Cyan

    $targetChoice = Read-Host "Cible (1=projet, 2=fichier, 3=repertoire) [1]"
    if ([string]::IsNullOrWhiteSpace($targetChoice)) { $targetChoice = "1" }

    switch ($targetChoice) {
        "2" { $script:Target = "file" }
        "3" { $script:Target = "directory" }
        default { $script:Target = "project" }
    }

    if ($script:Target -ne "project") {
        $p = Read-Host "Chemin (relatif ou absolu)"
        if ([string]::IsNullOrWhiteSpace($p)) {
            throw "Chemin requis pour Target=$script:Target"
        }
        $script:Path = $p
    }

    Write-Host "" 
    Write-Host "Phases disponibles:" -ForegroundColor Gray
    foreach ($ph in ($script:AuditPhases | Sort-Object Id)) {
        Write-Host ("  " + $ph.Id + " - " + $ph.Name) -ForegroundColor Gray
    }

    $phasesChoice = Read-Host "Phases (all ou liste ex: 1,2,3) [all]"
    if ([string]::IsNullOrWhiteSpace($phasesChoice)) { $phasesChoice = "all" }
    $script:Phases = $phasesChoice

    $verboseChoice = Read-Host "Verbose ? (o/n) [n]"
    $script:Verbose = ($verboseChoice -match '^(o|oui|y|yes)$')

    $quietChoice = Read-Host "Silencieux ? (o/n) [n]"
    $script:Quiet = ($quietChoice -match '^(o|oui|y|yes)$')

    Write-Host "" 
    Write-Host "Résumé:" -ForegroundColor Cyan
    Write-Host ("  Target: " + $script:Target) -ForegroundColor Cyan
    if ($script:Target -ne "project") {
        Write-Host ("  Path: " + $script:Path) -ForegroundColor Cyan
    }
    Write-Host ("  Phases: " + $script:Phases) -ForegroundColor Cyan
    Write-Host ("  Verbose: " + [bool]$script:Verbose) -ForegroundColor Cyan
    Write-Host ("  Quiet: " + [bool]$script:Quiet) -ForegroundColor Cyan

    $confirm = Read-Host "Lancer l'audit ? (o/n) [o]"
    if ([string]::IsNullOrWhiteSpace($confirm)) { $confirm = "o" }
    if ($confirm -notmatch '^(o|oui|y|yes)$') {
        Write-Host "Audit annulé." -ForegroundColor Yellow
        exit 0
    }
}

function Initialize-AuditEnvironment {
    Write-Log "Initialisation de l'environnement d'audit..." "INFO"

    $script:Config.ProjectRoot = Resolve-TargetRoot

    $script:OriginalLocation = (Get-Location).Path

    try {
        Push-Location -Path $script:Config.ProjectRoot
    } catch {
        throw "Impossible de se placer dans le répertoire projet '$($script:Config.ProjectRoot)': $($_.Exception.Message)"
    }

    # Création du répertoire de résultats
    if (-not (Test-Path $script:Config.OutputDir)) {
        New-Item -ItemType Directory -Path $script:Config.OutputDir -Force | Out-Null
        Write-Log "Création du répertoire de résultats: $($script:Config.OutputDir)" "INFO"
    }

    Write-Log "Projet: $($script:Config.ProjectRoot)" "SUCCESS"
    Write-Log "Cible: $Target" "INFO"

    Import-AuditDependencies
    Initialize-AuditContext
}

function Execute-Phase {
    param([object]$Phase)

    $phaseStartTime = Get-Date
    Write-PhaseHeader -PhaseId $Phase.Id -PhaseName $Phase.Name -Description $Phase.Description -ModuleCount $Phase.Modules.Count

    if ($Phase.Dependencies.Count -gt 0) {
        Write-Log "Dépendances: $($Phase.Dependences -join ', ')" "DETAIL"
    }

    $results = @{}
    $moduleIndex = 0
    
    foreach ($module in $Phase.Modules) {
        $moduleIndex++
        $modulePath = Resolve-AuditModulePath -Module $module
        
        if (-not (Test-Path $modulePath)) {
            Write-Log "⚠ Module $module introuvable, ignoré" "WARN"
            if ($Verbose) {
                Write-Log "  Chemin recherché: $modulePath" "DETAIL"
            }
            continue
        }

        Write-ModuleStart -ModuleName $module -ModulePath $modulePath
        Write-Log "[$moduleIndex/$($Phase.Modules.Count)] Exécution en cours..." "PROGRESS"

        try {
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $moduleResult = Invoke-AuditModule -Module $module
            $sw.Stop()
            
            $status = if ($moduleResult.Errors -gt 0) { 
                if ($moduleResult.Warnings -gt 0) { "WARNING" } else { "ERROR" }
            } elseif ($moduleResult.Warnings -gt 0) {
                "WARNING"
            } else {
                "SUCCESS"
            }
            
            $issues = $moduleResult.Errors + $moduleResult.Warnings
            
            $results[$module] = @{
                Status = $status
                Duration = $sw.Elapsed
                DurationMs = $sw.ElapsedMilliseconds
                Timestamp = Get-Date
                Issues = $issues
                Errors = $moduleResult.Errors
                Warnings = $moduleResult.Warnings
                Result = $moduleResult
            }
            
            Write-ModuleResult -ModuleName $module -Status $status -Duration $sw.Elapsed -Issues $issues
            
            if ($Verbose -and $issues -gt 0) {
                Write-Log "  Détail: $($moduleResult.Errors) erreurs, $($moduleResult.Warnings) avertissements" "DETAIL"
            }
            
        } catch {
            $sw.Stop()
            $results[$module] = @{
                Status = "ERROR"
                Duration = $sw.Elapsed
                DurationMs = $sw.ElapsedMilliseconds
                Timestamp = Get-Date
                Issues = 1
                Errors = 1
                Warnings = 0
                Error = $_.Exception.Message
            }
            
            Write-ModuleResult -ModuleName $module -Status "ERROR" -Duration $sw.Elapsed -Issues 1
            Write-Log "  Erreur: $($_.Exception.Message)" "ERROR"
        }
    }

    # Sauvegarde des résultats de la phase
    $phaseEndTime = Get-Date
    $totalDuration = $phaseEndTime - $phaseStartTime
    
    $phaseResult = @{
        Phase = $Phase
        Results = $results
        StartTime = $phaseStartTime
        EndTime = $phaseEndTime
        TotalDuration = $totalDuration
        TotalDurationMs = $totalDuration.TotalMilliseconds
        Timestamp = $phaseEndTime
        ModuleCount = $Phase.Modules.Count
        SuccessCount = ($results.Values | Where-Object { $_.Status -eq "SUCCESS" }).Count
        WarningCount = ($results.Values | Where-Object { $_.Status -eq "WARNING" }).Count
        ErrorCount = ($results.Values | Where-Object { $_.Status -eq "ERROR" }).Count
    }

    $resultFile = Join-Path $script:Config.OutputDir "phase_$($Phase.Id)_$($script:Config.Timestamp).json"
    $phaseResult | ConvertTo-Json -Depth 10 | Out-File -FilePath $resultFile -Encoding UTF8

    Write-PhaseSummary -PhaseId $Phase.Id -PhaseName $Phase.Name -TotalDuration $totalDuration -Results $results
    return $phaseResult
}

# Programme principal
function Main {
    try {
        Write-Host "================================================================" -ForegroundColor Cyan
        Write-Host "SYSTEME D'AUDIT v$($script:Config.Version)" -ForegroundColor Cyan
        Write-Host "================================================================" -ForegroundColor Cyan

        Initialize-AuditEnvironment

        # Résolution des phases à exécuter
        $requestedPhases = @()
        if ($Phases -eq "all") {
            $requestedPhases = $script:AuditPhases | ForEach-Object { $_.Id }
            Write-Log "Mode: Audit complet (toutes les phases)" "INFO"
        } else {
            $requestedPhases = $Phases -split ',' | ForEach-Object { 
                $num = [int]($_.Trim())
                if ($script:AuditPhases | Where-Object { $_.Id -eq $num }) {
                    $num
                } else {
                    Write-Log "Phase $num invalide, ignorée" "WARN"
                }
            }
            Write-Log "Mode: Phases sélectives - $($Phases)" "INFO"
        }

        if ($requestedPhases.Count -eq 0) {
            Write-Log "Aucune phase valide à exécuter" "ERROR"
            return
        }

        $executionPlan = Resolve-PhaseExecution -RequestedPhases $requestedPhases

        Write-Log "Plan d'exécution: $($executionPlan -join ', ')" "INFO"
        Write-Log "Nombre de phases: $($executionPlan.Count)" "INFO"
        
        if ($script:ProjectProfile) {
            Write-Log "Projet détecté: $($script:ProjectProfile.Id) (score: $($script:ProjectProfile.Score))" "SUCCESS"
        } else {
            Write-Log "Aucun projet spécifique détecté (mode générique)" "INFO"
        }

        Write-Log "Répertoire de sortie: $($script:Config.OutputDir)" "INFO"
        Write-Log "Timestamp: $($script:Config.Timestamp)" "DETAIL"

        # Exécution des phases
        $auditStartTime = Get-Date
        $allPhaseResults = @()
        $totalModules = 0
        $totalErrors = 0
        $totalWarnings = 0

        for ($i = 0; $i -lt $executionPlan.Count; $i++) {
            $phaseId = $executionPlan[$i]
            $phase = $script:AuditPhases | Where-Object { $_.Id -eq $phaseId }
            
            if (-not $phase) { continue }
            
            Write-Log "" "INFO"
            Write-Log "[$($i + 1)/$($executionPlan.Count)] Démarrage Phase $phaseId" "PROGRESS"
            
            try {
                $phaseResult = Execute-Phase -Phase $phase
                $allPhaseResults += $phaseResult
                
                $totalModules += $phaseResult.ModuleCount
                $totalErrors += $phaseResult.ErrorCount
                $totalWarnings += $phaseResult.WarningCount
                
                # Progression globale
                $progressPercent = [math]::Round((($i + 1) / $executionPlan.Count) * 100)
                Write-Log "Progression globale: $progressPercent% ($($i + 1)/$($executionPlan.Count) phases)" "DETAIL"
                
            } catch {
                Write-Log "Erreur critique durant Phase $phaseId : $($_.Exception.Message)" "ERROR"
                continue
            }
        }

        # Résumé final
        $auditEndTime = Get-Date
        $totalDuration = $auditEndTime - $auditStartTime
        
        Write-Log "" "INFO"
        Write-Host "================================================================" -ForegroundColor Green
        Write-Host "AUDIT TERMINE AVEC SUCCÈS" -ForegroundColor Green
        Write-Host "================================================================" -ForegroundColor Green
        
        Write-Log "Durée totale: $([math]::Round($totalDuration.TotalMinutes, 2)) minutes" "SUCCESS"
        Write-Log "Phases exécutées: $($allPhaseResults.Count)" "SUCCESS"
        Write-Log "Modules exécutés: $totalModules" "SUCCESS"
        
        if ($totalErrors -gt 0 -or $totalWarnings -gt 0) {
            Write-Log "Problèmes détectés: $totalErrors erreurs, $totalWarnings avertissements" "WARN"
        } else {
            Write-Log "Aucun problème détecté" "SUCCESS"
        }
        
        Write-Log "Rapport complet: $($script:Config.OutputDir)\audit_summary_$($script:Config.Timestamp).json" "INFO"

        # Génération du résumé global
        $summary = @{
            AuditVersion = $script:Config.Version
            StartTime = $auditStartTime
            EndTime = $auditEndTime
            TotalDuration = $totalDuration
            Target = $Target
            ProjectRoot = $script:Config.ProjectRoot
            ProjectProfile = if ($script:ProjectProfile) { $script:ProjectProfile.Id } else { $null }
            RequestedPhases = $requestedPhases
            ExecutedPhases = $executionPlan
            PhaseResults = $allPhaseResults
            TotalPhases = $allPhaseResults.Count
            TotalModules = $totalModules
            TotalErrors = $totalErrors
            TotalWarnings = $totalWarnings
            Timestamp = $script:Config.Timestamp
            OutputDir = $script:Config.OutputDir
        }

        $summaryFile = Join-Path $script:Config.OutputDir "audit_summary_$($script:Config.Timestamp).json"
        $summary | ConvertTo-Json -Depth 10 | Out-File -FilePath $summaryFile -Encoding UTF8

    } catch {
        Write-Log "Erreur fatale: $($_.Exception.Message)" "ERROR"
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
        exit 1
    }
}

# Lancement du programme principal
if ($PSBoundParameters.Count -eq 0) {
    Invoke-InteractiveMenu
} else {
    Main
}
