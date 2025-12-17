# ================================================================================
# Script pour créer un utilisateur admin dans la nouvelle base de données
# Usage: .\scripts\db\create_admin_user.ps1 -DatabaseUrl "postgresql://..." -Email "ymora@free.fr" -Password "Ym120879"
# ================================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$DatabaseUrl,
    [Parameter(Mandatory=$true)]
    [string]$Email,
    [Parameter(Mandatory=$true)]
    [string]$Password,
    [string]$FirstName = "Yann",
    [string]$LastName = "Mora",
    [string]$Phone = ""
)

Write-Host "`n👤 Création de l'utilisateur admin" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

# Vérifier que PHP est disponible pour hasher le mot de passe
$phpPath = Get-Command php -ErrorAction SilentlyContinue
if (-not $phpPath) {
    Write-Host "❌ Erreur: PHP n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   PHP est nécessaire pour hasher le mot de passe avec bcrypt" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ PHP trouvé: $($phpPath.Source)" -ForegroundColor Green
Write-Host ""

# Créer un script PHP temporaire pour hasher le mot de passe
$phpScript = @"
<?php
require 'vendor/autoload.php';
\$password = '$Password';
\$hash = password_hash(\$password, PASSWORD_BCRYPT);
echo \$hash;
"@

$tempPhpFile = [System.IO.Path]::GetTempFileName() + ".php"
$phpScript | Out-File -FilePath $tempPhpFile -Encoding UTF8

Write-Host "🔐 Hashage du mot de passe..." -ForegroundColor Yellow
try {
    $passwordHash = & php $tempPhpFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors du hashage du mot de passe" -ForegroundColor Red
        Write-Host $passwordHash -ForegroundColor Red
        Remove-Item $tempPhpFile -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Host "✅ Mot de passe hashé" -ForegroundColor Green
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    Remove-Item $tempPhpFile -ErrorAction SilentlyContinue
    exit 1
} finally {
    Remove-Item $tempPhpFile -ErrorAction SilentlyContinue
}

# Vérifier que psql est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ Erreur: psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host "   Installez PostgreSQL client pour utiliser ce script" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ psql trouvé: $($psqlPath.Source)" -ForegroundColor Green
Write-Host ""

# Vérifier que le rôle admin existe
Write-Host "🔍 Vérification du rôle admin..." -ForegroundColor Yellow
$roleCheck = & psql $DatabaseUrl -t -A -c "SELECT id FROM roles WHERE name = 'admin' LIMIT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors de la vérification du rôle admin" -ForegroundColor Red
    Write-Host $roleCheck -ForegroundColor Red
    exit 1
}

$roleId = $roleCheck.Trim()
if ([string]::IsNullOrWhiteSpace($roleId)) {
    Write-Host "❌ Le rôle 'admin' n'existe pas dans la base de données" -ForegroundColor Red
    Write-Host "   Assurez-vous d'avoir appliqué le schéma SQL (sql/schema.sql) d'abord" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Rôle admin trouvé (ID: $roleId)" -ForegroundColor Green
Write-Host ""

# Vérifier si l'utilisateur existe déjà
Write-Host "🔍 Vérification si l'utilisateur existe déjà..." -ForegroundColor Yellow
$userCheck = & psql $DatabaseUrl -t -A -c "SELECT id FROM users WHERE email = '$Email' LIMIT 1;" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors de la vérification de l'utilisateur" -ForegroundColor Red
    Write-Host $userCheck -ForegroundColor Red
    exit 1
}

$existingUserId = $userCheck.Trim()
if (-not [string]::IsNullOrWhiteSpace($existingUserId)) {
    Write-Host "⚠️  L'utilisateur existe déjà (ID: $existingUserId)" -ForegroundColor Yellow
    $update = Read-Host "Voulez-vous mettre à jour le mot de passe ? (oui/non)"
    if ($update -eq "oui" -or $update -eq "o" -or $update -eq "y" -or $update -eq "yes") {
        Write-Host "🔄 Mise à jour du mot de passe..." -ForegroundColor Yellow
        $updateQuery = "UPDATE users SET password_hash = '$passwordHash', is_active = TRUE, role_id = $roleId WHERE email = '$Email';"
        $updateResult = & psql $DatabaseUrl -c $updateQuery 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Mot de passe mis à jour avec succès !" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "❌ Erreur lors de la mise à jour: $updateResult" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "❌ Opération annulée" -ForegroundColor Red
        exit 0
    }
}

# Créer l'utilisateur
Write-Host "📝 Création de l'utilisateur admin..." -ForegroundColor Yellow
Write-Host "   Email: $Email" -ForegroundColor Gray
Write-Host "   Nom: $FirstName $LastName" -ForegroundColor Gray
Write-Host "   Rôle: admin" -ForegroundColor Gray
Write-Host ""

# Échapper les apostrophes dans les noms
$firstNameEscaped = $FirstName -replace "'", "''"
$lastNameEscaped = $LastName -replace "'", "''"
$phoneEscaped = if ($Phone) { $Phone -replace "'", "''" } else { "NULL" }

$insertQuery = @"
INSERT INTO users (email, password_hash, first_name, last_name, phone, role_id, is_active)
VALUES ('$Email', '$passwordHash', '$firstNameEscaped', '$lastNameEscaped', $phoneEscaped, $roleId, TRUE);
"@

try {
    $result = & psql $DatabaseUrl -c $insertQuery 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Utilisateur admin créé avec succès !" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Informations de connexion:" -ForegroundColor Cyan
        Write-Host "   Email: $Email" -ForegroundColor White
        Write-Host "   Mot de passe: $Password" -ForegroundColor White
        Write-Host "   Rôle: admin" -ForegroundColor White
        Write-Host ""
        Write-Host "💡 Vous pouvez maintenant vous connecter à l'API avec ces identifiants" -ForegroundColor Yellow
    } else {
        Write-Host "❌ Erreur lors de la création de l'utilisateur:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

