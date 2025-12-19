# Script pour lister tous les utilisateurs de la base
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

Write-Host "Liste de tous les utilisateurs dans la base..." -ForegroundColor Cyan
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

# Requete pour lister tous les utilisateurs
$query = "SELECT id, email, first_name, last_name, role_id, is_active, deleted_at, created_at, (SELECT name FROM roles WHERE id = users.role_id) as role_name FROM users ORDER BY created_at DESC;"

try {
    $body = @{ sql = $query } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $body -Headers $headers -TimeoutSec 30
    
    if ($response.success) {
        Write-Host "Utilisateurs trouves: $($response.results.Count)" -ForegroundColor Green
        Write-Host ""
        if ($response.results -and $response.results.Count -gt 0) {
            foreach ($user in $response.results) {
                $status = if ($user.deleted_at) { "ARCHIVE" } elseif (-not $user.is_active) { "INACTIF" } else { "ACTIF" }
                $color = if ($status -eq "ACTIF") { "Green" } elseif ($status -eq "ARCHIVE") { "Yellow" } else { "Red" }
                Write-Host "  [$status] ID: $($user.id) | $($user.email) | $($user.first_name) $($user.last_name) | Role: $($user.role_name) | Cree: $($user.created_at)" -ForegroundColor $color
            }
        } else {
            Write-Host "Aucun utilisateur trouve" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Erreur: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

