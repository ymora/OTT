# Script pour appliquer la migration des colonnes min/max via l'API
# Usage: .\scripts\apply-migration-min-max.ps1

param(
    [string]$API_URL = "https://ott-jbln.onrender.com"
)

Write-Host "=== APPLICATION MIGRATION COLONNES MIN/MAX ===" -ForegroundColor Cyan
Write-Host ""

$migrationFile = "migration_add_min_max_columns.sql"
$endpoint = "$API_URL/api.php/migrate"

Write-Host "Fichier de migration: $migrationFile" -ForegroundColor Yellow
Write-Host "Endpoint: $endpoint" -ForegroundColor Yellow
Write-Host ""

# Construire le payload
$payload = @{
    file = $migrationFile
} | ConvertTo-Json

Write-Host "Payload:" -ForegroundColor Yellow
Write-Host $payload
Write-Host ""

Write-Host "Envoi de la requete..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers @{"Content-Type" = "application/json"} -Body $payload -ErrorAction Stop
    
    Write-Host "SUCCES!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Reponse:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($response.success) {
        Write-Host ""
        Write-Host "Migration appliquee avec succes!" -ForegroundColor Green
    }
    
} catch {
    Write-Host "ERREUR!" -ForegroundColor Red
    Write-Host ""
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Code HTTP: $statusCode" -ForegroundColor Red
    }
    Write-Host "Message: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $reader.BaseStream.Position = 0
            $reader.DiscardBufferedData()
            $responseBody = $reader.ReadToEnd()
            Write-Host ""
            Write-Host "Reponse d'erreur:" -ForegroundColor Red
            Write-Host $responseBody
        } catch {
            # Ignorer
        }
    }
}

Write-Host ""
Write-Host "=== FIN ===" -ForegroundColor Cyan

