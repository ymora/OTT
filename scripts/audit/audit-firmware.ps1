# Script d'audit du firmware OTT
# Usage: .\scripts\audit-firmware.ps1

param(
    [string]$FirmwarePath = "hardware/firmware/fw_ott_optimized/fw_ott_optimized.ino"
)

Write-Host "`n🔍 AUDIT FIRMWARE OTT" -ForegroundColor Cyan
Write-Host "=====================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $FirmwarePath)) {
    Write-Host "❌ Erreur: Fichier firmware introuvable: $FirmwarePath" -ForegroundColor Red
    exit 1
}

$content = Get-Content $FirmwarePath -Raw
$lines = Get-Content $FirmwarePath

# Fonctions d'affichage
function Write-Section { param([string]$Text) Write-Host "`n=== $Text ===" -ForegroundColor Cyan }
function Write-OK { param([string]$Text) Write-Host "  ✅ $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  ⚠️  $Text" -ForegroundColor Yellow }
function Write-Err { param([string]$Text) Write-Host "  ❌ $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "  ℹ️  $Text" -ForegroundColor Gray }

# 1. Statistiques générales
Write-Section "1. Statistiques Générales"
$lineCount = $lines.Count
Write-Info "Lignes de code: $lineCount"
if ($lineCount -gt 2000) {
    Write-Warn "Firmware très volumineux (>2000 lignes)"
}

# Compter les fonctions
$functions = [regex]::Matches($content, '^(void|bool|String|int|float|uint\d+_t)\s+\w+\s*\([^)]*\)', [System.Text.RegularExpressions.RegexOptions]::Multiline)
Write-Info "Fonctions: $($functions.Count)"
if ($functions.Count -gt 30) {
    Write-Warn "Trop de fonctions (>30)"
}

# Compter les variables statiques
$staticVars = [regex]::Matches($content, 'static\s+\w+', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Info "Variables statiques: $($staticVars.Count)"

# 2. Analyse des fonctions
Write-Section "2. Analyse des Fonctions"
$functionNames = @()
foreach ($match in $functions) {
    $funcName = [regex]::Match($match.Value, '\w+\s*\(', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase).Value -replace '\s*\(', ''
    if ($funcName) {
        $functionNames += $funcName
    }
}

Write-Info "Fonctions principales:"
$functionNames | Select-Object -First 20 | ForEach-Object { Write-Host "    - $_" -ForegroundColor Gray }

# 3. Recherche de code dupliqué
Write-Section "3. Recherche Code Dupliqué"

# Rechercher les patterns de delay() remplacés par des boucles
$delayPatterns = [regex]::Matches($content, 'delay\s*\([^)]+\)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($delayPatterns.Count -gt 0) {
    Write-Warn "$($delayPatterns.Count) appel(s) à delay() trouvé(s) (peut causer des problèmes watchdog)"
}

# Rechercher les patterns de feedWatchdog()
$watchdogPatterns = [regex]::Matches($content, 'feedWatchdog\s*\(\)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Info "$($watchdogPatterns.Count) appel(s) à feedWatchdog()"

# Rechercher les Serial.println/printf
$serialLogs = [regex]::Matches($content, 'Serial\.(println|printf)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Info "$($serialLogs.Count) log(s) Serial (peut être excessif)"

# 4. Analyse de complexité
Write-Section "4. Analyse de Complexité"

# Compter les if/else imbriqués
$ifCount = ([regex]::Matches($content, '\bif\s*\(', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
$elseCount = ([regex]::Matches($content, '\belse\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
Write-Info "Instructions if: $ifCount"
Write-Info "Instructions else: $elseCount"

# Compter les boucles
$whileCount = ([regex]::Matches($content, '\bwhile\s*\(', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
$forCount = ([regex]::Matches($content, '\bfor\s*\(', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)).Count
Write-Info "Boucles while: $whileCount"
Write-Info "Boucles for: $forCount"

# 5. Recherche de code mort
Write-Section "5. Recherche Code Mort"

# Rechercher les TODO/FIXME
$todos = [regex]::Matches($content, '(TODO|FIXME|XXX|HACK)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($todos.Count -gt 0) {
    Write-Warn "$($todos.Count) TODO/FIXME trouvé(s)"
    $todos | Select-Object -First 5 | ForEach-Object {
        $lineNum = ($lines | Select-String -Pattern $_.Value -SimpleMatch | Select-Object -First 1).LineNumber
        Write-Host "    Ligne $lineNum : $($_.Value)" -ForegroundColor Yellow
    }
}

# 6. Analyse des modules
Write-Section "6. Analyse des Modules"

# Module Modem
$modemCode = [regex]::Matches($content, '(startModem|attachNetwork|connectData|waitForSimReady)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Info "Fonctions modem: $($modemCode.Count)"

# Module Sleep
$sleepCode = [regex]::Matches($content, '(goToSleep|wakeupCounter|sendEveryNWakeups)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Info "Fonctions sleep: $($sleepCode.Count)"

# Module Communication
$commCode = [regex]::Matches($content, '(sendMeasurement|fetchCommands|httpPost)', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
Write-Info "Fonctions communication: $($commCode.Count)"

# 7. Problèmes potentiels
Write-Section "7. Problèmes Potentiels"

# Rechercher les variables globales non initialisées
$uninitialized = [regex]::Matches($content, 'static\s+\w+\s+\w+\s*;', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
if ($uninitialized.Count -gt 0) {
    Write-Warn "$($uninitialized.Count) variable(s) statique(s) potentiellement non initialisée(s)"
}

# Rechercher les magic numbers
$magicNumbers = [regex]::Matches($content, '\b\d{4,}\b')
if ($magicNumbers.Count -gt 50) {
    Write-Warn "Beaucoup de nombres magiques trouvés (considérer des constantes)"
}

# 8. Recommandations
Write-Section "8. Recommandations"

if ($lineCount -gt 2000) {
    Write-Warn "Réduire la taille du firmware (objectif: <2000 lignes)"
    Write-Info "  - Supprimer le code mort"
    Write-Info "  - Simplifier les fonctions complexes"
    Write-Info "  - Unifier le code dupliqué"
}

if ($functions.Count -gt 30) {
    Write-Warn "Réduire le nombre de fonctions (objectif: <30)"
    Write-Info "  - Regrouper les fonctions similaires"
    Write-Info "  - Extraire les modules communs"
}

if ($serialLogs.Count -gt 200) {
    Write-Warn "Réduire les logs (objectif: <200)"
    Write-Info "  - Utiliser un système de log avec niveaux"
    Write-Info "  - Désactiver les logs en production"
}

Write-Host "`n✅ Audit terminé" -ForegroundColor Green

