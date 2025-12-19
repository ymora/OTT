# ================================================================================
# Script d'exposition externe avec ngrok
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Expose le site Docker local à l'extérieur via ngrok
# ================================================================================

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dashboard", "api", "both")]
    [string]$Service = "dashboard",
    
    [Parameter(Mandatory=$false)]
    [int]$DashboardPort = 3000,
    
    [Parameter(Mandatory=$false)]
    [int]$ApiPort = 8000
)

# Couleurs pour les messages
function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

# Vérifier que ngrok est installé
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Error "ngrok n'est pas installé."
    Write-Info "Téléchargez ngrok depuis : https://ngrok.com/download"
    Write-Info "Après installation, configurez votre token avec : ngrok config add-authtoken VOTRE_TOKEN"
    exit 1
}

# Vérifier que Docker est en cours d'exécution
Write-Info "Vérification de Docker..."
$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker n'est pas en cours d'exécution."
    Write-Info "Démarrez d'abord Docker avec : docker-compose up -d"
    exit 1
}
Write-Success "Docker est en cours d'exécution"

# Vérifier que les services Docker sont actifs
Write-Info "Vérification des services Docker..."
$dashboardRunning = docker ps --filter "name=ott-dashboard" --format "{{.Names}}" 2>&1
$apiRunning = docker ps --filter "name=ott-api" --format "{{.Names}}" 2>&1

if ($Service -eq "dashboard" -or $Service -eq "both") {
    if (-not $dashboardRunning) {
        Write-Warning "Le service dashboard n'est pas en cours d'exécution."
        Write-Info "Démarrez-le avec : docker-compose up -d dashboard"
    } else {
        Write-Success "Dashboard Docker est actif"
    }
}

if ($Service -eq "api" -or $Service -eq "both") {
    if (-not $apiRunning) {
        Write-Warning "Le service API n'est pas en cours d'exécution."
        Write-Info "Démarrez-le avec : docker-compose up -d api"
    } else {
        Write-Success "API Docker est active"
    }
}

# Vérifier que les ports sont disponibles
Write-Info "Vérification des ports..."
if ($Service -eq "dashboard" -or $Service -eq "both") {
    $port3000 = Get-NetTCPConnection -LocalPort $DashboardPort -ErrorAction SilentlyContinue
    if (-not $port3000) {
        Write-Warning "Le port $DashboardPort n'est pas en écoute. Vérifiez que le dashboard est démarré."
    } else {
        Write-Success "Port $DashboardPort est en écoute"
    }
}

if ($Service -eq "api" -or $Service -eq "both") {
    $port8000 = Get-NetTCPConnection -LocalPort $ApiPort -ErrorAction SilentlyContinue
    if (-not $port8000) {
        Write-Warning "Le port $ApiPort n'est pas en écoute. Vérifiez que l'API est démarrée."
    } else {
        Write-Success "Port $ApiPort est en écoute"
    }
}

# Afficher les instructions
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "🚀 PRÊT À EXPOSER LE SITE À L'EXTÉRIEUR" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

if ($Service -eq "dashboard") {
    Write-Info "Service à exposer : Dashboard (port $DashboardPort)"
    Write-Info "Commande ngrok qui sera exécutée : ngrok http $DashboardPort"
    Write-Host ""
    Write-Warning "IMPORTANT : Après avoir obtenu l'URL ngrok, mettez à jour CORS_ALLOWED_ORIGINS dans docker-compose.yml"
    Write-Host ""
    Write-Info "Appuyez sur Ctrl+C pour arrêter ngrok"
    Write-Host ""
    Start-Sleep -Seconds 3
    
    # Démarrer ngrok
    ngrok http $DashboardPort
}
elseif ($Service -eq "api") {
    Write-Info "Service à exposer : API (port $ApiPort)"
    Write-Info "Commande ngrok qui sera exécutée : ngrok http $ApiPort"
    Write-Host ""
    Write-Warning "IMPORTANT : Après avoir obtenu l'URL ngrok, mettez à jour CORS_ALLOWED_ORIGINS dans docker-compose.yml"
    Write-Host ""
    Write-Info "Appuyez sur Ctrl+C pour arrêter ngrok"
    Write-Host ""
    Start-Sleep -Seconds 3
    
    # Démarrer ngrok
    ngrok http $ApiPort
}
elseif ($Service -eq "both") {
    Write-Info "Services à exposer : Dashboard (port $DashboardPort) et API (port $ApiPort)"
    Write-Host ""
    Write-Warning "Pour exposer les deux services, vous devez ouvrir DEUX terminaux :"
    Write-Host "  Terminal 1 : .\scripts\expose-ngrok.ps1 -Service dashboard"
    Write-Host "  Terminal 2 : .\scripts\expose-ngrok.ps1 -Service api"
    Write-Host ""
    Write-Info "Ou utilisez cloudflared qui peut exposer plusieurs services simultanément."
    Write-Host ""
    exit 0
}



