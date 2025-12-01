# Script pour trouver le port USB actif et écouter les données
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  RECHERCHE ET ÉCOUTE DU PORT USB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Lister tous les ports disponibles
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
Write-Host ""

# Tester chaque port pour trouver celui qui envoie des données
foreach ($portName in $ports) {
    Write-Host "Test du port $portName..." -ForegroundColor Cyan
    
    try {
        $port = New-Object System.IO.Ports.SerialPort
        $port.PortName = $portName
        $port.BaudRate = 115200
        $port.Parity = [System.IO.Ports.Parity]::None
        $port.DataBits = 8
        $port.StopBits = [System.IO.Ports.StopBits]::One
        $port.ReadTimeout = 2000
        $port.DtrEnable = $true
        $port.RtsEnable = $true
        
        $port.Open()
        Write-Host "  ✅ Port $portName ouvert" -ForegroundColor Green
        
        # Attendre 2 secondes pour voir si des données arrivent
        Start-Sleep -Seconds 2
        
        if ($port.BytesToRead -gt 0) {
            $data = $port.ReadExisting()
            Write-Host "  DONNEES RECUES sur $portName !" -ForegroundColor Green
            Write-Host "  Apercu: $($data.Substring(0, [Math]::Min(100, $data.Length)))" -ForegroundColor White
            $port.Close()
            
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host "Port actif trouve: $portName" -ForegroundColor Green
            Write-Host "Demarrage de l'ecoute continue..." -ForegroundColor Yellow
            Write-Host "Appuyez sur Ctrl+C pour arreter" -ForegroundColor Yellow
            Write-Host "========================================" -ForegroundColor Cyan
            Write-Host ""
            
            # Rouvrir le port pour l'écoute continue
            $port.Open()
            $buffer = ""
            
            while ($true) {
                if ($port.BytesToRead -gt 0) {
                    $chunk = $port.ReadExisting()
                    $buffer += $chunk
                    
                    while ($buffer -match "`r?`n") {
                        $parts = $buffer -split "`r?`n", 2
                        $line = $parts[0]
                        $buffer = if ($parts.Count -gt 1) { $parts[1] } else { "" }
                        
                        $trimmed = $line.Trim()
                        if ($trimmed.Length -gt 0) {
                            $timestamp = Get-Date -Format "HH:mm:ss.fff"
                            if ($trimmed.StartsWith("{")) {
                                Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
                                Write-Host $trimmed -ForegroundColor Yellow
                            } else {
                                Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
                                Write-Host $trimmed -ForegroundColor White
                            }
                        }
                    }
                }
                Start-Sleep -Milliseconds 10
            }
            
        } else {
            Write-Host "  ⚠️  Aucune donnée sur $portName" -ForegroundColor Yellow
            $port.Close()
        }
    } catch {
        if ($_.Exception.Message -match "refuse|refused|acces|access") {
            Write-Host "  Port $portName deja utilise" -ForegroundColor Red
        } else {
            Write-Host "  Erreur: $($_.Exception.Message)" -ForegroundColor Red
        }
        if ($port -and $port.IsOpen) {
            $port.Close()
        }
    }
    
    Write-Host ""
}

Write-Host "Aucun port actif trouve." -ForegroundColor Yellow
Write-Host "Verifiez que:" -ForegroundColor Yellow
Write-Host "  - Le dispositif USB est connecte" -ForegroundColor White
Write-Host "  - Le firmware envoie des donnees" -ForegroundColor White
Write-Host "  - Aucune autre application n'utilise le port" -ForegroundColor White

