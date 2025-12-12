# Script de verification de la version en ligne
# Usage: .\scripts\deploy\check_online_version.ps1

$baseUrl = "https://ymora.github.io/OTT"

Write-Host "Verification de la version en ligne..." -ForegroundColor Cyan
Write-Host ""

# 1. Verifier le fichier de version
Write-Host "1. Fichier de version (.version.json):" -ForegroundColor Yellow
try {
    $version = Invoke-RestMethod -Uri "$baseUrl/.version.json" -ErrorAction Stop
    Write-Host "   OK Version: $($version.version)" -ForegroundColor Green
    Write-Host "   Timestamp: $($version.timestamp)" -ForegroundColor Gray
    Write-Host "   Commit: $($version.commit)" -ForegroundColor Gray
} catch {
    Write-Host "   ERREUR: Fichier .version.json non trouve" -ForegroundColor Red
}
Write-Host ""

# 2. Verifier le service worker
Write-Host "2. Service Worker:" -ForegroundColor Yellow
try {
    $swContent = Invoke-WebRequest -Uri "$baseUrl/sw.js" -UseBasicParsing
    if ($swContent.Content -match "CACHE_VERSION\s*=\s*['`"]([^'`"]+)['`"]") {
        Write-Host "   OK Version: $($matches[1])" -ForegroundColor Green
    } else {
        Write-Host "   ATTENTION: Version non trouvee" -ForegroundColor Yellow
    }
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "   OK Service worker supprime (comme prevu)" -ForegroundColor Green
    } else {
        Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    }
}
Write-Host ""

# 3. Verifier le manifest.json
Write-Host "3. Manifest.json:" -ForegroundColor Yellow
try {
    $manifest = Invoke-RestMethod -Uri "$baseUrl/manifest.json" -ErrorAction Stop
    if ($manifest.version) {
        Write-Host "   OK Version: $($manifest.version)" -ForegroundColor Green
    } else {
        Write-Host "   ATTENTION: Pas de version dans le manifest" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 4. Verifier le buildId dans le HTML
Write-Host "4. BuildId dans le HTML:" -ForegroundColor Yellow
try {
    $html = Invoke-WebRequest -Uri "$baseUrl/dashboard/dispositifs/" -UseBasicParsing
    if ($html.Content -match '"buildId":"([^"]+)"') {
        $buildId = $matches[1]
        Write-Host "   BuildId: $buildId" -ForegroundColor Gray
        if ($buildId -match "build-[a-f0-9]{7}-") {
            Write-Host "   OK BuildId contient un commit SHA" -ForegroundColor Green
        } else {
            Write-Host "   ATTENTION: BuildId ancien format (sans commit SHA)" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 5. Verifier les headers de cache
Write-Host "5. Headers de cache (page HTML):" -ForegroundColor Yellow
try {
    $headers = Invoke-WebRequest -Uri "$baseUrl/dashboard/dispositifs/" -Method Head -UseBasicParsing
    $cacheControl = $headers.Headers['Cache-Control']
    if ($cacheControl) {
        Write-Host "   Cache-Control: $cacheControl" -ForegroundColor Gray
        if ($cacheControl -match "no-cache|no-store|max-age=0") {
            Write-Host "   OK Headers no-cache presents" -ForegroundColor Green
        } else {
            Write-Host "   ATTENTION: Headers no-cache absents" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 6. Verifier les fichiers JS
Write-Host "6. Hash des fichiers JS:" -ForegroundColor Yellow
try {
    $html = Invoke-WebRequest -Uri "$baseUrl/dashboard/dispositifs/" -UseBasicParsing
    $jsFiles = [regex]::Matches($html.Content, '/_next/static/chunks/[^"]+\.js')
    if ($jsFiles.Count -gt 0) {
        Write-Host "   Fichiers JS trouves: $($jsFiles.Count)" -ForegroundColor Gray
        $jsFiles | Select-Object -First 3 | ForEach-Object {
            Write-Host "      - $($_.Value)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 7. Verifier le fichier _headers
Write-Host "7. Fichier _headers:" -ForegroundColor Yellow
try {
    $headersFile = Invoke-WebRequest -Uri "$baseUrl/_headers" -UseBasicParsing -ErrorAction Stop
    Write-Host "   OK Fichier _headers present" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "   ATTENTION: Fichier _headers non trouve (404)" -ForegroundColor Yellow
        Write-Host "      GitHub Pages ne supporte peut-etre pas _headers" -ForegroundColor Yellow
    } else {
        Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    }
}
Write-Host ""

# 8. Verifier si le service worker est enregistre dans le HTML
Write-Host "8. Service Worker dans le HTML:" -ForegroundColor Yellow
try {
    $html = Invoke-WebRequest -Uri "$baseUrl/dashboard/dispositifs/" -UseBasicParsing
    if ($html.Content -match "serviceWorker\.register") {
        if ($html.Content -match "false.*isProduction") {
            Write-Host "   OK Service worker desactive dans le HTML" -ForegroundColor Green
        } else {
            Write-Host "   ERREUR: Service worker active dans le HTML" -ForegroundColor Red
        }
    } else {
        Write-Host "   OK Aucun code d'enregistrement du service worker" -ForegroundColor Green
    }
} catch {
    Write-Host "   ERREUR: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "Verification terminee" -ForegroundColor Green
