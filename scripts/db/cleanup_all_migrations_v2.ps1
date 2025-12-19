# Script pour supprimer definitivement tous les scripts de migration (version robuste)
param(
    [string]$ApiUrl = "",
    [string]$Email = "",
    [string]$Password = ""
)

if ([string]::IsNullOrEmpty($ApiUrl)) {
    $ApiUrl = if ($env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL } else { "http://localhost:8000" }
}
if ([string]::IsNullOrEmpty($Email)) {
    $Email = if ($env:AUDIT_EMAIL) { $env:AUDIT_EMAIL } else { "ymora@free.fr" }
}
if ([string]::IsNullOrEmpty($Password)) {
    $Password = if ($env:AUDIT_PASSWORD) { $env:AUDIT_PASSWORD } else { "Ym120879" }
}

Write-Host "Suppression definitive de tous les scripts de migration..." -ForegroundColor Cyan
Write-Host "ATTENTION: Cette action est irreversible !" -ForegroundColor Red
Write-Host ""

# Authentification
try {
    $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $token = $authResponse.token
    $headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
    Write-Host "Authentification reussie" -ForegroundColor Green
} catch {
    Write-Host "Erreur authentification: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Methode 1: Utiliser l'endpoint API pour supprimer chaque migration individuellement
Write-Host "Recuperation de l'historique des migrations..." -ForegroundColor Yellow
try {
    $historyResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/migrations/history" -Headers $headers -TimeoutSec 15
    
    if ($historyResponse.success -and $historyResponse.history) {
        $migrations = $historyResponse.history
        Write-Host "  $($migrations.Count) migration(s) trouvee(s)" -ForegroundColor White
        
        if ($migrations.Count -eq 0) {
            Write-Host "Aucune migration a supprimer" -ForegroundColor Yellow
            exit 0
        }
        
        Write-Host ""
        Write-Host "Suppression de chaque migration..." -ForegroundColor Yellow
        
        $deleted = 0
        $errors = 0
        
        foreach ($migration in $migrations) {
            $migrationId = $migration.id
            $migrationFile = $migration.migration_file
            
            Write-Host "  Suppression: $migrationFile (ID: $migrationId)..." -ForegroundColor Gray -NoNewline
            
            try {
                $deleteResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/migrations/history/$migrationId" -Method DELETE -Headers $headers -TimeoutSec 15
                
                if ($deleteResponse.success) {
                    Write-Host " OK" -ForegroundColor Green
                    $deleted++
                } else {
                    Write-Host " ECHEC: $($deleteResponse.error)" -ForegroundColor Red
                    $errors++
                }
            } catch {
                Write-Host " ECHEC: $($_.Exception.Message)" -ForegroundColor Red
                $errors++
            }
        }
        
        Write-Host ""
        Write-Host "Resultat: $deleted supprimee(s), $errors erreur(s)" -ForegroundColor $(if ($errors -eq 0) { "Green" } else { "Yellow" })
        
        if ($errors -eq 0) {
            Write-Host ""
            Write-Host "Tous les scripts de migration ont ete supprimes definitivement." -ForegroundColor Green
            Write-Host "Ils ne seront plus visibles dans le dashboard." -ForegroundColor Green
        }
    } else {
        Write-Host "Aucune migration trouvee dans l'historique" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Erreur lors de la recuperation de l'historique: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tentative avec script SQL direct..." -ForegroundColor Yellow
    
    # Methode 2: Utiliser le script SQL direct
    $sqlFile = "sql/cleanup_all_migrations.sql"
    if (Test-Path $sqlFile) {
        $sqlContent = Get-Content $sqlFile -Raw
        $body = @{ sql = $sqlContent } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $body -Headers $headers -TimeoutSec 30
            
            if ($response.success) {
                Write-Host "Nettoyage termine avec succes (methode SQL)" -ForegroundColor Green
            } else {
                Write-Host "Erreur SQL: $($response.error)" -ForegroundColor Red
            }
        } catch {
            Write-Host "Erreur SQL: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Nettoyage termine" -ForegroundColor Green

