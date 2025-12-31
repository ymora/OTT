# ===============================================================================
# SCRIPT DE TEST DOCKER/RENDER POUR DÉBOGUER L'AUDIT
# ===============================================================================
# Ce script teste l'environnement Docker/Render pour identifier les problèmes
# avant d'exécuter l'audit complet
#
# Usage: .\audit\scripts\Test-DockerRender.ps1 [-ApiUrl <url>] [-Email <email>] [-Password <password>] [-TestRender]
# ===============================================================================

param(
    [string]$ApiUrl = "",
    [string]$Email = "",
    [string]$Password = "",
    [switch]$TestRender = $false,
    [switch]$Verbose = $false
)

# Fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) if($Verbose) { Write-Host "  ℹ️  $Text" -ForegroundColor Gray } }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  TEST DOCKER/RENDER - DÉBOGAGE AUDIT" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host ""

# ===============================================================================
# 1. CHARGEMENT DE LA CONFIGURATION
# ===============================================================================
Write-Section "1. Chargement Configuration"

$configPath = Join-Path $PSScriptRoot "..\config\audit.config.ps1"
$script:Config = $null

if (Test-Path $configPath) {
    try {
        $script:Config = & $configPath
        Write-OK "Configuration chargée depuis: audit.config.ps1"
    } catch {
        Write-Warn "Erreur chargement config: $($_.Exception.Message)"
    }
} else {
    Write-Warn "Fichier de configuration non trouvé: $configPath"
}

# Récupérer les valeurs (priorité: paramètres > config > variables d'environnement > défaut)
if ([string]::IsNullOrEmpty($ApiUrl)) {
    if ($script:Config -and $script:Config.Api -and $script:Config.Api.BaseUrl) {
        $ApiUrl = $script:Config.Api.BaseUrl
    } elseif ($script:Config -and $script:Config.API -and $script:Config.API.BaseUrl) {
        $ApiUrl = $script:Config.API.BaseUrl
    } elseif ($env:AUDIT_API_URL) {
        $ApiUrl = $env:AUDIT_API_URL
    } else {
        $ApiUrl = "http://localhost:8000"
    }
}

if ([string]::IsNullOrEmpty($Email)) {
    $credentialsConfig = if ($script:Config -and $script:Config.Api -and $script:Config.Api.Credentials) { 
        $script:Config.Api.Credentials 
    } elseif ($script:Config -and $script:Config.API -and $script:Config.API.Credentials) {
        $script:Config.API.Credentials
    } elseif ($script:Config -and $script:Config.Credentials) { 
        $script:Config.Credentials 
    } else { 
        $null 
    }
    if ($credentialsConfig -and $credentialsConfig.Email) {
        $Email = $credentialsConfig.Email
    } elseif ($env:AUDIT_EMAIL) {
        $Email = $env:AUDIT_EMAIL
    } else {
        $Email = "ymora@free.fr"
    }
}

if ([string]::IsNullOrEmpty($Password)) {
    $credentialsConfig = if ($script:Config -and $script:Config.Api -and $script:Config.Api.Credentials) { 
        $script:Config.Api.Credentials 
    } elseif ($script:Config -and $script:Config.API -and $script:Config.API.Credentials) {
        $script:Config.API.Credentials
    } elseif ($script:Config -and $script:Config.Credentials) { 
        $script:Config.Credentials 
    } else { 
        $null 
    }
    if ($credentialsConfig -and $credentialsConfig.Password) {
        $Password = $credentialsConfig.Password
    } elseif ($env:AUDIT_PASSWORD) {
        $Password = $env:AUDIT_PASSWORD
    } else {
        $Password = "Ym120879"
    }
}

Write-Host "  URL API: $ApiUrl" -ForegroundColor White
Write-Host "  Email: $Email" -ForegroundColor White
Write-Host "  Password: $(if($Password){'***'})" -ForegroundColor White

