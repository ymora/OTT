# Script de test pour simuler exactement ce que fait le code JavaScript
# Simule: connect() -> startReading() -> write('usb\n')

$portName = "COM3"
$baudRate = 115200

Write-Host "=== Simulation du comportement JavaScript ===" -ForegroundColor Cyan
Write-Host "1. connect() - Ouvrir le port" -ForegroundColor Yellow
Write-Host "2. startReading() - Démarrer la lecture" -ForegroundColor Yellow
Write-Host "3. write('usb\n') - Envoyer la commande" -ForegroundColor Yellow
Write-Host ""

try {
    # Vérifier si le port existe
    $ports = [System.IO.Ports.SerialPort]::GetPortNames()
    if ($ports -notcontains $portName) {
        Write-Host "ERREUR: Port $portName introuvable" -ForegroundColor Red
        Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "[1/3] Ouverture du port $portName..." -ForegroundColor Cyan
    
    # Simuler connect() - Ouvrir le port
    $port = New-Object System.IO.Ports.SerialPort
    $port.PortName = $portName
    $port.BaudRate = $baudRate
    $port.Parity = [System.IO.Ports.Parity]::None
    $port.DataBits = 8
    $port.StopBits = [System.IO.Ports.StopBits]::One
    $port.ReadTimeout = 5000
    $port.WriteTimeout = 5000
    
    try {
        $port.Open()
        Write-Host "✅ Port ouvert avec succès" -ForegroundColor Green
    } catch {
        Write-Host "❌ ERREUR ouverture port: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Le port est peut-être déjà utilisé par le navigateur" -ForegroundColor Yellow
        Write-Host "   Fermez l'onglet du navigateur qui utilise le port USB" -ForegroundColor Yellow
        exit 1
    }
    
    # Attendre un peu (comme dans le code: 300ms)
    Write-Host "[2/3] Attente 300ms (comme dans le code)..." -ForegroundColor Cyan
    Start-Sleep -Milliseconds 300
    
    # Vérifier que le port est ouvert (comme port.readable && port.writable)
    if (-not $port.IsOpen) {
        Write-Host "❌ ERREUR: Port non ouvert après connect()" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Port vérifié: IsOpen=$($port.IsOpen)" -ForegroundColor Green
    
    # Simuler startReading() - Démarrer la lecture en arrière-plan
    Write-Host "[3/3] Démarrage de la lecture (simulation startReading)..." -ForegroundColor Cyan
    
    # Lire les données initiales (logs de boot) pendant 2 secondes
    $initialData = ""
    $readJob = Start-Job -ScriptBlock {
        param($portName, $baudRate)
        $p = New-Object System.IO.Ports.SerialPort
        $p.PortName = $portName
        $p.BaudRate = $baudRate
        $p.Parity = [System.IO.Ports.Parity]::None
        $p.DataBits = 8
        $p.StopBits = [System.IO.Ports.StopBits]::One
        $p.ReadTimeout = 1000
        $p.Open()
        
        $data = ""
        $start = Get-Date
        while ((Get-Date) -lt $start.AddSeconds(10)) {
            if ($p.BytesToRead -gt 0) {
                $data += $p.ReadExisting()
            }
            Start-Sleep -Milliseconds 100
        }
        $p.Close()
        return $data
    } -ArgumentList $portName, $baudRate
    
    # Attendre 200ms (comme dans le code avant write)
    Write-Host "   Attente 200ms avant envoi commande (comme dans le code)..." -ForegroundColor Gray
    Start-Sleep -Milliseconds 200
    
    # Simuler write('usb\n')
    Write-Host "[4/4] Envoi de la commande 'usb\n'..." -ForegroundColor Cyan
    
    try {
        $command = "usb`n"
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($command)
        $bytesWritten = $port.Write($bytes, 0, $bytes.Length)
        Write-Host "✅ Commande envoyée: $bytesWritten bytes écrits" -ForegroundColor Green
        Write-Host "   Contenu: '$command' (hex: $($bytes | ForEach-Object { $_.ToString('X2') } | Join-String -Separator ' '))" -ForegroundColor Gray
    } catch {
        Write-Host "❌ ERREUR lors de l'écriture: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Vérifiez que le port est bien ouvert et accessible en écriture" -ForegroundColor Yellow
        $port.Close()
        exit 1
    }
    
    # Attendre un peu pour voir la réponse
    Write-Host "`nAttente de la réponse du firmware (5 secondes)..." -ForegroundColor Cyan
    Start-Sleep -Seconds 5
    
    # Lire les données après l'envoi
    $responseData = ""
    $startTime = Get-Date
    while ((Get-Date) -lt $startTime.AddSeconds(5)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $responseData += $chunk
            Write-Host "Reçu: $($chunk.Length) caractères" -ForegroundColor Yellow
            $lines = $chunk -split "`n"
            foreach ($line in $lines) {
                if ($line.Trim().Length -gt 0) {
                    Write-Host "  > $line" -ForegroundColor White
                }
            }
        }
        Start-Sleep -Milliseconds 100
    }
    
    $port.Close()
    
    # Récupérer les données du job de lecture
    $readData = Receive-Job -Job $readJob
    Remove-Job -Job $readJob
    
    Write-Host "`n========================================" -ForegroundColor Gray
    Write-Host "RÉSUMÉ:" -ForegroundColor Cyan
    Write-Host "  Commande envoyée: ✅" -ForegroundColor Green
    Write-Host "  Données reçues après 'usb': $($responseData.Length) caractères" -ForegroundColor White
    
    if ($responseData.Length -gt 0) {
        Write-Host "`n✅ SUCCESS: Le firmware répond à la commande 'usb'" -ForegroundColor Green
        Write-Host "`nDernières lignes reçues:" -ForegroundColor Cyan
        $lastLines = ($responseData -split "`n")[-5..-1]
        foreach ($line in $lastLines) {
            if ($line.Trim().Length -gt 0) {
                Write-Host "  $line" -ForegroundColor White
            }
        }
        exit 0
    } else {
        Write-Host "`n⚠️ ATTENTION: Aucune donnée reçue après l'envoi de 'usb'" -ForegroundColor Yellow
        Write-Host "  Causes possibles:" -ForegroundColor Yellow
        Write-Host "  - Le firmware n'a pas reçu la commande (vérifiez le câble)" -ForegroundColor Yellow
        Write-Host "  - Le firmware ne répond pas à 'usb' (vérifiez le code firmware)" -ForegroundColor Yellow
        Write-Host "  - Le délai de 3 secondes après boot est dépassé" -ForegroundColor Yellow
        Write-Host "  - Le firmware envoie des données mais pas immédiatement" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "`n❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Stack trace: $($_.ScriptStackTrace)" -ForegroundColor Gray
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
    exit 1
}

