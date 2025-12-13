# Script de test de communication firmware via port serie
# Usage: .\scripts\test_firmware_com.ps1 -Port COM3

param(
    [string]$Port = "COM3",
    [int]$TimeoutSeconds = 10
)

Write-Host "=== Test Communication Firmware ===" -ForegroundColor Cyan
Write-Host "Port: $Port" -ForegroundColor Yellow
Write-Host "Timeout: $TimeoutSeconds secondes" -ForegroundColor Yellow
Write-Host ""

# Verifier si le port existe
$portExists = [System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -eq $Port }
if (-not $portExists) {
    Write-Host "ERREUR: Port $Port introuvable !" -ForegroundColor Red
    Write-Host "Ports disponibles:" -ForegroundColor Yellow
    [System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    exit 1
}

# Creer le port serie
$serialPort = New-Object System.IO.Ports.SerialPort
$serialPort.PortName = $Port
$serialPort.BaudRate = 115200
$serialPort.Parity = [System.IO.Ports.Parity]::None
$serialPort.DataBits = 8
$serialPort.StopBits = [System.IO.Ports.StopBits]::One
$serialPort.Handshake = [System.IO.Ports.Handshake]::None
$serialPort.ReadTimeout = 1000
$serialPort.WriteTimeout = 1000

try {
    Write-Host "Ouverture du port $Port..." -ForegroundColor Yellow
    $serialPort.Open()
    Write-Host "OK: Port ouvert avec succes" -ForegroundColor Green
    Write-Host ""
    
    # Lire les donnees existantes (vider le buffer)
    Start-Sleep -Milliseconds 500
    $buffer = ""
    while ($serialPort.BytesToRead -gt 0) {
        $buffer += $serialPort.ReadExisting()
        Start-Sleep -Milliseconds 100
    }
    if ($buffer.Length -gt 0) {
        Write-Host "BUFFER: Donnees initiales:" -ForegroundColor Cyan
        Write-Host $buffer -ForegroundColor Gray
        Write-Host ""
    }
    
    # Envoyer la commande GET_CONFIG
    $command = '{"command":"GET_CONFIG"}' + "`n"
    Write-Host "SEND: Envoi commande: $($command.Trim())" -ForegroundColor Yellow
    $serialPort.Write($command)
    $serialPort.BaseStream.Flush()
    Write-Host "OK: Commande envoyee" -ForegroundColor Green
    Write-Host ""
    
    # Lire les reponses pendant le timeout
    Write-Host "WAIT: Attente reponse (max $TimeoutSeconds secondes)..." -ForegroundColor Yellow
    Write-Host ""
    
    $startTime = Get-Date
    $allData = ""
    $foundConfigResponse = $false
    
    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        if ($serialPort.BytesToRead -gt 0) {
            $data = $serialPort.ReadExisting()
            $allData += $data
            
            # Afficher les donnees au fur et a mesure
            Write-Host $data -NoNewline -ForegroundColor White
            
            # Verifier si on a recu une reponse config_response
            if ($data -match 'config_response' -or $data -match '"type"\s*:\s*"config_response"') {
                $foundConfigResponse = $true
                Write-Host ""
                Write-Host "OK: Reponse config_response detectee !" -ForegroundColor Green
            }
        } else {
            Start-Sleep -Milliseconds 100
        }
    }
    
    Write-Host ""
    Write-Host ""
    Write-Host "=== Resultats ===" -ForegroundColor Cyan
    
    if ($foundConfigResponse) {
        Write-Host "OK: GET_CONFIG: Reponse recue" -ForegroundColor Green
    } else {
        Write-Host "FAIL: GET_CONFIG: Timeout (pas de reponse config_response)" -ForegroundColor Red
    }
    
    Write-Host ""
    $dataLength = $allData.Length
    Write-Host "DATA: Donnees recues ($dataLength caracteres):" -ForegroundColor Cyan
    if ($allData.Length -gt 0) {
        # Essayer de trouver et formater le JSON
        $jsonMatch = $allData | Select-String -Pattern '\{[^}]*"type"\s*:\s*"config_response"[^}]*\}' -AllMatches
        if ($jsonMatch) {
            Write-Host "JSON config_response trouve:" -ForegroundColor Green
            foreach ($match in $jsonMatch.Matches) {
                try {
                    $json = $match.Value | ConvertFrom-Json
                    $json | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
                } catch {
                    Write-Host $match.Value -ForegroundColor Gray
                }
            }
        } else {
            # Afficher les dernieres lignes
            $lines = $allData -split "`n" | Where-Object { $_.Trim().Length -gt 0 }
            $lastLines = $lines | Select-Object -Last 10
            Write-Host "Dernieres lignes recues:" -ForegroundColor Yellow
            $lastLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        }
    } else {
        Write-Host "Aucune donnee recue" -ForegroundColor Red
    }
    
} catch {
    Write-Host "ERROR: Erreur: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Gray
} finally {
    if ($serialPort.IsOpen) {
        Write-Host ""
        Write-Host "CLOSE: Fermeture du port..." -ForegroundColor Yellow
        $serialPort.Close()
        Write-Host "OK: Port ferme" -ForegroundColor Green
    }
    $serialPort.Dispose()
}

Write-Host ""
Write-Host "=== Fin du test ===" -ForegroundColor Cyan
