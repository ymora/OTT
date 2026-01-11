# Script simple pour démarrer le serveur PHP API
Write-Host "Démarrage du serveur API PHP sur le port 8080..."

# Vérifier si le port 8080 est utilisé
$port8080 = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
if ($port8080) {
    Write-Host "Arrêt des processus utilisant le port 8080..."
    $port8080 | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Démarrer le serveur PHP
try {
    Start-Process powershell -ArgumentList "-Command", "php -S localhost:8080 api.php" -WorkingDirectory (Get-Location) -WindowStyle Hidden
    Write-Host "✅ API PHP démarrée sur http://localhost:8080"
    Write-Host "✅ Dashboard Next.js sur http://localhost:3000"
    Write-Host ""
    Write-Host "Configuration Docker vs Render:"
    Write-Host "- Docker local: API sur http://localhost:8080 (via docker-compose)"
    Write-Host "- Render production: API sur https://ott-jbln.onrender.com"
    Write-Host "- Mode actuel: Développement local (PHP natif)"
} catch {
    Write-Host "❌ Erreur lors du démarrage: $_"
    Write-Host "Assurez-vous que PHP est installé et disponible dans le PATH"
}

# Garder le script en cours
Read-Host "Appuyez sur Entrée pour arrêter les serveurs"

# Arrêter les processus
Get-Process | Where-Object {$_.ProcessName -eq "php" -and $_.CommandLine -like "*8080*"} | Stop-Process -Force
Write-Host "Serveurs arrêtés"
