# Script de nettoyage pour le mode développement
# Usage: .\scripts\clean-dev.ps1

Write-Host "🧹 Nettoyage complet pour le mode développement..." -ForegroundColor Cyan
Write-Host ""

# Supprimer le cache Next.js
if (Test-Path ".next") {
    Remove-Item -Path ".next" -Recurse -Force
    Write-Host "  ✓ Dossier '.next' supprimé" -ForegroundColor Green
} else {
    Write-Host "  ℹ️  Dossier '.next' n'existe pas" -ForegroundColor Gray
}

# Supprimer le cache node_modules
if (Test-Path "node_modules/.cache") {
    Remove-Item -Path "node_modules/.cache" -Recurse -Force
    Write-Host "  ✓ Cache node_modules supprimé" -ForegroundColor Green
} else {
    Write-Host "  ℹ️  Cache node_modules n'existe pas" -ForegroundColor Gray
}

# Supprimer le cache webpack
if (Test-Path ".next/cache") {
    Remove-Item -Path ".next/cache" -Recurse -Force
    Write-Host "  ✓ Cache webpack supprimé" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Nettoyage terminé !" -ForegroundColor Green
Write-Host ""
Write-Host "Vous pouvez maintenant redémarrer le serveur de développement avec:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor Yellow
Write-Host ""

