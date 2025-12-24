# Script pour déployer sur Render
# Usage: .\scripts\deploy\deploy_to_render.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 DÉPLOIEMENT SUR RENDER" -ForegroundColor Cyan
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""

# Vérifier que nous sommes dans un repo Git
if (-not (Test-Path ".git")) {
    Write-Host "❌ Erreur: Ce n'est pas un dépôt Git!" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Vérifier que render.yaml existe
if (-not (Test-Path "render.yaml")) {
    Write-Host "❌ Erreur: render.yaml introuvable!" -ForegroundColor Red
    Write-Host ""
    exit 1
}

Write-Host "✅ Configuration détectée:" -ForegroundColor Green
Write-Host "   • Repository Git: OK" -ForegroundColor Gray
Write-Host "   • render.yaml: OK" -ForegroundColor Gray
Write-Host ""

# Afficher les fichiers modifiés
Write-Host "📋 Fichiers modifiés à commiter:" -ForegroundColor Yellow
$modified = git status --short
if ($modified) {
    $modified | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
} else {
    Write-Host "   Aucun fichier modifié" -ForegroundColor Gray
}
Write-Host ""

# Demander confirmation
Write-Host "⚠️  ATTENTION: Ce script va:" -ForegroundColor Yellow
Write-Host "   1. Ajouter tous les fichiers modifiés" -ForegroundColor White
Write-Host "   2. Créer un commit" -ForegroundColor White
Write-Host "   3. Pousser sur origin/main" -ForegroundColor White
Write-Host "   4. Render déploiera automatiquement" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continuer ? (O/N)"
if ($confirm -ne "O" -and $confirm -ne "o" -and $confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host ""
    Write-Host "❌ Déploiement annulé" -ForegroundColor Red
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Host "📦 Étape 1/3: Ajout des fichiers..." -ForegroundColor Cyan
git add .
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors de l'ajout des fichiers" -ForegroundColor Red
    exit 1
}
Write-Host "   ✅ Fichiers ajoutés" -ForegroundColor Green
Write-Host ""

Write-Host "📝 Étape 2/3: Création du commit..." -ForegroundColor Cyan
$commitMessage = "Deploy to Render - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
git commit -m $commitMessage
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ⚠️  Aucun changement à commiter (déjà à jour)" -ForegroundColor Yellow
} else {
    Write-Host "   ✅ Commit créé: $commitMessage" -ForegroundColor Green
}
Write-Host ""

Write-Host "🚀 Étape 3/3: Push vers origin/main..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erreur lors du push vers Git" -ForegroundColor Red
    Write-Host ""
    exit 1
}
Write-Host "   ✅ Push réussi!" -ForegroundColor Green
Write-Host ""

Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host "✅ DÉPLOIEMENT INITIÉ !" -ForegroundColor Green
Write-Host "════════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Prochaines étapes:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Vérifier le déploiement sur Render:" -ForegroundColor Cyan
Write-Host "   → https://dashboard.render.com" -ForegroundColor Gray
Write-Host "   → Service: ott-api" -ForegroundColor Gray
Write-Host "   → Onglet: Logs" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Attendre la fin du déploiement (~2-5 minutes)" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. Tester l'API:" -ForegroundColor Cyan
Write-Host "   → https://ott-jbln.onrender.com/api.php/health" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Vérifier la base de données:" -ForegroundColor Cyan
Write-Host "   → Se connecter avec ymora@free.fr / Ym120879" -ForegroundColor Gray
Write-Host ""
Write-Host "✅ Le déploiement est automatique via render.yaml" -ForegroundColor Green
Write-Host ""






