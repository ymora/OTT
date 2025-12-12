# Script PowerShell pour tester les migrations via l'API
param(
    [string]$API_URL = "http://localhost:8000",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST DES MIGRATIONS VIA L'API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Se connecter pour obtenir le token
Write-Host "[1/3] Connexion..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -ErrorAction Stop

    if (-not $loginResponse.success) {
        Write-Host "  ❌ Échec de la connexion" -ForegroundColor Red
        exit 1
    }

    $token = $loginResponse.token
    Write-Host "  ✅ Connecté avec succès" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Erreur de connexion: $_" -ForegroundColor Red
    exit 1
}

# 2. Tester les deux migrations
$migrations = @(
    @{
        file = "migration_add_measurements_deleted_at.sql"
        name = "Ajouter deleted_at à measurements"
    },
    @{
        file = "migration_cleanup_device_names.sql"
        name = "Nettoyer les noms de dispositifs"
    }
)

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$allPassed = $true

foreach ($migration in $migrations) {
    Write-Host ""
    Write-Host "[2/3] Test migration: $($migration.name)" -ForegroundColor Yellow
    Write-Host "  Fichier: $($migration.file)" -ForegroundColor Gray
    
    try {
        $body = @{
            file = $migration.file
        } | ConvertTo-Json

        $response = Invoke-RestMethod -Uri "$API_URL/api.php/migrate" `
            -Method POST `
            -Body $body `
            -Headers $headers `
            -ErrorAction Stop `
            -TimeoutSec 30

        if ($response.success) {
            Write-Host "  ✅ Migration réussie" -ForegroundColor Green
            if ($response.logs) {
                $response.logs | ForEach-Object {
                    Write-Host "    $_" -ForegroundColor Gray
                }
            }
        } else {
            Write-Host "  ❌ Migration échouée" -ForegroundColor Red
            Write-Host "    Erreur: $($response.error)" -ForegroundColor Red
            if ($response.logs) {
                $response.logs | ForEach-Object {
                    Write-Host "    $_" -ForegroundColor Yellow
                }
            }
            $allPassed = $false
        }
    } catch {
        Write-Host "  ❌ Erreur lors de l'appel API" -ForegroundColor Red
        Write-Host "    Message: $($_.Exception.Message)" -ForegroundColor Red
        
        # Essayer de parser la réponse d'erreur
        if ($_.ErrorDetails.Message) {
            try {
                $errorData = $_.ErrorDetails.Message | ConvertFrom-Json
                Write-Host "    Détails:" -ForegroundColor Yellow
                if ($errorData.message) {
                    Write-Host "      Message: $($errorData.message)" -ForegroundColor Yellow
                }
                if ($errorData.logs) {
                    $errorData.logs | ForEach-Object {
                        Write-Host "      $_" -ForegroundColor Yellow
                    }
                }
            } catch {
                Write-Host "    Réponse brute: $($_.ErrorDetails.Message)" -ForegroundColor Yellow
            }
        }
        $allPassed = $false
    }
}

# 3. Résumé
Write-Host ""
Write-Host "[3/3] Résumé" -ForegroundColor Yellow
if ($allPassed) {
    Write-Host "  ✅ Toutes les migrations sont OK" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  ❌ Certaines migrations ont échoué" -ForegroundColor Red
    exit 1
}


