# Script pour servir le site statique localement avec support basePath /OTT/
# Usage: .\scripts\deploy\serve_local.ps1 [port]

param(
    [int]$Port = 8080
)

Write-Host "Serveur local avec support basePath /OTT/" -ForegroundColor Cyan
Write-Host ""

# Vérifier que le dossier out existe
if (-not (Test-Path "out")) {
    Write-Host "ERREUR: Le dossier 'out' n'existe pas!" -ForegroundColor Red
    Write-Host "Executez d'abord: .\scripts\deploy\build_local.ps1" -ForegroundColor Yellow
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
    Write-Host "ERREUR: Python n'est pas installe!" -ForegroundColor Red
    Write-Host "Installez Python depuis: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

Write-Host "Python trouve: $pythonCmd" -ForegroundColor Green
Write-Host "Dossier: out/" -ForegroundColor Green
Write-Host "Port: $Port" -ForegroundColor Green
Write-Host ""

# Créer le script Python dans le dossier out
$pythonScriptPath = Join-Path (Resolve-Path "out") "serve.py"

# Code Python sans emojis ni caractères spéciaux pour éviter les problèmes d'encodage
$pythonCodeLines = @(
    "import http.server",
    "import socketserver",
    "import os",
    "",
    "class CustomHandler(http.server.SimpleHTTPRequestHandler):",
    "    def do_GET(self):",
    "        if self.path.startswith('/OTT/'):",
    "            self.path = self.path[4:]",
    "        elif self.path == '/OTT':",
    "            self.path = '/'",
    "        if self.path == '/' or self.path == '':",
    "            self.path = '/index.html'",
    "        return super().do_GET()",
    "    def end_headers(self):",
    "        self.send_header('Access-Control-Allow-Origin', '*')",
    "        super().end_headers()",
    "",
    "os.chdir(os.path.dirname(os.path.abspath(__file__)))",
    "",
    "PORT = $Port",
    "",
    "with socketserver.TCPServer(('', PORT), CustomHandler) as httpd:",
    "    print(f'Serveur demarre sur http://localhost:{PORT}/OTT/')",
    "    print(f'Servant les fichiers depuis: {os.getcwd()}')",
    "    print('')",
    "    print('IMPORTANT: Utilisez le chemin /OTT/ dans l URL')",
    "    print('Appuyez sur Ctrl+C pour arreter')",
    "    print('')",
    "    httpd.serve_forever()"
)

$pythonCodeLines -join "`n" | Out-File -FilePath $pythonScriptPath -Encoding UTF8 -NoNewline

Write-Host "Script Python cree" -ForegroundColor Green
Write-Host ""
Write-Host "Site accessible sur:" -ForegroundColor Cyan
Write-Host "   http://localhost:$Port/OTT/" -ForegroundColor White
Write-Host ""
Write-Host "Appuyez sur Ctrl+C pour arreter le serveur" -ForegroundColor Gray
Write-Host ""

# Changer vers le dossier out et lancer Python
Push-Location "out"
try {
    & $pythonCmd "serve.py"
} finally {
    Pop-Location
    if (Test-Path $pythonScriptPath) {
        Remove-Item $pythonScriptPath -Force -ErrorAction SilentlyContinue
    }
}
