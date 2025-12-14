# Script de test pour vérifier si la version en ligne est à jour
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST VERSION EN LIGNE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Authentification
Write-Host "[1/5] Authentification..." -ForegroundColor Yellow
$token = $null
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -TimeoutSec 30 `
        -ErrorAction Stop

    if ($loginResponse.success -and $loginResponse.token) {
        $token = $loginResponse.token
        Write-Host "[OK] Connexion réussie" -ForegroundColor Green
    } else {
        Write-Host "[ERREUR] Échec de la connexion: $($loginResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERREUR] Erreur lors de la connexion: $_" -ForegroundColor Red
    exit 1
}

# 2. Récupérer la liste des firmwares
Write-Host ""
Write-Host "[2/5] Récupération de la liste des firmwares..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    if ($firmwaresResponse -and $firmwaresResponse.firmwares) {
        $firmwares = $firmwaresResponse.firmwares
        $compiledFirmware = $firmwares | Where-Object { $_.status -eq 'compiled' -and $_.bin_content } | Select-Object -First 1
        
        if ($compiledFirmware) {
            Write-Host "[OK] Firmware compilé trouvé: v$($compiledFirmware.version) (ID: $($compiledFirmware.id))" -ForegroundColor Green
        } else {
            Write-Host "[INFO] Aucun firmware compilé trouvé pour tester le téléchargement" -ForegroundColor Yellow
            exit 0
        }
    } else {
        Write-Host "[ERREUR] Impossible de récupérer la liste des firmwares" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERREUR] Erreur lors de la récupération: $_" -ForegroundColor Red
    exit 1
}

# 3. Test téléchargement avec vérification ETag et Cache-Control
Write-Host ""
Write-Host "[3/5] Test téléchargement avec vérification cache..." -ForegroundColor Yellow
try {
    $downloadUrl = "$API_URL/api.php/firmwares/$($compiledFirmware.id)/download"
    
    # Premier téléchargement (sans cache)
    Write-Host "  Premier téléchargement (sans cache)..." -ForegroundColor Gray
    $response1 = Invoke-WebRequest -Uri $downloadUrl `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    $etag1 = $response1.Headers['ETag']
    $cacheControl1 = $response1.Headers['Cache-Control']
    $contentLength1 = $response1.Headers['Content-Length']
    
    Write-Host "  Status: $($response1.StatusCode)" -ForegroundColor $(if($response1.StatusCode -eq 200){'Green'}else{'Yellow'})
    Write-Host "  ETag: $etag1" -ForegroundColor $(if($etag1){'Green'}else{'Red'})
    Write-Host "  Cache-Control: $cacheControl1" -ForegroundColor $(if($cacheControl1){'Green'}else{'Red'})
    Write-Host "  Content-Length: $contentLength1" -ForegroundColor Gray
    
    if ($etag1 -and $cacheControl1) {
        Write-Host "  [OK] Headers de cache présents" -ForegroundColor Green
    } else {
        Write-Host "  [ERREUR] Headers de cache manquants - Version peut-être pas à jour" -ForegroundColor Red
    }
    
    # Deuxième téléchargement (avec If-None-Match pour tester le cache)
    Write-Host ""
    Write-Host "  Deuxième téléchargement (avec If-None-Match)..." -ForegroundColor Gray
    $headersWithCache = $headers.Clone()
    $headersWithCache['If-None-Match'] = $etag1
    
    try {
        $response2 = Invoke-WebRequest -Uri $downloadUrl `
            -Method GET `
            -Headers $headersWithCache `
            -TimeoutSec 30 `
            -ErrorAction Stop
        
        Write-Host "  Status: $($response2.StatusCode)" -ForegroundColor $(if($response2.StatusCode -eq 304){'Green'}else{'Yellow'})
        
        if ($response2.StatusCode -eq 304) {
            Write-Host "  [OK] Cache fonctionne correctement (HTTP 304 Not Modified)" -ForegroundColor Green
        } else {
            Write-Host "  [ATTENTION] Cache ne fonctionne pas (attendu: 304, reçu: $($response2.StatusCode))" -ForegroundColor Yellow
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 304) {
            Write-Host "  Status: 304 (via exception)" -ForegroundColor Green
            Write-Host "  [OK] Cache fonctionne correctement (HTTP 304 Not Modified)" -ForegroundColor Green
        } else {
            Write-Host "  [ERREUR] Erreur lors du test de cache: $_" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "[ERREUR] Erreur lors du test de téléchargement: $_" -ForegroundColor Red
    exit 1
}

# 4. Vérifier la version du code (via un endpoint de version si disponible)
Write-Host ""
Write-Host "[4/5] Vérification des fonctionnalités..." -ForegroundColor Yellow

# Vérifier si le code a les dernières modifications en testant un comportement spécifique
$features = @{
    "ETag header" = $false
    "Cache-Control header" = $false
    "HTTP 304 support" = $false
}

if ($etag1) { $features["ETag header"] = $true }
if ($cacheControl1 -and $cacheControl1 -like "*max-age*") { $features["Cache-Control header"] = $true }
# HTTP 304 testé ci-dessus

Write-Host "  Fonctionnalités détectées:" -ForegroundColor Gray
foreach ($feature in $features.Keys) {
    $status = if ($features[$feature]) { "✅" } else { "❌" }
    $color = if ($features[$feature]) { "Green" } else { "Red" }
    Write-Host "    $status $feature" -ForegroundColor $color
}

# 5. Résumé
Write-Host ""
Write-Host "[5/5] Résumé" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

$allFeaturesOk = ($features["ETag header"] -and $features["Cache-Control header"])

if ($allFeaturesOk) {
    Write-Host "✅ VERSION À JOUR" -ForegroundColor Green
    Write-Host "   Les fonctionnalités de cache sont présentes et fonctionnelles" -ForegroundColor Green
} else {
    Write-Host "⚠️ VERSION PEUT-ÊTRE PAS À JOUR" -ForegroundColor Yellow
    Write-Host "   Certaines fonctionnalités de cache sont manquantes" -ForegroundColor Yellow
    Write-Host "   Dernier commit: 695a48bb (Fix: afficher barre progression téléchargement)" -ForegroundColor Gray
    Write-Host "   Vérifiez le déploiement sur Render.com" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Derniers commits poussés:" -ForegroundColor Cyan
git log --oneline -5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

Write-Host ""



