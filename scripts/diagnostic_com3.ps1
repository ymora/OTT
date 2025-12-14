# Script de diagnostic pour COM3
# Verifie l'etat du port COM3 et du serveur Next.js

Write-Host "DIAGNOSTIC COM3 ET SERVEUR" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

# 1. Verifier les ports serie disponibles
Write-Host "Ports serie disponibles:" -ForegroundColor Yellow
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports.Count -eq 0) {
    Write-Host "   [ERREUR] Aucun port serie detecte" -ForegroundColor Red
} else {
    foreach ($p in $ports) {
        $isCOM3 = $p -eq "COM3"
        $color = if ($isCOM3) { "Green" } else { "Gray" }
        $marker = if ($isCOM3) { "[OK]" } else { "   " }
        Write-Host "$marker $p" -ForegroundColor $color
    }
}

Write-Host ""

# 2. Verifier si COM3 est disponible
if ($ports -contains "COM3") {
    Write-Host "[OK] COM3 est disponible" -ForegroundColor Green
    
    # Essayer d'ouvrir le port pour verifier qu'il n'est pas verrouille
    try {
        $testPort = New-Object System.IO.Ports.SerialPort("COM3", 115200)
        $testPort.Open()
        Write-Host "[OK] COM3 peut etre ouvert (non verrouille)" -ForegroundColor Green
        $testPort.Close()
    } catch {
        Write-Host "[ATTENTION] COM3 est verrouille ou utilise par un autre processus" -ForegroundColor Yellow
        Write-Host "   Message: $($_.Exception.Message)" -ForegroundColor Gray
    }
} else {
    Write-Host "[ERREUR] COM3 n'est pas disponible" -ForegroundColor Red
    Write-Host "   Verifiez que le dispositif USB est branche" -ForegroundColor Yellow
}

Write-Host ""

# 3. Verifier le serveur Next.js
Write-Host "Etat du serveur Next.js:" -ForegroundColor Yellow
$nextProcesses = Get-Process | Where-Object { 
    $_.ProcessName -eq "node"
} | Select-Object Id, ProcessName

$nextFound = $false
foreach ($proc in $nextProcesses) {
    try {
        $cmdLine = (Get-WmiObject Win32_Process -Filter "ProcessId = $($proc.Id)").CommandLine
        if ($cmdLine -like "*next*dev*") {
            Write-Host "[OK] Serveur Next.js en cours d'execution (PID: $($proc.Id))" -ForegroundColor Green
            $nextFound = $true
            break
        }
    } catch {
        # Ignorer les erreurs
    }
}

if (-not $nextFound) {
    Write-Host "[ERREUR] Serveur Next.js non detecte" -ForegroundColor Red
    Write-Host "   Lancez: npm run dev" -ForegroundColor Yellow
}

# Verifier si le port 3000 est en ecoute
$port3000 = netstat -ano | findstr ":3000.*LISTENING"
if ($port3000) {
    Write-Host "[OK] Port 3000 en ecoute" -ForegroundColor Green
} else {
    Write-Host "[ERREUR] Port 3000 non en ecoute" -ForegroundColor Red
}

Write-Host ""

# 4. Instructions
Write-Host "INSTRUCTIONS:" -ForegroundColor Cyan
Write-Host "1. Ouvrez http://localhost:3000 dans Chrome/Edge" -ForegroundColor White
Write-Host "2. Allez dans Configuration -> USB Streaming" -ForegroundColor White
Write-Host "3. Cliquez sur 'Selectionner un port USB' ou 'Connecter'" -ForegroundColor White
Write-Host "4. Selectionnez COM3 dans la liste" -ForegroundColor White
Write-Host "5. Autorisez l'acces au port" -ForegroundColor White
Write-Host ""
Write-Host "Alternative: Utilisez le script PowerShell de monitoring:" -ForegroundColor Yellow
Write-Host "   .\scripts\monitoring\MONITOR_SERIE_COM3.ps1" -ForegroundColor Gray
Write-Host ""
