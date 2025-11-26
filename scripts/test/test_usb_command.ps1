# Script de test pour envoyer la commande "usb" au port COM3
$portName = "COM3"
$baudRate = 115200

Write-Host "Test envoi commande 'usb' sur $portName à $baudRate bauds..." -ForegroundColor Cyan

try {
    # Vérifier si le port existe
    $ports = [System.IO.Ports.SerialPort]::GetPortNames()
    if ($ports -notcontains $portName) {
        Write-Host "ERREUR: Port $portName introuvable" -ForegroundColor Red
        Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "SUCCESS: Port $portName trouvé" -ForegroundColor Green
    
    # Créer et ouvrir le port
    $port = New-Object System.IO.Ports.SerialPort
    $port.PortName = $portName
    $port.BaudRate = $baudRate
    $port.Parity = [System.IO.Ports.Parity]::None
    $port.DataBits = 8
    $port.StopBits = [System.IO.Ports.StopBits]::One
    $port.ReadTimeout = 5000
    $port.WriteTimeout = 5000
    
    Write-Host "Ouverture du port..." -ForegroundColor Cyan
    $port.Open()
    Write-Host "SUCCESS: Port ouvert" -ForegroundColor Green
    
    # Attendre un peu pour que le port soit stable
    Start-Sleep -Milliseconds 500
    
    # Lire les données initiales (logs de boot)
    Write-Host "Lecture des données initiales (2 secondes)..." -ForegroundColor Cyan
    $initialData = ""
    $startTime = Get-Date
    while ((Get-Date) -lt $startTime.AddSeconds(2)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $initialData += $chunk
            Write-Host "Reçu: $($chunk.Length) caractères" -ForegroundColor Gray
        }
        Start-Sleep -Milliseconds 100
    }
    
    if ($initialData.Length -gt 0) {
        Write-Host "Données initiales reçues: $($initialData.Length) caractères" -ForegroundColor Green
        Write-Host "Aperçu: $($initialData.Substring(0, [Math]::Min(200, $initialData.Length)))" -ForegroundColor Gray
    }
    
    # Envoyer la commande "usb\n"
    Write-Host "`nEnvoi de la commande 'usb'..." -ForegroundColor Cyan
    $command = "usb`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($command)
    $port.Write($bytes, 0, $bytes.Length)
    Write-Host "SUCCESS: Commande 'usb' envoyée ($($bytes.Length) bytes)" -ForegroundColor Green
    
    # Attendre un peu
    Start-Sleep -Milliseconds 200
    
    # Lire les données après l'envoi de la commande
    Write-Host "`nLecture des données après commande 'usb' (10 secondes)..." -ForegroundColor Cyan
    $streamingData = ""
    $startTime = Get-Date
    $lastDataTime = $startTime
    
    while ((Get-Date) -lt $startTime.AddSeconds(10)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $streamingData += $chunk
            $lastDataTime = Get-Date
            Write-Host "Reçu: $($chunk.Length) caractères" -ForegroundColor Yellow
            # Afficher les dernières lignes
            $lines = $chunk -split "`n"
            foreach ($line in $lines) {
                if ($line.Trim().Length -gt 0) {
                    Write-Host "  $line" -ForegroundColor White
                }
            }
        } else {
            # Si pas de données depuis 2 secondes, vérifier
            if ((Get-Date) -gt $lastDataTime.AddSeconds(2)) {
                Write-Host "Aucune donnée depuis 2 secondes..." -ForegroundColor Gray
            }
        }
        Start-Sleep -Milliseconds 100
    }
    
    $port.Close()
    
    Write-Host "`n========================================" -ForegroundColor Gray
    Write-Host "RÉSUMÉ:" -ForegroundColor Cyan
    Write-Host "  Données initiales: $($initialData.Length) caractères" -ForegroundColor White
    Write-Host "  Données après 'usb': $($streamingData.Length) caractères" -ForegroundColor White
    
    if ($streamingData.Length -gt 0) {
        Write-Host "`nSUCCESS: Le firmware répond bien à la commande 'usb'" -ForegroundColor Green
        Write-Host "`nDernières données reçues:" -ForegroundColor Cyan
        $lastLines = ($streamingData -split "`n")[-10..-1]
        foreach ($line in $lastLines) {
            if ($line.Trim().Length -gt 0) {
                Write-Host "  $line" -ForegroundColor White
            }
        }
        exit 0
    } else {
        Write-Host "`nERREUR: Aucune donnée reçue après l'envoi de 'usb'" -ForegroundColor Red
        Write-Host "  Vérifiez que:" -ForegroundColor Yellow
        Write-Host "  - Le firmware est bien démarré" -ForegroundColor Yellow
        Write-Host "  - La commande est envoyée dans les 3 secondes après le boot" -ForegroundColor Yellow
        Write-Host "  - Le firmware supporte la commande 'usb'" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "`nERREUR: $($_.Exception.Message)" -ForegroundColor Red
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
    exit 1
}

