# Script de vérification et récupération des données
# HAPPLYZ MEDICAL - Décembre 2025

Write-Host "`n🔍 DIAGNOSTIC BASE DE DONNÉES" -ForegroundColor Cyan

# Vérifier la variable DATABASE_URL
$dbUrl = $env:DATABASE_URL
if (-not $dbUrl) {
    Write-Host "❌ DATABASE_URL non définie" -ForegroundColor Red
    Write-Host "💡 Définissez-la avec : `$env:DATABASE_URL = 'postgresql://...'" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ DATABASE_URL trouvée" -ForegroundColor Green

# Construire la commande psql
$dbUrl -match 'postgresql://([^:]+):([^@]+)@([^/]+)/(.+)' | Out-Null
$user = $matches[1]
$pass = $matches[2]
$host = $matches[3]
$db = $matches[4]

Write-Host "`n📊 Comptage des enregistrements..." -ForegroundColor Cyan

# Requête SQL pour compter TOUS les enregistrements (même archivés)
$sqlQuery = @"
SELECT 
    'TOTAL (incluant archivés)' as type,
    (SELECT COUNT(*) FROM users) as users_total,
    (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as users_actifs,
    (SELECT COUNT(*) FROM patients) as patients_total,
    (SELECT COUNT(*) FROM patients WHERE deleted_at IS NULL) as patients_actifs,
    (SELECT COUNT(*) FROM devices) as devices_total,
    (SELECT COUNT(*) FROM devices WHERE deleted_at IS NULL) as devices_actifs,
    (SELECT COUNT(*) FROM measurements) as mesures_total,
    (SELECT COUNT(*) FROM device_logs) as logs_total;
"@

$env:PGPASSWORD = $pass
try {
    $result = psql -h $host -U $user -d $db -t -c $sqlQuery 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ RÉSULTAT:" -ForegroundColor Green
        Write-Host $result
        
        if ($result -match "0.*0.*0.*0.*0.*0") {
            Write-Host "`n❌ TOUTES LES TABLES SONT VIDES !" -ForegroundColor Red
            Write-Host "💡 Les données ont été supprimées (probablement Reset Démo)" -ForegroundColor Yellow
            Write-Host "`n🛟 SOLUTIONS:" -ForegroundColor Cyan
            Write-Host "   1. Restaurer backup Render (dashboard.render.com → DB → Backups)"
            Write-Host "   2. Vérifier les logs Render pour voir ce qui s'est passé"
            Write-Host "   3. Si pas de backup : recréer les données (je peux vous aider)"
        } else {
            Write-Host "`n✅ DES DONNÉES EXISTENT ENCORE !" -ForegroundColor Green
            Write-Host "💡 Le problème vient peut-être de l'affichage du dashboard" -ForegroundColor Yellow
        }
    } else {
        Write-Host "`n❌ Erreur connexion base de données" -ForegroundColor Red
        Write-Host $result
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

Write-Host "`n📋 Prochaines étapes:" -ForegroundColor Cyan
Write-Host "   1. Vérifiez les backups Render"
Write-Host "   2. Vérifiez les logs Render (Onglet Logs)"
Write-Host "   3. Cherchez '[handleResetDemo]' dans les logs"

