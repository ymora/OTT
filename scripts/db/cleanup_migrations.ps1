# Script pour supprimer les fichiers de migration déjà exécutés
# Usage: .\scripts\db\cleanup_migrations.ps1 [-Confirm]

param(
    [switch]$Confirm
)

Write-Host "🧹 Nettoyage des fichiers de migration" -ForegroundColor Cyan
Write-Host ""

$sqlDir = Join-Path $PSScriptRoot "..\..\sql"
$migrationFiles = @(
    "migration.sql",
    "migration_add_measurements_deleted_at.sql",
    "migration_add_notifications_tables.sql",
    "migration_cleanup_device_names.sql",
    "migration_create_migration_history.sql",
    "migration_fix_duplicate_columns.sql",
    "migration_fix_users_with_roles_view.sql",
    "migration_repair_database.sql",
    "migration_sim_pin_varchar16.sql",
    "add_missing_indexes.sql"
)

$filesToDelete = @()
foreach ($file in $migrationFiles) {
    $filePath = Join-Path $sqlDir $file
    if (Test-Path $filePath) {
        $filesToDelete += $filePath
    }
}

if ($filesToDelete.Count -eq 0) {
    Write-Host "✅ Aucun fichier de migration à supprimer" -ForegroundColor Green
    exit 0
}

Write-Host "📋 Fichiers de migration trouvés :" -ForegroundColor Yellow
foreach ($file in $filesToDelete) {
    $fileName = Split-Path $file -Leaf
    Write-Host "   - $fileName" -ForegroundColor Gray
}

Write-Host ""

if (-not $Confirm) {
    Write-Host "⚠️  Ces fichiers seront supprimés définitivement !" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Tapez 'DELETE' pour confirmer"
    if ($response -ne "DELETE") {
        Write-Host "❌ Opération annulée" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🗑️  Suppression des fichiers..." -ForegroundColor Yellow

$deletedCount = 0
foreach ($file in $filesToDelete) {
    try {
        Remove-Item $file -Force
        $fileName = Split-Path $file -Leaf
        Write-Host "   ✅ Supprimé : $fileName" -ForegroundColor Green
        $deletedCount++
    } catch {
        $fileName = Split-Path $file -Leaf
        Write-Host "   ❌ Erreur lors de la suppression de $fileName : $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✅ Nettoyage terminé : $deletedCount fichier(s) supprimé(s)" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Les fichiers suivants sont conservés :" -ForegroundColor Cyan
Write-Host "   - schema.sql (schéma de base)" -ForegroundColor Gray
Write-Host "   - README_AUDIT_DATABASE.md (documentation)" -ForegroundColor Gray

