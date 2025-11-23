# ============================================================================
# Script d'initialisation via SQL direct
# ============================================================================

$ErrorActionPreference = "Stop"

function Write-Info { param([string]$msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param([string]$msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param([string]$msg) Write-Host $msg -ForegroundColor Red }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Initialisation Base Firmwares (SQL)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Info "Ce script nécessite l'accès direct à la base de données PostgreSQL."
Write-Info "Alternative: Déployez d'abord le code sur Render, puis utilisez:"
Write-Host "  .\scripts\init_firmware_db_direct.ps1" -ForegroundColor Yellow
Write-Host ""

Write-Info "Ou exécutez le SQL directement sur votre base de données:"
Write-Host "  Fichier: sql/init_firmware_db.sql" -ForegroundColor Yellow
Write-Host ""

Write-Info "Pour l'instant, supprimons les firmwares via l'API disponible..."

$Token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Inltb3JhQGZyZWUuZnIiLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3NjM3OTk3MzQsImV4cCI6MTc2Mzg4NjEzNH0.B9gqvNcuar9P76qXWfL5-jqxMF67ceUPeupAl8vqvoc"
$ApiUrl = "https://ott-jbln.onrender.com"
$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

# Essayer de supprimer via l'endpoint clear-firmwares
Write-Info "Tentative de suppression via /admin/clear-firmwares..."
try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/clear-firmwares" `
        -Method POST `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Success "✅ Firmwares supprimés: $($response.deleted_count)"
    Write-Host ""
    Write-Success "🎉 La base est prête pour le premier upload!"
} catch {
    Write-Error "❌ Erreur: $($_.Exception.Message)"
    Write-Host ""
    Write-Info "Solution: Déployez d'abord le code sur Render avec les nouveaux endpoints,"
    Write-Info "ou exécutez le SQL directement sur votre base de données."
    Write-Host ""
    Write-Info "Fichier SQL: sql/init_firmware_db.sql"
}

