# ================================================================================
# Script pour créer et initialiser une nouvelle base de données PostgreSQL sur Render
# ================================================================================
# HAPPLYZ MEDICAL SAS
# 
# Ce script guide l'utilisateur pour :
# 1. Créer une nouvelle base PostgreSQL sur Render
# 2. Initialiser le schéma
# 3. Configurer les variables d'environnement
# ================================================================================

param(
    [string]$DatabaseUrl = "",
    [switch]$SkipSchema = $false,
    [switch]$Help = $false
)

if ($Help) {
    Write-Host @"
📖 Guide de création d'une nouvelle base PostgreSQL sur Render

ÉTAPES MANUELLES SUR RENDER.COM:
1. Allez sur https://dashboard.render.com
2. Cliquez sur "New +" > "PostgreSQL"
3. Configurez :
   - Name: ott-database25 (nom du service sur Render)
   - Database: ott_data
   - User: ott_database25_user
   - Region: Frankfurt (ou votre région préférée)
   - PostgreSQL Version: 15 (recommandé)
   - Plan: Free (pour commencer)
4. Cliquez sur "Create Database"
5. Une fois créée, notez :
   - Internal Database URL (pour Render)
   - External Database URL (pour connexion externe)
   - Les identifiants (user, password, host, port, database)

UTILISATION DU SCRIPT:
.\scripts\db\setup_new_render_db.ps1 -DatabaseUrl "postgresql://user:pass@host:port/dbname"

OPTIONS:
  -DatabaseUrl    : URL de connexion PostgreSQL (requis)
  -SkipSchema     : Ne pas exécuter le schéma SQL (juste tester la connexion)
  -Help           : Afficher ce message d'aide

EXEMPLE:
.\scripts\db\setup_new_render_db.ps1 -DatabaseUrl "postgresql://ott_database25_user:password@dpg-xxxxx-a.frankfurt-postgres.render.com:5432/ott_data"
"@ -ForegroundColor Cyan
    exit 0
}

Write-Host "`n🔧 Configuration d'une nouvelle base PostgreSQL sur Render" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host ""

# Vérifier que DATABASE_URL est fourni
if (-not $DatabaseUrl) {
    Write-Host "❌ Erreur: DATABASE_URL requis" -ForegroundColor Red
    Write-Host ""
    Write-Host "Usage: .\scripts\db\setup_new_render_db.ps1 -DatabaseUrl 'postgresql://user:pass@host:port/dbname'" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour voir le guide complet: .\scripts\db\setup_new_render_db.ps1 -Help" -ForegroundColor Yellow
    exit 1
}

