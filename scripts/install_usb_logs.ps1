<#
.SYNOPSIS
    Script d'installation de la fonctionnalité de monitoring USB à distance

.DESCRIPTION
    Ce script installe la table usb_logs dans la base de données PostgreSQL
    pour permettre aux administrateurs de consulter les logs USB à distance.

.EXAMPLE
    .\install_usb_logs.ps1
#>

param(
    [string]$EnvFile = ".env"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation - Monitoring USB à Distance" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que le fichier .env existe
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Erreur: Fichier $EnvFile introuvable" -ForegroundColor Red
    Write-Host "Assurez-vous d'être dans le répertoire racine du projet" -ForegroundColor Yellow
    exit 1
}

# Charger les variables d'environnement
Write-Host "📄 Chargement des variables d'environnement depuis $EnvFile..." -ForegroundColor Yellow
$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        $envVars[$key] = $value
    }
}

# Extraire les informations de connexion PostgreSQL
$dbUrl = $envVars['DATABASE_URL']
if (-not $dbUrl) {
    Write-Host "❌ Erreur: DATABASE_URL non trouvée dans $EnvFile" -ForegroundColor Red
    exit 1
}

# Parser l'URL PostgreSQL
# Format: postgresql://user:password@host:port/database
if ($dbUrl -match '^postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)$') {
    $dbUser = $matches[1]
    $dbPassword = $matches[2]
    $dbHost = $matches[3]
    $dbPort = $matches[4]
    $dbName = $matches[5]
    
    Write-Host "✅ Configuration détectée:" -ForegroundColor Green
    Write-Host "   Host: $dbHost" -ForegroundColor Gray
    Write-Host "   Port: $dbPort" -ForegroundColor Gray
    Write-Host "   Database: $dbName" -ForegroundColor Gray
    Write-Host "   User: $dbUser" -ForegroundColor Gray
} else {
    Write-Host "❌ Erreur: Format DATABASE_URL invalide" -ForegroundColor Red
    Write-Host "Format attendu: postgresql://user:password@host:port/database" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔧 Installation de la migration..." -ForegroundColor Yellow

# Définir le chemin du fichier SQL
$sqlFile = "sql/migration_add_usb_logs.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ Erreur: Fichier $sqlFile introuvable" -ForegroundColor Red
    exit 1
}

# Créer un fichier temporaire pour la variable d'environnement du mot de passe
$env:PGPASSWORD = $dbPassword

# Exécuter la migration avec psql
Write-Host "📤 Exécution de la migration SQL..." -ForegroundColor Yellow

try {
    # Vérifier si psql est disponible
    $psqlPath = Get-Command psql -ErrorAction SilentlyContinue
    
    if (-not $psqlPath) {
        Write-Host "❌ Erreur: psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
        Write-Host "Veuillez installer PostgreSQL Client ou l'ajouter au PATH" -ForegroundColor Yellow
        exit 1
    }
    
    # Exécuter la migration
    $result = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -f $sqlFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migration exécutée avec succès!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📊 Table usb_logs créée avec succès!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Installation terminée!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
        Write-Host "   1. Les logs USB seront automatiquement envoyés au serveur" -ForegroundColor White
        Write-Host "   2. Accédez à /dashboard/admin/usb-logs pour les consulter" -ForegroundColor White
        Write-Host "   3. Seuls les administrateurs peuvent voir les logs" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host "❌ Erreur lors de l'exécution de la migration:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Erreur lors de l'exécution de psql:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Nettoyer la variable d'environnement
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation terminée avec succès!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

