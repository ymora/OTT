# Script d'installation pour Render.com
# Base de données : ott_data

$env:PGPASSWORD = "lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Installation USB Logs - Render.com" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "📊 Base de données: ott_data" -ForegroundColor Yellow
Write-Host "🌍 Serveur: Render.com (Frankfurt)" -ForegroundColor Yellow
Write-Host ""

# Vérifier que psql est installé
try {
    $psqlVersion = & psql --version 2>&1
    Write-Host "✅ psql trouvé: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ psql n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host "Installez PostgreSQL Client depuis: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "🔧 Exécution de la migration..." -ForegroundColor Yellow

# Exécuter la migration
$result = & psql `
    -h dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com `
    -p 5432 `
    -U ott_data_user `
    -d ott_data `
    -f sql/migration_add_usb_logs.sql `
    2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Migration exécutée avec succès!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Vérification de la table..." -ForegroundColor Yellow
    
    # Vérifier que la table existe
    $checkTable = & psql `
        -h dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com `
        -p 5432 `
        -U ott_data_user `
        -d ott_data `
        -c "SELECT COUNT(*) FROM usb_logs;" `
        2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Table usb_logs créée et accessible!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Installation terminée avec succès!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Prochaines étapes:" -ForegroundColor Cyan
        Write-Host "   1. Accédez à http://localhost:3000/dashboard/admin/usb-logs" -ForegroundColor White
        Write-Host "   2. Les logs USB seront automatiquement synchronisés" -ForegroundColor White
        Write-Host "   3. Connectez un dispositif USB pour tester" -ForegroundColor White
    } else {
        Write-Host "⚠️ Table créée mais vérification échouée" -ForegroundColor Yellow
        Write-Host $checkTable -ForegroundColor Gray
    }
} else {
    Write-Host ""
    Write-Host "❌ Erreur lors de l'exécution de la migration:" -ForegroundColor Red
    Write-Host $result -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Suggestions:" -ForegroundColor Yellow
    Write-Host "   1. Vérifiez que la connexion Internet fonctionne" -ForegroundColor White
    Write-Host "   2. Vérifiez que les identifiants sont corrects" -ForegroundColor White
    Write-Host "   3. Vérifiez que le fichier sql/migration_add_usb_logs.sql existe" -ForegroundColor White
    exit 1
}

# Nettoyer le mot de passe
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

