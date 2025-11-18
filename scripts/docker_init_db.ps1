# ============================================================================
# Script d'initialisation de la base de données avec Docker (PowerShell)
# ============================================================================
# Applique schema.sql puis migration_optimisations.sql
# ============================================================================

$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$SCHEMA_FILE = Join-Path $ROOT_DIR "sql\schema.sql"
$MIGRATION_FILE = Join-Path $ROOT_DIR "sql\migration_optimisations.sql"

# Variables de connexion
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "ott_data" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DB_PASS = if ($env:DB_PASS) { $env:DB_PASS } else { "postgres" }

Write-Host "🚀 Initialisation de la base de données OTT" -ForegroundColor Cyan
Write-Host "   Host: $DB_HOST`:$DB_PORT"
Write-Host "   Database: $DB_NAME"
Write-Host "   User: $DB_USER"
Write-Host ""

# Attendre que PostgreSQL soit prêt
Write-Host "⏳ Attente de PostgreSQL..." -ForegroundColor Yellow
$maxRetries = 30
$retryCount = 0
$connected = $false

while (-not $connected -and $retryCount -lt $maxRetries) {
    try {
        $env:PGPASSWORD = $DB_PASS
        $result = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d "postgres" -c "\q" 2>&1
        if ($LASTEXITCODE -eq 0) {
            $connected = $true
        }
    } catch {
        # Ignorer les erreurs
    }
    
    if (-not $connected) {
        Start-Sleep -Seconds 2
        $retryCount++
        Write-Host "   Tentative $retryCount/$maxRetries..." -ForegroundColor Gray
    }
}

if (-not $connected) {
    Write-Host "❌ Impossible de se connecter à PostgreSQL" -ForegroundColor Red
    exit 1
}

Write-Host "✅ PostgreSQL est prêt" -ForegroundColor Green
Write-Host ""

# Créer la base de données si elle n'existe pas
Write-Host "📦 Vérification de la base de données..." -ForegroundColor Cyan
$env:PGPASSWORD = $DB_PASS
$dbExists = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d "postgres" -t -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" 2>&1

if ([string]::IsNullOrWhiteSpace($dbExists)) {
    Write-Host "   Création de la base de données..." -ForegroundColor Yellow
    & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d "postgres" -c "CREATE DATABASE $DB_NAME" 2>&1 | Out-Null
}

Write-Host "✅ Base de données prête" -ForegroundColor Green
Write-Host ""

# Appliquer le schéma initial
if (Test-Path $SCHEMA_FILE) {
    Write-Host "📋 Application du schéma initial..." -ForegroundColor Cyan
    $env:PGPASSWORD = $DB_PASS
    & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $SCHEMA_FILE 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Schéma initial appliqué" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Erreur lors de l'application du schéma" -ForegroundColor Yellow
    }
    Write-Host ""
} else {
    Write-Host "⚠️  Fichier schema.sql introuvable, passage à la migration..." -ForegroundColor Yellow
    Write-Host ""
}

# Appliquer la migration d'optimisations
if (Test-Path $MIGRATION_FILE) {
    Write-Host "🔧 Application de la migration d'optimisations..." -ForegroundColor Cyan
    $env:PGPASSWORD = $DB_PASS
    & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $MIGRATION_FILE 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration d'optimisations appliquée" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Erreur lors de l'application de la migration" -ForegroundColor Yellow
    }
    Write-Host ""
} else {
    Write-Host "⚠️  Fichier migration_optimisations.sql introuvable" -ForegroundColor Yellow
    Write-Host ""
}

# Vérifications
Write-Host "🔍 Vérifications..." -ForegroundColor Cyan
Write-Host ""

$env:PGPASSWORD = $DB_PASS
$tableCount = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>&1
Write-Host "   Tables: $($tableCount.Trim())"

$newTables = @("user_sessions", "device_firmware_history", "system_settings", "device_events", "reports", "teams", "tags")
foreach ($table in $newTables) {
    $exists = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table')" 2>&1
    if ($exists.Trim() -eq "t") {
        Write-Host "   ✅ Table '$table' existe" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Table '$table' manquante" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✅ Initialisation terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Accès à la base de données :" -ForegroundColor Cyan
Write-Host "   - Host: $DB_HOST"
Write-Host "   - Port: $DB_PORT"
Write-Host "   - Database: $DB_NAME"
Write-Host "   - User: $DB_USER"
Write-Host ""
Write-Host "🌐 Visualiseur web (si pgweb est lancé) : http://localhost:8081" -ForegroundColor Cyan
Write-Host ""

