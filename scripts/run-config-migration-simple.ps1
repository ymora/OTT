# Script simple pour exécuter la migration SQL directement
# Utilise l'endpoint SQL direct ou exécute le fichier SQL

param(
    [string]$API_URL = "http://localhost:3000",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "MIGRATION CONFIGURATION (SQL Direct)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Lire le fichier SQL
$sqlFile = "sql/add_config_columns.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "❌ Fichier SQL introuvable: $sqlFile" -ForegroundColor Red
    exit 1
}

$sql = Get-Content $sqlFile -Raw
Write-Host "✅ Fichier SQL chargé: $sqlFile" -ForegroundColor Green

# Connexion
Write-Host ""
Write-Host "[1/2] Connexion à l'API..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" -Method POST -ContentType "application/json" -Body (@{
        email = $Email
        password = $Password
    } | ConvertTo-Json) -ErrorAction Stop
    
    $token = $loginResponse.token
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    Write-Host "  ✅ Connexion réussie" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur connexion: $_" -ForegroundColor Red
    exit 1
}

# Exécuter le SQL
Write-Host ""
Write-Host "[2/2] Exécution du SQL..." -ForegroundColor Yellow

# Diviser le SQL en instructions (séparées par ;)
$statements = $sql -split ';' | Where-Object { $_.Trim() -ne '' -and $_.Trim() -notmatch '^\s*--' }

Write-Host "  Nombre d'instructions: $($statements.Count)" -ForegroundColor Cyan

foreach ($statement in $statements) {
    $statement = $statement.Trim()
    if ($statement -eq '') { continue }
    
    $preview = if ($statement.Length -gt 60) { $statement.Substring(0, 60) + "..." } else { $statement }
    Write-Host "  Exécution: $preview" -ForegroundColor Gray
    
    try {
        $body = @{
            sql = $statement
        } | ConvertTo-Json
        
        # Essayer différents endpoints
        $endpoints = @(
            "$API_URL/api.php/admin/sql",
            "$API_URL/api.php/admin/db/execute"
        )
        
        $success = $false
        foreach ($endpoint in $endpoints) {
            try {
                $response = Invoke-RestMethod -Uri $endpoint -Method POST -Headers $headers -Body $body -ErrorAction Stop
                if ($response.success) {
                    Write-Host "    ✅ Succès" -ForegroundColor Green
                    $success = $true
                    break
                }
            } catch {
                # Essayer le prochain endpoint
                continue
            }
        }
        
        if (-not $success) {
            Write-Host "    ⚠️  Aucun endpoint SQL disponible - exécuter manuellement en SQL" -ForegroundColor Yellow
            Write-Host "    SQL: $statement" -ForegroundColor Gray
        }
    } catch {
        Write-Host "    ❌ Erreur: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "✅ Migration terminée" -ForegroundColor Green
Write-Host ""
Write-Host "Si les endpoints SQL ne sont pas disponibles, exécuter manuellement:" -ForegroundColor Yellow
Write-Host "  psql -h <host> -U <user> -d <database> -f sql/add_config_columns.sql" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ou copier-coller le contenu de sql/add_config_columns.sql dans votre client SQL" -ForegroundColor Cyan

