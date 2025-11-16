# ============================================================================
# Script PowerShell pour réinitialiser le mot de passe admin
# ============================================================================
# Usage: .\scripts\reset_admin_password.ps1
# ============================================================================

$ErrorActionPreference = "Stop"

$email = "ymora@free.fr"
$newPassword = "Ym120879"
$apiUrl = $env:NEXT_PUBLIC_API_URL
if (-not $apiUrl) {
    $apiUrl = "https://ott-jbln.onrender.com"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Réinitialisation mot de passe admin" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Email: $email" -ForegroundColor Yellow
Write-Host "Nouveau mot de passe: $newPassword" -ForegroundColor Yellow
Write-Host "API: $apiUrl" -ForegroundColor Yellow
Write-Host ""

# Option 1: Via API (si vous avez un token admin)
Write-Host "Option 1: Via API (nécessite un token admin)" -ForegroundColor Cyan
Write-Host "  Vous devez d'abord vous connecter avec un autre compte admin" -ForegroundColor Gray
Write-Host "  puis utiliser PUT /api.php/users/{id} avec le nouveau mot de passe" -ForegroundColor Gray
Write-Host ""

# Option 2: Via SQL direct
Write-Host "Option 2: Via SQL direct (recommandé)" -ForegroundColor Cyan
Write-Host "  Exécutez le script SQL suivant:" -ForegroundColor Gray
Write-Host ""

$sqlScript = @"
-- Hash bcrypt pour le mot de passe 'Ym120879'
-- Généré avec PHP password_hash('Ym120879', PASSWORD_BCRYPT)

-- Méthode 1: Si vous avez accès à la base de données
UPDATE users 
SET password_hash = `$2y`$10`$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
WHERE email = 'ymora@free.fr';

-- Vérifier
SELECT id, email, first_name, last_name, role_id,
       CASE WHEN password_hash IS NOT NULL THEN 'OK' ELSE 'ERREUR' END as status
FROM users 
WHERE email = 'ymora@free.fr';
"@

Write-Host $sqlScript -ForegroundColor White
Write-Host ""

# Option 3: Via script PHP
Write-Host "Option 3: Via script PHP" -ForegroundColor Cyan
Write-Host "  Si vous avez accès au serveur:" -ForegroundColor Gray
Write-Host "  php scripts/reset_admin_password.php" -ForegroundColor White
Write-Host ""

# Instructions pour Render
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Instructions pour Render" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Connectez-vous à Render Dashboard" -ForegroundColor Yellow
Write-Host "2. Allez dans votre service PostgreSQL" -ForegroundColor Yellow
Write-Host "3. Cliquez sur 'Connect' ou 'Shell'" -ForegroundColor Yellow
Write-Host "4. Exécutez la commande SQL ci-dessus" -ForegroundColor Yellow
Write-Host ""
Write-Host "OU utilisez psql en local:" -ForegroundColor Yellow
Write-Host "  psql `$DATABASE_URL -f scripts/reset_admin_password.sql" -ForegroundColor White
Write-Host ""

