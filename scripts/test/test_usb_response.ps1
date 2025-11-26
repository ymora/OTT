# Script de test pour vérifier si le firmware répond à la commande "usb"
# Simule exactement ce que fait le code JavaScript

$portName = "COM3"
$baudRate = 115200

Write-Host "=== Test réponse firmware à la commande 'usb' ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier si le port existe
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports -notcontains $portName) {
    Write-Host "ERREUR: Port $portName introuvable" -ForegroundColor Red
    Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Port $portName trouvé" -ForegroundColor Green
Write-Host ""

# Créer et ouvrir le port
$port = New-Object System.IO.Ports.SerialPort
$port.PortName = $portName
$port.BaudRate = $baudRate
$port.Parity = [System.IO.Ports.Parity]::None
$port.DataBits = 8
$port.StopBits = [System.IO.Ports.StopBits]::One
$port.ReadTimeout = 1000
$port.WriteTimeout = 5000

try {
    Write-Host "[1/4] Ouverture du port..." -ForegroundColor Cyan
    $port.Open()
    Write-Host "✅ Port ouvert" -ForegroundColor Green
    Write-Host ""
    
    # Attendre un peu pour que le port soit stable
    Start-Sleep -Milliseconds 300
    
    # Lire les données initiales (logs de boot) pendant 2 secondes
    Write-Host "[2/4] Lecture des données initiales (logs de boot, 2 secondes)..." -ForegroundColor Cyan
    $initialData = ""
    $startTime = Get-Date
    while ((Get-Date) -lt $startTime.AddSeconds(2)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $initialData += $chunk
            if ($chunk.Length -gt 0) {
                Write-Host "  Reçu: $($chunk.Length) caractères" -ForegroundColor Gray
            }
        }
        Start-Sleep -Milliseconds 100
    }
    
    if ($initialData.Length -gt 0) {
        Write-Host "✅ Données initiales reçues: $($initialData.Length) caractères" -ForegroundColor Green
        Write-Host "   Aperçu: $($initialData.Substring(0, [Math]::Min(100, $initialData.Length)))..." -ForegroundColor Gray
    } else {
        Write-Host "⚠️ Aucune donnée initiale reçue" -ForegroundColor Yellow
    }
    Write-Host ""
    
    # Attendre 500ms (comme dans le code)
    Write-Host "[3/4] Attente 500ms (comme dans le code)..." -ForegroundColor Cyan
    Start-Sleep -Milliseconds 500
    
    # Envoyer la commande "usb\n"
    Write-Host "[4/4] Envoi de la commande 'usb\n'..." -ForegroundColor Cyan
    $command = "usb`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($command)
    
    try {
        $bytesWritten = $port.Write($bytes, 0, $bytes.Length)
        Write-Host "✅ Commande envoyée: $bytesWritten bytes" -ForegroundColor Green
        Write-Host "   Contenu: '$command' (hex: $($bytes | ForEach-Object { $_.ToString('X2') } | Join-String -Separator ' '))" -ForegroundColor Gray
        Write-Host ""
    } catch {
        Write-Host "❌ ERREUR lors de l'écriture: $($_.Exception.Message)" -ForegroundColor Red
        $port.Close()
        exit 1
    }
    
    # Lire les données après l'envoi de la commande (10 secondes)
    Write-Host "📡 Lecture des données après commande 'usb' (10 secondes)..." -ForegroundColor Cyan
    Write-Host "   (Le firmware devrait commencer à envoyer des données en continu)" -ForegroundColor Gray
    Write-Host ""
    
    $responseData = ""
    $startTime = Get-Date
    $lastDataTime = $startTime
    $lineCount = 0
    
    while ((Get-Date) -lt $startTime.AddSeconds(10)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $responseData += $chunk
            $lastDataTime = Get-Date
            $lineCount++
            
            # Afficher chaque ligne reçue
            $lines = $chunk -split "`r?`n"
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed.Length -gt 0) {
                    $timestamp = Get-Date -Format "HH:mm:ss.fff"
                    Write-Host "[$timestamp] $trimmed" -ForegroundColor White
                }
            }
        } else {
            # Si pas de données depuis 2 secondes, afficher un message
            $elapsed = (Get-Date) - $lastDataTime
            if ($elapsed.TotalSeconds -gt 2 -and $responseData.Length -eq 0) {
                Write-Host "   ⏳ En attente de données..." -ForegroundColor Gray
                $lastDataTime = Get-Date
            }
        }
        Start-Sleep -Milliseconds 50
    }
    
    $port.Close()
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Gray
    Write-Host "RÉSUMÉ:" -ForegroundColor Cyan
    Write-Host "  Données initiales: $($initialData.Length) caractères" -ForegroundColor White
    Write-Host "  Données après 'usb': $($responseData.Length) caractères" -ForegroundColor White
    Write-Host "  Lignes reçues: $lineCount" -ForegroundColor White
    Write-Host ""
    
    if ($responseData.Length -gt 0) {
        Write-Host "✅ SUCCESS: Le firmware répond à la commande 'usb'" -ForegroundColor Green
        Write-Host "   Le streaming continu fonctionne !" -ForegroundColor Green
        Write-Host ""
        Write-Host "Dernières lignes reçues:" -ForegroundColor Cyan
        $lastLines = ($responseData -split "`r?`n")[-10..-1]
        foreach ($line in $lastLines) {
            if ($line.Trim().Length -gt 0) {
                Write-Host "  $line" -ForegroundColor White
            }
        }
        exit 0
    } else {
        Write-Host "❌ ERREUR: Aucune donnée reçue après l'envoi de 'usb'" -ForegroundColor Red
        Write-Host ""
        Write-Host "Causes possibles:" -ForegroundColor Yellow
        Write-Host "  1. Le firmware n'a pas reçu la commande (vérifiez le câble USB)" -ForegroundColor Yellow
        Write-Host "  2. Le firmware ne répond pas à 'usb' (vérifiez le code firmware)" -ForegroundColor Yellow
        Write-Host "  3. Le délai de 3 secondes après boot est dépassé" -ForegroundColor Yellow
        Write-Host "  4. Le firmware envoie des données mais pas immédiatement" -ForegroundColor Yellow
        Write-Host "  5. Le baud rate est incorrect (actuel: $baudRate)" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Vérifications:" -ForegroundColor Cyan
        Write-Host "  - Redémarrez le firmware et réessayez immédiatement" -ForegroundColor White
        Write-Host "  - Vérifiez que le firmware attend bien 'usb' dans les 3 secondes" -ForegroundColor White
        Write-Host "  - Vérifiez les logs du firmware pour voir s'il reçoit la commande" -ForegroundColor White
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
    exit 1
}

