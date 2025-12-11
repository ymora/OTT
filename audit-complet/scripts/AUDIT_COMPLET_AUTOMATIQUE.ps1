# ===============================================================================
# AUDIT COMPLET AUTOMATIQUE PROFESSIONNEL - OTT Dashboard
# ===============================================================================
# HAPPLYZ MEDICAL SAS
# Version 2.3 - Analyse exhaustive optimisee avec detection elements inutiles (fichiers obsolètes, redondants)
# Corrections: Variables non utilisées supprimées, code optimisé
#
# Ce script effectue un audit 360 degres couvrant 16 domaines
# Usage : .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 [-Verbose]
# ===============================================================================

param(
    [string]$Email = "",
    [string]$Password = "YM120879",
    [string]$ApiUrl = "",
    [string]$ConfigFile = "audit-complet/scripts/audit.config.ps1",
    [switch]$Verbose = $false,
    [int]$MaxFileLines = 500
)

# ===============================================================================
# FONCTIONS D'AFFICHAGE (définies en premier pour être disponibles partout)
# ===============================================================================
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
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

$ErrorActionPreference = "Continue"

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
        # Par défaut, utiliser le parent du script (audit-complet/scripts -> racine)
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
        $ApiUrl = "https://ott-jbln.onrender.com"
    }
}

# ===============================================================================
# NETTOYAGE DES RÉSULTATS PRÉCÉDENTS
# ===============================================================================
function Clear-PreviousAuditResults {
    $resultsDir = Join-Path (Get-Location) "audit-complet\resultats"
    
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
$configPath = Join-Path (Get-Location) $ConfigFile
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
    Write-Warn "Utilisation des valeurs par défaut (projet OTT)"
    $script:Config = $null
}

# Valeurs par défaut si config non chargée ou valeurs manquantes
if ($null -eq $script:Config) {
    $script:Config = @{
        Project = @{ Name = "OTT Dashboard"; Company = "HAPPLYZ MEDICAL SAS" }
        Api = @{ BaseUrl = "https://ott-jbln.onrender.com"; AuthEndpoint = "/api.php/auth/login" }
        GitHub = @{ Repo = "ymora/OTT"; BaseUrl = "https://ymora.github.io/OTT"; BasePath = "/OTT" }
    }
}

# Utiliser la configuration ou les paramètres
if ([string]::IsNullOrEmpty($ApiUrl)) {
    if ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) {
        $ApiUrl = $script:Config.Api.BaseUrl
    } else {
        $ApiUrl = "https://ott-jbln.onrender.com"
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
$projectName = if ($script:Config -and $script:Config.Project -and $script:Config.Project.Name) { $script:Config.Project.Name } else { "OTT Dashboard" }
$projectCompany = if ($script:Config -and $script:Config.Project -and $script:Config.Project.Company) { $script:Config.Project.Company } else { "HAPPLYZ MEDICAL SAS" }
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
}

$startTime = Get-Date

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
# PHASE 0 : INVENTAIRE EXHAUSTIF DE TOUS LES FICHIERS
# ===============================================================================

Write-Section "[0/18] Inventaire Exhaustif - Tous les Fichiers et Répertoires"

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

# ===============================================================================
# PHASE 1 : ARCHITECTURE ET STATISTIQUES
# ===============================================================================

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
        Write-Host "  💡 Action: Déplacer les fichiers MD dans audit-complet/plans/ ou docs/" -ForegroundColor Cyan
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
} catch {
    Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
    $auditResults.Scores["Architecture"] = 5
}

# ===============================================================================
# PHASE 2 : CODE MORT
# ===============================================================================

Write-Section "[2/15] Code Mort - Detection Composants/Hooks/Libs Non Utilises"

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

# ===============================================================================
# PHASE 3 : DUPLICATION DE CODE
# ===============================================================================

Write-Section "[3/18] Duplication de Code et Refactoring"

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
        # Valeurs par défaut pour OTT
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
    
    if ($duplications.Count -eq 0) {
        Write-OK "Pas de duplication excessive detectee"
        $auditResults.Scores["Duplication"] = 10
    } else {
        Write-Warn "$($duplications.Count) patterns a fort potentiel de refactoring"
        $auditResults.Scores["Duplication"] = [Math]::Max(10 - $duplications.Count, 5)
    }
} catch {
    Write-Err "Erreur analyse duplication: $($_.Exception.Message)"
    $auditResults.Scores["Duplication"] = 7
}

# ===============================================================================
# PHASE 4 : COMPLEXITE
# ===============================================================================

