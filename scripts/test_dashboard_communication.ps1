# Script de test de communication dashboard avec firmware
# Simule ce que fait le dashboard pour envoyer GET_CONFIG
# Usage: .\scripts\test_dashboard_communication.ps1 -Port COM3

param(
    [string]$Port = "COM3",
    [int]$TimeoutSeconds = 10
)

Write-Host "=== Test Communication Dashboard (simulation) ===" -ForegroundColor Cyan
Write-Host "Port: $Port" -ForegroundColor Yellow
Write-Host "Timeout: $TimeoutSeconds secondes" -ForegroundColor Yellow
Write-Host ""

# Verifier si le port existe
$portExists = [System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -eq $Port }
if (-not $portExists) {
    Write-Host "[ERROR] Port $Port introuvable !" -ForegroundColor Red
    Write-Host "Ports disponibles:" -ForegroundColor Yellow
    [System.IO.Ports.SerialPort]::GetPortNames() | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    exit 1
}

# Creer le port serie (comme le dashboard)
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
    Write-Host "[1/4] Ouverture du port $Port..." -ForegroundColor Yellow
    $serialPort.Open()
    Write-Host "[OK] Port ouvert" -ForegroundColor Green
    Write-Host ""
    
    # Attendre un peu pour que le firmware se stabilise
    Start-Sleep -Milliseconds 1000
    
    # Lire les donnees initiales (comme le dashboard)
    Write-Host "[2/4] Lecture donnees initiales..." -ForegroundColor Yellow
    $initialBuffer = ""
    $readAttempts = 0
    while ($readAttempts -lt 10 -and $serialPort.BytesToRead -gt 0) {
        $data = $serialPort.ReadExisting()
        $initialBuffer += $data
        Start-Sleep -Milliseconds 100
        $readAttempts++
    }
    
    if ($initialBuffer.Length -gt 0) {
        Write-Host "[OK] Donnees initiales recues ($($initialBuffer.Length) caracteres)" -ForegroundColor Green
        # Afficher les dernieres lignes
        $lines = $initialBuffer -split "`n" | Where-Object { $_.Trim().Length -gt 0 }
        $lastLines = $lines | Select-Object -Last 5
        Write-Host "Dernieres lignes:" -ForegroundColor Gray
        $lastLines | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    } else {
        Write-Host "[WARN] Aucune donnee initiale" -ForegroundColor Yellow
    }
    Write-Host ""
    
    # Envoyer GET_CONFIG exactement comme le dashboard
    Write-Host "[3/4] Envoi commande GET_CONFIG (format dashboard)..." -ForegroundColor Yellow
    $command = '{"command":"GET_CONFIG"}' + "`n"
    Write-Host "Commande: $($command.Trim())" -ForegroundColor Gray
    
    # Envoyer comme le dashboard (write + flush)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($command)
    $serialPort.Write($bytes, 0, $bytes.Length)
    $serialPort.BaseStream.Flush()
    
    Write-Host "[OK] Commande envoyee" -ForegroundColor Green
    Write-Host ""
    
    # Attendre la reponse (comme le dashboard attend 5 secondes)
    Write-Host "[4/4] Attente reponse (max $TimeoutSeconds secondes)..." -ForegroundColor Yellow
    Write-Host "Lecture en temps reel:" -ForegroundColor Gray
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
                
                # Verifier si la commande a ete recue (log [CMD])
                if ($line -match '\[CMD\]') {
                    $foundCommandReceived = $true
                    Write-Host ""
                    Write-Host "[DEBUG] $line" -ForegroundColor Cyan
                }
                
                # Verifier si c'est une reponse config_response
                if ($line.StartsWith('{') -and ($line -match '"type"\s*:\s*"config_response"' -or $line -match 'config_response')) {
                    $foundConfigResponse = $true
                    Write-Host ""
                    Write-Host "[SUCCESS] Reponse config_response detectee !" -ForegroundColor Green
                    Write-Host "JSON:" -ForegroundColor Yellow
                    try {
                        $json = $line | ConvertFrom-Json
                        $json | ConvertTo-Json -Depth 10 | Write-Host -ForegroundColor Gray
                    } catch {
                        Write-Host $line -ForegroundColor Gray
                    }
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
        Write-Host "[OK] Commande recue par le firmware (log [CMD] detecte)" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Commande non recue (pas de log [CMD])" -ForegroundColor Red
        Write-Host "       Le firmware ne detecte peut-etre pas la commande" -ForegroundColor Yellow
    }
    
    if ($foundConfigResponse) {
        Write-Host "[OK] GET_CONFIG: Reponse recue" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] GET_CONFIG: Timeout (pas de reponse config_response)" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Donnees recues ($($allData.Length) caracteres):" -ForegroundColor Cyan
    if ($allData.Length -gt 0) {
        # Chercher des JSON complets
        $jsonMatches = $allData | Select-String -Pattern '\{[^{}]*"type"\s*:\s*"config_response"[^{}]*\}' -AllMatches
        if ($jsonMatches) {
            Write-Host "JSON config_response trouve:" -ForegroundColor Green
            foreach ($match in $jsonMatches.Matches) {
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
    Write-Host "[ERROR] Erreur: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Gray
} finally {
    if ($serialPort.IsOpen) {
        Write-Host ""
        Write-Host "Fermeture du port..." -ForegroundColor Yellow
        $serialPort.Close()
        Write-Host "[OK] Port ferme" -ForegroundColor Green
    }
    $serialPort.Dispose()
}

Write-Host ""
Write-Host "=== Fin du test ===" -ForegroundColor Cyan

