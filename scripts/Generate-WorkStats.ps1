# ===============================================================================
# STATISTIQUES DE TRAVAIL MULTI-SOURCES
# ===============================================================================
# Combine : Git commits + Sessions Windsurf/Cursor + WakaTime (optionnel)
# Usage: .\Generate-WorkStats.ps1 [-Days 30] [-User "ymora"]
# ===============================================================================

param(
    [int]$Days = 90,
    [string]$User = "",
    [string]$OutputPath = "public/SUIVI_TRAVAIL_COMPLET.md"
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== STATISTIQUES DE TRAVAIL MULTI-SOURCES ===" -ForegroundColor Cyan
Write-Host ""

# ============================================
# 1. DONNEES GIT
# ============================================
Write-Host "[1/3] Analyse Git..." -ForegroundColor Yellow

Push-Location $ProjectRoot
$sinceDate = (Get-Date).AddDays(-$Days).ToString("yyyy-MM-dd")
$gitData = @{}

try {
    $commits = & git log --all --since="$sinceDate" --format="%H|%an|%ae|%ci|%s" 2>$null
    
    foreach ($line in $commits) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split '\|', 5
        if ($parts.Count -lt 5) { continue }
        
        $author = $parts[1].Trim()
        $dateStr = $parts[3].Substring(0, 10)
        
        if (-not $gitData.ContainsKey($author)) {
            $gitData[$author] = @{
                Commits = 0
                Days = @{}
                FirstSeen = $dateStr
                LastSeen = $dateStr
            }
        }
        
        $gitData[$author].Commits++
        if (-not $gitData[$author].Days.ContainsKey($dateStr)) { $gitData[$author].Days[$dateStr] = 0 }
        $gitData[$author].Days[$dateStr]++
        if ($dateStr -gt $gitData[$author].LastSeen) { $gitData[$author].LastSeen = $dateStr }
        if ($dateStr -lt $gitData[$author].FirstSeen) { $gitData[$author].FirstSeen = $dateStr }
    }
    
    Write-Host "   Git: $($gitData.Keys.Count) contributeurs trouves" -ForegroundColor Green
} catch {
    Write-Host "   Git: Erreur - $($_.Exception.Message)" -ForegroundColor Red
}
Pop-Location

# ============================================
# 2. SESSIONS WINDSURF
# ============================================
Write-Host "[2/3] Analyse Sessions Windsurf..." -ForegroundColor Yellow

$windsurfData = @{
    TotalSessions = 0
    SessionsByDate = @{}
    Users = @{}
}

$windsurfLogsPath = "$env:APPDATA\Windsurf\logs"
if (Test-Path $windsurfLogsPath) {
    $sessions = Get-ChildItem -Path $windsurfLogsPath -Directory -ErrorAction SilentlyContinue
    
    foreach ($session in $sessions) {
        # Format: 20260106T204553
        if ($session.Name -match '^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$') {
            $year = $matches[1]
            $month = $matches[2]
            $day = $matches[3]
            $hour = $matches[4]
            $dateStr = "$year-$month-$day"
            
            $sessionDate = [DateTime]::ParseExact($dateStr, "yyyy-MM-dd", $null)
            $cutoffDate = (Get-Date).AddDays(-$Days)
            
            if ($sessionDate -ge $cutoffDate) {
                $windsurfData.TotalSessions++
                
                if (-not $windsurfData.SessionsByDate.ContainsKey($dateStr)) {
                    $windsurfData.SessionsByDate[$dateStr] = @{
                        Count = 0
                        Hours = @()
                    }
                }
                $windsurfData.SessionsByDate[$dateStr].Count++
                $windsurfData.SessionsByDate[$dateStr].Hours += $hour
            }
        }
    }
    
    Write-Host "   Windsurf: $($windsurfData.TotalSessions) sessions trouvees" -ForegroundColor Green
} else {
    Write-Host "   Windsurf: Logs non trouves (normal si pas installe)" -ForegroundColor Gray
}

# Chercher aussi Cursor
$cursorLogsPath = "$env:APPDATA\Cursor\logs"
$cursorSessions = 0
if (Test-Path $cursorLogsPath) {
    $cursorDirs = Get-ChildItem -Path $cursorLogsPath -Directory -ErrorAction SilentlyContinue
    foreach ($dir in $cursorDirs) {
        if ($dir.Name -match '^\d{8}T\d{6}$') {
            $cursorSessions++
        }
    }
    if ($cursorSessions -gt 0) {
        Write-Host "   Cursor: $cursorSessions sessions trouvees" -ForegroundColor Green
    }
}

# ============================================
# 3. WAKATIME (si disponible)
# ============================================
Write-Host "[3/3] Verification WakaTime..." -ForegroundColor Yellow

$wakatimeData = $null
$wakatimeCfg = "$env:USERPROFILE\.wakatime.cfg"
if (Test-Path $wakatimeCfg) {
    Write-Host "   WakaTime: Configure (donnees sur wakatime.com)" -ForegroundColor Green
    $wakatimeData = @{ Configured = $true }
} else {
    Write-Host "   WakaTime: Non installe (recommande pour tracking precis)" -ForegroundColor Gray
}

# ============================================
# 4. GENERER LE RAPPORT
# ============================================
Write-Host ""
Write-Host "Generation du rapport..." -ForegroundColor Cyan

