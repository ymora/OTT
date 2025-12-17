# ================================================================================
# Script simple pour appliquer le schéma SQL via PHP CLI
# Alternative si psql n'est pas disponible
# ================================================================================

param(
    [string]$DatabaseUrl = "",
    [string]$PhpPath = "php"
)

Write-Host "`n🔧 Application du schéma SQL via PHP CLI" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

# Vérifier que DATABASE_URL est fourni
if (-not $DatabaseUrl) {
    Write-Host "❌ Erreur: DATABASE_URL requis" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage: .\scripts\db\apply_schema_simple.ps1 -DatabaseUrl 'postgresql://user:pass@host:port/dbname'" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Vérifier que PHP est disponible
$phpPath = Get-Command $PhpPath -ErrorAction SilentlyContinue
if (-not $phpPath) {
    Write-Host "❌ Erreur: PHP n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour installer PHP sur Windows:" -ForegroundColor Yellow
    Write-Host "  1. Téléchargez depuis https://windows.php.net/download/" -ForegroundColor Gray
    Write-Host "  2. Ou utilisez Chocolatey: choco install php" -ForegroundColor Gray
    Write-Host "  3. Ou utilisez XAMPP/WAMP qui inclut PHP" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ PHP trouvé: $($phpPath.Source)" -ForegroundColor Green
Write-Host "   Version: " -NoNewline
& $PhpPath -v | Select-Object -First 1
Write-Host ""

# Vérifier l'extension PDO PostgreSQL
$phpModules = & $PhpPath -m 2>&1
if ($phpModules -notmatch "pdo_pgsql") {
    Write-Host "⚠️  Attention: Extension PDO PostgreSQL (pdo_pgsql) non trouvée" -ForegroundColor Yellow
    Write-Host "   Le script peut ne pas fonctionner correctement" -ForegroundColor Gray
    Write-Host ""
}

# Définir la variable d'environnement DATABASE_URL
$env:DATABASE_URL = $DatabaseUrl

# Exécuter le script PHP
Write-Host "📋 Application du schéma SQL..." -ForegroundColor Yellow
Write-Host ""

$scriptPath = Join-Path $PSScriptRoot "apply_schema_via_api.php"
if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Erreur: Script PHP introuvable: $scriptPath" -ForegroundColor Red
    exit 1
}

& $PhpPath $scriptPath

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Schéma appliqué avec succès !" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors de l'application du schéma" -ForegroundColor Red
    exit 1
}

