# Script de test pour simuler un hyperterminal et tester COM3
# Simule exactement ce que fait le code JavaScript

$portName = "COM3"
$baudRate = 115200

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TEST HYPERTERMINAL - COM3" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si le port existe
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports -notcontains $portName) {
    Write-Host "❌ ERREUR: Port $portName introuvable" -ForegroundColor Red
    Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Port $portName trouvé" -ForegroundColor Green
Write-Host ""

# Créer et configurer le port
$port = New-Object System.IO.Ports.SerialPort
$port.PortName = $portName
$port.BaudRate = $baudRate
$port.Parity = [System.IO.Ports.Parity]::None
$port.DataBits = 8
$port.StopBits = [System.IO.Ports.StopBits]::One
$port.ReadTimeout = 1000
$port.WriteTimeout = 5000
$port.DtrEnable = $true  # Data Terminal Ready
$port.RtsEnable = $true  # Request To Send

try {
    Write-Host "[1/5] Ouverture du port $portName à $baudRate bauds..." -ForegroundColor Cyan
    $port.Open()
    Write-Host "✅ Port ouvert" -ForegroundColor Green
    Write-Host ""
    
    # Attendre un peu pour que le port soit stable
    Start-Sleep -Milliseconds 500
    
    # Lire les données initiales (logs de boot) pendant 3 secondes
    Write-Host "[2/5] Lecture des données initiales (logs de boot, 3 secondes)..." -ForegroundColor Cyan
    $initialData = ""
    $startTime = Get-Date
    $lineCount = 0
    
    while ((Get-Date) -lt $startTime.AddSeconds(3)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $initialData += $chunk
            $lines = $chunk -split "`r?`n"
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed.Length -gt 0) {
                    $lineCount++
                    $timestamp = Get-Date -Format "HH:mm:ss.fff"
                    Write-Host "[$timestamp] $trimmed" -ForegroundColor White
                }
            }
        }
        Start-Sleep -Milliseconds 50
    }
    
    Write-Host ""
    Write-Host "✅ Données initiales: $lineCount lignes, $($initialData.Length) caractères" -ForegroundColor Green
    Write-Host ""
    
    # Attendre 500ms (comme dans le code)
    Write-Host "[3/5] Attente 500ms (comme dans le code JavaScript)..." -ForegroundColor Cyan
    Start-Sleep -Milliseconds 500
    
    # Envoyer la commande "usb\n"
    Write-Host "[4/5] Envoi de la commande 'usb\n'..." -ForegroundColor Cyan
    $command = "usb`n"
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($command)
    
    try {
        $bytesWritten = $port.Write($bytes, 0, $bytes.Length)
        Write-Host "✅ Commande envoyée: $bytesWritten bytes" -ForegroundColor Green
        $hexString = ($bytes | ForEach-Object { $_.ToString('X2') }) -join ' '
        Write-Host "   Hex: $hexString" -ForegroundColor Gray
        Write-Host "   ASCII: '$command'" -ForegroundColor Gray
        Write-Host ""
    } catch {
        Write-Host "❌ ERREUR lors de l'écriture: $($_.Exception.Message)" -ForegroundColor Red
        $port.Close()
        exit 1
    }
    
    # Lire les données après l'envoi de la commande (15 secondes)
    Write-Host "[5/5] Lecture des données après commande 'usb' (15 secondes)..." -ForegroundColor Cyan
    Write-Host "   (Le firmware devrait commencer à envoyer des données en continu)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "--- DÉBUT DES DONNÉES STREAMING ---" -ForegroundColor Yellow
    Write-Host ""
    
    $streamingData = ""
    $startTime = Get-Date
    $lastDataTime = $startTime
    $streamingLineCount = 0
    $lastLine = ""
    
    while ((Get-Date) -lt $startTime.AddSeconds(15)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $streamingData += $chunk
            $lastDataTime = Get-Date
            
            # Afficher chaque ligne reçue en temps réel
            $lines = $chunk -split "`r?`n"
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed.Length -gt 0) {
                    $streamingLineCount++
                    $timestamp = Get-Date -Format "HH:mm:ss.fff"
                    
                    # Détecter le type de ligne
                    if ($trimmed.StartsWith('{')) {
                        # JSON - probablement une mesure
                        Write-Host "[$timestamp] 📊 $trimmed" -ForegroundColor Green
                    } else {
                        # Log texte
                        Write-Host "[$timestamp] 📝 $trimmed" -ForegroundColor White
                    }
                    
                    $lastLine = $trimmed
                }
            }
        } else {
            # Si pas de données depuis 2 secondes, afficher un message
            $elapsed = (Get-Date) - $lastDataTime
            if ($elapsed.TotalSeconds -gt 2 -and $streamingData.Length -eq 0) {
                Write-Host "   ⏳ En attente de données..." -ForegroundColor Gray
                $lastDataTime = Get-Date
            }
        }
        Start-Sleep -Milliseconds 50
    }
    
    $port.Close()
    Write-Host ""
    Write-Host "--- FIN DES DONNÉES STREAMING ---" -ForegroundColor Yellow
    Write-Host ""
    
    # Résumé
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  RÉSUMÉ" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Données initiales (boot):" -ForegroundColor White
    Write-Host "    - Lignes: $lineCount" -ForegroundColor Gray
    Write-Host "    - Caractères: $($initialData.Length)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Données après 'usb':" -ForegroundColor White
    Write-Host "    - Lignes: $streamingLineCount" -ForegroundColor Gray
    Write-Host "    - Caractères: $($streamingData.Length)" -ForegroundColor Gray
    Write-Host ""
    
    if ($streamingData.Length -gt 0) {
        Write-Host "✅ SUCCESS: Le firmware répond à la commande 'usb' !" -ForegroundColor Green
        Write-Host "   Le streaming continu fonctionne correctement." -ForegroundColor Green
        Write-Host ""
        Write-Host "Dernières lignes reçues:" -ForegroundColor Cyan
        $lastLines = ($streamingData -split "`r?`n")[-5..-1]
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
        Write-Host "  4. Le baud rate est incorrect (actuel: $baudRate)" -ForegroundColor Yellow
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
    Write-Host "   Type: $($_.Exception.GetType().Name)" -ForegroundColor Gray
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
    exit 1
}

