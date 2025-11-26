# Script de test pour verifier si COM3 emet des donnees
$portName = "COM3"
$baudRate = 115200

Write-Host "Test du port $portName a $baudRate bauds..." -ForegroundColor Cyan

try {
    # Verifier si le port existe
    $ports = [System.IO.Ports.SerialPort]::GetPortNames()
    if ($ports -notcontains $portName) {
        Write-Host "ERREUR: Port $portName introuvable" -ForegroundColor Red
        Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "SUCCESS: Port $portName trouve" -ForegroundColor Green
    
    # Creer et ouvrir le port
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
    
    # Attendre un peu pour que les donnees arrivent
    Write-Host "Attente de donnees (5 secondes)..." -ForegroundColor Cyan
    Start-Sleep -Seconds 1
    
    $totalData = ""
    $startTime = Get-Date
    $timeout = 5 # secondes
    
    while ((Get-Date) -lt $startTime.AddSeconds($timeout)) {
        if ($port.BytesToRead -gt 0) {
            $chunk = $port.ReadExisting()
            $totalData += $chunk
            $chunkLength = $chunk.Length
            Write-Host "Recu: $chunkLength caracteres" -ForegroundColor Yellow
            $preview = if ($chunk.Length -gt 100) { $chunk.Substring(0, 100) } else { $chunk }
            Write-Host "   Contenu: $preview" -ForegroundColor Gray
        }
        Start-Sleep -Milliseconds 100
    }
    
    $port.Close()
    
    if ($totalData.Length -gt 0) {
        Write-Host ""
        Write-Host "SUCCESS: DONNEES RECUES ($($totalData.Length) caracteres):" -ForegroundColor Green
        Write-Host "----------------------------------------" -ForegroundColor Gray
        Write-Host $totalData -ForegroundColor White
        Write-Host "----------------------------------------" -ForegroundColor Gray
        Write-Host "SUCCESS: Le dispositif emet bien sur $portName" -ForegroundColor Green
        exit 0
    } else {
        Write-Host ""
        Write-Host "ERREUR: AUCUNE DONNEE RECUE" -ForegroundColor Red
        Write-Host "   Le port est ouvert mais aucune donnee n'a ete recue." -ForegroundColor Yellow
        Write-Host "   Verifiez que:" -ForegroundColor Yellow
        Write-Host "   - Le dispositif est bien connecte" -ForegroundColor Yellow
        Write-Host "   - Le firmware envoie des donnees" -ForegroundColor Yellow
        Write-Host "   - Le baud rate est correct ($baudRate)" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    if ($port -and $port.IsOpen) {
        $port.Close()
    }
    exit 1
}
