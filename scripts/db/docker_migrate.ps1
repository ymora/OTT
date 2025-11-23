# ============================================================================
# Script de migration de la base de données existante avec Docker (PowerShell)
# ============================================================================
# Applique UNIQUEMENT migration_optimisations.sql sur une base existante
# Ne crée pas de nouvelle base, ne réinitialise rien
# ============================================================================

$ErrorActionPreference = "Stop"

$ROOT_DIR = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$MIGRATION_FILE = Join-Path $ROOT_DIR "sql\migration_optimisations.sql"

# Variables de connexion (par défaut Docker)
$DB_HOST = if ($env:DB_HOST) { $env:DB_HOST } else { "localhost" }
$DB_PORT = if ($env:DB_PORT) { $env:DB_PORT } else { "5432" }
$DB_NAME = if ($env:DB_NAME) { $env:DB_NAME } else { "ott_data" }
$DB_USER = if ($env:DB_USER) { $env:DB_USER } else { "postgres" }
$DB_PASS = if ($env:DB_PASS) { $env:DB_PASS } else { "postgres" }

Write-Host "🔧 Migration de la base de données OTT existante" -ForegroundColor Cyan
Write-Host "   Host: $DB_HOST`:$DB_PORT"
Write-Host "   Database: $DB_NAME"
Write-Host "   User: $DB_USER"
Write-Host ""

# Vérifier que PostgreSQL est accessible
Write-Host "⏳ Vérification de la connexion PostgreSQL..." -ForegroundColor Yellow
$env:PGPASSWORD = $DB_PASS
try {
    $null = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\q" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Connection failed"
    }
} catch {
    Write-Host "❌ Impossible de se connecter à la base de données" -ForegroundColor Red
    Write-Host "   Vérifiez que Docker est démarré: docker compose up -d db" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ Connexion établie" -ForegroundColor Green
Write-Host ""

# Vérifier que la base existe et contient des données
Write-Host "🔍 Vérification de la base de données..." -ForegroundColor Cyan
$env:PGPASSWORD = $DB_PASS
$tableCount = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'" 2>&1
$tableCount = $tableCount.Trim()

if ([string]::IsNullOrWhiteSpace($tableCount) -or $tableCount -eq "0") {
    Write-Host "⚠️  La base de données semble vide ou n'existe pas" -ForegroundColor Yellow
    Write-Host "   Utilisez scripts\docker_init_db.ps1 pour une initialisation complète" -ForegroundColor Yellow
    exit 1
}

Write-Host "   Tables existantes: $tableCount"
Write-Host ""

# Vérifier si la migration a déjà été appliquée
Write-Host "🔍 Vérification de l'état de la migration..." -ForegroundColor Cyan
$migrationApplied = $false

$newTables = @("user_sessions", "device_firmware_history", "system_settings")
foreach ($table in $newTables) {
    $exists = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table')" 2>&1
    $exists = $exists.Trim()
    if ($exists -eq "t") {
        Write-Host "   ✅ Table '$table' existe déjà" -ForegroundColor Green
        $migrationApplied = $true
    }
}

if ($migrationApplied) {
    Write-Host ""
    $response = Read-Host "⚠️  Des tables de migration existent déjà. Voulez-vous quand même réappliquer la migration ? (y/N)"
    if ($response -ne "y" -and $response -ne "Y") {
        Write-Host "❌ Migration annulée" -ForegroundColor Yellow
        exit 0
    }
    Write-Host ""
}

# Appliquer la migration
if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier migration_optimisations.sql introuvable ($MIGRATION_FILE)" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Application de la migration d'optimisations..." -ForegroundColor Cyan
Write-Host "   Fichier: $MIGRATION_FILE"
Write-Host ""

$env:PGPASSWORD = $DB_PASS
& psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $MIGRATION_FILE 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
    Write-Host ""
    
    # Vérifications finales
    Write-Host "🔍 Vérifications post-migration..." -ForegroundColor Cyan
    $newTables = @("user_sessions", "device_firmware_history", "system_settings", "device_events", "reports", "teams", "tags")
    foreach ($table in $newTables) {
        $exists = & psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table')" 2>&1
        $exists = $exists.Trim()
        if ($exists -eq "t") {
            Write-Host "   ✅ Table '$table' créée" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Table '$table' manquante" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "✅ Migration terminée !" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors de l'application de la migration" -ForegroundColor Red
    exit 1
}

