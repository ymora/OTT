# Exécution IMMÉDIATE de la migration GPS sur Render PostgreSQL
# Utilise la connexion .NET PostgreSQL

Write-Host "`n🚀 EXÉCUTION MIGRATION GPS" -ForegroundColor Green
Write-Host "════════════════════════════════════════════`n" -ForegroundColor White

# Connexion PostgreSQL Render
$connString = "Host=dpg-d4b6c015pdvs73ck6rp0-a.frankfurt-postgres.render.com;Port=5432;Database=ott_data;Username=ott_data_user;Password=lxNCXElZadbthGiOgT3cg2Y6JmMeMqUM;SSL Mode=Require;Trust Server Certificate=true"

# Migration SQL
$migrationSql = @"
ALTER TABLE device_configurations 
ADD COLUMN IF NOT EXISTS gps_enabled BOOLEAN DEFAULT false;

UPDATE device_configurations 
SET gps_enabled = false 
WHERE gps_enabled IS NULL;

SELECT COUNT(*) as total_configs FROM device_configurations;
"@

try {
    Write-Host "📡 Connexion à Render PostgreSQL..." -ForegroundColor Cyan
    
    # Charger l'assembly Npgsql si disponible
    Add-Type -Path "C:\Program Files\PackageManagement\NuGet\Packages\Npgsql.6.0.0\lib\net6.0\Npgsql.dll" -ErrorAction Stop
    
    $conn = New-Object Npgsql.NpgsqlConnection($connString)
    $conn.Open()
    
    Write-Host "✅ Connecté à la base de données`n" -ForegroundColor Green
    Write-Host "🔧 Exécution migration..." -ForegroundColor Yellow
    
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $migrationSql
    $result = $cmd.ExecuteNonQuery()
    
    Write-Host "✅ Migration exécutée avec succès !`n" -ForegroundColor Green
    
    # Vérifier le résultat
    $cmd.CommandText = "SELECT COUNT(*) FROM device_configurations WHERE gps_enabled IS NOT NULL"
    $count = $cmd.ExecuteScalar()
    
    Write-Host "📊 Résultat:" -ForegroundColor Cyan
    Write-Host "  • Configurations mises à jour: $count" -ForegroundColor White
    Write-Host "`n✅ GPS est maintenant disponible !" -ForegroundColor Green
    
    $conn.Close()
    
} catch {
    Write-Host "`n❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`n⚠️ Npgsql pas installé ou erreur connexion" -ForegroundColor Yellow
    Write-Host "`nEXÉCUTION MANUELLE REQUISE:" -ForegroundColor Cyan
    Write-Host "1. https://dashboard.render.com" -ForegroundColor White
    Write-Host "2. PostgreSQL → Shell" -ForegroundColor White
    Write-Host "3. Copier/coller:`n" -ForegroundColor White
    Write-Host $migrationSql -ForegroundColor Gray
    Write-Host "`n4. Exécuter (Entrée)" -ForegroundColor White
}

Write-Host "`n════════════════════════════════════════════`n" -ForegroundColor White

