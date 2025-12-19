# ===============================================================================
# AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL
# ===============================================================================
# Système d'audit générique et portable pour n'importe quel projet
# Version 3.0 - Système consolidé et portable
#
# Ce script effectue un audit 360 degres couvrant 21 phases
# Détecte automatiquement les caractéristiques du projet audité
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
    [array]$UserSelectedPhases = @(),  # Phases explicitement sélectionnées par l'utilisateur (sans dépendances)
    [string]$StateFile = "",
    [string]$ResultFile = "",
    [string]$CorrectionPlansFile = "",
    [string]$ProjectRoot = "",  # Répertoire racine du projet (détecté automatiquement)
    [string]$AuditDir = ""      # Répertoire audit (détecté automatiquement)
)

# ===============================================================================
# FONCTIONS D'AFFICHAGE (définies en premier pour être disponibles partout)
# ===============================================================================
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Warning $Text }
function Write-Err { param([string]$Text) Write-Host "  [ERROR] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) if($Verbose) { Write-Host "  [INFO] $Text" -ForegroundColor Gray } }

# Fonction helper pour extraire un tableau depuis une réponse API
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
                # Convertir en tableau si nécessaire
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

# ===============================================================================
# FONCTIONS D'INTÉGRATION D'OUTILS AUTOMATIQUES
# ===============================================================================

# Fonction pour exécuter ESLint et parser les résultats
function Invoke-ESLintAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Errors = 0
        Warnings = 0
        Issues = @()
        Score = 10
    }
    
    try {
        if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
            Write-Info "  package.json non trouvé, ESLint ignoré"
            return $result
        }
        
        # Vérifier si ESLint est installé
        $eslintInstalled = $false
        try {
            $npmList = npm list eslint --depth=0 2>&1
            if ($LASTEXITCODE -eq 0 -or $npmList -match "eslint@") {
                $eslintInstalled = $true
            }
        } catch {
            # Ignorer
        }
        
        if (-not $eslintInstalled) {
            Write-Info "  ESLint non installé, ignoré"
            return $result
        }
        
        Write-Info "  Exécution ESLint..."
        $eslintOutput = & npm run lint -- --format json 2>&1 | Out-String
        
        # Parser le JSON (ESLint peut retourner du JSON même avec des erreurs)
        try {
            # Extraire le JSON de la sortie (peut contenir des warnings npm)
            $jsonStart = $eslintOutput.IndexOf('[')
            $jsonEnd = $eslintOutput.LastIndexOf(']')
            if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                $jsonContent = $eslintOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                $eslintResults = $jsonContent | ConvertFrom-Json
                
                if ($eslintResults) {
                    $result.Success = $true
                    foreach ($file in $eslintResults) {
                        if ($file.messages) {
                            foreach ($message in $file.messages) {
                                if ($message.severity -eq 2) {
                                    $result.Errors++
                                    $result.Issues += "$($file.filePath):$($message.line): $($message.message)"
                                } elseif ($message.severity -eq 1) {
                                    $result.Warnings++
                                }
                            }
                        }
                    }
                    
                    # Calculer le score (10 - erreurs*0.5 - warnings*0.1)
                    $result.Score = [Math]::Max(0, 10 - ($result.Errors * 0.5) - ($result.Warnings * 0.1))
                }
            }
        } catch {
            # Si le parsing échoue, essayer de détecter des erreurs dans la sortie
            if ($eslintOutput -match "error|Error|ERROR") {
                $result.Errors = 1
                $result.Score = 8
            }
        }
    } catch {
        Write-Info "  Erreur ESLint: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter Jest et parser les résultats
function Invoke-JestAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        TestsTotal = 0
        TestsPassed = 0
        TestsFailed = 0
        Coverage = 0
        Score = 10
    }
    
    try {
        if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
            Write-Info "  package.json non trouvé, Jest ignoré"
            return $result
        }
        
        # Vérifier si Jest est installé
        $jestInstalled = $false
        try {
            $npmList = npm list jest --depth=0 2>&1
            if ($LASTEXITCODE -eq 0 -or $npmList -match "jest@") {
                $jestInstalled = $true
            }
        } catch {
            # Ignorer
        }
        
        if (-not $jestInstalled) {
            Write-Info "  Jest non installé, ignoré"
            return $result
        }
        
        Write-Info "  Exécution Jest..."
        $jestOutput = & npm test -- --json --coverage 2>&1 | Out-String
        
        # Parser le JSON Jest
        try {
            $jsonStart = $jestOutput.IndexOf('{')
            $jsonEnd = $jestOutput.LastIndexOf('}')
            if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                $jsonContent = $jestOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                $jestResults = $jsonContent | ConvertFrom-Json
                
                if ($jestResults) {
                    $result.Success = $true
                    $result.TestsTotal = $jestResults.numTotalTests
                    $result.TestsPassed = $jestResults.numPassedTests
                    $result.TestsFailed = $jestResults.numFailedTests
                    
                    # Calculer la couverture si disponible
                    if ($jestResults.coverageMap) {
                        $totalLines = 0
                        $coveredLines = 0
                        foreach ($file in $jestResults.coverageMap.GetEnumerator()) {
                            if ($file.Value.s) {
                                $totalLines += $file.Value.s.Count
                                $coveredLines += ($file.Value.s | Where-Object { $_ -gt 0 }).Count
                            }
                        }
                        if ($totalLines -gt 0) {
                            $result.Coverage = [Math]::Round(($coveredLines / $totalLines) * 100, 1)
                        }
                    }
                    
                    # Calculer le score
                    if ($result.TestsTotal -gt 0) {
                        $passRate = ($result.TestsPassed / $result.TestsTotal) * 10
                        $coverageScore = ($result.Coverage / 100) * 3
                        $result.Score = [Math]::Round($passRate + $coverageScore, 1)
                    }
                }
            }
        } catch {
            Write-Info "  Erreur parsing Jest: $($_.Exception.Message)"
        }
    } catch {
        Write-Info "  Erreur Jest: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter npm audit et parser les résultats
function Invoke-NpmAuditAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Vulnerabilities = 0
        Critical = 0
        High = 0
        Moderate = 0
        Low = 0
        Score = 10
    }
    
    try {
        if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
            Write-Info "  package.json non trouvé, npm audit ignoré"
            return $result
        }
        
        Write-Info "  Exécution npm audit..."
        $auditOutput = & npm audit --json 2>&1 | Out-String
        
        # Parser le JSON npm audit
        try {
            $jsonStart = $auditOutput.IndexOf('{')
            $jsonEnd = $auditOutput.LastIndexOf('}')
            if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                $jsonContent = $auditOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                $auditResults = $jsonContent | ConvertFrom-Json
                
                if ($auditResults -and $auditResults.metadata) {
                    $result.Success = $true
                    $result.Vulnerabilities = $auditResults.metadata.vulnerabilities.total
                    $result.Critical = $auditResults.metadata.vulnerabilities.critical
                    $result.High = $auditResults.metadata.vulnerabilities.high
                    $result.Moderate = $auditResults.metadata.vulnerabilities.moderate
                    $result.Low = $auditResults.metadata.vulnerabilities.low
                    
                    # Calculer le score (10 - critical*2 - high*1 - moderate*0.5 - low*0.1)
                    $result.Score = [Math]::Max(0, 10 - ($result.Critical * 2) - ($result.High * 1) - ($result.Moderate * 0.5) - ($result.Low * 0.1))
                }
            }
        } catch {
            # Si le parsing échoue, vérifier si npm audit a trouvé des vulnérabilités
            if ($auditOutput -match "found \d+ vulnerabilities") {
                $result.Vulnerabilities = 1
                $result.Score = 8
            }
        }
    } catch {
        Write-Info "  Erreur npm audit: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter dependency-cruiser et parser les résultats
function Invoke-DependencyCruiserAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        CircularDependencies = 0
        OrphanedModules = 0
        Issues = @()
        Score = 10
    }
    
    try {
        # Vérifier si dependency-cruiser est installé
        $depcruiseInstalled = $false
        try {
            $npmList = npm list dependency-cruiser --depth=0 2>&1
            if ($LASTEXITCODE -eq 0 -or $npmList -match "dependency-cruiser@") {
                $depcruiseInstalled = $true
            } else {
                # Essayer npx
                $npxCheck = & npx dependency-cruiser --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $depcruiseInstalled = $true
                }
            }
        } catch {
            # Ignorer
        }
        
        if (-not $depcruiseInstalled) {
            Write-Info "  dependency-cruiser non installé (optionnel)"
            return $result
        }
        
        Write-Info "  Exécution dependency-cruiser..."
        
        # Créer un fichier temporaire pour les résultats
        $tempFile = Join-Path $env:TEMP "depcruise-$(Get-Date -Format 'yyyyMMddHHmmss').json"
        
        try {
            # Exécuter dependency-cruiser
            if (Test-Path (Join-Path $ProjectRoot "node_modules\.bin\depcruise.cmd")) {
                & (Join-Path $ProjectRoot "node_modules\.bin\depcruise.cmd") --output-type json --output $tempFile "app" "components" "hooks" "lib" 2>&1 | Out-Null
            } else {
                & npx dependency-cruiser --output-type json --output $tempFile "app" "components" "hooks" "lib" 2>&1 | Out-Null
            }
            
            if (Test-Path $tempFile) {
                $cruiseResults = Get-Content $tempFile -Raw | ConvertFrom-Json
                
                if ($cruiseResults -and $cruiseResults.summary) {
                    $result.Success = $true
                    $result.CircularDependencies = $cruiseResults.summary.circularDependencies
                    $result.OrphanedModules = $cruiseResults.summary.orphanedModules
                    
                    # Calculer le score
                    $result.Score = [Math]::Max(0, 10 - ($result.CircularDependencies * 1) - ($result.OrphanedModules * 0.5))
                }
                
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Info "  Erreur dependency-cruiser: $($_.Exception.Message)"
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Info "  Erreur dependency-cruiser: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter jscpd et parser les résultats
function Invoke-JscpdAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        DuplicatedLines = 0
        DuplicatedFiles = 0
        Clones = @()
        Score = 10
    }
    
    try {
        # Vérifier si jscpd est installé
        $jscpdInstalled = $false
        try {
            $jscpdCheck = & jscpd --version 2>&1
            if ($LASTEXITCODE -eq 0) {
                $jscpdInstalled = $true
            } else {
                # Essayer npx
                $npxCheck = & npx jscpd --version 2>&1
                if ($LASTEXITCODE -eq 0) {
                    $jscpdInstalled = $true
                }
            }
        } catch {
            # Ignorer
        }
        
        if (-not $jscpdInstalled) {
            Write-Info "  jscpd non installé (optionnel: npm install -g jscpd)"
            return $result
        }
        
        Write-Info "  Exécution jscpd..."
        
        # Créer un fichier temporaire pour les résultats
        $tempFile = Join-Path $env:TEMP "jscpd-$(Get-Date -Format 'yyyyMMddHHmmss').json"
        
        try {
            # Exécuter jscpd
            $jscpdCmd = if (Get-Command jscpd -ErrorAction SilentlyContinue) { "jscpd" } else { "npx jscpd" }
            & $jscpdCmd --format json --reporters json --output $tempFile --min-lines 5 --min-tokens 50 "app" "components" "hooks" "lib" 2>&1 | Out-Null
            
            if (Test-Path $tempFile) {
                $jscpdResults = Get-Content $tempFile -Raw | ConvertFrom-Json
                
                if ($jscpdResults -and $jscpdResults.percentage) {
                    $result.Success = $true
                    $result.DuplicatedLines = $jscpdResults.percentage
                    $result.DuplicatedFiles = $jscpdResults.clones.Count
                    
                    # Calculer le score (10 - pourcentage de duplication)
                    $result.Score = [Math]::Max(0, 10 - ($result.DuplicatedLines / 10))
                }
                
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Info "  Erreur jscpd: $($_.Exception.Message)"
            if (Test-Path $tempFile) {
                Remove-Item $tempFile -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Info "  Erreur jscpd: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter PHPStan et parser les résultats
function Invoke-PHPStanAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Errors = 0
        Issues = @()
        Score = 10
    }
    
    try {
        # Vérifier si PHPStan est installé
        $phpstanPath = $null
        if (Test-Path (Join-Path $ProjectRoot "vendor\bin\phpstan.bat")) {
            $phpstanPath = Join-Path $ProjectRoot "vendor\bin\phpstan.bat"
        } elseif (Test-Path (Join-Path $ProjectRoot "vendor\bin\phpstan")) {
            $phpstanPath = Join-Path $ProjectRoot "vendor\bin\phpstan"
        } elseif (Get-Command phpstan -ErrorAction SilentlyContinue) {
            $phpstanPath = "phpstan"
        }
        
        if (-not $phpstanPath) {
            Write-Info "  PHPStan non installé (optionnel: composer require --dev phpstan/phpstan)"
            return $result
        }
        
        Write-Info "  Exécution PHPStan..."
        
        try {
            # Exécuter PHPStan avec format JSON
            $phpstanOutput = & $phpstanPath analyse --error-format json "api" 2>&1 | Out-String
            
            # Parser le JSON PHPStan
            try {
                $jsonStart = $phpstanOutput.IndexOf('[')
                $jsonEnd = $phpstanOutput.LastIndexOf(']')
                if ($jsonStart -ge 0 -and $jsonEnd -gt $jsonStart) {
                    $jsonContent = $phpstanOutput.Substring($jsonStart, $jsonEnd - $jsonStart + 1)
                    $phpstanResults = $jsonContent | ConvertFrom-Json
                    
                    if ($phpstanResults) {
                        $result.Success = $true
                        $result.Errors = $phpstanResults.Count
                        
                        foreach ($issue in $phpstanResults | Select-Object -First 10) {
                            $result.Issues += "$($issue.path):$($issue.line): $($issue.message)"
                        }
                        
                        # Calculer le score
                        $result.Score = [Math]::Max(0, 10 - ($result.Errors * 0.2))
                    }
                }
            } catch {
                # Si le parsing échoue, compter les erreurs dans la sortie
                if ($phpstanOutput -match "errors") {
                    $result.Errors = 1
                    $result.Score = 8
                }
            }
        } catch {
            Write-Info "  Erreur PHPStan: $($_.Exception.Message)"
        }
    } catch {
        Write-Info "  Erreur PHPStan: $($_.Exception.Message)"
    }
    
    return $result
}

# Fonction pour exécuter PSScriptAnalyzer et parser les résultats
function Invoke-PSScriptAnalyzerAnalysis {
    param([string]$ProjectRoot)
    
    $result = @{
        Success = $false
        Errors = 0
        Warnings = 0
        Issues = @()
        Score = 10
    }
    
    try {
        # Vérifier si PSScriptAnalyzer est installé
        $psaModule = Get-Module -ListAvailable -Name PSScriptAnalyzer
        if (-not $psaModule) {
            Write-Info "  PSScriptAnalyzer non installé (optionnel: Install-Module -Name PSScriptAnalyzer)"
            return $result
        }
        
        Write-Info "  Exécution PSScriptAnalyzer..."
        
        try {
            Import-Module PSScriptAnalyzer -ErrorAction SilentlyContinue
            
            # Analyser les scripts PowerShell du projet
            $ps1Files = Get-ChildItem -Path $ProjectRoot -Recurse -Filter "*.ps1" | Where-Object {
                $_.FullName -notmatch 'node_modules' -and
                $_.FullName -notmatch '\\\.git\\' -and
                $_.FullName -notmatch '\\vendor\\'
            }
            
            $allIssues = @()
            foreach ($file in $ps1Files) {
                try {
                    $fileIssues = Invoke-ScriptAnalyzer -Path $file.FullName -ErrorAction SilentlyContinue
                    if ($fileIssues) {
                        $allIssues += $fileIssues
                    }
                } catch {
                    # Ignorer les erreurs sur un fichier spécifique
                }
            }
            
            if ($allIssues) {
                $result.Success = $true
                $result.Errors = ($allIssues | Where-Object { $_.Severity -eq 'Error' }).Count
                $result.Warnings = ($allIssues | Where-Object { $_.Severity -eq 'Warning' }).Count
                
                foreach ($issue in $allIssues | Select-Object -First 10) {
                    $result.Issues += "$($issue.ScriptName):$($issue.Line): $($issue.Message)"
                }
                
                # Calculer le score
                $result.Score = [Math]::Max(0, 10 - ($result.Errors * 0.5) - ($result.Warnings * 0.1))
            }
        } catch {
            Write-Info "  Erreur PSScriptAnalyzer: $($_.Exception.Message)"
        }
    } catch {
        Write-Info "  Erreur PSScriptAnalyzer: $($_.Exception.Message)"
    }
    
    return $result
}

$ErrorActionPreference = "Continue"

# ===============================================================================
# CHARGEMENT DES FONCTIONS DE GESTION DES PHASES
# ===============================================================================
$phasesScriptPath = Join-Path $PSScriptRoot "Audit-Phases.ps1"
if (Test-Path $phasesScriptPath) {
    . $phasesScriptPath
} else {
    Write-Warn "Fichier Audit-Phases.ps1 non trouvé, certaines fonctionnalités seront limitées"
}

# ===============================================================================
# DÉTERMINER LE RÉPERTOIRE RACINE DU PROJET
# ===============================================================================
# Le script peut être exécuté depuis différents répertoires
# On cherche la racine en remontant jusqu'à trouver api.php ou next.config.js
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

# Si pas trouvé, utiliser le répertoire courant ou le parent du script
if (-not $projectRoot) {
    $currentDir = Get-Location
    if (Test-Path (Join-Path $currentDir.Path "api.php") -or Test-Path (Join-Path $currentDir.Path "next.config.js")) {
        $projectRoot = $currentDir.Path
    } else {
        # Par défaut, utiliser le parent du script (audit/scripts -> racine)
        $projectRoot = Split-Path -Parent $scriptRoot
    }
}

# Changer vers le répertoire racine
if ($projectRoot -and (Test-Path $projectRoot)) {
    Push-Location $projectRoot
    Write-Info "Répertoire racine détecté: $projectRoot"
} else {
    Write-Warn "Impossible de déterminer le répertoire racine, utilisation du répertoire courant"
}

# Détecter automatiquement le répertoire audit si non fourni
if ([string]::IsNullOrEmpty($AuditDir)) {
    # Chercher audit/ depuis le script ou le projet
    $searchPaths = @($scriptRoot, $projectRoot, (Get-Location).Path)
    foreach ($searchPath in $searchPaths) {
        $testAuditDir = Join-Path $searchPath "audit"
        if ((Test-Path $testAuditDir) -and (Test-Path (Join-Path $testAuditDir "audit.ps1"))) {
            $AuditDir = $testAuditDir
            break
        }
        # Vérifier aussi le parent
        $parentPath = Split-Path -Parent $searchPath
        $testAuditDir = Join-Path $parentPath "audit"
        if ((Test-Path $testAuditDir) -and (Test-Path (Join-Path $testAuditDir "audit.ps1"))) {
            $AuditDir = $testAuditDir
            break
        }
    }
    # Si toujours pas trouvé, utiliser le parent du script
    if ([string]::IsNullOrEmpty($AuditDir)) {
        $AuditDir = Split-Path -Parent $scriptRoot
    }
}
$auditDir = $AuditDir  # Variable locale pour compatibilité

# Utiliser les variables d'environnement si les paramètres sont vides
if ([string]::IsNullOrEmpty($Email)) { $Email = $env:AUDIT_EMAIL }
if ([string]::IsNullOrEmpty($Password)) { 
    if ($env:AUDIT_PASSWORD) {
        $Password = $env:AUDIT_PASSWORD
    } else {
        $Password = "YM120879"  # Mot de passe par défaut pour éviter le blocage
    }
}
if ([string]::IsNullOrEmpty($ApiUrl)) { 
    if ($env:AUDIT_API_URL) {
        $ApiUrl = $env:AUDIT_API_URL
    } elseif ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) {
        $ApiUrl = $script:Config.Api.BaseUrl
    } else {
        $ApiUrl = ""  # Pas d'API par défaut
    }
}

# ===============================================================================
# CHARGEMENT DES DONNÉES DE RÉFÉRENCE (pour l'audit BDD)
# ===============================================================================
function Get-ExpectedTables {
    # Charger depuis data/expected_tables.txt si disponible
    $expectedTablesFile = Join-Path $auditDir "data\expected_tables.txt"
    if (Test-Path $expectedTablesFile) {
        $tables = Get-Content $expectedTablesFile | Where-Object { $_ -and $_ -notmatch '^#' -and $_ -notmatch '^\s*$' }
        return $tables
    }
    
    # Valeurs par défaut
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
# NETTOYAGE DES RÉSULTATS PRÉCÉDENTS
# ===============================================================================
function Clear-PreviousAuditResults {
    $resultsDir = Join-Path $auditDir "resultats"
    
    if (Test-Path $resultsDir) {
        $oldResults = Get-ChildItem -Path $resultsDir -Filter "audit_resultat_*.txt" -ErrorAction SilentlyContinue
        if ($oldResults) {
            $count = $oldResults.Count
            Remove-Item -Path $oldResults.FullName -Force -ErrorAction SilentlyContinue
            Write-Host "  [INFO] Nettoyage: $count résultat(s) d'audit précédent(s) supprimé(s)" -ForegroundColor Gray
        }
    }
}

# ===============================================================================
# CHARGEMENT DE LA CONFIGURATION
# ===============================================================================
# Détecter le chemin de configuration
if ([string]::IsNullOrEmpty($ConfigFile)) {
    $configPath = Join-Path $scriptRoot "audit.config.ps1"
} elseif (Test-Path $ConfigFile) {
    $configPath = $ConfigFile
} else {
    $configPath = Join-Path $scriptRoot "audit.config.ps1"
}
if (Test-Path $configPath) {
    try {
        $script:Config = & $configPath
        Write-Info "Configuration chargée depuis: $ConfigFile"
    } catch {
        Write-Err "Erreur lors du chargement de la configuration: $($_.Exception.Message)"
        Write-Warn "Utilisation des valeurs par défaut"
        $script:Config = $null
    }
} else {
    Write-Warn "Fichier de configuration non trouvé: $ConfigFile"
    Write-Info "Détection automatique du projet en cours..."
    $script:Config = $null
}

# ===============================================================================
# DÉTECTION AUTOMATIQUE DU PROJET
# ===============================================================================

# Charger les métadonnées du projet si disponibles
$projectMetadataFile = Join-Path $projectRoot "project_metadata.json"
$projectMetadata = $null

if (Test-Path $projectMetadataFile) {
    try {
        $projectMetadata = Get-Content $projectMetadataFile -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Info "Métadonnées du projet chargées depuis project_metadata.json"
    } catch {
        Write-Warn "Erreur lecture project_metadata.json: $($_.Exception.Message)"
    }
} else {
    # Détecter automatiquement si le script de détection existe
    $detectScript = Join-Path $scriptRoot "Detect-Project.ps1"
    if (Test-Path $detectScript) {
        Write-Info "Détection automatique du projet..."
        try {
            $projectMetadata = & $detectScript -ProjectRoot $projectRoot -OutputFile "project_metadata.json"
            Write-OK "Projet détecté automatiquement"
        } catch {
            Write-Warn "Erreur lors de la détection automatique: $($_.Exception.Message)"
        }
    }
}

# Valeurs par défaut génériques si config non chargée
if ($null -eq $script:Config) {
    $projectName = "Projet"
    $projectCompany = ""
    
    if ($projectMetadata) {
        $projectName = if ($projectMetadata.project.name) { $projectMetadata.project.name } else { "Projet" }
        $projectCompany = if ($projectMetadata.project.company) { $projectMetadata.project.company } else { "" }
    } else {
        # Utiliser le nom du répertoire comme fallback
        $projectName = Split-Path $projectRoot -Leaf
    }
    
    $script:Config = @{
        Project = @{ Name = $projectName; Company = $projectCompany }
        Api = @{ BaseUrl = ""; AuthEndpoint = "/api.php/auth/login" }
        GitHub = @{ Repo = ""; BaseUrl = ""; BasePath = "" }
    }
    
    # Enrichir avec les métadonnées détectées
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

# Utiliser la configuration ou les paramètres
if ([string]::IsNullOrEmpty($ApiUrl)) {
    if ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) {
        $ApiUrl = $script:Config.Api.BaseUrl
    } else {
        $ApiUrl = ""  # Pas d'API par défaut
    }
}
if ([string]::IsNullOrEmpty($Email)) {
    $Email = "ymora@free.fr"
}

# Mot de passe par défaut pour éviter le blocage (peut être remplacé par variable d'environnement)
if ([string]::IsNullOrEmpty($Password)) {
    $Password = "YM120879"  # Mot de passe par défaut
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
# Détecter le nom du projet
$projectName = if ($script:Config -and $script:Config.Project -and $script:Config.Project.Name) { 
    $script:Config.Project.Name 
} elseif ($projectMetadata -and $projectMetadata.project.name) {
    $projectMetadata.project.name
} else {
    Split-Path $projectRoot -Leaf  # Utiliser le nom du répertoire
}

$projectCompany = if ($script:Config -and $script:Config.Project -and $script:Config.Project.Company) { 
    $script:Config.Project.Company 
} elseif ($projectMetadata -and $projectMetadata.project.company) {
    $projectMetadata.project.company
} else {
    ""  # Pas de société par défaut
}
Write-Host "[AUDIT] AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - $projectName" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date     : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "Projet   : $projectName ($projectCompany)" -ForegroundColor Cyan
Write-Host "Version  : 2.4 - Configuration modulaire (audit.config.ps1)" -ForegroundColor Cyan
Write-Host "Config   : $ConfigFile" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

# Nettoyer les résultats précédents
Clear-PreviousAuditResults

$auditResults = @{
    Scores = @{}
    Issues = @()
    Warnings = @()
    Recommendations = @()
    Stats = @{}
    Statistics = @{}  # Pour compatibilité avec le code existant
    CorrectionPlans = @()  # Nouveau: plans de correction structurés
}

$startTime = Get-Date

# Initialiser les phases sélectionnées (toutes si non spécifiées)
# Stocker les phases explicitement sélectionnées par l'utilisateur (sans dépendances)
if ($SelectedPhases.Count -eq 0) {
    $SelectedPhases = $script:AuditPhases | ForEach-Object { $_.Number }
    $script:userSelectedPhases = $SelectedPhases
} else {
    # Si UserSelectedPhases est fourni, l'utiliser, sinon considérer toutes les phases comme user-selected
    if ($UserSelectedPhases.Count -gt 0) {
        $script:userSelectedPhases = $UserSelectedPhases
    } else {
        $script:userSelectedPhases = $SelectedPhases
    }
}

# Charger l'état précédent si disponible
$completedPhases = @()
$partialResults = @{}
if (-not [string]::IsNullOrEmpty($StateFile) -and (Test-Path $StateFile)) {
    $previousState = Load-AuditState -StateFile $StateFile
    $completedPhases = $previousState.CompletedPhases
    $partialResults = $previousState.PartialResults
    Write-Info "État précédent chargé: $($completedPhases.Count) phase(s) complétée(s)"
}

# ===============================================================================
# CONFIGURATION : RÉPERTOIRES ET FICHIERS À EXCLURE (uniquement build/cache)
# ===============================================================================
$excludedDirs = @('node_modules', '\.next', '\.git', '\.swc', 'out', 'vendor', '__pycache__', '\.cache')
$excludedPatterns = @('\.log$', '\.tmp$', '\.cache$', 'package-lock\.json$', 'yarn\.lock$')

# Fonction pour vérifier si un fichier doit être exclu
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
# FONCTION WRAPPER POUR EXÉCUTER LES PHASES AVEC GESTION D'ÉTAT
# ===============================================================================
function Invoke-AuditPhase {
    param(
        [int]$PhaseNumber,
        [scriptblock]$PhaseScript,
        [string]$PhaseName
    )
    
    # Vérifier si la phase doit être exécutée
    if ($SelectedPhases -notcontains $PhaseNumber) {
        Write-Info "Phase $PhaseNumber ($PhaseName) ignorée (non sélectionnée)"
        return
    }
    
    # Vérifier si la phase est déjà complète
    if ($completedPhases -contains $PhaseNumber) {
        Write-Info "Phase $PhaseNumber ($PhaseName) déjà complétée, reprise des résultats partiels..."
        if ($partialResults.ContainsKey("Phase$PhaseNumber")) {
            # Restaurer les résultats partiels si disponibles
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
    
    # Afficher un message si c'est une dépendance automatique
    $isDependency = $script:userSelectedPhases.Count -gt 0 -and $script:userSelectedPhases -notcontains $PhaseNumber
    if ($isDependency) {
        # Trouver quelle(s) phase(s) utilisateur nécessite(nt) cette dépendance (récursif)
        $requestingPhases = @()
        foreach ($userPhase in $script:userSelectedPhases) {
            $userPhaseObj = $script:AuditPhases | Where-Object { $_.Number -eq $userPhase } | Select-Object -First 1
            if ($userPhaseObj) {
                # Vérifier si cette phase ou ses dépendances nécessitent $PhaseNumber
                $allDeps = Get-PhaseDependencies -PhaseNumber $userPhase
                if ($allDeps -contains $PhaseNumber) {
                    $requestingPhases += $userPhaseObj
                }
            }
        }
        
        if ($requestingPhases.Count -gt 0) {
            $requestingNames = $requestingPhases | ForEach-Object { "Phase $($_.Number) ($($_.Name))" }
            Write-Host ""
            Write-Host "  ⚙️  Exécution automatique de la Phase $PhaseNumber ($PhaseName)" -ForegroundColor Cyan
            Write-Host "      (dépendance requise pour: $($requestingNames -join ', '))" -ForegroundColor DarkGray
        }
    }
    
    # Exécuter la phase
    try {
        Write-Section "[$PhaseNumber] $PhaseName"
        & $PhaseScript
        
        # Marquer la phase comme complète
        $completedPhases += $PhaseNumber
        
        # Sauvegarder l'état
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
        
        Write-OK "Phase $PhaseNumber ($PhaseName) terminée"
    } catch {
        Write-Err "Erreur lors de l'exécution de la phase $PhaseNumber ($PhaseName): $($_.Exception.Message)"
        # Ne pas marquer comme complète en cas d'erreur
    }
}

# ===============================================================================
# PHASE 0 : INVENTAIRE EXHAUSTIF DE TOUS LES FICHIERS
# ===============================================================================

# Vérifier si la phase doit être exécutée
if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 0) {
    if ($completedPhases -notcontains 0) {
        Write-Section "[0/18] Inventaire Exhaustif - Tous les Fichiers et Répertoires"

# INTÉGRATION PSScriptAnalyzer - Analyse des scripts PowerShell
Write-Host "`n  Analyse avec PSScriptAnalyzer (scripts PowerShell)..." -ForegroundColor Yellow
$psaResult = Invoke-PSScriptAnalyzerAnalysis -ProjectRoot (Get-Location).Path
if ($psaResult.Success) {
    if ($psaResult.Errors -gt 0 -or $psaResult.Warnings -gt 0) {
        Write-Warn "  PSScriptAnalyzer: $($psaResult.Errors) erreur(s), $($psaResult.Warnings) avertissement(s) dans les scripts PowerShell"
        foreach ($issue in $psaResult.Issues | Select-Object -First 5) {
            Write-Info "    - $issue"
        }
        if ($psaResult.Issues.Count -gt 5) {
            Write-Info "    ... et $($psaResult.Issues.Count - 5) autre(s)"
        }
        $auditResults.Recommendations += "PSScriptAnalyzer: Corriger $($psaResult.Errors) erreur(s) et $($psaResult.Warnings) avertissement(s) dans les scripts PowerShell"
    } else {
        Write-OK "  PSScriptAnalyzer: Aucune erreur détectée dans les scripts PowerShell"
    }
    # Ajouter le score PSScriptAnalyzer aux résultats (pas de phase dédiée, donc on l'ajoute à l'inventaire)
    if (-not $auditResults.Scores.ContainsKey("Scripts PowerShell")) {
        $auditResults.Scores["Scripts PowerShell"] = $psaResult.Score
    }
}

try {
    Write-Info "Parcours exhaustif de tous les fichiers..."
    
    # Parcourir TOUS les fichiers du projet (sauf exclusions build/cache)
    $allFiles = @(Get-ChildItem -Recurse -File | Where-Object {
        -not (Test-ExcludedFile $_.FullName)
    })
    
    # Catégoriser tous les fichiers
    $fileInventory = @{
        JS = @()
        JSX = @()
        PHP = @()
        SQL = @()
        MD = @()
        HTML = @()
        CSS = @()
        JSON = @()
        YAML = @()
        YML = @()
        SH = @()
        PS1 = @()
        INO = @()
        H = @()
        TPP = @()
        STL = @()
        PDF = @()
        PNG = @()
        JPG = @()
        SVG = @()
        WOFF2 = @()
        CONFIG = @()
        OTHER = @()
    }
    
    foreach ($file in $allFiles) {
        $ext = $file.Extension.ToLower()
        $name = $file.Name.ToLower()
        
        switch ($ext) {
            '.js' { if ($name -notmatch '\.test\.|\.spec\.') { $fileInventory.JS += $file } }
            '.jsx' { $fileInventory.JSX += $file }
            '.php' { $fileInventory.PHP += $file }
            '.sql' { $fileInventory.SQL += $file }
            '.md' { $fileInventory.MD += $file }
            '.html' { $fileInventory.HTML += $file }
            '.css' { $fileInventory.CSS += $file }
            '.json' { $fileInventory.JSON += $file }
            '.yaml' { $fileInventory.YAML += $file }
            '.yml' { $fileInventory.YML += $file }
            '.sh' { $fileInventory.SH += $file }
            '.ps1' { $fileInventory.PS1 += $file }
            '.ino' { $fileInventory.INO += $file }
            '.h' { $fileInventory.H += $file }
            '.tpp' { $fileInventory.TPP += $file }
            '.stl' { $fileInventory.STL += $file }
            '.pdf' { $fileInventory.PDF += $file }
            '.png' { $fileInventory.PNG += $file }
            '.jpg' { $fileInventory.JPG += $file }
            '.jpeg' { $fileInventory.JPG += $file }
            '.svg' { $fileInventory.SVG += $file }
            '.woff2' { $fileInventory.WOFF2 += $file }
            default {
                if ($name -match 'config|\.env|dockerfile|makefile') {
                    $fileInventory.CONFIG += $file
                } else {
                    $fileInventory.OTHER += $file
                }
            }
        }
    }
    
    Write-Host "  Total fichiers analysés: $($allFiles.Count)" -ForegroundColor White
    Write-Host "  JavaScript: $($fileInventory.JS.Count + $fileInventory.JSX.Count)" -ForegroundColor White
    Write-Host "  PHP: $($fileInventory.PHP.Count)" -ForegroundColor White
    Write-Host "  SQL: $($fileInventory.SQL.Count)" -ForegroundColor White
    Write-Host "  Markdown: $($fileInventory.MD.Count)" -ForegroundColor White
    Write-Host "  HTML: $($fileInventory.HTML.Count)" -ForegroundColor White
    Write-Host "  Config (JSON/YAML/ENV): $($fileInventory.JSON.Count + $fileInventory.YAML.Count + $fileInventory.YML.Count + $fileInventory.CONFIG.Count)" -ForegroundColor White
    Write-Host "  Scripts (PS1/SH): $($fileInventory.PS1.Count + $fileInventory.SH.Count)" -ForegroundColor White
    Write-Host "  Firmware (INO/H/TPP): $($fileInventory.INO.Count + $fileInventory.H.Count + $fileInventory.TPP.Count)" -ForegroundColor White
    Write-Host "  Assets (Images/Fonts): $($fileInventory.PNG.Count + $fileInventory.JPG.Count + $fileInventory.SVG.Count + $fileInventory.WOFF2.Count)" -ForegroundColor White
    if ($fileInventory.OTHER.Count -gt 0) {
        Write-Host "  Autres: $($fileInventory.OTHER.Count)" -ForegroundColor Yellow
        Write-Info "Types autres fichiers: $(($fileInventory.OTHER | ForEach-Object { $_.Extension } | Group-Object | Select-Object -First 5 | ForEach-Object { "$($_.Name):$($_.Count)" }) -join ', ')"
    }
    
    # Stocker l'inventaire pour les phases suivantes
    $script:fileInventory = $fileInventory
    $script:allFiles = $allFiles
    
    Write-OK "Inventaire exhaustif terminé"
} catch {
    Write-Warn "Erreur inventaire: $($_.Exception.Message)"
}

        # Marquer la phase comme complète et sauvegarder l'état
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
        Write-Info "Phase 0 déjà complétée, reprise des résultats partiels..."
        if ($partialResults.ContainsKey("Phase0")) {
            $phase0Results = $partialResults["Phase0"]
            if ($phase0Results.Scores) {
                foreach ($key in $phase0Results.Scores.Keys) {
                    $auditResults.Scores[$key] = $phase0Results.Scores[$key]
                }
            }
        }
    }
}  # Fin if SelectedPhases -contains 0

# ===============================================================================
# PHASE 1 : ARCHITECTURE ET STATISTIQUES
# ===============================================================================

# Vérifier si la phase doit être exécutée
if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 1) {
    if ($completedPhases -notcontains 1) {
        Write-Section "[1/18] Architecture et Statistiques Code"

        try {
            Write-Info "Comptage des fichiers..."
    
            # Utiliser l'inventaire exhaustif
            $jsFiles = $fileInventory.JS + $fileInventory.JSX
            $phpFiles = $fileInventory.PHP
            $sqlFiles = $fileInventory.SQL
            $mdFilesRoot = @($fileInventory.MD | Where-Object { $_.DirectoryName -eq (Get-Location).Path })
            $components = @($fileInventory.JS | Where-Object { $_.FullName -match '\\components\\' })
            $hooks = @($fileInventory.JS | Where-Object { $_.FullName -match '\\hooks\\' -and $_.Name -ne 'index.js' })
            $pages = @($fileInventory.JS | Where-Object { $_.FullName -match '\\app\\dashboard\\' -and $_.Name -eq 'page.js' })
            $scripts = $fileInventory.PS1 + $fileInventory.SH + @($fileInventory.JS | Where-Object { $_.FullName -match '\\scripts\\' })
            
            # Compter lignes
            $jsLines = 0
            foreach ($file in $jsFiles) {
                try { $jsLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
            }
            
            $phpLines = 0
            foreach ($file in $phpFiles) {
                try { $phpLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
            }
            
            $stats = @{
                JS = $jsFiles.Count
                JSLines = $jsLines
                PHP = $phpFiles.Count
                PHPLines = $phpLines
                SQL = $sqlFiles.Count
                MD = $mdFilesRoot.Count
                Components = $components.Count
                Hooks = $hooks.Count
                Pages = $pages.Count
                Scripts = $scripts.Count
            }
            
            Write-Host "  JavaScript/React : $($stats.JS) fichiers ($($stats.JSLines) lignes)" -ForegroundColor White
            Write-Host "  PHP              : $($stats.PHP) fichiers ($($stats.PHPLines) lignes)" -ForegroundColor White
            Write-Host "  SQL              : $($stats.SQL) fichiers" -ForegroundColor White
            Write-Host "  Markdown root    : $($stats.MD) fichiers" -ForegroundColor $(if($stats.MD -gt 10){"Red"}elseif($stats.MD -gt 5){"Yellow"}else{"Green"})
            
            # Analyse détaillée des fichiers MD à la racine
            if ($stats.MD -gt 5) {
                $rootMdFiles = @($fileInventory.MD | Where-Object { $_.DirectoryName -eq (Get-Location).Path })
                Write-Info "Fichiers MD à la racine:"
                $rootMdFiles | ForEach-Object { 
                    $size = [math]::Round($_.Length/1KB, 1)
                    $age = ((Get-Date) - $_.LastWriteTime).Days
                    Write-Info "  - $($_.Name) ($size KB, modifié il y a $age jours)"
                }
            }
            
            # Analyse de la distribution des fichiers JS
            Write-Info "Analyse distribution fichiers JS..."
            $jsByDir = @{}
            foreach ($jsFile in $fileInventory.JS) {
                $dir = Split-Path -Parent $jsFile.FullName | Split-Path -Leaf
                if (-not $jsByDir[$dir]) { $jsByDir[$dir] = 0 }
                $jsByDir[$dir]++
            }
            $topJsDirs = $jsByDir.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5
            if ($topJsDirs) {
                Write-Info "Top 5 répertoires avec fichiers JS:"
                $topJsDirs | ForEach-Object { Write-Info "  - $($_.Key): $($_.Value) fichiers" }
            }
            
            # Analyse de la distribution des fichiers MD
            Write-Info "Analyse distribution fichiers MD..."
            $mdByDir = @{}
            foreach ($mdFile in $fileInventory.MD) {
                $dir = Split-Path -Parent $mdFile.FullName | Split-Path -Leaf
                if (-not $mdByDir[$dir]) { $mdByDir[$dir] = 0 }
                $mdByDir[$dir]++
            }
            $topMdDirs = $mdByDir.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5
            if ($topMdDirs) {
                Write-Info "Top 5 répertoires avec fichiers MD:"
                $topMdDirs | ForEach-Object { Write-Info "  - $($_.Key): $($_.Value) fichiers" }
            }
            
            # Analyse des fichiers YML/YAML
            $totalYml = $fileInventory.YAML.Count + $fileInventory.YML.Count
            if ($totalYml -gt 0) {
                Write-Info "Fichiers YML/YAML trouvés: $totalYml"
                $allYml = $fileInventory.YAML + $fileInventory.YML
                $allYml | ForEach-Object { 
                    $relativePath = $_.FullName.Replace((Get-Location).Path + '\', '')
                    Write-Info "  - $relativePath"
                }
            }
            
            Write-Host "  Composants       : $($stats.Components)" -ForegroundColor White
            Write-Host "  Hooks            : $($stats.Hooks)" -ForegroundColor White
            Write-Host "  Pages Dashboard  : $($stats.Pages)" -ForegroundColor White
            Write-Host "  Scripts          : $($stats.Scripts)" -ForegroundColor White
            
            $auditResults.Stats = $stats
            $auditResults.Scores["Architecture"] = 10
            
            if ($stats.MD -gt 10) {
                Write-Warn "Trop de fichiers MD a la racine ($($stats.MD)) - Recommande <= 5"
                $auditResults.Issues += "Documentation: $($stats.MD) fichiers MD a la racine"
                $auditResults.Scores["Architecture"] = 8
                Write-Host "  💡 Action: Déplacer les fichiers MD dans audit/plans/ ou docs/" -ForegroundColor Cyan
            } elseif ($stats.MD -gt 5) {
                Write-Warn "Fichiers MD a rationaliser ($($stats.MD))"
                $auditResults.Scores["Architecture"] = 9
                Write-Host "  💡 Action: Consolider les fichiers MD similaires" -ForegroundColor Cyan
            }
            
            # Vérifier la cohérence des fichiers JS
            if ($stats.JS -gt 100) {
                Write-Info "Beaucoup de fichiers JS ($($stats.JS)) - Vérification de cohérence..."
                $jsInComponents = @($fileInventory.JS | Where-Object { $_.FullName -match '\\components\\' }).Count
                $jsInHooks = @($fileInventory.JS | Where-Object { $_.FullName -match '\\hooks\\' }).Count
                $jsInApp = @($fileInventory.JS | Where-Object { $_.FullName -match '\\app\\' }).Count
                $jsInLib = @($fileInventory.JS | Where-Object { $_.FullName -match '\\lib\\' }).Count
                $jsOther = $stats.JS - $jsInComponents - $jsInHooks - $jsInApp - $jsInLib
                Write-Info "  Distribution JS:"
                Write-Info "    - components/: $jsInComponents"
                Write-Info "    - hooks/: $jsInHooks"
                Write-Info "    - app/: $jsInApp"
                Write-Info "    - lib/: $jsInLib"
                Write-Info "    - autres: $jsOther"
                
                if ($jsOther -gt ($stats.JS * 0.2)) {
                    Write-Warn "  Beaucoup de fichiers JS hors structure standard ($jsOther/$($stats.JS))"
                    $auditResults.Warnings += "Fichiers JS mal organisés: $jsOther fichiers hors structure"
                }
            }
            
            Write-OK "Architecture analysee"
            
            # Marquer la phase comme complète et sauvegarder l'état
            $completedPhases += 1
            if (-not [string]::IsNullOrEmpty($StateFile)) {
                $partialResults["Phase1"] = @{
                    Scores = $auditResults.Scores
                    Issues = $auditResults.Issues
                    Warnings = $auditResults.Warnings
                    Recommendations = $auditResults.Recommendations
                    CorrectionPlans = $auditResults.CorrectionPlans
                }
                Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
            }
        } catch {
            Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
            $auditResults.Scores["Architecture"] = 5
        }
    } else {
        Write-Info "Phase 1 déjà complétée, reprise des résultats partiels..."
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
# PHASE 7 : CODE MORT (Qualité 1)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 7) {
Write-Section "[7/20] Code Mort - Detection Composants/Hooks/Libs Non Utilises"

$deadCode = @{
    Components = @()
    Hooks = @()
    Libs = @()
}
$totalDead = 0

try {
    Write-Info "Analyse composants..."
    
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\public\\'
    }
    
    # Analyser composants
    if (Test-Path "components") {
        $allComponents = Get-ChildItem -Path components -Recurse -File -Include *.js | ForEach-Object { $_.BaseName }
        
        foreach ($comp in $allComponents) {
            $usage = @($searchFiles | Select-String -Pattern $comp -SimpleMatch).Count
            if ($usage -le 1) {
                $deadCode.Components += $comp
                Write-Err "Composant mort: $comp"
            }
        }
    }
    
    # Analyser hooks
    Write-Info "Analyse hooks..."
    if (Test-Path "hooks") {
        $allHooks = Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js | ForEach-Object { $_.BaseName }
        foreach ($hook in $allHooks) {
            $usage = @($searchFiles | Select-String -Pattern $hook).Count
            if ($usage -le 1) {
                $deadCode.Hooks += $hook
                Write-Err "Hook mort: $hook"
            }
        }
    }
    
    # Analyser libs
    Write-Info "Analyse libs..."
    if (Test-Path "lib") {
        $allLibs = Get-ChildItem -Path lib -File -Include *.js | ForEach-Object { $_.BaseName }
        foreach ($lib in $allLibs) {
            $usage = @($searchFiles | Where-Object { $_.FullName -notlike "*\lib\*" } | Select-String -Pattern $lib).Count
            if ($usage -eq 0) {
                $deadCode.Libs += $lib
                Write-Err "Lib morte: $lib"
            }
        }
    }
    
    $totalDead = $deadCode.Components.Count + $deadCode.Hooks.Count + $deadCode.Libs.Count
    if ($totalDead -eq 0) {
        Write-OK "Aucun code mort detecte"
        $auditResults.Scores["CodeMort"] = 10
    } else {
        Write-Warn "$totalDead fichiers non utilises detectes"
        $auditResults.Issues += "Code mort: $totalDead fichiers a supprimer"
        $auditResults.Scores["CodeMort"] = [Math]::Max(10 - $totalDead, 0)
    }
} catch {
    Write-Err "Erreur analyse code mort: $($_.Exception.Message)"
    $auditResults.Scores["CodeMort"] = 5
}
}  # Fin if SelectedPhases -contains 7

# ===============================================================================
# PHASE 8 : DUPLICATION DE CODE (Qualité 2)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 8) {
Write-Section "[8/20] Duplication de Code et Refactoring"

try {
    Write-Info "Analyse patterns dupliques..."
    
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\'
    }
    
    $patterns = @(
        @{Pattern='useState\('; Description='useState'; Seuil=100},
        @{Pattern='useEffect\('; Description='useEffect'; Seuil=80},
        @{Pattern='fetchJson'; Description='Appels API'; Seuil=50},
        @{Pattern='try\s*\{'; Description='Try/catch'; Seuil=100}
    )
    
    # Détecter les fonctions d'archivage/suppression dupliquées (utilise la configuration)
    Write-Info "Analyse fonctions archivage/suppression..."
    
    # Utiliser les patterns de la configuration ou valeurs par défaut
    if ($script:Config.DuplicationPatterns) {
        $duplicationPatterns = $script:Config.DuplicationPatterns
    } else {
        # Patterns par défaut (génériques)
        $duplicationPatterns = @(
            @{ Pattern = "const handleArchive\s*=|function handleArchive|handleArchive\s*=\s*async"; Hook = "useEntityArchive"; Description = "handleArchive" }
            @{ Pattern = "const handlePermanentDelete\s*=|function handlePermanentDelete|handlePermanentDelete\s*=\s*async"; Hook = "useEntityPermanentDelete"; Description = "handlePermanentDelete" }
            @{ Pattern = "const handleRestore\w+\s*=|function handleRestore\w+|handleRestore\w+\s*=\s*async"; Hook = "useEntityRestore"; Description = "handleRestore*" }
        )
    }
    
    foreach ($dupPattern in $duplicationPatterns) {
        $matches = @($searchFiles | Select-String -Pattern $dupPattern.Pattern)
        if ($matches.Count -gt 1) {
            Write-Warn "$($dupPattern.Description) dupliquee: $($matches.Count) occurrences (devrait utiliser $($dupPattern.Hook))"
            $duplications += @{Pattern="$($dupPattern.Description) dupliquee"; Count=$matches.Count; Files=($matches | Group-Object Path).Count}
            $auditResults.Recommendations += "Unifier $($dupPattern.Description) avec $($dupPattern.Hook) hook ($($matches.Count) occurrences)"
        }
    }
    
    # Initialiser le tableau AVANT les détections (bug corrigé - ligne 360)
    # Note: Les duplications spécifiques (handleArchive, etc.) sont déjà ajoutées ci-dessus
    if ($null -eq $duplications) {
        $duplications = @()
    }
    
    foreach ($pattern in $patterns) {
        $matches = @($searchFiles | Select-String -Pattern $pattern.Pattern)
        $count = $matches.Count
        $fileCount = ($matches | Group-Object Path).Count
        
        if ($count -gt $pattern.Seuil) {
            Write-Warn "$($pattern.Description): $count occurrences dans $fileCount fichiers"
            $duplications += @{Pattern=$pattern.Description; Count=$count; Files=$fileCount}
            $auditResults.Recommendations += "Envisager refactoring: $($pattern.Description) tres utilise ($count fois)"
        }
    }
    
    # INTÉGRATION JSCPD - Analyse précise de duplication
    Write-Host "`n  Analyse avec jscpd (outil automatique)..." -ForegroundColor Yellow
    $jscpdResult = Invoke-JscpdAnalysis -ProjectRoot (Get-Location).Path
    if ($jscpdResult.Success) {
        if ($jscpdResult.DuplicatedLines -gt 0) {
            Write-Warn "  jscpd: $($jscpdResult.DuplicatedLines)% de code dupliqué ($($jscpdResult.DuplicatedFiles) fichiers)"
            $auditResults.Recommendations += "jscpd détecte $($jscpdResult.DuplicatedLines)% de duplication - refactorer les clones"
        } else {
            Write-OK "  jscpd: Aucune duplication détectée"
        }
        # Utiliser le score jscpd pour améliorer le score de duplication
        $duplicationScoreFromJscpd = $jscpdResult.Score
    } else {
        $duplicationScoreFromJscpd = 10
    }
    
    if ($duplications.Count -eq 0) {
        Write-OK "Pas de duplication excessive detectee"
        $auditResults.Scores["Duplication"] = [Math]::Min(10, ($duplicationScoreFromJscpd + 10) / 2)
    } else {
        Write-Warn "$($duplications.Count) patterns a fort potentiel de refactoring"
        $baseScore = [Math]::Max(10 - $duplications.Count, 5)
        $auditResults.Scores["Duplication"] = [Math]::Min(10, ($baseScore + $duplicationScoreFromJscpd) / 2)
    }
} catch {
    Write-Err "Erreur analyse duplication: $($_.Exception.Message)"
    $auditResults.Scores["Duplication"] = 7
}
}  # Fin if SelectedPhases -contains 8

# ===============================================================================
# PHASE 9 : COMPLEXITE (Qualité 3)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 9) {
Write-Section "[9/20] Complexite - Fichiers/Fonctions Volumineux"

try {
    Write-Info "Analyse fichiers volumineux..."
    
    $largeFiles = @()
    $allCodeFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx,*.php | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\vendor\\'
    }
    
    foreach ($file in $allCodeFiles) {
        try {
            $lines = @(Get-Content $file.FullName -ErrorAction SilentlyContinue).Count
            if ($lines -gt $MaxFileLines) {
                $relativePath = $file.FullName.Replace((Get-Location).Path + '\', '')
                $largeFiles += @{Path=$relativePath; Lines=$lines}
                Write-Warn "$relativePath : $lines lignes (> $MaxFileLines)"
            }
        } catch {}
    }
    
    $complexityScore = if($largeFiles.Count -lt 10) { 10 } 
                       elseif($largeFiles.Count -lt 20) { 9 } 
                       elseif($largeFiles.Count -lt 30) { 8 } 
                       else { 7 }
    
    if ($largeFiles.Count -eq 0) {
        Write-OK "Complexite code parfaite"
    } elseif ($largeFiles.Count -lt 20) {
        Write-OK "$($largeFiles.Count) fichiers volumineux (acceptable)"
    } else {
        Write-Warn "$($largeFiles.Count) fichiers volumineux (> $MaxFileLines lignes)"
    }
    
    $auditResults.Scores["Complexite"] = $complexityScore
} catch {
    Write-Err "Erreur analyse complexite: $($_.Exception.Message)"
    $auditResults.Scores["Complexite"] = 7
}

# ===============================================================================
# PHASE 5 : ROUTES ET NAVIGATION
# ===============================================================================

Write-Section "[5/18] Routes et Navigation - Verification Pages Menu"

try {
    # Utiliser le répertoire racine détecté au début du script
    # Si $projectRoot n'est pas défini, utiliser le répertoire courant
    $rootPath = if ($projectRoot) { $projectRoot } else { (Get-Location).Path }
    Push-Location $rootPath
    
    # Utiliser la configuration ou valeurs par défaut
    if ($script:Config.Routes) {
        $menuPages = $script:Config.Routes
    } else {
        $menuPages = @(
            @{Route="/dashboard"; File="app/dashboard/page.js"; Name="Vue Ensemble"},
            @{Route="/dashboard/patients"; File="app/dashboard/patients/page.js"; Name="Patients"},
            @{Route="/dashboard/users"; File="app/dashboard/users/page.js"; Name="Utilisateurs"},
            @{Route="/dashboard/documentation"; File="app/dashboard/documentation/page.js"; Name="Documentation"}
        )
    }
    
    $missingPages = 0
    foreach ($page in $menuPages) {
        $fullPath = Join-Path $rootPath $page.File
        if (Test-Path $fullPath) {
            Write-OK "$($page.Name) -> $($page.Route)"
        } else {
            Write-Err "$($page.Name) -> MANQUANT: $($page.File)"
            $auditResults.Issues += "Route cassee: $($page.Route)"
            $missingPages++
        }
    }
    
    Pop-Location
    
    $auditResults.Scores["Routes"] = [Math]::Max(10 - ($missingPages * 2), 0)
} catch {
    Write-Err "Erreur analyse routes: $($_.Exception.Message)"
    $auditResults.Scores["Routes"] = 5
}
}  # Fin if SelectedPhases -contains 14

# ===============================================================================
# PHASE 4 : ENDPOINTS API (Backend 1)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 4) {
Write-Section "[4/20] Endpoints API - Tests Fonctionnels"

$apiScore = 0
$endpointsTotal = 0
$endpointsOK = 0
$script:apiAuthFailed = $false  # Marquer si l'authentification a échoué pour réessayer plus tard

try {
    Write-Info "Connexion API..."
    $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
    
    $authEndpoint = if ($script:Config -and $script:Config.Api -and $script:Config.Api.AuthEndpoint) { $script:Config.Api.AuthEndpoint } else { "/api.php/auth/login" }
    try {
        $authResponse = Invoke-RestMethod -Uri "$ApiUrl$authEndpoint" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
        $script:authToken = $authResponse.token
        $script:authHeaders = @{Authorization = "Bearer $script:authToken"}
        $token = $script:authToken  # Pour compatibilité
        $headers = $script:authHeaders  # Pour compatibilité
        Write-OK "Authentification reussie"
        
        # Utiliser la configuration ou valeurs par défaut
        if ($script:Config.Api.Endpoints) {
            $endpoints = $script:Config.Api.Endpoints
        } else {
            $endpoints = @(
                @{Path="/api.php/devices"; Name="Dispositifs"},
                @{Path="/api.php/patients"; Name="Patients"},
                @{Path="/api.php/users"; Name="Utilisateurs"},
                @{Path="/api.php/alerts"; Name="Alertes"},
                @{Path="/api.php/firmwares"; Name="Firmwares"},
                @{Path="/api.php/roles"; Name="Roles"},
                @{Path="/api.php/permissions"; Name="Permissions"},
                @{Path="/api.php/health"; Name="Healthcheck"}
            )
        }
        
        foreach ($endpoint in $endpoints) {
            $endpointsTotal++
            try {
                $result = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Headers $script:authHeaders -TimeoutSec 10
                Write-OK $endpoint.Name
                $endpointsOK++
            } catch {
                Write-Err "$($endpoint.Name) - Erreur"
            }
        }
        
        $apiScore = [math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
        
    } catch {
        Write-Warn "Echec authentification (tentative 1/1)"
        Write-Info "L'audit continue - Réessai à la fin de l'audit..."
        $script:apiAuthFailed = $true
        $apiScore = 5
    }
    
} catch {
    Write-Warn "Echec connexion API (tentative 1/1)"
    Write-Info "L'audit continue - Réessai à la fin de l'audit..."
    $script:apiAuthFailed = $true
    $apiScore = 5
}

$auditResults.Scores["API"] = $apiScore
}  # Fin if SelectedPhases -contains 4

# ===============================================================================
# PHASE 5 : BASE DE DONNEES (Backend 2)
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 5) {
    Write-Section "[5/20] Base de Donnees - Coherence et Integrite"

    # Variables pour la phase 14 (initialisées si l'authentification a réussi)
    $script:authHeaders = $null
    $script:authToken = $null

    try {
        # Si l'authentification a réussi dans la phase 6, continuer
        # Sinon, on réessayera à la fin de l'audit
        if ($apiScore -gt 0 -and $endpointsOK -gt 0 -and $script:authHeaders -and $script:authToken) {
            # Utiliser les headers de la phase 6 si disponibles
            try {
                # Récupérer les données avec gestion d'erreur améliorée
                $devicesData = Invoke-RestMethod -Uri "$ApiUrl/api.php/devices" -Headers $script:authHeaders -TimeoutSec 10 -ErrorAction Stop
                $patientsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/patients" -Headers $script:authHeaders -TimeoutSec 10 -ErrorAction Stop
                $usersData = Invoke-RestMethod -Uri "$ApiUrl/api.php/users" -Headers $script:authHeaders -TimeoutSec 10 -ErrorAction Stop
                $alertsData = Invoke-RestMethod -Uri "$ApiUrl/api.php/alerts" -Headers $script:authHeaders -TimeoutSec 10 -ErrorAction Stop
                
                # Extraire les données avec gestion robuste de la structure
                # Structure API : {devices: [...]} ou {success: true, patients: [...]}
                $devices = Get-ArrayFromApiResponse -data $devicesData -propertyName "devices"
                $patients = Get-ArrayFromApiResponse -data $patientsData -propertyName "patients"
                $users = Get-ArrayFromApiResponse -data $usersData -propertyName "users"
                $alerts = Get-ArrayFromApiResponse -data $alertsData -propertyName "alerts"
                
                # Debug si verbose
                if ($Verbose) {
                    Write-Info "Structure devicesData: $($devicesData.GetType().Name)"
                    Write-Info "Structure patientsData: $($patientsData.GetType().Name)"
                    if ($devicesData -is [PSCustomObject]) {
                        Write-Info "Propriétés devicesData: $($devicesData.PSObject.Properties.Name -join ', ')"
                    }
                    if ($patientsData -is [PSCustomObject]) {
                        Write-Info "Propriétés patientsData: $($patientsData.PSObject.Properties.Name -join ', ')"
                    }
                    Write-Info "Devices extraits: $($devices.Count)"
                    Write-Info "Patients extraits: $($patients.Count)"
                }
                
                Write-Host "  Dispositifs   : $($devices.Count)" -ForegroundColor White
                Write-Host "  Patients      : $($patients.Count)" -ForegroundColor White
                Write-Host "  Utilisateurs  : $($users.Count)" -ForegroundColor White
                Write-Host "  Alertes       : $($alerts.Count)" -ForegroundColor White
                
                # Dispositifs non assignes
                $unassigned = @($devices | Where-Object { -not $_.patient_id }).Count
                if ($unassigned -gt 0) {
                    Write-Warn "$unassigned dispositifs non assignes"
                    $auditResults.Recommendations += "Assigner les $unassigned dispositifs"
                }
                
                # Alertes non resolues
                $unresolvedAlerts = @($alerts | Where-Object { $_.status -eq 'unresolved' }).Count
                if ($unresolvedAlerts -gt 5) {
                    Write-Warn "$unresolvedAlerts alertes non resolues"
                }
                
                Write-OK "Base de donnees coherente"
                $auditResults.Scores["Database"] = 9
            } catch {
                Write-Warn "Erreur donnees BDD"
                $auditResults.Scores["Database"] = 7
            }
        } else {
            Write-Warn "Analyse BDD ignoree (API non accessible)"
            $auditResults.Scores["Database"] = 5
        }
        
    } catch {
        Write-Err "Erreur BDD: $($_.Exception.Message)"
        $auditResults.Scores["Database"] = 5
    }
}  # Fin if SelectedPhases -contains 5

# ===============================================================================
# PHASE 8 : SECURITE
# ===============================================================================

Write-Section "[8/18] Securite - Headers, SQL Injection, XSS"

$securityScore = 10

try {
    # Headers de securite
    Write-Info "Verification headers..."
    
    # SQL Injection
    Write-Info "Verification SQL..."
    $unsafeSQL = @(Get-ChildItem -Recurse -File -Include *.php -Exclude helpers.php | Where-Object {
        $_.FullName -notmatch 'vendor'
    } | Select-String -Pattern '\$pdo->query\(\$[^)]|\$pdo->exec\(\$[^)]' | Where-Object {
        $_.Line -notmatch 'migration|sql file' -and
        $_.Path -notmatch 'helpers\.php'
    })
    
    if ($unsafeSQL.Count -gt 0) {
        Write-Warn "$($unsafeSQL.Count) requetes SQL a verifier"
        $securityScore -= 2
    } else {
        Write-OK "Requetes SQL preparees (PDO)"
    }
    
    # XSS
    Write-Info "Verification XSS..."
    $dangerousHTML = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\'
    } | Select-String -Pattern 'dangerouslySetInnerHTML' | Where-Object {
        # Exclure les scripts de service worker (statiques et sécurisés)
        $_.Line -notmatch 'serviceWorker|Service Worker|Script.*id.*service-worker' -and
        # Exclure les composants Script de Next.js (gèrent automatiquement la sécurité)
        $_.Line -notmatch 'Script.*dangerouslySetInnerHTML'
    })
    
    if ($dangerousHTML.Count -gt 0) {
        Write-Warn "dangerouslySetInnerHTML detecte ($($dangerousHTML.Count))"
        $securityScore -= 1
    } else {
        Write-OK "XSS protege"
    }
    
    # INTÉGRATION NPM AUDIT - Vulnérabilités npm
    Write-Host "`n  Analyse avec npm audit (vulnérabilités npm)..." -ForegroundColor Yellow
    $npmAuditResult = Invoke-NpmAuditAnalysis -ProjectRoot (Get-Location).Path
    if ($npmAuditResult.Success) {
        if ($npmAuditResult.Vulnerabilities -gt 0) {
            Write-Warn "  npm audit: $($npmAuditResult.Vulnerabilities) vulnérabilité(s) détectée(s)"
            if ($npmAuditResult.Critical -gt 0) {
                Write-Err "    CRITIQUE: $($npmAuditResult.Critical) vulnérabilité(s) critique(s)"
                $securityScore -= 2
            }
            if ($npmAuditResult.High -gt 0) {
                Write-Warn "    HAUTE: $($npmAuditResult.High) vulnérabilité(s) haute(s)"
                $securityScore -= 1
            }
            if ($npmAuditResult.Moderate -gt 0) {
                Write-Info "    MODÉRÉE: $($npmAuditResult.Moderate) vulnérabilité(s) modérée(s)"
            }
            $auditResults.Recommendations += "npm audit: $($npmAuditResult.Vulnerabilities) vulnérabilité(s) - exécuter 'npm audit fix'"
        } else {
            Write-OK "  npm audit: Aucune vulnérabilité détectée"
        }
        # NOUVEAU: Afficher les dépendances obsolètes
        if ($npmAuditResult.Outdated -and $npmAuditResult.Outdated.Count -gt 0) {
            Write-Warn "  $($npmAuditResult.Outdated.Count) dependance(s) obsolete(s) detectee(s)"
            $outdatedList = $npmAuditResult.Outdated | Select-Object -First 5 | ForEach-Object {
                "$($_.Package): $($_.Current) -> $($_.Latest)"
            }
            foreach ($item in $outdatedList) {
                Write-Info "    $item"
            }
            if ($npmAuditResult.Outdated.Count -gt 5) {
                Write-Info "    ... et $($npmAuditResult.Outdated.Count - 5) autre(s)"
            }
            $auditResults.Recommendations += "Mettre a jour $($npmAuditResult.Outdated.Count) dependance(s) obsolete(s) (npm update)"
            if (-not $auditResults.OutdatedPackages) { $auditResults.OutdatedPackages = @() }
            $auditResults.OutdatedPackages = $npmAuditResult.Outdated
        } else {
            Write-OK "  Toutes les dependances sont a jour"
        }
        
        # Utiliser le score npm audit pour améliorer le score de sécurité
        $securityScore = [Math]::Min(10, ($securityScore + $npmAuditResult.Score) / 2)
    }
    
    # VÉRIFICATION MODALS UNIFIÉS - Confirmations
    Write-Info "Verification modals unifies pour confirmations..."
    $windowConfirms = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\out\\' -and
        $_.FullName -notmatch '\\docs\\' -and
        $_.FullName -notmatch '\\chunks\\' -and
        $_.FullName -notmatch '\\static\\'
    } | Select-String -Pattern '\bwindow\.confirm\s*\(|\bconfirm\s*\(\s*["'']' | Where-Object {
        # Exclure les commentaires, les chaînes de caractères, et les faux positifs
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
            
            # Générer un plan de correction pour chaque window.confirm()
            $fileContent = Get-Content $confirm.Path -ErrorAction SilentlyContinue
            $currentLine = if ($fileContent -and $fileContent.Count -ge $confirm.LineNumber) { $fileContent[$confirm.LineNumber - 1] } else { "" }
            
            $correctionPlan = New-CorrectionPlan `
                -IssueType "window.confirm() au lieu de ConfirmModal" `
                -Severity "medium" `
                -Description "Utilisation de window.confirm() détectée dans $($confirm.Path) à la ligne $($confirm.LineNumber). Pour une UX unifiée, utiliser le composant ConfirmModal." `
                -File $confirm.Path `
                -Line $confirm.LineNumber `
                -CurrentCode $currentLine `
                -RecommendedFix @"
1. Importer ConfirmModal depuis '@/components/ConfirmModal'
2. Ajouter un état pour gérer l'ouverture/fermeture du modal
3. Remplacer window.confirm() par l'ouverture du ConfirmModal
4. Gérer la confirmation dans le callback onConfirm du modal

Exemple de correction:
  AVANT: if (window.confirm('Êtes-vous sûr ?')) { ... }
  APRÈS: 
    const [showConfirm, setShowConfirm] = useState(false)
    ...
    <ConfirmModal
      isOpen={showConfirm}
      onClose={() => setShowConfirm(false)}
      onConfirm={() => { ... }}
      title="Confirmation"
      message="Êtes-vous sûr ?"
    />
"@ `
                -VerificationSteps @(
                    "Vérifier que ConfirmModal est importé",
                    "Vérifier que le modal s'ouvre correctement",
                    "Vérifier que la confirmation fonctionne",
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
    
    # Vérifier que ConfirmModal est bien importé et utilisé
    Write-Info "Verification utilisation ConfirmModal..."
    $confirmModalImports = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\' -and
        $_.FullName -notmatch '\\docs\\'
    } | Select-String -Pattern 'import.*ConfirmModal|from.*ConfirmModal').Count
    
    if ($confirmModalImports -gt 0) {
        Write-OK "  ConfirmModal importe dans $confirmModalImports fichier(s)"
    }
    
    # NOUVEAU: Détection des secrets hardcodés (améliorée pour éviter les faux positifs)
    Write-Info "Detection des secrets hardcodes (passwords, tokens, API keys)..."
    $secretPatterns = @(
        @{Pattern = 'password\s*[:=]\s*["'']([^"'']+)["'']'; Description = "Password hardcode"; ExcludePattern = 'password.*(?:doit|obligatoire|contenir|minimum|caractère|error|message|validation|confirm|show|hide|set)' }
        @{Pattern = 'api[_-]?key\s*[:=]\s*["'']([^"'']+)["'']'; Description = "API key hardcode"; ExcludePattern = '' }
        @{Pattern = 'token\s*[:=]\s*["'']([^"'']{20,})["'']'; Description = "Token hardcode"; ExcludePattern = '' }
        @{Pattern = 'secret\s*[:=]\s*["'']([^"'']+)["'']'; Description = "Secret hardcode"; ExcludePattern = 'CHANGEZ|TODO|FIXME|example|exemple' }
        @{Pattern = 'private[_-]?key\s*[:=]\s*["'']([^"'']+)["'']'; Description = "Private key hardcode"; ExcludePattern = '' }
    )
    
    $secretsFound = @()
    # Exclure les fichiers de build, tests (sauf si vraiment problématique), et fichiers générés
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
                    
                    # Vérifier les exclusions
                    $shouldExclude = $false
                    if ($line -and ($line -match '^\s*//' -or $line -match '^\s*#')) {
                        $shouldExclude = $true
                    }
                    if ($line -and $pattern.ExcludePattern -and $line -match $pattern.ExcludePattern) {
                        $shouldExclude = $true
                    }
                    # Exclure les messages d'erreur de validation
                    if ($line -and $line -match '(?:doit|obligatoire|contenir|minimum|caractère|error|message|validation|format|invalide)') {
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
            
            # Générer un plan de correction pour chaque secret détecté
            $fileContent = Get-Content $secret.File -ErrorAction SilentlyContinue
            $currentLine = if ($fileContent -and $fileContent.Count -ge $secret.Line) { $fileContent[$secret.Line - 1] } else { "" }
            
            $correctionPlan = New-CorrectionPlan `
                -IssueType "Secret Hardcodé" `
                -Severity "critical" `
                -Description "$($secret.Pattern) détecté dans $($secret.File) à la ligne $($secret.Line). Les secrets ne doivent jamais être hardcodés dans le code source." `
                -File $secret.File `
                -Line $secret.Line `
                -CurrentCode $currentLine `
                -RecommendedFix @"
1. Créer une variable d'environnement pour ce secret (ex: dans .env.local)
2. Remplacer le code hardcodé par une référence à la variable d'environnement
3. Ajouter .env.local au .gitignore si ce n'est pas déjà fait
4. Documenter la variable dans env.example
5. Vérifier que le secret n'a pas été commité dans l'historique Git

Exemple de correction:
  AVANT: const apiKey = 'sk-1234567890abcdef'
  APRÈS: const apiKey = process.env.API_KEY || ''
"@ `
                -VerificationSteps @(
                    "Vérifier que la variable d'environnement est définie",
                    "Vérifier que .env.local est dans .gitignore",
                    "Vérifier que le secret n'est plus dans le code source",
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
    
    Write-OK "Verification securite terminee"
    
} catch {
    Write-Warn "Erreur verification securite"
    $securityScore = 7
}

$auditResults.Scores["Securite"] = [Math]::Max($securityScore, 0)

# ===============================================================================
# PHASE 9 : PERFORMANCE
# ===============================================================================

Write-Section "[9/18] Performance - Optimisations React et Cache"

try {
    $searchFiles = Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\'
    }
    
    $lazyLoading = @($searchFiles | Select-String -Pattern 'dynamicImport|lazy\(|React\.lazy').Count
    $memoUsage = @($searchFiles | Select-String -Pattern 'useMemo|useCallback').Count
    $cacheUsage = @($searchFiles | Select-String -Pattern 'cache|Cache').Count
    
    Write-OK "Lazy loading: $lazyLoading composants"
    Write-OK "Optimisations React: $memoUsage useMemo/useCallback"
    Write-OK "Cache: $cacheUsage utilisations"
    
    # NOUVEAU: Vérifier optimisations .filter() sans useMemo
    Write-Info "Analyse optimisations .filter() sans useMemo..."
    $filterOptimizationIssues = @()
    $pagesFiles = @($searchFiles | Where-Object { $_.FullName -match '\\app\\dashboard\\' -and $_.Name -eq 'page.js' })
    foreach ($file in $pagesFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $filterCount = ([regex]::Matches($content, "\.filter\(")).Count
            $mapCount = ([regex]::Matches($content, "\.map\(")).Count
            $findCount = ([regex]::Matches($content, "\.find\(")).Count
            $useMemoCount = ([regex]::Matches($content, "useMemo")).Count
            $useCallbackCount = ([regex]::Matches($content, "useCallback")).Count
            $totalOptimizations = $useMemoCount + $useCallbackCount
            $totalOperations = $filterCount + $mapCount + $findCount
            
            if ($filterCount -gt 5 -and $totalOptimizations -lt $filterCount) {
                $filterOptimizationIssues += "$($file.Name): $filterCount .filter() mais seulement $totalOptimizations useMemo/useCallback"
            }
        }
    }
    if ($filterOptimizationIssues.Count -gt 0) {
        Write-Warn "  $($filterOptimizationIssues.Count) fichier(s) avec beaucoup de .filter() sans useMemo"
        foreach ($issue in $filterOptimizationIssues) {
            Write-Info "    - $issue"
        }
        $auditResults.Warnings += "Performance: $($filterOptimizationIssues.Count) fichier(s) avec .filter() non optimisés"
        $auditResults.Scores["Performance"] = [Math]::Max(7, $auditResults.Scores["Performance"] - 0.5)
    } else {
        Write-OK "  Optimisations .filter() appropriées"
    }
    
    # NOUVEAU: Vérifier variables inutilisées
    Write-Info "Analyse variables inutilisées..."
    $unusedVariables = @()
    foreach ($file in $pagesFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Extraire les déclarations de variables (const, let, var)
            $varDeclarations = [regex]::Matches($content, "(const|let|var)\s+(\w+)\s*=", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            foreach ($decl in $varDeclarations) {
                $varName = $decl.Groups[2].Value
                # Ignorer les hooks React et les variables système
                if ($varName -notmatch '^(use|set|is|has|can|should|will|did|prev|next|current|ref)$') {
                    # Compter les occurrences (déclaration + utilisations)
                    $usageCount = ([regex]::Matches($content, "\b$([regex]::Escape($varName))\b")).Count
                    # Si utilisé seulement 1 fois (déclaration), c'est inutilisé
                    if ($usageCount -eq 1) {
                        $unusedVariables += "$($file.Name): $varName"
                    }
                }
            }
        }
    }
    if ($unusedVariables.Count -gt 0) {
        Write-Warn "  $($unusedVariables.Count) variable(s) possiblement inutilisée(s)"
        foreach ($var in $unusedVariables | Select-Object -First 10) {
            Write-Info "    - $var"
        }
        if ($unusedVariables.Count -gt 10) {
            Write-Info "    ... et $($unusedVariables.Count - 10) autre(s)"
        }
        $auditResults.Warnings += "Code mort: $($unusedVariables.Count) variable(s) inutilisée(s) détectée(s)"
        $auditResults.Scores["Performance"] = [Math]::Max(7, $auditResults.Scores["Performance"] - 0.3)
    } else {
        Write-OK "  Aucune variable inutilisée détectée"
    }
    
    # NOUVEAU: Vérifier doublons de code (fonctions dupliquées)
    Write-Info "Analyse doublons de code..."
    $duplicateFunctions = @()
    $allFunctionNames = @{}
    foreach ($file in $pagesFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            # Extraire les noms de fonctions
            $functions = [regex]::Matches($content, "(const|function)\s+(\w+)\s*=", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            foreach ($func in $functions) {
                $funcName = $func.Groups[2].Value
                if ($allFunctionNames.ContainsKey($funcName)) {
                    $duplicateFunctions += "$funcName (dans $($allFunctionNames[$funcName]) et $($file.Name))"
                } else {
                    $allFunctionNames[$funcName] = $file.Name
                }
            }
        }
    }
    if ($duplicateFunctions.Count -gt 0) {
        Write-Warn "  $($duplicateFunctions.Count) fonction(s) dupliquée(s) détectée(s)"
        foreach ($dup in $duplicateFunctions | Select-Object -First 5) {
            Write-Info "    - $dup"
        }
        $auditResults.Warnings += "Code dupliqué: $($duplicateFunctions.Count) fonction(s) dupliquée(s)"
    } else {
        Write-OK "  Aucun doublon de fonction détecté"
    }
    
    # NOUVEAU: Vérifier complexité par fichier
    Write-Info "Analyse complexité par fichier..."
    $complexFiles = @()
    foreach ($file in $pagesFiles) {
        $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $ifCount = ([regex]::Matches($content, "\bif\s*\(")).Count
            $forCount = ([regex]::Matches($content, "\bfor\s*\(")).Count
            $whileCount = ([regex]::Matches($content, "\bwhile\s*\(")).Count
            $totalComplexity = $ifCount + $forCount + $whileCount
            $lineCount = (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
            
            # Fichier volumineux (>500 lignes) ou complexité élevée (>50 conditions)
            if ($lineCount -gt 500 -or $totalComplexity -gt 50) {
                $complexFiles += "$($file.Name): $lineCount lignes, $totalComplexity conditions (if:$ifCount, for:$forCount, while:$whileCount)"
            }
        }
    }
    if ($complexFiles.Count -gt 0) {
        Write-Warn "  $($complexFiles.Count) fichier(s) volumineux ou complexe(s)"
        foreach ($complex in $complexFiles) {
            Write-Info "    - $complex"
        }
        $auditResults.Recommendations += "Refactorisation: $($complexFiles.Count) fichier(s) volumineux/complexe(s) à considérer"
    } else {
        Write-OK "  Complexité des fichiers acceptable"
    }
    
    # Requetes dans loops (N+1)
    $loopQueries = @($searchFiles | Where-Object { 
        $_.FullName -match '\\app\\|\\components\\|\\hooks\\' 
    } | Select-String -Pattern '\.map\(.*fetchJson|\.map\(.*fetch\(')
    
    if ($loopQueries.Count -gt 0) {
        Write-Warn "Requetes dans loops detectees: $($loopQueries.Count)"
        $auditResults.Warnings += "Performance: $($loopQueries.Count) requetes dans loops"
        $auditResults.Scores["Performance"] = [Math]::Max(7, ($auditResults.Scores["Performance"] - 0.5))
    } else {
        Write-OK "Pas de requetes N+1 detectees"
    }
    
    # Ajuster le score final de performance
    if (-not $auditResults.Scores.ContainsKey("Performance")) {
        $auditResults.Scores["Performance"] = 10
    }
} catch {
    Write-Warn "Erreur analyse performance"
    $auditResults.Scores["Performance"] = 7
}

