# ============================================================================
# Script: Appliquer la migration pour ajouter la colonne status aux patients
# ============================================================================

Write-Host "🔄 Application de la migration: Ajout colonne status aux patients" -ForegroundColor Cyan
Write-Host ""

# Vérifier que Docker est en cours d'exécution
$dbContainer = docker ps --filter "name=ott-db" --format "{{.Names}}"
if (-not $dbContainer) {
    Write-Host "❌ Le conteneur PostgreSQL (ott-db) n'est pas en cours d'exécution" -ForegroundColor Red
    Write-Host "💡 Démarrez d'abord Docker avec: docker compose up -d db" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Conteneur PostgreSQL trouvé: $dbContainer" -ForegroundColor Green
Write-Host ""

# Chemin du fichier de migration
$migrationFile = Join-Path $PSScriptRoot "..\..\sql\migration_add_patient_status.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Fichier de migration introuvable: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "📄 Exécution de la migration: migration_add_patient_status.sql" -ForegroundColor Cyan
Write-Host ""

try {
    # Copier le fichier dans le conteneur et l'exécuter
    $migrationContent = Get-Content $migrationFile -Raw -Encoding UTF8
    
    # Exécuter la migration via psql
    $result = docker compose exec -T db psql -U postgres -d ott_data -c $migrationContent 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration appliquée avec succès !" -ForegroundColor Green
        Write-Host ""
        
        # Vérifier que la colonne existe
        Write-Host "🔍 Vérification de la colonne status..." -ForegroundColor Cyan
        $checkResult = docker compose exec -T db psql -U postgres -d ott_data -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'status';" 2>&1
        
        if ($checkResult -match "status") {
            Write-Host "✅ Colonne status confirmée dans la table patients" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Colonne status non trouvée - vérification manuelle recommandée" -ForegroundColor Yellow
        }
        
        Write-Host ""
        Write-Host "🎯 Migration terminée !" -ForegroundColor Green
    } else {
        Write-Host "❌ Erreur lors de l'exécution de la migration" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

