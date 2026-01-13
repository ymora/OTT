# Script d'analyse des logs firmware pour identifier problèmes et optimisations
# Usage: .\scripts\ANALYSER_LOGS_FIRMWARE.ps1 -LogFile "logs_serie_20240101_120000.log"

param(
    [Parameter(Mandatory=$true)]
    [string]$LogFile,
    [switch]$Detailed,
    [switch]$SuggestOptimizations
)

if (-not (Test-Path $LogFile)) {
    Write-Host "❌ Fichier de log non trouvé: $LogFile" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 ANALYSE DES LOGS FIRMWARE" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

$logContent = Get-Content $LogFile -Raw
$lines = Get-Content $LogFile

# Statistiques
$stats = @{
    TotalLines = $lines.Count
    Errors = 0
    Warnings = 0
    GPS = @{
        Enabled = 0
        Disabled = 0
        FixSuccess = 0
        FixFailed = 0
        Timeouts = 0
        ModemNotReady = 0
    }
    Modem = @{
        Init = 0
        Success = 0
        Failed = 0
        Reboots = 0
        NetworkConnected = 0
        NetworkFailed = 0
    }
    Sensor = @{
        Measurements = 0
        Errors = 0
        BatteryLow = 0
    }
    USB = @{
        Stream = 0
        Commands = 0
        UnknownCommands = 0
    }
    Performance = @{
        Timeouts = 0
        SlowOperations = 0
        MemoryIssues = 0
    }
    Patterns = @()
}

# Patterns de recherche
$errorPatterns = @(
    @{ Pattern = "ERROR|❌|ÉCHEC|FAIL|FATAL|Exception"; Category = "Error" }
    @{ Pattern = "WARN|⚠️|Warning|ATTENTION"; Category = "Warning" }
    @{ Pattern = "Timeout|TIMEOUT"; Category = "Timeout" }
    @{ Pattern = "Commande inconnue"; Category = "UnknownCommand" }
    @{ Pattern = "Database error|SQLSTATE|PDO"; Category = "DatabaseError" }
    @{ Pattern = "Memory|RAM|heap|stack"; Category = "MemoryIssue" }
    @{ Pattern = "GPS.*désactivé|GPS.*non.*prêt"; Category = "GPSDisabled" }
    @{ Pattern = "GPS.*activé|GPS.*activé.*succès"; Category = "GPSEnabled" }
    @{ Pattern = "GPS.*fix|Position.*obtenue|Coordonnées"; Category = "GPSFixSuccess" }
    @{ Pattern = "GPS.*échec|GPS.*non.*disponible|Pas de fix"; Category = "GPSFixFailed" }
    @{ Pattern = "GPS.*timeout|GPS.*Timeout"; Category = "GPSTimeout" }
    @{ Pattern = "MODEM.*démarré|MODEM.*prêt|modemReady"; Category = "ModemReady" }
    @{ Pattern = "MODEM.*échec|MODEM.*non|SIM.*non"; Category = "ModemFailed" }
    @{ Pattern = "Réseau.*connecté|Network.*connected"; Category = "NetworkConnected" }
    @{ Pattern = "Réseau.*échec|Network.*failed"; Category = "NetworkFailed" }
    @{ Pattern = "BATTERIE.*FAIBLE|Battery.*low"; Category = "BatteryLow" }
    @{ Pattern = "usb_stream|USB_STREAM"; Category = "USBStream" }
    @{ Pattern = "config.*\{|calibration.*\{" ; Category = "USBCommand" }
)

Write-Host "📊 Analyse en cours..." -ForegroundColor Yellow

# Analyser chaque ligne
foreach ($line in $lines) {
    foreach ($pattern in $errorPatterns) {
        if ($line -match $pattern.Pattern) {
            $stats.Patterns += @{
                Line = $line
                Category = $pattern.Category
                Timestamp = if ($line -match '(\d{2}:\d{2}:\d{2})') { $matches[1] } else { "N/A" }
            }
            
            # Mettre à jour les statistiques
            switch ($pattern.Category) {
                "Error" { $stats.Errors++ }
                "Warning" { $stats.Warnings++ }
                "Timeout" { $stats.Performance.Timeouts++ }
                "UnknownCommand" { $stats.USB.UnknownCommands++ }
                "GPSEnabled" { $stats.GPS.Enabled++ }
                "GPSDisabled" { $stats.GPS.Disabled++ }
                "GPSFixSuccess" { $stats.GPS.FixSuccess++ }
                "GPSFixFailed" { $stats.GPS.FixFailed++ }
                "GPSTimeout" { $stats.GPS.Timeouts++ }
                "ModemReady" { $stats.Modem.Success++ }
                "ModemFailed" { $stats.Modem.Failed++ }
                "NetworkConnected" { $stats.Modem.NetworkConnected++ }
                "NetworkFailed" { $stats.Modem.NetworkFailed++ }
                "BatteryLow" { $stats.Sensor.BatteryLow++ }
                "USBStream" { $stats.USB.Stream++ }
                "USBCommand" { $stats.USB.Commands++ }
            }
            break
        }
    }
    
    # Détecter les mesures
    if ($line -match "flow_lpm|battery_percent|Mesure|measurement") {
        $stats.Sensor.Measurements++
    }
    
    # Détecter les problèmes GPS spécifiques
    if ($line -match "Modem non.*prêt.*GPS") {
        $stats.GPS.ModemNotReady++
    }
}

# Afficher les résultats
Write-Host ""
Write-Host "📈 RÉSULTATS DE L'ANALYSE" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "📝 Statistiques générales:" -ForegroundColor White
Write-Host "   Lignes totales: $($stats.TotalLines)" -ForegroundColor Gray
Write-Host "   ❌ Erreurs: $($stats.Errors)" -ForegroundColor $(if ($stats.Errors -gt 0) { "Red" } else { "Green" })
Write-Host "   ⚠️  Avertissements: $($stats.Warnings)" -ForegroundColor $(if ($stats.Warnings -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

# Analyse GPS
Write-Host "📡 GPS:" -ForegroundColor Cyan
Write-Host "   Activations: $($stats.GPS.Enabled)" -ForegroundColor Gray
Write-Host "   Désactivations: $($stats.GPS.Disabled)" -ForegroundColor Gray
Write-Host "   Fix réussis: $($stats.GPS.FixSuccess)" -ForegroundColor $(if ($stats.GPS.FixSuccess -gt 0) { "Green" } else { "Red" })
Write-Host "   Fix échoués: $($stats.GPS.FixFailed)" -ForegroundColor $(if ($stats.GPS.FixFailed -gt 0) { "Yellow" } else { "Gray" })
Write-Host "   Timeouts: $($stats.GPS.Timeouts)" -ForegroundColor $(if ($stats.GPS.Timeouts -gt 0) { "Yellow" } else { "Gray" })
Write-Host "   Modem non prêt: $($stats.GPS.ModemNotReady)" -ForegroundColor $(if ($stats.GPS.ModemNotReady -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

# Analyse Modem
Write-Host "📱 Modem:" -ForegroundColor Cyan
Write-Host "   Démarrés avec succès: $($stats.Modem.Success)" -ForegroundColor $(if ($stats.Modem.Success -gt 0) { "Green" } else { "Red" })
Write-Host "   Échecs: $($stats.Modem.Failed)" -ForegroundColor $(if ($stats.Modem.Failed -gt 0) { "Red" } else { "Gray" })
Write-Host "   Réseau connecté: $($stats.Modem.NetworkConnected)" -ForegroundColor $(if ($stats.Modem.NetworkConnected -gt 0) { "Green" } else { "Yellow" })
Write-Host "   Réseau échec: $($stats.Modem.NetworkFailed)" -ForegroundColor $(if ($stats.Modem.NetworkFailed -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

# Analyse Capteur
Write-Host "💧 Capteur:" -ForegroundColor Cyan
Write-Host "   Mesures: $($stats.Sensor.Measurements)" -ForegroundColor Gray
Write-Host "   Batterie faible: $($stats.Sensor.BatteryLow)" -ForegroundColor $(if ($stats.Sensor.BatteryLow -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

# Analyse USB
Write-Host "🔌 USB:" -ForegroundColor Cyan
Write-Host "   Streams: $($stats.USB.Stream)" -ForegroundColor Gray
Write-Host "   Commandes: $($stats.USB.Commands)" -ForegroundColor Gray
Write-Host "   Commandes inconnues: $($stats.USB.UnknownCommands)" -ForegroundColor $(if ($stats.USB.UnknownCommands -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

# Analyse Performance
Write-Host "⚡ Performance:" -ForegroundColor Cyan
Write-Host "   Timeouts: $($stats.Performance.Timeouts)" -ForegroundColor $(if ($stats.Performance.Timeouts -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""

# Problèmes identifiés
Write-Host "🔍 PROBLÈMES IDENTIFIÉS" -ForegroundColor Yellow
Write-Host "=" * 60 -ForegroundColor Yellow
Write-Host ""

$issues = @()

if ($stats.Errors -gt 0) {
    $issues += "❌ $($stats.Errors) erreur(s) détectée(s)"
}

if ($stats.GPS.FixFailed -gt $stats.GPS.FixSuccess) {
    $issues += "📡 GPS: Plus d'échecs que de succès ($($stats.GPS.FixFailed) échecs vs $($stats.GPS.FixSuccess) succès)"
}

if ($stats.GPS.ModemNotReady -gt 0) {
    $issues += "📡 GPS: Modem non prêt ($($stats.GPS.ModemNotReady) fois) - Le GPS nécessite le modem"
}

if ($stats.GPS.Timeouts -gt 10) {
    $issues += "📡 GPS: Trop de timeouts ($($stats.GPS.Timeouts)) - Le timeout est peut-être trop court"
}

if ($stats.Modem.Failed -gt 0) {
    $issues += "📱 Modem: Échecs de démarrage ($($stats.Modem.Failed))"
}

if ($stats.USB.UnknownCommands -gt 0) {
    $issues += "🔌 USB: Commandes inconnues ($($stats.USB.UnknownCommands)) - Vérifier le parsing des commandes"
}

if ($stats.Performance.Timeouts -gt 20) {
    $issues += "⚡ Performance: Beaucoup de timeouts ($($stats.Performance.Timeouts)) - Optimisations nécessaires"
}

if ($stats.Sensor.BatteryLow -gt 0) {
    $issues += "🔋 Batterie: Alertes batterie faible ($($stats.Sensor.BatteryLow))"
}

if ($issues.Count -eq 0) {
    Write-Host "✅ Aucun problème majeur détecté !" -ForegroundColor Green
} else {
    foreach ($issue in $issues) {
        Write-Host "   $issue" -ForegroundColor Yellow
    }
}

Write-Host ""

# Suggestions d'optimisation
if ($SuggestOptimizations) {
    Write-Host "💡 SUGGESTIONS D'OPTIMISATION" -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host ""
    
    $optimizations = @()
    
    if ($stats.GPS.Timeouts -gt 10) {
        $optimizations += @{
            Category = "GPS"
            Issue = "Timeouts GPS fréquents"
            Suggestion = "Augmenter le timeout GPS de 500ms à 2000ms pour le mode Fast, et de 3s à 10s pour le mode standard"
            File = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
            Line = "~2400 (getDeviceLocationFast)"
        }
    }
    
    if ($stats.GPS.ModemNotReady -gt 0) {
        $optimizations += @{
            Category = "GPS"
            Issue = "GPS demandé mais modem non prêt"
            Suggestion = "Démarrer le modem automatiquement en mode USB si GPS activé, ou afficher un message plus clair"
            File = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
            Line = "~378 (loop mode USB)"
        }
    }
    
    if ($stats.USB.UnknownCommands -gt 0) {
        $optimizations += @{
            Category = "USB"
            Issue = "Commandes inconnues reçues"
            Suggestion = "Améliorer le filtrage des lignes JSON dans handleSerialCommand() - déjà corrigé ?"
            File = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
            Line = "~880 (handleSerialCommand)"
        }
    }
    
    if ($stats.Performance.Timeouts -gt 20) {
        $optimizations += @{
            Category = "Performance"
            Issue = "Timeouts fréquents"
            Suggestion = "Réduire la fréquence des opérations bloquantes ou utiliser des timeouts adaptatifs"
            File = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
            Line = "Multiple"
        }
    }
    
    if ($stats.Modem.Failed -gt 0) {
        $optimizations += @{
            Category = "Modem"
            Issue = "Échecs de démarrage modem"
            Suggestion = "Améliorer la gestion des erreurs et les retry avec backoff exponentiel"
            File = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
            Line = "~602 (startModem)"
        }
    }
    
    foreach ($opt in $optimizations) {
        Write-Host "📌 $($opt.Category): $($opt.Issue)" -ForegroundColor White
        Write-Host "   💡 $($opt.Suggestion)" -ForegroundColor Gray
        Write-Host "   📁 $($opt.File):$($opt.Line)" -ForegroundColor DarkGray
        Write-Host ""
    }
}

# Afficher les détails si demandé
if ($Detailed) {
    Write-Host ""
    Write-Host "📋 DÉTAILS (10 premières occurrences)" -ForegroundColor Cyan
    Write-Host "=" * 60 -ForegroundColor Cyan
    Write-Host ""
    
    $categories = $stats.Patterns | Group-Object -Property Category | Sort-Object Count -Descending
    
    foreach ($cat in $categories) {
        Write-Host "$($cat.Name) ($($cat.Count) occurrences):" -ForegroundColor White
        $cat.Group | Select-Object -First 10 | ForEach-Object {
            $linePreview = $_.Line.Substring(0, [Math]::Min(80, $_.Line.Length))
            Write-Host "   [$($_.Timestamp)] $linePreview..." -ForegroundColor Gray
        }
        Write-Host ""
    }
}

Write-Host "✅ Analyse terminée" -ForegroundColor Green