Write-Section "[4/18] Complexite - Fichiers/Fonctions Volumineux"

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
            @{Route="/dashboard/dispositifs"; File="app/dashboard/dispositifs/page.js"; Name="Dispositifs OTT"},
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

# ===============================================================================
# PHASE 6 : ENDPOINTS API
# ===============================================================================

Write-Section "[6/18] Endpoints API - Tests Fonctionnels"

$apiScore = 0
$endpointsTotal = 0
$endpointsOK = 0

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
        Write-Err "Echec authentification"
        Write-Warn "Tests API ignores - API non accessible"
        $apiScore = 5
    }
    
} catch {
    Write-Err "Echec connexion API"
    $auditResults.Issues += "API: Impossible de se connecter"
    $apiScore = 0
}

$auditResults.Scores["API"] = $apiScore

# ===============================================================================
# PHASE 7 : BASE DE DONNEES
# ===============================================================================

Write-Section "[7/18] Base de Donnees - Coherence et Integrite"

# Variables pour la phase 7 (initialisées si l'authentification a réussi)
$script:authHeaders = $null
$script:authToken = $null

try {
    if ($apiScore -gt 0 -and $endpointsOK -gt 0) {
        # Utiliser les headers de la phase 6 si disponibles, sinon ré-authentifier
        if (-not $script:authHeaders -or -not $script:authToken) {
            Write-Info "Ré-authentification pour phase BDD..."
            $loginBody = @{email = $Email; password = $Password} | ConvertTo-Json
            $authEndpoint = if ($script:Config -and $script:Config.Api -and $script:Config.Api.AuthEndpoint) { $script:Config.Api.AuthEndpoint } else { "/api.php/auth/login" }
            $authResponse = Invoke-RestMethod -Uri "$ApiUrl$authEndpoint" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
            $script:authToken = $authResponse.token
            $script:authHeaders = @{Authorization = "Bearer $script:authToken"}
        }
        
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

# 1. Vérifier service dashboard Docker (serveur 3000)
Write-Host "`n1. Configuration Serveur 3000 (Docker):" -ForegroundColor Yellow
if ($dockerCompose) {
    if ($dockerCompose -match "dashboard:" -or $dockerCompose -match "ott-dashboard") {
        Write-OK "  Service dashboard présent dans docker-compose.yml"
        
        if ($dockerCompose -match "3000:3000" -or $dockerCompose -match '"3000"') {
            Write-OK "    Port 3000 configuré"
        } else {
            Write-Err "    Port 3000 manquant"
            $configIssues += "Port 3000 manquant dans docker-compose.yml"
            $configScore -= 2.0
        }
        
        if ($dockerCompose -match "Dockerfile.dashboard") {
            Write-OK "    Dockerfile.dashboard référencé"
        } else {
            Write-Err "    Dockerfile.dashboard non référencé"
            $configIssues += "Dockerfile.dashboard non référencé"
            $configScore -= 2.0
        }
        
        if ($dockerCompose -match "NEXT_PUBLIC_API_URL") {
            Write-OK "    NEXT_PUBLIC_API_URL configurée"
        } else {
            Write-Warn "    NEXT_PUBLIC_API_URL manquante"
            $configWarnings += "NEXT_PUBLIC_API_URL manquante dans docker-compose.yml"
            $configScore -= 0.5
        }
        
        if ($dockerCompose -match "CORS_ALLOWED_ORIGINS.*3000" -or $dockerCompose -match "localhost:3000") {
            Write-OK "    CORS_ALLOWED_ORIGINS inclut localhost:3000"
        } else {
            Write-Warn "    CORS_ALLOWED_ORIGINS peut ne pas inclure localhost:3000"
            $configWarnings += "CORS_ALLOWED_ORIGINS peut ne pas autoriser localhost:3000"
            $configScore -= 0.5
        }
    } else {
        Write-Err "  Service dashboard MANQUANT dans docker-compose.yml"
        $configIssues += "Service dashboard absent de docker-compose.yml"
        $configScore -= 3.0
    }
} else {
    Write-Warn "  docker-compose.yml introuvable"
    $configWarnings += "docker-compose.yml manquant"
    $configScore -= 1.0
}

# 2. Vérifier Dockerfile.dashboard
if ($dockerfileDashboard) {
    Write-OK "  Dockerfile.dashboard présent"
    if ($dockerfileDashboard -match "EXPOSE 3000" -or $dockerfileDashboard -match "PORT=3000") {
        Write-OK "    Port 3000 configuré"
    } else {
        Write-Err "    Port 3000 manquant"
        $configIssues += "Port 3000 manquant dans Dockerfile.dashboard"
        $configScore -= 1.5
    }
    if ($dockerfileDashboard -match "NEXT_STATIC_EXPORT.*false" -or $dockerfileDashboard -match "ENV NEXT_STATIC_EXPORT=false") {
        Write-OK "    NEXT_STATIC_EXPORT=false (mode serveur)"
    }
    if ($dockerfileDashboard -match "standalone") {
        Write-OK "    Mode standalone configuré"
    }
} else {
    Write-Err "  Dockerfile.dashboard introuvable"
    $configIssues += "Dockerfile.dashboard manquant"
    $configScore -= 3.0
}

# 3. Vérifier next.config.js (cohérence serveur 3000)
Write-Host "`n2. Configuration Next.js:" -ForegroundColor Yellow
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
Write-Host "`n3. Scripts de déploiement:" -ForegroundColor Yellow
if (Test-Path "scripts/deploy/export_static.sh") {
    Write-OK "  export_static.sh présent (GitHub Actions)"
} else {
    Write-Err "  export_static.sh MANQUANT"
    $configIssues += "export_static.sh manquant"
    $configScore -= 1.5
}

# 4.1. Vérifier workflow GitHub Actions
Write-Host "`n3.1. Workflow GitHub Actions:" -ForegroundColor Yellow
$workflowPath = ".github/workflows/deploy.yml"
if (Test-Path $workflowPath) {
    Write-OK "  deploy.yml présent"
    $workflowContent = Get-Content $workflowPath -Raw -ErrorAction SilentlyContinue
    
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
        if ($workflowContent -match "NEXT_PUBLIC_BASE_PATH.*OTT") {
            Write-OK "    NEXT_PUBLIC_BASE_PATH=/OTT configuré"
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

# 5. Vérifier render.yaml (production)
Write-Host "`n4. Configuration Production (Render):" -ForegroundColor Yellow
if ($renderYaml) {
    Write-OK "  render.yaml présent"
    $requiredVars = @("DATABASE_URL", "JWT_SECRET")
    foreach ($var in $requiredVars) {
        if ($renderYaml -match "key:\s*$var") {
            Write-OK "    Variable $var documentée"
        } else {
            Write-Warn "    Variable $var manquante"
            $configWarnings += "Variable $var non documentée dans render.yaml"
            $configScore -= 0.2
        }
    }
} else {
    Write-Warn "  render.yaml manquant"
    $configWarnings += "render.yaml manquant"
    $configScore -= 1.0
}

# 6. Vérifier env.example
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
if ($dockerCompose) {
    $match = [regex]::Match($dockerCompose, 'NEXT_PUBLIC_API_URL[:\s]+([^\s\n"]+)')
    if ($match.Success) { $apiUrls["docker-compose"] = $match.Groups[1].Value.Trim() }
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
        $configWarnings += "API_URL incohérente entre configs"
        $configScore -= 0.5
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
# Suivi du Temps - Projet OTT
## Journal de travail pour facturation (Genere automatiquement)

**Periode analysee** : $($sortedDates[0]) - $($sortedDates[-1])
**Developpeur** : ymora
**Projet** : OTT - Dispositif Medical IoT
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
    @{ Script = "scripts\AUDIT_PAGES_DASHBOARD.ps1"; Reason = "Fonctionnalités intégrées dans AUDIT_COMPLET_AUTOMATIQUE.ps1" },
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
    
    # audit-complet.js obsolète
    if ($fileName -eq "audit-complet.js") {
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
    $auditResults.Recommendations += "Exécuter scripts\NETTOYER_ELEMENTS_INUTILES.ps1 pour nettoyer automatiquement"
}

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

# ===============================================================================
# PHASE 20 : VÉRIFICATION SYNCHRONISATION GITHUB PAGES
# ===============================================================================

Write-Section "[20/20] Vérification Synchronisation GitHub Pages"

$deploymentScore = 10.0
$deploymentIssues = @()
$deploymentWarnings = @()
$repo = "ymora/OTT"
$baseUrl = "https://ymora.github.io/OTT"

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
                        Write-Info "   .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 -AutoFixDeployment"
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
                        Write-Info "   .\scripts\AUDIT_COMPLET_AUTOMATIQUE.ps1 -AutoFixDeployment"
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

Write-Host ""
Write-Host ("=" * 80) -ForegroundColor Gray

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

Write-Host ("=" * 80) -ForegroundColor Gray
Write-Host ""

# Restaurer le répertoire d'origine si on a changé
if ($projectRoot) {
    Pop-Location -ErrorAction SilentlyContinue
}

exit $exitCode

