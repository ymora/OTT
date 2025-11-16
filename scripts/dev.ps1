# ============================================================================
# Script unifie pour le developpement local OTT
# ============================================================================
# Remplace tous les autres scripts PowerShell
# Usage: .\scripts\dev.ps1 [action]
# Actions: start, stop, restart, test, build, setup
# ============================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "restart", "test", "build", "setup", "clean")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"

# Couleurs
function Write-Info { param([string]$msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param([string]$msg) Write-Host $msg -ForegroundColor Green }
function Write-Warning { param([string]$msg) Write-Host $msg -ForegroundColor Yellow }
function Write-Error { param([string]$msg) Write-Host $msg -ForegroundColor Red }

# Configuration
$ports = @(3000, 5432, 8080, 8081)
$currentDir = Get-Location

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OTT - Script de developpement unifie" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# FONCTIONS
# ============================================================================

function Stop-Ports {
    Write-Info "Arret des processus sur les ports: $($ports -join ', ')"
    foreach ($port in $ports) {
        $process = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "  Port $port est utilise par PID $process. Arret..." -ForegroundColor Gray
            Stop-Process -Id $process -Force -ErrorAction SilentlyContinue
            if ($LASTEXITCODE -eq 0 -or $?) {
                Write-Success "  Port $port libere"
            }
        } else {
            Write-Host "  Port $port est libre" -ForegroundColor DarkGreen
        }
    }
}

function Restart-Docker {
    Write-Info "Redemarrage de PostgreSQL Docker..."
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        $container = docker ps -a --filter "name=ott-db" --format "{{.Names}}" 2>&1
        if ($container -match "ott-db") {
            docker restart ott-db 2>&1 | Out-Null
            Write-Success "  Conteneur ott-db redemarre"
        } else {
            Write-Warning "  Conteneur ott-db non trouve (ignorer si non utilise)"
        }
    } else {
        Write-Warning "  Docker non installe (ignorer si non utilise)"
    }
}

function Check-Dependencies {
    Write-Info "Verification des dependances..."
    
    # Node.js
    try {
        $nodeVersion = node -v 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "  Node.js: $nodeVersion"
        } else {
            throw "Node.js non trouve"
        }
    } catch {
        Write-Error "  Node.js non installe"
        exit 1
    }
    
    # npm
    try {
        $npmVersion = npm -v 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Success "  npm: $npmVersion"
        } else {
            throw "npm non trouve"
        }
    } catch {
        Write-Error "  npm non installe"
        exit 1
    }
    
    # node_modules
    if (-not (Test-Path "node_modules")) {
        Write-Warning "  node_modules non trouve. Installation..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "  Echec de l'installation"
            exit 1
        }
        Write-Success "  Dependances installees"
    } else {
        Write-Success "  Dependances OK"
    }
}

function Setup-EnvLocal {
    Write-Info "Configuration .env.local..."
    
    if (-not (Test-Path ".env.local")) {
        Write-Warning "  .env.local non trouve. Creation avec API Render..."
        @"
# Configuration Frontend OTT - Developpement Local
# Utilise l'API Render par defaut (plus simple pour tester)
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@ | Out-File -FilePath ".env.local" -Encoding UTF8
        Write-Success "  Fichier .env.local cree avec API Render"
        Write-Host "  Pour utiliser une API locale, modifiez NEXT_PUBLIC_API_URL" -ForegroundColor Gray
    } else {
        Write-Success "  .env.local trouve"
        $envContent = Get-Content ".env.local" -Raw
        if ($envContent -match "NEXT_PUBLIC_API_URL=(.+)") {
            $apiUrl = $matches[1].Trim()
            Write-Host "  API configuree: $apiUrl" -ForegroundColor Gray
        }
    }
}

function Clean-Build {
    Write-Info "Nettoyage des fichiers de build..."
    
    $dirs = @(".next", "out", "node_modules/.cache")
    foreach ($dir in $dirs) {
        if (Test-Path $dir) {
            Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Success "  Dossier $dir supprime"
        }
    }
}

function Test-Build {
    Write-Info "Test du build pour GitHub Pages..."
    Write-Host ""
    
    Clean-Build
    
    $env:NEXT_PUBLIC_API_URL = "https://ott-jbln.onrender.com"
    $env:NEXT_PUBLIC_REQUIRE_AUTH = "true"
    $env:NEXT_PUBLIC_ENABLE_DEMO_RESET = "false"
    $env:NEXT_STATIC_EXPORT = "true"
    $env:NEXT_PUBLIC_BASE_PATH = "/OTT"
    $env:NODE_ENV = "production"
    
    npm run export 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Build reussi!"
        
        if (Test-Path "out/index.html") {
            $content = Get-Content "out/index.html" -Raw
            if ($content -match "OTT Dashboard") {
                Write-Success "  index.html contient l'application"
            }
        }
        
        if (-not (Test-Path "out/.nojekyll")) {
            New-Item -Path "out/.nojekyll" -ItemType File -Force | Out-Null
            Write-Success "  .nojekyll cree"
        }
    } else {
        Write-Error "Build echoue"
        exit 1
    }
}

