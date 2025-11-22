# ============================================================================
# Script d'initialisation de la base de données Firmwares
# ============================================================================
# - Ajoute la colonne status si elle n'existe pas
# - Supprime les firmwares fictifs
# ============================================================================

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com",
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

function Write-Info { param([string]$msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Success { param([string]$msg) Write-Host $msg -ForegroundColor Green }
function Write-Error { param([string]$msg) Write-Host $msg -ForegroundColor Red }

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Initialisation Base Firmwares" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Demander le token si non fourni
if ([string]::IsNullOrEmpty($Token)) {
    Write-Info "Token JWT requis. Pour le récupérer:"
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
}

Write-Info "API URL: $ApiUrl"
Write-Info "Token: $($Token.Substring(0, [Math]::Min(20, $Token.Length)))..."
Write-Host ""

try {
    Write-Info "Envoi de la requête d'initialisation..."
    
    $headers = @{
        "Authorization" = "Bearer $Token"
        "Content-Type" = "application/json"
    }
    
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/init-firmware-db" `
        -Method POST `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host ""
    Write-Success "✅ Initialisation réussie!"
    Write-Host ""
    Write-Info "Résultats:"
    Write-Host "  - Colonne status: $($response.results.status_column)"
    Write-Host "  - Firmwares avant: $($response.results.firmwares_before)"
    Write-Host "  - Firmwares supprimés: $($response.results.deleted_count)"
    Write-Host "  - Firmwares après: $($response.results.firmwares_after)"
    Write-Host "  - Mis à jour: $($response.results.updated_count)"
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
            # Ignorer si on ne peut pas lire la réponse
        }
    }
    
    exit 1
}

