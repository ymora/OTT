# Script simple pour intercepter les logs USB (version simplifiée)
# Usage: .\test_usb_logs_simple.ps1 [COM3] [115200]

param(
    [string]$Port = "COM3",
    [int]$BaudRate = 115200
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INTERCEPTEUR DE LOGS USB (SIMPLE)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Port: $Port" -ForegroundColor White
Write-Host "Baud Rate: $BaudRate" -ForegroundColor White
Write-Host "Appuyez sur Ctrl+C pour arrêter" -ForegroundColor Yellow
Write-Host ""

# Vérifier le port
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports -notcontains $Port) {
    Write-Host "❌ Port $Port introuvable" -ForegroundColor Red
    Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
    exit 1
}

# Ouvrir le port
$serialPort = New-Object System.IO.Ports.SerialPort
$serialPort.PortName = $Port
$serialPort.BaudRate = $BaudRate
$serialPort.Parity = [System.IO.Ports.Parity]::None
$serialPort.DataBits = 8
$serialPort.StopBits = [System.IO.Ports.StopBits]::One
$serialPort.ReadTimeout = 1000
$serialPort.DtrEnable = $true
$serialPort.RtsEnable = $true

try {
    $serialPort.Open()
    Write-Host "✅ Port ouvert - En attente de données..." -ForegroundColor Green
    Write-Host ""
    
    $buffer = ""
    $lineCount = 0
    
    while ($true) {
        if ($serialPort.BytesToRead -gt 0) {
            $chunk = $serialPort.ReadExisting()
            $buffer += $chunk
            
            # Traiter les lignes complètes
            while ($buffer -match "`r?`n") {
                $parts = $buffer -split "`r?`n", 2
                $line = $parts[0]
                $buffer = if ($parts.Count -gt 1) { $parts[1] } else { "" }
                
                $trimmed = $line.Trim()
                if ($trimmed.Length -gt 0) {
                    $lineCount++
                    $timestamp = Get-Date -Format "HH:mm:ss.fff"
                    
                    # Colorer selon le type
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
} catch {
    Write-Host ""
    Write-Host "❌ Erreur: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($serialPort.IsOpen) {
        $serialPort.Close()
        Write-Host ""
        Write-Host "✅ Port fermé - $lineCount lignes reçues" -ForegroundColor Green
    }
}

