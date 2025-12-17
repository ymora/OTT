# Script pour construire la DATABASE_URL complète à partir des informations Render
# Usage: .\scripts\db\build_database_url.ps1 -Password "votre_mot_de_passe"

param(
    [Parameter(Mandatory=$true)]
    [string]$Password,
    
    [string]$DbHost = "dpg-d51db3mmcj7s73eorra0-a.frankfurt-postgres.render.com",
    [string]$User = "ott_database25_user",
    [string]$Database = "ott_database25",
    [int]$Port = 5432
)

Write-Host "🔧 Construction de la DATABASE_URL" -ForegroundColor Cyan
Write-Host ""

# Encoder le mot de passe pour URL (gérer les caractères spéciaux)
function Encode-UrlPassword {
    param([string]$password)
    # Encoder les caractères spéciaux courants
    $encoded = $password
    $encoded = $encoded -replace '%', '%25'  # Doit être en premier
    $encoded = $encoded -replace ' ', '%20'
    $encoded = $encoded -replace '!', '%21'
    $encoded = $encoded -replace '#', '%23'
    $encoded = $encoded -replace '\$', '%24'
    $encoded = $encoded -replace '&', '%26'
    $encoded = $encoded -replace "'", '%27'
    $encoded = $encoded -replace '\(', '%28'
    $encoded = $encoded -replace '\)', '%29'
    $encoded = $encoded -replace '\*', '%2A'
    $encoded = $encoded -replace '\+', '%2B'
    $encoded = $encoded -replace ',', '%2C'
    $encoded = $encoded -replace '/', '%2F'
    $encoded = $encoded -replace ':', '%3A'
    $encoded = $encoded -replace ';', '%3B'
    $encoded = $encoded -replace '=', '%3D'
    $encoded = $encoded -replace '\?', '%3F'
    $encoded = $encoded -replace '@', '%40'
    $encoded = $encoded -replace '\[', '%5B'
    $encoded = $encoded -replace '\\', '%5C'
    $encoded = $encoded -replace '\]', '%5D'
    $encoded = $encoded -replace '\^', '%5E'
    $encoded = $encoded -replace '`', '%60'
    $encoded = $encoded -replace '\{', '%7B'
    $encoded = $encoded -replace '\|', '%7C'
    $encoded = $encoded -replace '\}', '%7D'
    $encoded = $encoded -replace '~', '%7E'
    return $encoded
}

# Vérifier si le mot de passe contient des caractères spéciaux
$hasSpecialChars = $Password -match '[^a-zA-Z0-9]'
if ($hasSpecialChars) {
    Write-Host "⚠️  Le mot de passe contient des caractères spéciaux" -ForegroundColor Yellow
    Write-Host "   Encodage automatique en cours..." -ForegroundColor Gray
    $encodedPassword = Encode-UrlPassword -password $Password
} else {
    $encodedPassword = $Password
}

# Construire l'URL
$databaseUrl = "postgresql://${User}:${encodedPassword}@${DbHost}:${Port}/${Database}"

Write-Host "✅ DATABASE_URL construite:" -ForegroundColor Green
Write-Host ""
Write-Host $databaseUrl -ForegroundColor Cyan
Write-Host ""
Write-Host "📋 Instructions pour Render:" -ForegroundColor Yellow
Write-Host "  1. Allez sur Render → Service API → Environment" -ForegroundColor Gray
Write-Host "  2. Ajoutez/modifiez la variable DATABASE_URL" -ForegroundColor Gray
Write-Host "  3. Collez l'URL ci-dessus" -ForegroundColor Gray
Write-Host "  4. Sauvegardez et redéployez le service" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Pour tester le format:" -ForegroundColor Cyan
Write-Host "   .\scripts\db\test_database_url.ps1 -DatabaseUrl `"$databaseUrl`"" -ForegroundColor Gray

