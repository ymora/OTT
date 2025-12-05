# ═══════════════════════════════════════════════════════════════════
# EXÉCUTION DIRECTE DE LA MIGRATION - SANS INTERACTION
# ═══════════════════════════════════════════════════════════════════

$DATABASE_URL = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 EXÉCUTION MIGRATION COMPLÈTE - RENDER                      ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Déterminer le répertoire racine
$rootDir = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$MIGRATION_FILE = Join-Path $rootDir "sql\MIGRATION_COMPLETE_PRODUCTION.sql"

if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier de migration introuvable: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Fichier trouvé: $MIGRATION_FILE" -ForegroundColor Green
Write-Host "✅ Base de données: dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com`n" -ForegroundColor Green

# Vérifier psql
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ psql n'est pas installé localement`n" -ForegroundColor Red
    Write-Host "📋 SOLUTION ALTERNATIVE:" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "1. Ouvrez: https://dashboard.render.com/" -ForegroundColor White
    Write-Host "2. Votre base PostgreSQL > Onglet 'Shell'" -ForegroundColor White
    Write-Host "3. Tapez: psql `$DATABASE_URL" -ForegroundColor Cyan
    Write-Host "4. Ouvrez le fichier: sql/MIGRATION_COMPLETE_PRODUCTION.sql" -ForegroundColor White
    Write-Host "5. Sélectionnez TOUT (Ctrl+A), Copiez (Ctrl+C)" -ForegroundColor White
    Write-Host "6. Collez dans le terminal Render et appuyez sur Entrée`n" -ForegroundColor White
    
    # Afficher le contenu du fichier SQL pour copier/coller
    Write-Host "📄 CONTENU DU FICHIER SQL (à copier/coller dans le Shell Render):`n" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────────`n" -ForegroundColor Gray
    Get-Content $MIGRATION_FILE -Raw
    Write-Host "`n─────────────────────────────────────────────────────────────────`n" -ForegroundColor Gray
    
    exit 1
}

Write-Host "✅ psql trouvé: $($psqlPath.Source)`n" -ForegroundColor Green

Write-Host "⏳ Application de la migration en cours..." -ForegroundColor Yellow
Write-Host "   Cela peut prendre 10-30 secondes...`n" -ForegroundColor Gray

try {
    # Masquer le mot de passe dans les logs
    $maskedUrl = $DATABASE_URL -replace ':[^:@]+@', ':****@'
    
    # Exécuter la migration
    $output = & psql $DATABASE_URL -f $MIGRATION_FILE 2>&1
    $exitCode = $LASTEXITCODE
    
    if ($exitCode -eq 0) {
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║              ✅ MIGRATION RÉUSSIE !                              ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
        
        Write-Host "📊 RÉSULTAT:`n" -ForegroundColor Cyan
        Write-Host $output -ForegroundColor White
        
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║                    ✅ SUCCÈS COMPLET !                            ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
        
        Write-Host "📋 PROCHAINES ÉTAPES:" -ForegroundColor Yellow
        Write-Host "   1. ✅ Testez votre application: https://ymora.github.io/OTT/" -ForegroundColor White
        Write-Host "   2. ✅ Essayez de créer/modifier un dispositif" -ForegroundColor White
        Write-Host "   3. ✅ L'erreur 'Database error' devrait avoir disparu !`n" -ForegroundColor Green
        
        Write-Host "⚠️  IMPORTANT: Désactivez le mode DEBUG dans api.php" -ForegroundColor Yellow
        Write-Host "   Supprimez la ligne: putenv('DEBUG_ERRORS=true');`n" -ForegroundColor Gray
        
    } else {
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
        Write-Host "║              ❌ ERREUR LORS DE LA MIGRATION                      ║" -ForegroundColor Red
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Red
        
        Write-Host "📄 DÉTAILS DE L'ERREUR:`n" -ForegroundColor Yellow
        Write-Host $output -ForegroundColor Red
        
        Write-Host "`n🔍 DIAGNOSTIC:" -ForegroundColor Yellow
        if ($output -match "already exists|déjà existe") {
            Write-Host "   ℹ️  Certaines colonnes existent déjà - c'est normal si la migration a été partiellement appliquée" -ForegroundColor Cyan
            Write-Host "   ✅ La migration peut être rejouée sans problème (idempotente)`n" -ForegroundColor Green
        } elseif ($output -match "permission denied") {
            Write-Host "   ❌ Problème de permissions sur la base de données" -ForegroundColor Red
        } elseif ($output -match "could not connect|connection refused") {
            Write-Host "   ❌ Impossible de se connecter à la base de données" -ForegroundColor Red
            Write-Host "   ✅ Vérifiez que l'URL est correcte`n" -ForegroundColor White
        }
        
        exit 1
    }
    
} catch {
    Write-Host "`n❌ ERREUR D'EXÉCUTION:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