$sep = [char]124
$lines = @()
$lines += "# Suivi de Travail Complet - Projet OTT"
$lines += "## Rapport Multi-Sources (Git + IDE Sessions)"
$lines += ""
$lines += "**Date de generation** : $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
$lines += "**Periode analysee** : $Days derniers jours"
$lines += ""
$lines += "---"
$lines += ""

# Resume par contributeur Git
$lines += "## Contributeurs (Git)"
$lines += ""
$lines += "${sep} Contributeur ${sep} Commits ${sep} Jours actifs ${sep} Heures estimees ${sep} Periode ${sep}"
$lines += "${sep}--------------|---------|-------------|-----------------|---------|"

$totalCommits = 0
foreach ($author in $gitData.Keys | Sort-Object { $gitData[$_].Commits } -Descending) {
    $data = $gitData[$author]
    $totalCommits += $data.Commits
    $daysActive = $data.Days.Keys.Count
    $hours = [Math]::Round($data.Commits * 0.5, 1)
    $lines += "${sep} **$author** ${sep} $($data.Commits) ${sep} $daysActive ${sep} ~${hours}h ${sep} $($data.FirstSeen) - $($data.LastSeen) ${sep}"
}
$lines += ""

# Sessions IDE
$lines += "---"
$lines += ""
$lines += "## Sessions IDE (Windsurf/Cursor)"
$lines += ""
$lines += "**Total sessions Windsurf** : $($windsurfData.TotalSessions)"
if ($cursorSessions -gt 0) {
    $lines += "**Total sessions Cursor** : $cursorSessions"
}
$lines += ""

if ($windsurfData.SessionsByDate.Keys.Count -gt 0) {
    $lines += "${sep} Date ${sep} Sessions ${sep} Heures de travail ${sep}"
    $lines += "${sep}------|----------|------------------|"
    
    foreach ($date in $windsurfData.SessionsByDate.Keys | Sort-Object -Descending | Select-Object -First 30) {
        $dayData = $windsurfData.SessionsByDate[$date]
        $hoursRange = if ($dayData.Hours.Count -gt 0) {
            $sorted = $dayData.Hours | Sort-Object
            "$($sorted[0])h - $($sorted[-1])h"
        } else { "-" }
        $lines += "${sep} $date ${sep} $($dayData.Count) ${sep} $hoursRange ${sep}"
    }
}
$lines += ""

# Croisement Git + IDE
$lines += "---"
$lines += ""
$lines += "## Analyse Croisee (Git + Sessions IDE)"
$lines += ""

$allDates = @{}
foreach ($author in $gitData.Keys) {
    foreach ($date in $gitData[$author].Days.Keys) {
        if (-not $allDates.ContainsKey($date)) {
            $allDates[$date] = @{ GitCommits = 0; IDESessions = 0; Authors = @() }
        }
        $allDates[$date].GitCommits += $gitData[$author].Days[$date]
        if ($allDates[$date].Authors -notcontains $author) {
            $allDates[$date].Authors += $author
        }
    }
}
foreach ($date in $windsurfData.SessionsByDate.Keys) {
    if (-not $allDates.ContainsKey($date)) {
        $allDates[$date] = @{ GitCommits = 0; IDESessions = 0; Authors = @() }
    }
    $allDates[$date].IDESessions = $windsurfData.SessionsByDate[$date].Count
}

$lines += "${sep} Date ${sep} Commits ${sep} Sessions IDE ${sep} Contributeurs ${sep}"
$lines += "${sep}------|---------|--------------|---------------|"

foreach ($date in $allDates.Keys | Sort-Object -Descending | Select-Object -First 30) {
    $d = $allDates[$date]
    $authStr = if ($d.Authors.Count -gt 0) { $d.Authors -join ", " } else { "-" }
    $lines += "${sep} $date ${sep} $($d.GitCommits) ${sep} $($d.IDESessions) ${sep} $authStr ${sep}"
}

$lines += ""
$lines += "---"
$lines += ""

# Recommandations
$lines += "## Sources de Tracking Recommandees"
$lines += ""
$lines += "1. **Git** - Commits (actif)"
$lines += "2. **Sessions IDE** - Windsurf/Cursor (actif)"
if (-not $wakatimeData) {
    $lines += "3. **WakaTime** - Temps reel par fichier (NON INSTALLE)"
    $lines += "   - Installer: Extensions > WakaTime"
    $lines += "   - Gratuit, tracking automatique"
}
$lines += ""
$lines += "---"
$lines += "_Rapport genere par Generate-WorkStats.ps1_"

# Ecrire le fichier
$outputDir = Split-Path $OutputPath -Parent
$fullPath = Join-Path $ProjectRoot $OutputPath
$fullDir = Split-Path $fullPath -Parent

if (-not (Test-Path $fullDir)) {
    New-Item -ItemType Directory -Path $fullDir -Force | Out-Null
}

$lines -join "`n" | Out-File -FilePath $fullPath -Encoding UTF8

Write-Host ""
Write-Host "=== RESUME ===" -ForegroundColor Cyan
Write-Host "   Git: $totalCommits commits, $($gitData.Keys.Count) contributeurs" -ForegroundColor White
Write-Host "   IDE: $($windsurfData.TotalSessions + $cursorSessions) sessions" -ForegroundColor White
Write-Host ""
Write-Host "[OK] Rapport genere: $fullPath" -ForegroundColor Green
