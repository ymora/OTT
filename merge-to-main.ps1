# Script pour merger feature/usb-ota-monitoring vers main et déployer
# Usage: .\merge-to-main.ps1

Write-Host "🔄 Merger feature/usb-ota-monitoring vers main..." -ForegroundColor Yellow

# Sauvegarder l'état actuel
$backupBranch = "backup-feature-usb-ota-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "📦 Création branche de backup: $backupBranch" -ForegroundColor Cyan
git branch $backupBranch

# Basculer sur main
Write-Host "`n✅ Basculer sur main..." -ForegroundColor Green
git checkout main

# Récupérer les dernières modifications
Write-Host "`n📥 Récupérer les dernières modifications de origin/main..." -ForegroundColor Cyan
git pull origin main

# Merger la branche feature
Write-Host "`n🔀 Merger feature/usb-ota-monitoring..." -ForegroundColor Yellow
git merge feature/usb-ota-monitoring --no-ff -m "Merge feature/usb-ota-monitoring: amélioration logs USB et format unifié"

# Vérifier l'état
Write-Host "`n📊 État actuel:" -ForegroundColor Cyan
git status

Write-Host "`n📝 Derniers commits:" -ForegroundColor Cyan
git log --oneline -5

Write-Host "`n⚠️  Pour pousser vers origin/main et déclencher le déploiement Render:" -ForegroundColor Yellow
Write-Host "   git push origin main" -ForegroundColor White

Write-Host "`n✅ Prêt pour le push !" -ForegroundColor Green

