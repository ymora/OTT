# ================================================================================
# Script de configuration Cloudflare Tunnel
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Configure cloudflared pour exposer le site Docker local à l'extérieur
# ================================================================================
# 
# PRÉREQUIS :
# 1. Avoir un compte Cloudflare (gratuit)
# 2. Avoir un domaine configuré sur Cloudflare
# 3. Avoir installé cloudflared : https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
#
# UTILISATION :
# 1. Exécuter ce script pour créer le tunnel
# 2. Configurer votre domaine dans Cloudflare
# 3. Démarrer le tunnel avec : cloudflared tunnel run ott-tunnel
# ================================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$TunnelName = "ott-tunnel",
    
    [Parameter(Mandatory=$false)]
    [string]$Domain = "",
    
    [Parameter(Mandatory=$false)]
    [string]$DashboardSubdomain = "ott",
    
    [Parameter(Mandatory=$false)]
    [string]$ApiSubdomain = "api-ott"
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

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "🌐 CONFIGURATION CLOUDFLARE TUNNEL POUR OTT" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""

# Vérifier que cloudflared est installé
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Error "cloudflared n'est pas installé."
    Write-Info "Téléchargez cloudflared depuis : https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/"
    Write-Info "Ou avec winget : winget install --id Cloudflare.cloudflared"
    exit 1
}
Write-Success "cloudflared est installé"

# Vérifier l'authentification
Write-Info "Vérification de l'authentification Cloudflare..."
$authCheck = cloudflared tunnel list 2>&1
if ($LASTEXITCODE -ne 0 -or $authCheck -match "error|unauthorized") {
    Write-Warning "Vous n'êtes pas authentifié avec Cloudflare."
    Write-Info "Exécutez : cloudflared tunnel login"
    Write-Info "Cela ouvrira votre navigateur pour vous connecter à Cloudflare."
    $continue = Read-Host "Voulez-vous continuer quand même ? (o/N)"
    if ($continue -ne "o" -and $continue -ne "O") {
        exit 0
    }
}

# Demander le domaine si non fourni
if ([string]::IsNullOrWhiteSpace($Domain)) {
    Write-Info "Pour utiliser Cloudflare Tunnel, vous devez avoir un domaine configuré sur Cloudflare."
    $Domain = Read-Host "Entrez votre domaine Cloudflare (ex: happlyz.com)"
    if ([string]::IsNullOrWhiteSpace($Domain)) {
        Write-Error "Le domaine est requis pour continuer."
        exit 1
    }
}

# Créer le tunnel
Write-Info "Création du tunnel '$TunnelName'..."
$tunnelCreate = cloudflared tunnel create $TunnelName 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Tunnel '$TunnelName' créé avec succès"
} else {
    if ($tunnelCreate -match "already exists") {
        Write-Warning "Le tunnel '$TunnelName' existe déjà."
    } else {
        Write-Error "Erreur lors de la création du tunnel : $tunnelCreate"
        exit 1
    }
}

# Créer le dossier de configuration
$configDir = "$env:USERPROFILE\.cloudflared"
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    Write-Success "Dossier de configuration créé : $configDir"
}

# Récupérer l'ID du tunnel
Write-Info "Récupération de l'ID du tunnel..."
$tunnelList = cloudflared tunnel list 2>&1
$tunnelId = ($tunnelList | Select-String -Pattern $TunnelName | ForEach-Object { ($_ -split '\s+')[0] }) | Select-Object -First 1

if ([string]::IsNullOrWhiteSpace($tunnelId)) {
    Write-Error "Impossible de trouver l'ID du tunnel '$TunnelName'"
    exit 1
}

Write-Success "ID du tunnel : $tunnelId"

# Créer le fichier de configuration
$configFile = "$configDir\config.yml"
$dashboardHostname = "$DashboardSubdomain.$Domain"
$apiHostname = "$ApiSubdomain.$Domain"

$configContent = @"
tunnel: $tunnelId
credentials-file: $configDir\$tunnelId.json

ingress:
  # Dashboard Next.js
  - hostname: $dashboardHostname
    service: http://localhost:3000
  
  # API PHP
  - hostname: $apiHostname
    service: http://localhost:8000
  
  # Catch-all (doit être en dernier)
  - service: http_status:404
"@

Set-Content -Path $configFile -Value $configContent -Encoding UTF8
Write-Success "Fichier de configuration créé : $configFile"

# Configurer les routes DNS
Write-Info "Configuration des routes DNS dans Cloudflare..."
Write-Warning "Assurez-vous que votre domaine '$Domain' est bien configuré sur Cloudflare."

$routeDashboard = cloudflared tunnel route dns $TunnelName $dashboardHostname 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Route DNS créée pour $dashboardHostname"
} else {
    Write-Warning "Erreur lors de la création de la route DNS pour $dashboardHostname : $routeDashboard"
    Write-Info "Vous pouvez créer la route manuellement dans l'interface Cloudflare"
}

$routeApi = cloudflared tunnel route dns $TunnelName $apiHostname 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Route DNS créée pour $apiHostname"
} else {
    Write-Warning "Erreur lors de la création de la route DNS pour $apiHostname : $routeApi"
    Write-Info "Vous pouvez créer la route manuellement dans l'interface Cloudflare"
}

# Afficher les instructions finales
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "✅ CONFIGURATION TERMINÉE" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host ""
Write-Info "URLs configurées :"
Write-Host "  📊 Dashboard : https://$dashboardHostname" -ForegroundColor Yellow
Write-Host "  🔌 API       : https://$apiHostname" -ForegroundColor Yellow
Write-Host ""
Write-Info "Pour démarrer le tunnel, exécutez :"
Write-Host "  cloudflared tunnel run $TunnelName" -ForegroundColor Cyan
Write-Host ""
Write-Info "Pour démarrer le tunnel en arrière-plan (Windows) :"
Write-Host "  Start-Process cloudflared -ArgumentList 'tunnel','run','$TunnelName' -WindowStyle Hidden" -ForegroundColor Cyan
Write-Host ""
Write-Warning "IMPORTANT :"
Write-Host "  1. Assurez-vous que Docker est démarré (docker-compose up -d)"
Write-Host "  2. Mettez à jour CORS_ALLOWED_ORIGINS dans docker-compose.yml avec :"
Write-Host "     CORS_ALLOWED_ORIGINS: http://localhost:3000,http://localhost:3003,https://$dashboardHostname"
Write-Host "  3. Mettez à jour NEXT_PUBLIC_API_URL dans docker-compose.yml avec :"
Write-Host "     NEXT_PUBLIC_API_URL: https://$apiHostname"
Write-Host ""






