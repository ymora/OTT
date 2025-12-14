# Script de diagnostic pour les logs USB
# Vérifie la connexion USB et les logs dans la page dispositifs

Write-Host "🔍 Diagnostic des logs USB" -ForegroundColor Cyan
Write-Host "=========================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si Chrome/Edge est en cours d'exécution
Write-Host "1. Vérification des navigateurs..." -ForegroundColor Yellow
$chromeProcesses = Get-Process -Name chrome,msedge -ErrorAction SilentlyContinue
if ($chromeProcesses) {
    Write-Host "   ✅ Navigateur détecté: $($chromeProcesses.Count) processus" -ForegroundColor Green
    $chromeProcesses | ForEach-Object {
        Write-Host "      - $($_.ProcessName) (PID: $($_.Id))" -ForegroundColor Gray
    }
} else {
    Write-Host "   ⚠️  Aucun navigateur Chrome/Edge détecté" -ForegroundColor Yellow
    Write-Host "      Les ports USB nécessitent Chrome/Edge avec Web Serial API" -ForegroundColor Gray
}

Write-Host ""

# Vérifier les ports COM disponibles
Write-Host "2. Vérification des ports COM..." -ForegroundColor Yellow
try {
    $ports = Get-WmiObject -Class Win32_SerialPort | Select-Object DeviceID, Description, Name
    if ($ports) {
        Write-Host "   ✅ Ports COM détectés:" -ForegroundColor Green
        $ports | ForEach-Object {
            $portName = $_.DeviceID
            $description = $_.Description
            Write-Host "      - $portName : $description" -ForegroundColor Gray
        }
        
        # Vérifier spécifiquement COM3
        $com3 = $ports | Where-Object { $_.DeviceID -eq "COM3" }
        if ($com3) {
            Write-Host "   ✅ COM3 trouvé: $($com3.Description)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️  COM3 non trouvé dans la liste des ports" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  Aucun port COM détecté" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Erreur lors de la vérification des ports COM: $_" -ForegroundColor Red
}

Write-Host ""

# Vérifier les processus qui utilisent les ports COM
Write-Host "3. Vérification des processus utilisant les ports COM..." -ForegroundColor Yellow
try {
    # Utiliser netstat pour voir les connexions (peut ne pas fonctionner pour les ports série)
    Write-Host "   ℹ️  Les ports série ne sont pas visibles via netstat" -ForegroundColor Gray
    Write-Host "      Utilisez le Gestionnaire de périphériques Windows pour vérifier" -ForegroundColor Gray
} catch {
    Write-Host "   ⚠️  Impossible de vérifier les connexions COM" -ForegroundColor Yellow
}

Write-Host ""

# Instructions pour le débogage
Write-Host "4. Instructions de débogage:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Pour vérifier les logs USB dans le navigateur:" -ForegroundColor Cyan
Write-Host "   1. Ouvrez Chrome/Edge et allez sur http://localhost:3000/dashboard/devices" -ForegroundColor White
Write-Host "   2. Ouvrez la console du navigateur (F12)" -ForegroundColor White
Write-Host "   3. Filtrez les logs avec: [USB] ou [SerialPortManager]" -ForegroundColor White
Write-Host "   4. Vérifiez si le port COM3 est détecté et connecté" -ForegroundColor White
Write-Host "   5. Vérifiez si le streaming USB est démarré (usbStreamStatus)" -ForegroundColor White
Write-Host ""
Write-Host "   Commandes à exécuter dans la console du navigateur:" -ForegroundColor Cyan
Write-Host "   - localStorage.getItem('ott_token') // Vérifier le token" -ForegroundColor White
Write-Host "   - window.navigator.serial // Vérifier le support Web Serial API" -ForegroundColor White
Write-Host ""

# Vérifier les logs du serveur Next.js
Write-Host "5. Vérification des logs du serveur Next.js..." -ForegroundColor Yellow
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    Write-Host "   ✅ Processus Node.js détectés: $($nodeProcesses.Count)" -ForegroundColor Green
    Write-Host "      Vérifiez la console du serveur pour les erreurs" -ForegroundColor Gray
} else {
    Write-Host "   ⚠️  Aucun processus Node.js détecté" -ForegroundColor Yellow
    Write-Host "      Le serveur Next.js n'est peut-être pas démarré" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ Diagnostic terminé" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Points à vérifier:" -ForegroundColor Cyan
Write-Host "   - Le dispositif USB est bien branché" -ForegroundColor White
Write-Host "   - Le port COM3 est visible dans le Gestionnaire de périphériques" -ForegroundColor White
Write-Host "   - Chrome/Edge est utilisé (pas Firefox/Safari)" -ForegroundColor White
Write-Host "   - Le streaming USB est démarré dans l'onglet '⚡ Streaming USB'" -ForegroundColor White
Write-Host "   - La console du navigateur ne montre pas d'erreurs" -ForegroundColor White

