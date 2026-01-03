# Script pour lancer l'application complète (Docker + Frontend)
# Usage: .\scripts\dev\start_app.ps1
#
# Ce script lance automatiquement:
# - Docker (PostgreSQL + API PHP)
# - Frontend Next.js (npm run dev)
#
# Configuration recommandée:
# - docker-compose.yml: Services db + api
# - .env.local: NEXT_PUBLIC_API_URL=http://localhost:8000

$ErrorActionPreference = "Stop"

Write-Host "🚀 DÉMARRAGE APPLICATION OTT" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""

# Vérifier qu'on est dans le bon répertoire
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Ce script doit être exécuté depuis la racine du projet!" -ForegroundColor Red
    exit 1
}

# ============================================================================
# ÉTAPE 1: Vérifier Docker
# ============================================================================
Write-Host "📋 ÉTAPE 1/4: Vérification Docker..." -ForegroundColor Yellow

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker n'est pas installé" -ForegroundColor Red
    Write-Host "   Installez Docker Desktop depuis: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Docker détecté" -ForegroundColor Green
Write-Host ""

# ============================================================================
# ÉTAPE 2: Lancer Docker (db + api)
# ============================================================================
Write-Host "📋 ÉTAPE 2/4: Démarrage Docker (PostgreSQL + API)..." -ForegroundColor Yellow

# Vérifier si les conteneurs sont déjà démarrés
$runningContainers = docker ps --filter "name=ott-postgres,ott-api" --format "{{.Names}}"
$dbRunning = $runningContainers -match "ott-postgres"
$apiRunning = $runningContainers -match "ott-api"

if ($dbRunning -and $apiRunning) {
    Write-Host "✅ Services Docker déjà démarrés" -ForegroundColor Green
} else {
    # Démarrer la base de données
    Write-Host "   🗄️  Démarrage PostgreSQL..." -ForegroundColor Gray
    docker compose up -d db 2>&1 | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors du démarrage de PostgreSQL" -ForegroundColor Red
        exit 1
    }
    
    # Attendre que PostgreSQL soit prêt
    Write-Host "   ⏳ Attente de PostgreSQL..." -ForegroundColor Gray
    $maxAttempts = 30
    $dbReady = $false
    for ($i = 1; $i -le $maxAttempts; $i++) {
        Start-Sleep -Seconds 2
        $result = docker exec ott-postgres pg_isready -U postgres 2>&1
        if ($result -match "accepting connections") {
            Write-Host "   ✅ PostgreSQL prêt" -ForegroundColor Green
            $dbReady = $true
            break
        }
    }
    
    if (-not $dbReady) {
        Write-Host "❌ PostgreSQL n'est pas prêt après $maxAttempts tentatives" -ForegroundColor Red
        exit 1
    }
    
    # Initialiser la base de données si nécessaire
    $tableCheck = docker exec ott-postgres psql -U postgres -d ott_data -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>&1
    if ($tableCheck -match "^\s*0\s*$") {
        Write-Host "   📦 Initialisation de la base de données..." -ForegroundColor Gray
        Get-Content sql/schema.sql -Raw | docker exec -i ott-postgres psql -U postgres -d ott_data 2>&1 | Out-Null
        Write-Host "   ✅ Base de données initialisée" -ForegroundColor Green
    }
    
    # Démarrer l'API
    Write-Host "   🚀 Démarrage de l'API..." -ForegroundColor Gray
    docker compose up -d api 2>&1 | Out-Null
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors du démarrage de l'API" -ForegroundColor Red
        exit 1
    }
    
    # Attendre que l'API soit prête
    Write-Host "   ⏳ Attente de l'API..." -ForegroundColor Gray
    Start-Sleep -Seconds 5
    
    # Vérifier que l'API répond
    try {
        $health = Invoke-RestMethod -Uri "http://localhost:8000/index.php" -Method Get -TimeoutSec 10 -ErrorAction Stop
        if ($health.database -eq "connected") {
            Write-Host "   ✅ API prête et connectée à la base" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  API démarrée mais base non connectée" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  API démarrée mais health check échoué (peut être normal au démarrage)" -ForegroundColor Yellow
    }
}