function Start-DevServer {
    Write-Info "Demarrage du serveur Next.js..."
    Write-Host "  Le serveur sera accessible sur http://localhost:3000" -ForegroundColor Gray
    Write-Host "  Appuyez sur Ctrl+C pour arreter" -ForegroundColor Gray
    Write-Host ""
    
    # Nettoyer le cache avant de demarrer (important pour eviter les erreurs)
    if (Test-Path ".next") {
        Write-Host "  Nettoyage du cache Next.js..." -ForegroundColor Gray
        Remove-Item -Path ".next" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Success "  Cache nettoye"
    }
    
    # S'assurer que NODE_ENV n'est pas en production en dev
    $env:NODE_ENV = "development"
    $env:NEXT_STATIC_EXPORT = "false"
    Remove-Item Env:\NEXT_PUBLIC_BASE_PATH -ErrorAction SilentlyContinue
    
    # Lancer en arriere-plan
    $job = Start-Job -ScriptBlock {
        Set-Location $using:currentDir
        npm run dev 2>&1
    }
    
    # Attendre le demarrage
    Write-Host "  Attente du demarrage..." -ForegroundColor Gray
    $maxAttempts = 30
    $attempt = 0
    $serverReady = $false
    
    while ($attempt -lt $maxAttempts -and -not $serverReady) {
        Start-Sleep -Seconds 1
        $attempt++
        
        $port3000 = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
        if ($port3000) {
            $serverReady = $true
            Write-Success "  Serveur demarre sur le port 3000"
        } else {
            Write-Host "." -NoNewline -ForegroundColor Gray
        }
    }
    
    Write-Host ""
    Write-Host ""
    
    if ($serverReady) {
        Write-Success "Serveur Next.js demarre avec succes!"
        Write-Host ""
        Write-Info "Ouverture du navigateur..."
        Start-Sleep -Seconds 1
        Start-Process "http://localhost:3000"
        Write-Success "Page ouverte dans votre navigateur"
        Write-Host ""
        Write-Info "Logs du serveur (Ctrl+C pour arreter):"
        Write-Host "----------------------------------------" -ForegroundColor Gray
        Write-Host ""
        
        # Afficher les logs
        try {
            while ($true) {
                $output = Receive-Job -Job $job -ErrorAction SilentlyContinue
                if ($output) {
                    $output | ForEach-Object { Write-Host $_ }
                }
                Start-Sleep -Milliseconds 500
            }
        } catch {
            Write-Host ""
            Write-Warning "Arret du serveur"
        } finally {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Remove-Job -Job $job -ErrorAction SilentlyContinue
        }
    } else {
        Write-Error "Le serveur n'a pas demarre dans les delais"
        Write-Host ""
        Write-Info "Logs d'erreur:"
        Receive-Job -Job $job | ForEach-Object { Write-Host $_ }
        Stop-Job -Job $job -ErrorAction SilentlyContinue
        Remove-Job -Job $job -ErrorAction SilentlyContinue
        exit 1
    }
}

# ============================================================================
# ACTIONS
# ============================================================================

switch ($Action) {
    "stop" {
        Write-Info "Arret des services..."
        Stop-Ports
        Write-Success "Services arretes"
    }
    
    "clean" {
        Write-Info "Nettoyage complet..."
        Stop-Ports
        Clean-Build
        Write-Success "Nettoyage termine"
    }
    
    "restart" {
        Write-Info "Redemarrage de l'environnement..."
        Stop-Ports
        Restart-Docker
        Check-Dependencies
        Setup-EnvLocal
        Start-DevServer
    }
    
    "test" {
        Write-Info "Tests du build..."
        Check-Dependencies
        Test-Build
        Write-Success "Tests termines"
    }
    
    "build" {
        Write-Info "Build de production..."
        Check-Dependencies
        Test-Build
        Write-Success "Build termine dans out/"
    }
    
    "setup" {
        Write-Info "Configuration initiale..."
        Check-Dependencies
        Setup-EnvLocal
        Write-Success "Configuration terminee"
        Write-Host ""
        Write-Info "Lancez maintenant: .\scripts\dev.ps1 start"
    }
    
    "start" {
        Write-Info "Demarrage de l'environnement de developpement..."
        Stop-Ports
        Restart-Docker
        Check-Dependencies
        Setup-EnvLocal
        Write-Host ""
        Start-DevServer
    }
    
    default {
        Write-Error "Action inconnue: $Action"
        Write-Host ""
        Write-Host "Usage: .\scripts\dev.ps1 [action]" -ForegroundColor Yellow
        Write-Host "Actions disponibles:" -ForegroundColor Yellow
        Write-Host "  start   - Demarrer l'environnement (defaut)" -ForegroundColor Gray
        Write-Host "  stop    - Arreter les services" -ForegroundColor Gray
        Write-Host "  restart - Redemarrer l'environnement" -ForegroundColor Gray
        Write-Host "  clean   - Nettoyer les fichiers de build" -ForegroundColor Gray
        Write-Host "  test    - Tester le build pour GitHub Pages" -ForegroundColor Gray
        Write-Host "  build   - Build de production" -ForegroundColor Gray
        Write-Host "  setup   - Configuration initiale" -ForegroundColor Gray
        exit 1
    }
}

