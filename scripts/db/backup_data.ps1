# Script de sauvegarde des données importantes de la base de données OTT
# Usage: .\scripts\db\backup_data.ps1 -DATABASE_URL "postgresql://user:pass@host:port/dbname" -OutputFile "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"

param(
    [Parameter(Mandatory=$true)]
    [string]$DATABASE_URL,
    [string]$OutputFile = "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
)

Write-Host "💾 Sauvegarde des données OTT" -ForegroundColor Cyan
Write-Host ""

# Vérifier que psql est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez PostgreSQL client pour utiliser ce script" -ForegroundColor Yellow
    exit 1
}

# Créer le répertoire de sauvegarde s'il n'existe pas
$backupDir = "backups"
if (-not (Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}

$outputPath = Join-Path $backupDir $OutputFile

Write-Host "📦 Sauvegarde vers: $outputPath" -ForegroundColor Gray
Write-Host ""

# Fonction pour exécuter une requête SQL et récupérer les résultats en JSON
function Get-TableData {
    param(
        [string]$TableName,
        [string]$WhereClause = ""
    )
    
    $where = if ($WhereClause) { "WHERE $WhereClause" } else { "" }
    $query = "SELECT json_agg(t) FROM (SELECT * FROM $TableName $where) t;"
    
    try {
        $result = & psql $DATABASE_URL -t -A -c $query 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  Erreur lors de la lecture de $TableName : $result" -ForegroundColor Yellow
            return @()
        }
        
        $json = $result.Trim()
        if ([string]::IsNullOrWhiteSpace($json) -or $json -eq "null") {
            return @()
        }
        
        return ($json | ConvertFrom-Json)
    } catch {
        Write-Host "⚠️  Erreur lors de la lecture de $TableName : $_" -ForegroundColor Yellow
        return @()
    }
}

# Sauvegarder les données importantes
$backup = @{
    timestamp = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    version = "1.0"
    data = @{}
}

Write-Host "📋 Sauvegarde des rôles..." -ForegroundColor Yellow
$backup.data.roles = Get-TableData "roles"

Write-Host "📋 Sauvegarde des permissions..." -ForegroundColor Yellow
$backup.data.permissions = Get-TableData "permissions"

Write-Host "📋 Sauvegarde des associations role_permissions..." -ForegroundColor Yellow
$backup.data.role_permissions = Get-TableData "role_permissions"

Write-Host "📋 Sauvegarde des utilisateurs (avec mots de passe hashés)..." -ForegroundColor Yellow
$backup.data.users = Get-TableData "users" "deleted_at IS NULL"

Write-Host "📋 Sauvegarde des patients..." -ForegroundColor Yellow
$backup.data.patients = Get-TableData "patients" "deleted_at IS NULL"

Write-Host "📋 Sauvegarde des dispositifs..." -ForegroundColor Yellow
$backup.data.devices = Get-TableData "devices" "deleted_at IS NULL"

Write-Host "📋 Sauvegarde des mesures..." -ForegroundColor Yellow
$backup.data.measurements = Get-TableData "measurements" "deleted_at IS NULL"

Write-Host "📋 Sauvegarde des alertes..." -ForegroundColor Yellow
$backup.data.alerts = Get-TableData "alerts"

Write-Host "📋 Sauvegarde des configurations de dispositifs..." -ForegroundColor Yellow
$backup.data.device_configurations = Get-TableData "device_configurations"

Write-Host "📋 Sauvegarde des versions de firmware..." -ForegroundColor Yellow
$backup.data.firmware_versions = Get-TableData "firmware_versions"

Write-Host "📋 Sauvegarde des préférences de notifications utilisateurs..." -ForegroundColor Yellow
$backup.data.user_notifications_preferences = Get-TableData "user_notifications_preferences"

Write-Host "📋 Sauvegarde des préférences de notifications patients..." -ForegroundColor Yellow
$backup.data.patient_notifications_preferences = Get-TableData "patient_notifications_preferences"

Write-Host "📋 Sauvegarde des commandes de dispositifs..." -ForegroundColor Yellow
$backup.data.device_commands = Get-TableData "device_commands"

# Compter les enregistrements
$counts = @{}
foreach ($table in $backup.data.Keys) {
    $count = if ($backup.data[$table] -is [Array]) { $backup.data[$table].Count } else { 0 }
    $counts[$table] = $count
    if ($count -gt 0) {
        Write-Host "   ✅ $table : $count enregistrement(s)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  $table : 0 enregistrement" -ForegroundColor Gray
    }
}

# Sauvegarder dans le fichier JSON
$json = $backup | ConvertTo-Json -Depth 10
$json | Out-File -FilePath $outputPath -Encoding UTF8 -NoNewline

Write-Host ""
Write-Host "✅ Sauvegarde terminée : $outputPath" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Résumé:" -ForegroundColor Cyan
foreach ($table in $counts.Keys | Sort-Object) {
    Write-Host "   $table : $($counts[$table])" -ForegroundColor Gray
}

