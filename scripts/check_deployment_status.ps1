# Script pour vérifier le statut de déploiement
param(
    [string]$API_URL = "https://ott-jbln.onrender.com"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "VÉRIFICATION STATUT DÉPLOIEMENT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier les derniers commits
Write-Host "[1/4] Derniers commits locaux:" -ForegroundColor Yellow
$lastCommits = git log --oneline -5
$lastCommits | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

# 2. Vérifier si le serveur répond
Write-Host "[2/4] Vérification du serveur..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$API_URL/api.php" `
        -Method GET `
        -TimeoutSec 10 `
        -ErrorAction Stop
    
    Write-Host "  [OK] Serveur accessible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "  [ERREUR] Serveur inaccessible: $_" -ForegroundColor Red
    exit 1
}

# 3. Vérifier les headers de sécurité (indicateur de version récente)
Write-Host ""
Write-Host "[3/4] Vérification des headers..." -ForegroundColor Yellow
try {
    $headers = $response.Headers
    
    $expectedHeaders = @{
        "Content-Security-Policy" = "Indicateur de version récente"
        "X-Frame-Options" = "Sécurité"
    }
    
    Write-Host "  Headers détectés:" -ForegroundColor Gray
    foreach ($header in $expectedHeaders.Keys) {
        if ($headers[$header]) {
            Write-Host "    ✅ $header" -ForegroundColor Green
        } else {
            Write-Host "    ❌ $header (manquant)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  [INFO] Impossible de vérifier tous les headers" -ForegroundColor Yellow
}

# 4. Vérifier le code source (via un endpoint de test si disponible)
Write-Host ""
Write-Host "[4/4] Recommandations:" -ForegroundColor Yellow
Write-Host "  - Vérifiez le dashboard Render.com pour voir le statut du déploiement" -ForegroundColor Gray
Write-Host "  - Les commits récents incluent:" -ForegroundColor Gray
Write-Host "    * Cache navigateur pour fichiers .bin (ETag, Cache-Control)" -ForegroundColor Gray
Write-Host "    * Progression téléchargement visible dans l'UI" -ForegroundColor Gray
Write-Host "    * Message cache navigateur visible" -ForegroundColor Gray
Write-Host "    * Progression compilation qui ne recule jamais" -ForegroundColor Gray
Write-Host ""
Write-Host "  Pour tester manuellement:" -ForegroundColor Cyan
Write-Host "  1. Connectez-vous au dashboard" -ForegroundColor Gray
Write-Host "  2. Téléchargez un firmware compilé" -ForegroundColor Gray
Write-Host "  3. Vérifiez si vous voyez:" -ForegroundColor Gray
Write-Host "     - Barre de progression bleue pour le téléchargement" -ForegroundColor Gray
Write-Host "     - Message 'Fichier chargé depuis le cache' si cache utilisé" -ForegroundColor Gray
Write-Host "     - Barre de progression violette pour le flash" -ForegroundColor Gray
Write-Host ""

# 5. Comparer avec le code local
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "COMPARAISON CODE LOCAL vs EN LIGNE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si les fichiers modifiés récemment existent localement
$recentFiles = @(
    "components/FlashModal.js",
    "api/handlers/firmwares/download.php",
    "api/handlers/firmwares/compile.php",
    "components/configuration/InoEditorTab.js"
)

Write-Host "Fichiers modifiés récemment (local):" -ForegroundColor Yellow
foreach ($file in $recentFiles) {
    if (Test-Path $file) {
        $lastModified = (Get-Item $file).LastWriteTime
        Write-Host "  ✅ $file (modifié: $lastModified)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file (introuvable)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Pour forcer un redéploiement sur Render.com:" -ForegroundColor Cyan
Write-Host "  git push --no-verify" -ForegroundColor Gray
Write-Host "  (Render.com redéploie automatiquement à chaque push)" -ForegroundColor Gray
Write-Host ""


