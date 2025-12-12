# ═══════════════════════════════════════════════════════════════════
# AUDIT COMPLET DU SCHÉMA BASE DE DONNÉES
# ═══════════════════════════════════════════════════════════════════
# Détecte les incohérences, doublons, colonnes manquantes/orphelines
# HAPPLYZ MEDICAL SAS
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$DATABASE_URL = $env:DATABASE_URL,
    [switch]$Fix = $false  # Mode correction automatique (non implémenté pour l'instant)
)

if (-not $DATABASE_URL) {
    Write-Host "❌ Erreur: DATABASE_URL n'est pas défini" -ForegroundColor Red
    Write-Host "   Définissez-le comme variable d'environnement ou passez-le en paramètre" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n🔍 AUDIT COMPLET DU SCHÉMA BASE DE DONNÉES" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  ℹ️  $Text" -ForegroundColor Gray }

$issues = @()
$warnings = @()

# 1. Test de connexion
Write-Section "1. Test de Connexion"
try {
    $result = psql $DATABASE_URL -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Connexion réussie"
        $version = ($result | Select-Object -First 1).Trim()
        Write-Info $version
    } else {
        Write-Err "Échec connexion"
        Write-Host $result
        exit 1
    }
} catch {
    Write-Err "Erreur: $_"
    exit 1
}

# 2. Liste des tables attendues (depuis schema.sql)
Write-Section "2. Vérification Tables Attendues"
$expectedTables = @(
    "roles", "permissions", "role_permissions",
    "users", "patients", "devices", "measurements",
    "alerts", "device_logs", "device_configurations",
    "firmware_versions", "firmware_compilations",
    "user_notifications_preferences", "patient_notifications_preferences", "notifications_queue",
    "audit_logs", "usb_logs", "device_commands"
)

$existingTables = @()
foreach ($table in $expectedTables) {
    $result = psql $DATABASE_URL -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '$table');" -t 2>&1
    $exists = ($result -match "t")
    if ($exists) {
        Write-OK "Table '$table' existe"
        $existingTables += $table
    } else {
        Write-Err "Table '$table' MANQUANTE"
        $issues += "Table manquante: $table"
    }
}

# 3. Détection des tables orphelines (existent en DB mais pas dans le schéma)
Write-Section "3. Détection Tables Orphelines"
$allTablesQuery = @"
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;
"@
$allTables = psql $DATABASE_URL -c $allTablesQuery -t 2>&1 | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }

foreach ($table in $allTables) {
    if ($expectedTables -notcontains $table) {
        Write-Warn "Table orpheline détectée: '$table' (existe en DB mais pas dans schema.sql)"
        $warnings += "Table orpheline: $table"
    }
}

# 4. Détection des colonnes en double (ex: birth_date vs date_of_birth)
Write-Section "4. Détection Colonnes en Double/Similaires"
$tablesToCheck = @("patients", "users", "devices", "measurements")

foreach ($tableName in $tablesToCheck) {
    if ($existingTables -contains $tableName) {
        Write-Info "Vérification table '$tableName'..."
        
        # Récupérer toutes les colonnes
        $columnsQuery = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$tableName' ORDER BY column_name;"
        $columns = psql $DATABASE_URL -c $columnsQuery -t 2>&1 | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }
        
        # Détecter les colonnes similaires (doublons potentiels)
        $similarColumns = @()
        foreach ($col1 in $columns) {
            foreach ($col2 in $columns) {
                if ($col1 -ne $col2) {
                    # Détecter les noms similaires (ex: birth_date vs date_of_birth)
                    $normalized1 = $col1 -replace '_', '' -replace '-', '' | ForEach-Object { $_.ToLower() }
                    $normalized2 = $col2 -replace '_', '' -replace '-', '' | ForEach-Object { $_.ToLower() }
                    
                    # Vérifier si les colonnes contiennent les mêmes mots
                    $words1 = $col1 -split '_' | ForEach-Object { $_.ToLower() }
                    $words2 = $col2 -split '_' | ForEach-Object { $_.ToLower() }
                    
                    $commonWords = $words1 | Where-Object { $words2 -contains $_ }
                    if ($commonWords.Count -ge 2 -and $commonWords.Count -eq [Math]::Min($words1.Count, $words2.Count)) {
                        $similarColumns += "$col1 / $col2"
                    }
                }
            }
        }
        
        if ($similarColumns.Count -gt 0) {
            Write-Err "Colonnes similaires/doublons détectées dans '$tableName':"
            foreach ($similar in ($similarColumns | Select-Object -Unique)) {
                Write-Err "  - $similar"
                $issues += "Colonnes similaires dans $tableName : $similar"
            }
        }
    }
}

# 5. Vérification spécifique : birth_date vs date_of_birth dans patients
Write-Section "5. Vérification Problèmes Connus"
if ($existingTables -contains "patients") {
    $hasBirthDate = $false
    $hasDateOfBirth = $false
    
    $columnsQuery = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'patients';"
    $columns = psql $DATABASE_URL -c $columnsQuery -t 2>&1 | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }
    
    if ($columns -contains "birth_date") {
        $hasBirthDate = $true
        Write-Warn "Colonne 'birth_date' trouvée dans patients"
    }
    if ($columns -contains "date_of_birth") {
        $hasDateOfBirth = $true
        Write-Warn "Colonne 'date_of_birth' trouvée dans patients"
    }
    
    if ($hasBirthDate -and $hasDateOfBirth) {
        Write-Err "⚠️  DOUBLON DÉTECTÉ: patients a à la fois 'birth_date' ET 'date_of_birth'"
        Write-Info "  Recommandation: Supprimer 'birth_date' et utiliser uniquement 'date_of_birth'"
        $issues += "DOUBLON CRITIQUE: patients.birth_date et patients.date_of_birth existent tous les deux"
    }
}

