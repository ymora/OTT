# ═══════════════════════════════════════════════════════════════
# MIGRATION GPS - SOLUTION SIMPLE ET RAPIDE
# ═══════════════════════════════════════════════════════════════

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  MIGRATION GPS - MÉTHODE LA PLUS SIMPLE" -ForegroundColor White
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "Voici les 3 façons de faire la migration, de la plus simple" -ForegroundColor Yellow
Write-Host "à la plus compliquée:`n" -ForegroundColor Yellow

# ═══════════════════════════════════════════════════════════════
# MÉTHODE 1: Interface Web Render (RECOMMANDÉE)
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
Write-Host "  MÉTHODE 1: Interface Web (30 secondes) ⚡" -ForegroundColor White
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Green

Write-Host "1. Ouvrir:" -ForegroundColor Cyan
Write-Host "   https://dashboard.render.com/d/dpg-d4b6c015pdvs73ck6rp0`n" -ForegroundColor White

Write-Host "2. Cliquer 'Connect' (bouton bleu en haut à droite)`n" -ForegroundColor Cyan

Write-Host "3. Copier/coller cette ligne:" -ForegroundColor Cyan
Write-Host "`n   ALTER TABLE device_configurations ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;`n" -ForegroundColor Green

Write-Host "4. Appuyer sur ENTRÉE`n" -ForegroundColor Cyan

Write-Host "✅ C'EST FAIT !`n" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════
# MÉTHODE 2: Script SQL complet
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "  MÉTHODE 2: Fichier SQL complet (1 minute)" -ForegroundColor White  
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Yellow

Write-Host "1. Ouvrir le fichier:" -ForegroundColor Cyan
Write-Host "   sql/MIGRATION_COMPLETE_PRODUCTION.sql`n" -ForegroundColor White

Write-Host "2. Copier TOUT le contenu`n" -ForegroundColor Cyan

Write-Host "3. Aller sur Render → Connect → Coller → Exécuter`n" -ForegroundColor Cyan

Write-Host "✅ Inclut GPS + USB logs + tout !`n" -ForegroundColor Green

# ═══════════════════════════════════════════════════════════════
# MÉTHODE 3: Installation psql (compliqué)
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════" -ForegroundColor Red
Write-Host "  MÉTHODE 3: psql (10 minutes, admin requis)" -ForegroundColor White
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Red

Write-Host "1. Ouvrir PowerShell EN ADMINISTRATEUR`n" -ForegroundColor Cyan

Write-Host "2. Installer PostgreSQL:" -ForegroundColor Cyan
Write-Host "   choco install postgresql -y`n" -ForegroundColor White

Write-Host "3. Relancer ce script`n" -ForegroundColor Cyan

Write-Host "⚠️ Nécessite droits admin + 10 minutes`n" -ForegroundColor Red

# ═══════════════════════════════════════════════════════════════
# RECOMMANDATION
# ═══════════════════════════════════════════════════════════════

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  RECOMMANDATION" -ForegroundColor White
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "🎯 Utilisez la MÉTHODE 1 (interface web)" -ForegroundColor Green
Write-Host "   → C'est le plus rapide (30 secondes)" -ForegroundColor White
Write-Host "   → Pas d'installation nécessaire" -ForegroundColor White
Write-Host "   → Fonctionne à coup sûr`n" -ForegroundColor White

Write-Host "Lien direct:" -ForegroundColor Cyan
Write-Host "https://dashboard.render.com/d/dpg-d4b6c015pdvs73ck6rp0`n" -ForegroundColor White

Write-Host "Commande SQL à copier:" -ForegroundColor Cyan
Write-Host "ALTER TABLE device_configurations ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;`n" -ForegroundColor Green

Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

# Copier la commande SQL dans le presse-papier
$sqlCommand = "ALTER TABLE device_configurations ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;"
Set-Clipboard -Value $sqlCommand
Write-Host "✅ Commande SQL copiée dans le presse-papier !" -ForegroundColor Green
Write-Host "   Allez sur Render et faites Ctrl+V pour coller !`n" -ForegroundColor Cyan

