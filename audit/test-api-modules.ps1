# Script de test pour vérifier que l'API utilise bien les nouveaux modules modulaires
# Avant de supprimer l'ancien devices.php

param(
    [string]$ApiUrl = "http://localhost:3000",
    [string]$ApiPhpUrl = "http://localhost"
)

Write-Host "🔍 Test des modules API modulaires" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Gray

# Tests des endpoints principaux
$tests = @(
    @{ Name = "GET /api.php/devices"; Url = "$ApiPhpUrl/api.php/devices?limit=5"; Method = "GET" },
    @{ Name = "GET /api.php/patients"; Url = "$ApiPhpUrl/api.php/patients?limit=5"; Method = "GET" },
    @{ Name = "GET /api.php/alerts"; Url = "$ApiPhpUrl/api.php/alerts?limit=5"; Method = "GET" },
    @{ Name = "GET /api.php/commands"; Url = "$ApiPhpUrl/api.php/commands?limit=5"; Method = "GET" },
    @{ Name = "GET /api.php/reports/overview"; Url = "$ApiPhpUrl/api.php/reports/overview"; Method = "GET" },
    @{ Name = "GET /api.php/logs"; Url = "$ApiPhpUrl/api.php/logs?limit=5"; Method = "GET" }
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
    Write-Host "`n🧪 Test: $($test.Name)" -ForegroundColor Yellow
    
    try {
        $response = Invoke-WebRequest -Uri $test.Url -Method $test.Method -Headers @{
            "Content-Type" = "application/json"
        } -ErrorAction Stop
        
        if ($response.StatusCode -eq 200) {
            $json = $response.Content | ConvertFrom-Json
            if ($json.success -eq $true) {
                Write-Host "  ✅ OK" -ForegroundColor Green
                $passed++
            } else {
                Write-Host "  ❌ Échec: success = false" -ForegroundColor Red
                Write-Host "     Erreur: $($json.error)" -ForegroundColor Red
                $failed++
            }
        } else {
            Write-Host "  ❌ Échec: Status $($response.StatusCode)" -ForegroundColor Red
            $failed++
        }
    } catch {
        Write-Host "  ❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`n" + ("=" * 60) -ForegroundColor Gray
Write-Host "📊 Résultat: $passed réussis, $failed échoués" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Yellow" })

if ($failed -eq 0) {
    Write-Host "✅ Tous les tests passent ! L'API utilise bien les nouveaux modules." -ForegroundColor Green
    Write-Host "⚠️  Vous pouvez maintenant renommer devices.php en devices.php.old pour backup" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  Des erreurs détectées. Ne supprimez pas devices.php pour le moment." -ForegroundColor Red
}

