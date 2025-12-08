# Script pour appliquer la migration GPS (latitude/longitude dans measurements)
# Usage: .\scripts\apply-migration-gps.ps1

param(
    [string]$API_URL = "https://ott-jbln.onrender.com"
)

Write-Host "=== APPLICATION MIGRATION GPS (latitude/longitude) ===" -ForegroundColor Cyan
Write-Host ""

$migrationFile = "migration_add_gps_to_measurements.sql"
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

# Headers avec token si disponible
$headers = @{
    "Content-Type" = "application/json"
}

# Essayer de récupérer le token depuis localStorage (via navigateur) ou variable d'environnement
$token = $env:AUTH_TOKEN
if ($token) {
    $headers["Authorization"] = "Bearer $token"
    Write-Host "Token d'authentification trouvé" -ForegroundColor Green
} else {
    Write-Host "Aucun token trouvé - la migration peut nécessiter une authentification admin" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Envoi de la requete..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headers -Body $payload -ErrorAction Stop
    
    Write-Host "SUCCES!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Reponse:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host
    
    if ($response.success) {
        Write-Host ""
        Write-Host "Migration GPS appliquee avec succes!" -ForegroundColor Green
        Write-Host "Les colonnes latitude et longitude ont ete ajoutees a la table measurements." -ForegroundColor Green
    }
    
} catch {
    Write-Host "ERREUR!" -ForegroundColor Red
    Write-Host ""
    if ($_.Exception.Response) {
        $statusCode = $_.Exception.Response.StatusCode.value__
        Write-Host "Code HTTP: $statusCode" -ForegroundColor Red
        
        if ($statusCode -eq 401) {
            Write-Host ""
            Write-Host "Authentification requise. Connectez-vous au dashboard et utilisez la page migrate.html" -ForegroundColor Yellow
        } elseif ($statusCode -eq 403) {
            Write-Host ""
            Write-Host "Acces refuse. Vous devez etre admin pour appliquer cette migration." -ForegroundColor Yellow
        }
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