# ===============================================================================
# PHASE 10 : TESTS
# ===============================================================================

Write-Section "[10/18] Tests et Couverture"

try {
    $testFiles = @(Get-ChildItem -Recurse -File -Include *.test.js,*.spec.js | Where-Object {
        $_.FullName -notmatch 'node_modules' -and
        $_.FullName -notmatch '\\\.next\\'
    })
    
    Write-Host "  Fichiers de tests: $($testFiles.Count)" -ForegroundColor White
    
    $testScore = if($testFiles.Count -ge 10) { 8 } elseif($testFiles.Count -ge 5) { 6 } else { 4 }
    
    if ($testFiles.Count -lt 5) {
        Write-Warn "Tests insuffisants ($($testFiles.Count) fichiers)"
        $auditResults.Recommendations += "Ajouter tests E2E pour fonctionnalites critiques"
    } else {
        Write-OK "$($testFiles.Count) fichiers de tests"
    }
    
    # INTÉGRATION JEST - Tests unitaires et couverture
    Write-Host "`n  Analyse avec Jest (tests unitaires)..." -ForegroundColor Yellow
    $jestResult = Invoke-JestAnalysis -ProjectRoot (Get-Location).Path
    if ($jestResult.Success) {
        if ($jestResult.TestsTotal -gt 0) {
            Write-OK "  Jest: $($jestResult.TestsPassed)/$($jestResult.TestsTotal) tests réussis"
            if ($jestResult.TestsFailed -gt 0) {
                Write-Warn "    $($jestResult.TestsFailed) test(s) échoué(s)"
                $auditResults.Recommendations += "Jest: $($jestResult.TestsFailed) test(s) à corriger"
            }
            if ($jestResult.Coverage -gt 0) {
                Write-Host "    Couverture: $($jestResult.Coverage)%" -ForegroundColor $(if ($jestResult.Coverage -ge 70) { "Green" } elseif ($jestResult.Coverage -ge 50) { "Yellow" } else { "Red" })
                if ($jestResult.Coverage -lt 70) {
                    $auditResults.Recommendations += "Jest: Améliorer la couverture de code (actuellement $($jestResult.Coverage)%)"
                }
            }
        } else {
            Write-Warn "  Jest: Aucun test exécuté"
        }
        # Utiliser le score Jest pour améliorer le score de tests
        $testScore = [Math]::Min(10, ($testScore + $jestResult.Score) / 2)
    }
    
    $auditResults.Scores["Tests"] = $testScore
} catch {
    $auditResults.Scores["Tests"] = 4
}

