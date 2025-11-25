# ============================================================================
# Script PowerShell - Migration Firmware BYTEA
# ============================================================================
# Applique sql/migration_firmware_blob.sql sur Render
# Ajoute les colonnes ino_content et bin_content pour stockage en DB
# ============================================================================

param(
    [string]$DATABASE_URL = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "💾 Migration Firmware BYTEA - Stockage dans PostgreSQL" -ForegroundColor Cyan
Write-Host ""

# Vérifier que DATABASE_URL est fourni
if (-not $DATABASE_URL) {
    Write-Host "❌ DATABASE_URL doit être fourni" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\db\migrate_firmware_blob.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Cyan
    Write-Host "  OU" -ForegroundColor White
    Write-Host "  `$env:DATABASE_URL='postgresql://...'; .\scripts\db\migrate_firmware_blob.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Récupérer DATABASE_URL depuis:" -ForegroundColor Yellow
    Write-Host "  Render Dashboard > PostgreSQL > Connect > Internal Database URL" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Vérifier que le fichier SQL existe
$MIGRATION_FILE = Join-Path $PSScriptRoot "..\..\sql\migration_firmware_blob.sql"

if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier SQL introuvable: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Application de la migration firmware_blob (PostgreSQL)" -ForegroundColor Cyan
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
    Write-Host "1️⃣  Application de la migration firmware_blob..." -ForegroundColor Yellow
    $migrationResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -File $MIGRATION_FILE 2>&1
    
    if ($LASTEXITCODE -ne 0 -and $migrationResult -notmatch "NOTICE|already exists") {
        Write-Host "❌ Erreur lors de l'application de la migration:" -ForegroundColor Red
        Write-Host $migrationResult -ForegroundColor Red
        exit 1
    }
    
    Write-Host "   ✅ Migration appliquée" -ForegroundColor Green
    Write-Host ""

    # Vérifier que les colonnes existent
    Write-Host "2️⃣  Vérification des colonnes..." -ForegroundColor Yellow
    
    $checkQuery = @"
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'firmware_versions' 
AND column_name IN ('ino_content', 'bin_content');
"@
    
    if ($useDocker) {
        $checkResult = echo $checkQuery | docker run --rm -i postgres:15 psql $DATABASE_URL 2>&1
    } else {
        $checkResult = & psql $DATABASE_URL -c $checkQuery 2>&1
    }
    
    if ($checkResult -match 'ino_content|bin_content') {
        Write-Host "   ✅ Colonnes ino_content et bin_content créées" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  Vérifiez manuellement les colonnes" -ForegroundColor Yellow
        Write-Host $checkResult -ForegroundColor Gray
    }
    Write-Host ""

    Write-Host "✅ Migration terminée avec succès !" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
    Write-Host "   - Les nouveaux uploads .ino seront stockés dans la DB" -ForegroundColor Gray
    Write-Host "   - Les compilations .bin seront stockées dans la DB" -ForegroundColor Gray
    Write-Host "   - Plus de perte de fichiers lors des redéploiements !" -ForegroundColor Gray
    Write-Host ""

} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

