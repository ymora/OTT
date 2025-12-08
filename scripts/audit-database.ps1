# Script d'audit de la base de données OTT
# Usage: .\scripts\audit-database.ps1

param(
    [string]$DATABASE_URL = $env:DATABASE_URL
)

if (-not $DATABASE_URL) {
    Write-Host "❌ Erreur: DATABASE_URL n'est pas défini" -ForegroundColor Red
    Write-Host "   Définissez-le comme variable d'environnement ou passez-le en paramètre" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n🔍 AUDIT BASE DE DONNÉES OTT" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  ℹ️  $Text" -ForegroundColor Gray }

# 1. Test de connexion
Write-Section "1. Test de Connexion"
try {
    $result = psql $DATABASE_URL -c "SELECT version();" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Connexion réussie"
        Write-Info ($result | Select-Object -First 1)
    } else {
        Write-Err "Échec connexion"
        Write-Host $result
        exit 1
    }
} catch {
    Write-Err "Erreur: $_"
    exit 1
}

# 2. Vérification schéma
Write-Section "2. Vérification Schéma"
$tables = @("devices", "device_configurations", "measurements", "device_commands", "users", "patients")
foreach ($table in $tables) {
    $result = psql $DATABASE_URL -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');" -t 2>&1
    if ($result -match "t") {
        Write-OK "Table '$table' existe"
    } else {
        Write-Err "Table '$table' manquante"
    }
}

# 3. Vérification colonnes critiques
Write-Section "3. Vérification Colonnes Critiques"

# Table devices
Write-Info "Colonnes table 'devices'..."
$columns = psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'devices' ORDER BY column_name;" -t 2>&1
$requiredColumns = @("id", "sim_iccid", "device_serial", "device_name", "status", "last_seen")
foreach ($col in $requiredColumns) {
    if ($columns -match $col) {
        Write-OK "  devices.$col existe"
    } else {
        Write-Warn "  devices.$col manquante"
    }
}

# Table measurements
Write-Info "Colonnes table 'measurements'..."
$columns = psql $DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'measurements' ORDER BY column_name;" -t 2>&1
$requiredColumns = @("id", "device_id", "timestamp", "flowrate", "battery", "signal_strength")
foreach ($col in $requiredColumns) {
    if ($columns -match $col) {
        Write-OK "  measurements.$col existe"
    } else {
        Write-Warn "  measurements.$col manquante"
    }
}

# 4. Vérification cohérence données
Write-Section "4. Vérification Cohérence Données"

# Dispositifs sans ICCID
$result = psql $DATABASE_URL -c "SELECT COUNT(*) FROM devices WHERE sim_iccid IS NULL OR sim_iccid = '';" -t 2>&1
$count = [int]($result -replace '\s', '')
if ($count -eq 0) {
    Write-OK "Tous les dispositifs ont un ICCID"
} else {
    Write-Warn "$count dispositif(s) sans ICCID"
}

# Mesures orphelines
$result = psql $DATABASE_URL -c "SELECT COUNT(*) FROM measurements m LEFT JOIN devices d ON m.device_id = d.id WHERE d.id IS NULL;" -t 2>&1
$count = [int]($result -replace '\s', '')
if ($count -eq 0) {
    Write-OK "Aucune mesure orpheline"
} else {
    Write-Err "$count mesure(s) orpheline(s)"
}

# Dispositifs avec mesures
$result = psql $DATABASE_URL -c "SELECT COUNT(DISTINCT d.id) FROM devices d INNER JOIN measurements m ON d.id = m.device_id;" -t 2>&1
$withMeasurements = [int]($result -replace '\s', '')
$result = psql $DATABASE_URL -c "SELECT COUNT(*) FROM devices;" -t 2>&1
$totalDevices = [int]($result -replace '\s', '')
Write-Info "$withMeasurements/$totalDevices dispositif(s) ont des mesures"

# 5. Vérification contraintes
Write-Section "5. Vérification Contraintes"
$constraints = psql $DATABASE_URL -c "SELECT conname, contype FROM pg_constraint WHERE conrelid = 'devices'::regclass;" -t 2>&1
if ($constraints -match "devices_pkey") {
    Write-OK "Contrainte PRIMARY KEY sur devices"
} else {
    Write-Err "Contrainte PRIMARY KEY manquante sur devices"
}

# 6. Vérification index
Write-Section "6. Vérification Index"
$indexes = psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'measurements';" -t 2>&1
if ($indexes -match "idx_measurements_device_time") {
    Write-OK "Index idx_measurements_device_time existe"
} else {
    Write-Warn "Index idx_measurements_device_time manquant"
}

# 7. Statistiques
Write-Section "7. Statistiques"
$result = psql $DATABASE_URL -c "SELECT COUNT(*) FROM devices;" -t 2>&1
$count = [int]($result -replace '\s', '')
Write-Info "Dispositifs: $count"

$result = psql $DATABASE_URL -c "SELECT COUNT(*) FROM measurements;" -t 2>&1
$count = [int]($result -replace '\s', '')
Write-Info "Mesures: $count"

$result = psql $DATABASE_URL -c "SELECT COUNT(*) FROM device_commands WHERE status = 'pending';" -t 2>&1
$count = [int]($result -replace '\s', '')
Write-Info "Commandes en attente: $count"

Write-Host "`n✅ Audit terminé" -ForegroundColor Green