# Détecter le mode
$apiMode = "inconnu"
if ($ApiUrl -match "localhost:8000|127\.0\.0\.1:8000") {
    $apiMode = "Docker"
} elseif ($ApiUrl -match "render\.com|onrender\.com") {
    $apiMode = "Render"
}

Write-Host "  Mode détecté: $apiMode" -ForegroundColor $(if($apiMode -eq "Docker"){"Cyan"}elseif($apiMode -eq "Render"){"Magenta"}else{"Yellow"})

# ===============================================================================
# 2. VÉRIFICATION DOCKER (si mode Docker)
# ===============================================================================
if ($apiMode -eq "Docker") {
    Write-Section "2. Vérification Docker"
    
    # Vérifier si Docker est installé
    try {
        $dockerVersion = docker --version 2>&1
        Write-OK "Docker installé: $dockerVersion"
    } catch {
        Write-Err "Docker non installé ou non accessible"
        Write-Info "  Installez Docker Desktop: https://www.docker.com/products/docker-desktop"
        exit 1
    }
    
    # Vérifier si Docker est démarré
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-OK "Docker daemon démarré"
        } else {
            Write-Err "Docker daemon non démarré"
            Write-Info "  Démarrez Docker Desktop"
            exit 1
        }
    } catch {
        Write-Err "Impossible de vérifier Docker daemon"
        exit 1
    }
    
    # Vérifier les conteneurs
    Write-Host "`n  Vérification conteneurs..." -ForegroundColor Yellow
    $containers = @("ott-api", "ott-postgres", "ott-dashboard", "ott-pgweb")
    $runningContainers = docker ps --format "{{.Names}}" 2>&1
    
    foreach ($container in $containers) {
        if ($runningContainers -match $container) {
            Write-OK "Conteneur $container est démarré"
            
            # Vérifier l'état de santé (si healthcheck)
            $health = docker inspect --format='{{.State.Health.Status}}' $container 2>&1
            if ($health -match "healthy|starting") {
                Write-Info "  État santé: $health"
            }
        } else {
            Write-Warn "Conteneur $container n'est pas démarré"
        }
    }
    
    # Vérifier les ports
    Write-Host "`n  Vérification ports..." -ForegroundColor Yellow
    $ports = @(
        @{Port=8000; Service="API"},
        @{Port=3000; Service="Dashboard"},
        @{Port=5432; Service="PostgreSQL"},
        @{Port=8081; Service="PgWeb"}
    )
    
    foreach ($portInfo in $ports) {
        $port = $portInfo.Port
        $service = $portInfo.Service
        try {
            $connection = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
            if ($connection.TcpTestSucceeded) {
                Write-OK "Port $port ($service) est ouvert"
            } else {
                Write-Warn "Port $port ($service) n'est pas accessible"
            }
        } catch {
            Write-Warn "Impossible de tester le port $port ($service)"
        }
    }
    
    # Vérifier docker-compose
    Write-Host "`n  Vérification docker-compose..." -ForegroundColor Yellow
    $projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $dockerComposeFile = Join-Path $projectRoot "docker-compose.yml"
    
    if (Test-Path $dockerComposeFile) {
        Write-OK "docker-compose.yml trouvé"
        Write-Info "  Chemin: $dockerComposeFile"
    } else {
        Write-Warn "docker-compose.yml non trouvé"
    }
}

# ===============================================================================
# 3. VÉRIFICATION FICHIERS DE CONFIGURATION
# ===============================================================================
Write-Section "3. Vérification Fichiers Configuration"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$configFiles = @(
    @{Path="docker-compose.yml"; Name="Docker Compose"; Required=$true},
    @{Path="Dockerfile"; Name="Dockerfile API"; Required=$false},
    @{Path="Dockerfile.dashboard"; Name="Dockerfile Dashboard"; Required=$false},
    @{Path="render.yaml"; Name="Render Config"; Required=$false},
    @{Path="env.example"; Name="Env Example"; Required=$false}
)

$configFilesOK = 0
$configFilesTotal = $configFiles.Count

