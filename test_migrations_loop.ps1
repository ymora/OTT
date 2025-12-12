# Script pour tester les migrations en boucle jusqu'à ce qu'elles fonctionnent
param(
    [string]$API_URL = "http://localhost:8000",
    [string]$Email = "ymora@free.fr",
    [string]$Password = "Ym120879",
    [int]$MaxIterations = 10
)

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "  TEST ITERATIF DES MIGRATIONS (JUSQU'A REUSSITE)" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Se connecter
Write-Host "[1/4] Connexion..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api.php/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -ErrorAction Stop `
        -TimeoutSec 10

    if (-not $loginResponse.success) {
        Write-Host "  [ERREUR] Echec de la connexion" -ForegroundColor Red
        exit 1
    }

    $token = $loginResponse.token
    Write-Host "  [OK] Connecte" -ForegroundColor Green
} catch {
    Write-Host "  [ERREUR] Erreur: $_" -ForegroundColor Red
                Write-Host "  [INFO] Assurez-vous que le serveur PHP est demarre sur $API_URL" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# 2. Migrations à tester
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

$iteration = 0
$allPassed = $false

while (-not $allPassed -and $iteration -lt $MaxIterations) {
    $iteration++
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "ITERATION $iteration / $MaxIterations" -ForegroundColor Cyan
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
    
    $allPassed = $true
    
    foreach ($migration in $migrations) {
        Write-Host "[TEST] $($migration.name)" -ForegroundColor Yellow
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
                Write-Host "  [OK] SUCCES" -ForegroundColor Green
                if ($response.logs) {
                    $response.logs | ForEach-Object {
                        Write-Host "    $_" -ForegroundColor DarkGreen
                    }
                }
            } else {
                Write-Host "  [ERREUR] ECHEC" -ForegroundColor Red
                Write-Host "    Erreur: $($response.error)" -ForegroundColor Red
                if ($response.message) {
                    Write-Host "    Message: $($response.message)" -ForegroundColor Red
                }
                if ($response.code) {
                    Write-Host "    Code: $($response.code)" -ForegroundColor Red
                }
                if ($response.logs) {
                    Write-Host "    Logs:" -ForegroundColor Yellow
                    $response.logs | ForEach-Object {
                        Write-Host "      $_" -ForegroundColor Yellow
                    }
                }
                if ($response.details) {
                    Write-Host "    Détails:" -ForegroundColor Yellow
                    $response.details | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Yellow
                }
                $allPassed = $false
            }
        } catch {
            Write-Host "  [ERREUR] ERREUR API" -ForegroundColor Red
            Write-Host "    Message: $($_.Exception.Message)" -ForegroundColor Red
            
            # Essayer de récupérer la réponse complète
            if ($_.Exception.Response) {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                $reader.Close()
                
                Write-Host "    Réponse complète:" -ForegroundColor Yellow
                Write-Host "    $responseBody" -ForegroundColor Yellow
                
                try {
                    $errorData = $responseBody | ConvertFrom-Json
                    Write-Host "    Détails JSON:" -ForegroundColor Yellow
                    if ($errorData.message) {
                        Write-Host "      Message: $($errorData.message)" -ForegroundColor Yellow
                    }
                    if ($errorData.error) {
                        Write-Host "      Error: $($errorData.error)" -ForegroundColor Yellow
                    }
                    if ($errorData.logs) {
                        Write-Host "      Logs:" -ForegroundColor Yellow
                        $errorData.logs | ForEach-Object {
                            Write-Host "        $_" -ForegroundColor Yellow
                        }
                    }
                    if ($errorData.code) {
                        Write-Host "      Code: $($errorData.code)" -ForegroundColor Yellow
                    }
                    if ($errorData.details) {
                        Write-Host "      Details:" -ForegroundColor Yellow
                        $errorData.details | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Yellow
                    }
                } catch {
                    Write-Host "    (Impossible de parser JSON)" -ForegroundColor Yellow
                }
            } elseif ($_.ErrorDetails.Message) {
                try {
                    $errorData = $_.ErrorDetails.Message | ConvertFrom-Json
                    Write-Host "    Détails JSON:" -ForegroundColor Yellow
                    if ($errorData.message) {
                        Write-Host "      Message: $($errorData.message)" -ForegroundColor Yellow
                    }
                    if ($errorData.logs) {
                        Write-Host "      Logs:" -ForegroundColor Yellow
                        $errorData.logs | ForEach-Object {
                            Write-Host "        $_" -ForegroundColor Yellow
                        }
                    }
                    if ($errorData.code) {
                        Write-Host "      Code: $($errorData.code)" -ForegroundColor Yellow
                    }
                } catch {
                    Write-Host "    Réponse brute: $($_.ErrorDetails.Message.Substring(0, [Math]::Min(500, $_.ErrorDetails.Message.Length)))" -ForegroundColor Yellow
                }
            }
            $allPassed = $false
        }
        
        Write-Host ""
    }
    
    if ($allPassed) {
        Write-Host "[SUCCES] TOUTES LES MIGRATIONS SONT OK !" -ForegroundColor Green
        break
    } else {
            Write-Host "[WARNING] Certaines migrations ont echoue. Verifiez les logs ci-dessus." -ForegroundColor Yellow
            if ($iteration -lt $MaxIterations) {
                Write-Host "[INFO] Corrigez le code et relancez le script." -ForegroundColor Cyan
            }
    }
}

if (-not $allPassed) {
    Write-Host ""
    Write-Host "[ERREUR] ECHEC APRES $MaxIterations ITERATIONS" -ForegroundColor Red
    exit 1
} else {
    Write-Host ""
    Write-Host "[SUCCES] SUCCES EN $iteration ITERATION(S)" -ForegroundColor Green
    exit 0
}

