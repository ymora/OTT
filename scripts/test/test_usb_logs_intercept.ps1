# Script de test pour intercepter TOUS les logs USB en temps réel
# Affiche toutes les données reçues avec timestamps et analyse du contenu

param(
    [string]$PortName = "COM3",
    [int]$BaudRate = 115200,
    [int]$Duration = 0,  # 0 = infini
    [switch]$AutoDetectPort,
    [switch]$NoColors
)

# Fonction pour colorer le texte selon le type de message
function Write-ColoredLine {
    param(
        [string]$Line,
        [string]$Timestamp
    )
    
    if ($NoColors) {
        Write-Host "[$Timestamp] $Line"
        return
    }
    
    $trimmed = $Line.Trim()
    
    # Détecter le type de message
    if ($trimmed.StartsWith("{")) {
        # JSON - couleur jaune
        try {
            $json = $trimmed | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($json) {
                # Analyser le type de JSON
                $type = if ($json.type) { $json.type } elseif ($json.mode) { $json.mode } else { "unknown" }
                $seq = if ($json.seq) { "seq:$($json.seq)" } else { "" }
                
                Write-Host "[$Timestamp] " -NoNewline -ForegroundColor Gray
                Write-Host "JSON[$type]" -NoNewline -ForegroundColor Yellow
                if ($seq) {
                    Write-Host " $seq" -NoNewline -ForegroundColor DarkYellow
                }
                Write-Host " $trimmed" -ForegroundColor Yellow
                
                # Afficher les données importantes si c'est une mesure
                if ($json.flow_lpm -ne $null -or $json.battery_percent -ne $null) {
                    Write-Host "      " -NoNewline
                    if ($json.flow_lpm -ne $null) {
                        Write-Host "flow: $($json.flow_lpm) L/min" -NoNewline -ForegroundColor Cyan
                    }
                    if ($json.battery_percent -ne $null) {
                        Write-Host " | battery: $($json.battery_percent)%" -NoNewline -ForegroundColor Magenta
                    }
                    if ($json.rssi -ne $null) {
                        Write-Host " | rssi: $($json.rssi)" -NoNewline -ForegroundColor Green
                    }
                    Write-Host ""
                }
                return
            }
        } catch {
            # JSON invalide
            Write-Host "[$Timestamp] " -NoNewline -ForegroundColor Gray
            Write-Host "JSON_INVALID" -NoNewline -ForegroundColor Red
            Write-Host " $trimmed" -ForegroundColor Red
            return
        }
    }
    
    # Logs du firmware (non-JSON)
    if ($trimmed -match "^(ERROR|WARN|INFO|DEBUG|LOG)") {
        $level = $matches[1]
        $color = switch ($level) {
            "ERROR" { "Red" }
            "WARN" { "Yellow" }
            "INFO" { "Cyan" }
            "DEBUG" { "Gray" }
            default { "White" }
        }
        Write-Host "[$Timestamp] " -NoNewline -ForegroundColor Gray
        Write-Host "[$level] " -NoNewline -ForegroundColor $color
        Write-Host $trimmed.Substring($level.Length + 1) -ForegroundColor White
    } elseif ($trimmed -match "^\[.*\]") {
        # Format avec crochets
        Write-Host "[$Timestamp] " -NoNewline -ForegroundColor Gray
        Write-Host $trimmed -ForegroundColor Green
    } else {
        # Log normal
        Write-Host "[$Timestamp] " -NoNewline -ForegroundColor Gray
        Write-Host $trimmed -ForegroundColor White
    }
}

# Fonction pour lister les ports disponibles
function Get-AvailablePorts {
    $ports = [System.IO.Ports.SerialPort]::GetPortNames()
    return $ports
}

# Afficher l'en-tête
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INTERCEPTEUR DE LOGS USB" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Détection automatique du port
if ($AutoDetectPort) {
    Write-Host "🔍 Détection automatique du port..." -ForegroundColor Yellow
    $availablePorts = Get-AvailablePorts
    if ($availablePorts.Count -eq 0) {
        Write-Host "❌ Aucun port série disponible" -ForegroundColor Red
        exit 1
    } elseif ($availablePorts.Count -eq 1) {
        $PortName = $availablePorts[0]
        Write-Host "✅ Port détecté: $PortName" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Plusieurs ports disponibles:" -ForegroundColor Yellow
        for ($i = 0; $i -lt $availablePorts.Count; $i++) {
            Write-Host "  [$i] $($availablePorts[$i])" -ForegroundColor White
        }
        $selection = Read-Host "Sélectionnez un port (0-$($availablePorts.Count-1))"
        $PortName = $availablePorts[[int]$selection]
        Write-Host "✅ Port sélectionné: $PortName" -ForegroundColor Green
    }
    Write-Host ""
}

# Vérifier si le port existe
$ports = Get-AvailablePorts
if ($ports -notcontains $PortName) {
    Write-Host "❌ ERREUR: Port $PortName introuvable" -ForegroundColor Red
    Write-Host "Ports disponibles: $($ports -join ', ')" -ForegroundColor Yellow
    exit 1
}

