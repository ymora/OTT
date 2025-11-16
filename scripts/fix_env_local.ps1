# Script pour corriger .env.local et utiliser l'API Render
# Utilisation : .\scripts\fix_env_local.ps1

$envFile = ".env.local"

Write-Host "Correction de .env.local pour utiliser l'API Render..." -ForegroundColor Cyan
Write-Host ""

if (Test-Path $envFile) {
    Write-Host "  Fichier .env.local trouve" -ForegroundColor Green
    $content = Get-Content $envFile -Raw
    
    # Mettre a jour l'URL de l'API
    $content = $content -replace 'NEXT_PUBLIC_API_URL=.*', 'NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com'
    $content = $content -replace 'NEXT_PUBLIC_REQUIRE_AUTH=.*', 'NEXT_PUBLIC_REQUIRE_AUTH=false'
    
    # Ajouter les lignes si elles n'existent pas
    if ($content -notmatch 'NEXT_PUBLIC_API_URL') {
        $content += "`nNEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com"
    }
    if ($content -notmatch 'NEXT_PUBLIC_REQUIRE_AUTH') {
        $content += "`nNEXT_PUBLIC_REQUIRE_AUTH=false"
    }
    
    Set-Content -Path $envFile -Value $content -Encoding UTF8
    Write-Host "  Fichier .env.local mis a jour" -ForegroundColor Green
} else {
    Write-Host "  Fichier .env.local non trouve, creation..." -ForegroundColor Yellow
    @"
# Configuration Frontend OTT - Developpement Local
# Utilise l'API Render par defaut (plus simple pour tester)
NEXT_PUBLIC_API_URL=https://ott-jbln.onrender.com
NEXT_PUBLIC_REQUIRE_AUTH=false
NEXT_PUBLIC_ENABLE_DEMO_RESET=false
"@ | Out-File -FilePath $envFile -Encoding UTF8
    Write-Host "  Fichier .env.local cree" -ForegroundColor Green
}

Write-Host ""
Write-Host "Configuration actuelle:" -ForegroundColor Cyan
Get-Content $envFile | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }

Write-Host ""
Write-Host "IMPORTANT :" -ForegroundColor Yellow
Write-Host "  1. Redemarrez le serveur Next.js (Ctrl+C puis npm run dev)" -ForegroundColor White
Write-Host "  2. Pour se connecter a Render, vous devez creer un utilisateur sur Render" -ForegroundColor White
Write-Host "  3. Ou utilisez l'API locale avec une base PostgreSQL locale" -ForegroundColor White
Write-Host ""
Write-Host "Pour creer un utilisateur sur Render:" -ForegroundColor Cyan
Write-Host "  - Connectez-vous a la base Render PostgreSQL" -ForegroundColor Gray
Write-Host "  - Executez: psql DATABASE_URL -f sql/create_demo_user.sql" -ForegroundColor Gray
Write-Host "  - Identifiants: demo@example.com / Demo1234!" -ForegroundColor Gray
Write-Host ""