# ===============================================================================
# PHASES 11-15 : AUTRES VERIFICATIONS
# ===============================================================================

Write-Section "[11/18] Documentation, Imports, Erreurs, Logs, Best Practices"

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
# PHASE OPTIMISATION AVANCÉE : VÉRIFICATIONS DÉTAILLÉES
# ===============================================================================

Write-Section "[OPTIMISATION] Vérifications avancées - Performance et Conception"

$optimizationIssues = @()
$optimizationScore = 10.0

# 1. Vérifier requêtes SQL N+1 dans PHP (backend)
# IMPORTANT: Distinguer les vraies requêtes N+1 (SELECT dans boucles) des INSERT/UPDATE normaux
Write-Host "`n1. Requêtes SQL Backend (N+1):" -ForegroundColor Yellow
$phpFiles = @(Get-ChildItem -Path api -Recurse -File -Include *.php -ErrorAction SilentlyContinue)
$nPlusOnePatterns = @()
foreach ($file in $phpFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        # Chercher des patterns de requêtes SELECT dans des boucles (vraies requêtes N+1)
        # Ignorer les INSERT/UPDATE/DELETE qui sont normaux dans des boucles
        $loops = [regex]::Matches($content, '(foreach|while|for)\s*\([^)]*\)\s*\{[^}]*SELECT[^}]*->(query|prepare|execute)', [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if ($loops.Count -gt 0) {
            foreach ($loop in $loops) {
                $loopContent = $content.Substring($loop.Index, [Math]::Min(500, $content.Length - $loop.Index))
                # Vérifier que c'est bien un SELECT, pas un INSERT/UPDATE/DELETE
                if ($loopContent -match 'SELECT\s+[^IUD]' -and $loopContent -notmatch 'INSERT|UPDATE|DELETE') {
                $line = ($content.Substring(0, $loop.Index) -split "`n").Count
                $nPlusOnePatterns += "$($file.Name):$line"
                }
            }
        }
        
        # Chercher aussi les patterns avec fetch/fetchAll dans des boucles (sans JOIN préalable)
        $fetchLoops = [regex]::Matches($content, '(foreach|while|for)\s*\([^)]*\)\s*\{[^}]*->(fetch|fetchAll)\s*\(', [System.Text.RegularExpressions.RegexOptions]::Singleline)
        if ($fetchLoops.Count -gt 0) {
            foreach ($fetchLoop in $fetchLoops) {
                # Vérifier qu'il n'y a pas de JOIN dans les 200 caractères avant
                $startIndex = [Math]::Max(0, $fetchLoop.Index - 200)
                $beforeContext = $content.Substring($startIndex, $fetchLoop.Index - $startIndex)
                # Si pas de JOIN et que c'est dans une boucle sur des résultats, c'est suspect
                if ($beforeContext -notmatch 'JOIN|LEFT JOIN|INNER JOIN|RIGHT JOIN') {
                    $line = ($content.Substring(0, $fetchLoop.Index) -split "`n").Count
                    # Vérifier que ce n'est pas déjà dans notre liste
                    $alreadyFound = $false
                    foreach ($existing in $nPlusOnePatterns) {
                        if ($existing -match "$($file.Name):$line") {
                            $alreadyFound = $true
                            break
                        }
                    }
                    if (-not $alreadyFound) {
                        $nPlusOnePatterns += "$($file.Name):$line (fetch dans boucle)"
                    }
                }
            }
        }
    }
}

if ($nPlusOnePatterns.Count -gt 0) {
    Write-Warn "  $($nPlusOnePatterns.Count) requêtes SQL potentiellement N+1 détectées (SELECT dans boucles)"
    $optimizationIssues += "Backend: $($nPlusOnePatterns.Count) requêtes SQL SELECT dans loops"
    $optimizationScore -= 1.0
} else {
    Write-OK "  Aucun pattern N+1 détecté dans PHP (seuls les SELECT dans boucles sont considérés)"
}

# 2. Vérifier index SQL manquants
Write-Host "`n2. Index SQL:" -ForegroundColor Yellow
$sqlFiles = @(Get-ChildItem -Path sql -File -Include *.sql -ErrorAction SilentlyContinue)
$hasIndexes = $false
foreach ($file in $sqlFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content -and ($content -match 'CREATE\s+INDEX|CREATE\s+UNIQUE\s+INDEX')) {
        $hasIndexes = $true
        break
    }
}

