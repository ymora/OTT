# Script de monitoring du port série COM3 pour diagnostic firmware
# Usage: .\scripts\MONITOR_SERIE_COM3.ps1

param(
    [string]$Port = "COM3",
    [int]$BaudRate = 115200,
    [string]$OutputFile = "logs_serie_$(Get-Date -Format 'yyyyMMdd_HHmmss').log",
    [switch]$Analyze,
    [switch]$WatchErrors
)

Write-Host "🔍 MONITORING PORT SÉRIE COM3" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si le port est disponible
$ports = [System.IO.Ports.SerialPort]::GetPortNames()
if ($ports -notcontains $Port) {
    Write-Host "❌ Port $Port non trouvé !" -ForegroundColor Red
    Write-Host "📋 Ports disponibles:" -ForegroundColor Yellow
    foreach ($p in $ports) {
        Write-Host "   - $p" -ForegroundColor Gray
    }
    exit 1
}

Write-Host "✅ Port $Port trouvé" -ForegroundColor Green
Write-Host "📊 Baudrate: $BaudRate" -ForegroundColor Gray
Write-Host "💾 Logs sauvegardés dans: $OutputFile" -ForegroundColor Gray
Write-Host ""
Write-Host "🛑 Appuyez sur Ctrl+C pour arrêter" -ForegroundColor Yellow
Write-Host ""

# Statistiques
$stats = @{
    TotalLines = 0
    Errors = 0
    Warnings = 0
    GPS = 0
    Modem = 0
    Sensor = 0
    USB = 0
    Timestamp = Get-Date
}

# Patterns d'analyse
$patterns = @{
    Error = @(
        "ERROR", "❌", "ÉCHEC", "FAIL", "FATAL", "Exception", 
        "Erreur JSON", "Erreur parsing", "Database error"
    )
    Warning = @(
        "WARN", "⚠️", "Warning", "ATTENTION", "Timeout", 
        "Commande inconnue", "Non disponible"
    )
    GPS = @(
        "\[GPS\]", "GPS", "latitude", "longitude", "satellite", 
        "fix", "coordonnées", "géolocalisation"
    )
    Modem = @(
        "\[MODEM\]", "modem", "SIM", "CSQ", "RSSI", "signal", 
        "opérateur", "attaché", "enregistrement"
    )
    Sensor = @(
        "\[SENSOR\]", "Airflow", "flow", "battery", "batterie", 
        "mesure", "capture", "ADC"
    )
    USB = @(
        "usb_stream", "USB_STREAM", "USB", "Serial", "série"
    )
}

# Fonction pour analyser une ligne
function Analyze-Line {
    param([string]$line)
    
    $stats.TotalLines++
    
    foreach ($category in $patterns.Keys) {
        foreach ($pattern in $patterns[$category]) {
            if ($line -match $pattern -and $category -ne "GPS" -and $category -ne "Modem" -and $category -ne "Sensor" -and $category -ne "USB") {
                $stats[$category]++
                return $category
            }
        }
    }
    
    foreach ($pattern in $patterns.GPS) {
        if ($line -match $pattern) {
            $stats.GPS++
            return "GPS"
        }
    }
    
    foreach ($pattern in $patterns.Modem) {
        if ($line -match $pattern) {
            $stats.Modem++
            return "Modem"
        }
    }
    
    foreach ($pattern in $patterns.Sensor) {
        if ($line -match $pattern) {
            $stats.Sensor++
            return "Sensor"
        }
    }
    
    foreach ($pattern in $patterns.USB) {
        if ($line -match $pattern) {
            $stats.USB++
            return "USB"
        }
    }
    
    return $null
}

# Fonction pour afficher les statistiques
function Show-Stats {
    $elapsed = (Get-Date) - $stats.Timestamp
    Write-Host ""
    Write-Host "📊 STATISTIQUES (durée: $($elapsed.ToString('mm\:ss')))" -ForegroundColor Cyan
    Write-Host "─" * 50 -ForegroundColor Gray
    Write-Host "Lignes totales:    $($stats.TotalLines)" -ForegroundColor White
    Write-Host "❌ Erreurs:        $($stats.Errors)" -ForegroundColor $(if ($stats.Errors -gt 0) { "Red" } else { "Green" })
    Write-Host "⚠️  Avertissements: $($stats.Warnings)" -ForegroundColor $(if ($stats.Warnings -gt 0) { "Yellow" } else { "Gray" })
    Write-Host "📡 GPS:            $($stats.GPS)" -ForegroundColor Cyan
    Write-Host "📱 Modem:          $($stats.Modem)" -ForegroundColor Cyan
    Write-Host "💧 Capteur:        $($stats.Sensor)" -ForegroundColor Cyan
    Write-Host "🔌 USB:            $($stats.USB)" -ForegroundColor Cyan
    Write-Host ""
}

# Fonction pour colorer la sortie selon le type
function Write-ColoredLine {
    param([string]$line, [string]$category)
    
    $color = switch ($category) {
        "Error" { "Red" }
        "Warning" { "Yellow" }
        "GPS" { "Cyan" }
        "Modem" { "Magenta" }
        "Sensor" { "Green" }
        "USB" { "Blue" }
        default { "White" }
    }
    
    Write-Host $line -ForegroundColor $color
}

