# Script pour trouver et corriger l'utilisateur "maxime berriot" cache
param(
    [string]$ApiUrl = "",
    [string]$Email = "",
    [string]$Password = ""
)

# Valeurs par defaut
if ([string]::IsNullOrEmpty($ApiUrl)) {
    $ApiUrl = if ($env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL } else { "http://localhost:8000" }
}
if ([string]::IsNullOrEmpty($Email)) {
    $Email = if ($env:AUDIT_EMAIL) { $env:AUDIT_EMAIL } else { "ymora@free.fr" }
}
if ([string]::IsNullOrEmpty($Password)) {
    $Password = if ($env:AUDIT_PASSWORD) { $env:AUDIT_PASSWORD } else { "Ym120879" }
}

Write-Host "Recherche et correction utilisateur cache..." -ForegroundColor Cyan
Write-Host ""

# Authentification
Write-Host "Authentification..." -ForegroundColor Yellow
try {
    $loginBody = @{
        email = $Email
        password = $Password
    } | ConvertTo-Json

    $authResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 15
    $token = $authResponse.token
    $headers = @{
        Authorization = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "Authentification reussie" -ForegroundColor Green
} catch {
    Write-Host "Erreur authentification: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Rechercher l'utilisateur
Write-Host "Recherche de l'utilisateur maxime berriot..." -ForegroundColor Yellow

$searchQuery = "SELECT id, email, first_name, last_name, role_id, is_active, deleted_at, created_at, updated_at, (SELECT name FROM roles WHERE id = users.role_id) as role_name, CASE WHEN deleted_at IS NULL AND is_active = TRUE THEN 'Visible (actif)' WHEN deleted_at IS NOT NULL THEN 'Visible (archive)' WHEN deleted_at IS NULL AND is_active = FALSE THEN 'CACHE (actif=FALSE)' ELSE 'Etat inconnu' END as visibility_status FROM users WHERE LOWER(first_name) LIKE '%maxime%' OR LOWER(last_name) LIKE '%berriot%' OR LOWER(email) LIKE '%maxime%' OR LOWER(email) LIKE '%berriot%' ORDER BY created_at DESC;"

try {
    $searchBody = @{
        sql = $searchQuery
    } | ConvertTo-Json

    $searchResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $searchBody -Headers $headers -TimeoutSec 30
    
    if ($searchResponse.success) {
        Write-Host "Requete executee avec succes" -ForegroundColor Green
        if ($searchResponse.results -and $searchResponse.results.Count -gt 0) {
            Write-Host ""
            Write-Host "Utilisateur(s) trouve(s):" -ForegroundColor Cyan
            $searchResponse.results | ForEach-Object {
                Write-Host "  ID: $($_.id)" -ForegroundColor White
                Write-Host "  Email: $($_.email)" -ForegroundColor White
                Write-Host "  Nom: $($_.first_name) $($_.last_name)" -ForegroundColor White
                Write-Host "  Role: $($_.role_name)" -ForegroundColor White
                Write-Host "  Actif: $($_.is_active)" -ForegroundColor White
                Write-Host "  Archive: $(if ($_.deleted_at) { 'Oui' } else { 'Non' })" -ForegroundColor White
                Write-Host "  Cree le: $($_.created_at)" -ForegroundColor White
                Write-Host "  Statut visibilite: $($_.visibility_status)" -ForegroundColor $(if ($_.visibility_status -like '*CACHE*') { "Red" } else { "Green" })
                Write-Host ""
            }
            
            # Supprimer l'utilisateur
            Write-Host "Suppression de l'utilisateur maxime berriot..." -ForegroundColor Yellow
            
            $deleteQuery = "BEGIN; DELETE FROM user_notifications_preferences WHERE user_id IN (SELECT id FROM users WHERE (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%') OR LOWER(email) LIKE '%maxime%' OR LOWER(email) LIKE '%berriot%'); DELETE FROM users WHERE (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%') OR LOWER(email) LIKE '%maxime%' OR LOWER(email) LIKE '%berriot%'; COMMIT; SELECT COUNT(*) as deleted_count, 'Utilisateurs supprimes' as message FROM users WHERE (LOWER(first_name) LIKE '%maxime%' AND LOWER(last_name) LIKE '%berriot%') OR LOWER(email) LIKE '%maxime%' OR LOWER(email) LIKE '%berriot%';"

            $deleteBody = @{
                sql = $deleteQuery
            } | ConvertTo-Json

            $deleteResponse = Invoke-RestMethod -Uri "$ApiUrl/api.php/admin/migrate-sql" -Method POST -Body $deleteBody -Headers $headers -TimeoutSec 30
            
            if ($deleteResponse.success) {
                Write-Host "Utilisateur supprime avec succes" -ForegroundColor Green
                if ($deleteResponse.results) {
                    Write-Host "Resultat: $($deleteResponse.results | ConvertTo-Json -Depth 3)" -ForegroundColor Cyan
                }
            } else {
                Write-Host "Erreur lors de la suppression: $($deleteResponse.error)" -ForegroundColor Red
            }
        } else {
            Write-Host "Aucun utilisateur maxime berriot trouve dans la base de donnees" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Erreur lors de la recherche: $($searchResponse.error)" -ForegroundColor Red
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
Write-Host "Script termine" -ForegroundColor Green
