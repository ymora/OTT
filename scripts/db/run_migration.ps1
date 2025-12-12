# ============================================================================
# Script PowerShell pour exécuter une migration SQL
# ============================================================================
# Usage: .\scripts\db\run_migration.ps1 -MigrationFile "migration_xxx.sql"
# ============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$MigrationFile = "migration_add_notifications_tables.sql",
    
    [Parameter(Mandatory=$false)]
    [string]$DATABASE_URL = $env:DATABASE_URL
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  EXÉCUTION MIGRATION SQL" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que DATABASE_URL est défini
if ([string]::IsNullOrEmpty($DATABASE_URL)) {
    Write-Host "❌ Erreur: DATABASE_URL n'est pas défini" -ForegroundColor Red
    Write-Host "   Définissez-le comme variable d'environnement ou passez-le en paramètre" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Exemples:" -ForegroundColor Yellow
    Write-Host "  $env:DATABASE_URL = 'postgresql://user:pass@host/db'" -ForegroundColor Gray
    Write-Host "  .\run_migration.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Gray
    exit 1
}

# Construire le chemin du fichier SQL
$sqlPath = Join-Path $PSScriptRoot "..\..\sql\$MigrationFile"

# Vérifier que le fichier existe
if (-not (Test-Path $sqlPath)) {
    Write-Host "❌ Erreur: Fichier '$MigrationFile' introuvable" -ForegroundColor Red
    Write-Host "   Chemin recherché: $sqlPath" -ForegroundColor Yellow
    exit 1
}

Write-Host "📋 Fichier migration: " -NoNewline -ForegroundColor Gray
Write-Host $MigrationFile -ForegroundColor Cyan
Write-Host "📋 DATABASE_URL: " -NoNewline -ForegroundColor Gray
Write-Host $DATABASE_URL.Substring(0, [Math]::Min(50, $DATABASE_URL.Length)) + "..." -ForegroundColor Cyan
Write-Host ""

# Vérifier que psql est disponible
try {
    $null = psql --version
} catch {
    Write-Host "❌ Erreur: psql n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez PostgreSQL client pour continuer" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔄 Exécution de la migration..." -ForegroundColor Yellow
Write-Host ""

# Exécuter le script SQL
try {
    $output = psql $DATABASE_URL -f $sqlPath 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration exécutée avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host $output -ForegroundColor Gray
    } else {
        Write-Host "❌ Erreur lors de l'exécution de la migration" -ForegroundColor Red
        Write-Host $output -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  TERMINÉ ✅" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green

