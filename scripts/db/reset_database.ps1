# Script de réinitialisation complète de la base de données OTT
# ⚠️ ATTENTION : Ce script supprime TOUTES les données mais garde la structure
# Usage: .\scripts\db\reset_database.ps1 -DATABASE_URL "postgresql://user:pass@host:port/dbname" [-Confirm]

param(
    [Parameter(Mandatory=$true)]
    [string]$DATABASE_URL,
    [switch]$Confirm
)

Write-Host "🗑️  Réinitialisation de la base de données OTT" -ForegroundColor Red
Write-Host ""

if (-not $Confirm) {
    Write-Host "⚠️  ATTENTION : Ce script va supprimer TOUTES les données de la base !" -ForegroundColor Yellow
    Write-Host "   La structure des tables sera conservée, mais toutes les données seront perdues." -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Tapez 'RESET' pour confirmer"
    if ($response -ne "RESET") {
        Write-Host "❌ Opération annulée" -ForegroundColor Red
        exit 1
    }
}

# Vérifier que psql est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez PostgreSQL client pour utiliser ce script" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔄 Réinitialisation en cours..." -ForegroundColor Yellow
Write-Host ""

# Liste des tables à vider (dans l'ordre pour respecter les contraintes de clés étrangères)
$tables = @(
    "device_commands",
    "usb_logs",
    "audit_logs",
    "notifications_queue",
    "patient_notifications_preferences",
    "user_notifications_preferences",
    "device_configurations",
    "device_logs",
    "alerts",
    "measurements",
    "devices",
    "patients",
    "users",
    "role_permissions",
    "permissions",
    "roles"
)

# Désactiver temporairement les contraintes de clés étrangères
Write-Host "🔓 Désactivation des contraintes de clés étrangères..." -ForegroundColor Yellow
$disableFK = "SET session_replication_role = 'replica';"
& psql $DATABASE_URL -c $disableFK | Out-Null

# Vider chaque table
foreach ($table in $tables) {
    Write-Host "🗑️  Suppression des données de $table..." -ForegroundColor Yellow
    $query = "TRUNCATE TABLE $table CASCADE;"
    try {
        & psql $DATABASE_URL -c $query | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ $table vidée" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  Erreur lors de la vidage de $table" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  Erreur lors de la vidage de $table : $_" -ForegroundColor Yellow
    }
}

# Réactiver les contraintes de clés étrangères
Write-Host ""
Write-Host "🔒 Réactivation des contraintes de clés étrangères..." -ForegroundColor Yellow
$enableFK = "SET session_replication_role = 'origin';"
& psql $DATABASE_URL -c $enableFK | Out-Null

# Réinitialiser les séquences (pour que les IDs recommencent à 1)
Write-Host ""
Write-Host "🔄 Réinitialisation des séquences..." -ForegroundColor Yellow
$sequences = @(
    "roles_id_seq",
    "permissions_id_seq",
    "users_id_seq",
    "patients_id_seq",
    "devices_id_seq",
    "measurements_id_seq",
    "alerts_id_seq",
    "firmware_versions_id_seq"
)

foreach ($seq in $sequences) {
    try {
        $query = "SELECT setval('$seq', 1, false);"
        & psql $DATABASE_URL -c $query | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ $seq réinitialisée" -ForegroundColor Green
        }
    } catch {
        Write-Host "   ⚠️  Erreur lors de la réinitialisation de $seq" -ForegroundColor Yellow
    }
}

# Réinsérer les données de base (rôles et permissions depuis schema.sql)
Write-Host ""
Write-Host "📋 Réinsertion des données de base (rôles et permissions)..." -ForegroundColor Yellow
$schemaFile = Join-Path $PSScriptRoot "..\..\sql\schema.sql"
if (Test-Path $schemaFile) {
    # Extraire uniquement les INSERT depuis schema.sql
    $schemaContent = Get-Content $schemaFile -Raw
    if ($schemaContent -match "(?s)INSERT INTO roles.*?;") {
        $rolesInsert = $matches[0]
        & psql $DATABASE_URL -c $rolesInsert | Out-Null
        Write-Host "   ✅ Rôles réinsérés" -ForegroundColor Green
    }
    if ($schemaContent -match "(?s)INSERT INTO permissions.*?;") {
        $permissionsInsert = $matches[0]
        & psql $DATABASE_URL -c $permissionsInsert | Out-Null
        Write-Host "   ✅ Permissions réinsérées" -ForegroundColor Green
    }
    if ($schemaContent -match "(?s)INSERT INTO role_permissions.*?;") {
        $rolePermsInsert = $matches[0]
        & psql $DATABASE_URL -c $rolePermsInsert | Out-Null
        Write-Host "   ✅ Associations role_permissions réinsérées" -ForegroundColor Green
    }
} else {
    Write-Host "   ⚠️  Fichier schema.sql non trouvé, les données de base ne seront pas réinsérées" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Réinitialisation terminée !" -ForegroundColor Green
Write-Host "   La base de données est maintenant vide mais la structure est intacte." -ForegroundColor Gray

