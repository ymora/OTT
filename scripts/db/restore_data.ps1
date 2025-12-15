# Script de restauration des données sauvegardées dans la base de données OTT
# Usage: .\scripts\db\restore_data.ps1 -DATABASE_URL "postgresql://user:pass@host:port/dbname" -BackupFile "backups/backup_20241215_120000.json" [-Confirm]

param(
    [Parameter(Mandatory=$true)]
    [string]$DATABASE_URL,
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [switch]$Confirm
)

Write-Host "📥 Restauration des données OTT" -ForegroundColor Cyan
Write-Host ""

# Vérifier que le fichier de sauvegarde existe
if (-not (Test-Path $BackupFile)) {
    Write-Host "❌ Fichier de sauvegarde introuvable : $BackupFile" -ForegroundColor Red
    exit 1
}

# Vérifier que psql est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez PostgreSQL client pour utiliser ce script" -ForegroundColor Yellow
    exit 1
}

# Charger le fichier de sauvegarde
Write-Host "📖 Lecture du fichier de sauvegarde..." -ForegroundColor Yellow
try {
    $backupContent = Get-Content $BackupFile -Raw -Encoding UTF8
    $backup = $backupContent | ConvertFrom-Json
    Write-Host "   ✅ Sauvegarde chargée (timestamp: $($backup.timestamp))" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur lors de la lecture du fichier de sauvegarde : $_" -ForegroundColor Red
    exit 1
}

if (-not $Confirm) {
    Write-Host ""
    Write-Host "⚠️  ATTENTION : Ce script va restaurer les données dans la base !" -ForegroundColor Yellow
    Write-Host "   Les données existantes pourront être écrasées." -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Tapez 'RESTORE' pour confirmer"
    if ($response -ne "RESTORE") {
        Write-Host "❌ Opération annulée" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "🔄 Restauration en cours..." -ForegroundColor Yellow
Write-Host ""

# Ordre de restauration (pour respecter les contraintes de clés étrangères)
$restoreOrder = @(
    "roles",
    "permissions",
    "role_permissions",
    "users",
    "patients",
    "devices",
    "measurements",
    "alerts",
    "device_configurations",
    "firmware_versions",
    "user_notifications_preferences",
    "patient_notifications_preferences",
    "device_commands"
)

# Désactiver temporairement les contraintes de clés étrangères
Write-Host "🔓 Désactivation des contraintes de clés étrangères..." -ForegroundColor Yellow
$disableFK = "SET session_replication_role = 'replica';"
& psql $DATABASE_URL -c $disableFK | Out-Null

# Fonction pour insérer des données dans une table
function Restore-TableData {
    param(
        [string]$TableName,
        [array]$Data
    )
    
    if ($null -eq $Data -or $Data.Count -eq 0) {
        Write-Host "   ⚠️  $TableName : aucune donnée à restaurer" -ForegroundColor Gray
        return
    }
    
    Write-Host "📋 Restauration de $TableName ($($Data.Count) enregistrement(s))..." -ForegroundColor Yellow
    
    # Construire la requête INSERT pour chaque enregistrement
    $successCount = 0
    $errorCount = 0
    
    foreach ($record in $Data) {
        try {
            # Convertir l'objet en hashtable pour faciliter la manipulation
            $props = $record | Get-Member -MemberType NoteProperty | Select-Object -ExpandProperty Name
            
            # Construire les colonnes et valeurs
            $columns = $props -join ", "
            $values = @()
            
            foreach ($prop in $props) {
                $value = $record.$prop
                
                # Gérer les types de données
                if ($null -eq $value) {
                    $values += "NULL"
                } elseif ($value -is [string]) {
                    # Échapper les apostrophes et backslashes
                    $escaped = $value -replace "\\", "\\\\" -replace "'", "''"
                    $values += "'$escaped'"
                } elseif ($value -is [bool]) {
                    $values += if ($value) { "TRUE" } else { "FALSE" }
                } elseif ($value -is [datetime]) {
                    $values += "'$($value.ToString('yyyy-MM-dd HH:mm:ss'))'"
                } elseif ($value -is [PSCustomObject]) {
                    # Objet JSON (pour jsonb)
                    $json = ($value | ConvertTo-Json -Compress) -replace "'", "''"
                    $values += "'$json'::jsonb"
                } elseif ($value -is [Array]) {
                    # Tableau (pour jsonb)
                    $json = ($value | ConvertTo-Json -Compress) -replace "'", "''"
                    $values += "'$json'::jsonb"
                } else {
                    $values += $value
                }
            }
            
            $valuesStr = $values -join ", "
            
            # Utiliser ON CONFLICT pour éviter les doublons
            $query = @"
INSERT INTO $TableName ($columns)
VALUES ($valuesStr)
ON CONFLICT DO NOTHING;
"@
            
            & psql $DATABASE_URL -c $query | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $successCount++
            } else {
                $errorCount++
            }
        } catch {
            $errorCount++
            Write-Host "      ⚠️  Erreur lors de la restauration d'un enregistrement : $_" -ForegroundColor Yellow
        }
    }
    
    if ($successCount -gt 0) {
        Write-Host "   ✅ $TableName : $successCount enregistrement(s) restauré(s)" -ForegroundColor Green
    }
    if ($errorCount -gt 0) {
        Write-Host "   ⚠️  $TableName : $errorCount erreur(s)" -ForegroundColor Yellow
    }
}

# Restaurer chaque table dans l'ordre
foreach ($table in $restoreOrder) {
    if ($backup.data.$table) {
        Restore-TableData -TableName $table -Data $backup.data.$table
    } else {
        Write-Host "   ⚠️  $table : aucune donnée dans la sauvegarde" -ForegroundColor Gray
    }
}

# Réactiver les contraintes de clés étrangères
Write-Host ""
Write-Host "🔒 Réactivation des contraintes de clés étrangères..." -ForegroundColor Yellow
$enableFK = "SET session_replication_role = 'origin';"
& psql $DATABASE_URL -c $enableFK | Out-Null

# Vérifier l'intégrité
Write-Host ""
Write-Host "🔍 Vérification de l'intégrité..." -ForegroundColor Yellow
$checkQuery = @"
SELECT 
    (SELECT COUNT(*) FROM users) as users_count,
    (SELECT COUNT(*) FROM patients) as patients_count,
    (SELECT COUNT(*) FROM devices) as devices_count,
    (SELECT COUNT(*) FROM measurements) as measurements_count;
"@

try {
    $result = & psql $DATABASE_URL -t -A -c $checkQuery
    if ($LASTEXITCODE -eq 0) {
        $counts = $result -split '\|'
        Write-Host "   ✅ Utilisateurs : $($counts[0])" -ForegroundColor Green
        Write-Host "   ✅ Patients : $($counts[1])" -ForegroundColor Green
        Write-Host "   ✅ Dispositifs : $($counts[2])" -ForegroundColor Green
        Write-Host "   ✅ Mesures : $($counts[3])" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Impossible de vérifier l'intégrité" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Restauration terminée !" -ForegroundColor Green

