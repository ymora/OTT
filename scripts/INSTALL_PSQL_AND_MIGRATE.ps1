# ═══════════════════════════════════════════════════════════════
# SCRIPT AUTOMATIQUE - Installation PostgreSQL + Migration GPS
# ═══════════════════════════════════════════════════════════════
# Ce script:
# 1. Vérifie si psql est installé
# 2. Si non, l'installe automatiquement
# 3. Exécute la migration GPS sur Render
# ═══════════════════════════════════════════════════════════════

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  INSTALLATION PSQL + MIGRATION GPS AUTO" -ForegroundColor White
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

# ═══════════════════════════════════════════════════════════════
# ÉTAPE 1: Vérifier si psql est installé
# ═══════════════════════════════════════════════════════════════

Write-Host "🔍 Vérification psql..." -ForegroundColor Yellow

$psqlPath = $null
try {
    $psqlPath = (Get-Command psql -ErrorAction Stop).Source
    Write-Host "✅ psql trouvé: $psqlPath`n" -ForegroundColor Green
    $needsInstall = $false
} catch {
    Write-Host "❌ psql non installé`n" -ForegroundColor Red
    $needsInstall = $true
}

# ═══════════════════════════════════════════════════════════════
# ÉTAPE 2: Installation psql si nécessaire
# ═══════════════════════════════════════════════════════════════

if ($needsInstall) {
    Write-Host "📦 Installation PostgreSQL Client..." -ForegroundColor Cyan
    Write-Host "   Méthode: Chocolatey (gestionnaire de paquets Windows)`n" -ForegroundColor Gray
    
    # Vérifier si Chocolatey est installé
    try {
        $chocoPath = (Get-Command choco -ErrorAction Stop).Source
        Write-Host "✅ Chocolatey trouvé: $chocoPath`n" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Chocolatey non installé. Installation..." -ForegroundColor Yellow
        
        # Installer Chocolatey
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        
        try {
            Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
            Write-Host "✅ Chocolatey installé`n" -ForegroundColor Green
        } catch {
            Write-Host "❌ Erreur installation Chocolatey: $($_.Exception.Message)`n" -ForegroundColor Red
            Write-Host "SOLUTION ALTERNATIVE:" -ForegroundColor Yellow
            Write-Host "  1. Télécharger PostgreSQL: https://www.postgresql.org/download/windows/" -ForegroundColor White
            Write-Host "  2. Installer seulement 'Command Line Tools'" -ForegroundColor White
            Write-Host "  3. Relancer ce script`n" -ForegroundColor White
            exit 1
        }
    }
    
    # Installer PostgreSQL client
    Write-Host "📥 Installation PostgreSQL client..." -ForegroundColor Cyan
    Write-Host "   (Cela peut prendre 2-3 minutes)`n" -ForegroundColor Gray
    
    try {
        choco install postgresql --version=15.3.0 -y --force
        
        # Rafraîchir PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        # Vérifier installation
        $psqlPath = (Get-Command psql -ErrorAction Stop).Source
        Write-Host "`n✅ PostgreSQL client installé: $psqlPath`n" -ForegroundColor Green
        
    } catch {
        Write-Host "`n❌ Erreur installation PostgreSQL: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`nSOLUTION MANUELLE:" -ForegroundColor Yellow
        Write-Host "  Exécutez dans PowerShell (admin):" -ForegroundColor White
        Write-Host "  choco install postgresql -y`n" -ForegroundColor Cyan
        exit 1
    }
}

# ═══════════════════════════════════════════════════════════════
# ÉTAPE 3: Exécution migration GPS
# ═══════════════════════════════════════════════════════════════

Write-Host "🚀 EXÉCUTION MIGRATION GPS SUR RENDER" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

# URL de connexion Render
$dbUrl = "postgresql://ott_data_user:lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM@dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com/ott_data"

# SQL de migration
$migrationSql = @"
ALTER TABLE device_configurations 
ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;

UPDATE device_configurations 
SET gps_enabled = false 
WHERE gps_enabled IS NULL;

SELECT 
    COUNT(*) as total_configs,
    SUM(CASE WHEN gps_enabled THEN 1 ELSE 0 END) as gps_enabled_count
FROM device_configurations;
"@

Write-Host "📡 Connexion à Render PostgreSQL..." -ForegroundColor Cyan
Write-Host "   Host: dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com" -ForegroundColor Gray
Write-Host "   Database: ott_data`n" -ForegroundColor Gray

try {
    # Exécuter via psql
    $migrationSql | & psql $dbUrl
    
    Write-Host "`n✅ MIGRATION EXÉCUTÉE AVEC SUCCÈS !`n" -ForegroundColor Green
    
    Write-Host "═══════════════════════════════════════════" -ForegroundColor Green
    Write-Host "  GPS EST MAINTENANT DISPONIBLE ! 🎉" -ForegroundColor White
    Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Green
    
    Write-Host "Prochaines étapes:" -ForegroundColor Cyan
    Write-Host "  1. Décommenter GPS toggle dans DeviceModal.js" -ForegroundColor White
    Write-Host "  2. git commit + push" -ForegroundColor White
    Write-Host "  3. Attendre déploiement Render (2 min)" -ForegroundColor White
    Write-Host "  4. F5 dashboard" -ForegroundColor White
    Write-Host "  5. GPS fonctionne ! ✅`n" -ForegroundColor Green
    
} catch {
    Write-Host "`n❌ Erreur exécution migration:" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)`n" -ForegroundColor White
    
    Write-Host "SOLUTION ALTERNATIVE:" -ForegroundColor Yellow
    Write-Host "  Exécutez manuellement:" -ForegroundColor White
    Write-Host "  psql '$dbUrl' -c `"$migrationSql`"`n" -ForegroundColor Cyan
    
    exit 1
}

Write-Host "═══════════════════════════════════════════`n" -ForegroundColor Cyan

