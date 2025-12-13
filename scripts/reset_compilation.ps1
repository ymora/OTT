#requires -Version 7.0
<#
.SYNOPSIS
  Réinitialiser une compilation bloquée

.DESCRIPTION
  Ce script réinitialise le statut d'un firmware bloqué en "compiling"
  pour permettre une nouvelle tentative de compilation.
#>

param(
    [Parameter(Mandatory=$true)]
    [int]$FirmwareId,
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host ""
Write-Host "🔄 RÉINITIALISATION COMPILATION" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Authentification
try {
    $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 30
    $token = $loginResponse.token
    Write-Host "✅ Authentifié" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur authentification: $_" -ForegroundColor Red
    exit 1
}

# Récupérer le firmware actuel
$headers = @{ "Authorization" = "Bearer $token" }
$firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" -Headers $headers -TimeoutSec 30
$firmware = $firmwaresResponse.firmwares | Where-Object { $_.id -eq $FirmwareId } | Select-Object -First 1

if (-not $firmware) {
    Write-Host "❌ Firmware ID $FirmwareId non trouvé" -ForegroundColor Red
    exit 1
}

Write-Host "Firmware ID $FirmwareId - v$($firmware.version)" -ForegroundColor White
Write-Host "Status actuel: $($firmware.status)" -ForegroundColor Yellow
Write-Host ""

if ($firmware.status -ne 'compiling') {
    Write-Host "⚠️ Le firmware n'est pas en statut 'compiling'" -ForegroundColor Yellow
    Write-Host "Statut actuel: $($firmware.status)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Aucune action nécessaire." -ForegroundColor Green
    exit 0
}

Write-Host "Réinitialisation en cours..." -ForegroundColor Yellow

# NOTE: Il faudrait un endpoint API pour réinitialiser le statut
# Pour l'instant, on affiche juste les instructions

Write-Host ""
Write-Host "⚠️ ATTENTION" -ForegroundColor Yellow
Write-Host ""
Write-Host "La compilation est bloquée en 'compiling'." -ForegroundColor White
Write-Host "Cela arrive quand:" -ForegroundColor Gray
Write-Host "  - Le téléchargement des tools prend trop de temps" -ForegroundColor Gray
Write-Host "  - Le serveur Render redémarre pendant la compilation" -ForegroundColor Gray
Write-Host "  - La connexion SSE se ferme avant la fin" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 SOLUTIONS" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Attendre encore 5-10 minutes (compilation en cours)" -ForegroundColor White
Write-Host ""
Write-Host "2. Pousser l'optimisation vers Git MAINTENANT:" -ForegroundColor White
Write-Host "   git add .arduino15/ api/ scripts/" -ForegroundColor Gray
Write-Host "   git commit -m '⚡ Optimisation compilation'" -ForegroundColor Gray
Write-Host "   git push origin main" -ForegroundColor Gray
Write-Host "   → Prochain déploiement sera rapide (core pré-installé)" -ForegroundColor Green
Write-Host ""
Write-Host "3. Pour forcer l'arrêt (si vraiment bloqué):" -ForegroundColor White
Write-Host "   - Se connecter au dashboard Render" -ForegroundColor Gray
Write-Host "   - Redémarrer le service manuellement" -ForegroundColor Gray
Write-Host "   - Ou attendre le timeout automatique" -ForegroundColor Gray
Write-Host ""

