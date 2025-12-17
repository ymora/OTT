# ================================================================================
# Script simple pour créer un utilisateur admin (utilise PHP si disponible)
# Alternative si psql n'est pas disponible
# ================================================================================

param(
    [string]$DatabaseUrl = "",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [string]$FirstName = "Yann",
    [string]$LastName = "Mora",
    [string]$Phone = ""
)

Write-Host "`n👤 Création de l'utilisateur admin" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

# Vérifier que PHP est disponible
$phpPath = Get-Command php -ErrorAction SilentlyContinue
if (-not $phpPath) {
    Write-Host "❌ Erreur: PHP n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez PHP pour utiliser ce script" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ PHP trouvé: $($phpPath.Source)" -ForegroundColor Green
Write-Host ""

# Si DatabaseUrl est fourni, l'utiliser
if ($DatabaseUrl) {
    $env:DATABASE_URL = $DatabaseUrl
}

# Définir les variables d'environnement
$env:ADMIN_EMAIL = $Email
$env:ADMIN_PASSWORD = $Password
$env:ADMIN_FIRST_NAME = $FirstName
$env:ADMIN_LAST_NAME = $LastName
if ($Phone) {
    $env:ADMIN_PHONE = $Phone
}

# Exécuter le script PHP
$scriptPath = Join-Path $PSScriptRoot "create_admin_user_via_api.php"
if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Erreur: Script PHP introuvable: $scriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "📝 Création de l'utilisateur admin..." -ForegroundColor Yellow
Write-Host "   Email: $Email" -ForegroundColor Gray
Write-Host "   Nom: $FirstName $LastName" -ForegroundColor Gray
Write-Host ""

& $phpPath $scriptPath

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Utilisateur admin créé avec succès !" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors de la création de l'utilisateur" -ForegroundColor Red
    exit 1
}

