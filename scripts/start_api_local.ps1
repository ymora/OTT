# ============================================================================
# Demarrer l'API PHP locale avec base Render
# ============================================================================
# Charge les variables d'environnement depuis .env.php et demarre le serveur PHP
# ============================================================================

Write-Host "Demarrage de l'API PHP locale..." -ForegroundColor Cyan
Write-Host ""

# Verifier que .env.php existe
if (-not (Test-Path ".env.php")) {
    Write-Host "Erreur: .env.php non trouve!" -ForegroundColor Red
    Write-Host "Executez d'abord: .\scripts\setup_local_render_db.ps1" -ForegroundColor Yellow
    exit 1
}

# Verifier que PHP est installe
$phpVersion = php -v 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erreur: PHP n'est pas installe ou pas dans le PATH" -ForegroundColor Red
    Write-Host "Installez PHP 8.2+ avec extension pgsql" -ForegroundColor Yellow
    exit 1
}

Write-Host "PHP trouve:" -ForegroundColor Green
php -v | Select-Object -First 1
Write-Host ""

# Charger les variables d'environnement depuis .env.php
Write-Host "Chargement des variables d'environnement depuis .env.php..." -ForegroundColor Cyan

$envContent = Get-Content ".env.php" -Raw
$envLines = $envContent -split "`n" | Where-Object { $_ -match '^[^#].*=' }

foreach ($line in $envLines) {
    if ($line -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        # Supprimer les guillemets si presents
        $value = $value -replace '^["'']|["'']$', ''
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
        Write-Host "  $key = $($value.Substring(0, [Math]::Min(20, $value.Length)))..." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Demarrage du serveur PHP sur http://localhost:8080" -ForegroundColor Green
Write-Host "Appuyez sur Ctrl+C pour arreter" -ForegroundColor Yellow
Write-Host ""

# Demarrer le serveur PHP
php -S localhost:8080 -t . api.php