# Créer le port série
$serialPort = New-Object System.IO.Ports.SerialPort
$serialPort.PortName = $Port
$serialPort.BaudRate = $BaudRate
$serialPort.Parity = [System.IO.Ports.Parity]::None
$serialPort.DataBits = 8
$serialPort.StopBits = [System.IO.Ports.StopBits]::One
$serialPort.ReadTimeout = 1000
$serialPort.WriteTimeout = 1000

# Buffer pour les lignes incomplètes
$buffer = ""

try {
    # Ouvrir le port
    $serialPort.Open()
    Write-Host "✅ Port $Port ouvert avec succès" -ForegroundColor Green
    Write-Host ""
    
    # Ouvrir le fichier de log
    $logFile = [System.IO.StreamWriter]::new($OutputFile)
    $logFile.AutoFlush = $true
    
    # Lire en continu
    $lastStatsDisplay = Get-Date
    
    while ($true) {
        try {
            if ($serialPort.BytesToRead -gt 0) {
                $data = $serialPort.ReadExisting()
                $buffer += $data
                
                # Traiter les lignes complètes
                while ($buffer -match "`r?`n") {
                    $line = $buffer -split "`r?`n", 2
                    $fullLine = $line[0].Trim()
                    $buffer = if ($line.Count -gt 1) { $line[1] } else { "" }
                    
                    if ($fullLine) {
                        # Analyser la ligne
                        $category = Analyze-Line $fullLine
                        
                        # Afficher la ligne
                        $timestamp = Get-Date -Format "HH:mm:ss"
                        $displayLine = "[$timestamp] $fullLine"
                        
                        if ($category) {
                            Write-ColoredLine $displayLine $category
                        } else {
                            Write-Host $displayLine -ForegroundColor Gray
                        }
                        
                        # Sauvegarder dans le fichier
                        $logFile.WriteLine($fullLine)
                        
                        # Afficher les erreurs en temps réel si demandé
                        if ($WatchErrors -and ($category -eq "Error" -or $category -eq "Warning")) {
                            Write-Host "⚠️  ALERTE: $category détecté !" -ForegroundColor Red
                        }
                    }
                }
            }
            
            # Afficher les stats toutes les 30 secondes
            $now = Get-Date
            if (($now - $lastStatsDisplay).TotalSeconds -ge 30) {
                Show-Stats
                $lastStatsDisplay = $now
            }
            
            # Petit délai pour ne pas surcharger le CPU
            Start-Sleep -Milliseconds 10
            
        } catch {
            if ($_.Exception.Message -notmatch "Timeout") {
                Write-Host "⚠️  Erreur lecture: $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
    
} catch {
    Write-Host "❌ Erreur ouverture port: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    # Fermer proprement
    if ($serialPort.IsOpen) {
        $serialPort.Close()
    }
    if ($logFile) {
        $logFile.Close()
    }
    
    Write-Host ""
    Write-Host "📊 STATISTIQUES FINALES" -ForegroundColor Cyan
    Show-Stats
    
    Write-Host "💾 Logs sauvegardés dans: $OutputFile" -ForegroundColor Green
    
    # Analyser le fichier si demandé
    if ($Analyze -and (Test-Path $OutputFile)) {
        Write-Host ""
        Write-Host "🔍 ANALYSE DU FICHIER DE LOG" -ForegroundColor Cyan
        Write-Host "─" * 50 -ForegroundColor Gray
        
        $logContent = Get-Content $OutputFile -Raw
        
        # Analyser les erreurs
        $errors = Select-String -InputObject $logContent -Pattern "ERROR|❌|ÉCHEC|FAIL" -AllMatches
        if ($errors) {
            Write-Host "❌ ERREURS DÉTECTÉES:" -ForegroundColor Red
            $errors.Matches | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Red
            }
        }
        
        # Analyser les problèmes GPS
        $gpsIssues = Select-String -InputObject $logContent -Pattern "GPS.*désactivé|GPS.*non|GPS.*échec" -AllMatches
        if ($gpsIssues) {
            Write-Host "📡 PROBLÈMES GPS:" -ForegroundColor Yellow
            $gpsIssues.Matches | Select-Object -First 10 | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Yellow
            }
        }
        
        # Analyser les problèmes modem
        $modemIssues = Select-String -InputObject $logContent -Pattern "MODEM.*échec|MODEM.*non|SIM.*non" -AllMatches
        if ($modemIssues) {
            Write-Host "📱 PROBLÈMES MODEM:" -ForegroundColor Yellow
            $modemIssues.Matches | Select-Object -First 10 | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Yellow
            }
        }
        
        # Analyser les commandes inconnues
        $unknownCommands = Select-String -InputObject $logContent -Pattern "Commande inconnue" -AllMatches
        if ($unknownCommands) {
            Write-Host "⚠️  COMMANDES INCONNUES:" -ForegroundColor Yellow
            $unknownCommands.Matches | Select-Object -First 10 | ForEach-Object {
                Write-Host "   $_" -ForegroundColor Yellow
            }
        }
        
        Write-Host ""
        Write-Host "✅ Analyse terminée" -ForegroundColor Green
    }
}