Write-Host "✅ Docker démarré" -ForegroundColor Green
Write-Host ""

# ============================================================================
# ÉTAPE 3: Vérifier/Créer .env.local
# ============================================================================
Write-Host "📋 ÉTAPE 3/4: Vérification configuration frontend..." -ForegroundColor Yellow

$envLocal = ".env.local"
$needsEnvLocal = $false

if (-not (Test-Path $envLocal)) {
    Write-Host "   ⚠️  Fichier .env.local non trouvé" -ForegroundColor Yellow
    $needsEnvLocal = $true
} else {
    # Vérifier si NEXT_PUBLIC_API_URL est défini
    $envContent = Get-Content $envLocal -Raw
    if ($envContent -notmatch "NEXT_PUBLIC_API_URL") {
        Write-Host "   ⚠️  NEXT_PUBLIC_API_URL non défini dans .env.local" -ForegroundColor Yellow
        $needsEnvLocal = $true
    } else {
        Write-Host "✅ Fichier .env.local trouvé" -ForegroundColor Green
    }
}

if ($needsEnvLocal) {
    Write-Host "   📝 Création du fichier .env.local..." -ForegroundColor Gray
    
    # Vérifier si env.example existe
    if (Test-Path "env.example") {
        Copy-Item "env.example" $envLocal
        Write-Host "   ✅ Fichier .env.local créé depuis env.example" -ForegroundColor Green
    } else {
        # Créer un fichier minimal
        $envContent = @"
# Configuration OTT Dashboard - Développement Local
NEXT_PUBLIC_API_MODE=development
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@
        $envContent | Out-File -FilePath $envLocal -Encoding UTF8
        Write-Host "   ✅ Fichier .env.local créé avec configuration minimale" -ForegroundColor Green
    }
}

Write-Host ""

# ============================================================================
# ÉTAPE 4: Lancer le frontend Next.js
# ============================================================================
Write-Host "📋 ÉTAPE 4/4: Démarrage frontend Next.js..." -ForegroundColor Yellow

# Vérifier si Node.js est installé
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js n'est pas installé" -ForegroundColor Red
    Write-Host "   Installez Node.js depuis: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Vérifier si node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "   📦 Installation des dépendances..." -ForegroundColor Gray
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Dépendances installées" -ForegroundColor Green
}

# Vérifier si le port 3000 est déjà utilisé
$port3000InUse = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($port3000InUse) {
    Write-Host "⚠️  Le port 3000 est déjà utilisé" -ForegroundColor Yellow
    Write-Host "   Un serveur Next.js semble déjà être en cours d'exécution" -ForegroundColor Yellow
    Write-Host "   Vous pouvez accéder à: http://localhost:3000" -ForegroundColor Cyan
} else {
    Write-Host "✅ Frontend prêt à démarrer" -ForegroundColor Green
}

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ APPLICATION PRÊTE!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Services disponibles:" -ForegroundColor Cyan
Write-Host "   • Frontend:    http://localhost:3000" -ForegroundColor White
Write-Host "   • API:         http://localhost:8000" -ForegroundColor White
Write-Host "   • Health:      http://localhost:8000/index.php" -ForegroundColor White
Write-Host "   • PostgreSQL:  localhost:5432" -ForegroundColor White
Write-Host ""
Write-Host "📋 Commandes utiles:" -ForegroundColor Cyan
Write-Host "   • Logs Docker: docker compose logs -f" -ForegroundColor White
Write-Host "   • Arrêter:     docker compose down" -ForegroundColor White
Write-Host "   • Redémarrer:  docker compose restart" -ForegroundColor White
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""

# Lancer npm run dev dans une nouvelle fenêtre ou en arrière-plan
Write-Host "🚀 Démarrage du frontend Next.js..." -ForegroundColor Cyan
Write-Host "   Le serveur de développement va démarrer..." -ForegroundColor Gray
Write-Host "   Appuyez sur Ctrl+C pour arrêter" -ForegroundColor Yellow
Write-Host ""

# Lancer npm run dev (bloquant)
npm run dev

