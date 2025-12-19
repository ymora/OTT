# Script pour tester la creation d'utilisateur "maxime berriot" et voir l'erreur exacte
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

Write-Host "Test de creation utilisateur maxime berriot..." -ForegroundColor Cyan
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

# Tester plusieurs emails possibles pour "maxime berriot"
$testEmails = @(
    "maxime.berriot@happlyz.com",
    "maxime@happlyz.com",
    "berriot@happlyz.com",
    "maxime.berriot@gmail.com",
    "maximeberriot@happlyz.com"
)

foreach ($testEmail in $testEmails) {
    Write-Host "Test creation avec email: $testEmail" -ForegroundColor Yellow
    
    $userData = @{
        email = $testEmail
        password = "Test123!"
        first_name = "Maxime"
        last_name = "Berriot"
        role_id = 1
        is_active = $true
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/users" -Method POST -Body $userData -Headers $headers -ContentType "application/json" -TimeoutSec 15
        
        if ($response.success) {
            Write-Host "  SUCCES: Utilisateur cree avec ID $($response.user.id)" -ForegroundColor Green
            Write-Host "  Suppression de l'utilisateur de test..." -ForegroundColor Yellow
            
            # Supprimer l'utilisateur de test
            try {
                $deleteResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/users/$($response.user.id)" -Method DELETE -Headers $headers -TimeoutSec 15
                Write-Host "  Utilisateur de test supprime" -ForegroundColor Green
            } catch {
                Write-Host "  Erreur lors de la suppression: $($_.Exception.Message)" -ForegroundColor Yellow
            }
            break
        } else {
            Write-Host "  Echec: $($response.error)" -ForegroundColor Red
        }
    } catch {
        $errorMessage = $_.Exception.Message
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            try {
                $errorJson = $responseBody | ConvertFrom-Json
                $errorMessage = $errorJson.error
                Write-Host "  ERREUR API: $errorMessage" -ForegroundColor Red
                if ($errorMessage -like "*deja*" -or $errorMessage -like "*already*" -or $errorMessage -like "*unique*" -or $errorMessage -like "*duplicate*") {
                    Write-Host "  >>> Cet email existe deja dans la base !" -ForegroundColor Red
                    Write-Host "  >>> C'est probablement l'email qui bloque la creation" -ForegroundColor Red
                }
            } catch {
                Write-Host "  ERREUR: $responseBody" -ForegroundColor Red
            }
        } else {
            Write-Host "  ERREUR: $errorMessage" -ForegroundColor Red
        }
    }
    Write-Host ""
}

Write-Host ""
Write-Host "Si aucun email n'a fonctionne, l'utilisateur n'existe probablement pas." -ForegroundColor Yellow
Write-Host "L'erreur pourrait venir d'une autre source (validation, permissions, etc.)" -ForegroundColor Yellow

