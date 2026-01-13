# ============================================================================
# Script PowerShell pour RÉPARER la base de données
# ============================================================================
# SANS PERTE DE DONNÉES - Crée uniquement ce qui manque
# Usage: .\scripts\db\repair_database.ps1
# ============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$DATABASE_URL = $env:DATABASE_URL
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  🔧 RÉPARATION BASE DE DONNÉES" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Crée les tables manquantes" -ForegroundColor Green
Write-Host "✅ Crée les index manquants" -ForegroundColor Green
Write-Host "✅ GARDE TOUTES LES DONNÉES" -ForegroundColor Green
Write-Host "❌ NE SUPPRIME RIEN" -ForegroundColor Red
Write-Host ""

# Vérifier que DATABASE_URL est défini
if ([string]::IsNullOrEmpty($DATABASE_URL)) {
    Write-Host "❌ Erreur: DATABASE_URL n'est pas défini" -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Définissez-le comme variable d'environnement:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Pour Render (copier depuis Render Dashboard → PostgreSQL → Internal Database URL):" -ForegroundColor Gray
    Write-Host '  $env:DATABASE_URL = "postgresql://postgres:XXX@dpg-XXX.frankfurt-postgres.render.com/ott_XXX"' -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Puis relancez ce script:" -ForegroundColor Gray
    Write-Host "  .\scripts\db\repair_database.ps1" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "📋 DATABASE_URL: " -NoNewline -ForegroundColor Gray
$urlPreview = $DATABASE_URL.Substring(0, [Math]::Min(60, $DATABASE_URL.Length))
if ($DATABASE_URL.Length > 60) { $urlPreview += "..." }
Write-Host $urlPreview -ForegroundColor Cyan
Write-Host ""

# Vérifier que psql est disponible
try {
    $null = psql --version 2>&1
} catch {
    Write-Host "❌ Erreur: psql n'est pas installé" -ForegroundColor Red
    Write-Host ""
    Write-Host "📦 Installez PostgreSQL client:" -ForegroundColor Yellow
    Write-Host "  Windows: https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
    Write-Host "  ou via chocolatey: choco install postgresql" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "🔄 Exécution du script de réparation..." -ForegroundColor Yellow
Write-Host ""

# Exécuter le script SQL de réparation
$scriptPath = Join-Path $PSScriptRoot "..\..\sql\migration_repair_database.sql"

if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Erreur: Fichier repair_database.sql introuvable" -ForegroundColor Red
    Write-Host "   Chemin attendu: $scriptPath" -ForegroundColor Yellow
    exit 1
}

try {
    Write-Host "📝 Lecture du script: migration_repair_database.sql" -ForegroundColor Gray
    Write-Host "🔗 Connexion à la base de données..." -ForegroundColor Gray
    Write-Host ""
    
    $output = psql $DATABASE_URL -f $scriptPath 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  ✅ RÉPARATION TERMINÉE" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Résultat:" -ForegroundColor Cyan
        Write-Host $output -ForegroundColor Gray
        Write-Host ""
        Write-Host "✨ Votre base de données est maintenant complète !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Prochaines étapes:" -ForegroundColor Yellow
        Write-Host "  1. Retournez sur le dashboard" -ForegroundColor Gray
        Write-Host "  2. Testez les notifications utilisateurs" -ForegroundColor Gray
        Write-Host "  3. Testez la restauration de dispositifs" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "❌ Erreur lors de la réparation" -ForegroundColor Red
        Write-Host ""
        Write-Host "Détails de l'erreur:" -ForegroundColor Yellow
        Write-Host $output -ForegroundColor Red
        Write-Host ""
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ Erreur inattendue: $_" -ForegroundColor Red
    Write-Host ""
    exit 1
}

