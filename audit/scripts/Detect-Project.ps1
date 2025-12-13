# ===============================================================================
# DÉTECTION AUTOMATIQUE DU PROJET
# ===============================================================================
# Détecte automatiquement les caractéristiques du projet à auditer
# et génère un fichier project_metadata.json
# ===============================================================================

param(
    [string]$ProjectRoot = "",
    [string]$OutputFile = "project_metadata.json"
)

function Write-Info { param([string]$Text) Write-Host "  [INFO] $Text" -ForegroundColor Gray }
function Write-OK { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }

# Détecter le répertoire racine
if ([string]::IsNullOrEmpty($ProjectRoot)) {
    $ProjectRoot = Get-Location
}

if (-not (Test-Path $ProjectRoot)) {
    Write-Error "Répertoire introuvable: $ProjectRoot"
    exit 1
}

Write-Host "`n🔍 Détection automatique du projet..." -ForegroundColor Cyan
Write-Host "Répertoire: $ProjectRoot" -ForegroundColor White

$metadata = @{
    detectedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    projectRoot = $ProjectRoot
    projectType = "unknown"
    technologies = @()
    hasApi = $false
    hasFrontend = $false
    hasDatabase = $false
    hasFirmware = $false
    project = @{
        name = ""
        description = ""
        version = ""
        company = ""
    }
    api = @{
        baseUrl = ""
        authEndpoint = ""
        endpoints = @()
    }
    frontend = @{
        framework = ""
        routes = @()
        buildTool = ""
    }
    database = @{
        type = ""
        schemaFile = ""
        expectedTables = @()
    }
    github = @{
        repo = ""
        baseUrl = ""
        basePath = ""
    }
    firmware = @{
        directory = ""
        mainFile = ""
        version = ""
    }
}

# ===============================================================================
# DÉTECTION DU TYPE DE PROJET
# ===============================================================================

Write-Info "Détection du type de projet..."

# Vérifier package.json (Node.js/React/Next.js)
if (Test-Path (Join-Path $ProjectRoot "package.json")) {
    try {
        $packageJson = Get-Content (Join-Path $ProjectRoot "package.json") -Raw | ConvertFrom-Json
        $metadata.project.name = $packageJson.name
        $metadata.project.version = $packageJson.version
        $metadata.project.description = $packageJson.description
        
        if ($packageJson.dependencies -or $packageJson.devDependencies) {
            $deps = @{}
            if ($packageJson.dependencies) { $deps += $packageJson.dependencies.PSObject.Properties | ForEach-Object { @{$_.Name = $_.Value} } }
            if ($packageJson.devDependencies) { $deps += $packageJson.devDependencies.PSObject.Properties | ForEach-Object { @{$_.Name = $_.Value} } }
            
            if ($deps.'next') {
                $metadata.projectType = "nextjs"
                $metadata.frontend.framework = "Next.js"
                $metadata.technologies += "Next.js"
                $metadata.hasFrontend = $true
            } elseif ($deps.'react') {
                $metadata.projectType = "react"
                $metadata.frontend.framework = "React"
                $metadata.technologies += "React"
                $metadata.hasFrontend = $true
            } else {
                $metadata.projectType = "nodejs"
                $metadata.technologies += "Node.js"
            }
        }
        
        Write-OK "Projet Node.js détecté: $($metadata.project.name)"
    } catch {
        Write-Warn "Erreur lecture package.json: $($_.Exception.Message)"
    }
}

# Vérifier composer.json (PHP)
if (Test-Path (Join-Path $ProjectRoot "composer.json")) {
    try {
        $composerJson = Get-Content (Join-Path $ProjectRoot "composer.json") -Raw | ConvertFrom-Json
        if (-not $metadata.project.name) {
            $metadata.project.name = $composerJson.name
        }
        $metadata.technologies += "PHP"
        $metadata.hasApi = $true
        Write-OK "Projet PHP détecté"
    } catch {
        Write-Warn "Erreur lecture composer.json"
    }
}

# Vérifier api.php (API PHP)
if (Test-Path (Join-Path $ProjectRoot "api.php")) {
    $metadata.hasApi = $true
    $metadata.technologies += "PHP API"
    Write-OK "API PHP détectée (api.php)"
}

