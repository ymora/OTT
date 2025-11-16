# ============================================================================
# Configuration API locale avec base de donnees Render
# ============================================================================
# Configure l'API PHP locale pour utiliser la base PostgreSQL Render
# ============================================================================

Write-Host "Configuration API locale avec base de donnees Render" -ForegroundColor Cyan
Write-Host ""

# Vérifier si on est dans le bon répertoire
if (-not (Test-Path "api.php")) {
    Write-Host "Erreur: api.php non trouve. Assurez-vous d'etre dans le repertoire du projet." -ForegroundColor Red
    exit 1
}

Write-Host "Pour utiliser la base Render, vous avez besoin des informations suivantes:" -ForegroundColor Yellow
Write-Host "  - DB_HOST (ex: dpg-xxxxx-a.frankfurt-postgres.render.com)" -ForegroundColor Gray
Write-Host "  - DB_NAME (ex: ott_data)" -ForegroundColor Gray
Write-Host "  - DB_USER (ex: ott_data_user)" -ForegroundColor Gray
Write-Host "  - DB_PASS (mot de passe Render)" -ForegroundColor Gray
Write-Host "  - DB_PORT (generalement 5432)" -ForegroundColor Gray
Write-Host ""
Write-Host "Ces informations sont disponibles dans:" -ForegroundColor Cyan
Write-Host "  Render Dashboard > PostgreSQL > Connect > Internal Database URL" -ForegroundColor Gray
Write-Host ""

$useRenderDB = Read-Host "Configurer l'API locale pour utiliser la base Render ? [O/n]"
if ($useRenderDB -ne "O" -and $useRenderDB -ne "o") {
    Write-Host "Configuration annulee." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Entrez les informations de connexion Render:" -ForegroundColor Cyan

$dbHost = Read-Host "DB_HOST"
$dbName = Read-Host "DB_NAME"
$dbUser = Read-Host "DB_USER"
$dbPass = Read-Host "DB_PASS" -AsSecureString
$dbPort = Read-Host "DB_PORT (defaut: 5432)"
if ([string]::IsNullOrWhiteSpace($dbPort)) {
    $dbPort = "5432"
}

# Convertir le mot de passe sécurisé en texte
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPass)
$dbPassPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Générer JWT_SECRET si nécessaire
$jwtSecret = Read-Host "JWT_SECRET (laissez vide pour generer)"
if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
    # Générer un secret aléatoire (simulation, en production utiliser openssl)
    $jwtSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    Write-Host "  JWT_SECRET genere: $jwtSecret" -ForegroundColor Green
}

$envContent = @"
# Configuration Backend OTT - API locale avec base Render
# Ces variables sont utilisees par l'API PHP (api.php)

# Base de donnees Render PostgreSQL
DB_TYPE=pgsql
DB_HOST=$dbHost
DB_PORT=$dbPort
DB_NAME=$dbName
DB_USER=$dbUser
DB_PASS=$dbPassPlain

# JWT Secret (pour l'authentification)
JWT_SECRET=$jwtSecret

# Auth (desactive pour developpement local)
AUTH_DISABLED=false

# CORS (autoriser localhost)
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Debug (active pour developpement)
DEBUG_ERRORS=true
"@

$envContent | Out-File -FilePath ".env.php" -Encoding UTF8 -Force
Write-Host ""
Write-Host "Fichier .env.php cree avec la configuration Render" -ForegroundColor Green
Write-Host ""

# Configurer le frontend pour utiliser l'API locale
Write-Host "Configuration du frontend pour utiliser l'API locale..." -ForegroundColor Cyan

$frontendEnv = @"
# Configuration Frontend OTT - Developpement Local
# Utilise l'API PHP locale (qui se connecte a Render)
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@

$frontendEnv | Out-File -FilePath ".env.local" -Encoding UTF8 -Force
Write-Host "Fichier .env.local mis a jour pour utiliser l'API locale" -ForegroundColor Green
Write-Host ""

Write-Host "Configuration terminee!" -ForegroundColor Green
Write-Host ""
Write-Host "Prochaines etapes:" -ForegroundColor Cyan
Write-Host "  1. Demarrer l'API PHP locale:" -ForegroundColor White
Write-Host "     php -S localhost:8080 -t . api.php" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Dans un autre terminal, demarrer Next.js:" -ForegroundColor White
Write-Host "     npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. L'API locale utilisera la base Render" -ForegroundColor White
Write-Host "     Le frontend utilisera l'API locale (localhost:8080)" -ForegroundColor White
Write-Host ""
Write-Host "Note: Assurez-vous d'avoir PHP 8.2+ avec extension pgsql installee" -ForegroundColor Yellow
Write-Host ""