# Vérifier que psql est disponible
$psqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psqlPath) {
    Write-Host "❌ Erreur: psql n'est pas installé ou n'est pas dans le PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Pour installer PostgreSQL client sur Windows:" -ForegroundColor Yellow
    Write-Host "  1. Téléchargez PostgreSQL depuis https://www.postgresql.org/download/windows/" -ForegroundColor Gray
    Write-Host "  2. Ou utilisez Chocolatey: choco install postgresql" -ForegroundColor Gray
    Write-Host "  3. Ou utilisez WSL: sudo apt-get install postgresql-client" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ psql trouvé: $($psqlPath.Source)" -ForegroundColor Green
Write-Host ""

# Normaliser l'URL (ajouter le port si manquant)
if ($DatabaseUrl -notmatch ":\d+/") {
    # Si pas de port explicite, ajouter :5432 avant le /
    $DatabaseUrl = $DatabaseUrl -replace "/([^/]+)$", ":5432/`$1"
    Write-Host "ℹ️  Port ajouté automatiquement (5432)" -ForegroundColor Gray
}

# Tester la connexion
Write-Host "🔍 Test de connexion à la base de données..." -ForegroundColor Yellow
Write-Host "   URL: $($DatabaseUrl -replace ':[^:@]+@', ':***@')" -ForegroundColor Gray
try {
    $testQuery = "SELECT version();"
    # Utiliser -A pour mode non-aligné et capturer la sortie
    $result = echo $testQuery | & psql $DatabaseUrl -A -t 2>&1 | Out-String
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Connexion réussie !" -ForegroundColor Green
        $version = ($result | Select-String -Pattern "PostgreSQL" | Select-Object -First 1)
        if ($version) {
            Write-Host "   Version: $($version.ToString().Trim())" -ForegroundColor Gray
        }
    } else {
        Write-Host "❌ Erreur de connexion:" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 Vérifiez:" -ForegroundColor Yellow
        Write-Host "   - Que le mot de passe est correct (caractères spéciaux peuvent nécessiter encodage URL)" -ForegroundColor Gray
        Write-Host "   - Que l'URL est complète (user:pass@host:port/dbname)" -ForegroundColor Gray
        Write-Host "   - Que votre IP n'est pas bloquée par Render" -ForegroundColor Gray
        exit 1
    }
} catch {
    Write-Host "❌ Erreur lors du test de connexion: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Vérifier si le schéma existe déjà
Write-Host "🔍 Vérification de l'état de la base de données..." -ForegroundColor Yellow
try {
    $checkQuery = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
    $tableCount = $DatabaseUrl | & psql -t -c $checkQuery 2>&1 | ForEach-Object { $_.Trim() }
    
    if ($tableCount -and $tableCount -gt 0) {
        Write-Host "⚠️  Attention: $tableCount table(s) existent déjà dans la base" -ForegroundColor Yellow
        $confirm = Read-Host "Voulez-vous continuer et réinitialiser le schéma ? (oui/non)"
        if ($confirm -ne "oui" -and $confirm -ne "o" -and $confirm -ne "y" -and $confirm -ne "yes") {
            Write-Host "❌ Opération annulée" -ForegroundColor Red
            exit 0
        }
    } else {
        Write-Host "✅ Base de données vide, prête pour l'initialisation" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Impossible de vérifier l'état de la base (peut être normale si vide)" -ForegroundColor Yellow
}

Write-Host ""

# Appliquer le schéma SQL
if (-not $SkipSchema) {
    $schemaFile = "sql/schema.sql"
    
    if (-not (Test-Path $schemaFile)) {
        Write-Host "❌ Erreur: Fichier schéma introuvable: $schemaFile" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "📋 Application du schéma SQL..." -ForegroundColor Yellow
    Write-Host "   Fichier: $schemaFile" -ForegroundColor Gray
    
    try {
        # Appliquer le schéma
        Get-Content $schemaFile -Raw | & psql $DatabaseUrl 2>&1 | ForEach-Object {
            if ($_ -match "ERROR|FATAL") {
                Write-Host "   ❌ $_" -ForegroundColor Red
            } elseif ($_ -match "CREATE|ALTER|INSERT") {
                Write-Host "   ✅ $_" -ForegroundColor Green
            } else {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✅ Schéma appliqué avec succès !" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "⚠️  Le schéma a été appliqué mais il y a eu des avertissements" -ForegroundColor Yellow
            Write-Host "   (C'est normal si certaines tables existent déjà)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "❌ Erreur lors de l'application du schéma: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    
    Write-Host ""
    
    # Vérifier les tables créées
    Write-Host "🔍 Vérification des tables créées..." -ForegroundColor Yellow
    try {
        $tablesQuery = @"
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
"@
        $tables = $DatabaseUrl | & psql -t -c $tablesQuery 2>&1 | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
        
        if ($tables) {
            Write-Host "✅ Tables créées:" -ForegroundColor Green
            $tables | ForEach-Object {
                Write-Host "   - $_" -ForegroundColor Gray
            }
        } else {
            Write-Host "⚠️  Aucune table trouvée" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "⚠️  Impossible de lister les tables" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️  Application du schéma ignorée (SkipSchema)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=" * 70 -ForegroundColor Gray
Write-Host "✅ Configuration terminée !" -ForegroundColor Green
Write-Host ""
Write-Host "📋 PROCHAINES ÉTAPES:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Mettre à jour les variables d'environnement sur Render:" -ForegroundColor Yellow
Write-Host "   - Allez sur https://dashboard.render.com" -ForegroundColor Gray
Write-Host "   - Sélectionnez votre service 'ott-api'" -ForegroundColor Gray
Write-Host "   - Allez dans 'Environment'" -ForegroundColor Gray
Write-Host "   - Mettez à jour DATABASE_URL avec la nouvelle URL:" -ForegroundColor Gray
Write-Host "     $DatabaseUrl" -ForegroundColor White
Write-Host ""
Write-Host "2. Redémarrer le service API:" -ForegroundColor Yellow
Write-Host "   - Cliquez sur 'Manual Deploy' > 'Deploy latest commit'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Vérifier que l'API fonctionne:" -ForegroundColor Yellow
Write-Host "   - Allez sur https://ott-jbln.onrender.com/api.php/health" -ForegroundColor Gray
Write-Host "   - Vous devriez voir: {""success"":true}" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Note: La base de données est maintenant prête à être utilisée !" -ForegroundColor Cyan
Write-Host ""

