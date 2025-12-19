# Script SIMPLIFIÉ pour servir le site statique localement
# Usage: .\scripts\deploy\serve_local_simple.ps1 [port]

param(
    [int]$Port = 8080
)

Write-Host "🌐 Serveur local simple" -ForegroundColor Cyan
Write-Host ""

# Vérifier que le dossier out existe
if (-not (Test-Path "out")) {
    Write-Host "❌ Le dossier 'out' n'existe pas!" -ForegroundColor Red
    Write-Host "💡 Exécutez d'abord: .\scripts\deploy\build_local.ps1" -ForegroundColor Yellow
    exit 1
}

# Trouver Python
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
}

if ($null -eq $pythonCmd) {
    Write-Host "❌ Python n'est pas installé!" -ForegroundColor Red
    Write-Host "💡 Installez Python depuis: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Python trouvé: $pythonCmd" -ForegroundColor Green
Write-Host "📁 Dossier: out/" -ForegroundColor Green
Write-Host "🌐 Port: $Port" -ForegroundColor Green
Write-Host ""

# Créer le script Python directement dans le dossier out
$pythonScriptPath = Join-Path (Resolve-Path "out") "serve.py"

# Utiliser un here-string avec un délimiteur unique pour éviter les problèmes d'interprétation
$pythonCode = @'
import http.server
import socketserver
import os

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # Si la requête commence par /OTT/, enlever ce préfixe
        if self.path.startswith('/OTT/'):
            self.path = self.path[4:]
        elif self.path == '/OTT':
            self.path = '/'
        
        # Si c'est la racine, servir index.html
        if self.path == '/' or self.path == '':
            self.path = '/index.html'
        
        return super().do_GET()
    
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = PORT_VALUE_PLACEHOLDER

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    print(f"🌐 Serveur démarré sur http://localhost:{PORT}/OTT/")
    print(f"📁 Servant les fichiers depuis: {os.getcwd()}")
    print("")
    print("⚠️  IMPORTANT: Utilisez le chemin /OTT/ dans l'URL")
    print("📋 Appuyez sur Ctrl+C pour arrêter")
    print("")
    httpd.serve_forever()
'@

# Remplacer le placeholder par le port réel
$pythonCode = $pythonCode -replace 'PORT_VALUE_PLACEHOLDER', $Port

# Écrire le fichier Python
$pythonCode | Out-File -FilePath $pythonScriptPath -Encoding UTF8 -NoNewline -Force

Write-Host "✅ Script Python créé" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Site accessible sur:" -ForegroundColor Cyan
Write-Host "   http://localhost:$Port/OTT/" -ForegroundColor White
Write-Host ""
Write-Host "📋 Appuyez sur Ctrl+C pour arrêter le serveur" -ForegroundColor Gray
Write-Host ""

# Changer vers le dossier out et lancer Python
Push-Location "out"
try {
    & $pythonCmd "serve.py"
} finally {
    Pop-Location
    # Nettoyer le script Python
    if (Test-Path $pythonScriptPath) {
        Remove-Item $pythonScriptPath -Force -ErrorAction SilentlyContinue
    }
}