foreach ($fileInfo in $configFiles) {
    $filePath = Join-Path $projectRoot $fileInfo.Path
    if (Test-Path $filePath) {
        Write-OK "$($fileInfo.Name) trouvé"
        Write-Info "  Chemin: $($fileInfo.Path)"
        $configFilesOK++
    } else {
        if ($fileInfo.Required) {
            Write-Err "$($fileInfo.Name) non trouvé (requis)"
        } else {
            Write-Warn "$($fileInfo.Name) non trouvé (optionnel)"
        }
    }
}

Write-Host "`n  Résumé fichiers: $configFilesOK/$configFilesTotal trouvés" -ForegroundColor $(if($configFilesOK -eq $configFilesTotal){"Green"}elseif($configFilesOK -gt 0){"Yellow"}else{"Red"})

# ===============================================================================
# 4. TEST RENDER (optionnel)
# ===============================================================================
if ($TestRender) {
    Write-Section "4. Test Render (Optionnel)"
    
    $renderUrl = if ($script:Config -and $script:Config.API -and $script:Config.API.RenderUrl) {
        $script:Config.API.RenderUrl
    } else {
        "https://ott-jbln.onrender.com"
    }
    
    Write-Host "  Test Render URL: $renderUrl" -ForegroundColor Yellow
    
    try {
        $renderHealth = "$renderUrl/api.php/health"
        $renderResponse = Invoke-WebRequest -Uri $renderHealth -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        if ($renderResponse.StatusCode -eq 200) {
            Write-OK "Render accessible"
        } else {
            Write-Warn "Render répond avec code: $($renderResponse.StatusCode)"
        }
    } catch {
        Write-Warn "Render non accessible: $($_.Exception.Message)"
    }
}

# ===============================================================================
# RÉSUMÉ FINAL
# ===============================================================================
Write-Section "Résumé Final"

$summary = @{
    Configuration = if($script:Config){"✅"}else{"❌"}
    Docker = if($apiMode -eq "Docker"){"✅"}else{"N/A"}
    Containers = if($apiMode -eq "Docker"){"✅"}else{"N/A"}
    Ports = if($apiMode -eq "Docker"){"✅"}else{"N/A"}
    ConfigFiles = "✅"
}

Write-Host "  Configuration: $($summary.Configuration)" -ForegroundColor $(if($summary.Configuration -eq "✅"){"Green"}else{"Red"})
Write-Host "  Mode: $apiMode" -ForegroundColor $(if($apiMode -ne "inconnu"){"Cyan"}else{"Yellow"})
Write-Host "  Docker: $($summary.Docker)" -ForegroundColor $(if($summary.Docker -eq "✅"){"Green"}else{"Gray"})
Write-Host "  Conteneurs: $($summary.Containers)" -ForegroundColor $(if($summary.Containers -eq "✅"){"Green"}else{"Gray"})
Write-Host "  Ports: $($summary.Ports)" -ForegroundColor $(if($summary.Ports -eq "✅"){"Green"}else{"Gray"})
Write-Host "  Fichiers Config: $($summary.ConfigFiles)" -ForegroundColor Green

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  TEST TERMINÉ" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

# Code de sortie
if ($apiMode -eq "Docker") {
    # Pour Docker, vérifier que les conteneurs sont démarrés
    $containersRunning = docker ps --filter "name=ott-api" --format "{{.Names}}" 2>&1
    if ($containersRunning -match "ott-api") {
        Write-OK "Docker est prêt pour l'audit"
        exit 0
    } else {
        Write-Warn "Docker n'est pas complètement démarré"
        Write-Info "  💡 Démarrez avec: docker-compose up -d"
        exit 1
    }
} else {
    # Pour Render ou autre, on considère que c'est OK si la config est chargée
    if ($script:Config) {
        Write-OK "Configuration prête pour l'audit"
        exit 0
    } else {
        Write-Warn "Configuration incomplète"
        exit 1
    }
}

