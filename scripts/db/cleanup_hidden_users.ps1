# Script pour nettoyer definitivement tous les utilisateurs "maxime berriot"
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

Write-Host "Nettoyage definitif des utilisateurs maxime berriot..." -ForegroundColor Cyan
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

# Lire le script SQL
$sqlFile = "sql/cleanup_hidden_users.sql"
if (-not (Test-Path $sqlFile)) {
    Write-Host "Erreur: Fichier $sqlFile introuvable" -ForegroundColor Red
    exit 1
}

$sqlContent = Get-Content $sqlFile -Raw

Write-Host "Execution du script de nettoyage..." -ForegroundColor Yellow

try {
    $body = @{ sql = $sqlContent } | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $body -Headers $headers -TimeoutSec 30
    
    if ($response.success) {
        Write-Host "Nettoyage termine avec succes" -ForegroundColor Green
        if ($response.results) {
            Write-Host "Resultats: $($response.results | ConvertTo-Json -Depth 3)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "Erreur: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Reponse: $responseBody" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Nettoyage termine" -ForegroundColor Green

