# ================================================================================
# Script PowerShell - Push OTT vers GitHub
# ================================================================================
# HAPPLYZ MEDICAL SAS
# Usage: .\push_to_github.ps1
# ================================================================================

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  OTT - Push vers GitHub" -ForegroundColor Cyan  
Write-Host "  HAPPLYZ MEDICAL SAS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Git est installé
try {
    git --version | Out-Null
} catch {
    Write-Host "❌ ERREUR: Git n'est pas installé!" -ForegroundColor Red
    Write-Host "Télécharger: https://git-scm.com/downloads" -ForegroundColor Yellow
    exit 1
}

# Aller dans le dossier du projet
$projectPath = "C:\Users\ymora\Desktop\maxime"
Set-Location $projectPath

Write-Host "📂 Dossier: $projectPath" -ForegroundColor Green
Write-Host ""

# Vérifier si .git existe
if (!(Test-Path ".git")) {
    Write-Host "🔧 Initialisation Git..." -ForegroundColor Yellow
    git init
    Write-Host "✅ Git initialisé" -ForegroundColor Green
} else {
    Write-Host "✅ Git déjà initialisé" -ForegroundColor Green
}

Write-Host ""

# Vérifier si .gitignore existe
if (!(Test-Path ".gitignore")) {
    Write-Host "📝 Création .gitignore..." -ForegroundColor Yellow
    
    @"
# Fichiers à ne pas inclure sur GitHub

# Mots de passe et secrets
config_local.php
*.env
.env.local

# Logs
*.log
logs/

# OS
.DS_Store
Thumbs.db
desktop.ini

# IDE
.vscode/
.idea/
*.swp
*.swo

# Temp
*.tmp
temp/
tmp/

# Firmwares binaires (trop gros)
*.bin
firmwares/*.bin

# Backup BDD
*.sql.backup
backup_*.sql
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8
    
    Write-Host "✅ .gitignore créé" -ForegroundColor Green
} else {
    Write-Host "✅ .gitignore existe déjà" -ForegroundColor Green
}

Write-Host ""

# Afficher statut
Write-Host "📊 Statut des fichiers:" -ForegroundColor Cyan
git status --short

Write-Host ""

# Ajouter tous les fichiers
Write-Host "➕ Ajout des fichiers..." -ForegroundColor Yellow
git add .

Write-Host "✅ Fichiers ajoutés" -ForegroundColor Green
Write-Host ""

# Demander message de commit
$commitMessage = Read-Host "💬 Message de commit (Entrée pour 'Update OTT V2.0')"
if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $commitMessage = "Update OTT V2.0 - Dashboard + API + Firmware"
}

# Commit
Write-Host "📝 Commit en cours..." -ForegroundColor Yellow
git commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Aucun changement à commiter (ou erreur)" -ForegroundColor Yellow
}

Write-Host ""

# Vérifier si remote existe
$remoteExists = git remote get-url origin 2>$null
if (!$remoteExists) {
    Write-Host "🔗 Configuration remote GitHub..." -ForegroundColor Yellow
    Write-Host ""
    
    $repoUrl = "https://github.com/ymora/OTT.git"
    Write-Host "📦 Repository: $repoUrl" -ForegroundColor Cyan
    
    git remote add origin $repoUrl
    git branch -M main
    Write-Host "✅ Remote configuré" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Push vers GitHub..." -ForegroundColor Yellow

# Push
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Green
    Write-Host "  ✅ SUCCÈS!" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📦 Code poussé sur GitHub" -ForegroundColor Green
    Write-Host "🌐 URL: $(git remote get-url origin)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🎯 Prochaine étape:" -ForegroundColor Yellow
    Write-Host "   → Déployer sur Render.com" -ForegroundColor White
    Write-Host "   → Voir GUIDE_DEPLOIEMENT_RENDER.md" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors du push" -ForegroundColor Red
    Write-Host ""
    Write-Host "Problèmes possibles:" -ForegroundColor Yellow
    Write-Host "1. Authentification GitHub requise (entrez username/password)" -ForegroundColor White
    Write-Host "2. Ou utilisez SSH: git remote set-url origin git@github.com:username/repo.git" -ForegroundColor White
    Write-Host "3. Ou configurez Personal Access Token" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "Appuyez sur une touche pour fermer..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

