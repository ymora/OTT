# ============================================================================
# Script PowerShell - Migration Render
# ============================================================================
# Applique sql/schema.sql et sql/migration_optimisations.sql sur Render
# ============================================================================

param(
    [string]$DATABASE_URL = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 Migration Render - Application du schéma complet" -ForegroundColor Cyan
Write-Host ""

# Vérifier que DATABASE_URL est fourni
if (-not $DATABASE_URL) {
    Write-Host "❌ DATABASE_URL doit être fourni" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\migrate_render.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Cyan
    Write-Host "  OU" -ForegroundColor White
    Write-Host "  `$env:DATABASE_URL='postgresql://...'; .\scripts\migrate_render.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Récupérer DATABASE_URL depuis:" -ForegroundColor Yellow
    Write-Host "  Render Dashboard > PostgreSQL > Connect > Internal Database URL" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Vérifier que les fichiers SQL existent
$SCHEMA_FILE = Join-Path $PSScriptRoot "..\sql\schema.sql"
$MIGRATION_FILE = Join-Path $PSScriptRoot "..\sql\migration_optimisations.sql"

if (-not (Test-Path $SCHEMA_FILE)) {
    Write-Host "❌ Fichier SQL introuvable: $SCHEMA_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Application du schéma et des optimisations (PostgreSQL)" -ForegroundColor Cyan
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
        param([string]$DatabaseUrl, [string]$Command, [string]$File = $null)
        
        if ($useDocker) {
            if ($File) {
                # Utiliser Docker pour exécuter un fichier SQL
                $fileContent = Get-Content $File -Raw
                $fileContent | docker run --rm -i postgres:15 psql $DatabaseUrl
            } else {
                # Utiliser Docker pour exécuter une commande SQL
                echo $Command | docker run --rm -i postgres:15 psql $DatabaseUrl
            }
        } else {
            if ($File) {
                & psql $DatabaseUrl -f $File
            } else {
                & psql $DatabaseUrl -c $Command
            }
        }
    }

    # 1. Appliquer le schéma initial
    Write-Host "1️⃣  Application du schéma initial..." -ForegroundColor Yellow
    $schemaResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -File $SCHEMA_FILE 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors de l'application du schéma:" -ForegroundColor Red
        Write-Host $schemaResult -ForegroundColor Red
        exit 1
    }
    Write-Host "   ✅ Schéma appliqué" -ForegroundColor Green
    Write-Host ""

    # 2. Appliquer les optimisations
    if (Test-Path $MIGRATION_FILE) {
        Write-Host "2️⃣  Application des optimisations..." -ForegroundColor Yellow
        $migrationResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -File $MIGRATION_FILE 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Erreur lors de l'application des optimisations:" -ForegroundColor Red
            Write-Host $migrationResult -ForegroundColor Red
            exit 1
        }
        Write-Host "   ✅ Optimisations appliquées" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Fichier migration_optimisations.sql introuvable, ignoré" -ForegroundColor Yellow
    }
    Write-Host ""

    # 3. Vérifier
    Write-Host "3️⃣  Vérification..." -ForegroundColor Yellow
    $checkResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -Command "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';" 2>&1
    if ($LASTEXITCODE -eq 0) {
        $tableCount = ($checkResult | Select-String -Pattern '\d+').Matches.Value
        Write-Host "   ✅ Tables créées: $tableCount" -ForegroundColor Green
        
        $patientTableCheck = Invoke-PSQL -DatabaseUrl $DATABASE_URL -Command "SELECT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'patient_notifications_preferences');" 2>&1
        if ($patientTableCheck -match 't|true|1') {
            Write-Host "   ✅ Table patient_notifications_preferences existe" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Table patient_notifications_preferences non trouvée" -ForegroundColor Yellow
        }
    }
    Write-Host ""

    Write-Host "✅ Migration terminée avec succès !" -ForegroundColor Green
    Write-Host ""

} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