# 6. Vérification colonnes attendues vs existantes
Write-Section "6. Vérification Colonnes Attendues"
$expectedColumns = @{
    "users" = @("id", "email", "password_hash", "first_name", "last_name", "role_id", "is_active", "deleted_at", "created_at", "updated_at")
    "patients" = @("id", "first_name", "last_name", "date_of_birth", "phone", "email", "deleted_at", "created_at", "updated_at")
    "devices" = @("id", "sim_iccid", "device_serial", "device_name", "status", "patient_id", "last_seen", "deleted_at", "created_at", "updated_at")
    "measurements" = @("id", "device_id", "timestamp", "flowrate", "battery", "signal_strength", "deleted_at", "created_at")
    "user_notifications_preferences" = @("user_id", "email_enabled", "sms_enabled", "push_enabled", "phone_number", "created_at", "updated_at")
    "patient_notifications_preferences" = @("patient_id", "email_enabled", "sms_enabled", "push_enabled", "phone_number", "created_at", "updated_at")
}

foreach ($tableName in $expectedColumns.Keys) {
    if ($existingTables -contains $tableName) {
        Write-Info "Vérification colonnes table '$tableName'..."
        
        $columnsQuery = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$tableName' ORDER BY column_name;"
        $actualColumns = psql $DATABASE_URL -c $columnsQuery -t 2>&1 | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }
        
        foreach ($expectedCol in $expectedColumns[$tableName]) {
            if ($actualColumns -contains $expectedCol) {
                Write-OK "  $tableName.$expectedCol existe"
            } else {
                Write-Err "  $tableName.$expectedCol MANQUANTE"
                $issues += "Colonne manquante: $tableName.$expectedCol"
            }
        }
    }
}

# 7. Détection colonnes orphelines (existent en DB mais pas attendues)
Write-Section "7. Détection Colonnes Orphelines"
foreach ($tableName in $expectedColumns.Keys) {
    if ($existingTables -contains $tableName) {
        $columnsQuery = "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '$tableName' ORDER BY column_name;"
        $actualColumns = psql $DATABASE_URL -c $columnsQuery -t 2>&1 | Where-Object { $_.Trim() -ne '' } | ForEach-Object { $_.Trim() }
        
        foreach ($actualCol in $actualColumns) {
            if ($expectedColumns[$tableName] -notcontains $actualCol) {
                # Ignorer les colonnes système ou communes
                if ($actualCol -notmatch "^(id|created_at|updated_at|deleted_at)$") {
                    Write-Warn "  $tableName.$actualCol existe mais n'est pas dans la liste attendue"
                    $warnings += "Colonne orpheline: $tableName.$actualCol"
                }
            }
        }
    }
}

# 8. Vérification contraintes et index
Write-Section "8. Vérification Contraintes et Index"
$criticalIndexes = @(
    @{Table="measurements"; Index="idx_measurements_device_time"},
    @{Table="devices"; Index="devices_pkey"},
    @{Table="users"; Index="users_pkey"},
    @{Table="patients"; Index="patients_pkey"}
)

foreach ($idx in $criticalIndexes) {
    $indexQuery = "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = '$($idx.Table)' AND indexname = '$($idx.Index)');"
    $result = psql $DATABASE_URL -c $indexQuery -t 2>&1
    if ($result -match "t") {
        Write-OK "Index '$($idx.Index)' existe sur '$($idx.Table)'"
    } else {
        Write-Warn "Index '$($idx.Index)' manquant sur '$($idx.Table)'"
        $warnings += "Index manquant: $($idx.Table).$($idx.Index)"
    }
}

# 9. Vérification tables de notifications
Write-Section "9. Vérification Tables de Notifications"
$notificationTables = @("user_notifications_preferences", "patient_notifications_preferences", "notifications_queue")
foreach ($table in $notificationTables) {
    if ($existingTables -contains $table) {
        Write-OK "Table '$table' existe"
    } else {
        Write-Err "Table '$table' MANQUANTE (nécessaire pour les notifications)"
        $issues += "Table notifications manquante: $table"
    }
}

# 10. Résumé et recommandations
Write-Section "10. Résumé"
Write-Host ""
if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-OK "Aucun problème détecté ! La base de données est propre."
} else {
    if ($issues.Count -gt 0) {
        Write-Err "`n❌ PROBLÈMES CRITIQUES DÉTECTÉS ($($issues.Count)):"
        foreach ($issue in $issues) {
            Write-Err "  - $issue"
        }
    }
    
    if ($warnings.Count -gt 0) {
        Write-Warn "`n⚠️  AVERTISSEMENTS ($($warnings.Count)):"
        foreach ($warning in $warnings) {
            Write-Warn "  - $warning"
        }
    }
    
    Write-Host ""
    Write-Info "Recommandations:"
    Write-Info "  1. Exécuter sql/migration_add_notifications_tables.sql pour créer les tables de notifications"
    Write-Info "  2. Vérifier et corriger les doublons de colonnes (ex: birth_date vs date_of_birth)"
    Write-Info "  3. Exécuter sql/migration.sql pour appliquer les migrations manquantes"
    Write-Info "  4. Vérifier que schema.sql est à jour avec toutes les modifications"
}

Write-Host ""
Write-Host "✅ Audit terminé" -ForegroundColor Green
Write-Host ""

# Retourner le code de sortie approprié
if ($issues.Count -gt 0) {
    exit 1
} else {
    exit 0
}


