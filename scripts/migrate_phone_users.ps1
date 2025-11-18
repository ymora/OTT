# ============================================================================
# Script PowerShell - Migration colonne phone (users)
# ============================================================================
# Vérifie et ajoute la colonne phone à la table users si elle n'existe pas
# ============================================================================

param(
    [string]$DATABASE_URL = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "📞 Migration colonne phone (users)" -ForegroundColor Cyan
Write-Host ""

# Vérifier que DATABASE_URL est fourni
if (-not $DATABASE_URL) {
    Write-Host "❌ DATABASE_URL doit être fourni" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\migrate_phone_users.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

# Vérifier que le fichier SQL existe
$MIGRATION_FILE = Join-Path $PSScriptRoot "..\sql\migration_add_phone_users.sql"

if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier SQL introuvable: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Vérification et ajout de la colonne phone (PostgreSQL)" -ForegroundColor Cyan
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
        Write-Host "❌ psql ou Docker requis" -ForegroundColor Red
        Write-Host "   Installez PostgreSQL client OU Docker" -ForegroundColor Yellow
        exit 1
    }
}

function Invoke-PSQL {
    param([string]$DatabaseUrl, [string]$Command, [string]$File = $null)

    if ($useDocker) {
        if ($File) {
            $fileContent = Get-Content $File -Raw -Encoding UTF8
            $fileContent | docker run --rm -i postgres:15 psql $DatabaseUrl
        } else {
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

# 1. Vérifier si la colonne existe
Write-Host "🔍 Vérification de l'existence de la colonne phone..." -ForegroundColor Cyan
$checkQuery = "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'phone');"
$checkResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -Command $checkQuery 2>&1

if ($checkResult -match "t|true|1") {
    Write-Host "✅ La colonne phone existe déjà" -ForegroundColor Green
    Write-Host ""
    exit 0
}

Write-Host "⚠️  La colonne phone n'existe pas, application de la migration..." -ForegroundColor Yellow
Write-Host ""

# 2. Appliquer la migration
try {
    $migrationResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -File $MIGRATION_FILE 2>&1
    
    if ($LASTEXITCODE -eq 0 -or $migrationResult -match "NOTICE.*ajoutée|NOTICE.*existe") {
        Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
        Write-Host ""
        
        # Vérifier à nouveau
        $verifyResult = Invoke-PSQL -DatabaseUrl $DATABASE_URL -Command $checkQuery 2>&1
        if ($verifyResult -match "t|true|1") {
            Write-Host "✅ Vérification : colonne phone présente" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Vérification : colonne phone peut-être absente (vérifiez manuellement)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  Migration appliquée (vérifiez les messages ci-dessus)" -ForegroundColor Yellow
        Write-Host $migrationResult
    }
} catch {
    Write-Host "❌ Erreur lors de la migration:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

