# Script pour servir le site statique localement avec support du basePath /OTT/
# Usage: .\scripts\deploy\serve_local_fixed.ps1 [port]

param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

Write-Host "🌐 Serveur local avec support basePath /OTT/" -ForegroundColor Cyan
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

# Créer un script Python temporaire qui gère le basePath
# Échapper le $Port pour éviter l'interpolation PowerShell
$portValue = $Port
$pythonScript = @"
import http.server
import socketserver
import os
import sys
from urllib.parse import urlparse, unquote

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Si la requête commence par /OTT/, enlever ce préfixe
        if self.path.startswith('/OTT/'):
            self.path = self.path[4:]  # Enlever '/OTT'
        elif self.path == '/OTT':
            self.path = '/'
        
        # Si c'est la racine, servir index.html
        if self.path == '/' or self.path == '':
            self.path = '/index.html'
        
        # Appeler la méthode parent
        return super().do_GET()
    
    def end_headers(self):
        # Ajouter des headers CORS pour le développement
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

# Changer vers le dossier out
os.chdir('out')

PORT = $portValue

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    print(f"🌐 Serveur démarré sur http://localhost:{PORT}/OTT/")
    print(f"📁 Servant les fichiers depuis: {os.getcwd()}")
    print("")
    print("⚠️  IMPORTANT: Utilisez le chemin /OTT/ dans l'URL")
    print("📋 Appuyez sur Ctrl+C pour arrêter")
    print("")
    httpd.serve_forever()
"@

$scriptPath = Join-Path $env:TEMP "serve_ott_$Port.py"
$pythonScript | Out-File -FilePath $scriptPath -Encoding UTF8

Write-Host "📁 Dossier: out/" -ForegroundColor Green
Write-Host "🌐 Port: $Port" -ForegroundColor Green
Write-Host ""

# Essayer d'utiliser Python
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
}

if ($pythonCmd) {
    Write-Host "✅ Utilisation de Python avec support basePath /OTT/" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Site accessible sur:" -ForegroundColor Cyan
    Write-Host "   http://localhost:$Port/OTT/" -ForegroundColor White
    Write-Host ""
    Write-Host "📋 Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Gray
    Write-Host ""
    
    Push-Location $PSScriptRoot
    Push-Location ..
    Push-Location ..
    try {
        & $pythonCmd $scriptPath
    } finally {
        Pop-Location
        Pop-Location
        Pop-Location
        # Nettoyer le script temporaire
        if (Test-Path $scriptPath) {
            Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "❌ Python n'est pas installé!" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Installez Python depuis: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host ""
    # Nettoyer le script temporaire
    if (Test-Path $scriptPath) {
        Remove-Item $scriptPath -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

