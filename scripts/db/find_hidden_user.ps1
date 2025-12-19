# Script pour trouver l'utilisateur "maxime berriot" caché dans la base
# et comprendre pourquoi il n'apparaît pas dans les listes

param(
    [string]$DbHost = $env:DB_HOST,
    [string]$DbName = $env:DB_NAME,
    [string]$DbUser = $env:DB_USER,
    [string]$DbPass = $env:DB_PASS,
    [string]$DbPort = $env:DB_PORT ?? "5432"
)

Write-Host "🔍 Recherche de l'utilisateur 'maxime berriot' dans la base de données..." -ForegroundColor Cyan
Write-Host ""

# Construire la chaîne de connexion
$connectionString = "host=$DbHost port=$DbPort dbname=$DbName user=$DbUser password=$DbPass"

try {
    # Requête pour trouver tous les utilisateurs contenant "maxime" ou "berriot"
    $query = @"
SELECT 
    id,
    email,
    first_name,
    last_name,
    role_id,
    is_active,
    deleted_at,
    created_at,
    updated_at,
    (SELECT name FROM roles WHERE id = users.role_id) as role_name
FROM users 
WHERE 
    LOWER(first_name) LIKE '%maxime%' 
    OR LOWER(last_name) LIKE '%berriot%'
    OR LOWER(email) LIKE '%maxime%'
    OR LOWER(email) LIKE '%berriot%'
ORDER BY created_at DESC;
"@

    Write-Host "📋 Exécution de la requête..." -ForegroundColor Yellow
    
    # Utiliser psql si disponible, sinon utiliser une autre méthode
    if (Get-Command psql -ErrorAction SilentlyContinue) {
        $result = $query | psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -A -F "|" 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Résultats:" -ForegroundColor Green
            Write-Host $result
        } else {
            Write-Host "❌ Erreur lors de l'exécution de psql" -ForegroundColor Red
            Write-Host $result
        }
    } else {
        Write-Host "⚠️  psql n'est pas disponible. Utilisation de l'API pour vérifier..." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Pour utiliser ce script, installez PostgreSQL client (psql) ou utilisez l'API directement." -ForegroundColor Gray
        Write-Host ""
        Write-Host "Alternative: Utiliser cette requête SQL directement dans votre client PostgreSQL:" -ForegroundColor Cyan
        Write-Host $query -ForegroundColor White
    }
    
    # Aussi vérifier tous les utilisateurs pour voir ce qui est caché
    Write-Host ""
    Write-Host "📊 Vérification de tous les utilisateurs (actifs et archivés):" -ForegroundColor Cyan
    $allUsersQuery = @"
SELECT 
    id,
    email,
    first_name,
    last_name,
    role_id,
    is_active,
    deleted_at IS NOT NULL as is_deleted,
    deleted_at,
    created_at,
    (SELECT name FROM roles WHERE id = users.role_id) as role_name
FROM users 
ORDER BY created_at DESC;
"@
    
    if (Get-Command psql -ErrorAction SilentlyContinue) {
        $allResult = $allUsersQuery | psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -t -A -F "|" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Tous les utilisateurs:" -ForegroundColor Green
            Write-Host $allResult
        }
    } else {
        Write-Host $allUsersQuery -ForegroundColor White
    }
    
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "💡 Pour supprimer définitivement l'utilisateur si trouvé:" -ForegroundColor Yellow
Write-Host "   DELETE FROM users WHERE email LIKE '%maxime%' OR email LIKE '%berriot%';" -ForegroundColor Gray
Write-Host ""
Write-Host "   Ou pour le restaurer si c'était une erreur:" -ForegroundColor Yellow
Write-Host "   UPDATE users SET deleted_at = NULL, is_active = TRUE WHERE email LIKE '%maxime%' OR email LIKE '%berriot%';" -ForegroundColor Gray

