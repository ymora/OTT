# ═══════════════════════════════════════════════════════════════════
# APPLICATION AUTOMATIQUE - MIGRATION COMPLÈTE RENDER
# ═══════════════════════════════════════════════════════════════════
# Applique sql/MIGRATION_COMPLETE_PRODUCTION.sql sur la base Render
# ═══════════════════════════════════════════════════════════════════

param(
    [string]$DATABASE_URL = $env:DATABASE_URL,
    [string]$RENDER_API_KEY = $env:RENDER_API_KEY,
    [string]$RENDER_SERVICE_ID = $env:RENDER_SERVICE_ID
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     🚀 APPLICATION MIGRATION COMPLÈTE - RENDER                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Déterminer le répertoire racine
$rootDir = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$MIGRATION_FILE = Join-Path $rootDir "sql\MIGRATION_COMPLETE_PRODUCTION.sql"

# Vérifier que le fichier de migration existe
if (-not (Test-Path $MIGRATION_FILE)) {
    Write-Host "❌ Fichier de migration introuvable: $MIGRATION_FILE" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Fichier de migration trouvé: $MIGRATION_FILE`n" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════════
# MÉTHODE 1: Via DATABASE_URL direct (psql)
# ═══════════════════════════════════════════════════════════════════

if ($DATABASE_URL) {
    Write-Host "📡 MÉTHODE 1: Connexion directe PostgreSQL" -ForegroundColor Yellow
    Write-Host "─────────────────────────────────────────────────────────────────`n" -ForegroundColor Gray
    
    # Masquer le mot de passe dans l'affichage
    $maskedUrl = $DATABASE_URL -replace ':[^:@]+@', ':****@'
    Write-Host "   Base: $maskedUrl" -ForegroundColor Gray
    
    # Vérifier que psql est disponible
    $psqlPath = Get-Command psql -ErrorAction SilentlyContinue
    if (-not $psqlPath) {
        Write-Host "`n❌ psql n'est pas installé ou pas dans le PATH" -ForegroundColor Red
        Write-Host "`n📥 SOLUTIONS:" -ForegroundColor Yellow
        Write-Host "   Option 1 - Installer PostgreSQL:" -ForegroundColor White
        Write-Host "   1. Téléchargez: https://www.postgresql.org/download/windows/" -ForegroundColor Cyan
        Write-Host "   2. Installez 'Command Line Tools'" -ForegroundColor White
        Write-Host "   3. Ajoutez au PATH: C:\Program Files\PostgreSQL\16\bin`n" -ForegroundColor White
        
        Write-Host "   Option 2 - Via le Shell Web Render (recommandé):" -ForegroundColor White
        Write-Host "   1. Ouvrez: https://dashboard.render.com/" -ForegroundColor Cyan
        Write-Host "   2. Votre base PostgreSQL > Onglet 'Shell'" -ForegroundColor White
        Write-Host "   3. Tapez: psql `$DATABASE_URL" -ForegroundColor Cyan
        Write-Host "   4. Copiez/collez le contenu de: sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor White
        
        exit 1
    }
    
    Write-Host "✅ psql trouvé: $($psqlPath.Source)`n" -ForegroundColor Green
    
    # Confirmation
    Write-Host "⚠️  Vous allez appliquer la migration sur:" -ForegroundColor Yellow
    Write-Host "   $maskedUrl`n" -ForegroundColor Gray
    $confirm = Read-Host "Continuer ? (o/N)"
    
    if ($confirm -ne 'o' -and $confirm -ne 'O' -and $confirm -ne 'oui') {
        Write-Host "`n❌ Annulation." -ForegroundColor Red
        exit 0
    }
    
    Write-Host "`n⏳ Application de la migration..." -ForegroundColor Yellow
    Write-Host "   Cela peut prendre 10-30 secondes...`n" -ForegroundColor Gray
    
    try {
        $output = & psql $DATABASE_URL -f $MIGRATION_FILE 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Green
            Write-Host "║              ✅ MIGRATION RÉUSSIE !                              ║" -ForegroundColor Green
            Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Green
            
            Write-Host "📊 SORTIE:`n" -ForegroundColor Cyan
            Write-Host $output -ForegroundColor White
            
            Write-Host "`n✅ La base de données est maintenant à jour !`n" -ForegroundColor Green
            exit 0
        } else {
            Write-Host "`n╔═══════════════════════════════════════════════════════════════════╗" -ForegroundColor Red
            Write-Host "║              ❌ ERREUR LORS DE LA MIGRATION                      ║" -ForegroundColor Red
            Write-Host "╚═══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Red
            
            Write-Host "📄 SORTIE D'ERREUR:`n" -ForegroundColor Yellow
            Write-Host $output -ForegroundColor Red
            
            exit 1
        }
    } catch {
        Write-Host "`n❌ ERREUR D'EXÉCUTION:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
}

# ═══════════════════════════════════════════════════════════════════
# MÉTHODE 2: Via Render API (si DATABASE_URL non fourni)
# ═══════════════════════════════════════════════════════════════════

if ($RENDER_API_KEY -and $RENDER_SERVICE_ID) {
    Write-Host "📡 MÉTHODE 2: Via Render API (non implémentée pour les migrations SQL)" -ForegroundColor Yellow
    Write-Host "   Utilisez la méthode 1 avec DATABASE_URL`n" -ForegroundColor Gray
    exit 1
}

# ═══════════════════════════════════════════════════════════════════
# AUCUNE MÉTHODE DISPONIBLE
# ═══════════════════════════════════════════════════════════════════

Write-Host "❌ Aucune méthode de connexion disponible`n" -ForegroundColor Red

Write-Host "📋 OPTIONS DISPONIBLES:`n" -ForegroundColor Yellow

Write-Host "OPTION 1 - Via PowerShell (recommandé si psql installé):" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "1. Récupérez votre DATABASE_URL depuis Render:" -ForegroundColor White
Write-Host "   - Render Dashboard > PostgreSQL > Connect > Internal Database URL" -ForegroundColor Cyan
Write-Host "2. Exécutez:" -ForegroundColor White
Write-Host "   " -NoNewline -ForegroundColor Gray
Write-Host ".\scripts\APPLIQUER_MIGRATION_COMPLETE.ps1 -DATABASE_URL 'postgresql://...'" -ForegroundColor Green
Write-Host ""

Write-Host "OPTION 2 - Via Shell Web Render (plus simple, pas besoin de psql):" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "1. Ouvrez: " -NoNewline -ForegroundColor White
Write-Host "https://dashboard.render.com/" -ForegroundColor Cyan
Write-Host "2. Votre base PostgreSQL > Onglet 'Shell'" -ForegroundColor White
Write-Host "3. Tapez: " -NoNewline -ForegroundColor White
Write-Host "psql `$DATABASE_URL" -ForegroundColor Green
Write-Host "4. Ouvrez le fichier: " -NoNewline -ForegroundColor White
Write-Host "sql/MIGRATION_COMPLETE_PRODUCTION.sql" -ForegroundColor Cyan
Write-Host "5. Sélectionnez TOUT (Ctrl+A), Copiez (Ctrl+C)" -ForegroundColor White
Write-Host "6. Collez dans le terminal Render (Clic droit > Paste)" -ForegroundColor White
Write-Host "7. Appuyez sur Entrée`n" -ForegroundColor White

Write-Host "📄 Guide complet: MIGRATION_RENDER_RAPIDE.md`n" -ForegroundColor Yellow

exit 1

