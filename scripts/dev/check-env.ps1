# Script pour vérifier l'environnement actuel
# Usage: .\scripts\check-env.ps1

Write-Host "🔍 Vérification de l'environnement OTT Dashboard" -ForegroundColor Cyan
Write-Host ""

# Vérifier les variables d'environnement
Write-Host "📋 Variables d'environnement:" -ForegroundColor Yellow
Write-Host "  NODE_ENV: $env:NODE_ENV" -ForegroundColor $(if ($env:NODE_ENV) { "Green" } else { "Gray" })
Write-Host "  NEXT_STATIC_EXPORT: $env:NEXT_STATIC_EXPORT" -ForegroundColor $(if ($env:NEXT_STATIC_EXPORT) { "Green" } else { "Gray" })
Write-Host "  NEXT_PUBLIC_BASE_PATH: $env:NEXT_PUBLIC_BASE_PATH" -ForegroundColor $(if ($env:NEXT_PUBLIC_BASE_PATH) { "Green" } else { "Gray" })
Write-Host "  NEXT_PUBLIC_API_URL: $env:NEXT_PUBLIC_API_URL" -ForegroundColor $(if ($env:NEXT_PUBLIC_API_URL) { "Green" } else { "Gray" })

Write-Host ""

# Vérifier les fichiers de configuration
Write-Host "📁 Fichiers de configuration:" -ForegroundColor Yellow
if (Test-Path ".env.local") {
    Write-Host "  ✓ .env.local présent" -ForegroundColor Green
    Write-Host "    Contenu:" -ForegroundColor Gray
    Get-Content ".env.local" | Select-String -Pattern "NEXT_PUBLIC|NODE_ENV|NEXT_STATIC" | ForEach-Object {
        Write-Host "      $_" -ForegroundColor Gray
    }
} else {
    Write-Host "  ⚠️  .env.local non trouvé (optionnel pour le développement)" -ForegroundColor Yellow
}

Write-Host ""

# Détecter le mode
Write-Host "🎯 Mode détecté:" -ForegroundColor Yellow
if ($env:NEXT_STATIC_EXPORT -eq "true") {
    Write-Host "  📦 MODE EXPORT STATIQUE (GitHub Pages)" -ForegroundColor Cyan
    Write-Host "    - BasePath: /OTT" -ForegroundColor Gray
    Write-Host "    - URL: https://ymora.github.io/OTT" -ForegroundColor Gray
} elseif ($env:NODE_ENV -eq "production") {
    Write-Host "  🚀 MODE PRODUCTION (Render)" -ForegroundColor Green
    Write-Host "    - BasePath: (aucun)" -ForegroundColor Gray
    Write-Host "    - Serveur Next.js" -ForegroundColor Gray
} else {
    Write-Host "  🖥️  MODE DÉVELOPPEMENT (Local)" -ForegroundColor Blue
    Write-Host "    - BasePath: (aucun)" -ForegroundColor Gray
    Write-Host "    - URL: http://localhost:3000" -ForegroundColor Gray
    Write-Host "    - Hot reload activé" -ForegroundColor Gray
}

Write-Host ""

# Vérifier l'API
Write-Host "🌐 Configuration API:" -ForegroundColor Yellow
$apiUrl = $env:NEXT_PUBLIC_API_URL
if (-not $apiUrl) {
    $apiUrl = "https://ott-jbln.onrender.com (défaut)"
    Write-Host "  ⚠️  NEXT_PUBLIC_API_URL non défini, utilisation de la valeur par défaut" -ForegroundColor Yellow
}
Write-Host "  API URL: $apiUrl" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Vérification terminée" -ForegroundColor Green

