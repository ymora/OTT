# ============================================================================
# Configuration environnement local OTT
# ============================================================================
# Configure les variables d'environnement pour le développement local
# ============================================================================

Write-Host "⚙️  Configuration environnement local OTT" -ForegroundColor Cyan
Write-Host ""

# Vérifier si on est dans le bon répertoire
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erreur: package.json non trouvé. Assurez-vous d'être dans le répertoire du projet." -ForegroundColor Red
    exit 1
}

# Configuration Frontend (.env.local)
Write-Host "📝 Configuration Frontend (.env.local)..." -ForegroundColor Cyan

$useLocalAPI = Read-Host "Utiliser l'API locale (PHP) ? [O/n] (défaut: n, utilise Render)"
if ($useLocalAPI -eq "" -or $useLocalAPI -eq "n" -or $useLocalAPI -eq "N") {
    $apiUrl = "https://ott-jbln.onrender.com"
    Write-Host "  → Utilisation de l'API Render: $apiUrl" -ForegroundColor Green
} else {
    $apiUrl = "http://localhost:8080"
    Write-Host "  → Utilisation de l'API locale: $apiUrl" -ForegroundColor Green
    Write-Host "  ⚠️  Assurez-vous d'avoir l'API PHP qui tourne sur le port 8080" -ForegroundColor Yellow
}

# L'authentification est maintenant toujours requise
$authValue = "true"

$envContent = @"
# Configuration Frontend OTT - Développement Local
NEXT_PUBLIC_API_URL=$apiUrl
NEXT_PUBLIC_REQUIRE_AUTH=$authValue
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@

$envContent | Out-File -FilePath ".env.local" -Encoding UTF8 -Force
Write-Host "  ✓ Fichier .env.local créé/mis à jour" -ForegroundColor Green
Write-Host ""

# Configuration Backend (si API locale)
if ($useLocalAPI -eq "O" -or $useLocalAPI -eq "o") {
    Write-Host "📝 Configuration Backend (API PHP locale)..." -ForegroundColor Cyan
    
    $useDockerDB = Read-Host "Utiliser PostgreSQL Docker local ? [O/n] (défaut: O)"
    if ($useDockerDB -eq "" -or $useDockerDB -eq "O" -or $useDockerDB -eq "o") {
        Write-Host "  → Configuration pour PostgreSQL Docker (localhost:5432)" -ForegroundColor Green
        
        $dbConfig = @"
# Configuration Backend OTT - Développement Local
# Pour utiliser avec Docker PostgreSQL
DB_TYPE=pgsql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ott_data
DB_USER=postgres
DB_PASS=postgres

# Ou utiliser DATABASE_URL (prioritaire si défini)
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ott_data

# JWT (générer avec: openssl rand -hex 32)
JWT_SECRET=dev_secret_key_changez_en_production

# Auth (désactivé pour développement)
AUTH_DISABLED=true

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# Debug
DEBUG_ERRORS=true
"@
        
        $dbConfig | Out-File -FilePath ".env.php" -Encoding UTF8 -Force
        Write-Host "  ✓ Fichier .env.php créé pour l'API PHP" -ForegroundColor Green
        Write-Host ""
        Write-Host "  💡 Pour utiliser l'API PHP localement:" -ForegroundColor Yellow
        Write-Host "     - Installez PHP 8.2+ avec extension pgsql" -ForegroundColor Gray
        Write-Host "     - Lancez: php -S localhost:8080 -t . api.php" -ForegroundColor Gray
        Write-Host "     - Ou utilisez un serveur web (Apache/Nginx)" -ForegroundColor Gray
    } else {
        Write-Host "  → Configuration pour PostgreSQL Render" -ForegroundColor Green
        Write-Host "  ⚠️  Vous devrez définir les variables d'environnement manuellement" -ForegroundColor Yellow
        Write-Host "     DB_HOST, DB_NAME, DB_USER, DB_PASS depuis Render" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "✅ Configuration terminée!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Résumé:" -ForegroundColor Cyan
Write-Host "  - Frontend: .env.local → API: $apiUrl" -ForegroundColor Gray
Write-Host "  - Auth: $authValue" -ForegroundColor Gray
if ($useLocalAPI -eq "O" -or $useLocalAPI -eq "o") {
    Write-Host "  - Backend: .env.php créé pour API locale" -ForegroundColor Gray
}
Write-Host ""
Write-Host "🚀 Lancez maintenant: .\scripts\restart_local.ps1" -ForegroundColor Cyan

