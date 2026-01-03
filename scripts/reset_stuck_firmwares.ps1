# Script pour réinitialiser les compilations de firmware bloquées
# Usage: .\scripts\reset_stuck_firmwares.ps1 [firmware_id] [max_age_minutes]

param(
    [int]$FirmwareId = 0,  # 0 = tous les firmwares
    [int]$MaxAgeMinutes = 30
)

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$DockerComposeFile = Join-Path $ProjectRoot "docker-compose.yml"

Write-Host "[RESET] Réinitialisation des compilations bloquées" -ForegroundColor Cyan
Write-Host "  Age maximum: $MaxAgeMinutes minutes" -ForegroundColor Yellow

$cutoffTime = (Get-Date).AddMinutes(-$MaxAgeMinutes).ToString("yyyy-MM-dd HH:mm:ss")

if ($FirmwareId -gt 0) {
    Write-Host "  Firmware ID: $FirmwareId" -ForegroundColor Yellow
    $sql = "UPDATE firmware_versions SET status = 'pending_compilation' WHERE id = $FirmwareId AND status = 'compiling' AND updated_at < '$cutoffTime';"
} else {
    Write-Host "  Tous les firmwares" -ForegroundColor Yellow
    $sql = "UPDATE firmware_versions SET status = 'pending_compilation' WHERE status = 'compiling' AND updated_at < '$cutoffTime';"
}

$result = docker exec ott-postgres psql -U postgres -d ott_data -c $sql 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Compilations bloquées réinitialisées" -ForegroundColor Green
    Write-Host $result
} else {
    Write-Host "[ERREUR] Erreur lors de la réinitialisation:" -ForegroundColor Red
    Write-Host $result
    exit 1
}

# Afficher le statut actuel
Write-Host "`n[STATUT] Firmwares actuellement en compilation:" -ForegroundColor Cyan
docker exec ott-postgres psql -U postgres -d ott_data -c "SELECT id, version, status, updated_at FROM firmware_versions WHERE status = 'compiling';" 2>&1

