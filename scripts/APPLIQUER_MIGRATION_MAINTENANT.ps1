# ═══════════════════════════════════════════════════════════════════
# APPLICATION AUTOMATIQUE DE LA MIGRATION SUR RENDER
# ═══════════════════════════════════════════════════════════════════

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 APPLICATION MIGRATION COMPLÈTE - BASE RENDER             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "📋 Récupérez votre URL de connexion PostgreSQL sur Render:" -ForegroundColor Yellow
Write-Host "   1. Allez sur https://dashboard.render.com/" -ForegroundColor White
Write-Host "   2. Ouvrez votre base PostgreSQL" -ForegroundColor White
Write-Host "   3. Onglet 'Info' > Section 'Connections'" -ForegroundColor White
Write-Host "   4. Copiez 'External Database URL' ou 'Internal Database URL'`n" -ForegroundColor White

Write-Host "Format attendu:" -ForegroundColor Gray
Write-Host "postgresql://user:password@host/database`n" -ForegroundColor Cyan

# Demander l'URL de connexion
$DATABASE_URL = Read-Host "🔗 Collez votre URL de connexion PostgreSQL"

if ([string]::IsNullOrWhiteSpace($DATABASE_URL)) {
    Write-Host "`n❌ URL vide. Annulation." -ForegroundColor Red
    exit 1
}

# Vérifier le format
if ($DATABASE_URL -notmatch "^postgres(ql)?://") {
    Write-Host "`n❌ Format d'URL invalide. L'URL doit commencer par 'postgresql://' ou 'postgres://'" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ URL valide détectée" -ForegroundColor Green

# Vérifier que le fichier de migration existe
$migrationFile = "sql/MIGRATION_COMPLETE_PRODUCTION.sql"
if (-not (Test-Path $migrationFile)) {
    Write-Host "`n❌ Fichier de migration introuvable: $migrationFile" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Fichier de migration trouvé: $migrationFile`n" -ForegroundColor Green

# Vérifier que psql est installé
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ ERREUR: psql n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host "`n📥 SOLUTIONS:" -ForegroundColor Yellow
    Write-Host "   Option 1 - Installer PostgreSQL:" -ForegroundColor White
    Write-Host "   1. Téléchargez: https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
    Write-Host "   2. Installez uniquement 'Command Line Tools'" -ForegroundColor White
    Write-Host "   3. Ajoutez au PATH: C:\Program Files\PostgreSQL\16\bin`n" -ForegroundColor White
    
    Write-Host "   Option 2 - Via le Shell Web Render (plus simple):" -ForegroundColor White
    Write-Host "   1. Ouvrez https://dashboard.render.com/" -ForegroundColor Cyan
    Write-Host "   2. Votre base PostgreSQL > Onglet 'Shell'" -ForegroundColor White
    Write-Host "   3. Tapez: psql `$DATABASE_URL" -ForegroundColor Cyan
    Write-Host "   4. Copiez/collez le contenu de: sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor White
    
    Write-Host "📄 Guide complet: APPLIQUER_MIGRATION_RENDER.md`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ psql trouvé: $($psqlPath.Source)`n" -ForegroundColor Green

# Confirmation
Write-Host "╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║                          ATTENTION                                ║" -ForegroundColor Yellow
Write-Host "╚═══════════════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host "`nVous allez appliquer les migrations sur la base de données:" -ForegroundColor White
Write-Host "  Host: $($DATABASE_URL -replace 'postgresql://[^@]+@([^/]+).*', '$1')" -ForegroundColor Cyan
Write-Host "`nCe script est IDEMPOTENT (peut être rejoué sans danger)." -ForegroundColor Gray
$confirm = Read-Host "`nContinuer ? (o/N)"

if ($confirm -ne 'o' -and $confirm -ne 'O' -and $confirm -ne 'oui') {
    Write-Host "`n❌ Annulation." -ForegroundColor Red
    exit 0
}

# Exécuter la migration
Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║              🔄 EXÉCUTION DE LA MIGRATION EN COURS...            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "⏳ Application des migrations..." -ForegroundColor Yellow
Write-Host "   Cela peut prendre 10-30 secondes...`n" -ForegroundColor Gray

try {
    # Définir l'URL dans une variable d'environnement pour psql
    $env:DATABASE_URL = $DATABASE_URL
    
    # Exécuter psql avec le fichier SQL
    $output = & psql $DATABASE_URL -f $migrationFile 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║              ✅ MIGRATION RÉUSSIE !                              ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
        
        Write-Host "📊 SORTIE DE LA MIGRATION:`n" -ForegroundColor Cyan
        Write-Host $output -ForegroundColor White
        
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "║                    PROCHAINES ÉTAPES                              ║" -ForegroundColor Green
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
        
        Write-Host "1. ✅ Testez votre application: https://ymora.github.io/OTT/" -ForegroundColor White
        Write-Host "2. ✅ Essayez de créer/modifier un dispositif" -ForegroundColor White
        Write-Host "3. ✅ L'erreur 'Database error' devrait avoir disparu !`n" -ForegroundColor White
        
        Write-Host "⚠️  IMPORTANT: Désactivez le mode DEBUG dans api.php" -ForegroundColor Yellow
        Write-Host "    Supprimez la ligne: putenv('DEBUG_ERRORS=true');`n" -ForegroundColor Gray
        
    } else {
        Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
        Write-Host "║              ❌ ERREUR LORS DE LA MIGRATION                      ║" -ForegroundColor Red
        Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Red
        
        Write-Host "📄 SORTIE D'ERREUR:`n" -ForegroundColor Yellow
        Write-Host $output -ForegroundColor Red
        
        Write-Host "`n🔍 DIAGNOSTIC:" -ForegroundColor Yellow
        
        if ($output -match "permission denied") {
            Write-Host "   ❌ Problème de permissions" -ForegroundColor Red
            Write-Host "   ✅ Solution: Vérifiez que l'utilisateur a les droits nécessaires`n" -ForegroundColor White
        }
        elseif ($output -match "could not connect|connection refused") {
            Write-Host "   ❌ Impossible de se connecter à la base" -ForegroundColor Red
            Write-Host "   ✅ Solution: Vérifiez l'URL de connexion`n" -ForegroundColor White
        }
        elseif ($output -match "authentication failed") {
            Write-Host "   ❌ Échec d'authentification" -ForegroundColor Red
            Write-Host "   ✅ Solution: Vérifiez le mot de passe dans l'URL`n" -ForegroundColor White
        }
        else {
            Write-Host "   ⚠️  Erreur inconnue, consultez la sortie ci-dessus`n" -ForegroundColor Yellow
        }
        
        Write-Host "📘 Alternative: Utilisez le Shell Web de Render" -ForegroundColor Cyan
        Write-Host "   Consultez: APPLIQUER_MIGRATION_RENDER.md`n" -ForegroundColor White
    }
    
} catch {
    Write-Host "`n❌ ERREUR D'EXÉCUTION:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`n📘 Consultez: APPLIQUER_MIGRATION_RENDER.md`n" -ForegroundColor Cyan
} finally {
    # Nettoyer la variable d'environnement
    Remove-Item env:DATABASE_URL -ErrorAction SilentlyContinue
}

Write-Host "╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                         FIN DU SCRIPT                             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

