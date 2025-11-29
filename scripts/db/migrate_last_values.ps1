# ============================================================================
# Script PowerShell - Migration last_flowrate et last_rssi
# ============================================================================
# Applique uniquement sql/migration_add_last_values.sql sur Render
# ============================================================================

param(
    [string]$DATABASE_URL = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 Migration last_flowrate et last_rssi" -ForegroundColor Cyan
Write-Host ""

# Vérifier que DATABASE_URL est fourni
if (-not $DATABASE_URL) {
    Write-Host "❌ DATABASE_URL doit être fourni" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\db\migrate_last_values.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Cyan
    Write-Host "  OU" -ForegroundColor White
    Write-Host "  `$env:DATABASE_URL='postgresql://...'; .\scripts\db\migrate_last_values.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Récupérer DATABASE_URL depuis:" -ForegroundColor Yellow
    Write-Host "  Render Dashboard > PostgreSQL > Connect > Internal Database URL" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Vérifier que le fichier SQL existe
$MIGRATION_FILE = Join-Path $PSScriptRoot "..\..\sql\migration_add_last_values.sql"

if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier SQL introuvable: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Application de la migration last_flowrate et last_rssi" -ForegroundColor Cyan
Write-Host "   Base: $($DATABASE_URL -replace ':[^:@]+@', ':****@')" -ForegroundColor Gray
Write-Host ""

# Vérifier que psql ou Docker est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
$dockerPath = Get-Command docker -ErrorAction SilentlyContinue
$useDocker = $false

if (-not $psqlPath) {
    if ($dockerPath) {
        Write-Host "ℹ️  psql non trouvé, utilisation de Docker..." -ForegroundColor Yellow
        $useDocker = $true
    } else {
        Write-Host "❌ psql et Docker ne sont pas installés" -ForegroundColor Red
        Write-Host ""
        Write-Host "Solutions:" -ForegroundColor Yellow
        Write-Host "  1. Installer PostgreSQL (contient psql)" -ForegroundColor Cyan
        Write-Host "  2. Installer Docker Desktop" -ForegroundColor Cyan
        Write-Host ""
        exit 1
    }
}

try {
    # Fonction pour exécuter une commande SQL
    function Invoke-PSQL {
        param([string]$DatabaseUrl, [string]$File)
        
        if ($useDocker) {
            # Utiliser Docker pour exécuter un fichier SQL
            $fileContent = Get-Content $File -Raw -Encoding UTF8
            $fileContent | docker run --rm -i postgres:15 psql $DatabaseUrl
        } else {
            & psql $DatabaseUrl -f $File
        }
    }

    # Appliquer la migration
    Write-Host "1️⃣  Application de la migration..." -ForegroundColor Yellow
    $migrationResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -File $MIGRATION_FILE 2>&1
    if ($LASTEXITCODE -ne 0) {
        # Vérifier si c'est juste une erreur "déjà existe" (acceptable)
        if ($migrationResult -match "already exists|déjà existe") {
            Write-Host "   ⚠️  Colonnes déjà présentes (ignoré)" -ForegroundColor Yellow
        } else {
            Write-Host "❌ Erreur lors de l'application de la migration:" -ForegroundColor Red
            Write-Host $migrationResult -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "   ✅ Migration appliquée" -ForegroundColor Green
    }
    Write-Host ""

    # Vérifier
    Write-Host "2️⃣  Vérification..." -ForegroundColor Yellow
    $checkFlowrate = Invoke-PSQL -DatabaseUrl $DATABASE_URL -Command "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'last_flowrate');" 2>&1
    $checkRssi = Invoke-PSQL -DatabaseUrl $DATABASE_URL -Command "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'last_rssi');" 2>&1
    
    if ($checkFlowrate -match 't|true|1') {
        Write-Host "   ✅ Colonne last_flowrate existe" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Colonne last_flowrate non trouvée" -ForegroundColor Red
    }
    
    if ($checkRssi -match 't|true|1') {
        Write-Host "   ✅ Colonne last_rssi existe" -ForegroundColor Green
    } else {
        Write-Host "   ❌ Colonne last_rssi non trouvée" -ForegroundColor Red
    }
    Write-Host ""

    Write-Host "✅ Migration terminée !" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