# Vérifier next.config.js (Next.js)
if (Test-Path (Join-Path $ProjectRoot "next.config.js")) {
    $metadata.projectType = "nextjs"
    $metadata.frontend.framework = "Next.js"
    $metadata.hasFrontend = $true
    Write-OK "Next.js détecté (next.config.js)"
}

# Vérifier app/ directory (Next.js App Router)
if (Test-Path (Join-Path $ProjectRoot "app")) {
    $metadata.hasFrontend = $true
    Write-Info "Structure App Router détectée"
    
    # Détecter les routes
    $appPages = Get-ChildItem -Path (Join-Path $ProjectRoot "app") -Recurse -Filter "page.js" -ErrorAction SilentlyContinue
    foreach ($page in $appPages) {
        $relativePath = $page.FullName.Replace($ProjectRoot, "").Replace("\", "/")
        $route = $relativePath.Replace("/app", "").Replace("/page.js", "")
        if ([string]::IsNullOrEmpty($route)) { $route = "/" }
        $metadata.frontend.routes += @{
            route = $route
            file = $relativePath
            name = Split-Path $route -Leaf
        }
    }
    Write-OK "$($metadata.frontend.routes.Count) route(s) détectée(s)"
}

# ===============================================================================
# DÉTECTION API
# ===============================================================================

Write-Info "Détection de l'API..."

# Chercher les endpoints dans api.php
if (Test-Path (Join-Path $ProjectRoot "api.php")) {
    $apiContent = Get-Content (Join-Path $ProjectRoot "api.php") -Raw -ErrorAction SilentlyContinue
    if ($apiContent) {
        # Détecter les routes API
        $apiMatches = [regex]::Matches($apiContent, "['""]/([^'""]+)['""]")
        foreach ($match in $apiMatches) {
            $endpoint = $match.Groups[1].Value
            if ($endpoint -notmatch '^\$' -and $endpoint -notmatch '^\s*$') {
                if ($metadata.api.endpoints -notcontains $endpoint) {
                    $metadata.api.endpoints += "/$endpoint"
                }
            }
        }
        
        # Détecter l'endpoint d'authentification
        if ($apiContent -match "auth.*login|login.*auth") {
            $metadata.api.authEndpoint = "/api.php/auth/login"
        }
    }
}

# Chercher dans api/handlers/
if (Test-Path (Join-Path $ProjectRoot "api\handlers")) {
    $handlers = Get-ChildItem -Path (Join-Path $ProjectRoot "api\handlers") -Recurse -Filter "*.php" -ErrorAction SilentlyContinue
    Write-OK "$($handlers.Count) handler(s) API détecté(s)"
}

# ===============================================================================
# DÉTECTION BASE DE DONNÉES
# ===============================================================================

Write-Info "Détection de la base de données..."

# Chercher schema.sql
$schemaFiles = @(
    (Join-Path $ProjectRoot "sql\schema.sql"),
    (Join-Path $ProjectRoot "schema.sql"),
    (Join-Path $ProjectRoot "database\schema.sql")
)

foreach ($schemaFile in $schemaFiles) {
    if (Test-Path $schemaFile) {
        $metadata.database.schemaFile = $schemaFile.Replace($ProjectRoot, "").Replace("\", "/")
        $metadata.hasDatabase = $true
        $metadata.database.type = "PostgreSQL"  # Par défaut, peut être détecté
        
        # Extraire les tables du schéma
        $schemaContent = Get-Content $schemaFile -Raw -ErrorAction SilentlyContinue
        if ($schemaContent) {
            $tableMatches = [regex]::Matches($schemaContent, "CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\w+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
            foreach ($match in $tableMatches) {
                $tableName = $match.Groups[1].Value
                if ($metadata.database.expectedTables -notcontains $tableName) {
                    $metadata.database.expectedTables += $tableName
                }
            }
        }
        
        Write-OK "Schéma BDD détecté: $($metadata.database.schemaFile)"
        Write-OK "$($metadata.database.expectedTables.Count) table(s) détectée(s)"
        break
    }
}

# ===============================================================================
# DÉTECTION GITHUB
# ===============================================================================

Write-Info "Détection GitHub..."

if (Test-Path (Join-Path $ProjectRoot ".git")) {
    try {
        Push-Location $ProjectRoot
        $remoteUrl = git remote get-url origin 2>$null
        if ($remoteUrl) {
            # Parser l'URL GitHub
            if ($remoteUrl -match "github\.com[:/]([^/]+)/([^/\.]+)") {
                $username = $matches[1]
                $repo = $matches[2]
                $metadata.github.repo = "$username/$repo"
                $metadata.github.baseUrl = "https://$username.github.io/$repo"
                $metadata.github.basePath = "/$repo"
                Write-OK "GitHub détecté: $($metadata.github.repo)"
            }
        }
        Pop-Location
    } catch {
        Write-Info "GitHub non détecté"
    }
}

# ===============================================================================
# DÉTECTION FIRMWARE
# ===============================================================================

Write-Info "Détection firmware..."

$firmwareDirs = @(
    (Join-Path $ProjectRoot "hardware\firmware"),
    (Join-Path $ProjectRoot "firmware"),
    (Join-Path $ProjectRoot "arduino"),
    (Join-Path $ProjectRoot "esp32")
)

foreach ($fwDir in $firmwareDirs) {
    if (Test-Path $fwDir) {
        $inoFiles = Get-ChildItem -Path $fwDir -Recurse -Filter "*.ino" -ErrorAction SilentlyContinue
        if ($inoFiles.Count -gt 0) {
            $metadata.hasFirmware = $true
            $metadata.firmware.directory = $fwDir.Replace($ProjectRoot, "").Replace("\", "/")
            
            # Trouver le fichier principal (le plus volumineux ou avec "main" dans le nom)
            $mainFile = $inoFiles | Sort-Object { $_.Length } -Descending | Select-Object -First 1
            if ($mainFile) {
                $metadata.firmware.mainFile = $mainFile.FullName.Replace($ProjectRoot, "").Replace("\", "/")
                
                # Détecter la version
                $fwContent = Get-Content $mainFile.FullName -Raw -ErrorAction SilentlyContinue
                if ($fwContent -match 'version\s*[=:]\s*["'']?([\d.]+)["'']?|v(\d+\.\d+)') {
                    $metadata.firmware.version = if ($matches[1]) { $matches[1] } else { $matches[2] }
                }
            }
            
            Write-OK "Firmware détecté: $($metadata.firmware.directory)"
            break
        }
    }
}

# ===============================================================================
# DÉTECTION NOM DU PROJET
# ===============================================================================

if ([string]::IsNullOrEmpty($metadata.project.name)) {
    # Essayer depuis le nom du répertoire
    $dirName = Split-Path $ProjectRoot -Leaf
    $metadata.project.name = $dirName
    Write-Info "Nom du projet (depuis répertoire): $dirName"
}

# Chercher dans README.md
if (Test-Path (Join-Path $ProjectRoot "README.md")) {
    $readme = Get-Content (Join-Path $ProjectRoot "README.md") -Raw -ErrorAction SilentlyContinue
    if ($readme) {
        if ($readme -match '#\s+(.+)') {
            if ([string]::IsNullOrEmpty($metadata.project.name)) {
                $metadata.project.name = $matches[1].Trim()
            }
        }
        if ($readme -match '##\s+Description\s*\n\n(.+?)(?:\n\n|$)') {
            $metadata.project.description = $matches[1].Trim()
        }
    }
}

# ===============================================================================
# SAUVEGARDE DES MÉTADONNÉES
# ===============================================================================

$outputPath = Join-Path $ProjectRoot $OutputFile
$metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputPath -Encoding UTF8 -Force

Write-Host "`n✅ Métadonnées du projet détectées et sauvegardées:" -ForegroundColor Green
Write-Host "   Fichier: $outputPath" -ForegroundColor White
Write-Host "`n📊 Résumé:" -ForegroundColor Cyan
Write-Host "   Type: $($metadata.projectType)" -ForegroundColor White
Write-Host "   Nom: $($metadata.project.name)" -ForegroundColor White
Write-Host "   Technologies: $($metadata.technologies -join ', ')" -ForegroundColor White
Write-Host "   API: $(if ($metadata.hasApi) { 'Oui' } else { 'Non' })" -ForegroundColor White
Write-Host "   Frontend: $(if ($metadata.hasFrontend) { $metadata.frontend.framework } else { 'Non' })" -ForegroundColor White
Write-Host "   Base de données: $(if ($metadata.hasDatabase) { "$($metadata.database.expectedTables.Count) tables" } else { 'Non' })" -ForegroundColor White
Write-Host "   Firmware: $(if ($metadata.hasFirmware) { 'Oui' } else { 'Non' })" -ForegroundColor White

return $metadata

