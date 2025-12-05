# ═══════════════════════════════════════════════════════════════════
# SCRIPT DE VÉRIFICATION BASE DE DONNÉES RENDER
# ═══════════════════════════════════════════════════════════════════
# Vérifie si toutes les colonnes nécessaires existent sur Render
# et identifie les migrations manquantes
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   🔍 VÉRIFICATION BASE DE DONNÉES RENDER - OTT Dashboard        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ═══════════════════════════════════════════════════════════════════
# CONFIGURATION - Render PostgreSQL
# ═══════════════════════════════════════════════════════════════════

Write-Host "📋 Veuillez entrer vos informations de connexion Render PostgreSQL:" -ForegroundColor Yellow
Write-Host ""

$DB_HOST = Read-Host "  🌐 Host (ex: dpg-xxxxx.oregon-postgres.render.com)"
$DB_NAME = Read-Host "  📦 Database name (ex: ott_xxxx)"
$DB_USER = Read-Host "  👤 User (ex: ott_xxxx_user)"
$DB_PASSWORD = Read-Host "  🔑 Password" -AsSecureString

# Convertir le mot de passe sécurisé en texte
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($DB_PASSWORD)
$DB_PASSWORD_TEXT = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

Write-Host "`n⏳ Connexion à la base de données Render...`n" -ForegroundColor Gray

# ═══════════════════════════════════════════════════════════════════
# REQUÊTES SQL DE VÉRIFICATION
# ═══════════════════════════════════════════════════════════════════

$queries = @{
    "devices_columns" = @"
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'devices'
ORDER BY ordinal_position;
"@
    
    "device_configurations_columns" = @"
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'device_configurations'
ORDER BY ordinal_position;
"@
    
    "usb_logs_exists" = @"
SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_name = 'usb_logs'
);
"@
    
    "gps_enabled_exists" = @"
SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'device_configurations' 
    AND column_name = 'gps_enabled'
);
"@
    
    "last_values_exist" = @"
SELECT 
    EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'last_battery') as last_battery,
    EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'last_flowrate') as last_flowrate,
    EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'last_rssi') as last_rssi;
"@
    
    "deleted_at_exists" = @"
SELECT 
    EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'devices' AND column_name = 'deleted_at') as devices_deleted_at,
    EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'patients' AND column_name = 'deleted_at') as patients_deleted_at,
    EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'deleted_at') as users_deleted_at;
"@
}

# ═══════════════════════════════════════════════════════════════════
# FONCTION D'EXÉCUTION PSQL
# ═══════════════════════════════════════════════════════════════════

function Invoke-PostgresQuery {
    param(
        [string]$Query,
        [string]$Title
    )
    
    Write-Host "`n🔍 Vérification: $Title" -ForegroundColor Cyan
    Write-Host "─────────────────────────────────────────────────────────────────`n" -ForegroundColor Gray
    
    # Créer une variable d'environnement temporaire pour le mot de passe
    $env:PGPASSWORD = $DB_PASSWORD_TEXT
    
    try {
        # Exécuter la requête via psql
        $result = & psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c $Query -t 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host $result -ForegroundColor White
            return $result
        } else {
            Write-Host "❌ ERREUR: $result" -ForegroundColor Red
            return $null
        }
    } catch {
        Write-Host "❌ ERREUR D'EXÉCUTION: $_" -ForegroundColor Red
        return $null
    } finally {
        Remove-Item env:PGPASSWORD -ErrorAction SilentlyContinue
    }
}

# ═══════════════════════════════════════════════════════════════════
# VÉRIFICATIONS
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    DÉBUT DES VÉRIFICATIONS                        ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════════╝" -ForegroundColor Green

$issues = @()

# 1. Vérifier table usb_logs
$usb_logs = Invoke-PostgresQuery -Query $queries["usb_logs_exists"] -Title "Table usb_logs"
if ($usb_logs -notmatch "t") {
    $issues += "❌ Table 'usb_logs' MANQUANTE"
    Write-Host "❌ Table 'usb_logs' n'existe pas!" -ForegroundColor Red
} else {
    Write-Host "✅ Table 'usb_logs' existe" -ForegroundColor Green
}

