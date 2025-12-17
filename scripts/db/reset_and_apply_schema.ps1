# Script pour réinitialiser complètement la base et appliquer le schéma
# Usage: .\scripts\db\reset_and_apply_schema.ps1

param(
    [string]$ApiUrl = "https://ott-jbln.onrender.com"
)

Write-Host "🔄 Réinitialisation complète de la base de données" -ForegroundColor Cyan
Write-Host ""

# 1. Script SQL pour supprimer tous les objets (ordre important : triggers d'abord, puis tables)
$resetSql = @"
-- Supprimer tous les triggers
DROP TRIGGER IF EXISTS trg_roles_updated ON roles;
DROP TRIGGER IF EXISTS trg_permissions_updated ON permissions;
DROP TRIGGER IF EXISTS trg_users_updated ON users;
DROP TRIGGER IF EXISTS trg_patients_updated ON patients;
DROP TRIGGER IF EXISTS trg_devices_updated ON devices;
DROP TRIGGER IF EXISTS trg_update_device_min_max ON measurements;
DROP TRIGGER IF EXISTS trg_device_configurations_updated ON device_configurations;
DROP TRIGGER IF EXISTS trg_firmware_versions_updated ON firmware_versions;
DROP TRIGGER IF EXISTS trg_user_notifications_preferences_updated ON user_notifications_preferences;
DROP TRIGGER IF EXISTS trg_patient_notifications_preferences_updated ON patient_notifications_preferences;
DROP TRIGGER IF EXISTS trg_device_commands_updated ON device_commands;

-- Supprimer toutes les fonctions
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_device_min_max() CASCADE;

-- Supprimer toutes les vues
DROP VIEW IF EXISTS device_stats CASCADE;
DROP VIEW IF EXISTS users_with_roles CASCADE;

-- Supprimer toutes les tables (CASCADE pour supprimer les dépendances)
DROP TABLE IF EXISTS usb_logs CASCADE;
DROP TABLE IF EXISTS device_commands CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications_queue CASCADE;
DROP TABLE IF EXISTS patient_notifications_preferences CASCADE;
DROP TABLE IF EXISTS user_notifications_preferences CASCADE;
DROP TABLE IF EXISTS firmware_versions CASCADE;
DROP TABLE IF EXISTS device_configurations CASCADE;
DROP TABLE IF EXISTS device_logs CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS measurements CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS migration_history CASCADE;
"@

Write-Host "1️⃣  Suppression de tous les objets existants..." -ForegroundColor Yellow
try {
    $resetBody = @{
        sql = $resetSql
    } | ConvertTo-Json
    
    $resetResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $resetBody `
        -ContentType "application/json" `
        -TimeoutSec 300 `
        -ErrorAction Stop
    
    if ($resetResponse.success) {
        Write-Host "   ✅ Base réinitialisée" -ForegroundColor Green
        Write-Host "   ⏱️  Durée: $($resetResponse.duration)ms" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Erreur lors de la réinitialisation: $($resetResponse.error)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  Erreur (peut être normal si la base est vide): $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# 2. Appliquer le schéma complet
Write-Host "2️⃣  Application du schéma SQL complet..." -ForegroundColor Yellow
Write-Host ""

# Utiliser le script apply_schema_simple.ps1
$simpleScript = Join-Path $PSScriptRoot "apply_schema_simple.ps1"
if (Test-Path $simpleScript) {
    & $simpleScript -ApiUrl $ApiUrl
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Base de données initialisée avec succès !" -ForegroundColor Green
        exit 0
    } else {
        exit 1
    }
} else {
    Write-Host "   ❌ Script apply_schema_simple.ps1 introuvable" -ForegroundColor Red
    exit 1
}

# Code de fallback (ne devrait pas être atteint)
$schemaFile = Join-Path $PSScriptRoot "..\..\sql\schema.sql"
if (-not (Test-Path $schemaFile)) {
    Write-Host "   ❌ Fichier introuvable: $schemaFile" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $schemaFile -Raw -Encoding UTF8
$sqlContent = $sqlContent -replace "`r`n", "`n" -replace "`r", "`n"
$sqlLength = $sqlContent.Length
Write-Host "   📋 Fichier SQL: $schemaFile ($sqlLength caractères)" -ForegroundColor Gray

$body = @{
    sql = $sqlContent
} | ConvertTo-Json -Depth 10

try {
    Write-Host "   🚀 Envoi du schéma à l'API..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" `
        -Method POST `
        -Body $body `
        -ContentType "application/json" `
        -TimeoutSec 600 `
        -ErrorAction Stop
    
    if ($response.success) {
        Write-Host ""
        Write-Host "   ✅ Schéma appliqué avec succès !" -ForegroundColor Green
        if ($response.logs) {
            Write-Host ""
            Write-Host "   📋 Logs:" -ForegroundColor Cyan
            $response.logs | Select-Object -Last 10 | ForEach-Object {
                Write-Host "      $_" -ForegroundColor Gray
            }
        }
        Write-Host ""
        Write-Host "   ⏱️  Durée: $($response.duration)ms" -ForegroundColor Gray
        Write-Host "   📝 Instructions exécutées: $($response.statements_count)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "✅ Base de données initialisée avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Identifiants de connexion:" -ForegroundColor Cyan
        Write-Host "   Email: ymora@free.fr" -ForegroundColor White
        Write-Host "   Password: Ym120879" -ForegroundColor White
        Write-Host ""
        Write-Host "✅ Vous pouvez maintenant vous connecter !" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ""
        Write-Host "   ❌ Erreur: $($response.error)" -ForegroundColor Red
        if ($response.message) {
            Write-Host "      Message: $($response.message)" -ForegroundColor Gray
        }
        exit 1
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host ""
    Write-Host "   ❌ Erreur (code $statusCode)" -ForegroundColor Red
    Write-Host "      Message: $($_.Exception.Message)" -ForegroundColor Gray
    
    if ($statusCode -eq 403) {
        Write-Host ""
        Write-Host "   💡 Accès refusé - Vérifiez que ALLOW_MIGRATION_ENDPOINT=true sur Render" -ForegroundColor Yellow
    } elseif ($statusCode -eq 500) {
        Write-Host ""
        Write-Host "   💡 Erreur serveur - Vérifiez les logs Render pour plus de détails" -ForegroundColor Yellow
    }
    
    exit 1
}