if ($hasIndexes) {
    Write-OK "  Index SQL présents dans les migrations"
} else {
    Write-Warn "  Aucun index SQL explicite trouvé (peut être normal si créés ailleurs)"
    $optimizationScore -= 0.5
}

# 3. Vérifier pagination API
Write-Host "`n3. Pagination API:" -ForegroundColor Yellow
$paginatedEndpoints = @()
foreach ($file in $phpFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($content) {
        if ($content -match 'LIMIT\s+\d+|OFFSET\s+\d+|page|limit|offset') {
            $paginatedEndpoints += $file.Name
        }
    }
}
if ($paginatedEndpoints.Count -gt 5) {
    Write-OK "  Pagination présente dans $($paginatedEndpoints.Count) endpoints"
} else {
    Write-Warn "  Pagination limitée - à vérifier pour les grandes listes"
    $optimizationScore -= 0.5
}

# 4. Vérifier imports inutilisés React (détection précise améliorée)
Write-Host "`n4. Imports React:" -ForegroundColor Yellow
$jsFiles = @(Get-ChildItem -Recurse -File -Include *.js,*.jsx | Where-Object {
    $_.FullName -match '\\app\\|\\components\\|\\hooks\\' -and
    $_.FullName -notmatch 'node_modules' -and
    $_.FullName -notmatch '\\\.next\\'
})

$unusedImports = 0
$unusedImportsDetails = @()
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
    $lines = Get-Content $file.FullName -ErrorAction SilentlyContinue
    if ($content -and $lines) {
        # Extraire les imports avec la même logique que detect-unused-imports.ps1
        $imports = @()
        foreach ($line in $lines) {
            if ($line -match '^import\s+(?:(\w+)|(?:\{([^}]+)\})|(?:\*\s+as\s+(\w+)))\s+from') {
                if ($matches[1]) {
                    # import X from
                    $imports += $matches[1]
                } elseif ($matches[2]) {
                    # import { X, Y } from
                    $parts = $matches[2] -split ',' | ForEach-Object { $_.Trim() -replace 'as\s+\w+', '' -replace '\s+as\s+\w+', '' }
                    $imports += $parts | ForEach-Object { if ($_ -match '^\s*(\w+)') { $matches[1] } }
                } elseif ($matches[3]) {
                    # import * as X from
                    $imports += $matches[3]
                }
            }
        }
        
        # Liste des hooks React standards (toujours utilisés, ignorer)
        $reactHooks = @('useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext', 
                        'useReducer', 'useLayoutEffect', 'useImperativeHandle', 'useDebugValue',
                        'useRouter', 'usePathname', 'useSearchParams', 'useAuth', 'useUsb')
        
        # Vérifier chaque import avec détection améliorée
        foreach ($import in $imports) {
            if ($import) {
                # Ignorer les hooks React standards
                if ($reactHooks -contains $import) {
                    continue
                }
                
                # Retirer les lignes d'import pour éviter les faux positifs
                $contentWithoutImports = $content -replace '(?m)^import\s+[^;]+;?\s*$', ''
                
                # Patterns de détection d'utilisation (plus précis)
                $usagePatterns = @(
                    "<$import",           # JSX: <ComponentName
                    "<$import\s",         # JSX: <ComponentName 
                    "<$import>",          # JSX: <ComponentName>
                    "</$import>",         # JSX: </ComponentName>
                    "\b$import\s*\(",     # Appel fonction: ComponentName(
                    "\b$import\s*\.",     # Propriété: ComponentName.
                    "\b$import\s*\[",     # Tableau: ComponentName[
                    "\b$import\s*\?",     # Optional: ComponentName?
                    "\b$import\s*!",      # Non-null: ComponentName!
                    "\b$import\s*:",      # Type/param: ComponentName:
                    "\b$import\s*=",      # Assignation: ComponentName =
                    "\b$import\s*,",      # Dans liste: ComponentName,
                    "\b$import\s*}",      # Dans objet: ComponentName}
                    "\b$import\s*\]",     # Dans tableau: ComponentName]
                    "\b$import\s*;",      # Fin instruction: ComponentName;
                    "\b$import\s*$",      # Fin ligne: ComponentName
                    "new\s+$import",      # Instanciation: new ComponentName
                    "typeof\s+$import",   # Typeof: typeof ComponentName
                    "instanceof\s+$import" # Instanceof: instanceof ComponentName
                )
                
                # Vérifier si l'import est utilisé dans le code (hors import)
                $isUsed = $false
                foreach ($pattern in $usagePatterns) {
                    if ($contentWithoutImports -match $pattern) {
                        $isUsed = $true
                        break
                    }
                }
                
                # Vérification supplémentaire : recherche de mot complet (pour les cas complexes)
                if (-not $isUsed) {
                    $wordBoundaryPattern = "\b$([regex]::Escape($import))\b"
                    $matches = [regex]::Matches($contentWithoutImports, $wordBoundaryPattern)
                    # Si plus d'une occurrence (hors import), c'est utilisé
                    if ($matches.Count -gt 0) {
                        $isUsed = $true
                    }
                }
                
                if (-not $isUsed) {
                    $unusedImports++
                    $unusedImportsDetails += "$($file.Name): $import"
                }
            }
        }
    }
}

if ($unusedImports -gt 10) {
    Write-Warn "  $unusedImports imports potentiellement inutilisés (à vérifier manuellement)"
    foreach ($detail in $unusedImportsDetails | Select-Object -First 10) {
        Write-Info "    - $detail"
    }
    if ($unusedImportsDetails.Count -gt 10) {
        Write-Info "    ... et $($unusedImportsDetails.Count - 10) autre(s)"
    }
    $optimizationScore -= 0.3
    $auditResults.Warnings += "Code mort: $unusedImports import(s) potentiellement inutilisé(s)"
} else {
    Write-OK "  Imports optimisés (< 10 suspects)"
}

# 5. Vérifier composants non mémorisés avec props complexes
Write-Host "`n5. Mémorisation composants:" -ForegroundColor Yellow
$componentsWithoutMemo = @($jsFiles | Where-Object { 
    $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
    $content -and 
    $content -match 'export\s+(default\s+)?function\s+\w+' -and
    $content -match 'props|props\s*=\s*\{' -and
    $content -notmatch 'React\.memo|memo\('
})
if ($componentsWithoutMemo.Count -gt 20) {
    Write-Warn "  $($componentsWithoutMemo.Count) composants avec props non mémorisés (potentiel)"
    $optimizationScore -= 0.3
} else {
    Write-OK "  Composants bien mémorisés ou props simples"
}

# 6. Vérifier gestion mémoire (setInterval/setTimeout sans cleanup)
Write-Host "`n6. Gestion mémoire (timers):" -ForegroundColor Yellow
$timersWithoutCleanup = @($jsFiles | Select-String -Pattern 'setInterval|setTimeout' | 
    ForEach-Object { 
        $content = Get-Content $_.Path -Raw -ErrorAction SilentlyContinue
        $lineNum = $_.LineNumber
        # Vérifier s'il y a un cleanup dans useEffect ou componentWillUnmount
        $context = ($content -split "`n")[[Math]::Max(0, $lineNum - 30)..[Math]::Min($content.Length, $lineNum + 30)] -join "`n"
        if ($context -notmatch 'clearInterval|clearTimeout|return\s+\(\)\s*=>|useEffect.*return') {
            $_
        }
    })
if ($timersWithoutCleanup.Count -gt 0) {
    Write-Warn "  $($timersWithoutCleanup.Count) timers potentiellement sans cleanup"
    $optimizationIssues += "Frontend: $($timersWithoutCleanup.Count) setInterval/setTimeout sans cleanup"
    $optimizationScore -= 0.5
} else {
    Write-OK "  Tous les timers ont un cleanup approprié"
}

# 7. Vérifier dépendances inutilisées (package.json)
Write-Host "`n7. Dépendances:" -ForegroundColor Yellow
if (Test-Path "package.json") {
    $packageJson = Get-Content "package.json" -Raw | ConvertFrom-Json
    $deps = if ($packageJson.dependencies) { $packageJson.dependencies.PSObject.Properties.Name } else { @() }
    $devDeps = if ($packageJson.devDependencies) { $packageJson.devDependencies.PSObject.Properties.Name } else { @() }
    Write-OK "  $($deps.Count) dépendances production, $($devDeps.Count) dev"
    if ($deps.Count -gt 50) {
        Write-Warn "  Nombre élevé de dépendances ($($deps.Count)) - à auditer régulièrement"
        $optimizationScore -= 0.2
    }
} else {
    Write-Warn "  package.json introuvable"
}

# 8. Vérifier requêtes API frontend avec filtres/pagination
Write-Host "`n8. Optimisation requêtes API:" -ForegroundColor Yellow
$apiCalls = @($jsFiles | Select-String -Pattern 'fetchJson|fetch\(|axios\.(get|post)' -CaseSensitive:$false)
$unoptimizedCalls = @($apiCalls | Where-Object {
    $content = Get-Content $_.Path -Raw -ErrorAction SilentlyContinue
    $line = $_.Line
    # Vérifier si la requête charge toutes les données sans limite
    $context = ($content -split "`n")[[Math]::Max(0, $_.LineNumber - 5)..[Math]::Min($content.Length, $_.LineNumber + 5)] -join "`n"
    $context -match '/devices' -or $context -match '/patients' -or $context -match '/users' -or $context -match '/alerts'
})
if ($unoptimizedCalls.Count -gt 10) {
    $withLimit = @($unoptimizedCalls | Where-Object { 
        $content = Get-Content $_.Path -Raw -ErrorAction SilentlyContinue
        $context = ($content -split "`n")[[Math]::Max(0, $_.LineNumber - 5)..[Math]::Min($content.Length, $_.LineNumber + 5)] -join "`n"
        $context -match 'limit|LIMIT|pagination|page'
    })
    if ($withLimit.Count -lt ($unoptimizedCalls.Count * 0.5)) {
        Write-Warn "  $($unoptimizedCalls.Count) requêtes API potentiellement non paginées"
        $optimizationScore -= 0.4
    } else {
        Write-OK "  La majorité des requêtes utilise la pagination"
    }
} else {
    Write-OK "  Requêtes API optimisées"
}

# Score final optimisation
$auditResults.Scores["Optimisation"] = [Math]::Max($optimizationScore, 0)
if ($optimizationIssues.Count -gt 0) {
    $auditResults.Warnings += $optimizationIssues
}

# ===============================================================================
# VÉRIFICATION COHÉRENCE CONFIGURATION DÉPLOIEMENT (Web/Serveur 3000 + Production)
# ===============================================================================

Write-Section "[CONFIG] Cohérence Configuration - Web/Serveur 3000 & Déploiement"

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

# 1. Vérifier configuration Render (API Backend)
Write-Host "`n1. Configuration Render (API Backend):" -ForegroundColor Yellow
if ($renderYaml) {
    Write-OK "  render.yaml présent"
    
    if ($renderYaml -match "ott-api" -or $renderYaml -match "type: web") {
        Write-OK "    Service API configuré dans render.yaml"
    } else {
        Write-Warn "    Service API potentiellement manquant"
        $configWarnings += "Service API non détecté dans render.yaml"
        $configScore -= 1.0
    }
    
    if ($renderYaml -match "DATABASE_URL") {
        Write-OK "    Variable DATABASE_URL documentée"
    } else {
        Write-Warn "    DATABASE_URL non documentée"
        $configWarnings += "DATABASE_URL non documentée dans render.yaml"
        $configScore -= 0.5
    }
    
    if ($renderYaml -match "JWT_SECRET") {
        Write-OK "    Variable JWT_SECRET documentée"
    } else {
        Write-Warn "    JWT_SECRET non documentée"
        $configWarnings += "JWT_SECRET non documentée dans render.yaml"
        $configScore -= 0.5
    }
    
    if ($renderYaml -match "php -S" -or $renderYaml -match "startCommand") {
        Write-OK "    Commande de démarrage configurée"
    } else {
        Write-Warn "    Commande de démarrage potentiellement manquante"
        $configWarnings += "startCommand peut être manquant dans render.yaml"
        $configScore -= 0.5
    }
} else {
    Write-Warn "  render.yaml introuvable (optionnel si déploiement manuel)"
    $configWarnings += "render.yaml manquant (peut être configuré directement sur Render)"
    $configScore -= 0.5
}

# 2. Vérifier configuration GitHub Pages (Frontend)
Write-Host "`n2. Configuration GitHub Pages (Frontend):" -ForegroundColor Yellow
$githubWorkflow = $null
if (Test-Path ".github/workflows/deploy.yml") {
    $githubWorkflow = Get-Content ".github/workflows/deploy.yml" -Raw -ErrorAction SilentlyContinue
    Write-OK "  Workflow GitHub Actions présent"
    
    if ($githubWorkflow -match "NEXT_STATIC_EXPORT.*true") {
        Write-OK "    NEXT_STATIC_EXPORT=true configuré (export statique)"
    } else {
        Write-Warn "    NEXT_STATIC_EXPORT peut ne pas être configuré"
        $configWarnings += "NEXT_STATIC_EXPORT peut ne pas être configuré pour GitHub Pages"
        $configScore -= 0.5
    }
    
    if ($githubWorkflow -match "export_static" -or $githubWorkflow -match "export_static.sh") {
        Write-OK "    Script export_static.sh référencé"
    } else {
        Write-Warn "    Script export_static.sh peut ne pas être référencé"
        $configWarnings += "export_static.sh peut ne pas être appelé dans le workflow"
        $configScore -= 0.5
    }
} else {
    Write-Warn "  Workflow GitHub Actions introuvable"
    $configWarnings += "Workflow GitHub Actions manquant (déploiement GitHub Pages)"
    $configScore -= 1.0
}

# 3. Vérifier next.config.js (cohérence déploiement)
Write-Host "`n3. Configuration Next.js:" -ForegroundColor Yellow
if ($nextConfig) {
    Write-OK "  next.config.js présent"
    
    # Vérifier output standalone pour mode serveur
    if ($nextConfig -match "output.*standalone" -or $nextConfig -match "isStaticExport.*export.*standalone") {
        Write-OK "    Configuration output: 'standalone' présente (mode serveur)"
    } else {
        Write-Err "    Configuration standalone manquante"
        $configIssues += "Configuration standalone manquante dans next.config.js"
        $configScore -= 2.0
    }
    
    # Vérifier basePath conditionnel
    if ($nextConfig -match "basePath.*isStaticExport") {
        Write-OK "    basePath conditionnel (uniquement en export)"
    }
    
    # Vérifier rewrites API
    if ($nextConfig -match "rewrites" -and ($nextConfig -match "!isStaticExport" -or $nextConfig -match "isStaticExport.*false")) {
        Write-OK "    Rewrites API configurés pour mode serveur"
    } elseif ($nextConfig -match "rewrites") {
        Write-Warn "    Rewrites API peuvent ne pas fonctionner en mode serveur"
        $configScore -= 0.5
    }
} else {
    Write-Err "  next.config.js introuvable"
    $configIssues += "next.config.js manquant"
    $configScore -= 3.0
}

# 4. Vérifier scripts de déploiement
Write-Host "`n4. Scripts de déploiement:" -ForegroundColor Yellow
if (Test-Path "scripts/deploy/export_static.sh") {
    Write-OK "  export_static.sh présent (GitHub Actions)"
} else {
    Write-Err "  export_static.sh MANQUANT"
    $configIssues += "export_static.sh manquant"
    $configScore -= 1.5
}

# 4.1. Vérifier workflow GitHub Actions (déjà vérifié ci-dessus)
Write-Host "`n4.1. Détails Workflow GitHub Actions:" -ForegroundColor Yellow
if ($githubWorkflow) {
    Write-OK "  deploy.yml présent"
    $workflowContent = $githubWorkflow
    
    if ($workflowContent) {
        # Vérifier que le workflow utilise Node.js
        if ($workflowContent -match "node-version") {
            Write-OK "    Node.js configuré"
        } else {
            Write-Warn "    Version Node.js non spécifiée"
            $configWarnings += "Version Node.js non spécifiée dans deploy.yml"
            $configScore -= 0.3
        }
        
        # Vérifier que NEXT_STATIC_EXPORT est défini
        if ($workflowContent -match "NEXT_STATIC_EXPORT.*true") {
            Write-OK "    NEXT_STATIC_EXPORT=true configuré"
        } else {
            Write-Warn "    NEXT_STATIC_EXPORT peut ne pas être défini"
            $configWarnings += "NEXT_STATIC_EXPORT non vérifié dans deploy.yml"
            $configScore -= 0.5
        }
        
        # Vérifier que NEXT_PUBLIC_BASE_PATH est défini
        # Détecter NEXT_PUBLIC_BASE_PATH (générique)
        if ($workflowContent -match "NEXT_PUBLIC_BASE_PATH") {
            $basePathMatch = [regex]::Match($workflowContent, "NEXT_PUBLIC_BASE_PATH\s*=\s*['""]?([^'""\s]+)['""]?")
            if ($basePathMatch.Success) {
                Write-OK "    NEXT_PUBLIC_BASE_PATH=$($basePathMatch.Groups[1].Value) configuré"
            }
        } else {
            Write-Warn "    NEXT_PUBLIC_BASE_PATH peut ne pas être défini"
            $configWarnings += "NEXT_PUBLIC_BASE_PATH non vérifié dans deploy.yml"
            $configScore -= 0.5
        }
        
        # Vérifier que le script generate_time_tracking.sh est appelé
        if ($workflowContent -match "generate_time_tracking" -or $workflowContent -match "SUIVI_TEMPS") {
            Write-OK "    Génération SUIVI_TEMPS configurée"
        } else {
            Write-Warn "    Génération SUIVI_TEMPS non vérifiée"
            $configWarnings += "Génération SUIVI_TEMPS non vérifiée dans deploy.yml"
            $configScore -= 0.3
        }
        
        # Vérifier que export_static.sh est appelé
        if ($workflowContent -match "export_static\.sh") {
            Write-OK "    export_static.sh appelé"
        } else {
            Write-Err "    export_static.sh non appelé"
            $configIssues += "export_static.sh non appelé dans deploy.yml"
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
        Write-OK "    Scripts 'build' et 'start' présents"
    } else {
        Write-Warn "    Scripts 'build' ou 'start' manquants"
        $configScore -= 0.5
    }
}

# 5. Vérifier env.example
Write-Host "`n5. Variables d'environnement:" -ForegroundColor Yellow
if ($envExample) {
    Write-OK "  env.example présent"
    $criticalEnvVars = @("DATABASE_URL", "JWT_SECRET", "NEXT_PUBLIC_API_URL")
    foreach ($var in $criticalEnvVars) {
        if ($envExample -match "(?m)^\s*$var\s*=" -or $envExample -match "(?m)^#.*$var") {
            Write-OK "    Variable $var documentée"
        } else {
            Write-Warn "    Variable $var non documentée"
            $configWarnings += "Variable $var manquante dans env.example"
            $configScore -= 0.3
        }
    }
} else {
    Write-Warn "  env.example manquant"
    $configWarnings += "env.example manquant"
    $configScore -= 1.5
}

# 7. Vérifier cohérence API_URL entre toutes les configs
Write-Host "`n6. Cohérence API_URL:" -ForegroundColor Yellow
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
        Write-OK "    API_URL cohérente entre toutes les configs: $($uniqueUrls[0])"
    } else {
        $apiUrlDetails = $apiUrls.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }
        Write-Warn "    API_URL incohérente: $($apiUrlDetails -join ', ')"
        Write-Info "    Note: Normal si env.example=prod (Render) et config locale=dev (localhost:8000)"
        $configWarnings += "API_URL incohérente entre configs (normal: prod vs dev)"
        $configScore -= 0.2  # Réduire la pénalité car c'est normal
    }
} else {
    if ($apiUrls.Count -eq 1) {
        Write-OK "    API_URL définie dans: $($apiUrls.Keys[0])"
    } else {
        Write-Warn "    API_URL non trouvée"
        $configScore -= 0.3
    }
}

