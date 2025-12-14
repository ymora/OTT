# Script pour vérifier les mesures archivées en base de données
# Usage: .\scripts\check_archived_measurements.ps1

Write-Host "🔍 Vérification des mesures archivées en base de données..." -ForegroundColor Cyan

# Charger les variables d'environnement depuis .env.local ou env.example
$envFile = ".env.local"
if (-not (Test-Path $envFile)) {
    $envFile = "env.example"
    Write-Host "⚠️  Fichier .env.local non trouvé, utilisation de env.example" -ForegroundColor Yellow
}

if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

# Récupérer les paramètres de connexion
$dbHost = $env:DB_HOST
$dbPort = $env:DB_PORT
if (-not $dbPort) { $dbPort = "5432" }
$dbName = $env:DB_NAME
if (-not $dbName) { $dbName = "ott_data" }
$dbUser = $env:DB_USER
if (-not $dbUser) { $dbUser = "postgres" }
$dbPass = $env:DB_PASSWORD
if (-not $dbPass) { $dbPass = $env:DB_PASS }

# Vérifier si psql est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "💡 Installez PostgreSQL client ou utilisez Docker:" -ForegroundColor Yellow
    Write-Host "   docker exec -it ott-postgres psql -U postgres -d ott_data" -ForegroundColor Cyan
    exit 1
}

Write-Host "`n📊 Connexion à la base de données..." -ForegroundColor Cyan
Write-Host "   Host: $dbHost" -ForegroundColor Gray
Write-Host "   Port: $dbPort" -ForegroundColor Gray
Write-Host "   Database: $dbName" -ForegroundColor Gray
Write-Host "   User: $dbUser" -ForegroundColor Gray

# Requête SQL pour vérifier les mesures archivées
$query = @"
SELECT 
    COUNT(*) as total_archived,
    COUNT(DISTINCT device_id) as devices_with_archived,
    MIN(deleted_at) as oldest_archive,
    MAX(deleted_at) as newest_archive
FROM measurements 
WHERE deleted_at IS NOT NULL;
"@

$queryDetails = @"
SELECT 
    m.id,
    m.device_id,
    d.device_name,
    d.sim_iccid,
    m.timestamp,
    m.flowrate,
    m.battery,
    m.deleted_at
FROM measurements m
LEFT JOIN devices d ON m.device_id = d.id
WHERE m.deleted_at IS NOT NULL
ORDER BY m.deleted_at DESC
LIMIT 10;
"@

try {
    # Exécuter la requête de comptage
    $env:PGPASSWORD = $dbPass
    $result = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -A -F "|" -c $query 2>&1
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors de la connexion à la base de données" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
    
    $lines = $result -split "`n" | Where-Object { $_.Trim() -ne "" }
    if ($lines.Count -gt 0) {
        $data = $lines[0] -split '\|'
        $totalArchived = [int]$data[0]
        $devicesWithArchived = [int]$data[1]
        $oldestArchive = $data[2]
        $newestArchive = $data[3]
        
        Write-Host "`n✅ Résultats:" -ForegroundColor Green
        Write-Host "   📦 Total de mesures archivées: $totalArchived" -ForegroundColor Cyan
        Write-Host "   🔧 Dispositifs avec mesures archivées: $devicesWithArchived" -ForegroundColor Cyan
        
        if ($totalArchived -gt 0) {
            Write-Host "   📅 Plus ancienne archive: $oldestArchive" -ForegroundColor Gray
            Write-Host "   📅 Plus récente archive: $newestArchive" -ForegroundColor Gray
            
            Write-Host "`n📋 Détails des 10 dernières mesures archivées:" -ForegroundColor Cyan
            $details = & psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -A -F "|" -c $queryDetails 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`nID      | Device ID | Device Name | ICCID      | Timestamp           | Flowrate | Battery | Archived At" -ForegroundColor Yellow
                Write-Host "--------|-----------|-------------|------------|---------------------|----------|---------|-------------" -ForegroundColor Yellow
                
                $details -split "`n" | Where-Object { $_.Trim() -ne "" } | ForEach-Object {
                    $fields = $_ -split '\|'
                    if ($fields.Count -ge 8) {
                        $id = $fields[0].Trim().PadRight(8)
                        $devId = $fields[1].Trim().PadRight(11)
                        $devNameField = $fields[2].Trim()
                        $devName = if ($devNameField.Length -gt 11) { $devNameField.Substring(0, 11) } else { $devNameField }
                        $devName = $devName.PadRight(11)
                        $iccidField = $fields[3].Trim()
                        $iccid = if ($iccidField.Length -gt 10) { $iccidField.Substring(0, 10) } else { $iccidField }
                        $iccid = $iccid.PadRight(10)
                        $timestampField = $fields[4].Trim()
                        $timestamp = if ($timestampField.Length -gt 19) { $timestampField.Substring(0, 19) } else { $timestampField }
                        $timestamp = $timestamp.PadRight(19)
                        $flowrate = $fields[5].Trim().PadRight(8)
                        $battery = $fields[6].Trim().PadRight(7)
                        $archivedField = $fields[7].Trim()
                        $archived = if ($archivedField.Length -gt 19) { $archivedField.Substring(0, 19) } else { $archivedField }
                        Write-Host "$id | $devId | $devName | $iccid | $timestamp | $flowrate | $battery | $archived" -ForegroundColor White
                    }
                }
            }
        } else {
            Write-Host "`n⚠️  Aucune mesure archivée trouvée en base de données" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ Aucun résultat retourné" -ForegroundColor Red
    }
    
} catch {
    Write-Host "❌ Erreur: $_" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "`n✅ Vérification terminée" -ForegroundColor Green

