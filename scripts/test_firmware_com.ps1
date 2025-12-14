# Script de test de communication firmware via port serie
# Usage: .\scripts\test_firmware_com.ps1 -Port COM3

param(
    [string]$Port = "COM3",
    [int]$TimeoutSeconds = 15
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
        Write-Host "BUFFER: Donnees initiales (dernieres 500 caracteres):" -ForegroundColor Cyan
        $lastPart = if ($buffer.Length -gt 500) { $buffer.Substring($buffer.Length - 500) } else { $buffer }
        Write-Host $lastPart -ForegroundColor Gray
        Write-Host ""
    }
    
    # Test 1: Commande PING simple (pour verifier que le firmware repond)
    Write-Host "=== TEST 1: PING ===" -ForegroundColor Cyan
    Write-Host "SEND: Envoi commande PING..." -ForegroundColor Yellow
    $pingCmd = "PING`n"
    $serialPort.Write($pingCmd)
    $serialPort.BaseStream.Flush()
    Write-Host "OK: Commande PING envoyee" -ForegroundColor Green
    
    Start-Sleep -Milliseconds 2000
    $pingResponse = ""
    while ($serialPort.BytesToRead -gt 0) {
        $pingResponse += $serialPort.ReadExisting()
        Start-Sleep -Milliseconds 100
    }
    
    if ($pingResponse -match 'PING|pong|ACK|Commande recue') {
        Write-Host "OK: Reponse PING detectee:" -ForegroundColor Green
        Write-Host $pingResponse -ForegroundColor White
    } else {
        Write-Host "FAIL: Pas de reponse PING" -ForegroundColor Red
        if ($pingResponse.Length -gt 0) {
            Write-Host "Donnees recues apres PING:" -ForegroundColor Yellow
            Write-Host $pingResponse -ForegroundColor Gray
        }
    }
    Write-Host ""
    
    # Test 2: Commande GET_CONFIG JSON avec newline
    Write-Host "=== TEST 2: GET_CONFIG (JSON avec newline) ===" -ForegroundColor Cyan
    Write-Host "SEND: Envoi commande: {\"command\":\"GET_CONFIG\"}" -ForegroundColor Yellow
    $getConfigCmd1 = '{"command":"GET_CONFIG"}' + "`n"
    $serialPort.Write($getConfigCmd1)
    $serialPort.BaseStream.Flush()
    Write-Host "OK: Commande envoyee" -ForegroundColor Green
    Write-Host ""
    
    # Lire les reponses
    Write-Host "WAIT: Attente reponse (max $TimeoutSeconds secondes)..." -ForegroundColor Yellow
    Write-Host ""
    
    $startTime = Get-Date
    $allData = ""
    $foundConfigResponse = $false
    $foundCommandReceived = $false
    $lineBuffer = ""
    
    while (((Get-Date) - $startTime).TotalSeconds -lt $TimeoutSeconds) {
        if ($serialPort.BytesToRead -gt 0) {
            $data = $serialPort.ReadExisting()
            $allData += $data
            $lineBuffer += $data
            
            # Afficher les donnees au fur et a mesure
            Write-Host $data -NoNewline -ForegroundColor White
            
            # Traiter ligne par ligne
            while ($lineBuffer -match "([^\r\n]+)[\r\n]+") {
                $line = $matches[1]
                $lineBuffer = $lineBuffer.Substring($matches[0].Length)
                
                # Verifier si la commande a ete recue
                if ($line -match 'Commande recue|CMD.*GET_CONFIG|GET_CONFIG') {
                    $foundCommandReceived = $true
                    Write-Host ""
                    Write-Host "[OK] Commande recue par le firmware: $line" -ForegroundColor Cyan
                }
                
                # Verifier si c'est une reponse config_response
                if ($line -match 'config_response' -or ($line.StartsWith('{') -and $line -match '"type"\s*:\s*"config_response"')) {
                    $foundConfigResponse = $true
                    Write-Host ""
                    Write-Host "[OK] Reponse config_response detectee !" -ForegroundColor Green
                    Write-Host "JSON: $line" -ForegroundColor Gray
                }
                
                # Verifier si c'est un JSON avec firmware_version (peut etre la reponse)
                if ($line.StartsWith('{') -and $line -match 'firmware_version') {
                    Write-Host ""
                    Write-Host "[INFO] JSON avec firmware_version detecte (peut etre la reponse):" -ForegroundColor Yellow
                    Write-Host "JSON: $line" -ForegroundColor Gray
                }
            }
        } else {
            Start-Sleep -Milliseconds 100
        }
    }
    
    # Afficher le reste du buffer
    if ($lineBuffer.Length -gt 0) {
        Write-Host $lineBuffer -NoNewline -ForegroundColor White
        $allData += $lineBuffer
    }
    
    Write-Host ""
    Write-Host ""
    Write-Host "=== Resultats ===" -ForegroundColor Cyan
    
    if ($foundCommandReceived) {
        Write-Host "[OK] Commande recue par le firmware" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Commande non recue (le firmware ne detecte pas la commande)" -ForegroundColor Red
    }
    
    if ($foundConfigResponse) {
        Write-Host "[OK] GET_CONFIG: Reponse recue" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] GET_CONFIG: Timeout (pas de reponse config_response)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "DATA: Donnees recues ($($allData.Length) caracteres):" -ForegroundColor Cyan
    if ($allData.Length -gt 0) {
        # Afficher les dernieres lignes
        $lines = $allData -split "`n" | Where-Object { $_.Trim().Length -gt 0 }
        $lastLines = $lines | Select-Object -Last 15
        Write-Host "Dernieres lignes recues:" -ForegroundColor Yellow
        $lastLines | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
        
        # Chercher des JSON complets
        $jsonMatches = $allData | Select-String -Pattern '\{[^{}]*"type"\s*:\s*"config_response"[^{}]*\}' -AllMatches
        if ($jsonMatches) {
            Write-Host ""
            Write-Host "JSON config_response trouve:" -ForegroundColor Green
            foreach ($match in $jsonMatches.Matches) {
                Write-Host $match.Value -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "Aucune donnee recue" -ForegroundColor Red
    }
    
} catch {
    Write-Host "[ERROR] Erreur: $($_.Exception.Message)" -ForegroundColor Red
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
