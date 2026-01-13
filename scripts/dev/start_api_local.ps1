# Script pour démarrer l'API PHP en local
# Usage: .\scripts\dev\start_api_local.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 DÉMARRAGE API PHP LOCALE" -ForegroundColor Cyan
Write-Host ""

# Vérifier que PHP est installé
$phpVersion = php -v 2>$null
if (-not $phpVersion) {
    Write-Host "❌ PHP n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Installez PHP 8.2+ depuis:" -ForegroundColor Yellow
    Write-Host "   https://windows.php.net/download/" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "✅ PHP détecté:" -ForegroundColor Green
php -v | Select-Object -First 1
Write-Host ""

# Vérifier que l'extension PostgreSQL est disponible
$pdoPgSql = php -m | Select-String "pdo_pgsql"
if (-not $pdoPgSql) {
    Write-Host "⚠️  Extension pdo_pgsql non trouvée" -ForegroundColor Yellow
    Write-Host "   L'API fonctionnera mais la connexion à PostgreSQL pourrait échouer" -ForegroundColor Yellow
    Write-Host ""
}

# Vérifier si .env.php existe
$envFile = ".env.php"
if (-not (Test-Path $envFile)) {
    Write-Host "⚠️  Fichier .env.php non trouvé" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "💡 Création d'un fichier .env.php de base..." -ForegroundColor Cyan
    
    # Demander les informations de connexion à la base de données
    Write-Host ""
    Write-Host "📋 Configuration de la base de données:" -ForegroundColor Cyan
    Write-Host "   Vous pouvez utiliser la base Render ou une base locale" -ForegroundColor Gray
    Write-Host ""
    
    $useRender = Read-Host "Utiliser la base Render ? (O/N)"
    if ($useRender -eq "O" -or $useRender -eq "o" -or $useRender -eq "Y" -or $useRender -eq "y") {
        Write-Host ""
        Write-Host "💡 Récupérez les informations depuis Render Dashboard:" -ForegroundColor Yellow
        Write-Host "   Render > PostgreSQL > Connect > Internal Database URL" -ForegroundColor White
        Write-Host ""
        $dbUrl = Read-Host "DATABASE_URL (postgresql://user:pass@host:port/dbname)"
        
        # Parser l'URL PostgreSQL
        if ($dbUrl -match "postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)") {
            $dbUser = $matches[1]
            $dbPass = $matches[2]
            $dbHost = $matches[3]
            $dbPort = $matches[4]
            $dbName = $matches[5]
        } else {
            Write-Host "❌ Format d'URL invalide" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host ""
        $dbHost = Read-Host "DB_HOST (localhost par défaut)"
        if ([string]::IsNullOrWhiteSpace($dbHost)) { $dbHost = "localhost" }
        
        $dbPort = Read-Host "DB_PORT (5432 par défaut)"
        if ([string]::IsNullOrWhiteSpace($dbPort)) { $dbPort = "5432" }
        
        $dbName = Read-Host "DB_NAME (ott_data par défaut)"
        if ([string]::IsNullOrWhiteSpace($dbName)) { $dbName = "ott_data" }
        
        $dbUser = Read-Host "DB_USER (postgres par défaut)"
        if ([string]::IsNullOrWhiteSpace($dbUser)) { $dbUser = "postgres" }
        
        $dbPass = Read-Host "DB_PASS" -AsSecureString
        $dbPass = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($dbPass)
        )
    }
    
    # Générer un JWT_SECRET si non fourni
    $jwtSecret = Read-Host "JWT_SECRET (laissez vide pour générer automatiquement)"
    if ([string]::IsNullOrWhiteSpace($jwtSecret)) {
        # Générer un secret aléatoire
        $bytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
        $jwtSecret = [Convert]::ToBase64String($bytes)
        Write-Host "✅ JWT_SECRET généré automatiquement" -ForegroundColor Green
    }
    
    # Créer le fichier .env.php
    $envContent = @"
# Configuration API OTT - Développement Local
# Ce fichier est ignoré par Git (.gitignore)

# Base de données
DB_HOST=$dbHost
DB_PORT=$dbPort
DB_NAME=$dbName
DB_USER=$dbUser
DB_PASS=$dbPass

# JWT
JWT_SECRET=$jwtSecret

# Debug
DEBUG_ERRORS=true

# CORS (optionnel)
# CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3003
"@
    
    $envContent | Out-File -FilePath $envFile -Encoding UTF8
    Write-Host ""
    Write-Host "✅ Fichier .env.php créé" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "✅ Fichier .env.php trouvé" -ForegroundColor Green
    Write-Host ""
}

# Port par défaut
$port = 8000

# Vérifier si le port est déjà utilisé
$portInUse = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "⚠️  Le port $port est déjà utilisé" -ForegroundColor Yellow
    $newPort = Read-Host "Entrez un autre port (ou appuyez sur Entrée pour arrêter le processus)"
    if (-not [string]::IsNullOrWhiteSpace($newPort)) {
        $port = [int]$newPort
    } else {
        Write-Host "❌ Arrêt du script" -ForegroundColor Red
        exit 1
    }
}

Write-Host "🌐 Démarrage du serveur PHP sur http://localhost:$port" -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Pour utiliser cette API avec le frontend:" -ForegroundColor Yellow
Write-Host "   1. Créez un fichier .env.local dans la racine du projet" -ForegroundColor White
Write-Host "   2. Ajoutez: NEXT_PUBLIC_API_URL=http://localhost:$port" -ForegroundColor White
Write-Host "   3. Redémarrez le serveur Next.js (npm run dev)" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Yellow
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""

# Démarrer le serveur PHP
php -S localhost:$port -t . router.php 2>&1 | ForEach-Object {
    if ($_ -match "error|Error|ERROR|warning|Warning|WARNING") {
        Write-Host $_ -ForegroundColor Red
    } else {
        Write-Host $_
    }
}

