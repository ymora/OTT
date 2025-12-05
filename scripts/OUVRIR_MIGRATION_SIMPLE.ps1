# ═══════════════════════════════════════════════════════════════════
# GUIDE RAPIDE - APPLICATION MIGRATION RENDER (2 MINUTES)
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 MIGRATION RENDER - GUIDE RAPIDE (2 MINUTES)               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "📋 MÉTHODE LA PLUS SIMPLE - Via Shell Web Render`n" -ForegroundColor Yellow

Write-Host "ÉTAPE 1: Ouvrir le Shell Render" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "1. Allez sur: " -NoNewline -ForegroundColor White
Write-Host "https://dashboard.render.com/" -ForegroundColor Cyan
Write-Host "2. Connectez-vous avec votre compte" -ForegroundColor White
Write-Host "3. Trouvez votre base PostgreSQL (dans la liste)" -ForegroundColor White
Write-Host "4. Cliquez dessus" -ForegroundColor White
Write-Host "5. Cliquez sur l'onglet " -NoNewline -ForegroundColor White
Write-Host "\"Shell\"" -ForegroundColor Yellow -NoNewline
Write-Host " en haut de la page`n" -ForegroundColor White

Write-Host "ÉTAPE 2: Se connecter à PostgreSQL" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "Dans le terminal qui s'ouvre, tapez:" -ForegroundColor White
Write-Host ""
Write-Host "   " -NoNewline -ForegroundColor Gray
Write-Host "psql `$DATABASE_URL" -ForegroundColor Green
Write-Host ""
Write-Host "Puis appuyez sur Entrée. Vous devriez voir:" -ForegroundColor White
Write-Host ""
Write-Host "   postgres=>" -ForegroundColor Yellow
Write-Host ""

$continue = Read-Host "Appuyez sur Entrée quand vous êtes prêt pour l'étape suivante..."

Write-Host "`nÉTAPE 3: Copier le fichier SQL" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "Je vais maintenant ouvrir le fichier SQL dans votre éditeur..." -ForegroundColor White
Write-Host ""

# Ouvrir le fichier SQL dans l'éditeur par défaut
$sqlFile = Join-Path $PSScriptRoot "..\sql\MIGRATION_COMPLETE_PRODUCTION.sql"
if (Test-Path $sqlFile) {
    Write-Host "✅ Fichier trouvé: $sqlFile" -ForegroundColor Green
    Write-Host "`n📝 Instructions:" -ForegroundColor Yellow
    Write-Host "   1. Le fichier SQL va s'ouvrir dans votre éditeur" -ForegroundColor White
    Write-Host "   2. Sélectionnez TOUT (Ctrl+A)" -ForegroundColor White
    Write-Host "   3. Copiez (Ctrl+C)" -ForegroundColor White
    Write-Host "   4. Revenez au terminal Render" -ForegroundColor White
    Write-Host "   5. Collez dans le terminal (Clic droit > Paste)" -ForegroundColor White
    Write-Host "   6. Appuyez sur Entrée`n" -ForegroundColor White
    
    Start-Sleep -Seconds 2
    
    Write-Host "⏳ Ouverture du fichier SQL..." -ForegroundColor Yellow
    Start-Process $sqlFile
    
    Write-Host "✅ Fichier ouvert !`n" -ForegroundColor Green
} else {
    Write-Host "❌ Fichier introuvable: $sqlFile" -ForegroundColor Red
    Write-Host "`nVérifiez que le fichier existe dans: sql/MIGRATION_COMPLETE_PRODUCTION.sql" -ForegroundColor Yellow
}

Write-Host "`nÉTAPE 4: Vérifier le succès" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "À la fin de l'exécution, vous devriez voir:" -ForegroundColor White
Write-Host ""
Write-Host "   status          | users_actifs | patients_actifs | devices_actifs | ..." -ForegroundColor Gray
Write-Host "   ----------------+--------------+-----------------+----------------+-----" -ForegroundColor Gray
Write-Host "   MIGRATION COMPLÈTE |          X |             X |            X | ..." -ForegroundColor Green
Write-Host ""

$continue = Read-Host "Appuyez sur Entrée quand la migration est terminée..."

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║                    ✅ MIGRATION TERMINÉE !                        ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📋 PROCHAINES ÉTAPES:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Testez votre application: " -NoNewline -ForegroundColor White
Write-Host "https://ymora.github.io/OTT/" -ForegroundColor Cyan
Write-Host "2. Essayez de créer ou modifier un dispositif" -ForegroundColor White
Write-Host "3. L'erreur 'Database error' devrait avoir disparu ! ✅" -ForegroundColor Green
Write-Host ""

Write-Host "⚠️  IMPORTANT: Désactivez le mode DEBUG" -ForegroundColor Yellow
Write-Host "   Dans api.php, supprimez la ligne:" -ForegroundColor White
Write-Host "   " -NoNewline -ForegroundColor Gray
Write-Host "putenv('DEBUG_ERRORS=true');" -ForegroundColor Red
Write-Host ""

Write-Host "╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                         FIN DU GUIDE                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