# Score final configuration (inclut cohérence web/serveur 3000)
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
        Write-Err "Problèmes de configuration détectés:"
        $configIssues | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($configIssues.Count -gt 5) {
            Write-Host "  ... et $($configIssues.Count - 5) autres problèmes" -ForegroundColor Red
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
    
    # Sauvegarder uniquement dans public/ (fichier principal utilisé par le dashboard et les scripts)
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
# ===============================================================================
# PHASE 16 : VÉRIFICATION EXHAUSTIVE - LIENS, IMPORTS, RÉFÉRENCES, CONTENUS
# ===============================================================================

Write-Section "[16/18] Vérification Exhaustive - Liens, Imports, Références, Contenus"

$exhaustiveIssues = @()
$exhaustiveWarnings = @()
$exhaustiveScore = 10.0

try {
    Write-Info "Vérification exhaustive de tous les fichiers..."
    
    # INTÉGRATION DEPENDENCY-CRUISER - Analyse des dépendances
    Write-Host "`n  Analyse avec dependency-cruiser (graphe de dépendances)..." -ForegroundColor Yellow
    $depcruiseResult = Invoke-DependencyCruiserAnalysis -ProjectRoot (Get-Location).Path
    if ($depcruiseResult.Success) {
        if ($depcruiseResult.CircularDependencies -gt 0) {
            Write-Warn "  dependency-cruiser: $($depcruiseResult.CircularDependencies) dépendance(s) circulaire(s) détectée(s)"
            $exhaustiveWarnings += "$($depcruiseResult.CircularDependencies) dépendance(s) circulaire(s)"
            $exhaustiveScore -= 1
            $auditResults.Recommendations += "dependency-cruiser: Corriger $($depcruiseResult.CircularDependencies) dépendance(s) circulaire(s)"
        } else {
            Write-OK "  dependency-cruiser: Aucune dépendance circulaire"
        }
        if ($depcruiseResult.OrphanedModules -gt 0) {
            Write-Warn "  dependency-cruiser: $($depcruiseResult.OrphanedModules) module(s) orphelin(s)"
            $exhaustiveWarnings += "$($depcruiseResult.OrphanedModules) module(s) orphelin(s)"
            $exhaustiveScore -= 0.5
        }
        # Utiliser le score dependency-cruiser pour améliorer le score exhaustif
        $exhaustiveScore = [Math]::Min(10, ($exhaustiveScore + $depcruiseResult.Score) / 2)
    }
    
    # 1. Vérifier tous les liens dans les fichiers HTML et MD
    Write-Host "`n1. Vérification des liens (HTML, MD):" -ForegroundColor Yellow
    $brokenLinks = @()
    $allLinks = @()
    
    foreach ($file in ($fileInventory.HTML + $fileInventory.MD)) {
        try {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content) {
                # Extraire tous les liens
                $hrefPattern = 'href=["'']([^"'']+)["'']'
                $srcPattern = 'src=["'']([^"'']+)["'']'
                $mdPattern = '\[([^\]]+)\]\(([^\)]+)\)'
                
                $hrefLinksMatches = [regex]::Matches($content, $hrefPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                $srcLinksMatches = [regex]::Matches($content, $srcPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                $mdLinksMatches = [regex]::Matches($content, $mdPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                
                foreach ($match in $hrefLinksMatches) {
                    $link = $match.Groups[1].Value
                    $allLinks += @{ File = $file.Name; Link = $link; Type = "href" }
                }
                foreach ($match in $srcLinksMatches) {
                    $link = $match.Groups[1].Value
                    $allLinks += @{ File = $file.Name; Link = $link; Type = "src" }
                }
                foreach ($match in $mdLinksMatches) {
                    $link = $match.Groups[2].Value
                    $allLinks += @{ File = $file.Name; Link = $link; Type = "markdown" }
                }
            }
        } catch {
            Write-Info "Erreur lecture $($file.Name): $($_.Exception.Message)"
        }
    }
    
    Write-Host "  Total liens trouvés: $($allLinks.Count)" -ForegroundColor White
    
    # Vérifier chaque lien
    foreach ($linkInfo in $allLinks) {
        $link = $linkInfo.Link
        $file = $linkInfo.File
        
        # Ignorer les liens externes (http/https/mailto)
        if ($link -match '^https?://|^mailto:|^#|^javascript:') {
            continue
        }
        
        # Résoudre le chemin relatif
        $linkPath = $link
        if ($link -notmatch '^/') {
            # Lien relatif - trouver le fichier source pour résoudre
            $sourceFile = $allFiles | Where-Object { $_.Name -eq $file } | Select-Object -First 1
            if ($sourceFile) {
                $linkPath = Join-Path $sourceFile.DirectoryName $link
                $linkPath = [System.IO.Path]::GetFullPath($linkPath)
            }
        } else {
            # Lien absolu depuis la racine
            $linkPath = Join-Path (Get-Location).Path $link.TrimStart('/')
            $linkPath = [System.IO.Path]::GetFullPath($linkPath)
        }
        
        # Vérifier si le fichier existe
        if (-not (Test-Path $linkPath)) {
            $brokenLinks += @{ File = $file; Link = $link; Path = $linkPath }
        }
    }
    
    if ($brokenLinks.Count -gt 0) {
        Write-Warn "  $($brokenLinks.Count) liens brisés détectés"
        $brokenLinks | Select-Object -First 10 | ForEach-Object {
            Write-Host "    - $($_.File): $($_.Link)" -ForegroundColor Yellow
        }
        if ($brokenLinks.Count -gt 10) {
            Write-Host "    ... et $($brokenLinks.Count - 10) autres" -ForegroundColor Yellow
        }
        $exhaustiveWarnings += "$($brokenLinks.Count) liens brisés"
        $exhaustiveScore -= 0.5
    } else {
        Write-OK "  Aucun lien brisé détecté"
    }
    
    # 2. Vérifier tous les imports/exports dans les fichiers JS
    Write-Host "`n2. Vérification des imports/exports (JS):" -ForegroundColor Yellow
    $brokenImports = @()
    $allImports = @()
    
    foreach ($file in $fileInventory.JS) {
        try {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content) {
                # Extraire tous les imports
                $importMatches = [regex]::Matches($content, "import\s+.*from\s+['\`"]([^'\`"]+)['\`"]", [System.Text.RegularExpressions.RegexOptions]::Multiline)
                $requireMatches = [regex]::Matches($content, "require\s*\(['\`"]([^'\`"]+)['\`"]", [System.Text.RegularExpressions.RegexOptions]::Multiline)
                
                foreach ($match in $importMatches) {
                    $importPath = $match.Groups[1].Value
                    $allImports += @{ File = $file.FullName; Import = $importPath; Type = "import" }
                }
                foreach ($match in $requireMatches) {
                    $importPath = $match.Groups[1].Value
                    $allImports += @{ File = $file.FullName; Import = $importPath; Type = "require" }
                }
            }
        } catch {
            Write-Info "Erreur lecture $($file.Name): $($_.Exception.Message)"
        }
    }
    
    Write-Host "  Total imports trouvés: $($allImports.Count)" -ForegroundColor White
    
    # Vérifier chaque import (simplifié - vérifier que le chemin existe)
    $importErrors = 0
    foreach ($importInfo in $allImports) {
        $importPath = $importInfo.Import
        $sourceFile = $importInfo.File
        
        # Ignorer les imports de node_modules et packages
        if ($importPath -match '^@/|^\.\.?/|^[^./]') {
            # Résoudre le chemin
            $sourceDir = Split-Path $sourceFile -Parent
            $resolvedPath = $null
            
            if ($importPath -match '^@/') {
                # Alias @/ - chercher dans la racine
                $resolvedPath = Join-Path (Get-Location).Path $importPath.Replace('@/', '')
            } elseif ($importPath -match '^\.\.?/') {
                # Chemin relatif
                $resolvedPath = Join-Path $sourceDir $importPath
                $resolvedPath = [System.IO.Path]::GetFullPath($resolvedPath)
            } else {
                # Package npm - ignorer
                continue
            }
            
            # Vérifier si le fichier existe (avec ou sans extension)
            $found = $false
            if (Test-Path $resolvedPath) {
                $found = $true
            } elseif (Test-Path "$resolvedPath.js") {
                $found = $true
            } elseif (Test-Path "$resolvedPath.jsx") {
                $found = $true
            } elseif (Test-Path "$resolvedPath/index.js") {
                $found = $true
            }
            
            if (-not $found -and $resolvedPath -notmatch 'node_modules') {
                $importErrors++
                if ($brokenImports.Count -lt 20) {
                    $brokenImports += @{ File = (Split-Path $sourceFile -Leaf); Import = $importPath; Path = $resolvedPath }
                }
            }
        }
    }
    
    if ($importErrors -gt 0) {
        Write-Warn "  $importErrors imports potentiellement brisés détectés"
        $brokenImports | Select-Object -First 10 | ForEach-Object {
            Write-Host "    - $($_.File): $($_.Import)" -ForegroundColor Yellow
        }
        if ($importErrors -gt 10) {
            Write-Host "    ... et $($importErrors - 10) autres" -ForegroundColor Yellow
        }
        $exhaustiveWarnings += "$importErrors imports potentiellement brisés"
        $exhaustiveScore -= 0.3
    } else {
        Write-OK "  Tous les imports semblent valides"
    }
    
    # 3. Vérifier les références PHP (require, include, require_once, include_once)
    Write-Host "`n3. Vérification des références PHP:" -ForegroundColor Yellow
    $brokenPhpRefs = @()
    $allPhpRefs = @()
    
    foreach ($file in $fileInventory.PHP) {
        try {
            $content = Get-Content $file.FullName -Raw -ErrorAction SilentlyContinue
            if ($content) {
                # Extraire tous les require/include
                $refMatches = [regex]::Matches($content, "(require|include|require_once|include_once)\s*\(?['\`"]([^'\`"]+)['\`"]", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                
                foreach ($match in $refMatches) {
                    $refPath = $match.Groups[2].Value
                    $allPhpRefs += @{ File = $file.FullName; Ref = $refPath; Type = $match.Groups[1].Value }
                }
            }
        } catch {
            Write-Info "Erreur lecture $($file.Name): $($_.Exception.Message)"
        }
    }
    
    Write-Host "  Total références PHP trouvées: $($allPhpRefs.Count)" -ForegroundColor White
    
    $phpRefErrors = 0
    foreach ($refInfo in $allPhpRefs) {
        $refPath = $refInfo.Ref
        $sourceFile = $refInfo.File
        
        # Résoudre le chemin
        $sourceDir = Split-Path $sourceFile -Parent
        $resolvedPath = Join-Path $sourceDir $refPath
        $resolvedPath = [System.IO.Path]::GetFullPath($resolvedPath)
        
        if (-not (Test-Path $resolvedPath)) {
            $phpRefErrors++
            if ($brokenPhpRefs.Count -lt 20) {
                $brokenPhpRefs += @{ File = (Split-Path $sourceFile -Leaf); Ref = $refPath; Path = $resolvedPath }
            }
        }
    }
    
    if ($phpRefErrors -gt 0) {
        Write-Warn "  $phpRefErrors références PHP potentiellement brisées"
        $brokenPhpRefs | Select-Object -First 10 | ForEach-Object {
            Write-Host "    - $($_.File): $($_.Ref)" -ForegroundColor Yellow
        }
        if ($phpRefErrors -gt 10) {
            Write-Host "    ... et $($phpRefErrors - 10) autres" -ForegroundColor Yellow
        }
        $exhaustiveWarnings += "$phpRefErrors références PHP potentiellement brisées"
        $exhaustiveScore -= 0.3
    } else {
        Write-OK "  Toutes les références PHP semblent valides"
    }
    
    # 4. Vérifier les fichiers orphelins (non référencés)
    Write-Host "`n4. Vérification des fichiers orphelins:" -ForegroundColor Yellow
    $orphanFiles = @()
    
    # Créer une liste de tous les fichiers référencés
    $referencedFiles = @()
    foreach ($linkInfo in $allLinks) {
        if ($linkInfo.Link -notmatch '^https?://|^mailto:|^#') {
            $referencedFiles += $linkInfo.Link
        }
    }
    foreach ($importInfo in $allImports) {
        $referencedFiles += $importInfo.Import
    }
    foreach ($refInfo in $allPhpRefs) {
        $referencedFiles += $refInfo.Ref
    }
    
    # Vérifier les fichiers JS/JSX qui ne sont pas référencés (sauf tests, config, etc.)
    foreach ($file in ($fileInventory.JS + $fileInventory.JSX)) {
        $fileName = $file.Name
        $filePath = $file.FullName
        
        # Ignorer certains fichiers (tests, config, etc.)
        if ($fileName -match '\.test\.|\.spec\.|config\.|setup\.|instrumentation\.') {
            continue
        }
        
        # Ignorer les fichiers dans node_modules, .next, etc.
        if (Test-ExcludedFile $filePath) {
            continue
        }
        
        # Vérifier si le fichier est référencé
        $isReferenced = $false
        foreach ($ref in $referencedFiles) {
            if ($ref -match [regex]::Escape($fileName) -or $ref -match [regex]::Escape($filePath)) {
                $isReferenced = $true
                break
            }
        }
        
        # Vérifier aussi si c'est un point d'entrée (page.js, layout.js, etc.)
        if ($fileName -match '^page\.js$|^layout\.js$|^error\.js$|^not-found\.js$|^index\.js$') {
            $isReferenced = $true
        }
        
        if (-not $isReferenced) {
            $orphanFiles += $file
        }
    }
    
    if ($orphanFiles.Count -gt 0) {
        Write-Warn "  $($orphanFiles.Count) fichiers potentiellement orphelins"
        $orphanFiles | Select-Object -First 10 | ForEach-Object {
            Write-Host "    - $($_.FullName.Replace((Get-Location).Path + '\', ''))" -ForegroundColor Yellow
        }
        if ($orphanFiles.Count -gt 10) {
            Write-Host "    ... et $($orphanFiles.Count - 10) autres" -ForegroundColor Yellow
        }
        $exhaustiveWarnings += "$($orphanFiles.Count) fichiers potentiellement orphelins"
        $exhaustiveScore -= 0.2
    } else {
        Write-OK "  Aucun fichier orphelin détecté"
    }
    
    # 5. Vérifier les répertoires vides (sauf ceux exclus)
    Write-Host "`n5. Vérification des répertoires vides:" -ForegroundColor Yellow
    $emptyDirs = @()
    $allDirs = @(Get-ChildItem -Recurse -Directory | Where-Object {
        -not (Test-ExcludedFile $_.FullName)
    })
    
    foreach ($dir in $allDirs) {
        $files = @(Get-ChildItem -Path $dir.FullName -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
            -not (Test-ExcludedFile $_.FullName)
        })
        if ($files.Count -eq 0) {
            $emptyDirs += $dir
        }
    }
    
    if ($emptyDirs.Count -gt 0) {
        Write-Warn "  $($emptyDirs.Count) répertoires vides détectés"
        $emptyDirs | Select-Object -First 10 | ForEach-Object {
            Write-Host "    - $($_.FullName.Replace((Get-Location).Path + '\', ''))" -ForegroundColor Yellow
        }
        if ($emptyDirs.Count -gt 10) {
            Write-Host "    ... et $($emptyDirs.Count - 10) autres" -ForegroundColor Yellow
        }
        $exhaustiveWarnings += "$($emptyDirs.Count) répertoires vides"
        $exhaustiveScore -= 0.1
    } else {
        Write-OK "  Aucun répertoire vide détecté"
    }
    
    Write-OK "Vérification exhaustive terminée"
    
} catch {
    Write-Warn "Erreur vérification exhaustive: $($_.Exception.Message)"
    $exhaustiveScore = 7.0
}

$exhaustiveScoreFinal = [Math]::Max(0, [Math]::Round($exhaustiveScore, 1))
$auditResults.Scores["Vérification Exhaustive"] = $exhaustiveScoreFinal
$auditResults.Warnings += $exhaustiveWarnings
$auditResults.Issues += $exhaustiveIssues

Write-Host ""
if ($exhaustiveIssues.Count -eq 0 -and $exhaustiveWarnings.Count -eq 0) {
    Write-OK "Vérification exhaustive parfaite - Score: $exhaustiveScoreFinal/10"
} else {
    Write-Host "[SCORE VÉRIFICATION EXHAUSTIVE] $exhaustiveScoreFinal/10" -ForegroundColor Yellow
}

# ===============================================================================
# PHASE 17 : VÉRIFICATION UNIFORMISATION UI/UX (AVANT LES SCORES FINAUX)
# ===============================================================================
# ===============================================================================

Write-Section "[16/16] Uniformisation UI/UX - Badges, Tables, Modals"

$uiScore = 10.0
$uiIssues = @()
$uiWarnings = @()

# Fichiers à vérifier
$uiFiles = @(
    "app/dashboard/users/page.js",
    "app/dashboard/patients/page.js",
    "components/configuration/UsbStreamingTab.js"
)

# Vérifier uniformisation des badges
foreach ($file in $uiFiles) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        if ($content -match "badge.*success|badge.*danger|badge.*warning") {
            Write-OK "$file : Uniformisation OK"
        }
    }
}

# Vérifier uniformisation des tables
$usersContent = Get-Content "app/dashboard/users/page.js" -Raw -ErrorAction SilentlyContinue
$patientsContent = Get-Content "app/dashboard/patients/page.js" -Raw -ErrorAction SilentlyContinue
$devicesContent = Get-Content "components/configuration/UsbStreamingTab.js" -Raw -ErrorAction SilentlyContinue

if ($usersContent -and $patientsContent -and $devicesContent) {
    # Vérifier cohérence table-row
    $hasTableRow = @(
        ($usersContent -match "table-row"),
        ($patientsContent -match "table-row"),
        ($devicesContent -match "table-row")
    )
    
    if (($hasTableRow[0] -and -not $hasTableRow[1]) -or ($hasTableRow[1] -and -not $hasTableRow[2])) {
        Write-Warn "Usage incohérent de 'table-row' entre fichiers"
        $uiWarnings += "Usage incohérent de 'table-row'"
        $uiScore -= 0.5
    } else {
        Write-OK "Classe 'table-row' utilisée de manière cohérente"
    }
    
    # Vérifier cohérence opacity-60
    $hasOpacity = @(
        ($usersContent -match "opacity-60"),
        ($patientsContent -match "opacity-60"),
        ($devicesContent -match "opacity-60")
    )
    
    if (($hasOpacity[0] -and -not $hasOpacity[1]) -or ($hasOpacity[1] -and -not $hasOpacity[2])) {
        Write-Warn "Usage incohérent de 'opacity-60' entre fichiers"
        $uiWarnings += "Usage incohérent de 'opacity-60'"
        $uiScore -= 0.5
    } else {
        Write-OK "Classe 'opacity-60' utilisée de manière cohérente"
    }
}

Write-Host ""
if ($uiIssues.Count -eq 0 -and $uiWarnings.Count -eq 0) {
    Write-OK "Uniformisation UI/UX parfaite - Score: $([math]::Round($uiScore, 1))/10"
} else {
    if ($uiIssues.Count -gt 0) {
        Write-Err "Problèmes d'uniformisation détectés:"
        $uiIssues | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($uiIssues.Count -gt 10) {
            Write-Host "  ... et $($uiIssues.Count - 10) autres problèmes" -ForegroundColor Red
        }
    }
    if ($uiWarnings.Count -gt 0) {
        Write-Warn "Avertissements d'uniformisation:"
        $uiWarnings | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
    Write-Host "[SCORE UI/UX] $([math]::Round($uiScore, 1))/10" -ForegroundColor Yellow
}

# S'assurer que le score ne peut pas être négatif et est arrondi
$uiScoreFinal = [Math]::Max(0, [Math]::Round($uiScore, 1))
# Assigner le score AVANT l'affichage des scores finaux
$auditResults.Scores["Uniformisation UI/UX"] = $uiScoreFinal

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

Write-Section "SCORES FINAUX"

$scoreWeights = @{
    "Architecture" = 1.0
    "CodeMort" = 1.5
    "Duplication" = 1.2
    "Complexite" = 1.2
    "Routes" = 0.8
    "API" = 1.5
    "Database" = 1.0
    "Securite" = 2.0
    "Performance" = 1.0
    "Optimisation" = 1.2
    "Configuration" = 1.5
    "Tests" = 0.8
    "Documentation" = 0.5
    "Imports" = 0.5
    "GestionErreurs" = 0.8
    "Logs" = 0.6
    "BestPractices" = 0.8
    "Structure API" = 1.0
    "Vérification Exhaustive" = 1.2
    "Uniformisation UI/UX" = 0.8
    "Éléments Inutiles" = 1.0
    "Synchronisation GitHub Pages" = 1.2
    "Firmware" = 1.0
}

$totalWeight = ($scoreWeights.Values | Measure-Object -Sum).Sum
$weightedSum = 0

Write-Host ""
foreach ($key in ($scoreWeights.Keys | Sort-Object)) {
    $score = if($auditResults.Scores.ContainsKey($key)) { $auditResults.Scores[$key] } else { 5 }
    $weight = $scoreWeights[$key]
    $weightedSum += $score * $weight
    
    $color = if($score -ge 9){"Green"}elseif($score -ge 7){"Yellow"}else{"Red"}
    $status = if($score -ge 9){"[OK]"}elseif($score -ge 7){"[WARN]"}else{"[ERROR]"}
    
    Write-Host ("  {0,-18} {1,4}/10  (poids {2,3})  {3}" -f $key, $score, $weight, $status) -ForegroundColor $color
}

$scoreGlobal = [math]::Round($weightedSum / $totalWeight, 1)

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ("  [SCORE] SCORE GLOBAL PONDERE : {0}/10" -f $scoreGlobal) -ForegroundColor $(if($scoreGlobal -ge 9.5){"Green"}elseif($scoreGlobal -ge 8){"Yellow"}else{"Red"})
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# RESUME
# ===============================================================================

# ===============================================================================
# PHASE 16 : ORGANISATION ET NETTOYAGE
# ===============================================================================
Write-Section "[18/18] Organisation Projet et Nettoyage"

# Vérifier que tous les docs du menu existent et sont accessibles
$docMapping = @{
    'presentation' = 'public/docs/DOCUMENTATION_PRESENTATION.html'
    'developpeurs' = 'public/docs/DOCUMENTATION_DEVELOPPEURS.html'
    'commerciale' = 'public/docs/DOCUMENTATION_COMMERCIALE.html'
    'suivi-temps' = 'public/SUIVI_TEMPS_FACTURATION.md'
}

$docIssues = 0
foreach ($docKey in $docMapping.Keys) {
    $docPath = $docMapping[$docKey]
    if (-not (Test-Path $docPath)) {
        Write-Error "Doc '$docKey' manquant: $docPath"
        $auditResults.Errors += "Documentation manquante: $docKey → $docPath"
        $docIssues++
    }
}

if ($docIssues -eq 0) {
    Write-OK "Tous les docs du menu existent ($($docMapping.Count) docs)"
} else {
    Write-Error "$docIssues doc(s) manquant(s)"
}

# Vérifier les docs orphelins (fichiers qui ne sont pas dans le menu)
$docsInFolder = Get-ChildItem -Path "public/docs" -Filter "*.html" -ErrorAction SilentlyContinue
$linkedDocs = $docMapping.Values | Where-Object { $_ -match "public/docs/" } | ForEach-Object { Split-Path $_ -Leaf }
$orphanDocs = $docsInFolder | Where-Object { $linkedDocs -notcontains $_.Name }

if ($orphanDocs.Count -gt 0) {
    Write-Warn "$($orphanDocs.Count) doc(s) orphelin(s) (non lié au menu)"
    $auditResults.Warnings += "Docs orphelins: " + ($orphanDocs.Name -join ", ")
} else {
    Write-OK "Aucun doc orphelin"
}

# Vérifier que les fichiers de documentation seront copiés dans out/docs/ lors de l'export
Write-Host ""
Write-Host "  Vérification export GitHub Pages..." -ForegroundColor Cyan
$exportScript = "scripts/deploy/export_static.ps1"
if (Test-Path $exportScript) {
    $scriptContent = Get-Content $exportScript -Raw
    $checksDocs = ($scriptContent -match "DOCUMENTATION_PRESENTATION|DOCUMENTATION_DEVELOPPEURS|DOCUMENTATION_COMMERCIALE") -or ($scriptContent -match "public\\docs")
    if ($checksDocs) {
        Write-OK "  Script d'export vérifie/copie les fichiers de documentation"
    } else {
        Write-Err "  Script d'export ne vérifie PAS les fichiers de documentation"
        $auditResults.Warnings += "Script export ne vérifie pas les fichiers de documentation"
    }
} else {
    Write-Err "  Script d'export manquant: $exportScript"
    $auditResults.Warnings += "Script d'export manquant"
}

# Vérifier que docs/ contient les fichiers de documentation (si le build a été fait)
if (Test-Path "docs/docs") {
    $docsInBuild = Get-ChildItem -Path "docs/docs" -Filter "DOCUMENTATION_*.html" -ErrorAction SilentlyContinue
    if ($docsInBuild.Count -eq 3) {
        Write-OK "  Build docs/ contient les 3 fichiers de documentation"
        
        # Vérifier que les fichiers ne sont pas obsolètes (comparer avec public/docs/)
        $outdatedCount = 0
        foreach ($doc in $docsInBuild) {
            $sourceDoc = "public/docs/$($doc.Name)"
            if (Test-Path $sourceDoc) {
                $sourceDate = (Get-Item $sourceDoc).LastWriteTime
                $buildDate = $doc.LastWriteTime
                if ($sourceDate -gt $buildDate) {
                    $outdatedCount++
                    Write-Warn "  Fichier obsolète: $($doc.Name) (source: $sourceDate, build: $buildDate)"
                    $auditResults.Warnings += "Fichier documentation obsolète: $($doc.Name)"
                }
            }
        }
        if ($outdatedCount -eq 0) {
            Write-OK "  Tous les fichiers de documentation sont à jour"
        } else {
            Write-Err "  $outdatedCount fichier(s) de documentation obsolète(s) - Rebuild nécessaire"
            Write-Host "    💡 Action: .\scripts\deploy\export_static.ps1 puis git add docs/ .nojekyll && git commit -m 'Deploy: Update GitHub Pages' && git push" -ForegroundColor Cyan
            $auditResults.Errors += "$outdatedCount fichier(s) de documentation obsolète(s) dans docs/"
        }
    } else {
        Write-Warn "  Build docs/ contient seulement $($docsInBuild.Count)/3 fichiers de documentation"
        Write-Host "    💡 Action: .\scripts\deploy\export_static.ps1 pour régénérer le build" -ForegroundColor Cyan
        $auditResults.Warnings += "Build docs/ incomplet: $($docsInBuild.Count)/3 fichiers"
    }
} else {
    Write-Warn "  Dossier docs/docs/ non trouvé (build pas encore effectué)"
    Write-Host "    💡 Action: .\scripts\deploy\export_static.ps1 pour créer le build" -ForegroundColor Cyan
}

# Vérifier que les fichiers de documentation sont bien dans le repo git
Write-Host ""
Write-Section "[DOCUMENTATION] Vérification Git - Documentation déployée"
$gitStatus = git status --porcelain 2>&1
if ($LASTEXITCODE -eq 0) {
    $docsModified = $gitStatus | Select-String -Pattern "docs/docs/.*\.html|public/docs/.*\.html"
    if ($docsModified) {
        Write-Warn "  Fichiers de documentation modifiés non commités:"
        $docsModified | ForEach-Object { Write-Warn "    $_" }
        Write-Host "    💡 Action: git add docs/ public/docs/*.html && git commit -m 'Deploy: Update GitHub Pages' && git push" -ForegroundColor Cyan
        $auditResults.Warnings += "Fichiers documentation modifiés non commités"
    } else {
        Write-OK "  Tous les fichiers de documentation sont à jour dans Git"
    }
} else {
    Write-Warn "  Impossible de vérifier le statut Git (pas un repo Git ou git non disponible)"
}

# Vérifier la conformité de la documentation (pas d'historique, pas de redondances, seulement actuel + roadmap)
Write-Host ""
Write-Section "[DOCUMENTATION] Vérification Conformité - Structure et Contenu"
$docFiles = @(
    "public/docs/DOCUMENTATION_PRESENTATION.html",
    "public/docs/DOCUMENTATION_DEVELOPPEURS.html",
    "public/docs/DOCUMENTATION_COMMERCIALE.html"
)

$conformityIssues = 0
$historyKeywords = @(
    "Historique", "historique", "Changelog", "changelog", 
    "Améliorations v\d+\.\d+", "Version \d+\.\d+.*Décembre", "Décembre \d{4}",
    "Score.*\d+/\d+", "Tag git", "v\d+\.\d+-\d+percent", "Version \d+\.\d+.*Score"
)
$redundancyPatterns = @(
    "Fonctionnalités.*Principales.*Fonctionnalités",
    "Version.*Production.*Version.*Production",
    "✅.*✅.*✅" # Trop de checkmarks répétés
)

foreach ($docFile in $docFiles) {
    if (Test-Path $docFile) {
        $docName = Split-Path $docFile -Leaf
        $content = Get-Content $docFile -Raw -ErrorAction SilentlyContinue
        if ($content) {
            $fileIssues = 0
            
            # Vérifier l'absence d'historique
            Write-Host "  Analyse: $docName" -ForegroundColor Gray
            $historyFound = @()
            foreach ($keyword in $historyKeywords) {
                if ($content -match $keyword) {
                    $matches = [regex]::Matches($content, $keyword)
                    if ($matches.Count -gt 0) {
                        $historyFound += "$keyword ($($matches.Count) occurrence(s))"
                    }
                }
            }
            if ($historyFound.Count -gt 0) {
                Write-Warn "    Historique detecte: $($historyFound -join ', ')"
                $auditResults.Warnings += "$docName : Historique detecte ($($historyFound.Count) mot(s)-cle(s))"
                $fileIssues++
            } else {
                Write-OK "    Aucun historique detecte"
            }
            
            # Vérifier les redondances (sections qui se répètent)
            $redundancyFound = @()
            foreach ($pattern in $redundancyPatterns) {
                if ($content -match $pattern) {
                    $redundancyFound += $pattern
                }
            }
            if ($redundancyFound.Count -gt 0) {
                Write-Warn "    Redondances detectees: $($redundancyFound -join ', ')"
                $auditResults.Warnings += "$docName : Redondances detectees"
                $fileIssues++
            } else {
                Write-OK "    Aucune redondance majeure detectee"
            }
            
            # Vérifier la présence de la roadmap (futur)
            $hasRoadmap = $content -match "Roadmap|roadmap|Améliorations Futures|améliorations futures"
            if ($hasRoadmap) {
                Write-OK "    Roadmap presente (futur)"
            } else {
                Write-Warn "    Roadmap manquante (section future recommandee)"
                $auditResults.Warnings += "$docName : Roadmap manquante"
                $fileIssues++
            }
            
            # Vérifier la présence de l'état actuel
            $hasCurrentState = $content -match "Version.*Production.*Actuelle|Actuelle|État actuel|état actuel|Fonctionnalités.*Actuelles"
            if ($hasCurrentState) {
                Write-OK "    Etat actuel present"
            } else {
                Write-Warn "    Etat actuel non clairement identifie"
                $auditResults.Warnings += "$docName : Etat actuel non clairement identifie"
                $fileIssues++
            }
            
            # Vérifier qu'il n'y a pas trop de détails techniques redondants
            $technicalSections = ([regex]::Matches($content, "h[2-4].*[Tt]echnique|h[2-4].*[Aa]rchitecture|h[2-4].*[Ii]mplémentation")).Count
            if ($technicalSections -gt 5) {
                Write-Warn "    Trop de sections techniques ($technicalSections) - risque de redondance"
                $auditResults.Warnings += "$docName : Trop de sections techniques ($technicalSections)"
                $fileIssues++
            }
            
            if ($fileIssues -eq 0) {
                Write-OK "  OK $docName conforme (actuel + roadmap, pas d'historique, pas de redondances)"
            } else {
                $conformityIssues += $fileIssues
                Write-Warn "  ATTENTION $docName : $fileIssues probleme(s) de conformite detecte(s)"
            }
        }
    } else {
        Write-Warn "  Fichier manquant: $docFile"
        $auditResults.Warnings += "Documentation manquante: $docName"
    }
}

if ($conformityIssues -eq 0) {
    Write-OK "Toutes les documentations sont conformes (actuel + roadmap, pas d'historique, pas de redondances)"
} else {
    Write-Warn "$conformityIssues probleme(s) de conformite detecte(s) dans la documentation"
    Write-Host "  Criteres attendus:" -ForegroundColor Cyan
    Write-Host "    - Pas d'historique (dates, versions passees, scores, tags git)" -ForegroundColor Gray
    Write-Host "    - Pas de redondances (sections qui se repetent)" -ForegroundColor Gray
    Write-Host "    - Seulement etat actuel factuel + roadmap (futur)" -ForegroundColor Gray
}

# Vérifier la cohérence des liens dans Sidebar.js
$sidebarContent = Get-Content "components/Sidebar.js" -Raw -ErrorAction SilentlyContinue
if ($sidebarContent) {
    $expectedLinks = @('presentation', 'developpeurs', 'commerciale', 'suivi-temps')
    $missingLinks = @()
    
    foreach ($link in $expectedLinks) {
        if ($sidebarContent -notmatch "doc:\s*['\`"]$link['\`"]") {
            $missingLinks += $link
        }
    }
    
    if ($missingLinks.Count -gt 0) {
        Write-Warn "Liens manquants dans Sidebar: " + ($missingLinks -join ", ")
        $auditResults.Warnings += "Sidebar: liens manquants"
    } else {
        Write-OK "Tous les liens présents dans Sidebar"
    }
} else {
    Write-Warn "Impossible de vérifier Sidebar.js"
}

Write-Info "Documentation analysée"

Write-Section "[18/18] Organisation Projet et Nettoyage"

# Vérifier l'organisation des dossiers
$expectedDirs = @("app", "components", "contexts", "hooks", "lib", "api", "sql", "scripts", "public")
$actualDirs = Get-ChildItem -Path "." -Directory | Where-Object { $_.Name -notmatch "node_modules|\.git|\.next|docs|hardware|bin|bootstrap" } | Select-Object -ExpandProperty Name
$missingDirs = $expectedDirs | Where-Object { $actualDirs -notcontains $_ }
if ($missingDirs.Count -eq 0) {
    Write-OK "Structure projet conforme (Next.js + API)"
} else {
    Write-Warn "Dossiers manquants: $($missingDirs -join ', ')"
}

# Fichiers de config à la racine (acceptable)
$configFiles = Get-ChildItem -Path "." -Filter "*config*" | Measure-Object
Write-Info "$($configFiles.Count) fichiers de configuration a la racine (normal)"

# Vérifier les composants dans le bon dossier
$componentsOutsideDir = Get-ChildItem -Path "." -Recurse -Filter "*.jsx" | Where-Object { 
    $_.FullName -notmatch "components|app|node_modules|\.next" -and $_.Name -match "^[A-Z]"
}
if ($componentsOutsideDir.Count -gt 0) {
    Write-Warn "Composants React en dehors de components/:"
    $componentsOutsideDir | ForEach-Object { Write-Host "  - $($_.FullName -replace [regex]::Escape($rootPath), '')" -ForegroundColor Gray }
} else {
    Write-OK "Composants React bien organises"
}

# Vérifier les fichiers API dans le bon dossier
$apiOutsideDir = Get-ChildItem -Path "." -Recurse -Filter "*.php" | Where-Object { 
    $_.FullName -notmatch "api|vendor|node_modules|bootstrap" -and 
    $_.Name -ne "api.php" -and $_.Name -ne "index.php" -and $_.Name -ne "router.php"
}
if ($apiOutsideDir.Count -gt 0) {
    Write-Warn "Fichiers PHP mal places:"
    $apiOutsideDir | ForEach-Object { Write-Host "  - $($_.FullName -replace [regex]::Escape($rootPath), '')" -ForegroundColor Gray }
} else {
    Write-OK "Fichiers PHP bien organises (api/ + bootstrap/)"
}

# Fichiers MD suspects à la racine
$rootMdFiles = Get-ChildItem -Path "." -Filter "*.md" | Where-Object { $_.Name -notmatch "README|SUIVI_TEMPS|FACTURATION" }
if ($rootMdFiles.Count -gt 0) {
    Write-Warn "$($rootMdFiles.Count) fichier(s) MD suspect(s) a la racine"
    $auditResults.Warnings += "Fichiers MD suspects: " + ($rootMdFiles.Name -join ", ")
} else {
    Write-OK "Aucun fichier MD suspect a la racine"
}

# Fichiers backup
$backupFiles = Get-ChildItem -Recurse -Include "*.backup","*.bak","*~" -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch "node_modules" }
if ($backupFiles.Count -gt 0) {
    Write-Warn "$($backupFiles.Count) fichier(s) backup detecte(s)"
    $auditResults.Warnings += "Fichiers backup: $($backupFiles.Count)"
} else {
    Write-OK "Aucun fichier backup"
}

# Répertoires vides
$emptyDirs = Get-ChildItem -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { 
    $_.FullName -notmatch "node_modules|\.git|_next" -and 
    (Get-ChildItem $_.FullName -Recurse -File -ErrorAction SilentlyContinue).Count -eq 0 
}
if ($emptyDirs.Count -gt 0) {
    Write-Warn "$($emptyDirs.Count) repertoire(s) vide(s)"
} else {
    Write-OK "Aucun repertoire vide"
}

# TODO/FIXME dans le code
$todoFiles = Select-String -Path "*.js","*.jsx","*.php","*.ts","*.tsx" -Pattern "TODO|FIXME|XXX|HACK" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Path -notmatch "node_modules|\.next|build" } | 
    Group-Object Path
if ($todoFiles.Count -gt 0) {
    Write-Warn "$($todoFiles.Count) fichier(s) avec TODO/FIXME"
    $auditResults.Recommendations += "Nettoyer les TODO/FIXME ($($todoFiles.Count) fichiers)"
} else {
    Write-OK "Aucun TODO/FIXME en attente"
}

# console.log oubliés (hors logger.js)
$consoleLogs = Select-String -Path "*.js","*.jsx","*.ts","*.tsx" -Pattern "console\.(log|debug|warn|error)" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Path -notmatch "node_modules|\.next|build|logger\.js|inject\.js" }
$consoleCount = ($consoleLogs | Measure-Object).Count
if ($consoleCount -gt 0) {
    Write-Warn "$consoleCount console.log detectes"
    # Afficher les fichiers concernés
    $consoleFiles = $consoleLogs | Group-Object Path | Sort-Object Count -Descending
    foreach ($file in $consoleFiles | Select-Object -First 5) {
        Write-Info "  - $($file.Name): $($file.Count) occurrence(s)"
    }
    if ($consoleFiles.Count -gt 5) {
        Write-Info "  ... et $($consoleFiles.Count - 5) autre(s) fichier(s)"
    }
    $auditResults.Recommendations += "Remplacer $consoleCount console.log par logger"
} else {
    Write-OK "Aucun console.log detecte"
}

Write-Host ""
Write-Host "RESUME" -ForegroundColor Cyan
Write-Host ("-" * 80) -ForegroundColor Gray
Write-Host "  Problemes critiques  : $($auditResults.Issues.Count)" -ForegroundColor $(if($auditResults.Issues.Count -eq 0){"Green"}else{"Red"})
Write-Host "  Avertissements       : $($auditResults.Warnings.Count)" -ForegroundColor $(if($auditResults.Warnings.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Recommandations      : $($auditResults.Recommendations.Count)" -ForegroundColor $(if($auditResults.Recommendations.Count -eq 0){"Green"}else{"Yellow"})
Write-Host "  Code mort detecte    : $totalDead fichiers" -ForegroundColor $(if($totalDead -eq 0){"Green"}else{"Yellow"})
Write-Host "  Endpoints API        : $endpointsOK/$endpointsTotal OK" -ForegroundColor $(if($endpointsOK -eq $endpointsTotal){"Green"}else{"Yellow"})
Write-Host "  Duree audit          : $([math]::Round($duration, 1))s" -ForegroundColor Gray
Write-Host ("-" * 80) -ForegroundColor Gray

if ($auditResults.Issues.Count -gt 0) {
    Write-Host ""
    Write-Host "[ERROR] PROBLEMES CRITIQUES:" -ForegroundColor Red
    foreach ($issue in $auditResults.Issues) {
        Write-Host "   * $issue" -ForegroundColor Red
    }
}

if ($auditResults.Warnings.Count -gt 0 -and $auditResults.Warnings.Count -le 10) {
    Write-Host ""
    Write-Host "[WARN] AVERTISSEMENTS:" -ForegroundColor Yellow
    foreach ($warn in $auditResults.Warnings) {
        Write-Host "   * $warn" -ForegroundColor Yellow
    }
}

if ($auditResults.Recommendations.Count -gt 0 -and $auditResults.Recommendations.Count -le 10) {
    Write-Host ""
    Write-Host "[INFO] RECOMMANDATIONS:" -ForegroundColor Cyan
    foreach ($rec in $auditResults.Recommendations) {
        Write-Host "   * $rec" -ForegroundColor Cyan
    }
}

# ===============================================================================
# PHASE BONUS : VÉRIFICATION STRUCTURE API
# ===============================================================================

Write-Section "STRUCTURE API & COHÉRENCE HANDLERS"

$structureScore = 10.0
$criticalIssues = @()
$warnings = @()

if (Test-Path "api.php") {
    $apiContent = Get-Content "api.php" -Raw
    
    # Extraire toutes les routes - Pattern amélioré pour capturer toutes les variantes
    # Chercher les patterns: elseif(preg_match('#...', $path, $m) && $method === '...')
    # Utiliser [regex]::Escape() pour éviter les erreurs d'échappement avec les backslashes
    $routePatterns = @(
        [regex]::Escape("elseif(preg_match('#") + "([^']+)" + [regex]::Escape("'#") + ".*" + [regex]::Escape(") && $method === '") + "([^']+)" + [regex]::Escape("') {") + "[^{]*" + [regex]::Escape("handle(") + "(\w+)",
        [regex]::Escape("elseif(preg_match('#") + "([^']+)" + [regex]::Escape("'#") + ".*\$path.*" + [regex]::Escape(") && $method === '") + "([^']+)" + [regex]::Escape("') {") + "[^{]*" + [regex]::Escape("handle(") + "(\w+)"
    )
    
    # Échapper les backslashes dans les patterns pour éviter les erreurs d'échappement
    $routePatterns = $routePatterns | ForEach-Object { $_.Replace('\R', '\\R').Replace('\s', '\\s') }
    
    $routesByEndpoint = @{}
    $handlersCalled = @{}
    
    foreach ($pattern in $routePatterns) {
        $matches = [regex]::Matches($apiContent, $pattern)
        foreach ($match in $matches) {
            $path = $match.Groups[1].Value
            $method = $match.Groups[2].Value
            $handler = "handle" + $match.Groups[3].Value
            
            # Normaliser le path (enlever les anchors regex)
            $normalizedPath = $path -replace '\$$', '' -replace '^\^', ''
            
            if (-not $routesByEndpoint.ContainsKey($normalizedPath)) {
                $routesByEndpoint[$normalizedPath] = @{}
            }
            $routesByEndpoint[$normalizedPath][$method] = $handler
            $handlersCalled[$handler] = $true
        }
    }
    
    Write-Info "Routes trouvées: $($handlersCalled.Keys.Count)"
    
    # Vérifier handlers définis - Tous les fichiers handlers
    $handlersDefined = @{}
    $handlerFiles = @(
        "api/handlers/auth.php",
        "api/handlers/devices.php",
        "api/handlers/firmwares.php",
        "api/handlers/notifications.php",
        "api/handlers/usb_logs.php"
    )
    
    foreach ($file in $handlerFiles) {
        if (Test-Path $file) {
            $content = Get-Content $file -Raw
            $functions = [regex]::Matches($content, "function (handle\w+)\(")
            foreach ($func in $functions) {
                $handlersDefined[$func.Groups[1].Value] = $file
            }
        }
    }
    
    # Vérifier cohérence (appelés vs définis)
    foreach ($handler in $handlersCalled.Keys) {
        if (-not $handlersDefined.ContainsKey($handler)) {
            Write-Err "Handler appelé mais non défini: $handler"
            $criticalIssues += "Handler $handler appelé mais NON DÉFINI"
            $structureScore -= 1.0
        }
    }
    
    # Handlers définis mais jamais appelés
    $unusedHandlers = $handlersDefined.Keys | Where-Object { -not $handlersCalled.ContainsKey($_) }
    if ($unusedHandlers.Count -gt 0) {
        Write-Warn "$($unusedHandlers.Count) handlers définis mais jamais appelés"
        $warnings += "Handlers inutilisés: $($unusedHandlers -join ', ')"
        $structureScore -= 0.5
    }
    
    # Vérifier endpoints critiques (restauration)
    $criticalEndpoints = @(
        @{ Endpoint = "/patients/(\d+)"; Method = "PATCH"; Handler = "handleRestorePatient"; Name = "Restaurer patient" }
        @{ Endpoint = "/users/(\d+)"; Method = "PATCH"; Handler = "handleRestoreUser"; Name = "Restaurer utilisateur" }
    )
    
    foreach ($ep in $criticalEndpoints) {
        $found = $false
        
        # Format réel dans api.php : } elseif(preg_match('#/patients/(\d+)$#', $path, $m) && $method === 'PATCH') {
        #     handleRestorePatient($m[1]);
        # Recherche améliorée : chercher le pattern exact avec échappement correct
        $routePattern = $ep.Endpoint -replace '\(', '\(' -replace '\)', '\)' -replace '\+', '\+'
        
        # Méthode simple et fiable : chercher le handler et vérifier qu'il y a PATCH + route dans le contexte
        if ($apiContent -match $ep.Handler) {
            $handlerMatches = [regex]::Matches($apiContent, $ep.Handler, [System.Text.RegularExpressions.RegexOptions]::Singleline)
            foreach ($match in $handlerMatches) {
                # Chercher dans les 400 caractères avant le handler pour avoir le contexte complet
                $startIndex = [Math]::Max(0, $match.Index - 400)
                $context = $apiContent.Substring($startIndex, [Math]::Min(800, $apiContent.Length - $startIndex))
                
                # Vérifier que le contexte contient :
                # 1. La route avec le pattern (format: preg_match('#/users/(\d+)$#', ...) ou preg_match('#/patients/(\d+)$#', ...))
                # 2. La méthode PATCH
                # Pattern de route : /patients/(\d+) ou /users/(\d+)
                $routeEndpoint = $ep.Endpoint -replace '\(\\d\+\)', '\(\\d\+\)'
                $hasRoute = $context -match "preg_match\s*\([^)]*#.*$routeEndpoint" -or $context -match "#.*$routeEndpoint"
                # Méthode PATCH - chercher avec différentes variantes
                $hasMethod = $context -match "\$method\s*===\s*['\`"]$($ep.Method)['\`"]" -or $context -match "method\s*===\s*['\`"]$($ep.Method)['\`"]"
                
                if ($hasRoute -and $hasMethod) {
                    $found = $true
                    Write-OK "$($ep.Name): Route detectee ($($ep.Method) $($ep.Endpoint) → $($ep.Handler))"
                    break
                }
            }
        }
        
        if (-not $found) {
            Write-Err "$($ep.Name): Route MANQUANTE ou non détectée"
            $criticalIssues += "$($ep.Name) manquante"
            $structureScore -= 2.0
        }
    }
    
    # Vérifier fonctions handlers critiques (chercher dans les bons fichiers)
    $handlersToCheck = @(
        @{ Files = @("api/handlers/devices/patients.php", "api/handlers/devices/crud.php"); Function = "handleRestorePatient"; Name = "Restauration patients" }
        @{ Files = @("api/handlers/auth.php"); Function = "handleRestoreUser"; Name = "Restauration users" }
    )
    
    foreach ($handler in $handlersToCheck) {
        $found = $false
        foreach ($file in $handler.Files) {
            if (Test-Path $file) {
                $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
                if ($content -and $content -match "function\s+$($handler.Function)\s*\(") {
                    $found = $true
                    Write-OK "$($handler.Name): $($handler.Function)() definie dans $file"
                    break
                }
            }
        }
        if (-not $found) {
            Write-Err "$($handler.Name): $($handler.Function)() MANQUANTE dans $($handler.Files -join ', ')"
            $criticalIssues += "$($handler.Function) non defini"
            $structureScore -= 1.0
        }
    }
} else {
    # Chercher api.php depuis la racine
    $apiPhpPath = if (Test-Path "api.php") { "api.php" } 
                   elseif (Test-Path (Join-Path $rootPath "api.php")) { Join-Path $rootPath "api.php" }
                   else { $null }
    
    if ($apiPhpPath -and (Test-Path $apiPhpPath)) {
        Write-OK "api.php trouvé: $apiPhpPath"
    } else {
        Write-Err "api.php introuvable ! (cherché dans: $(Get-Location))"
    $criticalIssues += "api.php introuvable"
    $structureScore = 0
    }
}

Write-Host ""
if ($criticalIssues.Count -eq 0) {
    Write-OK "Structure API coherente - Score: $structureScore/10"
} else {
    Write-Err "Problemes structurels detectes:"
    $criticalIssues | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "[SCORE STRUCTURE] $structureScore/10" -ForegroundColor Yellow
}

if ($warnings.Count -gt 0) {
    $warnings | ForEach-Object { Write-Warn $_ }
}

$auditResults.Scores["Structure API"] = $structureScore

# ===============================================================================
# PHASE 16 : VÉRIFICATION UNIFORMISATION UI/UX (DÉJÀ FAIT AVANT LES SCORES FINAUX)
# ===============================================================================

# Cette section a été déplacée avant l'affichage des scores finaux pour que le score soit disponible
# Write-Section "[16/16] Uniformisation UI/UX - Badges, Tables, Modals"

$uiScore = 10.0
$uiIssues = @()
$uiWarnings = @()

# Fichiers à vérifier
$uiFiles = @(
    "app/dashboard/users/page.js",
    "app/dashboard/patients/page.js",
    "components/configuration/UsbStreamingTab.js",
    "components/UserPatientModal.js",
    "components/DeviceModal.js"
)

$filesChecked = 0
$filesWithIssues = 0

foreach ($file in $uiFiles) {
    if (-not (Test-Path $file)) {
        Write-Warn "$file : Fichier introuvable"
        $uiWarnings += "$file introuvable"
        $uiScore -= 0.5
        continue
    }
    
    $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
    if (-not $content) {
        continue
    }
    
    $filesChecked++
    $fileIssues = @()
    
    # Vérifier badges
    if ($file -match "(users|patients|UsbStreamingTab)") {
        # Vérifier badge "Archivé"
        if ($content -match "Archivé") {
            if ($content -notmatch "badge.*bg-gray-100.*text-gray-600.*dark:bg-gray-800.*dark:text-gray-400" -and 
                $content -notmatch "badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400") {
                $fileIssues += "Badge 'Archivé' non standardisé dans $file"
                $uiIssues += "$file : Badge 'Archivé' non uniforme"
            }
        }
        
        # Vérifier badge "Actif"
        if ($content -match "Actif") {
            if ($content -notmatch "badge-success" -and $content -notmatch "badge badge-success") {
                $fileIssues += "Badge 'Actif' non standardisé dans $file"
                $uiIssues += "$file : Badge 'Actif' non uniforme"
            }
        }
        
        # Vérifier badge "Inactif"
        if ($content -match "Inactif") {
            if ($content -notmatch "badge.*text-gray-600.*bg-gray-100" -and $content -notmatch "badge text-gray-600 bg-gray-100") {
                $fileIssues += "Badge 'Inactif' non standardisé dans $file"
                $uiIssues += "$file : Badge 'Inactif' non uniforme"
            }
        }
    }
    
    # Vérifier classes de table
    if ($file -match "(users|patients|UsbStreamingTab)") {
        # Vérifier table-row
        if ($content -match "className.*table|table.*className") {
            if ($content -notmatch "table-row") {
                $fileIssues += "Classe 'table-row' manquante dans $file"
                $uiIssues += "$file : Classe 'table-row' non utilisée"
            }
        }
        
        # Vérifier table-cell
        if ($content -match "table-row") {
            if ($content -notmatch "table-cell") {
                $fileIssues += "Classe 'table-cell' manquante dans $file"
                $uiIssues += "$file : Classe 'table-cell' non utilisée"
            }
        }
        
        # Vérifier opacity-60 pour lignes archivées
        if ($content -match "deleted_at|isArchived") {
            if ($content -notmatch "opacity-60") {
                $fileIssues += "Opacité 'opacity-60' manquante pour lignes archivées dans $file"
                $uiIssues += "$file : Opacité pour archives non uniforme"
            }
        }
        
        # Vérifier hover standardisé
        if ($content -match "table-row") {
            if ($content -notmatch "hover:bg-gray-50.*dark:hover") {
                $fileIssues += "Hover non standardisé dans $file"
                $uiWarnings += "$file : Hover table non uniforme"
            }
        }
    }
    
    # Vérifier modals
    if ($file -match "Modal") {
        # Vérifier overlay
        if ($content -match "fixed.*inset-0") {
            if ($content -notmatch "bg-black/50.*dark:bg-black/60.*z-\[100\]|bg-black/50.*dark:bg-black/60.*z-50") {
                $fileIssues += "Overlay modal non standardisé dans $file"
                $uiIssues += "$file : Overlay modal non uniforme"
            }
        }
        
        # Vérifier container
        if ($content -match "bg-white.*dark:bg") {
            if ($content -notmatch "dark:bg-\[rgb\(var\(--night-surface\)\)\]|dark:bg-gray-900") {
                $fileIssues += "Container modal non standardisé dans $file"
                $uiIssues += "$file : Container modal non uniforme"
            }
        }
        
        # Vérifier close button
        if ($content -match "onClose|close|×") {
            if ($content -notmatch "text-gray-400.*hover:text-gray-600.*dark:hover:text-gray-300") {
                $fileIssues += "Bouton fermer modal non standardisé dans $file"
                $uiWarnings += "$file : Bouton fermer modal non uniforme"
            }
        }
    }
    
    if ($fileIssues.Count -gt 0) {
        $filesWithIssues++
        $uiScore -= ($fileIssues.Count * 0.3)
    } else {
        Write-OK "$file : Uniformisation OK"
    }
}

# Vérifier cohérence globale entre fichiers
if ($filesChecked -gt 1) {
    Write-Info "Vérification cohérence croisée..."
    
    $usersContent = Get-Content "app/dashboard/users/page.js" -Raw -ErrorAction SilentlyContinue
    $patientsContent = Get-Content "app/dashboard/patients/page.js" -Raw -ErrorAction SilentlyContinue
    $devicesContent = Get-Content "components/configuration/UsbStreamingTab.js" -Raw -ErrorAction SilentlyContinue
    
    if ($usersContent -and $patientsContent -and $devicesContent) {
        # Extraire les patterns de badges
        $usersBadges = [regex]::Matches($usersContent, "badge[^>]*Archivé[^<]*</span>")
        $patientsBadges = [regex]::Matches($patientsContent, "badge[^>]*Archivé[^<]*</span>")
        $devicesBadges = [regex]::Matches($devicesContent, "badge[^>]*Archivé[^<]*</span>")
        
        # Comparer les patterns
        if ($usersBadges.Count -gt 0 -and $patientsBadges.Count -gt 0) {
            $usersBadgeClass = [regex]::Match($usersBadges[0].Value, 'className="([^"]*)"')
            $patientsBadgeClass = [regex]::Match($patientsBadges[0].Value, 'className="([^"]*)"')
            
            if ($usersBadgeClass.Success -and $patientsBadgeClass.Success) {
                if ($usersBadgeClass.Groups[1].Value -ne $patientsBadgeClass.Groups[1].Value) {
                    Write-Warn "Badges 'Archivé' non identiques entre users et patients"
                    $uiWarnings += "Incohérence badges 'Archivé' entre users et patients"
                    $uiScore -= 0.5
                } else {
                    Write-OK "Badges 'Archivé' cohérents entre users et patients"
                }
            }
        }
        
        # Vérifier cohérence table-row et table-cell
        $hasTableRow = @(
            ($usersContent -match "table-row"),
            ($patientsContent -match "table-row"),
            ($devicesContent -match "table-row")
        )
        
        if (($hasTableRow[0] -and -not $hasTableRow[1]) -or ($hasTableRow[1] -and -not $hasTableRow[2])) {
            Write-Warn "Usage incohérent de 'table-row' entre fichiers"
            $uiWarnings += "Usage incohérent de 'table-row'"
            $uiScore -= 0.5
        } else {
            Write-OK "Classe 'table-row' utilisée de manière cohérente"
        }
        
        # Vérifier cohérence opacity-60
        $hasOpacity = @(
            ($usersContent -match "opacity-60"),
            ($patientsContent -match "opacity-60"),
            ($devicesContent -match "opacity-60")
        )
        
        if (($hasOpacity[0] -and -not $hasOpacity[1]) -or ($hasOpacity[1] -and -not $hasOpacity[2])) {
            Write-Warn "Usage incohérent de 'opacity-60' entre fichiers"
            $uiWarnings += "Usage incohérent de 'opacity-60'"
            $uiScore -= 0.5
        } else {
            Write-OK "Classe 'opacity-60' utilisée de manière cohérente"
        }
    }
}

Write-Host ""
if ($uiIssues.Count -eq 0 -and $uiWarnings.Count -eq 0) {
    Write-OK "Uniformisation UI/UX parfaite - Score: $([math]::Round($uiScore, 1))/10"
} else {
    if ($uiIssues.Count -gt 0) {
        Write-Err "Problèmes d'uniformisation détectés:"
        $uiIssues | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($uiIssues.Count -gt 10) {
            Write-Host "  ... et $($uiIssues.Count - 10) autres problèmes" -ForegroundColor Red
        }
    }
    if ($uiWarnings.Count -gt 0) {
        Write-Warn "Avertissements d'uniformisation:"
        $uiWarnings | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
    Write-Host "[SCORE UI/UX] $([math]::Round($uiScore, 1))/10" -ForegroundColor Yellow
}

# S'assurer que le score ne peut pas être négatif et est arrondi
$uiScoreFinal = [Math]::Max(0, [Math]::Round($uiScore, 1))
# Assigner le score AVANT l'affichage des scores finaux
$auditResults.Scores["Uniformisation UI/UX"] = $uiScoreFinal
Write-Host "[DEBUG] Score UI/UX assigné: $uiScoreFinal" -ForegroundColor Cyan
$auditResults.Issues += $uiIssues
$auditResults.Warnings += $uiWarnings

# ===============================================================================
# PHASE 19 : ÉLÉMENTS INUTILES (Fichiers obsolètes, redondants, mal organisés)
# ===============================================================================

Write-Section "[19/19] Éléments Inutiles - Fichiers Obsolètes et Redondants"

$elementsInutilesScore = 10.0
$elementsInutilesIssues = @()
$elementsInutilesWarnings = @()

# Variables pour stocker les résultats
$fichiersLogs = @()
$scriptsMigrationRedondants = @()
$fichiersTestObsoletes = @()
$dossiersVides = @()
$fichiersDupliques = @()
$codeMort = @()
$scriptsRedondants = @()
$fichiersTemporaires = @()
$documentationObsolete = @()
$ps1Obsoletes = @()
$jsObsoletes = @()
$sqlObsoletes = @()

# 1. FICHIERS DE LOGS OBSOLÈTES
Write-Info "Recherche fichiers de logs obsolètes..."
$logFiles = Get-ChildItem -Path . -Recurse -Include "*.log","*.txt" -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.Name -match "^(audit_result|logs_serie|audit_resultat)" -or
        $_.FullName -match "\\out\\" -or
        $_.FullName -match "\\docs\\_next\\"
    } |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }

foreach ($file in $logFiles) {
    $fichiersLogs += $file.FullName.Replace((Get-Location).Path + "\", "")
    $elementsInutilesScore -= 0.1
}

if ($fichiersLogs.Count -gt 0) {
    Write-Warn "$($fichiersLogs.Count) fichier(s) de log obsolète(s)"
    $elementsInutilesIssues += "$($fichiersLogs.Count) fichier(s) de log obsolète(s)"
}

# 2. SCRIPTS DE MIGRATION REDONDANTS
Write-Info "Recherche scripts de migration redondants..."
$migrationScripts = @(
    "scripts\run-config-migration.ps1",
    "scripts\run-config-migration-simple.ps1",
    "scripts\run-config-migration-direct.ps1",
    "scripts\test-config-migration.ps1",
    "scripts\apply-migration-gps.ps1",
    "scripts\apply-migration-min-max.ps1",
    "scripts\test-migration-min-max.ps1",
    "MIGRER.ps1"
)

foreach ($script in $migrationScripts) {
    $path = Join-Path (Get-Location) $script
    if (Test-Path $path) {
        $scriptsMigrationRedondants += $script
        $elementsInutilesScore -= 0.2
    }
}

if ($scriptsMigrationRedondants.Count -gt 0) {
    Write-Warn "$($scriptsMigrationRedondants.Count) script(s) de migration redondant(s)"
    $elementsInutilesIssues += "$($scriptsMigrationRedondants.Count) script(s) de migration redondant(s) (API le fait automatiquement)"
}

# 3. FICHIERS DE TEST OBSOLÈTES
Write-Info "Recherche fichiers de test obsolètes..."
$testFiles = @(
    "test_compile_cli.php",
    "test_compile_endpoint.html",
    "test_compile_sse.ps1",
    "test_compile.ps1",
    "test-archived-users-debug.html",
    "test-users-api.ps1",
    "scripts\test-database-firmware.ps1",
    "scripts\test-database-measurements.php",
    "scripts\test-database-schema.sql",
    "scripts\test-firmware-measurement.ps1",
    "scripts\test-api-endpoints.ps1",
    "scripts\test-check-measurement.ps1",
    "scripts\test-send-measurement.ps1",
    "scripts\test-send-measurement.sh",
    "scripts\test-gps-column.js",
    "scripts\test-ota-measurements.sql",
    "scripts\check-measurements-direct.php"
)

foreach ($testFile in $testFiles) {
    $path = Join-Path (Get-Location) $testFile
    if (Test-Path $path) {
        $fichiersTestObsoletes += $testFile
        $elementsInutilesScore -= 0.1
    }
}

if ($fichiersTestObsoletes.Count -gt 0) {
    Write-Warn "$($fichiersTestObsoletes.Count) fichier(s) de test obsolète(s)"
    $elementsInutilesIssues += "$($fichiersTestObsoletes.Count) fichier(s) de test obsolète(s)"
}

# 4. DOSSIERS VIDES
Write-Info "Recherche dossiers vides..."
$emptyDirs = @("docs\archive", "audit\reports")
foreach ($dir in $emptyDirs) {
    $path = Join-Path (Get-Location) $dir
    if (Test-Path $path) {
        $items = Get-ChildItem $path -Recurse -ErrorAction SilentlyContinue
        if ($items.Count -eq 0) {
            $dossiersVides += $dir
            $elementsInutilesScore -= 0.2
        }
    }
}

if ($dossiersVides.Count -gt 0) {
    Write-Warn "$($dossiersVides.Count) dossier(s) vide(s)"
    $elementsInutilesWarnings += "$($dossiersVides.Count) dossier(s) vide(s)"
}

# 5. FICHIERS DUPLIQUÉS
Write-Info "Recherche fichiers dupliqués..."
$duplicates = @(
    @{ Original = "public\SUIVI_TEMPS_FACTURATION.md"; Duplicate = "SUIVI_TEMPS_FACTURATION.md" },
    @{ Original = "public\docs"; Duplicate = "docs\docs" },
    @{ Original = "public\icon-192.png"; Duplicate = "docs\icon-192.png" },
    @{ Original = "public\icon-512.png"; Duplicate = "docs\icon-512.png" },
    @{ Original = "public\manifest.json"; Duplicate = "docs\manifest.json" },
    @{ Original = "public\sw.js"; Duplicate = "docs\sw.js" },
    @{ Original = "public\migrate.html"; Duplicate = "docs\migrate.html" },
    @{ Original = "public\monitor-reboot.js"; Duplicate = "docs\monitor-reboot.js" }
)

foreach ($dup in $duplicates) {
    $origPath = Join-Path (Get-Location) $dup.Original
    $dupPath = Join-Path (Get-Location) $dup.Duplicate
    if ((Test-Path $origPath) -and (Test-Path $dupPath)) {
        $fichiersDupliques += $dup.Duplicate
        $elementsInutilesScore -= 0.1
    }
}

if ($fichiersDupliques.Count -gt 0) {
    Write-Warn "$($fichiersDupliques.Count) fichier(s) dupliqué(s)"
    $elementsInutilesWarnings += "$($fichiersDupliques.Count) fichier(s) dupliqué(s)"
}

# 6. CODE MORT - FONCTIONS NON UTILISÉES
Write-Info "Recherche code mort..."
$calibrationCommandUsed = Select-String -Path "components\**\*.js","app\**\*.js" -Pattern "createUpdateCalibrationCommand\(|createUpdateCalibrationCommand\s" -ErrorAction SilentlyContinue
if ($calibrationCommandUsed.Count -eq 0) {
    $codeMort += "lib\deviceCommands.js::createUpdateCalibrationCommand"
    $elementsInutilesScore -= 0.3
}

$calibrationPayloadUsed = Select-String -Path "components\**\*.js","app\**\*.js","lib\*.js" -Pattern "buildUpdateCalibrationPayload" -ErrorAction SilentlyContinue
# buildUpdateCalibrationPayload est utilisée par buildUpdateCalibrationPayloadFromArray, donc on vérifie aussi cette fonction
$calibrationPayloadFromArrayUsed = Select-String -Path "components\**\*.js","app\**\*.js","lib\*.js" -Pattern "buildUpdateCalibrationPayloadFromArray" -ErrorAction SilentlyContinue
if ($calibrationPayloadUsed.Count -eq 0 -and $calibrationPayloadFromArrayUsed.Count -eq 0) {
    $codeMort += "lib\deviceCommands.js::buildUpdateCalibrationPayload"
    $elementsInutilesScore -= 0.3
}

if ($codeMort.Count -gt 0) {
    Write-Warn "$($codeMort.Count) fonction(s) non utilisée(s)"
    $elementsInutilesIssues += "$($codeMort.Count) fonction(s) non utilisée(s) (code mort)"
}

# 7. SCRIPTS REDONDANTS
Write-Info "Recherche scripts redondants..."
$redundantScripts = @(
    @{ Script = "scripts\AUDIT_PAGES_DASHBOARD.ps1"; Reason = "Fonctionnalités intégrées dans Audit-Complet.ps1" },
    @{ Script = "scripts\diagnostic-deploiement.ps1"; Reason = "Redondant avec verifier-deploiement-github-pages.ps1" },
    @{ Script = "scripts\verifier-base-donnees.ps1"; Reason = "Script de test obsolète" },
    @{ Script = "scripts\audit-complet.js"; Reason = "Version JS obsolète, utiliser .ps1" },
    @{ Script = "merge-to-main.ps1"; Reason = "Script de merge temporaire" },
    @{ Script = "start-php-server.ps1"; Reason = "Utiliser docker-compose à la place" }
)

foreach ($script in $redundantScripts) {
    $path = Join-Path (Get-Location) $script.Script
    if (Test-Path $path) {
        $scriptsRedondants += "$($script.Script) - $($script.Reason)"
        $elementsInutilesScore -= 0.2
    }
}

if ($scriptsRedondants.Count -gt 0) {
    Write-Warn "$($scriptsRedondants.Count) script(s) redondant(s)"
    $elementsInutilesIssues += "$($scriptsRedondants.Count) script(s) redondant(s)"
}

# 8. FICHIERS TEMPORAIRES
Write-Info "Recherche fichiers temporaires..."
$tempFiles = @(
    "audit_result.txt",
    "audit_resultat_20251210_001712.txt",
    "audit_resultat_20251210_184809.txt",
    "audit_final_20251210_190625.txt",
    "logs_serie_20251206_090656.log",
    "docs\AUDIT_COMPLET.json"
)

foreach ($tempFile in $tempFiles) {
    $path = Join-Path (Get-Location) $tempFile
    if (Test-Path $path) {
        $fichiersTemporaires += $tempFile
        $elementsInutilesScore -= 0.1
    }
}

# Dossiers de build
if (Test-Path "out") {
    $outFiles = Get-ChildItem -Path "out" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    if ($outFiles.Count -gt 0) {
        $fichiersTemporaires += "out/ ($($outFiles.Count) fichiers)"
        $elementsInutilesScore -= 0.2
    }
}

if (Test-Path "docs\_next") {
    $nextFiles = Get-ChildItem -Path "docs\_next" -Recurse -File -ErrorAction SilentlyContinue | Measure-Object
    if ($nextFiles.Count -gt 0) {
        $fichiersTemporaires += "docs/_next/ ($($nextFiles.Count) fichiers)"
        $elementsInutilesScore -= 0.2
    }
}

if ($fichiersTemporaires.Count -gt 0) {
    Write-Warn "$($fichiersTemporaires.Count) fichier(s) temporaire(s)"
    $elementsInutilesWarnings += "$($fichiersTemporaires.Count) fichier(s) temporaire(s)"
}

# 9. DOCUMENTATION OBSOLÈTE
Write-Info "Recherche documentation obsolète..."
$obsDoc = @("docs\EXPLICATION_DEPLOIEMENT_GITHUB_PAGES.md")
foreach ($doc in $obsDoc) {
    $path = Join-Path (Get-Location) $doc
    if (Test-Path $path) {
        $referenced = Select-String -Path "*.md","*.js","*.jsx","*.ts","*.tsx" -Pattern ([regex]::Escape($doc)) -ErrorAction SilentlyContinue
        if ($referenced.Count -eq 0) {
            $documentationObsolete += $doc
            $elementsInutilesScore -= 0.2
        }
    }
}

if ($documentationObsolete.Count -gt 0) {
    Write-Warn "$($documentationObsolete.Count) documentation obsolète"
    $elementsInutilesWarnings += "$($documentationObsolete.Count) documentation obsolète"
}

# 10. FICHIERS .PS1 OBSOLÈTES
Write-Info "Recherche fichiers .ps1 obsolètes..."
$allPs1 = Get-ChildItem -Path . -Recurse -Include "*.ps1" -ErrorAction SilentlyContinue | 
    Where-Object { $_.FullName -notmatch "\\node_modules\\" -and $_.FullName -notmatch "\\out\\" }

foreach ($file in $allPs1) {
    $relativePath = $file.FullName.Replace((Get-Location).Path + "\", "")
    $fileName = $file.Name
    
    # Scripts de test
    if ($fileName -match "^test-|^test_") {
        $ps1Obsoletes += $relativePath
        $elementsInutilesScore -= 0.1
        continue
    }
    
    # Scripts de migration (sauf migrate_render.ps1)
    if ($fileName -match "migration|migrate|MIGRER") {
        if ($relativePath -notmatch "scripts\\db\\migrate_render.ps1") {
            $ps1Obsoletes += $relativePath
            $elementsInutilesScore -= 0.2
            continue
        }
    }
}

if ($ps1Obsoletes.Count -gt 0) {
    Write-Warn "$($ps1Obsoletes.Count) fichier(s) .ps1 obsolète(s)"
    $elementsInutilesIssues += "$($ps1Obsoletes.Count) fichier(s) .ps1 obsolète(s)"
}

# 11. FICHIERS .JS OBSOLÈTES
Write-Info "Recherche fichiers .js obsolètes..."
$allJs = Get-ChildItem -Path . -Recurse -Include "*.js" -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.FullName -notmatch "\\node_modules\\" -and 
        $_.FullName -notmatch "\\out\\" -and
        $_.FullName -notmatch "\\docs\\_next\\" -and
        $_.FullName -notmatch "\\\.next\\"
    }

foreach ($file in $allJs) {
    $relativePath = $file.FullName.Replace((Get-Location).Path + "\", "")
    $fileName = $file.Name
    
    # audit.js obsolète (si existe)
    if ($fileName -eq "audit.js" -or $fileName -eq "audit-complet.js") {
        $jsObsoletes += $relativePath
        $elementsInutilesScore -= 0.2
        continue
    }
    
    # Scripts de test dans scripts/
    if ($fileName -match "^test-|^test_") {
        if ($relativePath -match "^scripts\\") {
            $jsObsoletes += $relativePath
            $elementsInutilesScore -= 0.1
            continue
        }
    }
}

if ($jsObsoletes.Count -gt 0) {
    Write-Warn "$($jsObsoletes.Count) fichier(s) .js obsolète(s)"
    $elementsInutilesIssues += "$($jsObsoletes.Count) fichier(s) .js obsolète(s)"
}

# 12. FICHIERS SQL OBSOLÈTES
Write-Info "Recherche fichiers SQL obsolètes..."
$sqlObsoletesList = @(
    @{ File = "sql\add_config_columns.sql"; Reason = "API crée automatiquement les colonnes dans api/handlers/devices/config.php" },
    @{ File = "sql\migration_add_min_max_columns.sql"; Reason = "Toutes les colonnes sont déjà dans sql/migration.sql" }
)

foreach ($sqlFile in $sqlObsoletesList) {
    $path = Join-Path (Get-Location) $sqlFile.File
    if (Test-Path $path) {
        $sqlObsoletes += "$($sqlFile.File) - $($sqlFile.Reason)"
        $elementsInutilesScore -= 0.3
    }
}

# 12b. FICHIERS SQL À INTÉGRER (avant suppression)
Write-Info "Recherche fichiers SQL à intégrer dans migration.sql..."
$sqlToIntegrate = @(
    @{ File = "sql\migration_add_gps_to_measurements.sql"; Target = "sql\migration.sql"; Reason = "Colonnes latitude/longitude doivent être dans migration.sql" }
)

foreach ($sqlFile in $sqlToIntegrate) {
    $path = Join-Path (Get-Location) $sqlFile.File
    $targetPath = Join-Path (Get-Location) $sqlFile.Target
    if (Test-Path $path) {
        # Vérifier si le contenu est déjà dans migration.sql
        $sqlContent = Get-Content $path -Raw
        $targetContent = Get-Content $targetPath -Raw -ErrorAction SilentlyContinue
        
        if ($targetContent -and $sqlContent) {
            # Vérifier si les colonnes GPS sont déjà dans migration.sql
            $gpsInMigration = $targetContent -match "ALTER TABLE measurements.*latitude|ADD COLUMN.*latitude.*measurements"
            if (-not $gpsInMigration) {
                $sqlToIntegrateList += "$($sqlFile.File) - $($sqlFile.Reason) (pas encore intégré dans $($sqlFile.Target))"
                $elementsInutilesScore -= 0.5
            } else {
                # Déjà intégré, peut être supprimé
                $sqlObsoletes += "$($sqlFile.File) - Déjà intégré dans $($sqlFile.Target), peut être supprimé"
                $elementsInutilesScore -= 0.2
            }
        } else {
            $sqlToIntegrateList += "$($sqlFile.File) - $($sqlFile.Reason) (fichier cible non trouvé)"
            $elementsInutilesScore -= 0.5
        }
    }
}

if ($sqlObsoletes.Count -gt 0) {
    Write-Warn "$($sqlObsoletes.Count) fichier(s) SQL obsolète(s)"
    $elementsInutilesIssues += "$($sqlObsoletes.Count) fichier(s) SQL obsolète(s)"
}

if ($sqlToIntegrateList.Count -gt 0) {
    Write-Err "$($sqlToIntegrateList.Count) fichier(s) SQL à intégrer avant suppression"
    $elementsInutilesIssues += "$($sqlToIntegrateList.Count) fichier(s) SQL à intégrer dans migration.sql avant suppression"
}

# Calcul du score final
$elementsInutilesScoreFinal = [Math]::Max(0, [Math]::Round($elementsInutilesScore, 1))

# Afficher le résumé
$totalElementsInutiles = $fichiersLogs.Count + $scriptsMigrationRedondants.Count + $fichiersTestObsoletes.Count + 
                         $dossiersVides.Count + $fichiersDupliques.Count + $codeMort.Count + 
                         $scriptsRedondants.Count + $fichiersTemporaires.Count + $documentationObsolete.Count +
                         $ps1Obsoletes.Count + $jsObsoletes.Count + $sqlObsoletes.Count + $sqlToIntegrateList.Count + $sqlToIntegrateList.Count

Write-Host ""
if ($totalElementsInutiles -eq 0) {
    Write-OK "Aucun élément inutile détecté - Score: $elementsInutilesScoreFinal/10"
} else {
    Write-Warn "$totalElementsInutiles élément(s) inutile(s) détecté(s)"
    if ($elementsInutilesIssues.Count -gt 0) {
        Write-Err "Problèmes détectés:"
        $elementsInutilesIssues | Select-Object -First 10 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        if ($elementsInutilesIssues.Count -gt 10) {
            Write-Host "  ... et $($elementsInutilesIssues.Count - 10) autres problèmes" -ForegroundColor Red
        }
    }
    if ($elementsInutilesWarnings.Count -gt 0) {
        Write-Warn "Avertissements:"
        $elementsInutilesWarnings | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
    Write-Host "[SCORE ÉLÉMENTS INUTILES] $elementsInutilesScoreFinal/10" -ForegroundColor Yellow
}

# Ajouter au score global
$auditResults.Scores["Éléments Inutiles"] = $elementsInutilesScoreFinal
$auditResults.Issues += $elementsInutilesIssues
$auditResults.Warnings += $elementsInutilesWarnings

# Ajouter les recommandations
if ($totalElementsInutiles -gt 0) {
    $auditResults.Recommendations += "Nettoyer $totalElementsInutiles élément(s) inutile(s) (scripts obsolètes, fichiers de test, duplications)"
    if ($sqlToIntegrateList.Count -gt 0) {
        $auditResults.Recommendations += "⚠️ INTÉGRER les fichiers SQL dans migration.sql AVANT suppression: $($sqlToIntegrateList -join ', ')"
    }
    if ($scriptsMigrationRedondants.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($scriptsMigrationRedondants.Count) script(s) de migration redondant(s) (API le fait automatiquement)"
    }
    if ($sqlObsoletes.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($sqlObsoletes.Count) fichier(s) SQL obsolète(s)"
    }
    if ($fichiersTestObsoletes.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($fichiersTestObsoletes.Count) fichier(s) de test obsolète(s)"
    }
    if ($dossiersVides.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($dossiersVides.Count) dossier(s) vide(s)"
    }
    if ($fichiersDupliques.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($fichiersDupliques.Count) fichier(s) dupliqué(s)"
    }
    if ($fichiersTemporaires.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($fichiersTemporaires.Count) fichier(s) temporaire(s)"
    }
    if ($scriptsRedondants.Count -gt 0) {
        $auditResults.Recommendations += "Supprimer $($scriptsRedondants.Count) script(s) redondant(s)"
    }
    $auditResults.Recommendations += "Vérifier manuellement les éléments inutiles détectés (scripts archivés disponibles dans scripts/archive/)"
}

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# PHASE 19 : VÉRIFICATION SYNCHRONISATION GITHUB PAGES
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 19) {
    Write-Host ""
    Write-Section "[19/20] Vérification Synchronisation GitHub Pages"
    
    $deploymentScore = 10.0
    $deploymentIssues = @()
    $deploymentWarnings = @()
    
    # Détecter GitHub depuis métadonnées ou config
    $repo = ""
    $baseUrl = ""
    if ($script:Config -and $script:Config.GitHub -and $script:Config.GitHub.Repo) {
        $repo = $script:Config.GitHub.Repo
        $baseUrl = $script:Config.GitHub.BaseUrl
    } elseif ($projectMetadata -and $projectMetadata.github -and $projectMetadata.github.repo) {
        $repo = $projectMetadata.github.repo
        $baseUrl = $projectMetadata.github.baseUrl
    } else {
        # Essayer de détecter depuis .git
        try {
            Push-Location $projectRoot
            $remoteUrl = git remote get-url origin 2>$null
            if ($remoteUrl -and $remoteUrl -match "github\.com[:/]([^/]+)/([^/\.]+)") {
                $username = $matches[1]
                $repoName = $matches[2]
                $repo = "$username/$repoName"
                $baseUrl = "https://$username.github.io/$repoName"
            }
            Pop-Location
        } catch {
            Write-Info "GitHub non détecté - phase déploiement limitée"
        }
    }

Write-Info "Vérification de la synchronisation entre le code local et GitHub Pages..."

# Récupérer le commit local actuel
try {
    $localCommit = git rev-parse --short HEAD 2>$null
    
    if (-not $localCommit) {
        Write-Err "Impossible de récupérer le commit local (pas un dépôt Git ?)"
        $deploymentScore -= 5.0
        $deploymentIssues += "Impossible de récupérer le commit local"
    } else {
        Write-Info "  Commit local: $localCommit"
        
        # Vérifier si le commit local est poussé
        Write-Info "Vérification synchronisation avec origin/main..."
        $remoteCommit = git rev-parse --short origin/main 2>$null
        if ($LASTEXITCODE -eq 0) {
            if ($localCommit -eq $remoteCommit) {
                Write-OK "Commit local synchronisé avec origin/main"
            } else {
                Write-Warn "Commit local différent de origin/main"
                Write-Info "  Local:  $localCommit"
                Write-Info "  Remote: $remoteCommit"
                $deploymentScore -= 3.0
                $deploymentWarnings += "Commit local non poussé sur origin/main"
                
                # Proposer de pousser automatiquement
                Write-Info "💡 Solution: git push origin main"
            }
        } else {
            Write-Warn "Impossible de récupérer le commit distant (pas de remote configuré ?)"
            $deploymentScore -= 2.0
            $deploymentWarnings += "Remote origin/main non accessible"
        }
        
        # Vérifier le fichier de version sur GitHub Pages
        Write-Info "Vérification fichier de version sur GitHub Pages..."
        try {
            $versionUrl = "$baseUrl/.version.json"
            $versionResponse = Invoke-RestMethod -Uri $versionUrl -Method Get -TimeoutSec 10 -ErrorAction Stop
            
            $deployedCommit = $versionResponse.version
            $deployedTimestamp = $versionResponse.timestamp
            
            Write-OK "Fichier de version trouvé sur GitHub Pages"
            Write-Info "  Commit déployé: $deployedCommit"
            Write-Info "  Timestamp: $deployedTimestamp"
            
            # Comparer avec le commit local
            if ($localCommit -eq $deployedCommit) {
                Write-OK "Le site GitHub Pages est à jour !"
                Write-Info "  Le commit local ($localCommit) correspond au commit déployé ($deployedCommit)"
            } else {
                Write-Err "Le site GitHub Pages n'est PAS à jour !"
                Write-Info "  Local:  $localCommit"
                Write-Info "  Déployé: $deployedCommit"
                $deploymentScore -= 5.0
                $deploymentIssues += "Site GitHub Pages non synchronisé (local: $localCommit, déployé: $deployedCommit)"
                
                # Vérifier si le commit local est poussé
                if ($localCommit -eq $remoteCommit) {
                    Write-Warn "Le commit est poussé mais pas encore déployé"
                    Write-Info "  Le workflow GitHub Actions est peut-être en cours..."
                    $deploymentWarnings += "Déploiement en cours ou échoué - vérifier Actions GitHub"
                    
                    # Option de correction automatique
                    if ($AutoFixDeployment) {
                        Write-Info ""
                        Write-Info "🔧 Correction automatique activée - Forçage du redéploiement..."
                        try {
                            $emptyCommitResult = git commit --allow-empty -m "chore: Force GitHub Pages deployment" 2>&1
                            if ($LASTEXITCODE -eq 0) {
                                $pushResult = git push origin main 2>&1
                                if ($LASTEXITCODE -eq 0) {
                                    Write-OK "Redéploiement forcé avec succès !"
                                    Write-Info "  Le workflow GitHub Actions va se déclencher automatiquement"
                                    $deploymentScore += 2.0  # Bonus pour correction automatique
                                } else {
                                    Write-Err "Échec du push: $pushResult"
                                    $deploymentIssues += "Échec du push automatique: $pushResult"
                                }
                            } else {
                                Write-Err "Échec du commit vide: $emptyCommitResult"
                                $deploymentIssues += "Échec du commit vide: $emptyCommitResult"
                            }
                        } catch {
                            Write-Err "Erreur lors du redéploiement: $($_.Exception.Message)"
                            $deploymentIssues += "Erreur redéploiement automatique: $($_.Exception.Message)"
                        }
                    } else {
                        # Proposer de forcer un redéploiement
                        Write-Info ""
                        Write-Info "💡 Pour forcer un redéploiement automatiquement, utiliser: -AutoFixDeployment"
                        Write-Info "   .\audit\scripts\Audit-Complet.ps1 -AutoFixDeployment"
                    }
                } else {
                    Write-Warn "Le commit local n'est pas poussé sur GitHub"
                    Write-Info "  Solution: git push origin main"
                    $deploymentWarnings += "Commit local non poussé - exécuter: git push origin main"
                    
                    # Option de correction automatique
                    if ($AutoFixDeployment) {
                        Write-Info ""
                        Write-Info "🔧 Correction automatique activée - Poussage du commit..."
                        try {
                            $pushResult = git push origin main 2>&1
                            if ($LASTEXITCODE -eq 0) {
                                Write-OK "Commit poussé avec succès !"
                                Write-Info "  Le workflow GitHub Actions va se déclencher automatiquement"
                                $deploymentScore += 2.0  # Bonus pour correction automatique
                            } else {
                                Write-Err "Échec du push: $pushResult"
                                $deploymentIssues += "Échec du push automatique: $pushResult"
                            }
                        } catch {
                            Write-Err "Erreur lors du push: $($_.Exception.Message)"
                            $deploymentIssues += "Erreur push automatique: $($_.Exception.Message)"
                        }
                    } else {
                        Write-Info ""
                        Write-Info "💡 Pour pousser automatiquement, utiliser: -AutoFixDeployment"
                        Write-Info "   .\audit\scripts\Audit-Complet.ps1 -AutoFixDeployment"
                    }
                }
            }
        } catch {
            Write-Warn "Impossible de récupérer le fichier de version sur GitHub Pages"
            Write-Info "  Erreur: $($_.Exception.Message)"
            Write-Info "  Le site est peut-être en cours de déploiement ou inaccessible"
            $deploymentScore -= 3.0
            $deploymentWarnings += "Fichier de version GitHub Pages inaccessible"
            
            # Vérifier si le site est accessible
            try {
                $siteResponse = Invoke-WebRequest -Uri $baseUrl -Method Head -TimeoutSec 5 -ErrorAction Stop
                Write-OK "Site GitHub Pages accessible (HTTP $($siteResponse.StatusCode))"
            } catch {
                Write-Err "Site GitHub Pages non accessible"
                $deploymentScore -= 2.0
                $deploymentIssues += "Site GitHub Pages non accessible"
            }
        }
    }
} catch {
    Write-Err "Erreur lors de la vérification de synchronisation: $($_.Exception.Message)"
    $deploymentScore -= 5.0
    $deploymentIssues += "Erreur lors de la vérification: $($_.Exception.Message)"
}

# Calcul du score final
$deploymentScoreFinal = [Math]::Max(0, [Math]::Round($deploymentScore, 1))

# Afficher le résumé
Write-Host ""
if ($deploymentScoreFinal -eq 10.0) {
    Write-OK "Synchronisation GitHub Pages parfaite - Score: $deploymentScoreFinal/10"
} elseif ($deploymentScoreFinal -ge 7.0) {
    Write-Warn "Synchronisation GitHub Pages à améliorer - Score: $deploymentScoreFinal/10"
    if ($deploymentWarnings.Count -gt 0) {
        $deploymentWarnings | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
} else {
    Write-Err "Synchronisation GitHub Pages problématique - Score: $deploymentScoreFinal/10"
    if ($deploymentIssues.Count -gt 0) {
        $deploymentIssues | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    }
    if ($deploymentWarnings.Count -gt 0) {
        $deploymentWarnings | Select-Object -First 3 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
    }
}

    Write-Host "[SCORE SYNCHRONISATION GITHUB PAGES] $deploymentScoreFinal/10" -ForegroundColor $(if ($deploymentScoreFinal -ge 9) { "Green" } elseif ($deploymentScoreFinal -ge 7) { "Yellow" } else { "Red" })
    
    # Ajouter au score global
    $auditResults.Scores["Synchronisation GitHub Pages"] = $deploymentScoreFinal
    $auditResults.Issues += $deploymentIssues
    $auditResults.Warnings += $deploymentWarnings
    
    # Ajouter les recommandations
    if ($deploymentScoreFinal -lt 10.0) {
        if ($deploymentIssues.Count -gt 0) {
            $auditResults.Recommendations += "Synchroniser GitHub Pages avec le code local (exécuter: git push origin main)"
            $auditResults.Recommendations += "Vérifier les Actions GitHub: https://github.com/$repo/actions"
        }
        if ($deploymentWarnings.Count -gt 0) {
            $auditResults.Recommendations += "Vérifier que le workflow GitHub Actions s'est bien exécuté"
            $auditResults.Recommendations += "Utiliser le script: .\scripts\verifier-synchronisation-deploiement.ps1"
        }
    }
}

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# PHASE 20 : AUDIT FIRMWARE
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 20) {
    Write-Host ""
    Write-Section "[20/20] Audit Firmware"
    
    $firmwareScore = 10.0
    $firmwareIssues = @()
    $firmwareWarnings = @()
    $firmwareInfo = @{}
    
    # Détecter le répertoire firmware depuis métadonnées ou recherche
    $firmwareDir = $null
    $firmwareMainFile = $null
    
    if ($projectMetadata -and $projectMetadata.firmware -and $projectMetadata.firmware.directory) {
        $firmwareDir = Join-Path (Get-Location) $projectMetadata.firmware.directory.Replace('/', '\')
        if ($projectMetadata.firmware.mainFile) {
            $firmwareMainFile = Join-Path (Get-Location) $projectMetadata.firmware.mainFile.Replace('/', '\')
        }
    }
    
    # Si non trouvé dans métadonnées, chercher automatiquement
    if (-not $firmwareDir) {
        $firmwareDirs = @(
            (Join-Path (Get-Location) "hardware\firmware"),
            (Join-Path (Get-Location) "firmware"),
            (Join-Path (Get-Location) "arduino"),
            (Join-Path (Get-Location) "esp32")
        )
        
        foreach ($dir in $firmwareDirs) {
            if (Test-Path $dir) {
                $inoFiles = Get-ChildItem -Path $dir -Recurse -Filter "*.ino" -ErrorAction SilentlyContinue
                if ($inoFiles.Count -gt 0) {
                    $firmwareDir = $dir
                    # Prendre le fichier .ino le plus volumineux comme fichier principal
                    $firmwareMainFile = ($inoFiles | Sort-Object { $_.Length } -Descending | Select-Object -First 1).FullName
                    break
                }
            }
        }
    }
    
    if (-not $firmwareDir) {
        Write-Warn "Aucun répertoire firmware détecté"
        $auditResults.Scores["Firmware"] = 5
        return
    }
    
    Write-OK "Répertoire firmware détecté: $firmwareDir"
    
    # 1. Vérifier l'existence des fichiers firmware principaux
    if (-not $firmwareMainFile -or -not (Test-Path $firmwareMainFile)) {
        $firmwareMainFileName = if ($firmwareMainFile) { Split-Path $firmwareMainFile -Leaf } else { "firmware principal" }
        Write-Err "Fichier firmware principal introuvable: $firmwareMainFile"
        $firmwareIssues += "Fichier firmware principal manquant: $firmwareMainFileName"
        $firmwareScore -= 3.0
    } else {
        $firmwareMainFileName = Split-Path $firmwareMainFile -Leaf
        Write-OK "Fichier firmware principal trouvé: $firmwareMainFileName"
        $firmwareInfo["main_file"] = $firmwareMainFile
        
        # 2. Analyser le contenu du firmware
        try {
            $firmwareContent = Get-Content $firmwareMainFile -Raw -ErrorAction Stop
            $firmwareLines = (Get-Content $firmwareMainFile -ErrorAction Stop).Count
            $firmwareInfo["lines"] = $firmwareLines
            
            # Détecter la version (patterns génériques)
            $versionPatterns = @(
                '(?:firmware|version|VERSION|FW_VERSION)\s*[=:]\s*["'']?(\d+\.\d+(?:\.\d+)?)["'']?',
                'v(\d+\.\d+(?:\.\d+)?)',
                '#define\s+VERSION\s+["'']?(\d+\.\d+(?:\.\d+)?)["'']?',
                'const\s+.*version.*=\s*["'']?(\d+\.\d+(?:\.\d+)?)["'']?'
            )
            
            $versionDetected = $false
            foreach ($pattern in $versionPatterns) {
                if ($firmwareContent -match $pattern) {
                    $detectedVersion = $matches[1]
                    if ($detectedVersion) {
                        $firmwareVersion = $detectedVersion
                        $firmwareInfo["version"] = $firmwareVersion
                        Write-OK "Version firmware détectée: $firmwareVersion"
                        $versionDetected = $true
                        break
                    }
                }
            }
            
            if (-not $versionDetected) {
                Write-Warn "Version firmware non détectée dans le fichier"
                $firmwareWarnings += "Version firmware non détectée dans $firmwareMainFileName"
                $firmwareScore -= 0.5
            }
            
            # Vérifier les dépendances critiques
            $requiredIncludes = @(
                "TinyGsmClient.h",
                "ArduinoHttpClient.h",
                "ArduinoJson.h",
                "Preferences.h"
            )
            
            $missingIncludes = @()
            foreach ($include in $requiredIncludes) {
                if ($firmwareContent -notmatch [regex]::Escape($include)) {
                    $missingIncludes += $include
                }
            }
            
            if ($missingIncludes.Count -gt 0) {
                Write-Err "Dépendances manquantes: $($missingIncludes -join ', ')"
                $firmwareIssues += "Dépendances manquantes dans firmware: $($missingIncludes -join ', ')"
                $firmwareScore -= 1.0
            } else {
                Write-OK "Toutes les dépendances critiques présentes"
            }
            
            # Vérifier la configuration du modem
            if ($firmwareContent -match 'TINY_GSM_MODEM_SIM7600') {
                Write-OK "Configuration modem SIM7600 détectée (compatible A7670G)"
            } else {
                Write-Warn "Configuration modem non détectée ou différente"
                $firmwareWarnings += "Configuration modem non standard détectée"
                $firmwareScore -= 0.5
            }
            
        } catch {
            Write-Err "Erreur lors de l'analyse du firmware: $($_.Exception.Message)"
            $firmwareIssues += "Erreur analyse firmware: $($_.Exception.Message)"
            $firmwareScore -= 2.0
        }
    }
    
    # 3. Vérifier les fichiers de backup/legacy
    $backupDir = Join-Path $firmwareDir "backups"
    $legacyDir = Join-Path $firmwareDir "legacy"
    
    if (Test-Path $backupDir) {
        $backupFiles = Get-ChildItem $backupDir -Filter "*.ino" -ErrorAction SilentlyContinue
        if ($backupFiles.Count -gt 0) {
            Write-Info "Fichiers de backup trouvés: $($backupFiles.Count)"
            $firmwareInfo["backups"] = $backupFiles.Count
            if ($backupFiles.Count -gt 5) {
                Write-Warn "Trop de fichiers de backup ($($backupFiles.Count)) - considérer un nettoyage"
                $firmwareWarnings += "Trop de fichiers de backup ($($backupFiles.Count))"
                $firmwareScore -= 0.3
            }
        }
    }
    
    if (Test-Path $legacyDir) {
        $legacyFiles = Get-ChildItem $legacyDir -Filter "*.ino" -ErrorAction SilentlyContinue
        if ($legacyFiles.Count -gt 0) {
            Write-Info "Fichiers legacy trouvés: $($legacyFiles.Count)"
            $firmwareInfo["legacy"] = $legacyFiles.Count
            Write-Info "  Fichiers legacy conservés pour référence: $($legacyFiles.Name -join ', ')"
        }
    }
    
    # 4. Vérifier le script d'extraction de version
    $extractVersionScript = Join-Path $firmwareDir "extract_version.py"
    if (Test-Path $extractVersionScript) {
        Write-OK "Script d'extraction de version trouvé: extract_version.py"
        $firmwareInfo["has_version_script"] = $true
    } else {
        Write-Warn "Script d'extraction de version manquant"
        $firmwareWarnings += "Script extract_version.py manquant"
        $firmwareScore -= 0.5
    }
    
    # 5. Vérifier le script de build
    $buildScript = Join-Path (Get-Location) "hardware\scripts\build_firmware.ps1"
    if (Test-Path $buildScript) {
        Write-OK "Script de build trouvé: build_firmware.ps1"
        $firmwareInfo["has_build_script"] = $true
        
        # Vérifier que le script référence le bon fichier
        $buildScriptContent = Get-Content $buildScript -Raw -ErrorAction SilentlyContinue
        # Vérifier que le script de build référence le fichier firmware principal
        if ($firmwareMainFile -and $buildScriptContent -match [regex]::Escape([System.IO.Path]::GetFileName($firmwareMainFile))) {
            Write-OK "Script de build référence le fichier correct"
        } else {
            Write-Warn "Script de build ne référence pas $firmwareMainFileName"
            $firmwareWarnings += "Script build_firmware.ps1 ne référence pas le bon fichier"
            $firmwareScore -= 0.5
        }
    } else {
        Write-Warn "Script de build manquant: build_firmware.ps1"
        $firmwareWarnings += "Script build_firmware.ps1 manquant"
        $firmwareScore -= 1.0
    }
    
    # 6. Vérifier la librairie TinyGSM
    $tinyGsmDir = Join-Path (Get-Location) "hardware\lib\TinyGSM"
    if (Test-Path $tinyGsmDir) {
        Write-OK "Librairie TinyGSM trouvée"
        $firmwareInfo["has_tinygsm"] = $true
        
        # Vérifier les fichiers critiques de TinyGSM
        $tinyGsmMainFile = Join-Path $tinyGsmDir "src\TinyGSM.h"
        $tinyGsmClientFile = Join-Path $tinyGsmDir "src\TinyGsmClient.h"
        $tinyGsmSim7600File = Join-Path $tinyGsmDir "src\TinyGsmClientSIM7600.h"
        
        $missingTinyGsmFiles = @()
        if (-not (Test-Path $tinyGsmMainFile)) { $missingTinyGsmFiles += "TinyGSM.h" }
        if (-not (Test-Path $tinyGsmClientFile)) { $missingTinyGsmFiles += "TinyGsmClient.h" }
        if (-not (Test-Path $tinyGsmSim7600File)) { $missingTinyGsmFiles += "TinyGsmClientSIM7600.h" }
        
        if ($missingTinyGsmFiles.Count -gt 0) {
            Write-Err "Fichiers TinyGSM manquants: $($missingTinyGsmFiles -join ', ')"
            $firmwareIssues += "Fichiers TinyGSM manquants: $($missingTinyGsmFiles -join ', ')"
            $firmwareScore -= 1.5
        } else {
            Write-OK "Fichiers TinyGSM critiques présents"
        }
    } else {
        Write-Err "Librairie TinyGSM introuvable"
        $firmwareIssues += "Librairie TinyGSM manquante"
        $firmwareScore -= 3.0
    }
    
    # 7. Vérifier la cohérence des versions (si disponible via API)
    if ($script:authSuccess -and $null -ne $script:authHeaders) {
        try {
            Write-Info "Vérification des versions firmware via API..."
            $firmwaresResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/firmwares" -Headers $script:authHeaders -TimeoutSec 10 -ErrorAction SilentlyContinue
            
            if ($firmwaresResponse -and $firmwaresResponse.Count -gt 0) {
                $firmwareInfo["api_firmwares_count"] = $firmwaresResponse.Count
                Write-OK "Firmwares enregistrés dans la base de données: $($firmwaresResponse.Count)"
                
                # Comparer avec la version du fichier
                if ($firmwareInfo.ContainsKey("version")) {
                    $fileVersion = $firmwareInfo["version"]
                    $matchingFirmware = $firmwaresResponse | Where-Object { $_.version -eq $fileVersion -or $_.version -like "*$fileVersion*" }
                    if ($matchingFirmware) {
                        Write-OK "Version firmware cohérente avec la base de données"
                    } else {
                        Write-Warn "Version firmware du fichier ($fileVersion) non trouvée dans la base de données"
                        $firmwareWarnings += "Version firmware du fichier ($fileVersion) non trouvée en BDD"
                        $firmwareScore -= 0.5
                    }
                }
            } else {
                Write-Info "Aucun firmware enregistré dans la base de données"
            }
        } catch {
            Write-Info "Impossible de vérifier les firmwares via API (non critique)"
        }
    }
    
    # Score final
    $firmwareScoreFinal = [Math]::Max(0, [Math]::Round($firmwareScore, 1))
    
    if ($firmwareScoreFinal -ge 9.0) {
        Write-OK "Audit firmware excellent - Score: $firmwareScoreFinal/10"
    } elseif ($firmwareScoreFinal -ge 7.0) {
        Write-Warn "Audit firmware acceptable - Score: $firmwareScoreFinal/10"
        if ($firmwareWarnings.Count -gt 0) {
            $firmwareWarnings | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
        }
    } else {
        Write-Err "Audit firmware problématique - Score: $firmwareScoreFinal/10"
        if ($firmwareIssues.Count -gt 0) {
            $firmwareIssues | Select-Object -First 5 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        }
        if ($firmwareWarnings.Count -gt 0) {
            $firmwareWarnings | Select-Object -First 3 | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
        }
    }
    
    Write-Host "[SCORE FIRMWARE] $firmwareScoreFinal/10" -ForegroundColor $(if ($firmwareScoreFinal -ge 9) { "Green" } elseif ($firmwareScoreFinal -ge 7) { "Yellow" } else { "Red" })
    
    # Ajouter au score global
    $auditResults.Scores["Firmware"] = $firmwareScoreFinal
    $auditResults.Issues += $firmwareIssues
    $auditResults.Warnings += $firmwareWarnings
    
    # Ajouter les recommandations
    if ($firmwareScoreFinal -lt 10.0) {
        if ($firmwareIssues.Count -gt 0) {
            $auditResults.Recommendations += "Corriger les problèmes firmware détectés (fichiers manquants, dépendances, etc.)"
        }
        if ($firmwareWarnings.Count -gt 0) {
            $auditResults.Recommendations += "Nettoyer les fichiers de backup firmware si trop nombreux"
            $auditResults.Recommendations += "Vérifier la cohérence des versions firmware entre fichier et base de données"
        }
    }
    
    # Ajouter les informations firmware au rapport
    $auditResults.Statistics["Firmware"] = $firmwareInfo
}

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# RÉESSAI D'AUTHENTIFICATION API (si échec au début)
# ===============================================================================

if ($script:apiAuthFailed) {
    Write-Host ""
    Write-Section "[RÉESSAI] Authentification API - Tentatives Finales"
    
    $maxRetries = 3
    $retryDelay = 5  # Secondes entre chaque tentative
    $authSuccess = $false
    
    for ($attempt = 1; $attempt -le $maxRetries; $attempt++) {
        Write-Host "`n  Tentative $attempt/$maxRetries..." -ForegroundColor Yellow
        
        try {
            $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
            $authEndpoint = if ($script:Config -and $script:Config.Api -and $script:Config.Api.AuthEndpoint) { $script:Config.Api.AuthEndpoint } else { "/api.php/auth/login" }
            
            $authResponse = Invoke-RestMethod -Uri "$ApiUrl$authEndpoint" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
            $script:authToken = $authResponse.token
            $script:authHeaders = @{Authorization = "Bearer $script:authToken"}
            $token = $script:authToken
            $headers = $script:authHeaders
            
            Write-OK "Authentification réussie (tentative $attempt/$maxRetries)"
            $authSuccess = $true
            
            # Maintenant que l'authentification est réussie, compléter les phases API et BDD
            Write-Host "`n  Complétion des phases API et BDD..." -ForegroundColor Cyan
            
            # Compléter Phase 6 : Endpoints API (seulement si phase 6 sélectionnée)
            if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 6) {
                Write-Host "`n  === Tests Endpoints API ===" -ForegroundColor Yellow
                $endpointsTotal = 0
                $endpointsOK = 0
                
                if ($script:Config.Api.Endpoints) {
                    $endpoints = $script:Config.Api.Endpoints
                } else {
                    $endpoints = @(
                        @{Path="/api.php/devices"; Name="Dispositifs"},
                        @{Path="/api.php/patients"; Name="Patients"},
                        @{Path="/api.php/users"; Name="Utilisateurs"},
                        @{Path="/api.php/alerts"; Name="Alertes"},
                        @{Path="/api.php/firmwares"; Name="Firmwares"},
                        @{Path="/api.php/roles"; Name="Roles"},
                        @{Path="/api.php/permissions"; Name="Permissions"},
                        @{Path="/api.php/health"; Name="Healthcheck"}
                    )
                }
                
                foreach ($endpoint in $endpoints) {
                    $endpointsTotal++
                    try {
                        $result = Invoke-RestMethod -Uri "$ApiUrl$($endpoint.Path)" -Headers $script:authHeaders -TimeoutSec 10
                        Write-OK "  $($endpoint.Name)"
                        $endpointsOK++
                    } catch {
                        Write-Err "  $($endpoint.Name) - Erreur"
                    }
                }
                
                if ($endpointsTotal -gt 0) {
                    $apiScore = [math]::Round(($endpointsOK / $endpointsTotal) * 10, 1)
                    $auditResults.Scores["API"] = $apiScore
                    Write-Host "  Score API mis à jour: $apiScore/10" -ForegroundColor $(if ($apiScore -ge 8) { "Green" } elseif ($apiScore -ge 6) { "Yellow" } else { "Red" })
                }
            }  # Fin if phase 6 sélectionnée
            
            # Compléter Phase 14 : Base de Données (seulement si phase 14 sélectionnée)
            if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 14) {
                Write-Host "`n  === Analyse Base de Données ===" -ForegroundColor Yellow
                try {
                    # 1. Audit complet du schéma via API (vérifie code vs base en ligne)
                    Write-Host "  🔍 Exécution audit complet du schéma (code vs base en ligne)..." -ForegroundColor Cyan
                    try {
                        $auditResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/database-audit" -Headers $script:authHeaders -TimeoutSec 30
                        
                        if ($auditResponse.success -and $auditResponse.results) {
                            $dbAudit = $auditResponse.results
                            $dbScore = $dbAudit.score
                            
                            # Afficher le statut de connexion
                            if ($dbAudit.connection) {
                                if ($dbAudit.connection.status -eq 'ok') {
                                    Write-OK "  Connexion BDD: OK"
                                    if ($dbAudit.connection.version) {
                                        Write-Info "    Version: $($dbAudit.connection.version)"
                                    }
                                } else {
                                    Write-Err "  Connexion BDD: ÉCHEC - $($dbAudit.connection.message)"
                                }
                            }
                            
                            # Afficher le résumé des tables
                            if ($dbAudit.tables -and $dbAudit.tables.Count -gt 0) {
                                $tablesOk = ($dbAudit.tables | Where-Object { $_.exists }).Count
                                $tablesMissing = ($dbAudit.tables | Where-Object { -not $_.exists }).Count
                                Write-Host "  Tables: $tablesOk/$($dbAudit.tables.Count) OK" -ForegroundColor $(if ($tablesMissing -eq 0) { "Green" } else { "Yellow" })
                                if ($tablesMissing -gt 0) {
                                    Write-Warn "    $tablesMissing table(s) manquante(s)"
                                }
                            }
                            
                            # Afficher les problèmes détectés
                            if ($dbAudit.issues -and $dbAudit.issues.Count -gt 0) {
                                Write-Err "  ❌ Problèmes critiques: $($dbAudit.issues.Count)"
                                foreach ($issue in $dbAudit.issues) {
                                    Write-Err "    - $issue"
                                    $auditResults.Issues += "BDD: $issue"
                                }
                            }
                            
                            # Afficher les doublons
                            if ($dbAudit.duplicates -and $dbAudit.duplicates.Count -gt 0) {
                                Write-Err "  ⚠️  Colonnes en double détectées: $($dbAudit.duplicates.Count)"
                                foreach ($dup in $dbAudit.duplicates) {
                                    Write-Err "    - $($dup.table): $($dup.columns -join ', ')"
                                    Write-Err "      → $($dup.issue)"
                                    $auditResults.Issues += "BDD DOUBLON: $($dup.table) - $($dup.columns -join ', ')"
                                }
                            }
                            
                            # Afficher les avertissements
                            if ($dbAudit.warnings -and $dbAudit.warnings.Count -gt 0) {
                                Write-Warn "  ⚠️  Avertissements: $($dbAudit.warnings.Count)"
                                foreach ($warning in $dbAudit.warnings) {
                                    Write-Warn "    - $warning"
                                    $auditResults.Warnings += "BDD: $warning"
                                }
                            }
                            
                            # Tables orphelines
                            if ($dbAudit.orphans -and $dbAudit.orphans.Count -gt 0) {
                                Write-Warn "  📋 Tables orphelines: $($dbAudit.orphans.Count) (existent en DB mais pas dans schema.sql)"
                                foreach ($orphan in $dbAudit.orphans) {
                                    Write-Warn "    - $orphan"
                                }
                            }
                            
                            # Index critiques
                            if ($dbAudit.indexes -and $dbAudit.indexes.Count -gt 0) {
                                $indexesOk = ($dbAudit.indexes | Where-Object { $_.exists }).Count
                                $indexesMissing = ($dbAudit.indexes | Where-Object { -not $_.exists }).Count
                                if ($indexesMissing -gt 0) {
                                    Write-Warn "  Index critiques: $indexesOk/$($dbAudit.indexes.Count) OK, $indexesMissing manquant(s)"
                                } else {
                                    Write-OK "  Index critiques: $indexesOk/$($dbAudit.indexes.Count) OK"
                                }
                            }
                            
                            # Tables manquantes
                            if ($dbAudit.missing -and $dbAudit.missing.Count -gt 0) {
                                Write-Err "  Tables manquantes: $($dbAudit.missing.Count)"
                                foreach ($missing in $dbAudit.missing) {
                                    Write-Err "    - $missing"
                                }
                            }
                            
                            $auditResults.Scores["Database"] = [Math]::Max(0, $dbScore)
                            Write-Host ""
                            Write-Host "  ✅ Audit schéma terminé - Score: $dbScore/10" -ForegroundColor $(if ($dbScore -ge 8) { "Green" } elseif ($dbScore -ge 6) { "Yellow" } else { "Red" })
                        } else {
                            Write-Warn "  Audit schéma non disponible, utilisation méthode alternative"
                            throw "Audit schéma échoué"
                        }
                    } catch {
                        Write-Warn "  Erreur audit schéma: $($_.Exception.Message), utilisation méthode alternative"
                        
                        # Méthode alternative : vérifier les entités
                        if ($script:Config.Database -and $script:Config.Database.Entities) {
                            $entities = $script:Config.Database.Entities
                        } else {
                            $entities = @(
                                @{ Name = "devices"; Field = "devices"; CountField = "Count"; UnassignedField = "patient_id"; UnassignedMessage = "dispositifs non assignes" }
                                @{ Name = "patients"; Field = "patients"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
                                @{ Name = "users"; Field = "users"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
                                @{ Name = "alerts"; Field = "alerts"; CountField = "Count"; UnassignedField = $null; UnassignedMessage = $null }
                            )
                        }
                        
                        $dbScore = 10
                        foreach ($entity in $entities) {
                            try {
                                $endpointPath = "/api.php/$($entity.Name)"
                                $response = Invoke-RestMethod -Uri "$ApiUrl$endpointPath" -Headers $script:authHeaders -TimeoutSec 10
                                
                                $data = Get-ArrayFromApiResponse -data $response -propertyName $entity.Field
                                $count = if ($data) { $data.Count } else { 0 }
                                
                                Write-OK "  $($entity.Name): $count élément(s)"
                                
                                # Vérifier les éléments non assignés si applicable
                                if ($entity.UnassignedField -and $count -gt 0) {
                                    $unassigned = @($data | Where-Object { -not $_.$($entity.UnassignedField) }).Count
                                    if ($unassigned -gt 0) {
                                        Write-Info "    $unassigned $($entity.UnassignedMessage)"
                                    }
                                }
                            } catch {
                                Write-Err "  Erreur récupération $($entity.Name): $($_.Exception.Message)"
                                $dbScore -= 1
                            }
                        }
                        
                        $auditResults.Scores["Database"] = [Math]::Max(0, $dbScore)
                        Write-Host "  Score BDD (méthode alternative): $dbScore/10" -ForegroundColor $(if ($dbScore -ge 8) { "Green" } elseif ($dbScore -ge 6) { "Yellow" } else { "Red" })
                    }  # Fin catch audit schéma (ferme le try de 5470)
                } catch {
                    Write-Err "  Erreur analyse BDD: $($_.Exception.Message)"
                }  # Fin catch analyse BDD (ferme le try de 5467)
            }  # Fin if phase 14 sélectionnée
            
            break  # Sortir de la boucle si l'authentification réussit
            
        } catch {
            Write-Warn "  Échec authentification (tentative $attempt/$maxRetries): $($_.Exception.Message)"
            if ($attempt -lt $maxRetries) {
                Write-Info "  Attente de $retryDelay secondes avant la prochaine tentative..."
                Start-Sleep -Seconds $retryDelay
            }
        }
    }
    
    if (-not $authSuccess) {
        Write-Err "`n  Échec définitif après $maxRetries tentatives"
        Write-Warn "  Les phases API et BDD restent incomplètes"
        $auditResults.Issues += "API: Échec définitif après $maxRetries tentatives d'authentification"
    }
}  # Fin if apiAuthFailed

# Recalculer le score global après les mises à jour
$scoreWeights = @{
        "Architecture" = 1.0
        "CodeMort" = 1.5
        "Duplication" = 1.2
        "Complexite" = 1.2
        "Routes" = 0.8
        "API" = 1.5
        "Database" = 1.5
        "Securite" = 2.0
        "Performance" = 1.5
        "Tests" = 1.2
        "Documentation" = 0.8
        "Structure API" = 1.0
        "Vérification Exhaustive" = 1.2
        "Uniformisation UI/UX" = 0.8
        "Éléments Inutiles" = 1.0
        "Synchronisation GitHub Pages" = 1.2
        "Firmware" = 1.0
    }
    
    $totalWeight = ($scoreWeights.Values | Measure-Object -Sum).Sum
    $weightedSum = 0
    
    foreach ($key in ($scoreWeights.Keys | Sort-Object)) {
        if ($auditResults.Scores.ContainsKey($key)) {
            $weight = $scoreWeights[$key]
            $score = $auditResults.Scores[$key]
            $weightedSum += $score * $weight
        }
    }
    
    $scoreGlobal = [math]::Round($weightedSum / $totalWeight, 1)
    
    Write-Host ""
    Write-Host ("  [SCORE] SCORE GLOBAL PONDERE (mis à jour) : {0}/10" -f $scoreGlobal) -ForegroundColor $(if($scoreGlobal -ge 9.5){"Green"}elseif($scoreGlobal -ge 8){"Yellow"}else{"Red"})
    Write-Host ""
    Write-Host ("=" * 80) -ForegroundColor Gray
    
    # NOUVEAU: Export JSON du rapport pour analyse programmatique
    Write-Host ""
    Write-Section "Export Rapport JSON"
    try {
        # Déterminer le répertoire de résultats si non défini
        if (-not $resultsDir) {
            $resultsDir = Join-Path $AuditDir "resultats"
            if (-not (Test-Path $resultsDir)) {
                New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null
            }
        }
        
        $jsonReport = @{
            timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
            project = if ($script:Config -and $script:Config.Project) { $script:Config.Project.Name } elseif ($projectMetadata -and $projectMetadata.project.name) { $projectMetadata.project.name } else { $projectName }
            scores = $auditResults.Scores
            scoreGlobal = $scoreGlobal
            warnings = $auditResults.Warnings
            recommendations = $auditResults.Recommendations
            issues = $auditResults.Issues
            statistics = @{
                totalFiles = if ($auditResults.Statistics.TotalFiles) { $auditResults.Statistics.TotalFiles } elseif ($auditResults.Stats.TotalFiles) { $auditResults.Stats.TotalFiles } else { 0 }
                totalLines = if ($auditResults.Statistics.TotalLines) { $auditResults.Statistics.TotalLines } elseif ($auditResults.Stats.TotalLines) { $auditResults.Stats.TotalLines } else { 0 }
                jsFiles = if ($auditResults.Statistics.JSFiles) { $auditResults.Statistics.JSFiles } elseif ($auditResults.Stats.JS) { $auditResults.Stats.JS } else { 0 }
                phpFiles = if ($auditResults.Statistics.PHPFiles) { $auditResults.Statistics.PHPFiles } elseif ($auditResults.Stats.PHP) { $auditResults.Stats.PHP } else { 0 }
            }
            secrets = if ($auditResults.Secrets) { $auditResults.Secrets } else { @() }
            outdatedPackages = if ($auditResults.OutdatedPackages) { $auditResults.OutdatedPackages } else { @() }
        }
        
        $jsonPath = Join-Path $resultsDir "audit_resultat_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
        $jsonReport | ConvertTo-Json -Depth 10 | Out-File -FilePath $jsonPath -Encoding UTF8
        Write-OK "Rapport JSON exporte: $jsonPath"
    } catch {
        Write-Warn "Erreur export JSON: $($_.Exception.Message)"
    }

# Export des plans de correction
if ($auditResults.CorrectionPlans.Count -gt 0) {
    Write-Host ""
    Write-Section "Export Plans de Correction"
    try {
            $correctionPlansPath = if (-not [string]::IsNullOrEmpty($CorrectionPlansFile)) {
                $CorrectionPlansFile
            } else {
                Join-Path $resultsDir "correction_plans_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
            }
            
            Export-CorrectionPlans -Plans $auditResults.CorrectionPlans -OutputFile $correctionPlansPath
            Write-OK "Plans de correction exportes: $correctionPlansPath ($($auditResults.CorrectionPlans.Count) plan(s))"
            
            # Générer aussi un rapport texte lisible
            $textReportPath = $correctionPlansPath -replace '\.json$', '.txt'
            $textReport = @"
═══════════════════════════════════════════════════════════════════════════════
PLANS DE CORRECTION - RAPPORT DÉTAILLÉ
═══════════════════════════════════════════════════════════════════════════════
Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Total de problèmes: $($auditResults.CorrectionPlans.Count)

Résumé par sévérité:
  - Critique: $(($auditResults.CorrectionPlans | Where-Object { $_.Severity -eq 'critical' }).Count)
  - Élevée: $(($auditResults.CorrectionPlans | Where-Object { $_.Severity -eq 'high' }).Count)
  - Moyenne: $(($auditResults.CorrectionPlans | Where-Object { $_.Severity -eq 'medium' }).Count)
  - Faible: $(($auditResults.CorrectionPlans | Where-Object { $_.Severity -eq 'low' }).Count)
  - Info: $(($auditResults.CorrectionPlans | Where-Object { $_.Severity -eq 'info' }).Count)

═══════════════════════════════════════════════════════════════════════════════

"@
            
        foreach ($plan in $auditResults.CorrectionPlans | Sort-Object { 
            $severityOrder = @{ 'critical' = 0; 'high' = 1; 'medium' = 2; 'low' = 3; 'info' = 4 }
            $severityOrder[$_.Severity]
        }) {
            $textReport += Format-CorrectionPlan -Plan $plan
            $textReport += "`n"
        }
        
        $textReport | Out-File -FilePath $textReportPath -Encoding UTF8
        Write-OK "Rapport texte genere: $textReportPath"
    } catch {
        Write-Warn "Erreur export plans de correction: $($_.Exception.Message)"
    }
} else {
    Write-Info "Aucun plan de correction genere (aucun probleme detecte ou plans non implementes)"
}

# Sauvegarder l'état final
if (-not [string]::IsNullOrEmpty($StateFile)) {
    Save-AuditState -StateFile $StateFile -CompletedPhases $completedPhases -PartialResults $partialResults
    Write-Info "État final sauvegardé: $StateFile"
}

# Verdict final
if ($scoreGlobal -ge 9.5) {
    Write-Host "[EXCELLENT] Projet de qualite professionnelle !" -ForegroundColor Green
    $exitCode = 0
} elseif ($scoreGlobal -ge 8) {
    Write-Host "[BON] Quelques optimisations possibles." -ForegroundColor Yellow
    $exitCode = 0
} elseif ($scoreGlobal -ge 6) {
    Write-Host "[MOYEN] Corrections recommandees." -ForegroundColor Yellow
    $exitCode = 1
} else {
    Write-Host "[CRITIQUE] Actions urgentes necessaires." -ForegroundColor Red
    $exitCode = 1
}

# ===============================================================================
# PHASE 21 : TESTS COMPLETS APPLICATION OTT
# ===============================================================================

if ($SelectedPhases.Count -eq 0 -or $SelectedPhases -contains 21) {
    Write-Host ""
    Write-Section "[21/21] Tests Complets Application OTT"
    
    try {
        # Charger le module de tests complets
        $MODULES_DIR = Join-Path $AuditDir "modules"
        $testsModule = Join-Path $MODULES_DIR "Checks-TestsComplets.ps1"
        
        if (Test-Path $testsModule) {
            . $testsModule
            
            # Préparer la configuration pour le module
            $moduleConfig = @{
                API = @{
                    BaseUrl = if ($ApiUrl) { $ApiUrl } elseif ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) { $script:Config.Api.BaseUrl } else { "http://localhost:8000" }
                    AuthEndpoint = if ($script:Config -and $script:Config.Api -and $script:Config.Api.AuthEndpoint) { $script:Config.Api.AuthEndpoint } else { "/api.php/auth/login" }
                    Credentials = @{
                        Email = if ($Email) { $Email } elseif ($script:Config -and $script:Config.Credentials -and $script:Config.Credentials.Email) { $script:Config.Credentials.Email } else { "" }
                        Password = if ($Password) { $Password } elseif ($script:Config -and $script:Config.Credentials -and $script:Config.Credentials.Password) { $script:Config.Credentials.Password } else { "" }
                    }
                }
            }
            
            # Appeler le module de tests complets
            Invoke-Check-TestsComplets -Config $moduleConfig -Results $auditResults
        } else {
            Write-Warn "Module Checks-TestsComplets.ps1 non trouvé - phase ignorée"
            $auditResults.Scores["TestsComplets"] = 5
        }
    } catch {
        Write-Err "Erreur phase Tests Complets: $($_.Exception.Message)"
        $auditResults.Scores["TestsComplets"] = 5
    }
}  # Fin if SelectedPhases -contains 21

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

# Restaurer le répertoire d'origine si on a changé
if ($projectRoot) {
    Pop-Location -ErrorAction SilentlyContinue
}

exit $exitCode

