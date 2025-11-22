# ============================================================================
# Script direct d'initialisation - Fait tout en une fois
# ============================================================================

$ErrorActionPreference = "Stop"

function Write-Info { param([string]$msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param([string]$msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param([string]$msg) Write-Host $msg -ForegroundColor Red }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Initialisation Base Firmwares" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ApiUrl = "https://ott-jbln.onrender.com"

# Demander le token
Write-Info "Token JWT requis pour l'initialisation."
Write-Host ""
Write-Info "Pour récupérer le token:"
Write-Host "  1. Ouvrez votre dashboard OTT (connecté)" -ForegroundColor Gray
Write-Host "  2. Appuyez sur F12 > Console" -ForegroundColor Gray
Write-Host "  3. Tapez: localStorage.getItem('ott_token')" -ForegroundColor Gray
Write-Host "  4. Copiez le token (sans les guillemets)" -ForegroundColor Gray
Write-Host ""
$Token = Read-Host "Collez votre token JWT"

if ([string]::IsNullOrEmpty($Token)) {
    Write-Error "Token manquant! Arrêt."
    exit 1
}

Write-Host ""
Write-Info "Initialisation en cours (ajout colonne + suppression firmwares)..."

try {
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    
    # Utiliser l'endpoint qui fait tout en une fois
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/init-firmware-db" `
        -Method POST `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host ""
    Write-Success "✅ Initialisation complète réussie!"
    Write-Host ""
    Write-Info "Résultats:"
    Write-Host "  - Colonne status: $($response.results.status_column)"
    Write-Host "  - Firmwares avant: $($response.results.firmwares_before)"
    Write-Host "  - Firmwares supprimés: $($response.results.deleted_count)"
    Write-Host "  - Firmwares après: $($response.results.firmwares_after)"
    Write-Host ""
    
    if ($response.results.firmwares_after -eq 0) {
        Write-Success "🎉 La base est prête pour le premier upload!"
    }
    
    Write-Host ""
    Write-Success "Vous pouvez maintenant uploader votre premier firmware via l'interface."
    
} catch {
    Write-Host ""
    Write-Error "❌ Erreur lors de l'initialisation:"
    Write-Host $_.Exception.Message -ForegroundColor Red
    
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Réponse: $responseBody" -ForegroundColor Red
        } catch {
            # Ignorer
        }
    }
    exit 1
}
