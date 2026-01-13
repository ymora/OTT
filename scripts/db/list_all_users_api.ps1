# Script pour lister tous les utilisateurs via l'API
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

Write-Host "Liste de tous les utilisateurs (actifs et archives)..." -ForegroundColor Cyan
Write-Host ""

# Authentification
try {
    $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $token = $authResponse.token
    $headers = @{ Authorization = "Bearer $token" }
    Write-Host "Authentification reussie" -ForegroundColor Green
} catch {
    Write-Host "Erreur authentification: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Lister les utilisateurs actifs
Write-Host "Utilisateurs ACTIFS:" -ForegroundColor Green
try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/users?include_deleted=false" -Headers $headers -TimeoutSec 15
    if ($response.success -and $response.users) {
        Write-Host "  Total: $($response.pagination.total)" -ForegroundColor White
        foreach ($user in $response.users) {
            Write-Host "    ID: $($user.id) | $($user.email) | $($user.first_name) $($user.last_name) | Role: $($user.role_name)" -ForegroundColor White
        }
    } else {
        Write-Host "  Aucun utilisateur actif" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Lister les utilisateurs archives
Write-Host "Utilisateurs ARCHIVES:" -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/users?include_deleted=true" -Headers $headers -TimeoutSec 15
    if ($response.success -and $response.users) {
        $archived = $response.users | Where-Object { $_.deleted_at -ne $null }
        Write-Host "  Total archives: $($archived.Count)" -ForegroundColor White
        foreach ($user in $archived) {
            Write-Host "    ID: $($user.id) | $($user.email) | $($user.first_name) $($user.last_name) | Role: $($user.role_name) | Archive le: $($user.deleted_at)" -ForegroundColor White
        }
    } else {
        Write-Host "  Aucun utilisateur archive" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# Rechercher specifiquement "maxime" ou "berriot"
Write-Host "Recherche specifique 'maxime' ou 'berriot':" -ForegroundColor Cyan
try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/users?include_deleted=true&limit=500" -Headers $headers -TimeoutSec 15
    if ($response.success -and $response.users) {
        $found = $response.users | Where-Object { 
            $_.first_name -like '*maxime*' -or 
            $_.last_name -like '*berriot*' -or 
            $_.email -like '*maxime*' -or 
            $_.email -like '*berriot*' 
        }
        if ($found) {
            Write-Host "  Utilisateur(s) trouve(s):" -ForegroundColor Red
            foreach ($user in $found) {
                $status = if ($user.deleted_at) { "ARCHIVE" } elseif (-not $user.is_active) { "INACTIF" } else { "ACTIF" }
                Write-Host "    [$status] ID: $($user.id) | $($user.email) | $($user.first_name) $($user.last_name)" -ForegroundColor Red
            }
        } else {
            Write-Host "  Aucun utilisateur 'maxime berriot' trouve dans les listes API" -ForegroundColor Yellow
            Write-Host "  Cela signifie que l'utilisateur n'existe pas ou a un probleme de requete SQL" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

