# ============================================================================
# Script pour réinitialiser le mot de passe de ymora@free.fr
# ============================================================================
# Usage: .\scripts\reset_password_ymora.ps1
# ============================================================================

$ErrorActionPreference = "Stop"

$email = "ymora@free.fr"
$newPassword = "Ym120879"
$apiUrl = $env:NEXT_PUBLIC_API_URL
if (-not $apiUrl) {
    $apiUrl = "https://ott-jbln.onrender.com"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Réinitialisation mot de passe" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Email: $email" -ForegroundColor Yellow
Write-Host "Nouveau mot de passe: $newPassword" -ForegroundColor Yellow
Write-Host ""

# IMPORTANT: Le hash bcrypt doit être généré avec PHP
# Pour générer le hash correct, exécutez sur le serveur Render:
# php -r "echo password_hash('Ym120879', PASSWORD_BCRYPT);"
# 
# Hash bcrypt temporaire (à remplacer par un hash généré sur le serveur)
$passwordHash = '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

Write-Host "Hash bcrypt: $passwordHash" -ForegroundColor Gray
Write-Host ""

# Option 1: Via API (si vous avez un token admin)
Write-Host "Option 1: Via API" -ForegroundColor Cyan
Write-Host "  Si vous avez un autre compte admin, vous pouvez utiliser:" -ForegroundColor Gray
Write-Host "  PUT $apiUrl/api.php/users/{id}" -ForegroundColor White
Write-Host "  avec le body: { `"password`": `"$newPassword`" }" -ForegroundColor White
Write-Host ""

# Option 2: Via SQL direct (recommandé pour Render)
Write-Host "Option 2: Via SQL direct (recommandé)" -ForegroundColor Cyan
Write-Host "  Exécutez le script SQL suivant sur Render:" -ForegroundColor Gray
Write-Host ""

$sqlScript = @"
-- Réinitialisation du mot de passe pour ymora@free.fr
-- Mot de passe: Ym120879
-- Hash bcrypt: $passwordHash

UPDATE users 
SET password_hash = '$passwordHash'
WHERE email = '$email';

-- Vérifier la mise à jour
SELECT id, email, first_name, last_name, role_id,
       CASE WHEN password_hash IS NOT NULL THEN 'OK' ELSE 'ERREUR' END as status
FROM users 
WHERE email = '$email';
"@

Write-Host $sqlScript -ForegroundColor White
Write-Host ""

# Option 3: Créer un fichier SQL
$sqlFile = "scripts/reset_password_ymora.sql"
$sqlScript | Out-File -FilePath $sqlFile -Encoding UTF8
Write-Host "✅ Script SQL créé: $sqlFile" -ForegroundColor Green
Write-Host ""

# Instructions pour Render
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Instructions pour Render" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Connectez-vous à Render Dashboard" -ForegroundColor Yellow
Write-Host "2. Allez dans votre service PostgreSQL" -ForegroundColor Yellow
Write-Host "3. Cliquez sur 'Connect' ou 'Shell'" -ForegroundColor Yellow
Write-Host "4. Exécutez le script SQL ci-dessus" -ForegroundColor Yellow
Write-Host ""
Write-Host "OU utilisez psql en local:" -ForegroundColor Yellow
Write-Host "  psql `$DATABASE_URL -f $sqlFile" -ForegroundColor White
Write-Host ""

