# ============================================================================
# Script PowerShell pour créer les tables de notifications
# ============================================================================
# Usage: .\scripts\db\create_notifications_tables.ps1
# ============================================================================

param(
    [Parameter(Mandatory=$false)]
    [string]$DATABASE_URL = $env:DATABASE_URL
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CRÉATION TABLES NOTIFICATIONS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que DATABASE_URL est défini
if ([string]::IsNullOrEmpty($DATABASE_URL)) {
    Write-Host "❌ Erreur: DATABASE_URL n'est pas défini" -ForegroundColor Red
    Write-Host "   Définissez-le comme variable d'environnement ou passez-le en paramètre" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Exemples:" -ForegroundColor Yellow
    Write-Host "  $env:DATABASE_URL = 'postgresql://user:pass@host/db'" -ForegroundColor Gray
    Write-Host "  .\create_notifications_tables.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Gray
    exit 1
}

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

Write-Host "🔄 Création des tables de notifications..." -ForegroundColor Yellow
Write-Host ""

# Exécuter le script SQL
$scriptPath = Join-Path $PSScriptRoot "..\..\sql\create_notifications_tables.sql"
$env:PGPASSWORD = ""  # Utiliser l'URL complète avec mot de passe

try {
    $output = psql $DATABASE_URL -f $scriptPath 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Tables de notifications créées avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "Tables créées:" -ForegroundColor Cyan
        Write-Host "  - user_notifications_preferences" -ForegroundColor Gray
        Write-Host "  - patient_notifications_preferences" -ForegroundColor Gray
        Write-Host ""
        Write-Host $output -ForegroundColor Gray
    } else {
        Write-Host "❌ Erreur lors de la création des tables" -ForegroundColor Red
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

