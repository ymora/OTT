# Script pour servir le site statique localement
# Usage: .\scripts\deploy\serve_local.ps1 [port]

param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

Write-Host "🌐 Serveur local pour le site statique" -ForegroundColor Cyan
Write-Host ""

# Vérifier que le dossier out existe
if (-not (Test-Path "out")) {
    Write-Host "❌ Le dossier 'out' n'existe pas!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Exécutez d'abord le build:" -ForegroundColor Yellow
    Write-Host "   .\scripts\deploy\build_local.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

# Vérifier que index.html existe
if (-not (Test-Path "out/index.html")) {
    Write-Host "❌ index.html manquant dans out/!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Exécutez d'abord le build:" -ForegroundColor Yellow
    Write-Host "   .\scripts\deploy\build_local.ps1" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "📁 Dossier: out/" -ForegroundColor Green
Write-Host "🌐 Port: $Port" -ForegroundColor Green
Write-Host ""

# Essayer d'utiliser Python en premier (plus simple)
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
}

if ($pythonCmd) {
    Write-Host "✅ Utilisation de Python pour servir le site" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Site accessible sur:" -ForegroundColor Cyan
    Write-Host "   http://localhost:$Port/OTT/" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Utilisez le chemin /OTT/ car le site est configuré avec basePath=/OTT" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📋 Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Gray
    Write-Host ""
    
    Push-Location "out"
    try {
        & $pythonCmd -m http.server $Port
    } finally {
        Pop-Location
    }
} else {
    # Essayer Node.js avec serve
    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Write-Host "✅ Utilisation de npx serve pour servir le site" -ForegroundColor Green
        Write-Host ""
        Write-Host "🌐 Site accessible sur:" -ForegroundColor Cyan
        Write-Host "   http://localhost:$Port/OTT/" -ForegroundColor White
        Write-Host ""
        Write-Host "⚠️  IMPORTANT: Utilisez le chemin /OTT/ car le site est configuré avec basePath=/OTT" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "📋 Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Gray
        Write-Host ""
        
        Push-Location "out"
        try {
            npx serve -p $Port
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "❌ Aucun serveur HTTP disponible!" -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Options pour installer un serveur:" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Option 1: Python (recommandé)" -ForegroundColor White
        Write-Host "      • Python est généralement déjà installé sur Windows" -ForegroundColor Gray
        Write-Host "      • Ou installez depuis: https://www.python.org/downloads/" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Option 2: Node.js serve" -ForegroundColor White
        Write-Host "      • Node.js est déjà installé (pour Next.js)" -ForegroundColor Gray
        Write-Host "      • npx serve sera utilisé automatiquement" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Option 3: PowerShell simple (basique)" -ForegroundColor White
        Write-Host "      • Utilisez IIS Express ou un autre serveur Windows" -ForegroundColor Gray
        Write-Host ""
        exit 1
    }
}

