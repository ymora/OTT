# Script d'exécution de la migration GPS sur Render
# Ce script affiche les instructions pour exécuter manuellement la migration

$migrationFile = "sql/migration_add_gps_enabled.sql"

Write-Host "`n🔧 MIGRATION GPS - INSTRUCTIONS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n" -ForegroundColor White

# Lire le fichier
if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Fichier introuvable: $migrationFile`n" -ForegroundColor Red
    exit 1
}

$migration = Get-Content $migrationFile -Raw

Write-Host "📋 ÉTAPES:" -ForegroundColor Yellow
Write-Host "1. Aller sur https://dashboard.render.com" -ForegroundColor White
Write-Host "2. Votre base PostgreSQL → Onglet 'Shell'" -ForegroundColor White
Write-Host "3. Copier le SQL ci-dessous" -ForegroundColor White
Write-Host "4. Coller dans le shell et exécuter`n" -ForegroundColor White

Write-Host "📄 SQL À COPIER:" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Gray
Write-Host $migration
Write-Host "════════════════════════════════════════════`n" -ForegroundColor Gray

Write-Host "✅ Après exécution:" -ForegroundColor Green
Write-Host "  • Colonne gps_enabled ajoutée" -ForegroundColor White
Write-Host "  • GPS toggle fonctionnel" -ForegroundColor White
Write-Host "  • Prêt pour production`n" -ForegroundColor White
