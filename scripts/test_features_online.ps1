# Test des fonctionnalités en ligne
param(
    [string]$API_URL = "https://ott-jbln.onrender.com",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST FONCTIONNALITÉS EN LIGNE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Authentification
Write-Host "[1] Authentification..." -ForegroundColor Yellow
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
        Write-Host "  ✅ Connexion réussie" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Échec de la connexion" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

# Récupérer les firmwares
Write-Host ""
Write-Host "[2] Récupération des firmwares..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
}

try {
    $firmwaresResponse = Invoke-RestMethod -Uri "$API_URL/api.php/firmwares" `
        -Method GET `
        -Headers $headers `
        -TimeoutSec 30 `
        -ErrorAction Stop
    
    $firmwares = $firmwaresResponse.firmwares
    Write-Host "  ✅ $($firmwares.Count) firmware(s) trouvé(s)" -ForegroundColor Green
    
    $compiledFirmware = $firmwares | Where-Object { $_.status -eq 'compiled' } | Select-Object -First 1
    
    if (-not $compiledFirmware) {
        Write-Host ""
        Write-Host "⚠️ Aucun firmware compilé trouvé pour tester le téléchargement" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Résumé des fonctionnalités à vérifier manuellement:" -ForegroundColor Cyan
        Write-Host "  1. Cache navigateur (ETag, Cache-Control) - Code présent dans download.php" -ForegroundColor Gray
        Write-Host "  2. Progression téléchargement visible - Code présent dans FlashModal.js" -ForegroundColor Gray
        Write-Host "  3. Message cache navigateur - Code présent dans FlashModal.js" -ForegroundColor Gray
        Write-Host "  4. Barre progression séparée (bleue/violette) - Code présent dans FlashModal.js" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Pour tester:" -ForegroundColor Yellow
        Write-Host "  - Compilez un firmware via le dashboard" -ForegroundColor Gray
        Write-Host "  - Téléchargez-le et vérifiez les fonctionnalités ci-dessus" -ForegroundColor Gray
        exit 0
    }
    
    Write-Host "  ✅ Firmware compilé trouvé: v$($compiledFirmware.version) (ID: $($compiledFirmware.id))" -ForegroundColor Green
    
} catch {
    Write-Host "  ❌ Erreur: $_" -ForegroundColor Red
    exit 1
}

# Test téléchargement avec vérification des headers
Write-Host ""
Write-Host "[3] Test téléchargement avec vérification cache..." -ForegroundColor Yellow
$downloadUrl = "$API_URL/api.php/firmwares/$($compiledFirmware.id)/download"

try {
    # Premier téléchargement
    Write-Host "  Premier téléchargement..." -ForegroundColor Gray
    $response1 = try {
        Invoke-WebRequest -Uri $downloadUrl `
            -Method GET `
            -Headers $headers `
            -TimeoutSec 30 `
            -ErrorAction Stop
    } catch {
        # PowerShell peut lever une exception même pour HTTP 200
        $_.Exception.Response
    }
    
    if ($response1.StatusCode -eq 200 -or $response1.StatusCode -eq 304) {
        $etag = $response1.Headers['ETag']
        $cacheControl = $response1.Headers['Cache-Control']
        
        Write-Host "  Status: $($response1.StatusCode)" -ForegroundColor Green
        Write-Host "  ETag: $(if($etag){$etag}else{'❌ MANQUANT'})" -ForegroundColor $(if($etag){'Green'}else{'Red'})
        Write-Host "  Cache-Control: $(if($cacheControl){$cacheControl}else{'❌ MANQUANT'})" -ForegroundColor $(if($cacheControl){'Green'}else{'Red'})
        
        if ($etag -and $cacheControl) {
            Write-Host ""
            Write-Host "  ✅ FONCTIONNALITÉS DE CACHE PRÉSENTES" -ForegroundColor Green
            Write-Host "     La version en ligne semble à jour !" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "  ⚠️ FONCTIONNALITÉS DE CACHE MANQUANTES" -ForegroundColor Yellow
            Write-Host "     La version en ligne peut ne pas être à jour" -ForegroundColor Yellow
            Write-Host "     Dernier commit: 695a48bb" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ❌ Erreur: Status $($response1.StatusCode)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "  ❌ Erreur lors du test: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RÉSUMÉ" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Derniers commits poussés:" -ForegroundColor Yellow
git log --oneline -5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""
Write-Host "Pour vérifier le déploiement Render.com:" -ForegroundColor Cyan
Write-Host "  1. Allez sur https://dashboard.render.com" -ForegroundColor Gray
Write-Host "  2. Vérifiez la date du dernier déploiement" -ForegroundColor Gray
Write-Host "  3. Si le déploiement est récent, les fonctionnalités devraient être présentes" -ForegroundColor Gray
Write-Host ""