# 2. Vérifier colonne gps_enabled
$gps = Invoke-PostgresQuery -Query $queries["gps_enabled_exists"] -Title "Colonne gps_enabled"
if ($gps -notmatch "t") {
    $issues += "❌ Colonne 'device_configurations.gps_enabled' MANQUANTE"
    Write-Host "❌ Colonne 'gps_enabled' n'existe pas!" -ForegroundColor Red
} else {
    Write-Host "✅ Colonne 'gps_enabled' existe" -ForegroundColor Green
}

# 3. Vérifier colonnes last_*
$last_values = Invoke-PostgresQuery -Query $queries["last_values_exist"] -Title "Colonnes last_battery/flowrate/rssi"
if ($last_values) {
    if ($last_values -match "f") {
        $issues += "❌ Au moins une colonne 'last_*' MANQUANTE dans devices"
        Write-Host "❌ Des colonnes 'last_*' sont manquantes!" -ForegroundColor Red
    } else {
        Write-Host "✅ Toutes les colonnes 'last_*' existent" -ForegroundColor Green
    }
}

# 4. Vérifier colonnes deleted_at
$deleted_at = Invoke-PostgresQuery -Query $queries["deleted_at_exists"] -Title "Colonnes deleted_at (soft delete)"
if ($deleted_at) {
    if ($deleted_at -match "f") {
        $issues += "❌ Au moins une colonne 'deleted_at' MANQUANTE"
        Write-Host "❌ Des colonnes 'deleted_at' sont manquantes!" -ForegroundColor Red
    } else {
        Write-Host "✅ Toutes les colonnes 'deleted_at' existent" -ForegroundColor Green
    }
}

# 5. Afficher toutes les colonnes de devices
Write-Host "`n📋 STRUCTURE ACTUELLE DE LA TABLE 'devices':" -ForegroundColor Yellow
Invoke-PostgresQuery -Query $queries["devices_columns"] -Title "Colonnes de devices"

# 6. Afficher toutes les colonnes de device_configurations
Write-Host "`n📋 STRUCTURE ACTUELLE DE LA TABLE 'device_configurations':" -ForegroundColor Yellow
Invoke-PostgresQuery -Query $queries["device_configurations_columns"] -Title "Colonnes de device_configurations"

# ═══════════════════════════════════════════════════════════════════
# RAPPORT FINAL
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                        RAPPORT FINAL                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

if ($issues.Count -eq 0) {
    Write-Host "✅ AUCUN PROBLÈME DÉTECTÉ!" -ForegroundColor Green
    Write-Host "   La base de données Render est à jour.`n" -ForegroundColor Green
} else {
    Write-Host "❌ PROBLÈMES DÉTECTÉS: $($issues.Count)`n" -ForegroundColor Red
    
    foreach ($issue in $issues) {
        Write-Host "   $issue" -ForegroundColor Red
    }
    
    Write-Host "`n📝 SOLUTION:" -ForegroundColor Yellow
    Write-Host "   Vous devez exécuter le script de migration sur Render:" -ForegroundColor White
    Write-Host "   sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor Cyan
    
    Write-Host "   Méthode 1 - Via Web Console Render:" -ForegroundColor Yellow
    Write-Host "   1. Connectez-vous à render.com" -ForegroundColor White
    Write-Host "   2. Ouvrez votre base PostgreSQL" -ForegroundColor White
    Write-Host "   3. Cliquez sur 'Connect' > 'PSQL Command'" -ForegroundColor White
    Write-Host "   4. Copiez/collez le contenu de MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor White
    
    Write-Host "   Méthode 2 - Via PSQL local:" -ForegroundColor Yellow
    Write-Host "   psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor Cyan
}

Write-Host "╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    FIN DE LA VÉRIFICATION                         ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