Write-Host "📡 Configuration:" -ForegroundColor Cyan
Write-Host "   Port: $PortName" -ForegroundColor White
Write-Host "   Baud Rate: $BaudRate" -ForegroundColor White
if ($Duration -gt 0) {
    Write-Host "   Durée: $Duration secondes" -ForegroundColor White
} else {
    Write-Host "   Durée: Infinie (Ctrl+C pour arrêter)" -ForegroundColor White
}
Write-Host ""

# Créer et ouvrir le port
$port = New-Object System.IO.Ports.SerialPort
$port.PortName = $PortName
$port.BaudRate = $BaudRate
$port.Parity = [System.IO.Ports.Parity]::None
$port.DataBits = 8
$port.StopBits = [System.IO.Ports.StopBits]::One
$port.ReadTimeout = 1000
$port.WriteTimeout = 5000
$port.DtrEnable = $true  # Data Terminal Ready
$port.RtsEnable = $true  # Request To Send

$totalBytes = 0
$totalLines = 0
$jsonCount = 0
$logCount = 0
$buffer = ""

try {
    Write-Host "🔌 Ouverture du port..." -ForegroundColor Cyan
    $port.Open()
    Write-Host "✅ Port ouvert avec succès" -ForegroundColor Green
    Write-Host ""
    Write-Host "📥 En attente de données..." -ForegroundColor Yellow
    Write-Host "   (Toutes les données reçues seront affichées ci-dessous)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    
    $startTime = Get-Date
    $lastDataTime = $startTime
    $lastStatsTime = $startTime
    
    while ($true) {
        # Vérifier la durée
        if ($Duration -gt 0) {
            $elapsed = (Get-Date) - $startTime
            if ($elapsed.TotalSeconds -ge $Duration) {
                Write-Host ""
                Write-Host "⏱️  Durée maximale atteinte ($Duration secondes)" -ForegroundColor Yellow
                break
            }
        }
        
        # Lire les données disponibles
        if ($port.BytesToRead -gt 0) {
            try {
                $chunk = $port.ReadExisting()
                if ($chunk.Length -gt 0) {
                    $totalBytes += $chunk.Length
                    $lastDataTime = Get-Date
                    $buffer += $chunk
                    
                    # Traiter les lignes complètes
                    while ($buffer -match "`r?`n") {
                        $line = $buffer -split "`r?`n", 2
                        $buffer = if ($line.Count -gt 1) { $line[1] } else { "" }
                        
                        $trimmedLine = $line[0].Trim()
                        if ($trimmedLine.Length -gt 0) {
                            $totalLines++
                            $timestamp = Get-Date -Format "HH:mm:ss.fff"
                            
                            # Compter les JSON
                            if ($trimmedLine.StartsWith("{")) {
                                $jsonCount++
                            } else {
                                $logCount++
                            }
                            
                            Write-ColoredLine -Line $trimmedLine -Timestamp $timestamp
                        }
                    }
                }
            } catch {
                if ($_.Exception.Message -notmatch "timeout|Timeout") {
                    Write-Host ""
                    Write-Host "⚠️  Erreur de lecture: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
        } else {
            # Afficher des stats périodiquement si pas de données
            $now = Get-Date
            $elapsedSinceLastData = ($now - $lastDataTime).TotalSeconds
            $elapsedSinceLastStats = ($now - $lastStatsTime).TotalSeconds
            
            if ($elapsedSinceLastData -gt 5 -and $totalBytes -eq 0) {
                Write-Host "⏳ En attente de données..." -ForegroundColor Gray
                $lastDataTime = $now
            }
            
            # Afficher des stats toutes les 30 secondes
            if ($elapsedSinceLastStats -gt 30 -and $totalBytes -gt 0) {
                Write-Host ""
                Write-Host "📊 Statistiques (dernières 30s):" -ForegroundColor DarkGray
                Write-Host "   Total: $totalBytes bytes, $totalLines lignes ($jsonCount JSON, $logCount logs)" -ForegroundColor DarkGray
                $lastStatsTime = $now
            }
        }
        
        Start-Sleep -Milliseconds 10
    }
    
    # Traiter le buffer restant
    if ($buffer.Trim().Length -gt 0) {
        $timestamp = Get-Date -Format "HH:mm:ss.fff"
        Write-ColoredLine -Line $buffer.Trim() -Timestamp $timestamp
    }
    
} catch {
    Write-Host ""
    Write-Host "❌ ERREUR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
} finally {
    if ($port -and $port.IsOpen) {
        Write-Host ""
        Write-Host "🔌 Fermeture du port..." -ForegroundColor Cyan
        $port.Close()
        Write-Host "✅ Port fermé" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor DarkGray
    Write-Host "📊 RÉSUMÉ FINAL:" -ForegroundColor Cyan
    Write-Host "   Durée totale: $([math]::Round((Get-Date - $startTime).TotalSeconds, 2)) secondes" -ForegroundColor White
    Write-Host "   Bytes reçus: $totalBytes" -ForegroundColor White
    Write-Host "   Lignes reçues: $totalLines" -ForegroundColor White
    Write-Host "   JSON: $jsonCount" -ForegroundColor Yellow
    Write-Host "   Logs: $logCount" -ForegroundColor Green
    if ($totalBytes -gt 0) {
        $bytesPerSec = [math]::Round($totalBytes / (Get-Date - $startTime).TotalSeconds, 2)
        Write-Host "   Débit: $bytesPerSec bytes/sec" -ForegroundColor White
    }
    Write-Host ""
}

