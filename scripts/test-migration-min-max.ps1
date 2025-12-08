# Script pour tester et appliquer la migration des colonnes min/max
# Usage: .\scripts\test-migration-min-max.ps1

param(
    [string]$API_URL = "https://ott-jbln.onrender.com"
)

Write-Host "=== TEST MIGRATION COLONNES MIN/MAX ===" -ForegroundColor Cyan
Write-Host ""

# Lire le fichier de migration
$migrationFile = "sql/migration_add_min_max_columns.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "ERREUR: Fichier de migration non trouve: $migrationFile" -ForegroundColor Red
    exit 1
}

$migrationSQL = Get-Content $migrationFile -Raw

Write-Host "Fichier de migration: $migrationFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "Pour appliquer cette migration:" -ForegroundColor Yellow
Write-Host "1. Connectez-vous a votre base de donnees PostgreSQL" -ForegroundColor Gray
Write-Host "2. Executez le fichier: $migrationFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Ou via psql:" -ForegroundColor Yellow
Write-Host "   psql -h VOTRE_HOST -U VOTRE_USER -d VOTRE_DB -f $migrationFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Ou via l'interface de migration:" -ForegroundColor Yellow
Write-Host "   $API_URL/migrate.html" -ForegroundColor Gray
Write-Host ""

Write-Host "=== FIN ===" -ForegroundColor Cyan

