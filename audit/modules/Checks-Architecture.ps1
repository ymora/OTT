# ===============================================================================
# VÉRIFICATION : ARCHITECTURE ET STATISTIQUES
# ===============================================================================

function Invoke-Check-Architecture {
    param(
        [Parameter(Mandatory=$true)]
        [array]$Files,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Config,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$Results
    )
    
    Write-Section "[1/13] Architecture et Statistiques Code"
    
    try {
        Write-Info "Comptage des fichiers..."
        
        $jsFiles = $Files | Where-Object { $_.Extension -match "\.jsx?$" }
        $phpFiles = $Files | Where-Object { $_.Extension -eq ".php" }
        $sqlFiles = Get-ChildItem -Recurse -File -Include *.sql -ErrorAction SilentlyContinue | Where-Object {
            $_.FullName -notmatch 'node_modules|vendor'
        }
        $mdFilesRoot = Get-ChildItem -File -Filter *.md -ErrorAction SilentlyContinue
        
        # Détecter structure spécifique au projet
        $components = @()
        $hooks = @()
        $pages = @()
        $scripts = @()
        
        if (Test-Path "components") {
            $components = Get-ChildItem -Path components -Recurse -File -Include *.js -ErrorAction SilentlyContinue
        }
        if (Test-Path "hooks") {
            $hooks = Get-ChildItem -Path hooks -File -Include *.js -Exclude index.js -ErrorAction SilentlyContinue
        }
        if (Test-Path "app") {
            $pages = Get-ChildItem -Path app -Recurse -File -Include page.js -ErrorAction SilentlyContinue
        } elseif (Test-Path "pages") {
            $pages = Get-ChildItem -Path pages -Recurse -File -Include *.js,*.jsx -ErrorAction SilentlyContinue
        }
        if (Test-Path "scripts") {
            $scripts = Get-ChildItem -Path scripts -Recurse -File -Include *.ps1,*.sh,*.js -ErrorAction SilentlyContinue
        }
        
        # Compter lignes
        $jsLines = 0
        foreach ($file in $jsFiles) {
            try { $jsLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
        }
        
        $phpLines = 0
        foreach ($file in $phpFiles) {
            try { $phpLines += (Get-Content $file.FullName -ErrorAction SilentlyContinue | Measure-Object -Line).Lines } catch {}
        }
        
        $stats = @{
            JS = $jsFiles.Count
            JSLines = $jsLines
            PHP = $phpFiles.Count
            PHPLines = $phpLines
            SQL = $sqlFiles.Count
            MD = $mdFilesRoot.Count
            Components = $components.Count
            Hooks = $hooks.Count
            Pages = $pages.Count
            Scripts = $scripts.Count
        }
        
        Write-Host "  JavaScript/React : $($stats.JS) fichiers ($($stats.JSLines) lignes)" -ForegroundColor White
        if ($stats.PHP -gt 0) {
            Write-Host "  PHP              : $($stats.PHP) fichiers ($($stats.PHPLines) lignes)" -ForegroundColor White
        }
        if ($stats.SQL -gt 0) {
            Write-Host "  SQL              : $($stats.SQL) fichiers" -ForegroundColor White
        }
        Write-Host "  Markdown root    : $($stats.MD) fichiers" -ForegroundColor $(if($stats.MD -gt 10){"Red"}elseif($stats.MD -gt 5){"Yellow"}else{"Green"})
        if ($stats.Components -gt 0) {
            Write-Host "  Composants       : $($stats.Components)" -ForegroundColor White
        }
        if ($stats.Hooks -gt 0) {
            Write-Host "  Hooks            : $($stats.Hooks)" -ForegroundColor White
        }
        if ($stats.Pages -gt 0) {
            Write-Host "  Pages            : $($stats.Pages)" -ForegroundColor White
        }
        if ($stats.Scripts -gt 0) {
            Write-Host "  Scripts          : $($stats.Scripts)" -ForegroundColor White
        }
        
        $Results.Stats = $stats
        $Results.Scores["Architecture"] = 10
        
        if ($stats.MD -gt 10) {
            Write-Warn "Trop de fichiers MD a la racine ($($stats.MD)) - Recommande <= 5"
            $Results.Issues += @{
                Type = "architecture"
                Severity = "medium"
                Description = "Documentation: $($stats.MD) fichiers MD a la racine (recommandé <= 5)"
                File = "."
                Line = 0
            }
            $Results.Scores["Architecture"] = 8
        } elseif ($stats.MD -gt 5) {
            Write-Warn "Fichiers MD a rationaliser ($($stats.MD))"
            $Results.Scores["Architecture"] = 9
        }
        
        Write-OK "Architecture analysée"
    } catch {
        Write-Err "Erreur analyse architecture: $($_.Exception.Message)"
        $Results.Scores["Architecture"] = 5
    }
}

